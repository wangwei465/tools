## ADDED Requirements

### Requirement: HTTP 方法选择
请求构造区 SHALL 支持选择 GET、POST、PUT、DELETE、PATCH、HEAD、OPTIONS 方法。

#### Scenario: 选择请求方法
- **WHEN** 用户在方法下拉中选择某方法（如 POST）
- **THEN** 该请求以所选方法发送

### Requirement: URL 与 Query 参数双向同步
系统 SHALL 以 URL 的 query 段为唯一真相源，提供 Query 参数表格；改动表格即写回 URL，URL 手动编辑在失焦后解析回填表格。

#### Scenario: 表格改动写回 URL
- **WHEN** 用户在 Query 参数表格新增或修改一行
- **THEN** URL 的 query 段同步更新为对应的 `?k=v&...`

#### Scenario: URL 失焦解析回填
- **WHEN** 用户在 URL 中手动输入含 query 的地址并使输入框失焦
- **THEN** 系统解析 query 并回填到 Query 参数表格

### Requirement: 自定义 Headers
请求构造区 SHALL 支持配置任意数量的 Header 键值对，并可启用/禁用单行。

#### Scenario: 添加并发送 Header
- **WHEN** 用户添加一个启用的 Header（如 `X-Trace: 1`）并发送
- **THEN** 请求携带该 Header

#### Scenario: 禁用的 Header 不发送
- **WHEN** 用户将某 Header 行标记为禁用并发送
- **THEN** 请求不携带该 Header

### Requirement: 请求体类型
请求构造区 SHALL 支持 Body 类型：none、raw（JSON）、form-data、x-www-form-urlencoded。

#### Scenario: 发送 raw JSON
- **WHEN** 用户选择 raw(JSON) 并填写 JSON 文本后发送
- **THEN** 请求以该 JSON 文本为 body 发送，并带 `Content-Type: application/json`

#### Scenario: 发送 urlencoded
- **WHEN** 用户选择 x-www-form-urlencoded 并填写键值对后发送
- **THEN** 请求以 `a=1&b=2` 形式的 body 发送

### Requirement: form-data 与文件字段
form-data 请求体 SHALL 支持文本字段与文件字段；文件本期**不持久化**（内存态，重开需重新选择）。

#### Scenario: 发送含文件的 form-data
- **WHEN** 用户在 form-data 中添加文本字段与文件字段并发送
- **THEN** 请求以 multipart/form-data 携带对应字段与文件

#### Scenario: 文件不持久化
- **WHEN** 用户关闭标签或刷新页面后重新打开
- **THEN** 先前选择的文件不被保留，需重新选择

### Requirement: 认证方式
请求构造区 SHALL 支持 Auth 类型：none、bearer、basic、apikey；apikey 可选注入到 header 或 query。

#### Scenario: Bearer 注入
- **WHEN** 用户选择 bearer 并填写 token 后发送
- **THEN** 请求携带 `Authorization: Bearer <token>`

#### Scenario: Basic 注入
- **WHEN** 用户选择 basic 并填写用户名与密码后发送
- **THEN** 请求携带 `Authorization: Basic base64(user:pass)`

#### Scenario: API-Key 注入位置
- **WHEN** 用户选择 apikey 并指定注入到 header 或 query
- **THEN** 请求将该键值注入到所选位置
