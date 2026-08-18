## ADDED Requirements

### Requirement: find 查询

系统 SHALL 支持对所选集合执行 `find`，可配置过滤条件、投影、排序与返回条数，各项均以 JSON 编辑器输入，非法 JSON SHALL 在执行前给出可读提示。

#### Scenario: 执行 find

- **WHEN** 用户输入合法的过滤条件 JSON 并执行
- **THEN** 系统返回匹配的文档并展示

#### Scenario: 空过滤条件返回全部

- **WHEN** 用户以空对象作为过滤条件执行 find
- **THEN** 系统按分页返回该集合的文档（读取操作不受危险操作限制）

#### Scenario: 投影与排序

- **WHEN** 用户指定投影字段与排序规则
- **THEN** 返回结果仅含指定字段并按指定规则排序

#### Scenario: 非法 JSON 前置拦截

- **WHEN** 过滤条件、投影或排序中任一项不是合法 JSON
- **THEN** 系统在发起查询前提示该项的 JSON 格式错误，不发起查询

### Requirement: aggregate 管道

系统 SHALL 支持对所选集合执行聚合管道，管道以 JSON 数组形式输入，执行错误 SHALL 展示可读原因。

#### Scenario: 执行聚合

- **WHEN** 用户输入合法的聚合管道数组并执行
- **THEN** 系统返回聚合结果并展示

#### Scenario: 管道不是数组

- **WHEN** 用户输入的管道 JSON 不是数组
- **THEN** 系统提示聚合管道必须为数组，不发起查询

#### Scenario: 管道阶段错误

- **WHEN** 管道中存在 MongoDB 拒绝的阶段或操作符
- **THEN** 系统展示驱动返回的错误原因，供用户定位

### Requirement: 结果的双视图展示

查询结果 SHALL 同时支持 JSON 视图与表格视图，表格视图的列 SHALL 取所有返回文档的字段并集，缺失字段留空。

#### Scenario: JSON 视图

- **WHEN** 用户查看结果的 JSON 视图
- **THEN** 系统以格式化的只读 JSON 展示返回的文档

#### Scenario: 表格视图列为字段并集

- **WHEN** 返回的文档字段不一致
- **THEN** 表格的列为所有文档字段的并集，某文档缺失的字段在其行内留空

#### Scenario: 特殊类型的呈现

- **WHEN** 文档中含 ObjectId、Date 等 BSON 特有类型
- **THEN** 系统以可读的字符串形式展示这些值，不展示为空对象

### Requirement: 分页与执行信息

系统 SHALL 支持翻页浏览查询结果并展示本次查询耗时；大偏移量翻页 SHALL 给出性能提示。

#### Scenario: 翻页

- **WHEN** 用户点击下一页
- **THEN** 系统以新的偏移量重新查询并展示对应结果

#### Scenario: 展示耗时

- **WHEN** 查询成功返回
- **THEN** 系统展示本次查询耗时

#### Scenario: 大偏移量提示

- **WHEN** 用户翻页至偏移量很大的位置
- **THEN** 系统提示大偏移量查询会全扫描，建议缩小过滤条件

### Requirement: 查询台的写操作受闸门约束

在查询台中执行的非查询类操作 SHALL 同样经过安全闸门判定，只读连接拦截写操作，危险操作需二次确认。

#### Scenario: 只读连接拦截写操作

- **WHEN** 用户在只读连接的查询台中提交 `updateMany`
- **THEN** 系统拒绝执行并提示该连接为只读模式

#### Scenario: 空条件批量删除需确认

- **WHEN** 用户提交过滤条件为空对象的 `deleteMany`
- **THEN** 系统要求二次确认，并在提示中说明该操作将影响集合内全部文档
