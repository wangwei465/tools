/**
 * 命令安全分类（服务端硬编码白/黑名单，不信任前端）。
 *
 * 两级闸门：
 * - 写命令（WRITE）：只读模式下一律拦截。
 * - 危险命令（DANGEROUS）：任何模式下都需二次确认（confirm=true）才放行。
 *
 * 判定基于命令首 token（大小写不敏感）。名单力求覆盖常用命令，
 * 未收录的未知命令按「非写、非危险」放行——本地工具默认信任操作者，
 * 生产风险由只读模式 + 危险名单双重兜底。
 *
 * 复合命令例外（SLOWLOG）：首 token 无法区分子命令，需读第二个 token——
 * `SLOWLOG RESET` 清空慢日志视为危险写（只读拦截 + 二次确认），
 * `SLOWLOG GET/LEN` 为只读放行。故 isWriteCommand/isDangerousCommand 接收完整命令串。
 */

/** 会修改数据 / 状态的命令：只读模式拦截。 */
const WRITE_COMMANDS = new Set([
  // string
  "set", "setex", "psetex", "setnx", "setrange", "append", "getset", "getdel",
  "incr", "incrby", "incrbyfloat", "decr", "decrby", "mset", "msetnx", "setbit",
  // 通用键
  "del", "unlink", "expire", "pexpire", "expireat", "pexpireat", "persist",
  "rename", "renamenx", "move", "copy", "restore", "sort",
  // hash
  "hset", "hmset", "hsetnx", "hdel", "hincrby", "hincrbyfloat",
  // list
  "lpush", "lpushx", "rpush", "rpushx", "lpop", "rpop", "lset", "lrem",
  "linsert", "ltrim", "rpoplpush", "lmove", "blpop", "brpop",
  // set
  "sadd", "srem", "spop", "smove", "sdiffstore", "sinterstore", "sunionstore",
  // zset
  "zadd", "zrem", "zincrby", "zpopmin", "zpopmax", "zremrangebyrank",
  "zremrangebyscore", "zremrangebylex", "zdiffstore", "zinterstore", "zunionstore",
  // stream
  "xadd", "xdel", "xtrim", "xsetid",
  // 位图 / HLL / geo
  "bitop", "pfadd", "pfmerge", "geoadd", "setex",
]);

/** 高危命令：清库 / 改配置 / 停机 / 迁移等，需二次确认。 */
const DANGEROUS_COMMANDS = new Set([
  "flushall", "flushdb", "swapdb",
  "config", "shutdown", "debug", "reset",
  "migrate", "restore",
  "replicaof", "slaveof", "failover",
  "save", "bgsave", "bgrewriteaof",
  "cluster", "monitor",
  "keys", // 生产阻塞主线程，视为危险
]);

/** 提取命令首 token（小写）。 */
export function commandName(command: string): string {
  return command.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "";
}

/**
 * SLOWLOG 子命令判定：仅 `RESET` 改状态（清空慢日志）视为危险写，
 * `GET`/`LEN` 只读放行。复合命令需读第二个 token。
 */
function isSlowlogReset(command: string): boolean {
  return (command.trim().split(/\s+/)[1] ?? "").toLowerCase() === "reset";
}

/** 是否写命令（危险命令同属写命令，均改状态）。入参为完整命令串。 */
export function isWriteCommand(command: string): boolean {
  const name = commandName(command);
  if (name === "slowlog") return isSlowlogReset(command); // 仅 RESET 属写，只读拦截
  return WRITE_COMMANDS.has(name) || DANGEROUS_COMMANDS.has(name);
}

/** 是否危险命令（任何模式都需二次确认）。入参为完整命令串。 */
export function isDangerousCommand(command: string): boolean {
  const name = commandName(command);
  if (name === "slowlog") return isSlowlogReset(command); // 仅 RESET 危险
  return DANGEROUS_COMMANDS.has(name);
}
