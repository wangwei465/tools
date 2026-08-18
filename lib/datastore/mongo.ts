/**
 * MongoDB 访问层：官方驱动 + `lib/datastore/pool.ts` 的 globalThis 单例池。
 *
 * Mongo 是二进制线协议、无 REST 入口，必须用驱动（design.md 决策三）。
 * 与 ES 侧不同，Mongo 的「字段」没有权威 schema，只能靠采样推断——故
 * inferFields 明确产出「观察到的类型集合 + 采样条数」，由 UI 标注其推断性质。
 *
 * 纯函数（serializeBson / inferFields / formatIndexKeys）与网络访问分离，可直接单测。
 */
import { withMongo } from "./pool";
import type {
  DatastoreConnection,
  MongoCollectionInfo,
  MongoDatabaseInfo,
  MongoFieldSample,
  MongoFieldSampleResult,
  MongoIndexInfo,
  MongoQueryResult,
} from "./types";

/** 字段采样条数：够看清主要字段形态，又不至于拖慢大集合。 */
export const SAMPLE_SIZE = 100;

/** 嵌套对象展开的最大层级：再深就该看 JSON 而非字段列表了。 */
const MAX_FIELD_DEPTH = 3;

/* ─── BSON 可读化（纯函数）────────────────────────────────── */

/** 取 BSON 类型标记；非 BSON 对象返回 null。 */
function bsonTypeName(value: object): string | null {
  const tag = (value as { _bsontype?: unknown })._bsontype;
  return typeof tag === "string" ? tag : null;
}

/**
 * 把 BSON 特有类型（ObjectId、Date、Long、Decimal128、Binary 等）转成可读字符串。
 * 不转的话前端 JSON.stringify 后会拿到空对象 `{}`，等于什么都看不到。
 */
export function serializeBson(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return value;

  if (value instanceof Date) return value.toISOString();
  if (value instanceof RegExp) return value.toString();
  if (Array.isArray(value)) return value.map(serializeBson);

  const bson = bsonTypeName(value);
  if (bson) {
    if (bson === "Binary") {
      const bin = value as { toString(enc?: string): string };
      try {
        return bin.toString("base64");
      } catch {
        return String(value);
      }
    }
    // ObjectId → 十六进制串；Long / Decimal128 / Timestamp → 十进制串
    return String(value);
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = serializeBson(v);
  }
  return out;
}

/** 批量可读化文档数组。 */
function serializeDocs(docs: unknown[]): Array<Record<string, unknown>> {
  return docs.map((d) => serializeBson(d) as Record<string, unknown>);
}

/* ─── 字段采样推断（纯函数）──────────────────────────────── */

/** 值的类型名：BSON 类型保留其名字，避免全部塌缩成 "object"。 */
export function valueTypeName(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value !== "object") return typeof value;
  if (value instanceof Date) return "date";
  if (value instanceof RegExp) return "regex";
  const bson = bsonTypeName(value);
  return bson ? bson.toLowerCase() : "object";
}

/** 可继续展开子字段的普通对象（BSON 值与数组不展开）。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof RegExp) &&
    bsonTypeName(value) === null
  );
}

/**
 * 从采样文档推断字段：聚合字段名与观察到的类型集合。
 * 同名字段在不同文档里出现多种类型时全部保留——异构文档下这本身就是有用信息，
 * 只取其一会掩盖问题。嵌套对象按点分路径展开（最多 MAX_FIELD_DEPTH 层）。
 */
export function inferFields(docs: Array<Record<string, unknown>>): MongoFieldSampleResult {
  const types = new Map<string, Set<string>>();
  const counts = new Map<string, number>();

  const walk = (obj: Record<string, unknown>, prefix: string, depth: number): void => {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (!types.has(path)) types.set(path, new Set());
      types.get(path)!.add(valueTypeName(value));
      counts.set(path, (counts.get(path) ?? 0) + 1);

      if (depth + 1 < MAX_FIELD_DEPTH && isPlainObject(value)) {
        walk(value, path, depth + 1);
      }
    }
  };

  for (const doc of docs) {
    if (doc && typeof doc === "object") walk(doc, "", 0);
  }

  const fields: MongoFieldSample[] = [...types.entries()]
    .map(([path, set]) => ({
      path,
      types: [...set].sort(),
      presentCount: counts.get(path) ?? 0,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return { sampled: docs.length, fields };
}

/** 索引键格式化：`{ userId: 1, createdAt: -1 }` → `userId:1, createdAt:-1`。 */
export function formatIndexKeys(key: unknown): string {
  if (!key || typeof key !== "object") return "";
  return Object.entries(key as Record<string, unknown>)
    .map(([field, dir]) => `${field}:${String(dir)}`)
    .join(", ");
}

/* ─── 目录浏览 ────────────────────────────────────────────── */

/** 数据库列表（按名称排序）。 */
export async function listDatabases(conn: DatastoreConnection): Promise<MongoDatabaseInfo[]> {
  const result = await withMongo(conn, (client) => client.db().admin().listDatabases());
  return (result.databases ?? [])
    .map((d) => ({ name: String(d.name), sizeOnDisk: Number(d.sizeOnDisk ?? 0) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 集合列表（含文档数与索引数）。
 * 文档数用 estimatedDocumentCount（读元数据，不全表扫描）——排查场景下量级足够。
 * 单个集合取数失败（如权限不足）不影响其余集合，按 0 兜底。
 */
export async function listCollections(
  conn: DatastoreConnection,
  dbName: string
): Promise<MongoCollectionInfo[]> {
  const rows = await withMongo(conn, async (client) => {
    const db = client.db(dbName);
    const infos = await db.listCollections({}, { nameOnly: true }).toArray();
    return Promise.all(
      infos.map(async (info) => {
        const coll = db.collection(info.name);
        const [docCount, indexCount] = await Promise.all([
          coll.estimatedDocumentCount().catch(() => 0),
          coll
            .indexes()
            .then((ix) => ix.length)
            .catch(() => 0),
        ]);
        return { name: info.name, docCount, indexCount };
      })
    );
  });
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** 采样推断集合字段。 */
export async function sampleFields(
  conn: DatastoreConnection,
  dbName: string,
  collection: string
): Promise<MongoFieldSampleResult> {
  const docs = await withMongo(conn, (client) =>
    client.db(dbName).collection(collection).find({}).limit(SAMPLE_SIZE).toArray()
  );
  return inferFields(serializeDocs(docs));
}

/** 集合索引：索引名与索引字段。 */
export async function listIndexes(
  conn: DatastoreConnection,
  dbName: string,
  collection: string
): Promise<MongoIndexInfo[]> {
  const indexes = await withMongo(conn, (client) =>
    client.db(dbName).collection(collection).indexes()
  );
  return indexes.map((ix) => ({
    name: String(ix.name ?? ""),
    keys: formatIndexKeys(ix.key),
  }));
}

/* ─── 查询 ────────────────────────────────────────────────── */

export interface FindInput {
  filter?: unknown;
  projection?: unknown;
  sort?: unknown;
  skip?: number;
  limit?: number;
}

/** 把可选的 JSON 入参收敛为驱动接受的 Document；非对象一律回落空对象。 */
function asDocument(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** find：过滤、投影、排序、skip / limit。 */
export async function mongoFind(
  conn: DatastoreConnection,
  dbName: string,
  collection: string,
  input: FindInput
): Promise<MongoQueryResult> {
  const start = Date.now();
  const docs = await withMongo(conn, (client) =>
    client
      .db(dbName)
      .collection(collection)
      .find(asDocument(input.filter), {
        ...(input.projection ? { projection: asDocument(input.projection) } : {}),
        ...(input.sort ? { sort: asDocument(input.sort) as Record<string, 1 | -1> } : {}),
        skip: Math.max(0, input.skip ?? 0),
        limit: Math.max(1, input.limit ?? 20),
      })
      .toArray()
  );
  return { docs: serializeDocs(docs), tookMs: Date.now() - start };
}

/** aggregate：管道必须是数组，由调用方前置校验。 */
export async function mongoAggregate(
  conn: DatastoreConnection,
  dbName: string,
  collection: string,
  pipeline: Array<Record<string, unknown>>
): Promise<MongoQueryResult> {
  const start = Date.now();
  const docs = await withMongo(conn, (client) =>
    client.db(dbName).collection(collection).aggregate(pipeline).toArray()
  );
  return { docs: serializeDocs(docs), tookMs: Date.now() - start };
}

/**
 * updateMany：按条件批量更新。
 * 写操作不做可视化编辑，靠手写过滤条件与更新文档完成（proposal 的既定取舍），
 * 是否放行由 safety 闸门在上层判定——空过滤条件会被升级为危险操作。
 * 结果以「影响条数」形式回到同一套结果面板。
 */
export async function mongoUpdateMany(
  conn: DatastoreConnection,
  dbName: string,
  collection: string,
  filter: unknown,
  update: unknown
): Promise<MongoQueryResult> {
  const start = Date.now();
  const r = await withMongo(conn, (client) =>
    client.db(dbName).collection(collection).updateMany(asDocument(filter), asDocument(update))
  );
  return {
    docs: [{ matchedCount: r.matchedCount, modifiedCount: r.modifiedCount }],
    tookMs: Date.now() - start,
  };
}

/** deleteMany：按条件批量删除；空过滤条件由闸门升级为危险操作。 */
export async function mongoDeleteMany(
  conn: DatastoreConnection,
  dbName: string,
  collection: string,
  filter: unknown
): Promise<MongoQueryResult> {
  const start = Date.now();
  const r = await withMongo(conn, (client) =>
    client.db(dbName).collection(collection).deleteMany(asDocument(filter))
  );
  return { docs: [{ deletedCount: r.deletedCount }], tookMs: Date.now() - start };
}
