/**
 * MySQL 驱动实现（服务端专用，import 了 mysql2 故不可进客户端 bundle）。
 *
 * 与 PostgreSQL 侧共享 `rdb.ts` 的接口、纯函数与上限策略，差异只落在这几处：
 * schema 层折叠为 database、标识符用反引号、表注释在 `TABLES.TABLE_COMMENT`、
 * 索引在 `information_schema.STATISTICS`、只读事务是 `START TRANSACTION READ ONLY`、
 * 语句超时是 `max_execution_time`（毫秒，且只对 SELECT 生效）。
 */
import mysql from "mysql2/promise";
import type { Pool, PoolConnection, FieldPacket, ResultSetHeader } from "mysql2/promise";
import { withRdb } from "./pool";
import { classifySqlOperation } from "./sql-classify";
import {
  CONNECT_TIMEOUT_MS,
  STATEMENT_TIMEOUT_MS,
  aggregateIndexRows,
  injectLimit,
  parseRdbUri,
  shouldInjectLimit,
  toColumnInfo,
  toTableInfo,
  uniqueColumnLabels,
  zipRows,
  type MetaRow,
  type RdbDriver,
  type RdbExecOptions,
} from "./rdb";
import { parseExtra, type DatastoreConnection } from "./types";
import type { RdbExecResult, RdbTableDetail, RdbTableInfo } from "./types";

/** 每个连接的池大小：排查工具是单人使用，多了只是白占目标库的连接数。 */
const POOL_SIZE = 4;

/** 系统库：目录里列出来只会淹没业务库。 */
const SYSTEM_DATABASES = new Set([
  "information_schema",
  "performance_schema",
  "mysql",
  "sys",
]);

/** 按连接配置建池（不建连——驱动首次查询时懒连接）。 */
function createPool(conn: DatastoreConnection): Pool {
  const { host, port, database } = parseRdbUri(conn);
  const extra = parseExtra(conn.extraJson);

  return mysql.createPool({
    host,
    port,
    ...(database ? { database } : {}),
    user: conn.username || undefined,
    password: conn.password || undefined,
    ...(extra.ssl
      ? { ssl: { rejectUnauthorized: extra.sslRejectUnauthorized !== false } }
      : {}),
    // 多语句在协议层就不成立：分类器的拒绝之外的第二道保障（显式写出以防默认值被改）
    multipleStatements: false,
    // BIGINT 一律以字符串返回：雪花 ID 转 Number 会静默丢精度
    supportBigNumbers: true,
    bigNumberStrings: true,
    // 时间保留库中原始文本：转成 JS Date 再渲染会引入一次时区转换
    dateStrings: true,
    connectTimeout: CONNECT_TIMEOUT_MS,
    connectionLimit: POOL_SIZE,
    waitForConnections: true,
  });
}

/** 取池并执行；池失效时由 withRdb 剔除重建重试一次。 */
function run<T>(conn: DatastoreConnection, fn: (pool: Pool) => Promise<T>): Promise<T> {
  return withRdb(conn, () => createPool(conn), fn);
}

/** 查元数据：一律参数化，库名表名不拼进 SQL。 */
async function queryMeta(
  conn: DatastoreConnection,
  sql: string,
  params: unknown[]
): Promise<MetaRow[]> {
  return run(conn, async (pool) => {
    const [rows] = await pool.query(sql, params);
    return rows as MetaRow[];
  });
}

/* ─── 目录 ────────────────────────────────────────────────── */

async function ping(conn: DatastoreConnection): Promise<{ version: string }> {
  const rows = await queryMeta(conn, "SELECT VERSION() AS version", []);
  return { version: String(rows[0]?.version ?? "未知") };
}

async function listDatabases(conn: DatastoreConnection): Promise<string[]> {
  const rows = await queryMeta(
    conn,
    "SELECT SCHEMA_NAME AS name FROM information_schema.SCHEMATA ORDER BY SCHEMA_NAME",
    []
  );
  return rows
    .map((r) => String(r.name ?? ""))
    .filter((name) => name && !SYSTEM_DATABASES.has(name.toLowerCase()));
}

/** MySQL 的 schema 与 database 是同一层，此处折叠为与库同名的单元素。 */
async function listSchemas(_conn: DatastoreConnection, database: string): Promise<string[]> {
  return [database];
}

async function listTables(
  conn: DatastoreConnection,
  _database: string,
  schema: string
): Promise<RdbTableInfo[]> {
  const rows = await queryMeta(
    conn,
    `SELECT TABLE_NAME, TABLE_TYPE, TABLE_ROWS, TABLE_COMMENT
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME`,
    [schema]
  );
  return rows.map((r) => toTableInfo(r));
}

async function describeTable(
  conn: DatastoreConnection,
  _database: string,
  schema: string,
  table: string
): Promise<RdbTableDetail> {
  const [columnRows, indexRows] = await Promise.all([
    queryMeta(
      conn,
      // COLUMN_TYPE 比 DATA_TYPE 多带长度与精度（varchar(64) 而非 varchar），排查时更有用
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT,
              COLUMN_KEY = 'PRI' AS is_primary, COLUMN_COMMENT
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION`,
      [schema, table]
    ),
    queryMeta(
      conn,
      `SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX, NON_UNIQUE = 0 AS is_unique
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
      [schema, table]
    ),
  ]);

  return {
    columns: columnRows.map(toColumnInfo),
    indexes: aggregateIndexRows(indexRows),
  };
}

/* ─── 执行 ────────────────────────────────────────────────── */

/**
 * 执行一条 SQL。
 *
 * 只读连接下用数据库自身的只读事务兜底：词法分类不完备（design.md 决策二），
 * 让真正执行语句的那一方来判断「这条是不是写」才是完备的判定。以 ROLLBACK 收尾
 * 而非 COMMIT——只读事务里本就没有需要提交的东西。
 *
 * 事务与会话超时必须落在同一条物理连接上，故这里取独立连接而不走池的快捷查询。
 */
async function execute(
  conn: DatastoreConnection,
  sql: string,
  opts: RdbExecOptions
): Promise<RdbExecResult> {
  const cls = classifySqlOperation(sql);
  const executedSql = shouldInjectLimit(sql, cls) ? injectLimit(sql, opts.rowLimit) : sql;

  return run(conn, async (pool) => {
    const connection = await pool.getConnection();
    const start = Date.now();
    try {
      await applyStatementTimeout(connection);
      if (opts.readonly) await connection.query("START TRANSACTION READ ONLY");
      try {
        const result = await runOne(connection, executedSql, opts.hardLimit);
        return { ...result, tookMs: Date.now() - start, executedSql };
      } finally {
        // 只读事务无论成败都回滚：不产生任何提交
        if (opts.readonly) {
          await connection.query("ROLLBACK").catch(() => {
            /* 连接已断时回滚必然失败，忽略 */
          });
        }
      }
    } finally {
      connection.release();
    }
  });
}

/**
 * 语句超时。
 * `max_execution_time` 在 MySQL 5.7.8+ 可用且只对 SELECT 生效；MariaDB 与更早版本
 * 不认这个变量。设不上不算错误——驱动侧的连接超时仍在，故失败即跳过。
 */
async function applyStatementTimeout(connection: PoolConnection): Promise<void> {
  await connection
    .query(`SET SESSION max_execution_time = ${STATEMENT_TIMEOUT_MS}`)
    .catch(() => {
      /* 老版本 / MariaDB 不支持，忽略 */
    });
}

/** 单条语句的执行与结果整形。 */
async function runOne(
  connection: PoolConnection,
  sql: string,
  hardLimit: number
): Promise<Omit<RdbExecResult, "tookMs" | "executedSql">> {
  // rowsAsArray：列名从 field 元数据取，重名列不会互相覆盖（见 uniqueColumnLabels）
  const [result, fields] = (await connection.query({ sql, rowsAsArray: true })) as [
    unknown,
    FieldPacket[] | undefined,
  ];

  if (!Array.isArray(result)) {
    const header = result as ResultSetHeader;
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      affectedRows: header.affectedRows ?? 0,
      truncated: false,
    };
  }

  const labels = uniqueColumnLabels((fields ?? []).map((f) => f.name));
  const raw = result as unknown[][];
  const truncated = raw.length > hardLimit;
  const rows = zipRows(labels, truncated ? raw.slice(0, hardLimit) : raw);

  return { columns: labels, rows, rowCount: rows.length, truncated };
}

/* ─── 错误归一化 ──────────────────────────────────────────── */

/** MySQL 的原始异常翻译为可读原因；无法归类时原样透出。 */
export function describeMysqlError(err: unknown): string {
  const e = err as { code?: string; message?: string };
  const raw = e?.message ?? String(err);
  const code = e?.code ?? "";

  if (code === "ER_ACCESS_DENIED_ERROR" || /Access denied/i.test(raw)) {
    return `认证失败：用户名或密码不正确（${raw}）`;
  }
  if (code === "ER_BAD_DB_ERROR" || /Unknown database/i.test(raw)) {
    return `库不存在：${raw}`;
  }
  if (code === "ER_DBACCESS_DENIED_ERROR") {
    return `权限不足：当前账号无权访问该库（${raw}）`;
  }
  if (/READ ONLY transaction/i.test(raw)) {
    return `该连接为只读模式，数据库拒绝了这条写语句（${raw}）`;
  }
  if (
    code === "ER_QUERY_TIMEOUT" ||
    /maximum statement execution time exceeded|query execution was interrupted/i.test(raw)
  ) {
    return `语句执行超时（上限 ${STATEMENT_TIMEOUT_MS}ms），已中止：这不是语法错误，请缩小查询范围或加索引`;
  }
  if (code === "ETIMEDOUT" || /timeout/i.test(raw)) {
    return `连接超时：${raw}`;
  }
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EHOSTUNREACH") {
    return `地址不可达：${raw}`;
  }
  return raw || "执行失败";
}

export const mysqlDriver: RdbDriver = {
  ping,
  listDatabases,
  listSchemas,
  listTables,
  describeTable,
  execute,
};

/** 连接测试专用：临时建池、用完即弃，不污染连接池。 */
export async function pingMysqlOnce(conn: DatastoreConnection): Promise<string> {
  const pool = createPool(conn);
  try {
    const [rows] = await pool.query("SELECT VERSION() AS version");
    return String((rows as MetaRow[])[0]?.version ?? "未知");
  } finally {
    await pool.end().catch(() => {
      /* 忽略断连异常 */
    });
  }
}
