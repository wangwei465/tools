# mongo-catalog Specification

## Purpose
TBD - created by archiving change add-es-mongo-client. Update Purpose after archive.
## Requirements
### Requirement: 数据库与集合列表

系统 SHALL 展示所选 MongoDB 连接下的数据库列表，选中数据库后展示其集合列表，集合行包含文档数与索引数。

#### Scenario: 展示数据库列表

- **WHEN** 用户选中一个 MongoDB 连接
- **THEN** 系统展示该实例可访问的数据库列表

#### Scenario: 展示集合列表

- **WHEN** 用户点击某个数据库
- **THEN** 系统展示该库下的集合列表，含文档数与索引数

#### Scenario: 按名称过滤集合

- **WHEN** 用户在过滤框输入关键词
- **THEN** 列表仅展示名称包含该关键词的集合

#### Scenario: 实例不可达

- **WHEN** 所选连接的实例不可达
- **THEN** 系统展示可读的错误提示，页面不崩溃

### Requirement: 集合字段采样推断

系统 SHALL 通过采样集合中的文档推断其字段与类型并展示，且 SHALL 明确标注该结果为采样推断而非权威 schema，并展示采样条数。

#### Scenario: 展示推断字段

- **WHEN** 用户点击某个集合
- **THEN** 系统展示采样推断出的字段名与类型

#### Scenario: 标注采样性质

- **WHEN** 系统展示推断字段
- **THEN** 界面明确标注这是基于采样的推断结果，并展示实际采样的文档条数

#### Scenario: 字段类型不一致

- **WHEN** 采样文档中同名字段出现多种类型
- **THEN** 系统展示该字段观察到的全部类型，而非只取其一

#### Scenario: 空集合

- **WHEN** 所选集合内没有文档
- **THEN** 系统展示空状态提示而非报错

### Requirement: 索引信息展示

系统 SHALL 展示所选集合的索引定义，包含索引名与索引字段。

#### Scenario: 查看集合索引

- **WHEN** 用户查看某集合的索引信息
- **THEN** 系统展示该集合的索引列表，含索引名与索引所含字段

