## Why

现有比对工具里的接口请求能力是「比对特供」——`add-api-fetch-to-compare` 明确将 POST/请求体、接口集合、多环境列为 Non-Goals，只支持 GET、只接受 JSON 响应、请求区嵌在编辑器上方。日常接口调试需要的是一个**独立、完整**的工具：任意方法、各类 Body、完整响应查看、可组织与复用。本 change 把它作为独立新工具从零长出。

> 这是「接口调试」工具四层规划的第 ① 层（core）。整体四层路线（①core ②collections ③environments ④import/codegen）与共享架构见 `design.md`。

## What Changes

- 新增独立工具页 `/api-client`（Apifox 式接口调试），加入 `TOOLS` 导航注册表；与现有 `compare` 互不干扰，旧 `/api/proxy` 原样保留不动。
- **请求工作台**：HTTP 方法（GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS）+ URL + Params（与 URL 双向同步）+ Headers + Body（none / raw-JSON / form-data / x-www-form-urlencoded）+ Auth（none / bearer / basic / apikey）。
- **多 tab**：可同时打开多个「未命名请求」，各自独立请求+响应状态，切换保留结果；本期为**内存态**（不持久化）。
- **完整响应展示**：状态码 / 耗时 / 大小 / Body（按 content-type 分流）/ Headers / Cookies；**非 2xx 也照常展示 body**（调试要看 4xx/5xx）。
- 新增**通用后端代理** `POST /api/request`：统一 JSON 信封入参，按 bodyType 重组后透传任意方法与 body（form-data 文件走 base64）；返回完整响应元信息。**与旧 proxy 的根本区别：不做 JSON.parse 校验、非 2xx 不判失败。**
- form-data 文件本期**不持久化**（内存态，重开需现选）。
- 本期为纯前端内存态，**不引入数据库改动**（集合/历史/环境从后续 change 起建）。

## Capabilities

### New Capabilities
- `api-client-workbench`：独立工具页与多 tab 工作台——三区布局（请求行 / 参数页签 / 响应区）、tab 增删切换、dirty 标记、发送与取消。
- `api-request-builder`：请求构造——HTTP 方法、URL ⇄ Query params 双向同步、Headers、Body（none/raw-JSON/form-data/urlencoded）、Auth（none/bearer/basic/apikey）。
- `api-response-viewer`：响应展示——状态码/耗时/大小、Body 按 content-type 分流、Headers、Cookies；非 2xx 也展示。
- `api-request-proxy`：通用后端代理——统一 JSON 信封入参、按 bodyType 重组、透传任意方法/body、返回完整响应元信息、支持超时与取消、响应大小上限。

### Modified Capabilities
<!-- 无：新工具独立，不修改现有比对相关能力；旧 /api/proxy 保留不动，故无 delta。 -->

## Impact

- **新增前端**：`app/api-client/page.tsx` + 工作台组件（tab 栏、请求行、参数页签 Params/Headers/Body/Auth、响应区）；`components/shell/Navigation.tsx` 的 `TOOLS` 追加一项。
- **新增后端**：`app/api/request/route.ts`（通用代理）。
- **状态管理**：顶层 `useReducer`，零新依赖（action 以 tabId 寻址）。
- **复用**：CodeMirror（Body 编辑 + 响应美化只读）、暗色设计系统、`TOOLS` 注册表。
- **不改动**：旧 `/api/proxy`、compare 相关代码、`lib/db`（本期无持久化）。
- **安全边界**：通用代理可对任意 URL 发任意方法（SSRF 面比旧「仅 GET」代理更大），本地个人自用可控；缓解措施详见 `design.md` 的 Risks。
