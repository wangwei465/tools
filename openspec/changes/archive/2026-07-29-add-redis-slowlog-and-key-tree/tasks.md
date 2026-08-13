# 实现任务

## 1. 后端·安全分类(safety)

- [x] 1.1 在 `lib/redis/safety.ts` 增加 SLOWLOG 子命令感知:新增 `isDangerousCommand` 对 `slowlog reset` 判危险,`slowlog get/len` 只读放行(不入 WRITE/DANGEROUS 名单);判定需读第二个 token
- [x] 1.2 补充/调整单测或内联验证:`slowlog get`、`slowlog len`、`slowlog reset` 分别得到"放行 / 放行 / 危险"结果,确保命令行 `exec` 路径也受同一闸门约束

## 2. 后端·慢查询解析层与路由

- [x] 2.1 新增 `lib/redis/slowlog.ts`:定义 `SlowlogEntry` 类型(id、timestamp、durationUs、command:string[]、clientAddr?、clientName?)与 `NodeSlowlog { node, len, entries }`;实现从 `SLOWLOG GET` 原始数组解析为结构化条目,对 Redis 4.0 前缺失的客户端字段容错回退
- [x] 2.2 在 `lib/redis/types.ts` 导出 `SlowlogEntry` / `NodeSlowlog`(纯数据类型,供前端复用,禁止引入服务端依赖)
- [x] 2.3 新增 `app/api/redis/slowlog/route.ts`:`POST { connId, action:"get"|"reset", count? }`;`get` 走只读拉取(`SLOWLOG LEN` + `SLOWLOG GET <count默认128>`),集群用 `masterNodes()` 逐主节点聚合为 `NodeSlowlog[]`;`reset` 经危险确认信封(未 confirm 返回 needConfirm + connName/env),只读模式拦截,确认后逐主节点 `SLOWLOG RESET`
- [x] 2.4 复用 `resolveClient` 解析连接;错误按既有信封 `{ ok:false, error }` 返回,不抛未捕获异常

## 3. 前端·慢查询子视图

- [x] 3.1 在 `components/redis/api.ts` 增加 `getSlowlog(connId)` 与 `resetSlowlog(connId, confirm?)` 封装,返回类型对齐 `NodeSlowlog[]` 与危险确认字段
- [x] 3.2 新增慢查询展示组件(如 `SlowlogPanel.tsx`):列表展示时间、耗时(μs→可读)、命令+参数、客户端;空数据提示"暂无慢查询记录";集群按节点分栏;总条数展示
- [x] 3.3 「清空慢日志」按钮:复用命令行同款二次确认弹窗(展示连接名 + env),只读模式禁用并提示;确认后调用 `resetSlowlog(connId, true)` 并刷新
- [x] 3.4 在 monitor 视图容器内增加「指标 / 慢查询」子标签切换,默认「指标」;不新增顶层视图 tab

## 4. 前端·前缀树形视图

- [x] 4.1 实现前缀树构建工具:由 `KeyInfo[]` 按分隔符(默认 `:`)构建 `TreeNode { segment, fullKey?, keyInfo?, children:Map, count }`,无分隔符的键作根层叶子,不产生空前缀分组
- [x] 4.2 在 `KeyBrowser` 增加 `viewMode: "flat" | "tree"` 状态与切换控件(默认 `flat`);平铺与树形共享同一 `keys` 状态,「加载更多」新增键并入树
- [x] 4.3 递归渲染树:分支可展开/折叠(展开态用 `Set` 记录),分支节点显示其下 key 计数;叶子节点复用既有选中→值面板、删除→二次确认/只读拦截逻辑(不重复实现)
- [x] 4.4 复用既有 footer 语义(已加载 N 个 / 加载更多),避免"树已展示全部"的错觉

## 5. 样式与集成

- [x] 5.1 在 `app/globals.css` 增加慢查询面板与树形视图样式,复用现有 `--border`/`--bg-*`/徽标令牌,保持视觉统一
- [x] 5.2 慢查询耗时/命令、树形分支/叶子的排版与既有 InfoPanel、KeyBrowser 一致

## 6. 验证

- [x] 6.1 `npx tsc --noEmit` 零错误
- [x] 6.2 跑通只读探测:`/redis` 页面 200;慢查询子视图对真实连接 `SLOWLOG GET/LEN` 正常展示(单机 + 集群分栏);`SLOWLOG RESET` 触发二次确认、只读模式被拦
- [x] 6.3 树形视图:切换/折叠/选中叶子进值面板/删除叶子(读写与只读)均与平铺一致;含/不含分隔符的键归位正确
- [x] 6.4 `openspec validate add-redis-slowlog-and-key-tree --strict` 通过
