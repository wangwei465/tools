## ADDED Requirements

### Requirement: 工具挂载与面板布局

加解密工具 SHALL 作为独立菜单挂载到系统外壳，在 `Navigation` 的工具导航中出现，并以单页多标签的方式组织五类算法面板，复用暗色设计系统；新增本工具 MUST NOT 改变任何既有工具的行为与路由。

#### Scenario: 从导航进入

- **WHEN** 用户点击导航中的「加解密」入口
- **THEN** 系统在外壳内加载 `/crypto` 页面，展示算法标签栏，且全局导航保持可用

#### Scenario: 切换算法标签

- **WHEN** 用户在面板内点击某个算法标签（如「HMAC」）
- **THEN** 系统展示该算法的参数与输入输出区，其余标签内容隐藏，当前标签明确高亮

#### Scenario: 各标签状态互不干扰

- **WHEN** 用户在「哈希」标签输入内容后切换到「对称加解密」再切回
- **THEN** 「哈希」标签原有的输入与结果保持不变

#### Scenario: 不影响既有工具

- **WHEN** 加解密工具被加入导航
- **THEN** 数据比对 / 生成签名 / 接口调试 / Redis管理 / 编码转换 的行为与路由均不受影响

### Requirement: 计算位置明示

加解密工具 SHALL 在页面上明确告知用户算法计算在本地服务端执行，使用户在粘贴密钥前知晓数据流向。

#### Scenario: 页面展示计算位置说明

- **WHEN** 用户进入 `/crypto` 页面
- **THEN** 页面头部展示说明文案，指出计算由本地服务端执行且输入不被保存

### Requirement: 哈希计算

加解密工具 SHALL 支持 MD5、SHA1、SHA256、SHA512 四种摘要算法计算文本哈希，输入编码可选 UTF-8 / hex / base64，输出编码可选 hex / base64。

#### Scenario: 计算文本哈希

- **WHEN** 用户选择 SHA256、输入编码 UTF-8、输出编码 hex，并输入任意文本
- **THEN** 系统输出该文本的 SHA256 摘要十六进制字符串

#### Scenario: 切换输出编码

- **WHEN** 用户在已有哈希结果的基础上把输出编码从 hex 切换为 base64
- **THEN** 系统输出同一摘要的 base64 表示

#### Scenario: 输入编码不合法

- **WHEN** 用户选择输入编码 hex 但输入包含非十六进制字符
- **THEN** 系统展示可读错误提示，不产出结果

### Requirement: HMAC 计算

加解密工具 SHALL 支持以 MD5 / SHA1 / SHA256 / SHA512 为摘要算法计算 HMAC，密钥编码可选 UTF-8 / hex / base64，输出编码可选 hex / base64。

#### Scenario: 计算 HMAC

- **WHEN** 用户选择 HMAC-SHA256，填入密钥与消息文本
- **THEN** 系统输出对应的 HMAC 值（按所选输出编码）

#### Scenario: 密钥为空

- **WHEN** 用户未填写密钥即请求计算
- **THEN** 系统展示"密钥不能为空"提示，不发起计算

### Requirement: 对称加解密

加解密工具 SHALL 支持 AES-128 / AES-192 / AES-256 的 CBC、ECB、GCM 三种模式加密与解密。CBC 与 GCM 模式 SHALL 提供 IV 输入，GCM 模式 SHALL 将认证标签作为独立的输入/输出字段显式暴露。密钥、IV、密文、认证标签的编码均 SHALL 由用户显式选择，系统 MUST NOT 自动嗅探编码。

#### Scenario: AES-GCM 加密

- **WHEN** 用户选择 AES-256-GCM，提供合法密钥与 IV 并输入明文
- **THEN** 系统输出密文与认证标签两个独立字段

#### Scenario: AES-GCM 解密

- **WHEN** 用户提供加密时使用的密钥、IV、密文与认证标签
- **THEN** 系统输出原始明文

#### Scenario: GCM 认证标签校验失败

- **WHEN** 用户在解密时提供被篡改的认证标签
- **THEN** 系统展示"认证标签校验失败"提示，不输出任何明文

#### Scenario: CBC 模式往返

- **WHEN** 用户用 AES-128-CBC 加密一段明文，再用相同密钥与 IV 解密所得密文
- **THEN** 系统输出与原始明文一致的结果

#### Scenario: 密钥长度不符

- **WHEN** 用户选择 AES-256 但提供的密钥解码后不足 32 字节
- **THEN** 系统展示含期望长度与实际长度数值的可读提示，不发起计算

#### Scenario: 弱模式风险提示

- **WHEN** 用户选择 ECB 模式
- **THEN** 界面展示该模式仅用于对接遗留系统的风险提示

### Requirement: 非对称加解密与签名验签

加解密工具 SHALL 支持 RSA 公钥加密、私钥解密、私钥签名与公钥验签，密钥以 PEM 文本输入，签名 SHALL 支持选择摘要算法。

#### Scenario: RSA 公钥加密与私钥解密

- **WHEN** 用户用 PEM 公钥加密一段明文，再用配对的 PEM 私钥解密所得密文
- **THEN** 系统输出与原始明文一致的结果

#### Scenario: RSA 私钥签名与公钥验签

- **WHEN** 用户用 PEM 私钥对消息签名，再用配对的 PEM 公钥验签该签名与消息
- **THEN** 系统展示验签通过

#### Scenario: 验签不通过

- **WHEN** 用户提供与消息不匹配的签名进行验签
- **THEN** 系统明确展示验签未通过，且不将其呈现为错误异常

#### Scenario: PEM 格式无法解析

- **WHEN** 用户粘贴的密钥不是合法 PEM 文本
- **THEN** 系统展示"密钥 PEM 格式无法解析"的可读提示，而非底层加密库的原始错误

### Requirement: 密钥派生

加解密工具 SHALL 支持 PBKDF2 与 scrypt 两种密钥派生函数，允许配置盐值、迭代次数（PBKDF2）或 cost 参数（scrypt）与输出长度，用于口令哈希与比对场景。

#### Scenario: PBKDF2 派生

- **WHEN** 用户提供口令、盐值、迭代次数、输出长度与摘要算法
- **THEN** 系统输出派生密钥（按所选输出编码）

#### Scenario: scrypt 派生

- **WHEN** 用户提供口令、盐值与 cost 参数
- **THEN** 系统输出派生密钥

#### Scenario: 参数非法

- **WHEN** 用户填入非正整数的迭代次数或输出长度
- **THEN** 系统展示可读的参数校验提示，不发起计算

### Requirement: 统一的结果交互

加解密工具的每个面板 SHALL 提供结果复制能力，并在失败时以统一的错误条展示可读中文提示；任一面板的失败 MUST NOT 影响其他面板的可用性。

#### Scenario: 复制结果

- **WHEN** 用户在有结果的面板点击「复制」
- **THEN** 结果文本被写入剪贴板并给出短暂的已复制反馈

#### Scenario: 失败展示错误条

- **WHEN** 任一面板的计算失败
- **THEN** 系统在该面板内展示红色错误条与可读中文原因，页面不崩溃

### Requirement: 签名工具复用统一实现

「生成签名」工具 SHALL 复用加解密工具箱的哈希实现计算 MD5，其页面交互、`/signature` 路由与 `/api/signature` 的请求响应契约 MUST 保持不变。

#### Scenario: 签名结果不变

- **WHEN** 用户以相同的时间戳、appId、appSecret 使用「生成签名」工具
- **THEN** 系统产出与本次变更前逐字符一致的签名值

#### Scenario: 签名工具入口保留

- **WHEN** 用户访问 `/signature`
- **THEN** 页面正常加载，导航中「生成签名」入口依然存在
