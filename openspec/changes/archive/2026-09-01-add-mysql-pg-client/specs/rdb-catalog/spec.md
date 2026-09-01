## ADDED Requirements

### Requirement: 库与表的层级浏览

系统 SHALL 以「库 → schema → 表」三级模型展示关系型数据源的结构，MySQL 的 schema 层 SHALL 折叠（schema 恒等于库），PostgreSQL SHALL 展示完整三级。

#### Scenario: 浏览 MySQL 库表

- **WHEN** 用户选择一个 MySQL 连接
- **THEN** 系统展示该账号可见的库列表，展开某个库后展示其表与视图，界面不出现 schema 层级

#### Scenario: 浏览 PostgreSQL 库表

- **WHEN** 用户选择一个 PostgreSQL 连接
- **THEN** 系统展示连接串所绑定的那一个库，展开后展示其 schema 列表，再展开 schema 后展示表与视图

#### Scenario: PostgreSQL 不可跨库

- **WHEN** 用户在 PostgreSQL 连接下查看库列表
- **THEN** 界面明确说明该连接绑定单个库、切换库需另建连接，不提供无效的切库入口

#### Scenario: 区分表与视图

- **WHEN** 某个库或 schema 下同时存在表与视图
- **THEN** 系统在列表中标示各条目的类型，使二者可区分

### Requirement: 表结构与索引查看

系统 SHALL 展示指定表的列结构（列名、数据类型、是否可空、默认值、是否主键、列注释）与索引信息（索引名、索引列、是否唯一）。

#### Scenario: 查看列结构

- **WHEN** 用户展开某张表
- **THEN** 系统展示该表的全部列及其数据类型、可空性、默认值、主键标记与注释

#### Scenario: 查看索引

- **WHEN** 用户查看某张表的索引信息
- **THEN** 系统展示该表的索引名、索引所含列及其唯一性

#### Scenario: 无注释时不报错

- **WHEN** 某张表或某个列没有注释
- **THEN** 系统正常展示其余信息，注释列留空而非报错

### Requirement: 目录懒加载与过滤

目录数据 SHALL 按层级懒加载——展开某一层时才查询其下一层，MUST NOT 在进入工具时一次性拉取全部库表结构；系统 SHALL 提供按名称过滤表的能力。

#### Scenario: 展开时才查询

- **WHEN** 用户进入数据源工具并选择某个关系型连接
- **THEN** 系统仅查询库列表，不查询任何表的列与索引

#### Scenario: 按表名过滤

- **WHEN** 用户在表列表的过滤框中输入关键字
- **THEN** 系统仅展示名称匹配该关键字的表与视图

#### Scenario: 大库不阻塞界面

- **WHEN** 某个库包含大量表
- **THEN** 系统在查询期间展示加载状态，界面保持可交互

### Requirement: 目录查询失败的可读提示

目录查询失败时系统 SHALL 返回可读的失败原因，MUST NOT 抛出未捕获异常或展示数据库原始堆栈。

#### Scenario: 目标不可达

- **WHEN** 数据库地址不可达或连接被拒绝
- **THEN** 系统展示可读的失败原因（如连接超时、地址不可达），并保持连接选择器可用

#### Scenario: 权限不足

- **WHEN** 当前账号无权读取某个库的元数据
- **THEN** 系统展示权限不足的可读提示，不影响其他库的浏览

### Requirement: 目录行映射可独立测试

元数据查询结果到目录模型的映射 SHALL 实现为不依赖真实数据库连接的纯函数，使其能被单元测试直接覆盖。

#### Scenario: 纯函数可直接测试

- **WHEN** 测试代码传入构造的 `information_schema` 结果行
- **THEN** 无需连接真实的 MySQL 或 PostgreSQL 即可断言映射出的列结构与索引信息
