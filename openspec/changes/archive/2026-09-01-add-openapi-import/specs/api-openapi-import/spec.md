## ADDED Requirements

### Requirement: 粘贴文档导入

系统 SHALL 支持在「接口调试」中粘贴 OpenAPI / Swagger 文档原文（JSON 或 YAML）并导入，导入产物为**集合树**而非单个 tab；系统 MUST NOT 提供按 URL 拉取文档的能力。

#### Scenario: 粘贴 JSON 文档导入

- **WHEN** 用户粘贴一份 JSON 格式的 OpenAPI 文档并确认导入
- **THEN** 系统在集合树中生成对应的文件夹与请求节点

#### Scenario: 粘贴 YAML 文档导入

- **WHEN** 用户粘贴一份 YAML 格式的文档并确认导入
- **THEN** 系统正确解析并生成同样的集合树

#### Scenario: 不提供 URL 拉取

- **WHEN** 用户打开导入对话框
- **THEN** 界面只提供文本粘贴入口，不提供输入文档地址自动拉取的入口

#### Scenario: 不覆盖当前 tab

- **WHEN** 用户在编辑某个 tab 时执行导入
- **THEN** 当前 tab 的内容保持不变

#### Scenario: 超大文档被拒绝

- **WHEN** 粘贴内容超过体积上限
- **THEN** 系统给出说明上限值的可读提示并停止解析

### Requirement: 两代文档格式的归一化

系统 SHALL 支持 Swagger 2.0 与 OpenAPI 3.0 / 3.1 三种文档，两代结构差异 SHALL 在解析层归一化，下游的分组、建树与环境生成 MUST NOT 感知文档版本。

#### Scenario: 导入 Swagger 2.0

- **WHEN** 文档含 `swagger: "2.0"`
- **THEN** 系统按 2.0 结构读取（`host` + `basePath` + `schemes`、`definitions`、`in: body` 参数）并生成集合树

#### Scenario: 导入 OpenAPI 3.x

- **WHEN** 文档含 `openapi: "3.0.x"` 或 `"3.1.x"`
- **THEN** 系统按 3.x 结构读取（`servers`、`components/schemas`、`requestBody`）并生成集合树

#### Scenario: 两代文档产出一致的结构

- **WHEN** 同一组接口分别以 2.0 与 3.x 描述并导入
- **THEN** 生成的文件夹分组与请求定义在语义上一致

#### Scenario: 无法识别的文档格式

- **WHEN** 文档既无 `swagger` 也无 `openapi` 版本字段
- **THEN** 系统提示无法识别的文档格式，不做猜测式解析，不创建任何节点

#### Scenario: 区分 YAML 语法错误与非文档

- **WHEN** 输入的 YAML 存在语法错误
- **THEN** 系统提示该内容为 YAML 语法错误，与「不是一份 OpenAPI 文档」的提示相区分

### Requirement: 集合树的分组结构

系统 SHALL 以文档的 `info.title` 建立根文件夹，其下的操作 SHALL 按「第一个 `tag` → path 首段 → 未分类」三级回退确定所属文件夹；取 path 首段时 SHALL 跳过无信息量的通用前缀。

#### Scenario: 按 tag 分组

- **WHEN** 操作含 `tags`
- **THEN** 该操作被放入以其第一个 tag 命名的文件夹

#### Scenario: 无 tag 时按 path 分组

- **WHEN** 操作没有 `tags`，其 path 为 `/user/list`
- **THEN** 该操作被放入名为 `user` 的文件夹

#### Scenario: 跳过通用前缀

- **WHEN** 操作没有 `tags`，其 path 为 `/api/v1/user/list`
- **THEN** 系统跳过 `api` 与 `v1`，将该操作放入名为 `user` 的文件夹

#### Scenario: 归入未分类

- **WHEN** 操作既无 tag，也无法从 path 取出有意义的分组名
- **THEN** 该操作被放入「未分类」文件夹

#### Scenario: 根文件夹命名

- **WHEN** 文档的 `info.title` 为某个服务名
- **THEN** 生成的根文件夹以该服务名命名

### Requirement: 请求节点的生成

系统 SHALL 为每个操作生成一个请求节点，包含 HTTP 方法、URL、query 参数、header 参数与请求体；节点名称 SHALL 按「`summary` → `operationId` → `method + path`」三级回退确定。

#### Scenario: 生成方法与路径

- **WHEN** 操作为 `GET /users/{id}`
- **THEN** 生成的请求节点方法为 GET，URL 路径部分为 `/users/{id}`

#### Scenario: 生成 query 参数

- **WHEN** 操作定义了 `in: query` 的参数
- **THEN** 生成的请求包含对应的 query 参数键，值为占位或默认值

#### Scenario: 生成 header 参数

- **WHEN** 操作定义了 `in: header` 的参数
- **THEN** 生成的请求包含对应的 Header 键

#### Scenario: 节点名回退

- **WHEN** 操作没有 `summary` 也没有 `operationId`
- **THEN** 节点名称为其方法与路径的组合，保证可读

#### Scenario: 保留路径参数原样

- **WHEN** 操作的 path 含 `{id}` 形式的路径参数
- **THEN** 生成的 URL 保留 `{id}` 原样，MUST NOT 改写为变量语法，并在导入报告中统计此类请求的数量

### Requirement: 服务器地址生成环境与变量

系统 SHALL 由文档的服务器地址生成对应环境，并在该环境下创建 `baseUrl` 变量指向该地址；生成的请求 URL SHALL 以 `{{baseUrl}}` 作为前缀。已存在同名环境时系统 MUST NOT 覆盖它。

#### Scenario: 由 servers 生成环境

- **WHEN** OpenAPI 3.x 文档的 `servers` 含一项，`description` 为「测试环境」
- **THEN** 系统创建名为「测试环境」的环境，并在其下创建指向该 server URL 的 `baseUrl` 变量

#### Scenario: 由 Swagger 2.0 字段生成环境

- **WHEN** Swagger 2.0 文档含 `host`、`basePath` 与 `schemes`
- **THEN** 系统据其组装出完整地址并创建对应环境与 `baseUrl` 变量

#### Scenario: 请求 URL 使用变量前缀

- **WHEN** 系统生成某个请求节点
- **THEN** 其 URL 形如 `{{baseUrl}}/users/{id}`，切换环境即可指向不同部署

#### Scenario: 同名环境不被覆盖

- **WHEN** 文档生成的环境名与既有环境重名
- **THEN** 系统以带后缀的名称创建新环境，既有环境的变量与配置保持不变，并将此情况列入导入报告

#### Scenario: 缺少服务器地址

- **WHEN** 文档未定义任何服务器地址
- **THEN** 系统不创建环境，生成的 URL 仍以 `{{baseUrl}}` 为前缀，并在报告中提示需自行配置该变量

### Requirement: 安全方案映射到 Auth 配置

系统 SHALL 将文档中的 bearer、basic 与 apiKey 三类安全方案映射到既有的 Auth 配置；无法映射的方案 SHALL 列入导入报告。

#### Scenario: 映射 bearer

- **WHEN** 文档定义了 HTTP bearer 安全方案
- **THEN** 生成的请求 Auth 类型为 Bearer Token

#### Scenario: 映射 basic

- **WHEN** 文档定义了 HTTP basic 安全方案
- **THEN** 生成的请求 Auth 类型为 Basic Auth

#### Scenario: 映射 apiKey

- **WHEN** 文档定义了 apiKey 安全方案
- **THEN** 生成的请求 Auth 类型为 API Key，键名与位置与文档一致

#### Scenario: 无法映射的方案

- **WHEN** 文档定义了 OAuth2 等无法直接映射的安全方案
- **THEN** 系统不设置 Auth，并将该方案列入导入报告

### Requirement: 文档内引用解析与循环截断

系统 SHALL 解析文档内部的 `$ref`（以 `#/` 开头）以生成示例请求体；对外部引用 SHALL 按断链降级；对循环引用 SHALL 截断为占位并设深度上限，MUST NOT 无限递归。

#### Scenario: 解析内部引用

- **WHEN** 请求体 schema 通过 `$ref` 指向文档内的 schema 定义
- **THEN** 系统解析该引用并据其生成示例请求体

#### Scenario: 循环引用被截断

- **WHEN** schema 之间存在相互引用形成环
- **THEN** 系统在命中环时截断为占位值，导入正常完成，页面不发生栈溢出或无响应

#### Scenario: 外部引用降级

- **WHEN** `$ref` 指向外部文件或 URL
- **THEN** 系统不解析该引用，该字段生成占位值，并将断链列入导入报告

#### Scenario: 断链引用降级

- **WHEN** `$ref` 指向文档内不存在的路径
- **THEN** 系统该字段生成占位值并列入导入报告，其余部分正常导入

#### Scenario: 超出深度上限

- **WHEN** schema 嵌套深度超过上限
- **THEN** 系统在上限处截断并列入报告，导入正常完成

### Requirement: 示例请求体生成

系统 SHALL 由请求体 schema 生成示例 JSON，取值优先级为「显式 `example` / `examples` → `default` → 依 `type` 与 `format` 生成占位值」；无法推断请求体的操作 SHALL 列入导入报告。

#### Scenario: 优先使用显式示例

- **WHEN** schema 或字段定义了 `example`
- **THEN** 生成的示例请求体使用该示例值

#### Scenario: 使用默认值

- **WHEN** 字段无 `example` 但定义了 `default`
- **THEN** 生成的示例请求体使用该默认值

#### Scenario: 按类型生成占位

- **WHEN** 字段既无示例也无默认值
- **THEN** 系统依其 `type` 与 `format` 生成占位值

#### Scenario: 枚举取首值

- **WHEN** 字段定义了 `enum`
- **THEN** 生成的示例值取枚举的第一项

#### Scenario: 无请求体的操作

- **WHEN** 操作未定义请求体
- **THEN** 生成的请求 Body 类型为 none

#### Scenario: 无法推断的请求体

- **WHEN** 操作定义了请求体但其内容类型不受支持
- **THEN** 系统生成空 Body 并将该操作列入导入报告

### Requirement: 导入前预览与数量上限

系统 SHALL 在写入前展示将创建的文件夹数与请求数供用户确认，用户确认后方可写入；操作数量超过上限时 SHALL 拒绝导入并给出提示。

#### Scenario: 展示预览

- **WHEN** 文档解析成功
- **THEN** 系统展示将创建的文件夹数量与请求数量，等待用户确认

#### Scenario: 取消导入

- **WHEN** 用户在预览阶段取消
- **THEN** 系统不创建任何节点、环境或变量

#### Scenario: 提示将新建副本

- **WHEN** 已存在与文档同名的根文件夹
- **THEN** 预览中明确提示将新建带后缀的副本，而非合并到既有集合

#### Scenario: 超出数量上限

- **WHEN** 文档解析出的操作数超过上限
- **THEN** 系统拒绝导入并提示上限值，不创建任何节点

### Requirement: 重复导入新建副本而非合并

系统 MUST NOT 对重复导入的文档做增量同步或 diff 合并；已存在同名根文件夹时 SHALL 新建带后缀的根文件夹。

#### Scenario: 重复导入生成副本

- **WHEN** 用户第二次导入同一份文档
- **THEN** 系统新建名称带后缀的根文件夹，既有集合的节点与用户改动完全不受影响

#### Scenario: 既有请求的用户改动不丢失

- **WHEN** 用户曾手工修改过既有集合中的某个请求，随后重复导入
- **THEN** 该请求的用户改动保持不变

### Requirement: 写入的原子性

一次导入产生的全部文件夹、请求节点、环境与变量 SHALL 在单个事务内写入，任一步失败 SHALL 整体回滚，MUST NOT 留下部分写入的集合树。

#### Scenario: 写入成功

- **WHEN** 导入过程无错误
- **THEN** 全部节点、环境与变量一次性可见

#### Scenario: 写入失败整体回滚

- **WHEN** 写入过程中发生错误
- **THEN** 系统回滚全部改动，集合树、环境与变量与导入前完全一致，并给出可读的失败提示

### Requirement: 降级项的导入报告

系统 SHALL 在导入完成后展示一份报告，集中列出解析过程中的全部降级项，MUST NOT 静默忽略，也 MUST NOT 因存在降级项而中止导入。

#### Scenario: 展示降级报告

- **WHEN** 导入过程中存在降级项
- **THEN** 系统展示报告，列出降级类型、涉及的位置与说明

#### Scenario: 降级不中止导入

- **WHEN** 文档中存在缺失 tag、`$ref` 断链、无法推断请求体等问题
- **THEN** 系统完成导入，问题项以降级方式处理并记入报告

#### Scenario: 无降级项时不展示无谓警告

- **WHEN** 文档解析过程无任何降级
- **THEN** 报告为空，界面不展示警告内容

### Requirement: 解析逻辑可独立测试

文档读取、引用解析、示例生成与节点树构造 SHALL 实现为不依赖网络与数据库的纯函数，使其能被单元测试直接覆盖。

#### Scenario: 纯函数可直接测试

- **WHEN** 测试代码传入构造的文档对象调用解析函数
- **THEN** 无需真实的 Swagger 服务或数据库即可断言归一化结果与生成的节点树

#### Scenario: 循环引用有测试覆盖

- **WHEN** 测试代码传入含循环引用的 schema
- **THEN** 解析函数在有限步内返回截断结果，测试不发生栈溢出
