## 1. 归一化中间模型与文档识别

- [x] 1.1 新建 `lib/api-client/openapi/types.ts`：与版本无关的中间模型——`ApiDocModel`（服务信息 / 服务器列表 / 安全方案 / 操作列表）、`ApiOperation`（method / path / 分组名 / 显示名 / query 参数 / header 参数 / 请求体示例 / 安全方案）、`ImportIssue`（降级项：类型 / 位置 / 说明）
- [x] 1.2 新建 `lib/api-client/openapi/detect.ts`：依 `swagger: "2.0"` 与 `openapi: "3.x"` 判定版本；两者皆缺失时返回「无法识别的文档格式」，MUST NOT 猜测式解析
- [x] 1.3 实现输入解析入口：先按 JSON 解析，失败再按 YAML（复用既有 `js-yaml`）；YAML 语法错误与「不是 OpenAPI 文档」给出可区分的错误信息
- [x] 1.4 新建 `lib/api-client/openapi/limits.ts`：文档体积上限、schema 嵌套深度上限、操作数量上限的常量与校验
- [x] 1.5 `lib/api-client/openapi/detect.test.ts`：覆盖三种版本识别、无版本字段、YAML 语法错误与非文档内容的区分

## 2. 引用解析与示例生成

- [x] 2.1 新建 `lib/api-client/openapi/ref.ts`：解析 `#/` 开头的文档内引用；维护引用路径栈，命中循环时返回占位并记 `ImportIssue`
- [x] 2.2 在 `ref.ts` 实现外部引用（含文件路径或 URL）不解析、按断链降级并记 issue；文档内断链引用同样降级
- [x] 2.3 在 `ref.ts` 接入深度上限，超限截断并记 issue，MUST NOT 递归到栈溢出
- [x] 2.4 `lib/api-client/openapi/ref.test.ts`：覆盖正常引用解析、**自引用与互引用两种循环**（断言有限步返回且不栈溢出）、外部引用降级、断链降级、深度超限
- [x] 2.5 新建 `lib/api-client/openapi/sample.ts`：由 schema 生成示例 JSON，取值优先级 `example`/`examples` > `default` > 按 `type` + `format` 生成占位；`enum` 取首值
- [x] 2.6 在 `sample.ts` 处理对象、数组、嵌套与 `$ref` 字段（调用 `ref.ts`）；不支持的内容类型返回空 body 并记 issue
- [x] 2.7 `lib/api-client/openapi/sample.test.ts`：覆盖显式示例优先、default 次之、各 `type`/`format` 占位、enum 首值、嵌套对象与数组、含 `$ref` 的字段

## 3. 两代文档读取器

- [x] 3.1 新建 `lib/api-client/openapi/read-v3.ts`：读取 `servers`、`components/schemas`、`components/securitySchemes`、`paths[*][method]` 与 `requestBody.content`，产出 `ApiDocModel`
- [x] 3.2 新建 `lib/api-client/openapi/read-v2.ts`：读取 `host` + `basePath` + `schemes` 组装服务器地址、`definitions`、`securityDefinitions`、`in: body` 与 `in: formData` 参数，产出同一个 `ApiDocModel`
- [x] 3.3 两个读取器统一处理 query 与 header 参数的提取，并对未知字段一律忽略而非报错
- [x] 3.4 实现安全方案映射：bearer / basic / apiKey 三类映射到 Auth 配置，OAuth2 等无法映射的记 issue
- [x] 3.5 `lib/api-client/openapi/read-v3.test.ts` 与 `read-v2.test.ts`：各自覆盖服务器地址、操作提取、参数提取、请求体、安全方案
- [x] 3.6 补一条跨版本对照测试：同一组接口的 2.0 与 3.x 两份描述，断言归一化后的 `ApiDocModel` 在语义上一致

## 4. 分组与节点树构造

- [x] 4.1 新建 `lib/api-client/openapi/to-nodes.ts`：实现分组三级回退——第一个 `tag` → path 首段（跳过 `api`/`v1`/`v2` 等通用前缀）→「未分类」
- [x] 4.2 实现根文件夹命名（`info.title`），以及同名时的 `(2)` / `(3)` 后缀消解
- [x] 4.3 实现节点名三级回退：`summary` > `operationId` > `method + path`
- [x] 4.4 实现请求定义构造：URL 以 `{{baseUrl}}` 为前缀拼接 path，**保留 `{id}` 形式的路径参数原样**，并统计此类请求数记入 issue
- [x] 4.5 实现环境与变量构造：每个 server 生成一个环境（名取 `description`，缺失取 host）与其下的 `baseUrl` 变量；同名环境不覆盖，改用带后缀名称并记 issue；无服务器地址时不建环境但仍用 `{{baseUrl}}` 前缀并记 issue
- [x] 4.6 汇总 `ImportIssue` 列表与预览统计（文件夹数、请求数）
- [x] 4.7 `lib/api-client/openapi/to-nodes.test.ts`：覆盖三级分组回退、通用前缀跳过、节点名回退、路径参数保留、环境生成与同名后缀、无 servers 的降级
- [x] 4.8 运行 `npm test` 确认纯函数层全部通过（此时尚未接入 UI）

## 5. 事务写入端点

- [x] 5.1 在 `lib/db/index.ts` 新增批量导入的事务函数：一次性写入文件夹、请求节点、环境与变量，任一步失败整体回滚；复用既有 `api_nodes` / `api_environments` / `api_variables` 表，MUST NOT 改动表结构
- [x] 5.2 新建 `app/api/collections/import/route.ts`：接收解析后的节点树载荷，校验数量上限后调用事务函数，返回创建结果
- [x] 5.3 在端点内做防御性校验：载荷结构非法时拒绝并返回可读原因，不进入事务
- [x] 5.4 验证回滚有效性：构造一个中途失败的写入用例，确认集合树、环境与变量与导入前完全一致

## 6. 导入对话框与报告

- [x] 6.1 新建 `components/api-client/OpenApiImportDialog.tsx`：文本粘贴区（含体积上限校验）+ 解析按钮，**不提供任何 URL 拉取入口**
- [x] 6.2 实现预览步骤：展示将创建的文件夹数与请求数，等待用户确认；取消时不创建任何内容
- [x] 6.3 在预览中提示同名根文件夹将新建副本（而非合并）
- [x] 6.4 实现导入报告：按类型分组展示全部 `ImportIssue`；报告为空时不展示任何警告
- [x] 6.5 解析失败时展示可读错误（区分 YAML 语法错误、非 OpenAPI 文档、超出上限三种）
- [x] 6.6 将导入入口挂到既有的 cURL 导入并列位置，导入过程不影响当前 tab
- [x] 6.7 导入成功后刷新集合树与环境列表，使新内容立即可见

## 7. 验收

- [x] 7.1 `npm run build` 通过，无 TypeScript 报错
- [x] 7.2 `npm test` 全量通过
- [x] 7.3 冒烟：导入一份真实的 OpenAPI 3.x 文档（可取自任意 springdoc 服务），确认分组、请求定义、环境与 `baseUrl` 变量均正确生成
- [x] 7.4 冒烟：导入一份 Swagger 2.0 文档，确认结果与 3.x 在语义上一致
- [x] 7.5 冒烟：导入后直接发送其中一个请求，确认 `{{baseUrl}}` 被正确替换、请求可达
- [x] 7.6 冒烟：切换环境后同一请求指向另一部署地址
- [x] 7.7 冒烟：重复导入同一份文档，确认新建副本且既有集合中的用户改动未被触碰
- [x] 7.8 冒烟：导入含循环引用与 `$ref` 断链的文档，确认页面不卡死、导入完成且报告如实列出降级项
- [x] 7.9 冒烟：无 tag 的文档按 path 首段正确分组
- [x] 7.10 冒烟：含路径参数 `{id}` 的请求 URL 保留原样，且发送时未被变量替换误处理
- [x] 7.11 冒烟：验证 cURL 导入、集合树增删改移、环境切换、变量替换四项既有行为未受影响
- [x] 7.12 确认 `app.db` 无表结构变动；因 dev 库含真实业务数据，冒烟须做到零残留，导入产生的测试数据在验收后清理干净
- [x] 7.13 冒烟后按项目惯例清理 dev server 残留进程（`netstat` 找 PID 后 `taskkill`）
