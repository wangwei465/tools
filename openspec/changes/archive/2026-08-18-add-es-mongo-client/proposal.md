## Why

工具集已覆盖 Redis，但日常排查里另外两类数据源同样高频：Elasticsearch（查索引、看 mapping、跑 DSL 验证召回）与 MongoDB（查集合、跑 find/aggregate 验证数据形态）。目前这两者只能靠 Kibana、Compass 或命令行，前两者未必在每个环境都部署，而把生产连接信息粘到第三方客户端也不可控。本次把它们收进同一个本地工具，复用 Redis 管理已验证的连接管理与安全闸门模式。

## What Changes

- 新增「数据源」工具（`/datastore`），挂载到全局导航，顶部为连接选择器 + 视图切换，主体按数据源类型渲染对应面板
- **连接管理**：新增 `datastore_connections` 表，统一管理 ES 与 MongoDB 两类连接，沿用 Redis 连接的 `env`（local/test/prod）与 `mode`（rw/readonly）字段语义，支持连通性测试
- **安全闸门**：沿用 Redis 的两级闸门模型——只读模式拦截一切写操作；危险操作（删索引、drop 集合、`_delete_by_query`、`deleteMany({})` 等）任何模式下都需二次确认
- **Elasticsearch 能力**：
  - 索引列表（含文档数、存储大小、健康状态）与 mapping 字段树浏览
  - 查询台：编辑 DSL JSON 执行 `_search`，结果以 JSON 与表格两种视图展示，支持分页
- **MongoDB 能力**：
  - 数据库 / 集合列表（含文档数、索引数），集合字段通过采样推断并展示
  - 查询台：`find`（过滤、投影、排序、分页）与 `aggregate` 管道执行
- ES 侧**不引入官方客户端**，用 Node 内置 `fetch` 直连其 REST API；MongoDB 侧引入官方 `mongodb` 驱动

### 非目标

- 不做文档的可视化编辑（改字段、插入文档）。写操作靠手写 DSL / 命令完成，避免误改
- 不做索引与集合的创建 / 删除 UI。删除类操作仅在查询台里手写并经二次确认
- 不做 Kibana 式的聚合图表与仪表盘，本工具面向排查而非分析
- 不支持 ES 的 `_bulk` 批量导入与 Mongo 的 `mongodump` 式导出

## Capabilities

### New Capabilities

- `datastore-connection`: 数据源连接管理——ES 与 MongoDB 两类连接的增删改查、密码与连接串持久化、连通性测试、环境标签与读写模式，以及服务端连接复用
- `datastore-safety`: 数据源操作安全闸门——只读模式的写操作拦截、危险操作的二次确认，以及 ES 与 MongoDB 各自的操作分类规则
- `es-catalog`: ES 索引与 mapping 浏览——索引列表及其文档数/大小/健康状态、mapping 字段树展示
- `es-query-console`: ES 查询台——DSL JSON 编辑与执行、结果的 JSON 与表格双视图、分页与耗时展示
- `mongo-catalog`: MongoDB 库与集合浏览——数据库/集合列表及其文档数与索引信息、集合字段的采样推断
- `mongo-query-console`: MongoDB 查询台——find 与 aggregate 的执行、结果展示、分页与耗时展示

### Modified Capabilities

- `tool-shell`: 导航工具清单新增「数据源」入口（既有的工具可扩展性要求已覆盖此场景，无需求变更，此处仅登记影响）

## Impact

- **新增代码**：`app/datastore/page.tsx`、`components/datastore/*`（连接管理、ES 与 Mongo 各自的目录浏览与查询台、共享结果展示）、`lib/datastore/*`（types / pool / safety / es / mongo）、`app/api/datastore/*`（connections、test、catalog、query）
- **修改代码**：`components/shell/Navigation.tsx` 追加一条工具注册；`lib/db/index.ts` 新增 `datastore_connections` 表（走既有的 `user_version` 迁移机制）
- **依赖**：新增 `mongodb`（官方驱动，Mongo 为二进制协议无法用 fetch）；ES 侧零新增依赖
- **样式**：`app/globals.css` 追加 `ds-` 前缀样式，沿用暗色设计系统
- **测试**：`lib/datastore/safety.test.ts`（操作分类）、`lib/datastore/es.test.ts`（DSL 校验与响应解析）、`lib/datastore/mongo.test.ts`（查询构造与字段推断），均为不依赖真实服务的纯函数测试
- **数据库**：`app.db` 新增一张表，不改动任何既有表
- **风险**：连接密码与连接串明文存于 `app.db`（与 `redis_connections` 现状一致，本地自用工具的既有取舍）
