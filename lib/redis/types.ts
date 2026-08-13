/**
 * Redis 管理工具的纯数据类型（无服务端依赖）。
 * 服务端（app/api/redis、lib/redis）与前端（components/redis）共用，
 * 故此文件禁止 import ioredis / better-sqlite3 等仅服务端可用的模块。
 */

/** 连接类型：单机 / 集群 / 哨兵。 */
export type RedisConnType = "standalone" | "cluster" | "sentinel";

/** 环境标签：用于操作前辨识，生产默认只读。 */
export type RedisEnv = "local" | "test" | "prod";

/** 读写模式：只读模式拦截一切写操作。 */
export type RedisMode = "rw" | "readonly";

/** 节点地址。standalone 仅 1 个；cluster 为多个；sentinel 为哨兵节点。 */
export interface RedisNode {
  host: string;
  port: number;
}

/** 连接配置（对应 redis_connections 一行）。 */
export interface RedisConnection {
  id: number;
  name: string;
  type: RedisConnType;
  nodes: RedisNode[];
  masterName: string; // 仅 sentinel 使用
  password: string; // 明文存储（本地自用）
  db: number; // standalone / sentinel 使用；cluster 忽略
  env: RedisEnv;
  mode: RedisMode;
  createdAt: string;
  updatedAt: string;
}

/** 新建 / 编辑连接的入参（不含 id 与时间戳）。 */
export interface RedisConnectionInput {
  name: string;
  type: RedisConnType;
  nodes: RedisNode[];
  masterName?: string;
  password?: string;
  db?: number;
  env: RedisEnv;
  mode?: RedisMode;
}

/** Redis 键的数据类型（TYPE 命令返回值）。 */
export type RedisKeyType = "string" | "list" | "set" | "zset" | "hash" | "stream" | "none";

/** 键浏览器一行。 */
export interface KeyInfo {
  key: string;
  type: RedisKeyType;
  ttl: number; // 秒；-1=永久，-2=不存在
}

/** SCAN 分页结果。nextCursor 为空串表示遍历结束。 */
export interface ScanResult {
  keys: KeyInfo[];
  nextCursor: string;
}

/** hash / zset 的字段项。 */
export interface FieldEntry {
  field: string;
  value: string;
}

/** zset 成员项。 */
export interface ZMember {
  member: string;
  score: number;
}

/**
 * 类型化值读取结果。
 * value 形态随 type 而异：
 * - string → string
 * - list / set → string[]
 * - hash → FieldEntry[]
 * - zset → ZMember[]
 */
export interface ValueResult {
  type: RedisKeyType;
  value: string | string[] | FieldEntry[] | ZMember[] | null;
  ttl: number;
  total: number; // 集合类元素总数（string 恒为 0）
  truncated: boolean; // 是否因超上限被截断
}

/** INFO 单节点解析结果：分区 → 键值对。 */
export interface NodeInfo {
  node: string; // "standalone" 或 "host:port"
  sections: Record<string, Record<string, string>>;
}

/** INFO 面板结果：集群下含多节点。 */
export interface InfoResult {
  nodes: NodeInfo[];
}

/**
 * 慢查询单条目（SLOWLOG GET 解析结果）。
 * clientAddr / clientName 仅 Redis 4.0+ 提供，缺失时为 undefined。
 */
export interface SlowlogEntry {
  id: number; // 条目自增 ID
  timestamp: number; // 发生时间（秒级 Unix 时间戳）
  durationUs: number; // 执行耗时（微秒）
  command: string[]; // 命令及其参数（Redis 可能已对超长参数截断）
  clientAddr?: string; // 客户端地址 host:port（4.0+）
  clientName?: string; // 客户端名 CLIENT SETNAME（4.0+）
}

/** 单节点慢查询结果：集群下每主节点一份。 */
export interface NodeSlowlog {
  node: string; // "standalone" 或 "host:port"
  len: number; // SLOWLOG LEN 当前总条数
  entries: SlowlogEntry[];
}
