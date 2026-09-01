/**
 * PostgreSQL 驱动实现（服务端专用，import 了 pg 故不可进客户端 bundle）。
 *
 * 与 MySQL 侧共享 `rdb.ts` 的接口、纯函数与上限策略，差异落在这几处：
 * 完整的 schema 层级、标识符用双引号、注释走 `obj_description` / `col_description`、
 * 行数估算走 `pg_class.reltuples`、索引走 `pg_index`、只读事务是 `BEGIN READ ONLY`、
 * 语句超时是连接级的 `statement_timeout`。
 *
 * 元数据一律查 `pg_catalog` 而非 `information_schema`：后者是 SQL 标准视图，
 * 拿不到注释、行数估算与表达式索引，而这三样在排查里都用得上。
 */
import pg from "pg";
import type { Pool, PoolClient, QueryResult } from "pg";
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

/** 每个连接的池大小：与 MySQL 侧同值，排查工具是单人使用。 */
const POOL_SIZE = 4;

/**
 * 需要保留数据库原始文本的类型 OID。
 *
 * 默认解析器会把这些转成 JS `Date`，渲染时再做一次时区转换——用户看到的时间
 * 和库里存的对不上，这是排查时最容易被带偏的地方。int8 / numeric 由 pg 默认
 * 就以字符串返回，无需覆写。
 */
const RAW_TEXT_OIDS = new Set([
  1082, // date
  1083, // time
  1114, // timestamp
  1184, // timestamptz
  1266, // timetz
]);

/** 逐池覆写类型解析（不用 pg.types.setTypeParser：那是全局副作用）。 */
const rawTextTypes = {
  getTypeParser(oid: number, format?: unknown) {
    if (RAW_TEXT_OIDS.has(oid)) return (value: string) => value;
    return (pg.types.getTypeParser as (o: number, f?: unknown) => unknown)(oid, format);
  },
};

/** 系统 schema：目录里列出来只会淹没业务 schema。 */
const SYSTEM_SCHEMA_FILTER = `nspname NOT IN ('pg_catalog', 'information_schema')
      AND nspname NOT LIKE 'pg_toast%' AND nspname NOT LIKE 'pg_temp%'`;

/** 按连接配置建池（不建连——驱动首次查询时懒连接）。 */
function createPool(conn: DatastoreConnection): Pool {
  const { host, port, database } = parseRdbUri(conn);
  const extra = parseExtra(conn.extraJson);

  return new pg.Pool({
    host,
    port,
    ...(database ? { database } : {}),
    user: conn.username || undefined,
    password: conn.password || undefined,
    ssl: extra.ssl ? { rejectUnauthorized: extra.sslRejectUnauthorized !== false } : false,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    // 连接级语句超时：一条全表扫描不该把请求挂到天荒地老
    statement_timeout: STATEMENT_TIMEOUT_MS,
    max: POOL_SIZE,
    types: rawTextTypes as never,
  });
}

function run<T>(conn: DatastoreConnection, fn: (pool: Pool) => Promise<T>): Promise<T> {
  return withRdb(conn, () => createPool(conn), fn);
}

/** 查元数据：一律参数化，schema 名表名不拼进 SQL。 */
async function queryMeta(
  conn: DatastoreConnection,
  sql: string,
  params: unknown[]
): Promise<MetaRow[]> {
  return run(conn, async (pool) => {
    const result: QueryResult = await pool.query(sql, params);
    return result.rows as MetaRow[];
  });
}

/* ─── 目录 ────────────────────────────────────────────────── */

async function ping(conn: DatastoreConnection): Promise<{ version: string }> {
  const rows = await queryMeta(conn, "SELECT version() AS version", []);
  return { version: String(rows[0]?.version ?? "未知") };
}

/**
 * PG 的连接绑定单个 database，无法跨库查询，故只返回连接串里的那一个库。
 * 这不是实现偷懒而是 PG 的连接模型使然——UI 上明示「切库需另建连接」，
 * 不提供一个点了也没用的切库下拉框。
 */
async function listDatabases(conn: DatastoreConnection): Promise<string[]> {
  const rows = await queryMeta(conn, "SELECT current_database() AS name", []);
  return [String(rows[0]?.name ?? "")].filter(Boolean);
}

async function listSchemas(conn: DatastoreConnection, _database: string): Promise<string[]> {
  const rows = await queryMeta(
    conn,
    `SELECT nspname AS name FROM pg_namespace WHERE ${SYSTEM_SCHEMA_FILTER} ORDER BY nspname`,
    []
  );
  return rows.map((r) => String(r.name ?? "")).filter(Boolean);
}

async function listTables(
  conn: DatastoreConnection,
  _database: string,
  schema: string
): Promise<RdbTableInfo[]> {
  const rows = await queryMeta(
    conn,
    // reltuples 在从未 ANALYZE 过时为 -1（PG 14+），归一为 NULL 以区分「零行」与「未知」
    `SELECT c.relname AS table_name,
            CASE WHEN c.relkind IN ('v', 'm') THEN 'VIEW' ELSE 'BASE TABLE' END AS table_type,
            CASE WHEN c.reltuples < 0 THEN NULL ELSE c.reltuples::bigint END AS row_count,
            COALESCE(obj_description(c.oid), '') AS table_comment
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      ORDER BY c.relname`,
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
      // format_type 带上长度与精度（varchar(64) 而非 varchar），排查时更有用
      `SELECT a.attname AS column_name,
              format_type(a.atttypid, a.atttypmod) AS data_type,
              CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS is_nullable,
              pg_get_expr(ad.adbin, ad.adrelid) AS column_default,
              EXISTS (
                SELECT 1 FROM pg_index i
                 WHERE i.indrelid = a.attrelid AND i.indisprimary
                   AND a.attnum = ANY (i.indkey)
              ) AS is_primary,
              COALESCE(col_description(a.attrelid, a.attnum), '') AS column_comment
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
        WHERE n.nspname = $1 AND c.relname = $2
          AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY a.attnum`,
      [schema, table]
    ),
    queryMeta(
      conn,
      // 表达式索引的 indkey 项为 0，接不上 pg_attribute，故用 LEFT JOIN 保留该位并标注
      `SELECT i.relname AS index_name,
              COALESCE(a.attname, '(表达式)') AS column_name,
              k.ord AS seq_in_index,
              ix.indisunique AS is_unique
         FROM pg_index ix
         JOIN pg_class i ON i.oid = ix.indexrelid
         JOIN pg_class t ON t.oid = ix.indrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
         JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
         LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
        WHERE n.nspname = $1 AND t.relname = $2
        ORDER BY i.relname, k.ord`,
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
 * 只读连接下用 `BEGIN READ ONLY` 包裹并以 `ROLLBACK` 收尾：词法分类不完备
 * （design.md 决策二），让真正执行语句的那一方来判断「这条是不是写」才是完备的判定。
 *
 * 事务必须落在同一条物理连接上，故这里取独立连接而不走池的快捷查询。
 */
async function execute(
  conn: DatastoreConnection,
  sql: string,
  opts: RdbExecOptions
): Promise<RdbExecResult> {
  const cls = classifySqlOperation(sql);
  const executedSql = shouldInjectLimit(sql, cls) ? injectLimit(sql, opts.rowLimit) : sql;

  return run(conn, async (pool) => {
    const client = await pool.connect();
    const start = Date.now();
    try {
      if (opts.readonly) await client.query("BEGIN READ ONLY");
      try {
        const result = await runOne(client, executedSql, opts.hardLimit);
        return { ...result, tookMs: Date.now() - start, executedSql };
      } finally {
        // 只读事务无论成败都回滚：不产生任何提交
        if (opts.readonly) {
          await client.query("ROLLBACK").catch(() => {
            /* 连接已断时回滚必然失败，忽略 */
          });
        }
      }
    } finally {
      client.release();
    }
  });
}

/**
 * 单条语句的执行与结果整形。
 *
 * `values: []` 是刻意传的：node-postgres 不带参数时走简单查询协议，而简单查询协议
 * **允许**一次发送多条语句——`SELECT 1; DROP TABLE t` 会两条都执行。带上参数数组
 * 使其走扩展查询协议，多语句在协议层就不成立，作为分类器拒绝之外的第二道保障。
 *
 * `rowMode: "array"`：列名从 field 元数据取，重名列不会互相覆盖（见 uniqueColumnLabels）。
 */
async function runOne(
  client: PoolClient,
  sql: string,
  hardLimit: number
): Promise<Omit<RdbExecResult, "tookMs" | "executedSql">> {
  const result = await client.query({ text: sql, values: [], rowMode: "array" });

  const labels = uniqueColumnLabels((result.fields ?? []).map((f) => f.name));
  const raw = (result.rows ?? []) as unknown[][];

  // 写语句没有结果集，PG 以 rowCount 给出影响行数
  if (labels.length === 0) {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      affectedRows: result.rowCount ?? 0,
      truncated: false,
    };
  }

  const truncated = raw.length > hardLimit;
  const rows = zipRows(labels, truncated ? raw.slice(0, hardLimit) : raw);
  return { columns: labels, rows, rowCount: rows.length, truncated };
}

/* ─── 错误归一化 ──────────────────────────────────────────── */

/** PostgreSQL 的原始异常翻译为可读原因；无法归类时原样透出。 */
export function describePgError(err: unknown): string {
  const e = err as { code?: string; message?: string };
  const raw = e?.message ?? String(err);
  const code = e?.code ?? "";

  switch (code) {
    case "28P01":
    case "28000":
      return `认证失败：用户名或密码不正确（${raw}）`;
    case "3D000":
      return `库不存在：${raw}`;
    case "3F000":
      return `schema 不存在：${raw}`;
    case "42P01":
      return `表或视图不存在：${raw}`;
    case "42501":
      return `权限不足：当前账号无权执行该操作（${raw}）`;
    case "25006":
      return `该连接为只读模式，数据库拒绝了这条写语句（${raw}）`;
    case "57014":
      return `语句执行超时（上限 ${STATEMENT_TIMEOUT_MS}ms），已中止：这不是语法错误，请缩小查询范围或加索引`;
    case "ECONNREFUSED":
    case "ENOTFOUND":
    case "EHOSTUNREACH":
      return `地址不可达：${raw}`;
    case "ETIMEDOUT":
      return `连接超时：${raw}`;
    default:
      break;
  }

  if (/read-only transaction/i.test(raw)) {
    return `该连接为只读模式，数据库拒绝了这条写语句（${raw}）`;
  }
  if (/cannot insert multiple commands/i.test(raw)) {
    return "一次只能执行一条语句：请删掉分号后多余的语句再执行";
  }
  if (/timeout|timed out/i.test(raw)) {
    return `连接超时：${raw}`;
  }
  return raw || "执行失败";
}

export const pgDriver: RdbDriver = {
  ping,
  listDatabases,
  listSchemas,
  listTables,
  describeTable,
  execute,
};

/** 连接测试专用：临时建池、用完即弃，不污染连接池。 */
export async function pingPgOnce(conn: DatastoreConnection): Promise<string> {
  const pool = createPool(conn);
  try {
    const result = await pool.query("SELECT version() AS version");
    return String((result.rows[0] as MetaRow | undefined)?.version ?? "未知");
  } finally {
    await pool.end().catch(() => {
      /* 忽略断连异常 */
    });
  }
}
