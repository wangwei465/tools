## 1. 地基：类型、库表与连接池

- [x] 1.1 新建 `lib/datastore/types.ts`：`DatastoreType = "es" | "mongo"`、`DatastoreConnection`（含 `env` / `mode` / `uri` / `username` / `password` / `extraJson`）与连接入参类型；该文件禁止 import 服务端模块（对齐 `lib/redis/types.ts` 的约定）
- [x] 1.2 在 `lib/db/index.ts` 追加 `datastore_connections` 建表语句与 `user_version` 迁移，字段含 `id/name/type/uri/username/password/extra_json/env/mode/created_at/updated_at`，不改动任何既有表
- [x] 1.3 在 `lib/db/index.ts` 实现连接的增删改查函数与行映射，密码字段在列表查询中脱敏（对齐 `redis_connections` 的处理）
- [x] 1.4 新建 `lib/datastore/pool.ts`：以 `globalThis.__mongoPool` 维护 `Map<connId, MongoClient>`，提供取用与释放（对齐 `lib/redis/pool.ts`）；ES 侧无状态不入池
- [x] 1.5 安装依赖 `mongodb`，确认仅在服务端模块中 import，不进客户端 bundle

## 2. 地基：安全闸门

- [x] 2.1 新建 `lib/datastore/safety.ts`，定义 `OperationClass = { write, dangerous, reason? }` 与统一的闸门判定入口
- [x] 2.2 实现 `classifyEsOperation(method, path)`：`_search`/`_cat`/`_mapping` 只读；写入文档与 `_update_by_query` 为写；`DELETE /{index}` 与 `_delete_by_query` 为危险
- [x] 2.3 实现 `classifyMongoOperation(op, filter)`：`find`/`aggregate` 只读；`updateMany`/`deleteMany` 为写；`drop`/`dropDatabase` 为危险；`deleteMany`/`updateMany` 过滤条件为空对象时升级为危险
- [x] 2.4 `lib/datastore/safety.test.ts`：覆盖两类分类的只读/写/危险三档，重点覆盖空过滤条件升级为危险与带条件不升级两条对照用例
- [x] 2.5 运行 `npm test` 确认闸门测试通过

## 3. 地基：连接管理端点与 UI

- [x] 3.1 新建 `app/api/datastore/connections/route.ts` 与 `[id]/route.ts`：连接的增删改查，返回列表时密码脱敏
- [x] 3.2 新建 `app/api/datastore/test/route.ts`：ES 走 `GET /` 取版本、Mongo 走 `ping`，失败返回可读原因（超时 / 认证失败 / 地址不可达）
- [x] 3.3 在连接编辑与删除时调用 `pool.ts` 释放对应的旧 MongoClient
- [x] 3.4 新建 `components/datastore/ConnectionManager.tsx`：连接列表与编辑弹窗，类型切换时展示对应字段
- [x] 3.5 新建 `components/datastore/ConnectionBar.tsx`：连接选择器，prod 环境连接显著标色，readonly 连接带只读标记

## 4. ES：目录浏览

- [x] 4.1 新建 `lib/datastore/es.ts`：用内置 `fetch` 封装请求（Basic Auth 与 API Key 两种认证头），统一超时与错误归一化
- [x] 4.2 实现索引列表：`GET /_cat/indices?format=json&h=` 只取所需列，解析为索引名/文档数/存储大小/健康状态
- [x] 4.3 实现 mapping 解析：`GET /{index}/_mapping` 递归展开 properties 为字段树，保留 object/nested 层级与字段类型
- [x] 4.4 实现跨版本响应兼容：`hits.total` 同时识别数字与 `{value, relation}` 两种形状；无法解析时回落为原始 JSON
- [x] 4.5 `lib/datastore/es.test.ts`：用两种版本的响应样本断言解析结果一致，覆盖 mapping 嵌套展开与无法解析回落
- [x] 4.6 新建 `app/api/datastore/catalog/route.ts` 的 ES 分支，供前端取索引列表与 mapping
- [x] 4.7 新建 `components/datastore/EsCatalog.tsx`：索引列表 + 名称过滤 + mapping 字段树（可展开），集群不可达时展示错误提示

## 5. ES：查询台

- [x] 5.1 新建 `app/api/datastore/query/route.ts` 的 ES 分支：接收 DSL 与目标索引，经安全闸门判定后执行，返回结果、命中总数与耗时
- [x] 5.2 在端点内处理危险操作：未带确认标记时返回需确认信号与操作描述，不执行
- [x] 5.3 深分页处理：超出 `max_result_window` 时返回可读提示（说明原因并建议缩小条件或改用 search_after），不透出底层错误
- [x] 5.4 新建 `components/datastore/EsConsole.tsx`：CodeMirror JSON 编辑器（复用 `@codemirror/lang-json`）+ 执行按钮，非法 JSON 前置拦截，未选索引时提示
- [x] 5.5 接入危险操作二次确认弹窗，弹窗内回显将要执行的完整操作
- [x] 5.6 展示命中总数与耗时

## 6. 共享结果展示与页面外壳

- [x] 6.1 新建 `components/datastore/ResultPanel.tsx`：JSON 视图（CodeMirror 只读）与表格视图切换，两类数据源共用
- [x] 6.2 表格视图列取所有文档字段的并集，缺失字段留空；嵌套对象以折叠 JSON 片段展示，不递归展开
- [x] 6.3 新建 `components/datastore/shared.tsx`：错误条、空状态、分页控件、确认弹窗，CSS 类前缀统一 `ds-`
- [x] 6.4 新建 `app/datastore/page.tsx`：顶部连接选择器 + 视图切换，按连接类型渲染 ES 或 Mongo 面板（对齐 `app/redis/page.tsx` 的结构）
- [x] 6.5 在 `components/shell/Navigation.tsx` 的 `TOOLS` 中追加 `{ href: "/datastore", label: "数据源" }`
- [x] 6.6 在 `app/globals.css` 追加 `ds-` 前缀样式，沿用暗色设计系统的变量与类命名习惯
- [x] 6.7 阶段验收：`npm run build` 与 `npm test` 通过，ES 侧功能完整可用（此处为第一段落地点，Mongo 未接入不影响使用）

## 7. Mongo：目录浏览

- [x] 7.1 新建 `lib/datastore/mongo.ts`：从池中取客户端，实现数据库列表与集合列表（含文档数与索引数）
- [x] 7.2 实现集合字段采样推断：取样固定条数文档，聚合字段名与观察到的类型集合，同名字段多类型时全部保留
- [x] 7.3 实现集合索引信息读取：索引名与索引字段
- [x] 7.4 实现 BSON 特有类型（ObjectId、Date 等）到可读字符串的序列化，避免前端收到空对象
- [x] 7.5 `lib/datastore/mongo.test.ts`：字段推断用构造的文档数组断言（多类型合并、缺失字段、空集合），BSON 序列化单独覆盖
- [x] 7.6 在 `app/api/datastore/catalog/route.ts` 补 Mongo 分支
- [x] 7.7 新建 `components/datastore/MongoCatalog.tsx`：库/集合列表 + 名称过滤 + 采样字段展示（明确标注采样性质与采样条数）+ 索引信息

## 8. Mongo：查询台

- [x] 8.1 在 `lib/datastore/mongo.ts` 实现 `find`（过滤、投影、排序、skip/limit）与 `aggregate`（管道数组）
- [x] 8.2 在 `app/api/datastore/query/route.ts` 补 Mongo 分支，经安全闸门判定后执行，返回结果与耗时
- [x] 8.3 校验管道必须为数组，非数组时前置报错不发起查询
- [x] 8.4 新建 `components/datastore/MongoConsole.tsx`：find 与 aggregate 两种模式切换，各项 JSON 输入独立校验，非法 JSON 前置拦截
- [x] 8.5 接入危险操作二次确认，空过滤条件的 `deleteMany` 提示将影响全部文档
- [x] 8.6 大偏移量翻页时展示全扫描性能提示

## 9. 验收

- [x] 9.1 `npm run build` 通过，无 TypeScript 报错
- [x] 9.2 `npm test` 全量通过
- [x] 9.3 冒烟：ES 走通连接测试、索引列表、mapping 浏览、DSL 查询、分页五条路径
- [x] 9.4 冒烟：Mongo 走通连接测试、库/集合列表、字段采样、find、aggregate 五条路径
- [x] 9.5 冒烟：只读连接上的写操作被拦截；危险操作未确认时被拒绝、确认后执行
- [x] 9.6 冒烟：验证 `/compare`、`/signature`、`/api-client`、`/redis`、`/convert`、`/crypto` 六个既有工具行为未受影响
- [x] 9.7 冒烟后确认 `app.db` 除 `datastore_connections` 外无其他表变动，并按项目惯例清理 dev server 残留进程
