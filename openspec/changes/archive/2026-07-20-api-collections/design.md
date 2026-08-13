## Context

### 现状
①core（`add-api-client-core`，已归档并同步主 spec）交付了纯内存态的接口调试工作台：顶层 `useReducer`（`AppState { tabs, activeTabId }`）、请求组装管线、通用代理 `POST /api/request`。tab / 请求 / 响应刷新即丢，接口不可保存，历史不可回看。

### 纲领与本层定位
本 change 为四层路线图第 ② 层（collections），依赖 ①，为工具补持久化地基。整体路线（①core ②collections ③environments ④import/codegen）、请求组装管线与数据模型见已归档的 `add-api-client-core/design.md`。② **起建 DB**（① 不碰 `lib/db`）。

### 约束
Next.js App Router；沿用 better-sqlite3（`lib/db`）、CodeMirror、暗色设计系统、`TOOLS` 导航；能不加依赖就不加（拖拽优先自研 HTML5 DnD，状态延用 `useReducer`）。旧 `/api/proxy` 与 compare 不动；① 既有 workbench/builder/proxy/viewer 需求叠加式扩展，不改其 SHALL。

## Goals / Non-Goals

**Goals（本 change ②）:**
- `api_nodes` 邻接表集合树：`folder`/`request` 节点的 CRUD、重命名、移动 / 排序，持久化。
- 保存 / 打开接口：`RequestDraft` ⇄ `request` 节点 `definition`(JSON blob) 的存取与 tab 还原、另存、dirty。
- 请求历史：`api_history` 落发送快照，回看与重放。
- tab 会话持久化：打开 tab / 激活项 / 各 tab 草稿刷新恢复。
- 持久化后端：节点 / 历史的 REST API + `lib/db` 建表。

**Non-Goals:**
- 环境 / 变量替换 → ③；cURL 导入 / 代码生成 → ④a；OpenAPI / Postman 批量导入 → ④b。
- 集合级变量作用域（design.md 已后置）。
- 响应体持久化、form-data 文件持久化（沿用①内存态）。
- 多用户 / 协作 / 跨设备同步。

## Decisions

### 树结构：邻接表（`parent_id`）而非闭包表
沿用纲领：`api_nodes(parent_id)` 邻接表 + 递归读取整棵树。*备选*：闭包表 / 物化路径——本地工具树浅、节点少，递归查询无压力，闭包表是过度设计，否决。

### 请求定义存 JSON blob 而非规范化列
`request` 节点的完整 `RequestDraft`（method/url/params/headers/body/auth）整体存 `definition` JSON blob；`api_history.snapshot` 同理。*备选*：拆成规范化子表——查询维度只有「树 + 名称」，无按请求内部字段检索的需求，拆列徒增复杂度与 join，否决。

### 移动 / 排序：`parent_id` + 整数 `sort_order`
移动 = 改 `parent_id`；重排 = 重写同级 `sort_order`（稀疏步长，必要时整层重排）。*备选*：分数 / 链表排序——整数重排对小规模同级列表足够简单，KISS。

### 后端形态：REST 路由，与现有 `/api/*` 一致
```
app/api/collections   节点树读取 + 节点 CRUD / 移动
app/api/history       历史读取 / 追加 / 删除
```
`lib/db` 首次访问按需建表（`CREATE TABLE IF NOT EXISTS`，幂等）。*备选*：单一 RPC 端点——REST 资源化更清晰，且与 ① 的 `/api/request`、旧 `/api/proxy` 风格一致。

### tab 会话存 localStorage，集合 / 历史存 SQLite
tab 会话（打开 tab、激活项、草稿、dirty、关联 `nodeId`）属**单机易失的工作现场**，用 localStorage 持久化：零后端、刷新恢复快、天然单机。集合与历史是**长期资产**，进 SQLite。*备选*：会话也建 `api_sessions` 表——增后端与表，而会话本就单机易失，localStorage 足够；纲领数据模型亦未列 session 表。草稿入 localStorage 时**排除 form-data 文件**（沿用①内存态）。

### tab ⇄ 节点关联与 dirty
`Tab` 增 `nodeId?` 字段：打开节点即关联，保存写回 `definition` 并清 dirty。dirty = 当前 `RequestDraft` 与关联节点 `definition`（未关联则与初始态）的差异。*备选*：无 nodeId、每次都另存新节点——无法表达「覆盖保存」，否决。

### 历史 `snapshot` 只存请求、不存响应体
`api_history` 记 `snapshot`(请求定义) + `status`/`time_ms`/`size`(结果元信息)；响应大 body **不入库**（避免膨胀），重放靠重发。*备选*：连响应体一并存——可离线查看响应，但 body 体积不可控且与「重放」定位重叠，第一版否决，留待需要时加。

### 状态来源：服务端加载 + 本地编辑
集合树与历史在工具页挂载时从 API 拉取进 `useReducer`；编辑走「乐观更新 + 落库」。tab 会话从 localStorage 恢复。*备选*：SWR / React Query——单页面手动 fetch + reducer 足够，不引依赖。

## Risks / Trade-offs

- **邻接表递归随树深加深** → 本地工具树浅、节点少，单次全量读取可控；必要时限制层级。
- **JSON blob 不可按内部字段查询** → 查询维度仅树 + 名称，无此需求；后续若需检索再建索引列。
- **localStorage 会话跨设备不同步、容量 ~5MB** → 单机自用可接受；超大草稿罕见，超限时降级为仅存 tab 元信息。
- **历史无限增长** → 提供清空 / 删除；可选保留上限（见 Open Questions）。
- **删除 folder 级联影响打开的 tab** → 删除时解除相关 tab 的 `nodeId` 关联并提示，tab 内容保留为未命名草稿。
- **多标签页并发写同库** → 本地单用户少见；后写覆盖可接受，不做乐观锁。
- **持久化引入 DB 依赖** → ① 无 DB，② 建表幂等且向后兼容（空库 = 空树），回滚删表不影响 ①。

## Migration Plan

- **建表**：首次访问工具页 / API 时 `CREATE TABLE IF NOT EXISTS api_nodes / api_history`（沿用 `lib/db` 初始化风格），幂等无损。
- **向后兼容**：① 用户升级后空库即空集合树与空历史，既有内存态行为不变。
- **回滚**：移除 ② 前端入口与 API、`DROP` 两表即可，① 功能不受影响（① 不依赖持久化）。

## Open Questions

- 历史保留策略：默认不限并提供手动清空，还是设默认上限（如最近 500 条）？倾向前者，实现时定。
- 拖拽实现：自研 HTML5 DnD vs 轻量库——倾向自研以维持零新依赖，交互复杂度过高时再评估。
- 「未命名草稿」数量上限与 localStorage 体积上限的降级策略细节，实现时定。
