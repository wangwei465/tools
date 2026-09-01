## 1. 地基：类型扩展与依赖

- [x] 1.1 在 `lib/datastore/types.ts` 将 `DatastoreType` 扩为 `"es" | "mongo" | "mysql" | "postgres"`，并在 `DatastoreExtra` 追加关系型参数（`ssl?: boolean`、`sslRejectUnauthorized?: boolean`）；该文件继续禁止 import 服务端模块
- [x] 1.2 在 `lib/datastore/types.ts` 追加关系型的目录与查询类型：`RdbTableInfo`（名称/类型 table|view/行数估算/注释）、`RdbColumnInfo`（列名/类型/可空/默认值/主键/注释）、`RdbIndexInfo`（名称/列/唯一）、`RdbExecResult`（`columns: string[]` 有序列名 / `rows` / `rowCount` / `affectedRows?` / `tookMs` / `executedSql` / `truncated`）
- [x] 1.3 安装依赖 `mysql2`、`pg` 与 `@types/pg`，确认仅在服务端模块中 import，不进客户端 bundle
- [x] 1.4 确认 `datastore_connections` 表结构无需任何变动（关系型连接复用 `uri` / `username` / `password` / `extra_json`），如需调整则中止并回到设计

## 2. 地基：SQL 分类器（本变更的核心）

- [x] 2.1 新建 `lib/datastore/sql-classify.ts`，实现剥离函数：去除 `--` / `#` 行注释、`/* */` 块注释、`'…'` 与 `$$…$$` 字符串字面量、`"…"` 与 `` `…` `` 引号标识符，保留原始 SQL 供回显
- [x] 2.2 实现多语句检测：剥离后按分号切分，忽略结尾空语句，多于一条时返回拒绝结果
- [x] 2.3 实现 `classifySqlOperation(sql)`：按首关键字判定只读 / 写 / 危险三档，返回与 `OperationClass` 一致的 `{ write, dangerous, reason? }`
- [x] 2.4 实现「`UPDATE` / `DELETE` 不带 WHERE 升级为危险」，reason 明确说明将影响表内全部行（对齐 Mongo 侧空过滤条件的文案取向）
- [x] 2.5 实现 DDL 危险判定：`DROP` / `TRUNCATE` / `ALTER` / `RENAME` / `CREATE` / `GRANT` / `REVOKE`
- [x] 2.6 实现 `SELECT … FOR UPDATE` 的识别，供只读连接下给出解释性提示（判定为写）
- [x] 2.7 `lib/datastore/sql-classify.test.ts`：覆盖三档判定、CTE 只读、无 WHERE 升级与带 WHERE 不升级的对照、`/* SELECT */ DELETE` 与 `-- SELECT\nDROP` 的注释绕过、`SELECT '; DROP TABLE t'` 的字面量分号、`SELECT * FROM t WHERE name = 'DELETE FROM x'` 的字面量关键字、结尾分号不算多语句
- [x] 2.8 运行 `npm test` 确认分类器测试全部通过

## 3. 地基：闸门接入与驱动接口

- [x] 3.1 在 `lib/datastore/safety.ts` 导出 `classifySqlOperation` 的接入点，`gateOperation` 模型保持不变；多语句拒绝在闸门之前前置返回
- [x] 3.2 在 `lib/datastore/safety.test.ts` 补 SQL 侧的闸门用例：只读连接拦 `UPDATE`、放行 `SELECT`、无 WHERE `DELETE` 需确认
- [x] 3.3 新建 `lib/datastore/rdb.ts`，定义 `RdbDriver` 接口（`ping` / `listDatabases` / `listSchemas` / `listTables` / `describeTable` / `execute`）与按 `DatastoreType` 取驱动的入口
- [x] 3.4 实现 `shouldInjectLimit(sql, cls)` 与 `injectLimit(sql, max)`：仅在「单条 + 只读 + `SELECT`/`WITH` 开头 + 不含 `LIMIT`/`FETCH`/`FOR UPDATE`/`INTO`」时改写，返回改写后 SQL 供回显
- [x] 3.5 实现值序列化 `serializeRdbValue`：大整数转字符串、二进制转 hex 摘要 + 字节长度、`null` 保留为 `null`（由 UI 区分 NULL 与空串）
- [x] 3.6 `lib/datastore/rdb.test.ts`：覆盖 LIMIT 注入的触发与不触发（已有 LIMIT、含 FOR UPDATE、非 SELECT、多条语句）、值序列化各分支
- [x] 3.7 在 `lib/datastore/pool.ts` 追加 `globalThis.__rdbPool`（`Map<connId, MySqlPool | PgPool>`）与通用 `withRdb`，沿用 `withMongo` 的死连接剔除后重试一次的兜底；`dropRdbPool(id)` 供连接编辑/删除时释放

## 4. MySQL 实现

- [x] 4.1 在 `lib/datastore/rdb.ts` 实现 MySQL 驱动的建连：`mysql2/promise` 的 `createPool`，显式设置 `multipleStatements: false`、`supportBigNumbers: true`、`bigNumberStrings: true`、`dateStrings: true`、`connectTimeout`
- [x] 4.2 实现 `ping`（取 `VERSION()`）与 `listDatabases`（`SHOW DATABASES`，过滤系统库）；`listSchemas` 返回与库同名的单元素（schema 层折叠）
- [x] 4.3 实现 `listTables`：查 `information_schema.TABLES` 取名称、`TABLE_TYPE`（区分表与视图）、`TABLE_ROWS` 行数估算、`TABLE_COMMENT`
- [x] 4.4 实现 `describeTable`：列信息查 `information_schema.COLUMNS`（含 `COLUMN_COMMENT`、`COLUMN_KEY` 判定主键），索引查 `information_schema.STATISTICS` 并按索引名聚合列与唯一性
- [x] 4.5 实现 `execute`：设置 `max_execution_time` 语句超时；读写模式直接执行；只读模式用 `START TRANSACTION READ ONLY` 包裹并以 `ROLLBACK` 收尾
- [x] 4.6 从驱动返回的 field 元数据取有序列名填入 `RdbExecResult.columns`，MUST NOT 用行对象的键顺序推断
- [x] 4.7 实现错误归一化：连接超时、认证失败、库不存在、语句超时、只读事务拒绝（`Cannot execute statement in a READ ONLY transaction`）各自翻译为可读文案
- [x] 4.8 在 `app/api/datastore/test/route.ts` 补 MySQL 分支（返回版本信息）

## 5. 关系型的 API 端点与查询台 UI

- [x] 5.1 在 `app/api/datastore/catalog/route.ts` 补关系型分支：按 `level`（databases / schemas / tables / table-detail）懒加载，MUST NOT 一次性拉全量结构
- [x] 5.2 在 `app/api/datastore/query/route.ts` 补关系型分支：先做多语句检测与分类，过 `gateOperation` 后执行，返回 `RdbExecResult`；未确认的危险操作回传需确认信号与完整 SQL
- [x] 5.3 修改 `components/datastore/ResultPanel.tsx`：新增可选的 `columns` 入参，传入时按该顺序渲染表格列，不传时维持既有的字段并集推断（ES/Mongo 行为不变）
- [x] 5.4 在 `ResultPanel` 中区分 `NULL` 与空字符串的呈现，`NULL` 用独立样式标记
- [x] 5.5 新建 `components/datastore/RdbCatalog.tsx`：库/schema/表三级树（MySQL 隐藏 schema 层）、表名过滤框、展开表后展示列与索引、加载态与错误态
- [x] 5.6 在 `RdbCatalog` 中为 PostgreSQL 连接标注「该连接绑定单个库，切库需另建连接」
- [x] 5.7 新建 `components/datastore/RdbConsole.tsx`：SQL 编辑区 + 执行按钮，结果区展示表格/JSON 双视图、返回行数、影响行数、耗时
- [x] 5.8 在 `RdbConsole` 回显实际执行的 SQL（LIMIT 被注入时必须可见），并在结果被硬截断时标注「结果已截断」及上限值
- [x] 5.9 接入危险操作二次确认弹窗，弹窗内回显将要执行的完整 SQL；多语句拒绝与只读拦截各自展示可读提示
- [x] 5.10 修改 `components/datastore/{ConnectionManager,ConnectionBar}.tsx`：类型下拉扩为四类，选中关系型时展示 host/port/database/user/password/SSL 字段并组装为 `uri`
- [x] 5.11 修改 `app/datastore/page.tsx`：按连接类型渲染 ES / Mongo / 关系型三套面板
- [x] 5.12 在 `app/api/datastore/connections/[id]/route.ts` 的编辑与删除路径调用 `dropRdbPool` 释放旧池
- [x] 5.13 在 `app/globals.css` 追加关系型目录树与结果表格所需的 `ds-` 前缀样式，沿用暗色设计系统

## 6. 阶段验收：MySQL 可独立上线

> **6.2~6.6 阻塞**：本机无 MySQL 实例（3306 无监听，且无 docker），需真实库才能验收。
> 已覆盖到的部分：闸门判定（只读拦截 / 无 WHERE 需确认 / 确认后放行 / 多语句拒绝）
> 已在 dev server 上以临时 mysql 连接端到端验证——闸门在建连之前生效，故不依赖真实库；
> 未覆盖的是建连之后的行为（目录查询、结果集列序、LIMIT 注入回显、值保真）。

- [x] 6.1 `npm run build` 与 `npm test` 通过，无 TypeScript 报错
- [ ] 6.2 冒烟：MySQL 走通连接测试、库列表、表列表、列与索引、SELECT 查询五条路径（阻塞：无 MySQL 实例）
- [ ] 6.3 冒烟：不带 LIMIT 的 SELECT 被注入上限且结果区回显了改写后的 SQL（阻塞：无 MySQL 实例）
- [ ] 6.4 冒烟：只读连接上 `UPDATE` 被拦截；`DELETE FROM t` 未确认时被拒、确认后执行（**闸门部分已验**；执行部分阻塞：无 MySQL 实例）
- [ ] 6.5 冒烟：提交 `SELECT 1; DROP TABLE t` 被拒绝，且确认目标表仍然存在（**拒绝已验**；「表仍存在」阻塞：无 MySQL 实例）
- [ ] 6.6 冒烟：BIGINT 大值与 DATETIME 的展示与库中一致；`NULL` 与空串在表格中可区分（阻塞：无 MySQL 实例）

## 7. PostgreSQL 实现

- [x] 7.1 在 `lib/datastore/rdb.ts` 实现 PostgreSQL 驱动的建连：`pg` 的 `Pool`，配置 SSL 选项与 `connectionTimeoutMillis`
- [x] 7.2 覆写 `timestamptz` 等类型解析器，使时间以数据库返回的原始字符串呈现，不转 JS `Date`
- [x] 7.3 实现 `ping`（取 `version()`）；`listDatabases` 仅返回连接串绑定的那一个库；`listSchemas` 查 `information_schema.schemata` 并过滤系统 schema
- [x] 7.4 实现 `listTables`：查 `information_schema.tables` 区分表与视图，表注释走 `obj_description(oid)`，行数估算走 `pg_class.reltuples`
- [x] 7.5 实现 `describeTable`：列信息查 `information_schema.columns` + `col_description` 取注释，主键走 `pg_index`/约束，索引信息走 `pg_indexes` 或 `pg_index` 并聚合列与唯一性
- [x] 7.6 实现 `execute`：设置 `statement_timeout`；读写模式直接执行；只读模式用 `BEGIN READ ONLY` 包裹并以 `ROLLBACK` 收尾
- [ ] 7.7 强制走扩展查询协议（发送时携带空参数数组），并**以真实的多语句用例实证验证**其确实拒绝多语句；若验证不成立则改用其他协议层手段并在 design 中记录结论（**已实现**：`runOne` 传 `values: []` + `rowMode: "array"`，并已在 `describePgError` 中翻译 `cannot insert multiple commands`；**实证验证阻塞**：本机无 PostgreSQL 实例）
- [x] 7.8 从 `result.fields` 取有序列名填入 `RdbExecResult.columns`
- [x] 7.9 实现错误归一化：连接失败、认证失败、schema/表不存在、语句超时、只读事务拒绝（`read-only transaction`）各自翻译为可读文案
- [x] 7.10 在 `test` / `catalog` / `query` 三个端点补 PostgreSQL 分支
- [x] 7.11 在 `RdbCatalog` 中启用 PostgreSQL 的 schema 层级展示

## 8. 最终验收

> **8.3~8.6 阻塞**：本机无 PostgreSQL 实例（5432 无监听，且无 docker），需真实库才能验收。

- [x] 8.1 `npm run build` 通过，无 TypeScript 报错
- [x] 8.2 `npm test` 全量通过
- [ ] 8.3 冒烟：PostgreSQL 走通连接测试、schema 列表、表列表、列与索引、SELECT 查询五条路径（阻塞：无 PostgreSQL 实例）
- [ ] 8.4 冒烟：PostgreSQL 只读连接上写语句被数据库只读事务拒绝，提示可读（阻塞：无 PostgreSQL 实例）
- [ ] 8.5 冒烟：PostgreSQL 多语句提交被拒绝，且确认第二条语句未被执行（阻塞：无 PostgreSQL 实例）
- [ ] 8.6 冒烟：只读连接上 `SELECT … FOR UPDATE` 给出解释性提示而非数据库原始错误（**MySQL 侧闸门文案已验**：「SELECT … FOR UPDATE 会取行锁，带写意图，只读连接下不可用」；PG 侧阻塞：无实例）
- [x] 8.7 冒烟：ES 与 Mongo 两类既有连接的目录浏览与查询行为未受影响（重点验证 `ResultPanel` 改动未改变其列推断）
- [x] 8.8 冒烟：验证 `/compare`、`/signature`、`/api-client`、`/redis`、`/convert`、`/crypto`、`/sql-kit` 七个既有工具行为未受影响
- [x] 8.9 确认 `app.db` 无任何表结构变动
- [x] 8.10 冒烟后按项目惯例清理 dev server 残留进程（`netstat` 找 PID 后 `taskkill`）
