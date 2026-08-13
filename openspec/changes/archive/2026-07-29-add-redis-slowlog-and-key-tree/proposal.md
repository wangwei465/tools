## Why

现有 Redis 管理工具在两个高频场景上存在短板:监控面板只有 INFO 快照,排查"哪些命令慢"时无从下手;键浏览是平铺列表,键量大时难以按业务前缀定位。补齐这两项能显著提升日常排障与浏览效率,且改动局限在既有两个 capability 域内、风险可控。

## What Changes

- **慢查询日志(monitor 域)**:监控面板新增「慢查询」子视图,通过 `SLOWLOG GET` 拉取慢命令条目(ID、时间戳、耗时 μs、命令及参数、客户端地址/名),`SLOWLOG LEN` 展示总条数;支持 `SLOWLOG RESET` 清空(归入危险操作,二次确认);集群模式按主节点分栏。纯查看,不改写业务数据。
- **前缀树形视图(keyspace 域)**:键浏览器新增「平铺 / 树形」视图切换,按分隔符(默认 `:`)将已加载的 key 组织为可折叠的前缀树;复用现有 `SCAN` + `MATCH` 结果,选中叶子节点仍进入既有值面板。纯前端组织,不改后端扫描逻辑。
- 新增后端路由 `POST /api/redis/slowlog`(读:GET+LEN;写:RESET,经安全闸门)与 `lib/redis/slowlog.ts` 解析层。
- `SLOWLOG` 命令族纳入安全分类:`SLOWLOG RESET` 视为危险命令(需确认),`GET`/`LEN` 为只读放行。

## Capabilities

### New Capabilities
<!-- 无新增 capability 域;两项均落入既有域 -->

### Modified Capabilities
- `redis-monitor`: 新增「慢查询日志查看」需求——SLOWLOG GET/LEN 只读拉取与解析、RESET 危险二次确认、集群按主节点聚合、只读连接可查看。
- `redis-keyspace`: 新增「前缀树形视图」需求——在既有 SCAN 平铺浏览基础上支持按分隔符折叠的树形视图切换,叶子节点复用值查看/删除路径。

## Impact

- **新增**:`app/api/redis/slowlog/route.ts`、`lib/redis/slowlog.ts`、慢查询前端子视图组件、树形视图组件/渲染逻辑。
- **修改**:`lib/redis/safety.ts`(SLOWLOG 分类)、`components/redis/InfoPanel.tsx` 或 monitor 视图容器(挂载慢查询子视图)、`components/redis/KeyBrowser.tsx`(视图切换)、`components/redis/api.ts`(slowlog 前端封装)、`app/globals.css`(样式)。
- **不涉及**:连接管理、值编辑、命令行、选库等既有能力;无破坏性变更;无新第三方依赖(SLOWLOG 经现有 ioredis `call` 执行)。
