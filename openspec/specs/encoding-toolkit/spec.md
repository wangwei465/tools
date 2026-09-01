# encoding-toolkit Specification

## Purpose

编码转换面板——单页多标签的纯前端开发者转换工具,涵盖 JSON⇔YAML、Base64、URL、时间戳⇔日期、UUID 生成、JWT 解析、正则测试、Cron 解析、分布式 ID 解析、字符编码排查、乱码还原、进制转换与位运算等高频离线转换,全部客户端计算、不落库、不发网络请求;含工具导航挂载与统一的输入/输出/复制/错误交互。

## Requirements

### Requirement: 工具挂载与面板布局
编码转换工具 SHALL 作为独立菜单挂载到系统外壳,在 `Navigation` 的工具导航中出现,并以单页多标签(十二个转换器)的方式组织,复用暗色设计系统;新增本工具不影响任何既有工具。

#### Scenario: 从导航进入
- **WHEN** 用户点击导航中的「编码转换」入口
- **THEN** 系统在外壳内加载 `/convert` 页面,展示转换器标签栏,且全局导航保持可用

#### Scenario: 切换转换器标签
- **WHEN** 用户在面板内点击某个转换器标签(如「Base64」)
- **THEN** 系统展示该转换器的输入/输出区,其余转换器内容隐藏,当前标签明确高亮

#### Scenario: 不影响既有工具
- **WHEN** 编码转换工具被加入导航
- **THEN** 数据比对 / 生成签名 / 接口调试 / Redis管理 / 数据源 / 加解密 / SQL 工具 的行为与路由均不受影响

#### Scenario: 新增转换器不影响既有转换器
- **WHEN** 新的转换器标签被加入面板
- **THEN** 既有转换器的输入、输出与错误提示行为均不发生变化

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

### Requirement: Cron 表达式解析

编码转换工具 SHALL 解析标准 5 段与 6 段 cron 表达式，展示各字段的可读描述，并按用户指定的基准时间给出未来 N 次执行时间；无法解析的表达式 SHALL 给出可读提示，MUST NOT 输出猜测的执行时间。

#### Scenario: 解析并预览执行时间

- **WHEN** 用户输入合法的 cron 表达式
- **THEN** 系统展示各字段的可读描述，并列出自当前时间起未来若干次的执行时间

#### Scenario: 指定预览次数

- **WHEN** 用户指定预览次数 N
- **THEN** 系统列出 N 次执行时间

#### Scenario: 指定基准时间

- **WHEN** 用户指定一个基准时间而非默认的当前时间
- **THEN** 系统以该基准时间为起点计算后续执行时间

#### Scenario: 区分 5 段与 6 段

- **WHEN** 用户输入 6 段表达式（含秒字段）
- **THEN** 系统按含秒语义解析，并在界面标明当前按 6 段解析

#### Scenario: 非法表达式提示

- **WHEN** 用户输入字段数不合法或取值越界的表达式
- **THEN** 系统展示可读错误提示，说明大致原因，不列出任何执行时间

#### Scenario: 不支持的扩展语法明示

- **WHEN** 表达式使用了 Quartz 扩展语法（如 `L` / `W` / `#`）而解析失败
- **THEN** 系统明确提示不支持扩展语法，而非给出错误的执行时间

### Requirement: 分布式 ID 解析

编码转换工具 SHALL 反解雪花（Snowflake）ID 与 MongoDB ObjectId：雪花 ID 展示生成时间、机器位与序列号，其起始纪元与位宽 SHALL 可配置；ObjectId 展示生成时间。解析 SHALL 使用大整数精度，MUST NOT 因 IEEE 754 精度丢失而产出错误结果。

#### Scenario: 解析雪花 ID

- **WHEN** 用户输入一个雪花 ID 并使用默认的纪元与位宽
- **THEN** 系统展示其生成时间（本地与 UTC）、机器位与序列号

#### Scenario: 自定义纪元

- **WHEN** 用户修改起始纪元或选择预设纪元
- **THEN** 系统按该纪元重新计算并展示生成时间

#### Scenario: 自定义位宽

- **WHEN** 用户修改时间戳位 / 机器位 / 序列位的位宽
- **THEN** 系统按新的位分配重新拆解 ID 并展示各段值

#### Scenario: 位宽校验

- **WHEN** 用户配置的三段位宽之和超过 63
- **THEN** 系统展示错误提示，不产出解析结果

#### Scenario: 大整数精度

- **WHEN** 用户输入超过 `Number.MAX_SAFE_INTEGER` 的雪花 ID
- **THEN** 系统仍给出精确的各段拆解结果，不发生精度丢失

#### Scenario: 解析 ObjectId

- **WHEN** 用户输入 24 位十六进制的 MongoDB ObjectId
- **THEN** 系统展示其前 4 字节所编码的生成时间（本地与 UTC）

#### Scenario: 格式自动分流

- **WHEN** 用户输入 24 位十六进制字符串或纯数字字符串
- **THEN** 系统分别按 ObjectId 与雪花 ID 解析，用户无需手工切换类型

#### Scenario: 非法输入提示

- **WHEN** 用户输入既非合法 ObjectId 也非合法整数
- **THEN** 系统展示可读错误提示

### Requirement: 字符编码排查与乱码还原

编码转换工具 SHALL 提供字符级编码视图：逐字符展示 code point、UTF-8 / UTF-16 / Latin-1 字节及 `\uXXXX` / `%XX` / HTML 实体表示；并 SHALL 提供乱码还原，对被错误解码的文本枚举常见编码组合尝试还原，按可信度排序展示候选结果，且 SHALL 明确标注已丢失信息的乱码不可还原。

#### Scenario: 逐字符编码视图

- **WHEN** 用户输入一段含中文的文本
- **THEN** 系统逐字符展示其 code point 与 UTF-8 / UTF-16 / Latin-1 字节序列

#### Scenario: 转义形式展示

- **WHEN** 系统展示字符编码信息
- **THEN** 同时给出该字符的 `\uXXXX`、`%XX` 与 HTML 实体表示，且各表示均可复制

#### Scenario: 乱码还原候选

- **WHEN** 用户输入一段乱码文本并执行还原
- **THEN** 系统枚举常见的（原编码 × 误解码）组合，展示多个候选还原结果并按可信度排序

#### Scenario: 明示不可逆

- **WHEN** 乱码中含有替换字符 U+FFFD
- **THEN** 系统明确标注该乱码在误解码时已丢失信息、无法完整还原

#### Scenario: 编码不受支持时降级

- **WHEN** 当前浏览器不支持某个候选编码
- **THEN** 系统跳过该候选并在结果区标注，其余候选正常展示，不报错、不空白

#### Scenario: GBK 字节解码

- **WHEN** 用户粘贴一串 GBK 十六进制字节并选择按 GBK 解码
- **THEN** 系统展示解码后的文本

#### Scenario: 超长输入保护

- **WHEN** 用户输入的文本长度超过界面可承受的阈值
- **THEN** 系统限制逐字符视图的展示条数并给出提示，界面不卡死

### Requirement: 进制转换与位运算

编码转换工具 SHALL 提供 2 / 8 / 10 / 16 进制的互转与位运算求值，全部使用大整数精度；并 SHALL 展示数值的置位情况，便于解读权限位与状态位图。非法输入 SHALL 给出可读提示。

#### Scenario: 进制互转

- **WHEN** 用户在任一进制输入框输入合法数值
- **THEN** 其余各进制的表示同步更新

#### Scenario: 大整数精度

- **WHEN** 用户输入超过 `Number.MAX_SAFE_INTEGER` 的数值
- **THEN** 各进制转换结果依然精确，不发生精度丢失

#### Scenario: 位运算求值

- **WHEN** 用户输入含 `&` / `|` / `^` / `~` / `<<` / `>>` 的表达式
- **THEN** 系统按大整数语义求值并以各进制展示结果

#### Scenario: 置位解读

- **WHEN** 系统展示一个数值的转换结果
- **THEN** 同时列出该数值中被置为 1 的位序号及其对应的权重值

#### Scenario: 非法输入提示

- **WHEN** 用户输入不符合所选进制的字符，或位运算表达式语法非法
- **THEN** 系统展示可读错误提示，不产出错误结果

### Requirement: JSONPath 提取器
编码转换工具 SHALL 提供 JSONPath 提取器:接受任意粘贴的 JSON 文本与一个 JSONPath 表达式,展示全部命中值及其在源文档中的路径;结果 SHALL 可复制;非法输入 SHALL 按 JSON 非法 / 表达式非法 / 零命中三类分别给出反馈。

#### Scenario: 对粘贴的 JSON 求值
- **WHEN** 用户粘贴一段 JSON 并输入合法的 JSONPath 表达式
- **THEN** 系统展示该表达式的全部命中值及对应路径

#### Scenario: 复制结果
- **WHEN** 用户对求值结果执行复制
- **THEN** 系统将命中结果写入剪贴板并给出复制成功的反馈

#### Scenario: 输入非法 JSON
- **WHEN** 用户粘贴的文本不是合法 JSON
- **THEN** 系统提示 JSON 非法,不影响其他转换器

#### Scenario: 输入非法表达式
- **WHEN** 用户输入语法非法的 JSONPath 表达式
- **THEN** 系统提示表达式语法错误,且与 JSON 非法的提示明确区分

#### Scenario: 零命中提示
- **WHEN** 表达式合法但在文档中无匹配
- **THEN** 系统以「无匹配」提示呈现,不使用错误样式
