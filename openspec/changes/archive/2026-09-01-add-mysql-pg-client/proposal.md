## Why

「数据源」工具已经收了 Elasticsearch 与 MongoDB，但日常排查里出现频率最高的关系型库反而缺位——查表结构、跑一条 SELECT 核对数据、比对两个环境的同一张表，目前只能开 Navicat / DBeaver，或者登跳板机敲 `mysql -h`。更别扭的是「SQL 工具」已经能做日志参数填充、格式化、IN 列表与 INSERT 生成，但生成出来的 SQL 无处可跑，得再复制到另一个客户端里，工具链在这里断了一截。

本次把 MySQL 与 PostgreSQL 接进同一个「数据源」工具，复用已经跑通的连接管理、环境标签与安全闸门，顺带把 SQL 工具的产出接上执行出口。

## What Changes

- 「数据源」工具的连接类型从 2 类扩到 4 类，新增 `mysql` 与 `postgres`；页面外壳、连接选择器与结果面板全部复用，不新增导航入口
- **连接管理**：`datastore_connections` 表沿用不变，关系型连接以 host/port/database 组装进既有的 `uri` 字段，SSL 与连接参数存 `extra_json`；`env`(local/test/prod) 与 `mode`(rw/readonly) 语义完全一致
- **目录浏览**：库/schema → 表/视图 → 列（类型、可空、默认值、主键、注释）与索引，统一走 `information_schema`；PostgreSQL 多出 schema 一层，MySQL 的 database 与 schema 合一
- **查询台**：编辑并执行 SQL，结果以表格为主视图（列顺序按 SQL 返回顺序保留）、JSON 为副视图，展示影响行数、返回行数与耗时；支持 `EXPLAIN` 这类只读语句
- **安全闸门**：在既有两级闸门上补 SQL 分支——
  - `UPDATE` / `DELETE` **不带 WHERE** 时升级为危险操作，与 Mongo 侧「空过滤条件」是同一个模式
  - `DROP` / `TRUNCATE` / `ALTER` / `RENAME` 等 DDL 一律危险
  - 多语句（`;` 拼接）直接拒绝，不做「只执行第一条」这类猜测
  - 分类前先剥离注释与字符串字面量，避免 `/* */ DELETE` 或引号内的关键字骗过判定
  - **只读模式下额外用数据库自身的只读事务兜底**，让服务端不只依赖本工具的语法判定
- **行数上限**：裸 `SELECT` 未写 `LIMIT` 时按配置上限注入，并在结果区回显改写后的实际 SQL，不静默截断
- 引入 `mysql2` 与 `pg` 两个官方驱动；连接池沿用 `globalThis` 单例模式

### 非目标

- 不做表数据的可视化编辑（点格子改值、图形化插入行）。写操作一律手写 SQL 并过闸门，避免误改
- 不做建表 / 改表 / 建索引的图形化 DDL 界面，DDL 仅在查询台手写并经二次确认
- 不做 ER 关系图、查询计划可视化与慢查询分析，本工具面向排查而非 DBA 作业
- 不做数据导出（CSV / Excel / dump）与批量导入
- 不做 SSH 隧道 / 跳板机连接，目标库需本机可直连
- 不做存储过程、触发器、事件的浏览与编辑
- 不接管事务控制（不提供手动 BEGIN/COMMIT 的会话），每次执行都是独立语句

## Capabilities

### New Capabilities

- `rdb-catalog`: 关系型库目录浏览——库/schema/表/视图列表及其行数估算与注释、列结构（类型/可空/默认值/主键/注释）与索引信息，MySQL 与 PostgreSQL 的层级差异在此收口
- `rdb-query-console`: 关系型库查询台——SQL 编辑与执行、表格与 JSON 双视图结果（保留列顺序）、影响行数/返回行数/耗时展示、裸 SELECT 的行数上限注入与改写回显、NULL 与大整数等特殊值的可读呈现

### Modified Capabilities

- `datastore-connection`: 连接类型由 `es | mongo` 扩展为四类，新增关系型连接的配置字段语义（host/port/database/SSL）与其连通性测试方式
- `datastore-safety`: 操作分类规则新增 SQL 分支（语句类型判定、无 WHERE 升级为危险、DDL 危险、多语句拒绝、注释与字面量剥离），并新增「只读模式下由数据库只读事务兜底」的要求

## Impact

- **新增代码**：`lib/datastore/rdb.ts`（驱动适配、目录查询、SQL 执行、值序列化）、`lib/datastore/sql-classify.ts`（SQL 语句分类，纯函数）、`components/datastore/RdbCatalog.tsx`、`components/datastore/RdbConsole.tsx`
- **修改代码**：
  - `lib/datastore/types.ts`：`DatastoreType` 扩为四类，追加关系型的目录与查询结果类型
  - `lib/datastore/safety.ts`：接入 SQL 分类，`gateOperation` 模型不变
  - `lib/datastore/pool.ts`：追加 MySQL / PG 连接池（与 `__mongoPool` 同构）
  - `app/api/datastore/{test,catalog,query}/route.ts`：各补关系型分支
  - `components/datastore/{ConnectionManager,ConnectionBar}.tsx`：类型切换时展示关系型字段
  - `components/datastore/ResultPanel.tsx`：支持外部指定列顺序（SQL 结果集列有序，不能再用字段并集推断）
  - `app/datastore/page.tsx`：按连接类型多分支渲染
- **依赖**：新增 `mysql2` 与 `pg`（含 `@types/pg`）；两者均为二进制线协议，无法像 ES 那样用 fetch 直连
- **样式**：`app/globals.css` 追加 `ds-` 前缀下的表格与目录树样式，沿用暗色设计系统
- **测试**：`lib/datastore/sql-classify.test.ts`（语句分类，重点覆盖无 WHERE 升级、注释与字面量绕过、多语句拒绝）、`lib/datastore/rdb.test.ts`（LIMIT 注入判定、值序列化、目录行映射），均为不依赖真实数据库的纯函数测试
- **数据库**：`app.db` 零表结构变动——关系型连接复用 `datastore_connections` 既有列
- **风险**：
  - SQL 分类基于词法判定而非完整解析器，构造刁钻语句仍可能绕过 → 故只读模式增加数据库侧只读事务作为第二道闸门
  - 连接密码明文存于 `app.db`（与 `redis_connections` / 既有数据源连接一致，本地自用工具的既有取舍）
  - 生产库上的误操作是本变更最实的风险 → 沿用 env 标色 + 只读拦截 + 危险操作二次确认三重兜底
