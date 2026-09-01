## ADDED Requirements

### Requirement: SQL 编辑与执行

系统 SHALL 提供 SQL 编辑区与执行入口，执行结果 SHALL 展示返回行数与耗时；写语句 SHALL 展示影响行数。

#### Scenario: 执行查询语句

- **WHEN** 用户输入一条 `SELECT` 语句并执行
- **THEN** 系统返回结果集，并展示返回行数与执行耗时

#### Scenario: 执行写语句

- **WHEN** 用户在读写连接上执行一条带 WHERE 的 `UPDATE` 语句
- **THEN** 系统执行该语句并展示影响行数与执行耗时

#### Scenario: 语法错误可读回显

- **WHEN** 用户执行一条语法错误的 SQL
- **THEN** 系统展示数据库返回的错误信息，不抛出未捕获异常，编辑区内容保留

#### Scenario: 未选择连接

- **WHEN** 用户在未选择连接时点击执行
- **THEN** 系统提示需要先选择连接，不发起请求

### Requirement: 结果的表格与 JSON 双视图

查询结果 SHALL 默认以表格视图呈现，并 SHALL 可切换到 JSON 视图；表格的列顺序 SHALL 与 SQL 结果集返回的列顺序一致，MUST NOT 按字段并集或字母序重排。

#### Scenario: 表格保留列顺序

- **WHEN** 用户执行 `SELECT b, a FROM t`
- **THEN** 表格的列依次为 `b`、`a`，与结果集顺序一致

#### Scenario: 切换到 JSON 视图

- **WHEN** 用户在结果区切换到 JSON 视图
- **THEN** 系统以 JSON 展示同一批结果行

#### Scenario: 空结果集

- **WHEN** 查询未命中任何行
- **THEN** 系统展示空状态提示，并仍然展示结果集的列名与耗时

### Requirement: 特殊值的保真呈现

结果中的值 SHALL 按「所见等于库中所存」的原则呈现：超出 JavaScript 安全整数范围的整数 SHALL 以字符串呈现而不丢精度；日期与时间 SHALL 保留数据库返回的原始文本而不做时区转换；二进制值 SHALL 以十六进制摘要与字节长度呈现；`NULL` SHALL 与空字符串在界面上可区分。

#### Scenario: 大整数不丢精度

- **WHEN** 某列为 BIGINT 且值超过 JavaScript 安全整数范围
- **THEN** 界面展示的数值与数据库中的值完全一致，末位不发生偏移

#### Scenario: 时间不被时区转换

- **WHEN** 某列为 DATETIME 或 TIMESTAMP
- **THEN** 界面展示的时间文本与数据库中存储的一致，不因运行环境时区而改变

#### Scenario: 区分 NULL 与空字符串

- **WHEN** 结果中同时存在 `NULL` 值与空字符串值
- **THEN** 界面以不同的呈现方式区分二者，用户可判断字段是否被写入

#### Scenario: 二进制值不撑爆表格

- **WHEN** 某列为二进制类型且内容较大
- **THEN** 界面展示其十六进制摘要与字节长度，不将完整内容渲染进单元格

### Requirement: 裸 SELECT 的行数上限与改写回显

当语句为单条、只读、以 `SELECT` 或 `WITH` 开头且不含 `LIMIT` / `FETCH` / `FOR UPDATE` / `INTO` 时，系统 SHALL 追加行数上限后执行，并 SHALL 在结果区回显实际执行的 SQL；不满足改写条件时，系统 SHALL 在读取侧按硬上限截断并明确标注结果已截断。

#### Scenario: 注入上限并回显

- **WHEN** 用户执行不带 `LIMIT` 的 `SELECT * FROM t`
- **THEN** 系统追加行数上限后执行，并在结果区展示实际执行的完整 SQL

#### Scenario: 已有 LIMIT 时不改写

- **WHEN** 用户执行的语句已包含 `LIMIT`
- **THEN** 系统原样执行，不追加也不修改该语句

#### Scenario: 不可改写时截断并标注

- **WHEN** 语句不满足改写条件但返回行数超过硬上限
- **THEN** 系统截断结果并明确标注「结果已截断」及其上限值，MUST NOT 静默丢弃

### Requirement: 危险操作确认与只读拦截的界面反馈

查询台 SHALL 接入既有的安全闸门：被只读模式拦截时 SHALL 展示拒绝原因；需二次确认时 SHALL 弹出确认框并回显将要执行的完整 SQL，确认后方可执行。

#### Scenario: 只读连接上的写语句被拒

- **WHEN** 用户在只读连接上执行 `UPDATE`
- **THEN** 系统拒绝执行并展示该连接为只读模式的可读提示

#### Scenario: 危险语句需确认

- **WHEN** 用户执行不带 WHERE 的 `DELETE FROM t`
- **THEN** 系统弹出二次确认框，框内回显将要执行的完整 SQL 并说明该语句将影响全表

#### Scenario: 确认后执行

- **WHEN** 用户在确认框中确认
- **THEN** 系统执行该语句并返回影响行数

### Requirement: 执行超时的可读提示

系统 SHALL 为语句执行设置超时，超时 SHALL 返回说明为超时的可读提示，MUST NOT 让请求无限期挂起。

#### Scenario: 长查询超时

- **WHEN** 某条查询的执行时间超过设定上限
- **THEN** 系统中止等待并提示该语句执行超时，明确区别于语法错误

#### Scenario: 只读事务下的写意图语句

- **WHEN** 用户在只读连接上执行 `SELECT … FOR UPDATE`
- **THEN** 系统展示解释性提示，说明该语句带写意图故在只读连接下不可用，而非透出数据库原始错误
