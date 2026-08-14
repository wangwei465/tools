## ADDED Requirements

### Requirement: 索引列表

系统 SHALL 展示所选 ES 连接下的索引列表，每行包含索引名、文档数、存储大小与健康状态，并支持按名称过滤。

#### Scenario: 展示索引列表

- **WHEN** 用户选中一个 ES 连接
- **THEN** 系统展示该集群的索引列表，含索引名、文档数、存储大小与健康状态

#### Scenario: 按名称过滤

- **WHEN** 用户在过滤框输入关键词
- **THEN** 列表仅展示索引名包含该关键词的条目

#### Scenario: 集群不可达

- **WHEN** 所选连接的集群不可达
- **THEN** 系统展示可读的错误提示，页面不崩溃

### Requirement: Mapping 字段浏览

系统 SHALL 展示所选索引的 mapping 字段结构，嵌套字段以树形层级呈现，每个字段展示其类型。

#### Scenario: 查看字段结构

- **WHEN** 用户点击某个索引
- **THEN** 系统展示该索引的 mapping 字段列表，含字段名与字段类型

#### Scenario: 嵌套字段树形展示

- **WHEN** 索引的 mapping 含 object 或 nested 类型的嵌套字段
- **THEN** 系统以可展开的树形层级展示其子字段

#### Scenario: 索引无 mapping

- **WHEN** 所选索引没有定义任何字段
- **THEN** 系统展示空状态提示而非报错

### Requirement: 跨版本响应兼容

系统 SHALL 兼容不同 ES 版本在响应形状上的差异，无法识别的响应 SHALL 原样展示原始 JSON 而非报错。

#### Scenario: 兼容不同版本的文档总数字段

- **WHEN** 集群返回的文档总数为数字形式或 `{value, relation}` 对象形式
- **THEN** 系统均能正确解析并展示总数

#### Scenario: 无法解析时展示原文

- **WHEN** 响应结构无法按预期解析
- **THEN** 系统展示原始 JSON 响应，供用户自行判读
