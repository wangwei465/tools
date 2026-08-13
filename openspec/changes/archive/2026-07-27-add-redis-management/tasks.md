## 1. 依赖与连接池（lib/redis）

- [x] 1.1 安装依赖 `ioredis`（落地前经 context7 确认最新 API）
- [x] 1.2 `lib/redis/pool.ts`：`globalThis.__redisPool` 维护 `Map<connId, client>`；`getClient(connId)` 按配置建连 / 复用；`dropClient(connId)` 销毁并移除
- [x] 1.3 连接建立按类型分派：单机 `new Redis` / 集群 `Redis.Cluster` / 哨兵（`sentinels` + `name`）；连接超时、错误捕获（不因单连接失败拖垮进程）

## 2. 数据层与建表（lib/db）

- [x] 2.1 建表 `redis_connections`：`id, name, type, nodes_json, master_name, password, db, env, mode, created_at, updated_at`，`CREATE TABLE IF NOT EXISTS`（幂等，纯增表不动现有五表）
- [x] 2.2 封装连接配置数据访问：CRUD；生产环境新建时 `mode` 默认 `readonly`

## 3. 后端 API（app/api/redis）

- [x] 3.1 `connections/route.ts`：`GET` 列表 / `POST` 建 / `PATCH` 改 / `DELETE`；配置变更时 `dropClient`
- [x] 3.2 `connections` 连接测试：PING（超时保护），返回可达 / 认证结果
- [x] 3.3 `keys/route.ts`：`SCAN cursor MATCH pattern COUNT n`，返回 `{ keys:[{key,type,ttl}], nextCursor }`；集群逐主节点遍历（复合游标）；禁用 KEYS
- [x] 3.4 `value/route.ts`（读）：按 `TYPE` 返回 `{ type, value, ttl }`；大集合截断（元素上限 + 截断标记）
- [x] 3.5 `value/route.ts`（写）：按类型分派 `SET`/`HSET`/`HDEL`/`LPUSH`/`RPUSH`/`LSET`/`SADD`/`SREM`/`ZADD`/`ZREM`；`EXPIRE`/`PERSIST`/`DEL`；只读模式拦截
- [x] 3.6 `exec/route.ts`：`client.call()` 透传原始命令；安全闸门——只读拦写命令、危险命令需 `confirm=true`（白/黑名单服务端硬编码）
- [x] 3.7 `info/route.ts`：执行 `INFO` 并解析为分区结构；集群对各主节点分别取 INFO 聚合返回

## 4. 导航与页面骨架

- [x] 4.1 `Navigation.tsx` 的 `TOOLS` 追加 `{ href:"/redis", label:"Redis管理" }`
- [x] 4.2 `app/redis/page.tsx`：连接选择器 + 三视图布局（键浏览器 / 值面板 / 命令控制台）

## 5. 连接管理 UI（components/redis）

- [x] 5.1 连接列表 + 新建 / 编辑 / 删除表单；**类型选择（单机/集群/哨兵）驱动不同节点输入**（单机 host:port / 集群多节点 / 哨兵节点+master 名）；含 password/db/名称/环境标签/读写模式
- [x] 5.2 连接测试按钮 + 结果提示
- [x] 5.3 当前连接的名称与环境标签在操作区显著常驻展示

## 6. 键浏览器 UI

- [x] 6.1 `SCAN` 分页列表：`MATCH` 输入 + 「加载更多」（前端持有 cursor）+ 遍历结束态
- [x] 6.2 每行展示 key + 类型 + TTL；删除 key（二次确认，只读拦截）

## 7. 类型化值编辑器（五类型纵切，逐个可验收）

- [x] 7.1 string 编辑器：文本编辑（JSON 美化）+ `SET` 写回
- [x] 7.2 hash 编辑器：字段表增 / 改 / 删（`HSET`/`HDEL`）
- [x] 7.3 list 编辑器：头尾增删 + 按索引改（`LPUSH`/`RPUSH`/`LPOP`/`RPOP`/`LSET`）
- [x] 7.4 set 编辑器：成员增 / 删（`SADD`/`SREM`）
- [x] 7.5 zset 编辑器：成员 / 分数增删改（`ZADD`/`ZREM`）
- [x] 7.6 通用 TTL 操作面板：`EXPIRE` / `PERSIST`；只读模式统一拦截写入

## 8. 命令控制台 UI

- [x] 8.1 命令输入 + 结果原样回显 + 会话内命令历史（上下回填）
- [x] 8.2 危险命令二次确认弹窗（展示连接名 + 环境标签）；只读拦截提示

## 9. INFO 监控面板 UI

- [x] 9.1 分区指标卡片：版本 / 运行时长 / 客户端数 / 内存占用 / ops/s / 命中率 / 复制角色
- [x] 9.2 键空间概览：各 db 的 keys / expires
- [x] 9.3 手动刷新按钮；集群模式按主节点分栏 + 关键项汇总

## 10. 验证

- [x] 10.1 `tsc --noEmit` 通过
- [x] 10.2 dev 冒烟：对真实 Redis（192.168.199.165, standalone）验证——测试连接 PONG、SCAN 分页 + MATCH 精准命中、五类型查看与编辑、TTL（EXPIRE/PERSIST）、命令读写 happy-path、INFO 指标（v5.0.9/内存/客户端/keyspace）、只读拦截、危险命令二次确认、生产默认只读；**修复** hash 读取 bug（`call("HGETALL")` 返回扁平数组，误按对象解析）。**未覆盖**：集群 / 哨兵 e2e（本环境仅 standalone 实例）
- [x] 10.3 连接池验证：同连接多操作复用同一 client（连续读写均命中池）、编辑 / 删除连接触发 `dropClient`（PATCH/DELETE 返回 ok）；**未覆盖**：集群逐主节点 SCAN（无集群实例）
- [x] 10.4 回归：数据比对 / 生成签名 / 接口调试及其 API、`app.db` 既有表不受影响（`/api/environments`、`/api/history` 正常，`api_history` 真实数据完好）
