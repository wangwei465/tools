## MODIFIED Requirements

### Requirement: 只读模式拦截写操作

当连接的 mode 为 readonly 时，系统 SHALL 拦截一切写操作并返回可读提示，只读操作 SHALL 正常放行。

#### Scenario: 拦截 ES 写操作

- **WHEN** 用户在只读 ES 连接上执行 `POST /{index}/_update_by_query`
- **THEN** 系统拒绝执行并提示该连接为只读模式

#### Scenario: 拦截 Mongo 写操作

- **WHEN** 用户在只读 MongoDB 连接上执行 `updateMany`
- **THEN** 系统拒绝执行并提示该连接为只读模式

#### Scenario: 拦截 SQL 写操作

- **WHEN** 用户在只读的 MySQL 或 PostgreSQL 连接上执行 `UPDATE` / `INSERT` / `DELETE`
- **THEN** 系统拒绝执行并提示该连接为只读模式

#### Scenario: 放行只读操作

- **WHEN** 用户在只读连接上执行 `_search` 或 `find`
- **THEN** 系统正常执行并返回结果

#### Scenario: 放行 SQL 查询

- **WHEN** 用户在只读的关系型连接上执行 `SELECT` 或 `EXPLAIN`
- **THEN** 系统正常执行并返回结果

### Requirement: 分类逻辑可独立测试

操作分类 SHALL 实现为不依赖网络与数据库连接的纯函数，使其能被单元测试直接覆盖。

#### Scenario: 纯函数可直接测试

- **WHEN** 测试代码直接调用分类函数并传入操作描述
- **THEN** 无需连接真实的 ES、MongoDB、MySQL 或 PostgreSQL 即可断言分类结果

#### Scenario: SQL 分类可直接测试

- **WHEN** 测试代码直接传入 SQL 文本调用分类函数
- **THEN** 无需连接真实数据库即可断言其只读 / 写 / 危险的判定结果与拒绝原因

## ADDED Requirements

### Requirement: SQL 操作分类规则

系统 SHALL 依据 SQL 语句的类型与结构判定其操作性质：`SELECT`、`WITH … SELECT`、`SHOW`、`EXPLAIN`、`DESCRIBE` 为只读；带 WHERE 的 `UPDATE` 与 `DELETE`、以及 `INSERT` 为写操作；`DROP`、`TRUNCATE`、`ALTER`、`RENAME`、`CREATE`、`GRANT`、`REVOKE` 为危险操作。当 `UPDATE` 或 `DELETE` 不带 WHERE 子句时，SHALL 升级为危险操作。

#### Scenario: 查询类为只读

- **WHEN** 语句为 `SELECT * FROM t WHERE id = 1` 或 `EXPLAIN SELECT …`
- **THEN** 系统判定为只读，在只读连接上放行

#### Scenario: CTE 查询为只读

- **WHEN** 语句为 `WITH x AS (SELECT …) SELECT * FROM x`
- **THEN** 系统判定为只读

#### Scenario: 带 WHERE 的更新为普通写

- **WHEN** 语句为 `UPDATE t SET a = 1 WHERE id = 1`
- **THEN** 系统判定为写操作，在读写连接上无需二次确认即可执行

#### Scenario: 不带 WHERE 的删除升级为危险

- **WHEN** 语句为 `DELETE FROM t`
- **THEN** 系统判定为危险操作，需二次确认，并在提示中说明该语句将影响表内全部行

#### Scenario: 不带 WHERE 的更新升级为危险

- **WHEN** 语句为 `UPDATE t SET a = 1`
- **THEN** 系统判定为危险操作，需二次确认，并在提示中说明该语句将影响表内全部行

#### Scenario: DDL 为危险

- **WHEN** 语句为 `DROP TABLE t`、`TRUNCATE TABLE t` 或 `ALTER TABLE t …`
- **THEN** 系统判定为危险操作，需二次确认

### Requirement: 分类前剥离注释与字面量

系统 SHALL 在判定语句性质之前剥离 SQL 注释（`--`、`#`、`/* */`）与字符串字面量及带引号的标识符，MUST NOT 让注释或字面量中的内容影响判定结果。

#### Scenario: 注释不能掩盖真实语句

- **WHEN** 语句为 `/* SELECT */ DELETE FROM t`
- **THEN** 系统判定为危险的删除操作，而非只读查询

#### Scenario: 行注释不能掩盖真实语句

- **WHEN** 语句为 `-- SELECT\nDROP TABLE t`
- **THEN** 系统判定为危险操作

#### Scenario: 字面量中的分号不构成多语句

- **WHEN** 语句为 `SELECT '; DROP TABLE t' AS s`
- **THEN** 系统判定为单条只读语句并正常执行

#### Scenario: 字面量中的关键字不影响判定

- **WHEN** 语句为 `SELECT * FROM t WHERE name = 'DELETE FROM x'`
- **THEN** 系统判定为只读

### Requirement: 拒绝多语句执行

剥离注释与字面量后仍包含多条语句时，系统 SHALL 拒绝执行并返回可读提示，MUST NOT 只执行其中第一条或任意子集。

#### Scenario: 拒绝分号拼接的多语句

- **WHEN** 用户提交 `SELECT 1; DROP TABLE t`
- **THEN** 系统拒绝执行并提示一次只能执行一条语句，两条语句均未被执行

#### Scenario: 结尾分号不算多语句

- **WHEN** 用户提交 `SELECT 1;`
- **THEN** 系统正常执行该单条语句

#### Scenario: 驱动层同样不接受多语句

- **WHEN** 系统向数据库发送语句
- **THEN** 连接层的配置使多语句在协议层不成立，作为分类判定之外的独立保障

### Requirement: 只读模式由数据库只读事务兜底

当关系型连接的 mode 为 readonly 时，系统 SHALL 在数据库的只读事务中执行语句，使数据库自身拒绝任何写操作，并在结束时回滚；该保障 SHALL 独立于语句分类结果生效。

#### Scenario: 数据库侧拒绝写操作

- **WHEN** 某条写语句因分类规则未能识别而通过了闸门，且连接为只读模式
- **THEN** 数据库在只读事务中拒绝该语句，系统将拒绝原因翻译为可读提示回显

#### Scenario: 只读事务回滚收尾

- **WHEN** 某条语句在只读事务中执行完毕
- **THEN** 系统以回滚结束该事务，不产生任何提交

#### Scenario: 读写模式不套只读事务

- **WHEN** 连接的 mode 为 rw
- **THEN** 系统不使用只读事务，语句按自动提交执行

#### Scenario: 写意图查询的解释性提示

- **WHEN** 用户在只读连接上执行 `SELECT … FOR UPDATE`
- **THEN** 系统提示该语句带写意图故在只读连接下不可用，而非透出数据库原始错误
