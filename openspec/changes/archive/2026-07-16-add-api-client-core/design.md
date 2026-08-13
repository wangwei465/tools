## Context

### 现状
数据比对工具（`compare-tool`）已交付；`add-api-fetch-to-compare` 为其加了「填 URL 拉取 JSON 回填比对」的能力，但**刻意收窄**：仅 GET、仅接受 JSON 响应、请求区嵌在编辑器上方（POST/请求体、集合、环境均列为 Non-Goals）。旧 `POST /api/proxy` 服务于该场景。

本 change 不复用、不改造上述「比对特供」链路，而是从零长出一个**独立的「接口调试」工具**（Apifox 式），并作为一套四层规划的**地基（core）**。

### 整体愿景与四层路线图（纲领）
「接口调试」工具规划为四层、串行依赖的多个 change，本 change 为第 ① 层。后续 change 均以本文的架构与数据模型为纲领。

```
① api-client-core     请求-响应调试闭环 + 多 tab + form-data + 通用代理   ← 本 change
② api-collections     集合目录树 + 保存/打开接口 + 历史 + tab 持久化       依赖 ①
③ api-environments    环境切换 + {{变量}}替换引擎                          依赖 ②
④a import/codegen     单条 cURL 导入 + 代码生成（仅依赖 ①，可紧邻 ①）
④b batch-import       OpenAPI / Postman 批量导入（依赖 ②）
⑤ （不做）            前后置脚本 / 断言 / Mock / 自动化流程
```

### 架构脊梁：请求组装管线
所有层共享一条「请求组装管线」，把 tab 内的请求草稿转成实际发出的 payload。各层像插件挂在管线上叠加：

```
RequestDraft
  → 1. 变量替换 {{var}}→值        （③ 插入此段；①② 无此段）
  → 2. Auth 注入 → header / query  （①）
  → 3. Query 合并 params[] → URL   （①）
  → 4. Body 序列化 → wire body     （①）
  → wire { method, url, headers, bodyType, body } → POST /api/request
```

推论（决定了各层能干净叠加）：
- ③ 只需在管线**最前面**插入「变量替换」段，对已有逻辑零改动。
- ④ 的**代码生成 = 管线的旁路输出终端**（组装后不发代理，序列化成 curl/fetch 字符串）；**cURL 导入 = 管线的逆运算**（解析 curl → 反推 RequestDraft）。

### 数据模型（纲领；② 起建，① 不碰 DB）
延续 `lib/db`（better-sqlite3）的键值/表风格：

```
api_nodes        id, parent_id(邻接表), type(folder|request), name,
                 sort_order, definition(请求定义 JSON blob), timestamps   ← ②
api_environments id, name, is_active                                       ← ③
api_variables    id, env_id(null=全局), key, value, enabled                ← ③
api_history      id, node_id?, snapshot(JSON), status, time_ms, size, created_at  ← ②
```
- 树用**邻接表**（本地工具树不深，递归查询无压力，比闭包表简单）。
- 请求定义整体存 **JSON blob**（富嵌套文档，查询维度只有树 + 名称）。
- 变量作用域仅**环境级 + 全局级**（集合级后置）；优先级 环境 > 全局。

### 约束
Next.js App Router；沿用 better-sqlite3（② 起）、CodeMirror、暗色设计系统、`TOOLS` 导航注册表；能不加依赖就不加（状态用 `useReducer`）。旧 `/api/proxy` 与 compare 代码不动。

## Goals / Non-Goals

**Goals（本 change ①）:**
- 独立工具页 `/api-client` + 多 tab **内存态**工作台（三区：请求行 / 参数页签 / 响应区）。
- 全 HTTP 方法；URL ⇄ Query params 双向同步；Headers；Body（none/raw-JSON/form-data/urlencoded）；Auth（none/bearer/basic/apikey）。
- 完整响应展示（状态码/耗时/大小/Body 分流/Headers/Cookies），**非 2xx 也展示 body**。
- 通用后端代理 `POST /api/request`，透传任意方法与 body，返回完整响应元信息，支持超时与取消。

**Non-Goals（留给后续层）:**
- 集合/目录树、保存接口、历史、tab 持久化 → ②（本期纯内存态）。
- 环境、变量替换 → ③。
- cURL 导入、代码生成、OpenAPI/Postman 导入 → ④。
- 前后置脚本、断言、Mock → 不做。
- 二进制响应预览（本期仅提示，不做 hex/图片预览）。

## Decisions

### 独立新工具，不扩展 compare
新建 `/api-client` 独立页，与 compare 互不干扰。*备选*：在 compare 的 `RequestBar` 上扩展——但两者定位冲突（比对 vs 调试），会互相拖累，否决。

### 新建 `/api/request`，不改造 `/api/proxy`
```
旧 /api/proxy（比对特供）          新 /api/request（通用）
method:"GET" 写死            →    透传任意方法
JSON.parse 成功才返回         →    原样返回任意响应体
只回 { body }                →    { status, statusText, headers, body, timeMs, size }
```
*备选*：改造 proxy 兼容两用——返回结构与校验语义冲突，会污染比对场景，否决。旧 proxy 原样保留。

### 代理传输格式：统一 JSON 信封 + 文件 base64
前端一律以 `{ method, url, headers, bodyType, body }` JSON 信封发给代理；代理按 `bodyType` 重组：`raw`→字符串、`urlencoded`→`URLSearchParams`、`form-data`→Node `FormData`（文件从 base64 还原）。*备选*：form-data 走真 multipart——无 base64 膨胀但代理需双入口解析；本地文件不大，选信封更 KISS。

### 代理不做 JSON 校验、非 2xx 不判失败
调试场景 4xx/5xx 的响应体恰恰最需要看；响应类型多样（json/html/text/二进制）。代理原样透传，由前端按 `content-type` 决定展示。这是与旧 proxy 的**根本语义区别**。

### 多 tab 状态：顶层 `useReducer` + tabId 寻址
`AppState { tabs: Tab[], activeTabId }`，每个 `Tab` 含独立 `request` 与 `response`；action 带 `tabId` 定位（如 `PATCH_REQUEST`）。*备选*：zustand 等状态库——本地工具单页面，`useReducer` 足够且零依赖。

### URL ⇄ Query params 同步：URL 为真相源，失焦解析
以 URL 的 query 段为唯一真相源；表格为主要编辑入口（改表格即序列化写回 URL），URL 手输的 query 在**失焦时**解析回填表格。避免每键双向同步造成的更新环与光标跳动。

### 本期内存态，持久化后置
tab、请求、响应、form-data 文件均为内存态，刷新即丢。持久化（集合/历史）从 ② 起。让 ① 更轻、更快落地，且不碰 `lib/db`。

## Risks / Trade-offs

- **通用代理 SSRF 面变大**（可对任意 URL 发任意方法/body，含内网） → 本地个人自用风险可控；缓解：公网部署时加内网地址黑名单 + 沿用超时；文档标注勿在公网明文部署。
- **form-data 文件不持久化**（重开接口需现选） → 已与用户确认可接受；是 Apifox 网页版的常见妥协。
- **文件 base64 膨胀 ~33% + 双跳内存** → 本地文件通常不大，可接受；大文件的流式透传留待后续。
- **多 tab 内存态，刷新丢失** → 属本期有意收窄（Non-Goal），持久化归 ②。
- **二进制/超大响应** → 二进制先给「无法预览」提示、超大按大小上限截断；预览/下载后置。

## Open Questions

- 代理**超时时长**与**响应大小上限**取值待定（建议：超时 60s 或沿用现有可配思路；上限 5MB，实现时定）。
- 响应 `Set-Cookie` 展示：仅键值，还是含到期/域等字段？第一版倾向仅键值。
- API-Key 默认注入位置（header vs query）默认值，实现时定（倾向默认 header）。
