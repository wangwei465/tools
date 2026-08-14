## ADDED Requirements

### Requirement: 统一计算端点

系统 SHALL 提供单一端点 `POST /api/crypto` 承载全部加解密计算，请求体以 `op` 字段判别操作类型（`hash` / `hmac` / `encrypt` / `decrypt` / `sign` / `verify` / `kdf`），MUST NOT 为每种算法单独开设路由。

#### Scenario: 按 op 分发

- **WHEN** 客户端提交 `op` 为 `hash` 的合法请求体
- **THEN** 系统执行哈希计算并返回结果

#### Scenario: op 缺失或不受支持

- **WHEN** 客户端提交的请求体缺少 `op` 或 `op` 值不在受支持列表内
- **THEN** 系统返回失败响应，错误信息指出不受支持的操作类型

#### Scenario: 请求体不是合法 JSON

- **WHEN** 客户端提交的请求体无法解析为 JSON
- **THEN** 系统返回失败响应，错误信息指出请求体不是合法 JSON

### Requirement: 统一响应契约

`POST /api/crypto` SHALL 使用统一响应形状：成功返回 `{ ok: true, value }`，失败返回 `{ ok: false, error }`，其中 `error` MUST 为可读中文提示。

#### Scenario: 成功响应

- **WHEN** 一次计算成功完成
- **THEN** 响应体为 `{ ok: true, value: <结果> }`

#### Scenario: 失败响应

- **WHEN** 一次计算因参数或算法原因失败
- **THEN** 响应体为 `{ ok: false, error: <可读中文原因> }`，且不包含任何计算结果字段

### Requirement: 参数校验前置

系统 SHALL 在调用底层加密实现之前完成参数校验，包括必填字段、编码合法性、密钥字节长度与算法要求的匹配、数值参数的取值范围；校验失败 SHALL 直接返回可读错误。

#### Scenario: 必填字段缺失

- **WHEN** 客户端提交 `op` 为 `hmac` 但未提供密钥
- **THEN** 系统返回失败响应并指出密钥不能为空，不调用底层加密实现

#### Scenario: 密钥长度与算法不匹配

- **WHEN** 客户端请求 AES-256 加密但密钥解码后不足 32 字节
- **THEN** 系统返回的错误信息包含期望字节长度与实际字节长度

#### Scenario: 编码解析失败

- **WHEN** 客户端声明某字段编码为 hex 但内容含非十六进制字符
- **THEN** 系统返回失败响应并指出该字段的编码解析失败

### Requirement: 底层错误可读化

系统 SHALL 将底层加密库抛出的异常映射为可读中文提示，至少覆盖密钥长度不符、padding 错误、GCM 认证标签校验失败、PEM 格式无法解析四类；无法归类的异常 SHALL 回落到原始错误信息而非被吞掉。

#### Scenario: 解密 padding 错误

- **WHEN** 客户端用错误的密钥解密一段 CBC 密文导致 padding 校验失败
- **THEN** 系统返回可读中文提示，而非底层库的原始错误码文本

#### Scenario: 未知异常不被吞掉

- **WHEN** 底层实现抛出未被归类的异常
- **THEN** 系统返回的错误信息包含该异常的原始 message

### Requirement: 输入不持久化不记日志

`POST /api/crypto` 处理的明文、密文、密钥、口令、盐值等敏感字段 MUST NOT 被写入 `app.db` 或任何持久化存储，MUST NOT 被写入服务端日志或控制台输出，仅在当次请求的内存中用于计算。

#### Scenario: 不落库

- **WHEN** 客户端完成任意一次加解密计算
- **THEN** `app.db` 中不新增任何记录，数据库 schema 无变化

#### Scenario: 不记日志

- **WHEN** 服务端处理一次含密钥的计算请求
- **THEN** 服务端日志与控制台输出中不出现请求体中的任何敏感字段值

#### Scenario: 失败路径同样不泄露

- **WHEN** 一次计算因参数错误失败
- **THEN** 返回的错误信息与服务端日志均不回显密钥或明文内容

### Requirement: 算法实现可独立测试

加解密算法 SHALL 实现为不依赖 HTTP 请求与响应对象的纯函数模块，使其能被单元测试直接以公开测试向量验证。

#### Scenario: 纯函数层可直接测试

- **WHEN** 测试代码直接调用算法实现并传入公开测试向量的输入
- **THEN** 无需启动 HTTP 服务即可断言输出与向量期望值一致

#### Scenario: 路由层仅做分发

- **WHEN** 审阅 `POST /api/crypto` 的路由实现
- **THEN** 路由只负责请求解析、按 `op` 分发与响应封装，不包含算法计算逻辑
