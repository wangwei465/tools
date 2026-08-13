## 1. 数据层与建表（lib/db）

- [x] 1.1 在 `lib/db` 增加 `api_nodes` 建表：`id, parent_id, type(folder|request), name, sort_order, definition(JSON), created_at, updated_at`，`CREATE TABLE IF NOT EXISTS`（幂等）
- [x] 1.2 在 `lib/db` 增加 `api_history` 建表：`id, node_id?, snapshot(JSON), status, time_ms, size, created_at`
- [x] 1.3 封装节点数据访问：读取整树、创建、重命名、更新 `definition`、级联删除子树、移动/排序（`parent_id`+`sort_order`）
- [x] 1.4 封装历史数据访问：追加、倒序列表、删除单条、清空

## 2. 集合树后端 API（/api/collections）

- [x] 2.1 `GET`：返回整棵 `api_nodes`（邻接表 → 前端可用的父子结构）
- [x] 2.2 `POST`：新建 `folder`/`request` 节点（`parent_id`、`name`、末尾 `sort_order`、初始 `definition`）
- [x] 2.3 `PATCH`：重命名与更新 `definition`（保存接口复用）
- [x] 2.4 `PATCH`：移动与排序（改 `parent_id`/`sort_order`）
- [x] 2.5 `DELETE`：删除节点，`folder` 级联删除整棵子树

## 3. 历史后端 API（/api/history）

- [x] 3.1 `GET`：按 `created_at` 倒序返回历史列表
- [x] 3.2 `POST`：追加一条历史（发送后调用）
- [x] 3.3 `DELETE`：删除单条 / 清空

## 4. 状态模型扩展（useReducer）

- [x] 4.1 扩展类型：`Tab` 增 `nodeId?`；`AppState` 增 `tree`、`history`；新增 actions（`LOAD_TREE`/`LOAD_HISTORY`/`UPSERT_NODE`/`REMOVE_NODE`/`MOVE_NODE`/`SET_TAB_NODE` 等）
- [x] 4.2 工具页挂载时从 `/api/collections` 与 `/api/history` 拉取进 reducer
- [x] 4.3 dirty 判定改为「当前 `RequestDraft` 相对关联节点 `definition`（未关联则初始态）的差异」

## 5. 集合树 UI（api-collection-tree）

- [x] 5.1 侧边栏集合树面板：层级展示、`folder` 展开/折叠、`folder`/`request` 图标区分
- [x] 5.2 新建 `folder`/`request`（按钮/右键 → `POST` → 乐观更新）
- [x] 5.3 重命名（内联编辑 → `PATCH`）
- [x] 5.4 删除（确认 → `DELETE`；`folder` 级联；提示解除受影响 tab 的关联）
- [x] 5.5 拖拽移动到 `folder` / 同级重排（自研 HTML5 DnD → `PATCH` 移动）
- [x] 5.6 变更后刷新树保持一致（验证后端持久化）

## 6. 保存 / 打开接口（api-saved-requests）

- [x] 6.1 保存：未关联 tab → 保存对话框（选 `folder` + 命名）→ 创建节点并关联；已关联 → 覆盖 `definition`
- [x] 6.2 另存为：创建新 `request` 节点并将当前 tab 关联切换过去
- [x] 6.3 打开：双击 `request` 节点 → 还原 `definition` 到新 tab 并关联；已打开则激活已有 tab
- [x] 6.4 dirty 标记随保存清除，与关联节点内容一致（接 4.3）

## 7. 请求历史（api-request-history）

- [x] 7.1 发送流程接入：请求完成（成功/错误）后 `POST` 落历史（`snapshot`=请求定义，`status`/`time_ms`/`size`，来源节点则带 `node_id`）
- [x] 7.2 历史面板：倒序列表 + 条目的请求/结果摘要
- [x] 7.3 重放：某条历史 → 以其 `snapshot` 新建/载入 tab
- [x] 7.4 删除单条 / 清空历史

## 8. tab 会话持久化（api-tab-persistence）

- [x] 8.1 会话写 localStorage：`tabs`（草稿/dirty/`nodeId`）+ `activeTabId`；草稿**排除 form-data 文件**；变更防抖落盘
- [x] 8.2 挂载时从 localStorage 恢复 tab 会话（草稿、激活项），未命名草稿一并恢复且保持未关联
- [x] 8.3 恢复边界：**不恢复上次响应**（响应区空）、**文件字段需重选**（不持久化）

## 9. 验证

- [x] 9.1 `tsc --noEmit` 通过
- [x] 9.2 dev 冒烟：建/改/删/拖拽节点并刷新保持；保存/另存/打开还原/dirty；发送落历史/回看/重放/清空
- [x] 9.3 会话：多 tab + 未命名草稿刷新恢复；响应不恢复、文件需重选；① 既有内存态行为（发送/取消/多 tab/URL⇄params）不回归
