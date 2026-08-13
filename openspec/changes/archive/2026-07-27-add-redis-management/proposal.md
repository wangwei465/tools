## Why

工具集当前的三个工具（数据比对 / 生成签名 / 接口调试）都是**无状态**的：打一枪就走。日常开发绕不开 Redis——查 key/看值、改缓存、跑命令，目前只能切到终端敲 `redis-cli` 或另开 RedisInsight。本 change 在工具集内新增「Redis 管理」菜单，把这三类高频操作收进同一个本地工具箱，沿用现有骨架（`Navigation` 注册 + `app/<tool>/page.tsx` + `app/api/*/route.ts` + `lib/db` 持久化）。

> Redis 与已有工具的**根本差异**：Redis 连接是"活的"长连接（TCP + 认证 + 选库状态），而非无状态请求。故本 change 首次引入**服务端连接池单例**（照搬 `lib/db` 的 `globalThis.__appDb` 模式）。又因排障需连生产，**安全**从"锦上添花"升为核心需求：SCAN 禁 KEYS、连接级只读模式、危险命令二次确认。

## What Changes

- 新增**连接管理**：创建 / 编辑 / 删除 Redis 连接配置（`redis_connections`），含**连接类型（单机 / 集群 / 哨兵）**、节点信息、password、db、环境标签（本地 / 测试 / 生产）与读写模式（读写 / 只读）；支持连接测试（PING）。密码明文存本地库。
- 新增**服务端连接池**：`lib/redis/pool.ts` 以 `globalThis.__redisPool` 维护 `Map<connId, client>`，按连接类型建对应 client（`Redis` / `Redis.Cluster` / 哨兵配置的 `Redis`），热重载存活、按需建连、复用长连接。
- 新增**键浏览器**：一律 `SCAN` 游标分页（禁 `KEYS`），支持 `MATCH` 模式匹配；**集群模式逐主节点遍历**；列表附带每个 key 的类型与 TTL。
- 新增**类型化值查看与编辑**：覆盖 string / hash / list / set / zset **全部五种类型**的查看与编辑，加通用 TTL 操作（EXPIRE / PERSIST）与删除（DEL）。
- 新增**命令控制台**：redis-cli 式原始命令执行，结果原样回显 + 命令历史；执行前经**安全闸门**：只读模式拦截写命令、危险命令（FLUSHALL/FLUSHDB/CONFIG…）二次确认。
- 新增 **INFO 监控面板**：解析 `INFO` 分区展示服务器 / 客户端 / 内存 / 命中率 / 复制 / 键空间等关键指标，手动刷新；集群模式按节点聚合。
- **不改动**：数据比对 / 生成签名 / 接口调试及其 API、`app.db` 既有表结构。

## Capabilities

### New Capabilities
- `redis-connection`：连接管理——`redis_connections` 的 CRUD、连接测试、连接类型（单机/集群/哨兵）、环境标签与读写模式；服务端连接池单例（按类型建连 / 复用 / 关闭）。
- `redis-keyspace`：键空间浏览——`SCAN` 游标分页 + `MATCH` 匹配（集群逐主节点）、类型识别、TTL 展示、key 删除。
- `redis-value`：类型化值——string/hash/list/set/zset 五类型的查看与编辑、TTL 设置（EXPIRE/PERSIST）。
- `redis-console`：命令控制台——原始命令执行、结果回显、命令历史、只读拦截与危险命令二次确认。
- `redis-monitor`：INFO 监控——解析 `INFO` 分区展示服务器/客户端/内存/命中率/复制/键空间指标、手动刷新、集群按节点聚合。

### Modified Capabilities
<!-- 无：Redis 管理为全新独立菜单，不触碰既有工具的能力需求。 -->

## Impact

- **新增依赖**：`ioredis`（单机 / `Redis.Cluster` / 哨兵三合一、超时控制、原始 `call()` 更适合管理场景）。
- **新增数据层**：`lib/db` 建表 `redis_connections`(id, name, type, nodes_json, master_name, password, db, env, mode, created_at, updated_at)，`CREATE TABLE IF NOT EXISTS`（幂等）。
- **新增连接池**：`lib/redis/pool.ts`——`globalThis.__redisPool` 单例，按 connId + 连接类型建连 / 取用 / 关闭。
- **新增后端**：`app/api/redis/{connections,keys,value,exec,info}/route.ts`。
- **新增前端**：`app/redis/page.tsx` + `components/redis/*`（连接选择器 / 键浏览器 / 值面板 / 命令控制台 / INFO 面板）。
- **导航**：`components/shell/Navigation.tsx` 的 `TOOLS` 追加 `{ href:"/redis", label:"Redis管理" }`。
- **复用**：`lib/db`、`globalThis` 单例模式、暗色设计系统、CodeMirror（值/命令编辑）。
- **约束**：连接密码明文落 `app.db`（本地自用，勿公网部署 / 勿提交库文件）；键遍历一律 SCAN（集群逐主节点）；生产连接默认只读。
