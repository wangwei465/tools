# datastore-connection Specification

## Purpose
TBD - created by archiving change add-es-mongo-client. Update Purpose after archive.
## Requirements
### Requirement: 连接的增删改查

系统 SHALL 提供数据源连接的新增、编辑、删除与列表能力，连接配置 SHALL 使用 SQLite 持久化，页面刷新或重启后仍然可用。

#### Scenario: 新增连接

- **WHEN** 用户填写名称、类型（Elasticsearch 或 MongoDB）、连接地址与认证信息并保存
- **THEN** 系统持久化该连接并使其出现在连接选择器中

#### Scenario: 编辑连接

- **WHEN** 用户修改某个连接的配置并保存
- **THEN** 系统更新该连接，后续操作使用新配置

#### Scenario: 删除连接

- **WHEN** 用户删除某个连接
- **THEN** 该连接从列表中移除，其服务端已建立的客户端被释放

#### Scenario: 重启后仍可用

- **WHEN** 用户配置连接后重启应用
- **THEN** 连接列表与配置内容保持不变

### Requirement: 两类数据源的连接配置

系统 SHALL 在同一份连接配置中支持 Elasticsearch 与 MongoDB 两种类型，公共字段共用，各自的差异化认证参数 SHALL 一并保存。

#### Scenario: 配置 ES 连接

- **WHEN** 用户选择类型为 Elasticsearch 并填写 base URL 与 Basic Auth 或 API Key
- **THEN** 系统保存该连接，后续 ES 请求携带对应的认证头

#### Scenario: 配置 MongoDB 连接

- **WHEN** 用户选择类型为 MongoDB 并填写连接串与认证库
- **THEN** 系统保存该连接，后续 Mongo 操作使用该连接串

#### Scenario: 类型决定可填字段

- **WHEN** 用户在新增连接时切换类型
- **THEN** 表单展示该类型对应的配置字段，不展示另一类型特有的字段

### Requirement: 连通性测试

系统 SHALL 提供连接测试能力，在保存前或保存后验证目标可达，测试失败 SHALL 返回可读的失败原因。

#### Scenario: 测试成功

- **WHEN** 用户对配置正确的连接点击「测试」
- **THEN** 系统返回成功，并展示目标服务的版本信息

#### Scenario: 测试失败

- **WHEN** 目标地址不可达或认证失败
- **THEN** 系统展示可读的失败原因（如连接超时、认证失败），不抛出未捕获异常

### Requirement: 环境标签与读写模式

每个连接 SHALL 带有环境标签（local / test / prod）与读写模式（rw / readonly），环境标签 SHALL 在界面上可辨识，读写模式 SHALL 作为服务端拦截写操作的依据。

#### Scenario: 生产连接可辨识

- **WHEN** 某连接的环境标签为 prod
- **THEN** 连接选择器以显著样式标示该连接

#### Scenario: 只读连接拦截写操作

- **WHEN** 用户在 mode 为 readonly 的连接上执行写操作
- **THEN** 系统拒绝执行并说明该连接为只读模式

### Requirement: 凭证脱敏与服务端连接复用

连接列表接口返回的密码类字段 SHALL 脱敏；MongoDB 客户端 SHALL 在服务端按连接复用，MUST NOT 每请求新建。

#### Scenario: 列表不回显密码

- **WHEN** 前端获取连接列表
- **THEN** 响应中的密码字段为脱敏值，不含明文

#### Scenario: 客户端复用

- **WHEN** 同一 MongoDB 连接被连续多次查询
- **THEN** 服务端复用既有客户端实例，不为每个请求新建连接

#### Scenario: 连接变更后释放旧客户端

- **WHEN** 用户编辑或删除某个 MongoDB 连接
- **THEN** 服务端释放该连接对应的旧客户端，后续请求使用新配置重建

