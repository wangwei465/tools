## Why

现有「接口调试」工具（①core）为纯内存态：tab、请求、响应刷新即丢，接口无法保存复用，发送历史不可回看。日常调试需要把接口**组织成集合、保存复用、留存历史**，并在刷新后恢复工作现场。本 change 为四层规划的第 ② 层，给工具补上持久化地基。

> 「接口调试」四层规划的第 ② 层（collections）。整体路线（①core ②collections ③environments ④import/codegen）与共享架构、数据模型见已归档的 `add-api-client-core` 的 `design.md`。

## What Changes

- 新增**集合目录树**：侧边栏以 `api_nodes` 邻接表组织 `folder`/`request` 节点，支持新建 / 重命名 / 删除 / 移动与排序。
- 新增**保存 / 打开接口**：把当前 tab 的 `RequestDraft` 存为 `request` 节点（`definition` JSON blob）；从节点打开还原到 tab。
- 新增**请求历史**：每次发送落一条 `api_history` 快照（状态 / 耗时 / 大小），可回看与重放到 tab。
- 新增 **tab 会话持久化**：打开的 tab、激活项、各 tab 请求草稿与 dirty 状态持久化，刷新后恢复（①的内存态由本层补齐）。
- 新增**持久化后端**：`lib/db`（better-sqlite3）起建 `api_nodes`、`api_history` 表，并提供节点 / 历史 / 会话的读写 API。
- **不改动**：旧 `/api/proxy`、compare；① 的既有 workbench/builder/proxy/viewer 需求原样成立，本层仅**叠加**持久化。

## Capabilities

### New Capabilities
- `api-collection-tree`：集合目录树——`api_nodes` 邻接表的 `folder`/`request` 节点组织与 CRUD、重命名、移动 / 排序。
- `api-saved-requests`：保存 / 打开接口——当前请求 ⇄ `request` 节点 `definition` 的存取与 tab 还原、dirty 与另存。
- `api-request-history`：请求历史——发送后落 `api_history` 快照、列表回看、重放到 tab。
- `api-tab-persistence`：tab 会话持久化——打开 tab、激活项、请求草稿与 dirty 的持久化与刷新恢复。

### Modified Capabilities
<!-- 无：本层为叠加式持久化，① 的既有能力需求不变（workbench 的多 tab / dirty / 发送取消等 SHALL 原样成立，仅新增会话持久化叠加），故无 delta。 -->

## Impact

- **新增数据层**：`lib/db` 起建表 `api_nodes`(id, parent_id 邻接, type, name, sort_order, definition JSON, timestamps)、`api_history`(id, node_id?, snapshot JSON, status, time_ms, size, created_at)；沿用现有 db 初始化风格按需建表。
- **新增后端**：节点 CRUD、历史读写、会话读写的 API 路由（如 `app/api/collections`、`app/api/history`、`app/api/session`）。
- **前端**：新增侧边栏集合树面板、保存对话框、历史面板；工作台接入「保存 / 打开 / 落历史 / 会话恢复」。
- **状态**：① 的顶层 `useReducer` 扩展集合树与会话来源，从纯内存态切为「服务端加载 + 本地编辑」。
- **复用**：`lib/db`、暗色设计系统、CodeMirror、`TOOLS` 导航、① 的 `RequestDraft` 与请求组装管线模型。
- **不改动**：旧 `/api/proxy`、compare、① 既有 workbench/builder/proxy/viewer 的 spec 需求。
- **约束**：`definition`/`snapshot` 以 JSON blob 存储（查询维度仅树 + 名称）；树用邻接表递归查询（本地工具树浅，无压力）。
