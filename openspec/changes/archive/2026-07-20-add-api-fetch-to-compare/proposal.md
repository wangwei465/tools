## Why

现有数据比对工具只能手动粘贴两段 JSON 再比对。日常最高频的场景其实是"比对两个接口的返回值"——手动粘贴需要先在别处发请求、复制、再贴进来，繁琐且容易漏带参数。原设计已为"后端代理拉取接口"预留了架构位（`app/api/proxy` 占位返回 501），现在把它正式落地：直接在工具里填接口地址请求数据并回填比对，同时统一管理令牌、沉淀常用接口地址。

## What Changes

- 左右两侧编辑器上方各新增一个**请求区**：请求地址输入框 + 普通 Header 配置 + "请求并回填"按钮，请求成功后将响应 JSON 格式化写入对应编辑器并自动触发现有 hash/diff 比对。
- 第一版请求方法仅支持 **GET**。
- 新增**统一令牌设置**：可配置 Header 名、Prefix、Token（默认 `Authorization: Bearer <token>`）。所有接口请求默认从这里取令牌，单侧同名 Header 覆盖全局。
- 后端 `POST /api/proxy` 由占位实现改为**真实代理**：服务端合并统一令牌与单侧 Header 后请求目标接口，规避 CORS 并避免令牌暴露在前端。
- 新增 **SQLite 持久化**：记录成功请求过的地址（URL、方法、普通 Headers、使用次数、最近使用时间），并存储统一令牌配置。
- URL 输入框支持**下拉筛选**历史地址，选中后回填 URL 与普通 Headers（不回填令牌）。

## Capabilities

### New Capabilities
- `api-fetch`: 在比对工具内通过接口请求获取 JSON 并回填到左右编辑器——左右独立请求、GET、普通 Header、后端代理、响应 JSON 校验与回填触发比对。
- `request-auth`: 统一令牌配置——集中设置 Header 名/Prefix/Token，所有请求默认携带，单侧 Header 可覆盖，持久化到 SQLite。
- `request-history`: 请求地址历史记录——成功请求写入/更新记录，支持按 URL/名称下拉筛选并复用地址与普通 Header，使用 SQLite 存储。

### Modified Capabilities
<!-- data-compare 尚未归档为正式 spec，且比对核心行为（模式切换、hash、diff）本身不变；新增行为均归入上述新能力，不产生 delta。 -->

## Impact

- **新增依赖**：SQLite 访问方案（如 `better-sqlite3`，同步 API，适合本地工具场景）。
- **后端**：`app/api/proxy/route.ts` 由 501 占位改为真实 GET 代理；新增 `app/api/settings/token`、`app/api/request-records` 路由。
- **数据层**：新增 `lib/db/` 承载 SQLite 连接、建表（`app_settings`、`request_records`）与读写。数据库文件落在项目本地（需加入 `.gitignore`）。
- **前端**：`app/compare/page.tsx` 布局新增左右请求区与统一令牌设置入口；新增请求区、令牌设置、URL 历史下拉等组件；复用现有 `useCompare` 回填链路。
- **安全边界**：令牌仅在服务端注入请求、不落前端；令牌明文存 SQLite 属本地个人工具可接受范围；代理仅允许 GET，响应非 JSON 时返回明确错误。
