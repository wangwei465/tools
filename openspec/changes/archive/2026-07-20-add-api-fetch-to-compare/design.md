## Context

数据比对工具（`compare-tool` 变更）已交付：左右 CodeMirror 编辑器、JSON/字符串双模式、规范化、SHA-256 hash、字段级 diff（扁平/树形）。核心比对链路是 `useCompare` hook：`setLeftText/setRightText → parse → canonicalize → hash → diff`。

原设计明确将两件事列为 Non-Goals：**通过 URL 拉取接口的代理**（仅在 `app/api/proxy/route.ts` 留了返回 501 的占位）与**数据持久化/历史记录**。本次变更正是把这两块正式落地，并叠加"统一令牌配置"。

已与用户确认的 5 个边界决策：

1. 请求方法第一版仅支持 GET。
2. 令牌持久化到 SQLite（定位为本地个人工具，明文可接受）。
3. 统一令牌默认 `Authorization: Bearer <token>`，但 Header 名与 Prefix 可改。
4. 历史记录保存普通 Headers，但不保存统一令牌。
5. 历史地址通过 URL 输入框下拉筛选复用，不做独立侧边栏。

## Goals / Non-Goals

**Goals:**
- 左右两侧各自通过 GET 接口请求 JSON，响应格式化后回填对应编辑器并自动触发现有比对。
- 提供统一令牌配置（Header 名 / Prefix / Token），所有请求默认携带，单侧 Header 可覆盖。
- 后端代理请求外部接口，规避 CORS、令牌不暴露到前端。
- 用 SQLite 持久化统一令牌配置与请求历史（URL、方法、普通 Headers、使用次数、最近使用时间）。
- URL 输入框下拉筛选历史地址，选中回填 URL 与普通 Headers（不含令牌）。

**Non-Goals:**
- 不支持 POST / 请求体编辑（后续可扩展）。
- 不做多环境管理、接口分组/集合、响应缓存、批量请求。
- 不做令牌加密存储（本地个人工具，明文可接受）。
- 不处理非 JSON 响应的回填——非 JSON 一律返回明确错误。
- 不改变现有比对核心行为（模式切换、规范化、hash、diff）。

## Decisions

### SQLite 访问：`better-sqlite3`
选同步 API 的 `better-sqlite3` 而非 `sqlite3`（回调）或 ORM（Prisma/Drizzle）。理由：本地个人工具、单进程、数据量极小，同步 API 让 API route 里的读写代码最直白（无需 async 包裹事务），零 ORM 依赖符合 KISS/YAGNI。数据库文件放 `data/app.db`，加入 `.gitignore`。首次访问时惰性建表（`CREATE TABLE IF NOT EXISTS`），无需独立迁移工具。

*备选*：Prisma——类型安全但引入 schema/生成步骤，对两张表属过度设计；`node:sqlite`——Node 实验特性，版本不稳，暂不依赖。

### 令牌注入放在服务端，不在前端
统一令牌由后端 `/api/proxy` 从 SQLite 读取后注入目标请求，前端**不接触**令牌值。这样令牌不进入浏览器网络面板 / 前端内存，也天然规避 CORS。前端只发 `{ url, headers }`（普通 Header）到代理，令牌由服务端补齐。

*备选*：前端读令牌直接 `fetch` 外部接口——会暴露令牌且受 CORS 限制，否决。

### Header 合并规则：单侧覆盖全局
最终 Header = `统一令牌 Header` 叠加 `单侧普通 Header`，同名时**单侧覆盖全局**。理由：调试时临时改某个 Header（含临时换令牌 Header）更灵活，符合"局部优先"直觉。合并在服务端完成。

### 请求区仅在 JSON 模式可用
回填目标是 JSON 编辑器且响应要求为合法 JSON，故请求区绑定 JSON 模式；字符串模式下隐藏/禁用请求区。与现有"字符串模式禁用 JSON 专属功能"的约定一致。

### 响应必须是合法 JSON 才回填
代理拿到响应后尝试 `JSON.parse`，失败则返回 `ok:false` 且不回填、不写历史。理由：需求是"回填到 JSON 框"，非 JSON 回填只会污染编辑器并触发比对报错。保持第一版聚焦，符合 KISS。

### 历史记录以 URL 为去重键，upsert 累加
`request_records` 以 `url`（同 method）唯一，成功请求时 upsert：存在则 `use_count + 1` 并更新 `last_used_at` 与 `headers_json`，否则插入。下拉按 `keyword` 匹配 URL/name，按 `last_used_at` 倒序返回。令牌不落该表。

### 统一令牌用 key-value 单行存储
`app_settings` 表 `(key, value, updated_at)`，令牌配置以 `key='global_token_config'`、`value` 为 JSON 字符串存单行。理由：设置项天然是键值，未来加别的全局设置无需改表结构，符合开闭。

### 前端复用现有回填链路
请求成功后调用现有 `setLeftText/setRightText` 写入格式化 JSON，`useCompare` 的 `useEffect` 自动重算 hash/diff。不新建比对通路，最大化复用已验证逻辑。

## Risks / Trade-offs

- **令牌明文存 SQLite** → 本地个人工具场景可接受（已确认）；缓解：库文件加入 `.gitignore` 避免误提交，文档标注"勿在多人/公网环境部署时明文存令牌"。
- **服务端代理形成 SSRF 面**（可请求任意 URL，含内网地址）→ 本地自用风险低；缓解：仅允许 GET、设置请求超时、必要时可加内网地址黑名单（第一版先超时 + 仅 GET）。
- **`better-sqlite3` 是原生模块**，需与 Node 版本匹配编译 → 缓解：锁定版本、文档说明安装环境；若安装受阻可退回 `node:sqlite`（评估后再定）。
- **响应体过大**（接口返回超大 JSON）→ 回填可能卡编辑器；缓解：代理侧设响应大小上限，超限返回错误提示。
- **响应非 JSON 直接判失败**可能不符合个别文本接口场景 → 属第一版有意收窄（Non-Goal），后续可扩展文本回填。

## Open Questions

- 代理请求的**超时时长**与**响应大小上限**取值待定（建议：超时 10s、上限 5MB，实现时确认）。
- 历史记录是否需要**手动删除**入口？第一版倾向只做写入 + 筛选复用，删除留待后续。


