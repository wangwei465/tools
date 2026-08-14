## Context

Redis 管理工具已经把「本地多连接 + 环境标签 + 只读模式 + 危险操作确认」这套模式跑通并归档，其结构可以近乎照搬：

- `lib/redis/types.ts`——纯类型，明确禁止 import 服务端模块，供服务端与前端共用
- `lib/redis/pool.ts`——用 `globalThis.__redisPool` 维护 `Map<key, client>`，规避 Next dev 热重载导致的连接泄漏
- `lib/redis/safety.ts`——服务端硬编码的两级闸门：写操作在只读模式下拦截，危险操作任何模式都需 `confirm=true`
- `redis_connections` 表——`env`(local/test/prod) + `mode`(rw/readonly) + 明文密码，走 `lib/db` 的 `user_version` 迁移
- `app/redis/page.tsx`——顶部连接选择器 + 视图切换，主体按视图渲染，连接列表为页面级状态

本次要接的两个数据源，与 Redis 的差别在于：ES 是 HTTP REST + JSON DSL，MongoDB 是二进制线协议 + BSON，两者之间的差异也远大于 MySQL 与 PostgreSQL 之间的差异。

## Goals / Non-Goals

**Goals:**

- ES 与 MongoDB 共用一套连接管理、安全闸门与页面外壳，各自实现目录浏览与查询
- ES 侧零新增依赖，且不被客户端版本矩阵绑死，能连 6.x 到 9.x 乃至 OpenSearch
- 安全闸门的判定全部在服务端，不信任前端传来的"这是只读操作"
- 纯函数层（操作分类、查询构造、字段推断、响应解析）可在无真实服务的情况下单测

**Non-Goals:**

- 不抽象统一的 datastore driver 接口（理由见决策一）
- 不做文档可视化编辑、索引/集合的创建删除 UI、聚合图表
- 不做连接密码的加密存储——与 `redis_connections` 的现状保持一致，本地自用工具的既有取舍

## Decisions

### 决策一：不抽象统一 driver 接口，只共享外壳与闸门

**选择：** `lib/datastore/` 下按数据源分文件（`es.ts` / `mongo.ts`），各自导出自己的目录查询与数据查询函数；共享的只有 `types.ts`（连接类型）、`pool.ts`（连接复用）、`safety.ts`（操作分类）与 UI 外壳。

**理由：** ES 与 Mongo 的核心概念无法对齐——ES 是 index/mapping/DSL，Mongo 是 database/collection/filter+pipeline；ES 的"字段"来自显式 mapping，Mongo 的"字段"只能靠采样推断；ES 分页是 `from/size`，Mongo 是 `skip/limit` 且深分页要用 cursor。强行抽象出 `listContainers()` / `query()` 这类接口，只会得到一个每个方法都要 `if (type === 'es')` 分支的假抽象，比两份直白实现更难读。

**被否方案：** 定义 `DatastoreDriver` 接口让两者实现——参数类型无法统一，最终会退化成 `query(conn, payload: unknown)`，类型安全尽失。

**共享的边界很清楚：** 连接的增删改查、连通性测试、env/mode 语义、危险操作确认流程、结果展示组件、错误提示规范——这些与数据源无关，值得共享。

### 决策二：ES 侧用内置 fetch 直连 REST API，不引入官方客户端

**选择：** `lib/datastore/es.ts` 用 Node 内置 `fetch` 直接打 ES 的 HTTP 接口（`GET /`、`GET /_cat/indices?format=json`、`GET /{index}/_mapping`、`POST /{index}/_search`）。

**理由：** `@elastic/elasticsearch` 的版本兼容是硬约束——客户端把 `compatible-with=N` 硬编码进 `Accept` 与 `Content-Type` 头且无选项可改，9.x 客户端只能连 9.x 服务端，8.x 只能连 8.x；此外 7.14+ 会在首次调用前做一次自动 product check。这意味着装哪个大版本的客户端，就把本工具能连的集群锁死在哪个大版本——而一个排查工具最需要的恰恰是"手上这堆新旧集群都能连"。

改用 fetch 后：零新增依赖、天然兼容 ES 6/7/8/9 与 OpenSearch、请求响应就是用户在 Kibana Dev Tools 里熟悉的原始 JSON，排查时所见即所得。代价是要自己处理认证头与错误响应形状，但本工具只用到四个端点，这点成本远低于被版本矩阵绑死。

**被否方案：** 引入官方客户端并固定某个大版本——把兼容性问题转嫁给用户，且与本项目零依赖优先的取舍相悖。

### 决策三：MongoDB 用官方驱动 + globalThis 单例池

**选择：** 引入 `mongodb` 官方驱动，`lib/datastore/pool.ts` 以 `globalThis.__mongoPool` 维护 `Map<connId, MongoClient>`，与 `lib/redis/pool.ts` 同构。

**理由：** Mongo 是二进制线协议，无 REST 入口，必须用驱动。`MongoClient` 自带连接池并复用空闲连接，本身就是设计来长期持有的对象——每请求新建会在 Next dev 热重载下迅速耗尽句柄，这正是 Redis 池已经解决过的问题，照搬其模式即可。

**ES 侧不需要池**：无状态 HTTP 请求，每次 fetch 即可。

### 决策四：安全闸门按数据源各自分类，但闸门模型统一

**选择：** `safety.ts` 导出 `classifyEsOperation(method, path, body)` 与 `classifyMongoOperation(op, filter)`，都返回 `{ write: boolean, dangerous: boolean, reason?: string }`；上层的拦截逻辑（只读模式拦 write、dangerous 需 confirm）两者共用。

**理由：** 判定规则天差地别，但闸门行为一致。ES 侧看 HTTP 方法与路径：`DELETE /{index}` 与 `POST /{index}/_delete_by_query` 是危险写，`_update_by_query` 是写，`_search` / `_cat` / `_mapping` 是只读。Mongo 侧看操作名与过滤条件：`drop` / `dropDatabase` 危险，`deleteMany` / `updateMany` **在过滤条件为空对象时**升级为危险——这是 Mongo 特有的"全表误伤"模式，等价于 SQL 里无 WHERE 的 DELETE。

**判定一律在服务端**，前端传来的操作意图只用于 UI 提示，不作为放行依据——沿用 `lib/redis/safety.ts` 顶部注释确立的"不信任前端"原则。

### 决策五：查询结果同时提供 JSON 与表格视图

**选择：** 结果面板默认 JSON（CodeMirror 只读，已有 `@codemirror/lang-json`），可切换到表格视图——表格取所有文档的字段并集为列，缺失字段留空。

**理由：** 排查时两种需求都真实存在：核对单个文档的嵌套结构要看 JSON，横向比较十几条记录的某个字段要看表格。ES/Mongo 的文档是异构的，表格视图必须容忍字段缺失，故用并集而非首条文档的字段。嵌套对象在表格里以折叠的 JSON 片段展示，不做递归展开。

### 决策六：连接配置用一张表 + type 判别，而非两张表

**选择：** `datastore_connections` 单表，`type` 字段区分 `es` / `mongo`，连接细节存 `uri`（Mongo 连接串 / ES base URL）+ `username` / `password`，ES 特有的 `api_key` 与 Mongo 特有的 `auth_db` 存入 `extra_json`。

**理由：** 两类连接的公共字段（name/type/env/mode/时间戳）占多数，差异部分用一个 JSON 列容纳即可——这与 `redis_connections` 用 `nodes_json` 容纳三种连接类型的差异是同一手法。两张表会让连接列表查询与 UI 都要处理 union，得不偿失。

## Risks / Trade-offs

- **ES 各版本响应形状有差异**（如 `hits.total` 在 7.x 前是数字、之后是 `{value, relation}`）→ 在 `es.ts` 的响应解析里做兼容，两种形状都识别；解析失败时展示原始 JSON 而非报错，保证"至少能看到东西"。

- **`_cat/indices` 在大集群上返回量大** → 请求时带 `?format=json&h=` 只取需要的列，并在 UI 侧提供索引名过滤。

- **Mongo 采样推断字段会漏字段**（文档异构，采样 100 条可能覆盖不全）→ UI 明确标注这是采样推断结果而非 schema，并展示采样条数；不把它当作权威 schema 呈现。

- **深分页性能**：ES 的 `from+size` 超过 `max_result_window`（默认 10000）会直接报错，Mongo 的大 `skip` 会全扫 → 达到阈值时给出可读提示，说明原因并建议改用 `search_after` / 缩小过滤条件，而不是让底层抛错。

- **生产连接误操作**：这是本工具最实的风险 → 三重兜底：连接带 `env` 标签且 UI 上生产连接明显标色、`mode=readonly` 时服务端拦截一切写操作、危险操作二次确认弹窗里回显将要执行的完整操作串。

- **`mongodb` 驱动体积不小** → 仅在服务端 import，不进客户端 bundle；ES 侧零依赖已经把新增依赖压到最少。

- **凭证明文入库**：与 `redis_connections` 现状一致 → 沿用既有取舍，但 API 返回连接列表时对密码做脱敏（与 Redis 连接列表的处理保持一致）。

## Migration Plan

`app.db` 新增 `datastore_connections` 表，走 `lib/db/index.ts` 既有的 `user_version` 递增迁移，不改动任何现有表。回滚只需删除该表与相关路由，其他工具不受影响。

任务分两段落地：第 1~6 组打地基并完成 ES（可独立验收上线），第 7~8 组补 MongoDB。这样第一段就能拿到可用工具，也避免一次性堆出难以验证的巨型变更。

## Open Questions

- ES 的认证方式首版覆盖 Basic Auth 与 API Key 两种，暂不做 Bearer/PKI——若实际环境需要再补。
- Mongo 的副本集与分片集群通过连接串参数天然支持，无需额外 UI，但未在真实副本集上验证过。
