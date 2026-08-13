# encoding-toolkit Specification

## Purpose

编码转换面板——单页多标签的纯前端开发者转换工具,涵盖 JSON⇔YAML、Base64、URL、时间戳⇔日期、UUID 生成、JWT 解析、正则测试七类高频离线转换,全部客户端计算、不落库、不发网络请求;含工具导航挂载与统一的输入/输出/复制/错误交互。

## Requirements

### Requirement: 工具挂载与面板布局
编码转换工具 SHALL 作为独立菜单挂载到系统外壳,在 `Navigation` 的工具导航中出现,并以单页多标签(七个转换器)的方式组织,复用暗色设计系统;新增本工具不影响任何既有工具。

#### Scenario: 从导航进入
- **WHEN** 用户点击导航中的「编码转换」入口
- **THEN** 系统在外壳内加载 `/convert` 页面,展示转换器标签栏,且全局导航保持可用

#### Scenario: 切换转换器标签
- **WHEN** 用户在面板内点击某个转换器标签(如「Base64」)
- **THEN** 系统展示该转换器的输入/输出区,其余转换器内容隐藏,当前标签明确高亮

#### Scenario: 不影响既有工具
- **WHEN** 编码转换工具被加入导航
- **THEN** 数据比对 / 生成签名 / 接口调试 / Redis管理 的行为与路由均不受影响

### Requirement: 纯客户端与隐私约束
编码转换工具 SHALL 在浏览器端完成所有转换计算,MUST NOT 发起任何网络请求,MUST NOT 将输入内容持久化到 `app.db` 或任何后端存储。

#### Scenario: 转换不出网
- **WHEN** 用户在任一转换器执行转换
- **THEN** 转换结果由客户端计算得出,不产生对后端 API 或第三方服务的请求

#### Scenario: 无持久化
- **WHEN** 用户输入内容并转换后刷新或离开页面
- **THEN** 输入内容不被写入后端库(仅存在于会话内存中)

### Requirement: JSON 与 YAML 互转及 JSON 格式化校验
编码转换工具 SHALL 提供 JSON ⇔ YAML 双向转换,并支持 JSON 的美化、压缩与合法性校验;非法输入 SHALL 给出可读的错误提示而非崩溃。

#### Scenario: JSON 转 YAML
- **WHEN** 用户输入合法 JSON 并选择转为 YAML
- **THEN** 系统输出等价的 YAML 文本

#### Scenario: YAML 转 JSON
- **WHEN** 用户输入合法 YAML 并选择转为 JSON
- **THEN** 系统输出等价的 JSON 文本

#### Scenario: JSON 美化与压缩
- **WHEN** 用户对合法 JSON 选择「美化」或「压缩」
- **THEN** 系统分别输出带缩进的格式化 JSON 或单行压缩 JSON

#### Scenario: 非法输入提示
- **WHEN** 用户输入非法 JSON 或 YAML
- **THEN** 系统展示可读的错误信息(含大致原因),不影响其他转换器

### Requirement: Base64 编解码
编码转换工具 SHALL 提供文本的 Base64 编码与解码,并支持标准与 URL-safe 两种变体;解码非法输入 SHALL 给出错误提示。

#### Scenario: 文本编码为 Base64
- **WHEN** 用户输入文本并选择「编码」
- **THEN** 系统输出对应的 Base64 字符串(按所选变体)

#### Scenario: Base64 解码为文本
- **WHEN** 用户输入合法 Base64 并选择「解码」
- **THEN** 系统输出解码后的原文(正确处理 UTF-8)

#### Scenario: URL-safe 变体
- **WHEN** 用户选择 URL-safe 变体进行编码
- **THEN** 输出使用 `-`/`_` 替代 `+`/`/`,符合 URL-safe 规则

#### Scenario: 非法 Base64 解码
- **WHEN** 用户对非法 Base64 输入执行解码
- **THEN** 系统展示可读错误提示

### Requirement: URL 编解码
编码转换工具 SHALL 提供 URL 编码与解码,并区分 component 级(`encodeURIComponent`)与整串级(`encodeURI`)。

#### Scenario: component 编码
- **WHEN** 用户选择 component 模式并对含特殊字符的文本编码
- **THEN** 系统按 `encodeURIComponent` 规则转义(如 `&`/`=`/`?` 均被转义)

#### Scenario: 整串编码
- **WHEN** 用户选择整串模式并对一个 URL 编码
- **THEN** 系统按 `encodeURI` 规则转义(保留 URL 结构分隔符)

#### Scenario: URL 解码
- **WHEN** 用户输入含 `%XX` 转义的文本并选择解码
- **THEN** 系统输出解码后的原文;对非法转义序列给出错误提示

### Requirement: 时间戳与日期互转
编码转换工具 SHALL 提供 Unix 时间戳与人类可读日期的双向转换,支持秒 / 毫秒精度,并可按本地时区与 UTC 分别展示。

#### Scenario: 时间戳转日期
- **WHEN** 用户输入一个 Unix 时间戳并指定秒或毫秒
- **THEN** 系统同时展示其本地时区与 UTC 的可读日期时间

#### Scenario: 日期转时间戳
- **WHEN** 用户输入一个日期时间
- **THEN** 系统输出对应的秒级与毫秒级时间戳

#### Scenario: 非法时间输入
- **WHEN** 用户输入无法解析的时间戳或日期
- **THEN** 系统展示可读错误提示,不产生错误结果

### Requirement: UUID v4 批量生成
编码转换工具 SHALL 提供 UUID v4 的生成,支持一次生成指定数量,并可一键复制。

#### Scenario: 生成单个 UUID
- **WHEN** 用户点击「生成」而未指定数量
- **THEN** 系统生成 1 个符合 v4 格式的 UUID

#### Scenario: 批量生成
- **WHEN** 用户指定数量 N 并点击「生成」
- **THEN** 系统生成 N 个互不相同的 v4 UUID,逐行展示

### Requirement: JWT 解析
编码转换工具 SHALL 解析 JWT 的 header 与 payload(Base64URL 解码后按 JSON 展示),SHALL NOT 校验签名,并 MUST 在界面明确标注「未校验签名」。

#### Scenario: 解析合法 JWT
- **WHEN** 用户粘贴一个三段式 JWT
- **THEN** 系统分别解码并以格式化 JSON 展示 header 与 payload

#### Scenario: 明示不验签
- **WHEN** 系统展示 JWT 解析结果
- **THEN** 界面明确标注签名未被校验(仅解码用途)

#### Scenario: 非法 JWT
- **WHEN** 用户输入段数不足或含非法 Base64URL 的字符串
- **THEN** 系统展示可读错误提示

### Requirement: 正则测试器
编码转换工具 SHALL 提供正则测试:接受 pattern、flags 与测试文本,高亮全部匹配并列出捕获分组;对导致异常的非法 pattern SHALL 给出错误提示,并对超长输入采取保护以避免界面卡死。

#### Scenario: 匹配高亮
- **WHEN** 用户输入合法 pattern、flags 与测试文本
- **THEN** 系统在测试文本中高亮所有匹配片段

#### Scenario: 捕获分组展示
- **WHEN** pattern 含捕获分组且存在匹配
- **THEN** 系统按匹配列出各分组的值

#### Scenario: 非法 pattern
- **WHEN** 用户输入语法非法的 pattern
- **THEN** 系统展示可读错误提示,不抛出未捕获异常
