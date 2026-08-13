## Why

「接口调试」工具（②后）已能保存与组织接口，但每个请求的 host、token、密钥都写死在请求里——切换「本地 / 测试 / 生产」需逐个手改，极易出错且无法复用。日常调试需要**多环境切换 + `{{变量}}` 替换**：一处定义、随环境切换自动代入。本 change 为四层规划的第 ③ 层。

> 「接口调试」四层规划的第 ③ 层（environments）。整体路线（①core ②collections ③environments ④import/codegen）、请求组装管线与数据模型见已归档的 `add-api-client-core/design.md`——③ 只需在组装管线**最前**插入变量替换段，对 ①/② 逻辑零改动。

## What Changes

- 新增**环境管理**：创建 / 重命名 / 删除环境（`api_environments`），并以「激活环境」切换当前生效环境（含「无环境」= 仅全局）。
- 新增**变量管理**：环境级与全局级变量（`api_variables`，`env_id=null` 为全局），支持 key/value 增删改与单条启用 / 禁用。
- 新增 **`{{变量}}` 替换引擎**：在请求组装管线**最前段**，把 `RequestDraft` 各字段中的 `{{key}}` 替换为解析值，再进入 ① 的 Auth / Query / Body 组装。
- 变量解析遵循**「激活环境 > 全局」优先级**，仅启用（enabled）的变量参与；未定义变量**保留原样并提示**，不阻断发送。
- 新增**替换后预览**：发送前可查看变量代入后的实际请求。
- **不改动**：① 的 Auth / Query / Body 组装逻辑（替换段纯叠加在最前）；②的集合 / 历史 / 会话；旧 `/api/proxy`、compare。

## Capabilities

### New Capabilities
- `api-environment-management`：环境管理——`api_environments` 的创建 / 重命名 / 删除与单激活切换（`is_active`），激活态持久化。
- `api-variable-management`：变量管理——`api_variables` 的环境级 / 全局级 CRUD、启用 / 禁用、编辑面板与持久化。
- `api-variable-substitution`：变量替换引擎——组装管线最前段的 `{{key}}` 替换、「环境 > 全局」优先级、未定义原样 + 提示、替换后预览。

### Modified Capabilities
<!-- 无：变量替换作为管线最前段插入，① 的 Auth/Query/Body 组装与 ② 的持久化能力需求不变，故无 delta。 -->

## Impact

- **新增数据层**：`lib/db` 起建表 `api_environments`(id, name, is_active)、`api_variables`(id, env_id nullable, key, value, enabled)；`CREATE TABLE IF NOT EXISTS`（幂等）。
- **新增后端**：`app/api/environments`、`app/api/variables` 的读写 API。
- **前端**：环境切换器 + 变量编辑面板（环境级 / 全局级分组）；组装管线最前插入替换段；发送前预览。
- **状态**：`AppState` 增 `environments`/`variables`/`activeEnvId`，挂载拉取并恢复激活环境。
- **复用**：`lib/db`、① 的 `RequestDraft` 与组装管线、暗色设计系统、CodeMirror。
- **不改动**：① 的组装子逻辑、② 的集合 / 历史 / 会话、旧 `/api/proxy`、compare。
- **约束**：变量作用域仅环境级 + 全局级（集合级后置）；替换在前端完成后再发信封给 `/api/request`（代理不感知变量）。
