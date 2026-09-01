## ADDED Requirements

### Requirement: 工具挂载与面板布局

文本工具 SHALL 作为独立菜单挂载到系统外壳，在 `Navigation` 的工具导航中出现，并以单页多标签的方式组织各处理面板，复用暗色设计系统；新增本工具 MUST NOT 改变任何既有工具的行为与路由。

#### Scenario: 从导航进入

- **WHEN** 用户点击导航中的「文本工具」入口
- **THEN** 系统在外壳内加载 `/text-kit` 页面，展示面板标签栏，且全局导航保持可用

#### Scenario: 切换面板标签

- **WHEN** 用户点击某个面板标签（如「表格转换」）
- **THEN** 系统展示该面板的输入/输出区，其余面板内容隐藏，当前标签明确高亮

#### Scenario: 切换标签不丢输入

- **WHEN** 用户在某面板输入内容后切换到其他标签，再切回该面板
- **THEN** 此前输入的内容与计算结果仍然保留

#### Scenario: 不影响既有工具

- **WHEN** 文本工具被加入导航
- **THEN** 数据比对 / 生成签名 / 接口调试 / Redis管理 / 数据源 / 编码转换 / 加解密 / SQL 工具 的行为与路由均不受影响

### Requirement: 纯客户端与隐私约束

文本工具 SHALL 在浏览器端完成所有计算，MUST NOT 发起任何网络请求，MUST NOT 将输入内容持久化到 `app.db` 或任何后端存储。

#### Scenario: 处理不出网

- **WHEN** 用户在任一面板执行处理
- **THEN** 结果由客户端计算得出，不产生对后端 API 或第三方服务的请求

#### Scenario: 无持久化

- **WHEN** 用户输入内容并处理后刷新或离开页面
- **THEN** 输入内容不被写入后端库

### Requirement: 与既有工具的功能边界

文本工具 MUST NOT 重复实现「编码转换」与「SQL 工具」已覆盖的能力；在用户可能误撞的面板中，系统 SHALL 给出指向正确工具的指引。

#### Scenario: 不重复实现既有转换

- **WHEN** 用户在文本工具中查找 JSON⇄YAML、Base64、URL 编码、JWT 解析或进制转换
- **THEN** 文本工具不提供这些能力，相关面板给出指引说明该能力位于「编码转换」

#### Scenario: 表格转换指向 SQL 工具

- **WHEN** 用户在表格转换面板中需要生成 SQL `INSERT` 语句
- **THEN** 面板给出指引说明该能力位于「SQL 工具」，本面板不提供该输出格式

#### Scenario: 替换面板指向正则测试

- **WHEN** 用户需要调试正则表达式的匹配与捕获组
- **THEN** 批量替换面板给出指引说明正则测试位于「编码转换」

### Requirement: 行级文本处理

系统 SHALL 提供按行处理文本的能力，涵盖去重、排序、清理、加缀、加行号与整体反转；去重 SHALL 保留首次出现的顺序。

#### Scenario: 去重保序

- **WHEN** 用户对含重复行的文本执行去重
- **THEN** 系统保留每个不同行首次出现的位置与顺序，移除后续重复项

#### Scenario: 多种排序方式

- **WHEN** 用户选择按字典序、数值或行长度排序，并可选反序
- **THEN** 系统按所选方式重排各行

#### Scenario: 数值排序容错

- **WHEN** 用户选择数值排序但部分行不是合法数值
- **THEN** 系统给出可读提示，MUST NOT 静默产出错误顺序

#### Scenario: 清理空白

- **WHEN** 用户执行去空行或去首尾空白
- **THEN** 系统移除空行或各行两端的空白字符，其余内容不变

#### Scenario: 加前缀后缀与行号

- **WHEN** 用户指定前缀、后缀或启用行号
- **THEN** 系统为每一行加上相应内容，行号从用户指定的起始值开始

### Requirement: 两组文本的集合运算

系统 SHALL 提供两组文本按行做交集、差集与并集的能力，结果 SHALL 去重。

#### Scenario: 求交集

- **WHEN** 用户输入两组文本并选择交集
- **THEN** 系统输出同时存在于两组中的行

#### Scenario: 求差集

- **WHEN** 用户输入两组文本并选择差集
- **THEN** 系统输出存在于左侧但不存在于右侧的行

#### Scenario: 求并集

- **WHEN** 用户输入两组文本并选择并集
- **THEN** 系统输出两组去重合并后的行

### Requirement: 命名风格转换

系统 SHALL 支持在 `UPPER`、`lower`、`Title`、`camelCase`、`PascalCase`、`snake_case`、`kebab-case`、`CONSTANT_CASE` 之间转换，逐行批量处理；转换 SHALL 先将输入分词再按目标风格重组，分词规则 SHALL 明确且一致。

#### Scenario: 驼峰转下划线

- **WHEN** 用户对 `fooBarBaz` 选择 `snake_case`
- **THEN** 系统输出 `foo_bar_baz`

#### Scenario: 连续大写正确分词

- **WHEN** 用户对 `HTTPServer` 选择 `snake_case`
- **THEN** 系统输出 `http_server`

#### Scenario: 字母后的数字不被切开

- **WHEN** 用户对 `address1` 选择 `snake_case`
- **THEN** 系统输出 `address1`，数字不被切分为独立的词

#### Scenario: 数字后接大写时切分

- **WHEN** 用户对 `user2Name` 选择 `snake_case`
- **THEN** 系统输出 `user2_name`

#### Scenario: 混合分隔符

- **WHEN** 用户对 `foo_barBaz` 选择 `kebab-case`
- **THEN** 系统输出 `foo-bar-baz`

#### Scenario: 逐行批量转换

- **WHEN** 用户输入多行内容并选择目标风格
- **THEN** 系统对每一行独立转换，行数与顺序保持不变

### Requirement: 批量替换

系统 SHALL 提供字面量与正则两种替换模式，作用于整段文本并输出替换后的结果与替换次数；正则模式 SHALL 支持捕获组引用；非法正则 SHALL 给出可读错误提示。

#### Scenario: 字面量替换

- **WHEN** 用户以字面量模式替换某个子串
- **THEN** 系统替换全部出现处并展示替换次数

#### Scenario: 正则替换与捕获组

- **WHEN** 用户以正则模式替换，并在替换内容中引用捕获组
- **THEN** 系统按捕获组内容完成替换

#### Scenario: 非法正则

- **WHEN** 用户输入语法非法的正则表达式
- **THEN** 系统展示可读的错误提示，原文保持不变，页面不崩溃

#### Scenario: 无匹配

- **WHEN** 替换的匹配内容在原文中不存在
- **THEN** 系统输出与原文相同的结果并提示替换次数为 0

### Requirement: 表格格式互转

系统 SHALL 支持 CSV/TSV、JSON 数组与 Markdown 表格三者之间的互转，转换 SHALL 经由统一的二维表格中枢模型；CSV 解析 SHALL 复用仓库中唯一的一份解析实现，MUST NOT 另写一份。

#### Scenario: CSV 转 JSON

- **WHEN** 用户输入带表头的 CSV 并转为 JSON
- **THEN** 系统输出以表头为键的对象数组

#### Scenario: JSON 转 Markdown 表格

- **WHEN** 用户输入对象数组并转为 Markdown 表格
- **THEN** 系统输出含表头行与对齐行的 Markdown 表格

#### Scenario: Markdown 表格转 CSV

- **WHEN** 用户输入 Markdown 表格并转为 CSV
- **THEN** 系统输出对应的 CSV 文本

#### Scenario: 字段并集为列

- **WHEN** JSON 数组中各对象的字段不完全一致
- **THEN** 系统取所有字段的并集作为列，缺失字段的单元格留空

#### Scenario: 嵌套值不展开

- **WHEN** JSON 中某字段的值为对象或数组
- **THEN** 系统将该单元格序列化为紧凑 JSON 文本，不递归展开为多列

#### Scenario: 分隔符与表头可选

- **WHEN** 用户选择分隔符（逗号 / 制表符 / 自定义）并指定首行是否为表头
- **THEN** 系统按所选设置解析与输出

#### Scenario: 非法输入可读报错

- **WHEN** 输入的 JSON 非法或 Markdown 表格无法解析
- **THEN** 系统给出可读的错误提示，MUST NOT 产出错位的表格

### Requirement: 文本统计

系统 SHALL 展示输入文本的字符数（含空白与不含空白）、行数、词数、UTF-8 字节数，以及各行长度的最大值与最小值。

#### Scenario: 展示基础度量

- **WHEN** 用户输入一段文本
- **THEN** 系统展示字符数、行数、词数与 UTF-8 字节数

#### Scenario: 区分含空白与不含空白

- **WHEN** 文本中包含空格、制表符或换行
- **THEN** 系统分别展示含空白与不含空白的字符数

#### Scenario: 非 ASCII 字节数正确

- **WHEN** 文本中包含中文等多字节字符
- **THEN** 系统展示的 UTF-8 字节数与实际编码后的字节数一致

#### Scenario: 空输入

- **WHEN** 输入为空
- **THEN** 系统展示各项为 0，不报错

### Requirement: 处理规模上限

系统 SHALL 为输入设置体积上限，超出上限时 SHALL 前置拒绝并给出说明上限值的可读提示，MUST NOT 让页面陷入无响应。

#### Scenario: 超大输入被拒绝

- **WHEN** 用户粘贴的文本超过体积上限
- **THEN** 系统给出说明上限值的可读提示并停止计算，页面保持可交互

#### Scenario: 上限内正常处理

- **WHEN** 输入体积在上限之内
- **THEN** 系统正常完成处理

### Requirement: 处理逻辑可独立测试

各面板的处理逻辑 SHALL 实现为不依赖 UI 与网络的纯函数，失败以结果对象返回而非抛出异常，使其能被单元测试直接覆盖。

#### Scenario: 纯函数可直接测试

- **WHEN** 测试代码直接调用处理函数并传入文本
- **THEN** 无需渲染组件即可断言处理结果

#### Scenario: 失败不抛异常

- **WHEN** 处理函数遇到非法输入
- **THEN** 函数返回带可读错误信息的结果对象，不向调用方抛出异常
