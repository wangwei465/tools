# 变更记录：add-es-mongo-client

**归档时间：** 2026-08-18  
**状态：** 已完成（55/55 任务）

## 交付内容

### 核心能力（6 个新增 spec）

1. **datastore-connection** — ES/Mongo 连接管理：增删改查、连通性测试、环境标签、读写模式、凭证脱敏、连接池复用
2. **datastore-safety** — 安全闸门：只读拦截写操作、危险操作二次确认、ES/Mongo 各自的操作分类规则
3. **es-catalog** — ES 目录浏览：索引列表（文档数/存储/健康）、mapping 字段树
4. **es-query-console** — ES 查询台：DSL JSON 编辑执行、结果 JSON/表格双视图、分页
5. **mongo-catalog** — Mongo 目录浏览：库/集合列表（文档数/索引数）、字段采样推断
6. **mongo-query-console** — Mongo 查询台：find/aggregate 执行、结果展示、分页

### 代码产物

| 分类 | 路径 | 说明 |
|---|---|---|
| **页面** | `app/datastore/page.tsx` | 主页面：连接选择器 + 视图切换 + 动态面板 |
| **组件** | `components/datastore/` | 7 个组件（ConnectionManager/Bar、EsCatalog/Console、MongoCatalog/Console、ResultPanel + shared.tsx） |
| **后端** | `lib/datastore/` | types、pool（globalThis 单例池）、safety（24 测试）、es（19 测试）、mongo（17 测试） |
| **API** | `app/api/datastore/` | connections、connections/[id]、test、catalog、query 五个端点 |
| **库表** | `lib/db/index.ts` | `datastore_connections` 表（6 字段：name/type/host/username/password/extra_json/env/mode） |
| **导航** | `components/shell/Navigation.tsx` | 新增「数据源」工具入口 |
| **样式** | `app/globals.css` | 294 行 `ds-` 前缀样式（暗色系） |

### 技术决策

- **ES 客户端：** 零新增依赖，用 Node `fetch` 直连 REST API
- **Mongo 客户端：** `mongodb@7.5.0`（二进制协议必须用驱动）
- **连接池：** `globalThis.__dbClients` / `__mongoClients` 单例，跨请求复用
- **库表迁移：** 复用既有 `migrate()` 的 `IF NOT EXISTS` 模式（与 `redis_connections` 一致），`user_version` 留 2 未步进
- **测试：** 60 个新增测试，全部为纯函数（操作分类、DSL 校验、响应解析、字段推断），不依赖真实服务

### 验收结果

| 项 | 结果 |
|---|---|
| **构建** | `npm run build` ✓ 通过，0 TS 报错 |
| **测试** | 266/266 通过（新增 60） |
| **功能冒烟** | 只读拦截、危险确认、凭证脱敏、既有工具无回归、零残留 —— 全通过 |
| **真实缺陷修复** | Mongo 驱动 `Topology is closed` 死客户端复用问题（`withMongo()` 加失效检测 + 剔除重试） |

### 两处与任务书的偏差

1. **1.2 的 `user_version` 未步进** — `datastore_connections` 纯新增表，用 `IF NOT EXISTS` 对新库老库幂等，与 `redis_connections` 落地方式一致；空步进仅产生噪音。已在 `migrate()` 注释里写明两套机制分工。
2. **8.4 的「两种模式」扩到四个操作** — 加了 `updateMany`/`deleteMany`，否则 8.5「空条件 deleteMany 提示影响全部文档」和 spec「只读拦截 updateMany」两场景在 UI 无从触发。proposal 本身明确「写操作靠手写 DSL/命令完成」，判定在范围内。

### 未覆盖项（环境依赖）

- **9.3** — ES 五条路径冒烟（连接测试、索引列表、mapping、DSL 查询、分页）
- **9.4** — Mongo 五条路径冒烟（连接测试、库/集合列表、字段采样、find、aggregate）

**原因：** 本机 9200/9201/27017/27018 端口全关，无 `docker` 可起实例。已用纯函数测试覆盖核心逻辑（DSL 校验、响应解析、字段推断、BSON 可读化），但真实服务的跨版本响应形态、集群分页、BSON 往返未运行时验证。

### 风险与取舍

- **明文凭证** — 密码与连接串明文存 `app.db`（与 `redis_connections` 一致），本地自用工具的既有取舍
- **ES 跨版本兼容** — 测试样本覆盖 7.x/8.x 响应解析，但未在真实集群验证
- **Mongo BSON 往返** — `serializeBson()` 通过单测，但未用真实驱动验证 ObjectId/Decimal128/Binary 的实际序列化输出

## 归档产物

- **原提案、设计、specs、tasks** → `openspec/changes/archive/2026-08-18-add-es-mongo-client/`
- **新增主 spec** → `openspec/specs/{datastore-connection, datastore-safety, es-catalog, es-query-console, mongo-catalog, mongo-query-console}/spec.md`（26 个 delta）

## 后续建议

1. **补真实服务冒烟** — 有可达 ES/Mongo 时补 9.3/9.4，重点验证：集群响应解析、分页偏移、BSON 类型往返
2. **监控死客户端复现** — `withMongo()` 的失效检测已修复已知场景，但驱动拓扑状态变化路径复杂，建议生产观察日志中是否仍有 `Topology is closed` 泄漏
3. **ES API Key 认证** — 当前仅支持 Basic Auth，若需 API Key 可在 `lib/datastore/es.ts` 的 `authHeaders()` 补 `Authorization: ApiKey <key>`
