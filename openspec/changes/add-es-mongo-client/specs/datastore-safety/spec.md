## ADDED Requirements

### Requirement: 服务端判定操作性质

系统 SHALL 在服务端判定每个操作是否为写操作、是否为危险操作，MUST NOT 依据前端传入的操作性质放行。

#### Scenario: 服务端独立判定

- **WHEN** 前端提交的请求声称某操作为只读，但服务端判定其为写操作
- **THEN** 系统以服务端判定为准，在只读连接上拒绝执行

#### Scenario: 判定结果可解释

- **WHEN** 某操作被判定为写或危险
- **THEN** 系统返回的拒绝信息说明该操作被归类的原因

### Requirement: 只读模式拦截写操作

当连接的 mode 为 readonly 时，系统 SHALL 拦截一切写操作并返回可读提示，只读操作 SHALL 正常放行。

#### Scenario: 拦截 ES 写操作

- **WHEN** 用户在只读 ES 连接上执行 `POST /{index}/_update_by_query`
- **THEN** 系统拒绝执行并提示该连接为只读模式

#### Scenario: 拦截 Mongo 写操作

- **WHEN** 用户在只读 MongoDB 连接上执行 `updateMany`
- **THEN** 系统拒绝执行并提示该连接为只读模式

#### Scenario: 放行只读操作

- **WHEN** 用户在只读连接上执行 `_search` 或 `find`
- **THEN** 系统正常执行并返回结果

### Requirement: 危险操作二次确认

系统 SHALL 将删除类与结构变更类操作判定为危险操作，危险操作在任何模式下 SHALL 仅在收到显式确认标记时才执行。

#### Scenario: 未确认时拒绝

- **WHEN** 用户执行 `DELETE /{index}` 但请求未携带确认标记
- **THEN** 系统拒绝执行，并返回需要二次确认的提示与将要执行的操作描述

#### Scenario: 确认后执行

- **WHEN** 用户在确认弹窗中确认后重新提交同一操作
- **THEN** 系统执行该操作

#### Scenario: 确认弹窗回显完整操作

- **WHEN** 系统要求对某危险操作二次确认
- **THEN** 界面回显将要执行的完整操作内容，供用户核对

### Requirement: ES 操作分类规则

系统 SHALL 依据 HTTP 方法与路径判定 ES 操作的性质：`_search`、`_cat`、`_mapping` 等查询类为只读；`_update_by_query`、写入文档为写操作；删除索引与 `_delete_by_query` 为危险操作。

#### Scenario: 查询类为只读

- **WHEN** 操作为 `POST /{index}/_search` 或 `GET /_cat/indices`
- **THEN** 系统判定为只读，在只读连接上放行

#### Scenario: 删除索引为危险

- **WHEN** 操作为 `DELETE /{index}`
- **THEN** 系统判定为危险操作，需二次确认

#### Scenario: 按查询删除为危险

- **WHEN** 操作为 `POST /{index}/_delete_by_query`
- **THEN** 系统判定为危险操作，需二次确认

### Requirement: MongoDB 操作分类规则

系统 SHALL 依据操作名与过滤条件判定 MongoDB 操作的性质：`find` 与 `aggregate` 为只读；`updateMany`、`deleteMany` 为写操作；`drop`、`dropDatabase` 为危险操作。当 `deleteMany` 或 `updateMany` 的过滤条件为空对象时，SHALL 升级为危险操作。

#### Scenario: 查询类为只读

- **WHEN** 操作为 `find` 或 `aggregate`
- **THEN** 系统判定为只读，在只读连接上放行

#### Scenario: drop 为危险

- **WHEN** 操作为 `drop` 或 `dropDatabase`
- **THEN** 系统判定为危险操作，需二次确认

#### Scenario: 空过滤条件的批量操作升级为危险

- **WHEN** 操作为 `deleteMany` 且过滤条件为空对象
- **THEN** 系统判定为危险操作，需二次确认，并在提示中说明该操作将影响集合内全部文档

#### Scenario: 带过滤条件的批量操作为普通写

- **WHEN** 操作为 `deleteMany` 且过滤条件非空
- **THEN** 系统判定为写操作，在读写模式的连接上无需二次确认即可执行

### Requirement: 分类逻辑可独立测试

操作分类 SHALL 实现为不依赖网络与数据库连接的纯函数，使其能被单元测试直接覆盖。

#### Scenario: 纯函数可直接测试

- **WHEN** 测试代码直接调用分类函数并传入操作描述
- **THEN** 无需连接真实的 ES 或 MongoDB 即可断言分类结果
