## Why

「接口调试」目前只能从 cURL 导入，一条一条来。而实际拿到手的往往是一份 Swagger/OpenAPI 文档——几十上百个接口，要在工具里用起来只能逐个手敲 URL、方法、参数和请求体，一份中等规模的文档抄完要小半天，抄错一个字段名又得回头排查。

后端项目基本都会挂 `springdoc` / `knife4j` / `swagger-ui`，也就是说这份文档几乎总是现成的。把它直接导成集合树，是让「接口调试」从「单个请求的调试器」变成「一个服务的调试工作台」的关键一步：导完就能按 tag 分组浏览整个服务的接口，切环境就能在不同部署上跑同一批请求。

## What Changes

- 「接口调试」新增 OpenAPI / Swagger 导入入口，粘贴文档内容（JSON 或 YAML）后**批量生成集合树**，而非载入单个 tab
- **版本覆盖**：Swagger 2.0 与 OpenAPI 3.0 / 3.1 三种，内部归一化为同一中间模型后统一落库
- **分组策略**：以 `info.title` 建根文件夹，其下按 `tags` 分组；无 tag 的接口按 path 首段分组，两者都取不到时归入「未分类」
- **请求生成**：方法、path、query 参数、header 参数、请求体（由 schema 生成示例 JSON）、`operationId` / `summary` 作为节点名
- **服务器地址转环境**：`servers`（或 Swagger 2.0 的 `host` + `basePath` + `schemes`）生成对应环境与 `baseUrl` 变量，请求 URL 写成 `{{baseUrl}}/path`，从而直接接上既有的环境切换与变量替换
- **鉴权映射**：`securitySchemes` 中的 bearer / basic / apiKey 映射到既有的 Auth 配置
- **`$ref` 解析**：解析文档内部引用以生成示例请求体，循环引用按深度上限截断并占位
- **导入预览与报告**：写入前展示将创建的文件夹数与请求数供确认；写入后给出一份报告，列出被降级处理的项（缺失 tag、`$ref` 断链、无法推断的请求体、含路径参数的请求）
- 写入 `api_nodes` 在**单个事务**内完成，失败整体回滚，不留半棵树

### 非目标

- **不做增量同步与 diff 合并**。重复导入同一份文档会新建一个带后缀的根文件夹，由用户自行删除旧的——自动合并需要稳定的接口身份标识与冲突策略，风险远大于收益
- **不做按 URL 拉取文档**。只接受粘贴文本，避免引入出网请求与 SSRF 面
- **不解析外部 `$ref`**（跨文件或跨 URL 的引用），遇到时按断链降级并列入报告
- 不导入响应定义、示例响应与响应校验，本工具的关注点是发出请求
- 不生成测试用例、断言与 Mock 数据
- 不导出为 OpenAPI（只做导入方向）
- 不做 Postman / Insomnia / HAR 等其他格式的导入
- 不把路径参数 `{id}` 改写为工具的变量语法，保留原样以便用户一眼识别需替换处

## Capabilities

### New Capabilities

- `api-openapi-import`: OpenAPI / Swagger 导入——粘贴 JSON 或 YAML 文档，归一化 Swagger 2.0 与 OpenAPI 3.x 两代结构，批量生成按 tag 分组的集合树与请求定义，由 `servers` 生成环境与 `baseUrl` 变量，映射 `securitySchemes` 到 Auth 配置，解析文档内 `$ref` 生成示例请求体，并提供导入前预览与导入后的降级项报告；写入以单事务保证原子性

### Modified Capabilities

无。导入通过既有的 `api_nodes` 持久化、环境管理与变量管理机制落地，未改变它们的规格要求，此处仅登记影响。

## Impact

- **新增代码**：
  - `lib/api-client/openapi/types.ts`（归一化中间模型）
  - `lib/api-client/openapi/read-v2.ts`、`read-v3.ts`（两代文档的读取器）
  - `lib/api-client/openapi/ref.ts`（文档内 `$ref` 解析与循环引用截断）
  - `lib/api-client/openapi/sample.ts`（由 schema 生成示例请求体）
  - `lib/api-client/openapi/to-nodes.ts`（中间模型 → 文件夹/请求节点树 + 环境 + 变量）
  - `components/api-client/OpenApiImportDialog.tsx`（粘贴、预览、确认、报告）
  - `app/api/collections/import/route.ts`（单事务批量写入）
- **修改代码**：
  - `lib/db/index.ts`：新增批量创建节点的事务函数（复用既有 `api_nodes` 表结构，不改表）
  - `components/api-client/*`：导入入口挂到既有的导入位置（与 cURL 导入并列）
- **依赖**：零新增。YAML 解析复用既有的 `js-yaml`
- **测试**：`lib/api-client/openapi/*.test.ts`——两代文档的读取与归一化、`$ref` 解析与循环引用截断、示例请求体生成、分组与节点树构造、降级项报告，全部为不依赖网络与数据库的纯函数测试
- **数据库**：`app.db` 零表结构变动，复用 `api_nodes` / `api_environments` / `api_variables`
- **风险**：
  - 实际文档质量参差（缺 tags、缺 example、`$ref` 断链、非标准扩展），需逐项降级而非整体失败
  - 大文档一次生成数百节点，需事务写入 + 预览确认 + 数量上限
  - OpenAPI 路径参数写作 `{id}`，与工具的 `{{变量}}` 语法形近，需确认变量替换不会误匹配单花括号
