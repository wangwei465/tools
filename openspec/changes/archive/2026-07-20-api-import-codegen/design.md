## Context

### 现状
① 的请求组装管线：`RequestDraft →（Auth 注入 → Query 合并 → Body 序列化）→ wire { method, url, headers, bodyType, body } → POST /api/request`。②/③ 在此之上叠加了持久化与变量替换。

### 纲领与本层定位
本 change 为四层路线图第 ④ 层的 **④a（import/codegen）**，**仅依赖 ①**（可紧邻 ①，本次按用户排序置于 ②③ 之后）。纲领推论——两大能力是组装管线的对称操作：
- **代码生成 = 管线旁路终端**：组装出 wire 后不发代理，序列化成 curl / fetch 字符串。
- **cURL 导入 = 管线逆运算**：解析 curl → 反推 `RequestDraft`。

**④b（OpenAPI / Postman 批量导入，依赖 ②）不在本 change**，后续单列。见已归档的 `add-api-client-core/design.md`。

### 约束
Next.js App Router；沿用暗色设计系统、CodeMirror、`useReducer`；**少依赖**——curl 解析与代码生成均自研轻量实现。不改 ①/②/③ 逻辑，复用 ① 组装函数。

## Goals / Non-Goals

**Goals（本 change ④a）:**
- 单条 cURL 导入 → `RequestDraft` → 新 tab（逆运算）。
- 代码生成：wire → curl / fetch 字符串（旁路终端），目标可扩展、一键复制。
- 导入健壮性（未知选项 / 畸形 curl 提示）与生成一致性（所见即所发）。

**Non-Goals:**
- OpenAPI / Postman 批量导入 → ④b（依赖 ②），后续单列。
- HAR / Postman 单请求导入（第一版仅 curl）。
- 生成完整 SDK / 客户端框架（仅片段级 curl / fetch）。
- 前后置脚本 / 断言 → ⑤，不做。

## Decisions

### 代码生成挂在组装管线「旁路终端」
复用 ① 的组装函数得到 wire `{ method, url, headers, bodyType, body }`，generator 只序列化这个 wire → 各目标字符串。保证生成结果与实际发送一致（若 ③ 在场，wire 已是替换后的值）。*备选*：从 `RequestDraft` 直接生成——绕过组装，易与实际发送漂移，否决。

### cURL 导入是管线「逆运算」
parser 解析 curl → 反推 `RequestDraft`（method/url/params/headers/body/auth），载入 tab 后再走正常管线。*备选*：导入直接生成 wire——但用户要编辑，必须回到可编辑的 `RequestDraft` 层，否决。

### curl 解析：自研轻量 tokenizer
处理引号、`\` 续行、空白，支持常见选项（`-X`/`-H`/`-d`/`--data`/`--data-raw`/`--data-urlencoded`/`-F`/`-u`/`--compressed` 等），不追求覆盖全部 curl 语法。*备选*：引 curl 解析库——多为重依赖或覆盖不全，自研可控且够用，遵循少依赖。

### 代码生成目标可扩展（开闭）
定义 generator 接口 `wire → string`，内置 `curl`、`fetch`；新增目标（如 Python requests）只加一个 generator，不改主逻辑。*备选*：`switch` 硬编码目标——扩展需改主逻辑，违反 OCP，否决。

### body 类型推断
`-d`/`--data-raw` 且 `Content-Type: application/json` → `raw(JSON)`；`-d` 且表单 / 无 content-type → `urlencoded`；`-F` → `form-data`；综合 `-H content-type` 与选项判断。

### 导入载入新 tab，不覆盖当前
导入结果载入**新 tab**，不覆盖正在编辑的 tab。*备选*：覆盖当前 tab——易误伤未保存内容，否决。

## Risks / Trade-offs

- **curl 语法千变万化，自研 parser 覆盖不全** → 聚焦常见选项，未知选项忽略并提示，文档标注支持范围。
- **多行 curl（`\` 续行）与 shell 引号转义** → parser 处理引号与续行的基本情形；复杂 shell 展开（变量 / 子命令）不支持。
- **生成代码的转义**（引号 / 换行 / 特殊字符）→ 各 generator 做目标语言转义，配套样例测试。
- **form-data 文件的导入 / 生成表达** → 文件内容不内联：导入 `-F file=@path` 保留路径占位、生成 curl 用 `@` 占位，与 ① 文件不持久一致。
- **代码生成依赖 ① 组装** → 复用**同一**组装函数供发送与生成共用，避免逻辑漂移（DRY）。

## Migration Plan

- 纯前端功能，**无 DB / 无 schema / 无后端变更**；④a 仅依赖 ① 的 `RequestDraft` 类型与组装函数。
- 回滚：移除导入入口与代码生成面板即可，不影响 ①/②/③。

## Open Questions

- 代码生成第一版目标集：`curl` + `fetch` 起步，是否加 Python requests？倾向起步二者、预留接口。
- curl 导入支持的选项最终清单，实现时定（至少 `-X`/`-H`/`-d`/`--data-raw`/`--data-urlencoded`/`-F`/`-u`）。
- 导入内容若含 `{{变量}}`（他人分享）：第一版原样保留为文本（③ 在场时可被替换）。
