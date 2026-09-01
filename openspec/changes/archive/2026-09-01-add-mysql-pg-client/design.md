## Context

「数据源」工具的地基已经在 `add-es-mongo-client` 里跑通并归档，本次是在同一副骨架上接第三、第四类数据源：

- `lib/datastore/types.ts`——纯类型，明确禁止 import 服务端模块，服务端与前端共用
- `lib/datastore/pool.ts`——`globalThis.__mongoPool` 维护 `Map<connId, MongoClient>`，并有 `withMongo` 的「死客户端剔除后重试一次」兜底
- `lib/datastore/safety.ts`——两级闸门：`classifyXxxOperation()` 各自分类，`gateOperation()` 统一收口（只读模式拦 write、dangerous 需 `confirm=true`）
- `datastore_connections` 表——`type` 判别 + `uri` / `username` / `password` + `extra_json` 容纳差异参数
- `app/api/datastore/{test,catalog,query}/route.ts`——按 `kind` 分支，执行错误归一化为可读文案后以 HTTP 200 回传
- `app/datastore/page.tsx`——连接选择器 + 视图切换，按连接类型渲染面板

与前一次不同的是，本次两个目标（MySQL / PostgreSQL）彼此高度同构。归档的 `add-es-mongo-client` design 里已经写过一句判断：「ES 与 MongoDB 之间的差异，远大于 MySQL 与 PostgreSQL 之间的差异」——本次正是要兑现这句话，采取与当时相反的抽象策略。

真正的新问题只有一个，且是本变更的核心：**SQL 是自由文本，而 ES 的 method+path、Mongo 的 op+filter 都是结构化的**。前两者能靠枚举判定操作性质，SQL 不能。安全闸门在这里第一次面对一个不能靠枚举穷尽的输入。

## Goals / Non-Goals

**Goals:**

- MySQL 与 PostgreSQL 共享一套驱动接口、目录模型与查询台 UI，差异收敛在可枚举的少数几处
- 安全闸门在面对自由文本 SQL 时仍然可靠——不指望词法判定做到完备，而是让数据库自身成为第二道闸门
- 目录浏览与查询执行不因结果集过大而打爆内存或挂死请求
- 值的呈现对排查友好：大整数不失精度、时间不被时区二次转换、NULL 与空串可区分
- 纯函数层（SQL 分类、LIMIT 注入判定、值序列化、目录行映射）可在无真实数据库的情况下单测

**Non-Goals:**

- 不追求 SQL 语法的完整解析——见决策二
- 不做表数据可视化编辑、图形化 DDL、ER 图、查询计划可视化、数据导出
- 不做 SSH 隧道；不接管事务控制（不提供手动 BEGIN/COMMIT 会话）
- 不做连接密码的加密存储——与既有连接保持一致，本地自用工具的既有取舍

## Decisions

### 决策一：抽象统一的 RdbDriver 接口（与上一次「不抽象」的决策相反）

**选择：** `lib/datastore/rdb.ts` 定义一个窄接口，MySQL 与 PostgreSQL 各实现一份：

```
interface RdbDriver {
  ping(conn): Promise<{ version: string }>
  listDatabases(conn): Promise<string[]>
  listSchemas(conn, database): Promise<string[]>
  listTables(conn, database, schema): Promise<RdbTableInfo[]>
  describeTable(conn, database, schema, table): Promise<{ columns, indexes }>
  execute(conn, sql, opts): Promise<RdbExecResult>
}
```

**理由：** 与 ES/Mongo 的情形正好相反——这里的概念是 1:1 对齐的：都有库/表/列/索引，都用 `information_schema` 暴露元数据，都是「发一条 SQL、回一组带列定义的行」。抽象出来的接口每个方法都有实质含义，不会退化成 `if (type === 'mysql')` 的伪抽象。差异是有限且可枚举的：schema 层级、标识符引号（`` ` `` vs `"`）、表注释的取法、只读事务的语法、LIMIT 与 FETCH 的写法——一共不到十处，全部收敛在两份实现的对应位置。

**被否方案：** 照抄上一次的做法写两份平铺实现（`mysql.ts` / `postgres.ts`）——会让目录查询、值序列化、LIMIT 注入、闸门接入这四段几乎逐行重复的逻辑复制两遍，后续接第三种关系型库（如 MariaDB / OceanBase）时再复制第三遍。上一次拒绝抽象是因为抽象不出真东西，这次拒绝抽象则是纯粹的重复。

**判断准则可以留给后来者：** 当两个数据源的核心概念能 1:1 对齐时抽接口，不能对齐时只共享外壳。

### 决策二：SQL 分类用「剥离干扰 + 词法判定」，不引入 SQL 解析器

**选择：** `lib/datastore/sql-classify.ts` 分两步——先剥离注释（`--`、`#`、`/* */`）与字符串字面量（`'…'`、`"…"`、`$$…$$`、反引号标识符），再按首个关键字与关键结构判定：

| 语句 | 判定 |
| --- | --- |
| `SELECT` / `WITH …SELECT` / `SHOW` / `EXPLAIN` / `DESCRIBE` / `ANALYZE`(PG 只读形式除外) | 只读 |
| `INSERT` / `UPDATE`(带 WHERE) / `DELETE`(带 WHERE) | 写 |
| `UPDATE` / `DELETE` **不带 WHERE** | 危险 |
| `DROP` / `TRUNCATE` / `ALTER` / `RENAME` / `CREATE` / `GRANT` / `REVOKE` | 危险 |
| 剥离后仍含 `;` 分隔的多条语句 | 拒绝执行 |

**理由：** 引入 `node-sql-parser` 这类解析器看似更严谨，实际上把风险换了个方向——解析器的方言覆盖永远滞后于数据库本身，一条合法但解析器不认识的 SQL（PG 的 `DISTINCT ON`、窗口函数的新语法、厂商扩展）会被判成「解析失败」。而一个排查工具最不能接受的回答就是「你这条 SQL 我解析不了，所以不给跑」。词法判定的失败模式则是相反方向的：它可能把某条刁钻语句误判得过宽——这个方向的风险由决策三兜住。

**剥离步骤不是可选的：** 不先剥离的话，`/* 注释 */ DELETE FROM t` 会被判成只读，`SELECT '; DROP TABLE x'` 会被判成多语句。这两条必须进单测。

**「不带 WHERE 升级为危险」直接对齐 Mongo 侧的空过滤条件规则**——`DELETE FROM t` 与 `deleteMany({})` 是同一个错误的两种写法，闸门对它们的反应也应当一致。

### 决策三：只读模式下用数据库自身的只读事务兜底

**选择：** 连接 `mode=readonly` 时，每条语句都在数据库的只读事务里执行：

- PostgreSQL：`BEGIN READ ONLY` → 执行 → `ROLLBACK`
- MySQL：`START TRANSACTION READ ONLY` → 执行 → `ROLLBACK`

任何写操作会被数据库直接拒绝（PG 报 `read-only transaction`，MySQL 报 `Cannot execute statement in a READ ONLY transaction`），错误翻译成可读文案回显。

**理由：** 这是本变更最重要的一条决策。决策二承认了词法判定不完备，那么只读模式就不能只依赖它——否则一次误判就是一次生产事故。让数据库自己来判断「这条语句是不是写」，是唯一完备的判定，因为它就是真正执行这条语句的那一方。词法判定退化为「提前给出可读提示」的角色，而不是最后一道防线。

统一用 `ROLLBACK` 而非 `COMMIT` 收尾：只读事务里本就没有需要提交的东西，回滚在语义上更贴切，也避免把「提交」这个动作出现在只读路径上。

**注意副作用：** 只读事务下 `SELECT … FOR UPDATE` 会被拒绝。这是符合预期的——它本来就是写意图——但要给出解释性文案，而不是把数据库的原始错误直接抛给用户。

**读写模式（`mode=rw`）不套只读事务**，保持每条语句自动提交，语义与用户在其他客户端里的预期一致。

### 决策四：多语句一律拒绝，并在协议层再堵一道

**选择：** 分类器发现剥离后仍存在多条语句时直接拒绝执行；同时在驱动层收紧——MySQL 侧保持 `multipleStatements: false`（`mysql2` 的默认值，显式写出以防被改），PostgreSQL 侧强制走扩展查询协议（携带空参数数组发送）使多语句在协议层不成立。

**理由：** PG 这一层不是多余的。`node-postgres` 在不带参数时走的是简单查询协议，而简单查询协议**允许**一次发送多条语句——也就是说 `SELECT 1; DROP TABLE t` 在 PG 上会两条都执行。这正是「只执行第一条」这种猜测式处理会酿成事故的地方，所以本工具的选择是明确拒绝而非截取。

不做「拆分后逐条确认」的批量执行界面：那是 DBA 工具的形态，与本工具的排查定位不符，也会让闸门的语义变得复杂。

**待验证：** `pg` 传空参数数组是否确实切换到扩展协议，需在实现阶段以真实多语句用例验证，不能只凭文档判断（已列入任务）。

### 决策五：裸 SELECT 注入 LIMIT，并回显改写后的 SQL

**选择：** 仅当语句同时满足「单条」「只读」「以 `SELECT` 或 `WITH` 开头」「不含 `LIMIT` / `FETCH` / `FOR UPDATE` / `INTO`」时，追加 `LIMIT <上限>`；结果区显式回显实际执行的 SQL。不满足条件时不改写，改为在读取侧按硬上限截断并标注「结果已截断」。

**理由：** 改写用户的 SQL 是有侵入性的，所以两件事必须同时成立：触发条件足够窄，且改写结果对用户完全透明。回显改写后的 SQL 是这条决策能被接受的前提——用户看到的执行内容必须和真实执行的一致，否则排查工具本身就成了误导源。

**被否方案一：** 包一层 `SELECT * FROM (…) AS t LIMIT n`——对含 CTE、UNION、重名列的语句会直接报错或改变语义，触发条件反而更难界定。

**被否方案二：** 不改写，靠驱动流式读取到 N 行后中断（`mysql2` 的 stream / PG 的 cursor）——PG 侧要额外引入 `pg-cursor`，且服务端仍会为完整结果集做完查询工作，省下的只是网络与内存。收益不足以抵消复杂度，但保留为硬上限兜底的实现方式。

### 决策六：目录统一为三级模型，MySQL 折叠中间层

**选择：** 统一模型 `database → schema → table`。MySQL 下 `schema` 恒等于 `database`，UI 隐藏该层；PostgreSQL 下正常展示三级。

**理由：** 两者的层级差异是真实存在的，但只差一层，用「MySQL 的 schema 退化为 database」这一条规则就能抹平，比在 UI 与接口里到处做二选一分支干净得多。

**PostgreSQL 的一个硬约束要在 UI 上体现：** PG 的连接绑定单个 database，无法跨库查询。因此 PG 连接的库列表只展示连接串中指定的那一个库（切库需要另建连接），而 MySQL 可以列出该账号可见的全部库。这不是实现偷懒，是 PG 的连接模型使然，UI 上要说明而不是假装能切。

**元数据 SQL 各写一份：** 两者都有 `information_schema`，但表注释的取法不同（MySQL 在 `TABLES.TABLE_COMMENT`，PG 要走 `obj_description(oid)`），索引信息也分别在 `STATISTICS` 与 `pg_indexes` / `pg_index`。接口一致，SQL 不强求统一。

### 决策七：值序列化以「排查保真」为准，而非 JS 类型友好

**选择：**

- MySQL：`supportBigNumbers: true` + `bigNumberStrings: true`，BIGINT 一律以字符串返回
- MySQL：`dateStrings: true`，DATE / DATETIME / TIMESTAMP 保留库中原始文本
- PostgreSQL：`int8` / `numeric` 沿用 `node-pg` 既有的字符串返回行为；`timestamptz` 通过类型解析器覆写为原始字符串
- 二进制（`BLOB` / `bytea`）：转为 hex 摘要 + 字节长度，不整块塞进表格
- `NULL` 在表格中以独立样式的 `NULL` 标记呈现，与空字符串 `''` 明确区分

**理由：** 排查场景下「看到的值必须等于库里的值」优先于「拿到一个好用的 JS 对象」。三个具体的坑：雪花 ID 这类 BIGINT 超过 `2^53` 会在转 Number 时静默丢精度——而本工具的编码转换里就有分布式 ID 解析器，丢精度会让两个工具互相打架；时间戳转成 JS `Date` 再渲染会引入一次时区转换，用户看到的时间和库里存的对不上，这是排查时最容易被带偏的地方；`NULL` 与空串不分，会让「这个字段到底有没有写进去」这类问题无从判断。

这与 Mongo 侧把 ObjectId / Date 序列化成可读字符串是同一个取向的延续。

### 决策八：连接池抽成通用 withRdb，沿用死连接重建兜底

**选择：** `globalThis.__rdbPool` 维护 `Map<connId, MySqlPool | PgPool>`，并把 `withMongo` 里那套「操作失败 → 判定是否死连接 → 剔除重建 → 重试一次」提取为同构的 `withRdb`。连接编辑与删除时释放对应池。

**理由：** `mysql2` 的 `createPool` 与 `pg` 的 `Pool` 都自带连接池、都设计为长期持有，与 `MongoClient` 的情形完全一致；Next dev 热重载导致句柄泄漏的问题也一致。`withMongo` 已经踩过「目标短暂不可达后池里留下永久报错的死客户端」这个坑，没有理由让关系型侧再踩一遍。

**超时要在两侧都设：** 驱动层的 `connectTimeout` 只管建连，语句本身挂死要靠数据库侧的 `statement_timeout`（PG）与 `max_execution_time`（MySQL，仅对 SELECT 生效）。两者都设，避免一条全表扫描把请求挂到天荒地老。

## Risks / Trade-offs

- **词法分类被刁钻语句绕过**（决策二承认的固有缺陷）→ 只读模式由数据库只读事务兜底（决策三），读写模式由危险操作二次确认兜底；分类器的职责降级为「提前给出可读提示」，不是最后防线。

- **`pg` 简单查询协议允许多语句** → 分类器拒绝 + 强制扩展查询协议双保险；且该协议行为必须用真实多语句用例验证，不接受「文档上说」。

- **注入 LIMIT 改写了用户的 SQL** → 触发条件收窄到单条裸 SELECT，且结果区回显实际执行的 SQL；用户看到什么就是执行了什么。

- **长查询挂死请求** → `statement_timeout` / `max_execution_time` + 驱动超时，超时错误翻译为可读文案（说明是超时而非语法错误）。

- **大结果集打爆内存** → LIMIT 注入为主、读取侧硬行数上限为兜底，截断时明确标注而非静默丢弃。

- **只读事务下 `SELECT … FOR UPDATE` 被拒** → 属预期行为，但要给解释性文案说明「该语句带写意图，只读连接下不可用」，而不是透出数据库原始错误。

- **PG 无法跨库查询** → UI 明示该连接绑定的库，切库需另建连接；不做假装能切的下拉框。

- **`information_schema` 在大库上慢** → 表列表按库/schema 懒加载，列与索引在展开某张表时才查；提供表名过滤。

- **新增两个驱动依赖** → 仅在服务端模块 import，不进客户端 bundle；两者都是各自生态的事实标准，无更轻的替代（二进制线协议无法像 ES 那样用 fetch 直连）。

- **生产库误操作**（本变更最实的风险）→ 四重兜底：env 标签在 UI 上显著标色、只读模式服务端拦截、只读事务数据库侧拒绝、危险操作二次确认弹窗回显完整 SQL。

- **凭证明文入库** → 与 `redis_connections` 及既有数据源连接一致，沿用既有取舍；连接列表接口对密码做脱敏（复用 `MASKED_SECRET` 机制）。

## Migration Plan

`app.db` **零表结构变动**——关系型连接复用 `datastore_connections` 的既有列（`uri` 存组装后的连接串，SSL 等参数进 `extra_json`）。这是本变更相对上一次的一个明显优势：没有迁移，回滚只需移除关系型分支与两个依赖，其他工具与既有连接完全不受影响。

任务分两段落地：

1. **第 1~5 组**：类型扩展、SQL 分类器与闸门、驱动接口与连接池、MySQL 实现、目录与查询台 UI。此处 MySQL 已可独立验收上线。
2. **第 6~7 组**：PostgreSQL 实现与其 schema 层级、协议与只读事务的差异处理。

与上一次「先 ES 后 Mongo」的分段理由相同：第一段就能拿到可用工具，也避免堆出一个难以验证的巨型变更。

## Open Questions

- SSL / TLS 首版只提供「启用 + 是否校验证书」的开关，不做自定义 CA 与客户端证书——若实际环境需要再补。
- 是否给「SQL 工具」加一个「发送到查询台」的跳转入口？能补上工具链的最后一环，但涉及跨工具状态传递，本次不做，留待验证查询台稳定后再议。
- PostgreSQL 的 `search_path` 是否需要暴露为连接级配置？首版按默认值走，目录浏览显式带 schema 名可绕开大部分困扰。
- MySQL 的 `max_execution_time` 只对 SELECT 生效，写语句的超时兜底是否需要额外手段？首版依赖驱动侧超时，实际使用中观察是否够用。
