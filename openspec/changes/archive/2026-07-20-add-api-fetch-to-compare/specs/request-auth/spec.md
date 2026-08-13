## ADDED Requirements

### Requirement: 统一令牌配置
系统 SHALL 提供一个统一令牌设置入口，允许用户配置令牌所在的 Header 名、Prefix 与 Token 值，作为所有接口请求的默认令牌来源。

#### Scenario: 打开令牌设置
- **WHEN** 用户打开统一令牌设置
- **THEN** 系统展示 Header 名、Prefix、Token 三个可编辑字段

#### Scenario: 默认令牌格式
- **WHEN** 用户首次打开令牌设置且未修改
- **THEN** 系统默认 Header 名为 `Authorization`、Prefix 为 `Bearer`

#### Scenario: 自定义 Header 名与 Prefix
- **WHEN** 用户将 Header 名改为 `token`、Prefix 清空并保存
- **THEN** 后续请求以 `token: <token值>` 形式携带令牌（无 Prefix）

### Requirement: 请求自动携带令牌
所有接口请求 SHALL 默认从统一令牌配置读取令牌并注入请求 Header，用户无需在每次请求中重复填写。

#### Scenario: 请求携带统一令牌
- **WHEN** 已配置统一令牌，用户发起任一侧接口请求
- **THEN** 服务端在请求目标接口时自动附加 `<HeaderName>: <Prefix> <Token>`

#### Scenario: 未配置令牌
- **WHEN** 用户未配置统一令牌即发起请求
- **THEN** 系统不附加令牌 Header，请求照常发送

### Requirement: 单侧 Header 覆盖全局令牌
当某侧普通 Header 与统一令牌 Header 同名时，系统 SHALL 以单侧 Header 值为准（局部覆盖全局）。

#### Scenario: 单侧 Header 覆盖
- **WHEN** 统一令牌 Header 名为 `Authorization`，且某侧普通 Header 也配置了 `Authorization`
- **THEN** 该侧请求使用单侧配置的 `Authorization` 值，忽略统一令牌值

### Requirement: 令牌配置持久化
统一令牌配置 SHALL 使用 SQLite 持久化，页面刷新或重启后仍然生效。

#### Scenario: 保存后持久
- **WHEN** 用户保存令牌配置后刷新页面
- **THEN** 系统读取到已保存的令牌配置并继续用于后续请求
