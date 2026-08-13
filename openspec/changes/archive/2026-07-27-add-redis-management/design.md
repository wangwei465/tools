## Context

### 现状
工具集为 Next.js 14（App Router）本地工具箱，已有三个**无状态**工具：数据比对 / 生成签名 / 接口调试。统一骨架：`Navigation` 的 `TOOLS` 注册菜单 → `app/<tool>/page.tsx` 前端 → `app/api/*/route.ts` 服务端（Node 特权环境）→ `lib/db`（better-sqlite3，`globalThis.__appDb` 进程内单例）持久化到 `data/app.db`。API 约定为 POST + JSON 信封。

### 本工具定位
定位为**开发调试器**（redis-cli + 键浏览器），而非重型运维台（RedisInsight）。高频操作三类：查 key/看值、改缓存、跑命令。因排障需连生产，**安全**为核心约束而非附加项。

### 与已有工具的根本差异
Redis 连接是**有状态长连接**（TCP + AUTH + SELECT db），不同于 HTTP 代理的"打一枪就走"。故首次引入服务端连接池：`lib/redis/pool.ts` 以 `globalThis.__redisPool` 维护 `Map<connId, client>`，规避 Next dev 热重载导致的连接泄漏 / 句柄爆炸——与 `lib/db` 的 `__appDb` 同构思路。连接**类型**为一等属性（单机 / 集群 / 哨兵），连接池按类型建不同 client（`Redis` / `Redis.Cluster` / 哨兵配置的 `Redis`）。

### 约束
沿用 better-sqlite3（`lib/db`）、CodeMirror、暗色设计系统、`useReducer`。新增依赖仅 `ioredis`。键遍历一律 SCAN。

## Goals / Non-Goals

**Goals（本 change）:**
- 连接 CRUD + 连接测试（PING）+ 环境标签 + 读写模式；密码明文存。
- **连接类型**：单机 / 集群（Cluster）/ 哨兵（Sentinel）三种，连接池按类型建对应 client。
- 服务端连接池单例：按 connId 建连 / 复用 / 关闭，热重载存活。
- 键浏览器：`SCAN` 游标分页 + `MATCH` 匹配，列出 key + 类型 + TTL；**集群模式逐主节点遍历**。
- 类型化值查看与编辑：string / hash / list / set / zset **全五种**；TTL（EXPIRE/PERSIST）、DEL。
- 命令控制台：原始命令执行 + 结果回显 + 历史；只读拦截 + 危险命令二次确认。
- **INFO 监控面板**：解析 `INFO` 分区展示（server/clients/memory/stats/replication/keyspace），手动刷新；集群按节点聚合。

**Non-Goals:**
- 集群拓扑**可视化**（节点关系图 / 槽位分布图）与在线 reshard / failover 操作（仅做连接 + 读写 + 按节点 INFO，不做拓扑运维）。
- Pub/Sub 订阅、Stream 消费。
- 慢查询日志 / 客户端列表（`SLOWLOG` / `CLIENT LIST`）明细面板（INFO 概览之外的深度监控后置）。
- 密码加密存储（第一版明文，本地自用，与 `api_variables` 明文策略一致）。
- 多库批量操作、导入导出、数据迁移。
- 键的实时刷新 / 订阅式更新（手动刷新即可）。

## Decisions

### 连接池：`globalThis.__redisPool` 单例，照搬 `__appDb`
`lib/redis/pool.ts` 维护 `Map<connId, ioredis>`；`getClient(connId)` 无则按 `redis_connections` 配置建连、有则复用。连接配置变更（编辑 / 删除）时销毁并移除对应 client。*备选*：每请求 `new Redis()`——连接泄漏、认证开销、热重载句柄爆炸，否决。

### 连接类型：单机 / 集群 / 哨兵，配置驱动建连
`redis_connections.type ∈ {standalone, cluster, sentinel}`，节点信息存 `nodes_json`（单机为单条 host:port；集群为多条节点；哨兵为哨兵节点数组 + `master_name`）。连接池按类型分派：
```
standalone → new Redis({ host, port, password, db })
cluster    → new Redis.Cluster(nodes, { redisOptions:{ password } })
sentinel   → new Redis({ sentinels: nodes, name: masterName, password })
```
一套 `getClient` 出口，三种入口——上层 keys/value/exec 拿到的都是统一 client 接口，命令调用无需区分类型（Cluster 会自动路由槽位）。*备选*：只做单机 + 让用户直连集群某节点——集群 MOVED 重定向会失败，且 SCAN 只能扫单点，否决。

### 集群 SCAN 逐主节点遍历
单机 `SCAN` 扫单个 keyspace；集群下键分散在各主节点，单点 SCAN 只能看到本节点的槽位。故集群模式对 `client.nodes('master')` 的**每个主节点分别 SCAN**，游标为「节点索引 + 各节点 cursor」的复合结构，由前端持有回传；全部节点游标归 0 才算遍历完。*备选*：用 `client.scan`（ioredis Cluster 不支持全局 SCAN）——不可行。单机 / 哨兵仍走单点 SCAN。

### INFO 分区解析，按节点聚合
`INFO` 返回 `# Section\nkey:value` 文本，服务端解析成 `{ section: { key: value } }`，前端渲染关注区（memory：used_memory_human / maxmemory；clients：connected_clients；stats：instantaneous_ops_per_sec / keyspace_hits·misses → 命中率；server：redis_version / uptime；replication：role / connected_slaves；keyspace：各 db 的 keys/expires）。集群模式对每个主节点取 INFO，前端按节点分栏或聚合汇总。只读操作，安全。*备选*：前端解析原始文本——解析逻辑该在服务端内聚，前端只渲染结构化数据。

### 键遍历一律 SCAN，禁用 KEYS
`SCAN cursor MATCH <pattern> COUNT <n>`，游标状态由**前端持有**（每次把 `nextCursor` 回传），服务端无状态——与现有工具气质一致。`cursor="0"` 为起点，返回 `"0"` 即遍历完。*备选*：`KEYS *`——生产库阻塞主线程，硬否决。

### 值 API 统一「取值 / 改值」信封，渲染层按类型分化（DRY）
`app/api/redis/value` 依 `TYPE` 返回 `{ type, value, ttl }`（value 形态随类型：string→文本、hash→字段数组、list→元素数组、set→成员数组、zset→成员+score 数组）；写操作按类型分派子命令。五个前端编辑器组件**共用同一套** value API，仅渲染 / 交互不同。*备选*：每类型独立 API 端点——重复的连接 / 错误处理逻辑，违背 DRY。

### 安全为连接级一等属性
`redis_connections` 存 `env`（local/test/prod）与 `mode`（rw/readonly），新建生产连接默认 `readonly`。命令执行闸门（`app/api/redis/exec`）：
```
命令 → 解析首 token → ┌ 只读模式 + 写命令   → 拦截, 提示切模式
                      ├ 危险命令(FLUSHALL/  → 要求 confirm=true 才放行
                      │  FLUSHDB/CONFIG/     （前端二次确认弹窗显示连接名+环境）
                      │  SHUTDOWN/DEBUG…)
                      └ 其余               → 直接执行
```
写命令 / 危险命令判定用**命令名白/黑名单**（服务端硬编码），不信任前端。*备选*：不分模式，全放行——生产手滑清库风险，否决。

### 密码明文存 `app.db`
`redis_connections.password` 明文。本地自用工具，与 `api_variables` 明文策略一致；文档提示勿公网部署、勿提交 `data/`（已在 `.gitignore`）。*备选*：加密——需密钥管理，本地场景 YAGNI。

### 选型 `ioredis`
原始 `client.call(cmd, ...args)` 直通任意命令（命令控制台必需）、超时 / 重连 / 集群可控。*备选*：官方 `node-redis`——亦可，但 `ioredis` 在管理场景更常用、`call()` 直通更顺手。落地前经 context7 拉最新 API 确认。

### 值编辑五类型纵切交付
五种类型各自一个编辑器组件（string 文本 / hash 字段表 / list 元素表 / set 成员表 / zset 成员分数表），**逐类型独立可验收**——做完一种能跑一种，共用 value API，避免五套一起憋大招。

## Risks / Trade-offs

- **连生产误操作** → 连接级只读模式 + 危险命令二次确认 + 弹窗显示环境标签；写 / 危险判定在服务端。
- **密码明文落盘** → 本地自用可接受；`data/` 已 gitignore，文档强调勿公网部署。
- **连接池句柄泄漏 / 热重载残留** → `globalThis` 单例 + 配置变更时显式销毁；参照 memory「dev-server 端口残留」的进程残留教训，dev 停服后连接随进程回收。
- **SCAN 遍历期间键变动** → SCAN 语义本身保证"遍历期间始终存在的 key 至少返回一次"，可接受；不追求快照一致。
- **大 value（大 hash / 大 list）拖垮前端** → 值读取加**元素数量上限 + 分页/截断提示**（如 hash/list 超阈值只取前 N 并提示）。
- **命令控制台可执行任意命令** → 与只读 / 危险闸门叠加；本地工具默认信任操作者，但生产连接强约束。
- **集群 SCAN 逐节点遍历的游标复杂度** → 复合游标（节点索引 + 各节点 cursor）由前端持有；节点数变动（扩缩容）时以当次 `nodes('master')` 快照为准，可接受。
- **集群下命令控制台的键路由** → 单键命令由 Cluster 自动路由；跨槽位多键命令（如 `MGET` 不同槽）会报 CROSSSLOT，原样回显错误，不特殊处理。
- **INFO 刷新频率** → 手动刷新为主；若加自动轮询需注意生产连接的额外负载，默认不轮询。

## Migration Plan

- **建表** `redis_connections`（`IF NOT EXISTS`），幂等；对既有 `app.db` 纯增表，不动现有五表。
- **加依赖** `ioredis`（`npm i ioredis`）。
- **回滚**：`DROP TABLE redis_connections` + 移除 `lib/redis`、`app/redis`、`app/api/redis`、`components/redis` + 撤 `Navigation` 一行 + 卸 `ioredis`，对其余工具零影响。

## Open Questions

- 大集合（hash/list/set/zset）读取的元素上限阈值取多少（如 1000）？超限用分页游标还是仅截断提示？实现时定。
- 危险命令黑名单的确切范围（是否含 `RENAME`、`MIGRATE`、`RESTORE`、`SWAPDB`）？实现时对齐一份清单。
- 连接测试 PING 的超时时长（生产网络可能慢），倾向 3~5s，实现时定。
- 命令历史持久化到 `app.db` 还是仅前端会话内存？倾向仅会话（YAGNI），实现时确认。
- INFO 面板是否提供自动刷新（轮询间隔）？倾向仅手动刷新，避免生产额外负载，实现时确认。
- 集群 INFO 展示形态：按主节点分栏 vs 汇总聚合（内存求和、ops 求和）？倾向分栏 + 关键项汇总，实现时定。
