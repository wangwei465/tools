# es-query-console Specification

## Purpose
TBD - created by archiving change add-es-mongo-client. Update Purpose after archive.
## Requirements
### Requirement: DSL 查询编辑与执行

系统 SHALL 提供 JSON 编辑器编写 ES 查询 DSL 并针对所选索引执行 `_search`，编辑器 SHALL 提供 JSON 语法高亮，非法 JSON SHALL 在执行前给出可读提示。

#### Scenario: 执行查询

- **WHEN** 用户输入合法的 DSL JSON 并点击执行
- **THEN** 系统对所选索引执行 `_search` 并展示命中结果

#### Scenario: 非法 JSON 前置拦截

- **WHEN** 用户输入的 DSL 不是合法 JSON
- **THEN** 系统在发起请求前提示 JSON 格式错误，不发起请求

#### Scenario: 查询语法错误

- **WHEN** DSL 合法但 ES 返回查询语法错误
- **THEN** 系统展示 ES 返回的错误原因，供用户定位

#### Scenario: 未选择索引

- **WHEN** 用户未选择索引即执行查询
- **THEN** 系统提示需要先选择索引

### Requirement: 结果的双视图展示

查询结果 SHALL 同时支持 JSON 视图与表格视图，表格视图的列 SHALL 取所有命中文档的字段并集，缺失字段留空。

#### Scenario: JSON 视图

- **WHEN** 用户查看查询结果的 JSON 视图
- **THEN** 系统以格式化的只读 JSON 展示完整响应

#### Scenario: 表格视图列为字段并集

- **WHEN** 命中的文档字段不一致
- **THEN** 表格的列为所有文档字段的并集，某文档缺失的字段在其行内留空

#### Scenario: 嵌套对象在表格中的呈现

- **WHEN** 某字段的值是嵌套对象或数组
- **THEN** 表格单元格以折叠的 JSON 片段展示该值，不做递归展开

### Requirement: 分页与执行信息

系统 SHALL 支持翻页浏览查询结果，并展示本次查询的命中总数与耗时；超出 ES 深分页上限时 SHALL 给出可读提示。

#### Scenario: 翻页

- **WHEN** 用户点击下一页
- **THEN** 系统以新的偏移量重新查询并展示对应结果

#### Scenario: 展示命中数与耗时

- **WHEN** 查询成功返回
- **THEN** 系统展示命中总数与查询耗时

#### Scenario: 超出深分页上限

- **WHEN** 用户翻页至超过集群 `max_result_window` 的位置
- **THEN** 系统展示可读提示，说明原因并建议缩小过滤条件或改用 search_after，而非展示底层错误

### Requirement: 查询台的写操作受闸门约束

在查询台中执行的非查询类操作 SHALL 同样经过安全闸门判定，只读连接拦截写操作，危险操作需二次确认。

#### Scenario: 只读连接拦截写操作

- **WHEN** 用户在只读连接的查询台中提交写操作
- **THEN** 系统拒绝执行并提示该连接为只读模式

#### Scenario: 危险操作弹出确认

- **WHEN** 用户在查询台中提交删除索引一类的危险操作
- **THEN** 系统要求二次确认并回显完整操作内容后才执行

