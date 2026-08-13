## Context

Redis 管理工具现有:INFO 监控(`lib/redis/info.ts` + `InfoPanel`,手动刷新单快照)、键浏览(`lib/redis/keyspace.ts` + `KeyBrowser`,前端持有 SCAN 游标平铺展示)、命令安全分类(`lib/redis/safety.ts`,写/危险两级闸门)、连接池(按 `connId:db` 复用,集群逐主节点)。本变更在既有架构内补齐两项短板,不引入新依赖、不改数据模型、不动连接池。

约束:纯本地开发工具;既有安全取向(只读模式拦写、危险命令二次确认、env 辨识)必须延续;中文注释;服务端硬编码安全判定,不信任前端。

## Goals / Non-Goals

**Goals:**
- 监控面板可查看/清空慢查询日志,复用现有 route 信封与集群逐主节点模式。
- 键浏览器支持前缀树形视图,纯前端组织既有 SCAN 结果,零后端改动。
- `SLOWLOG RESET` 纳入既有危险命令闸门,与命令行一致的二次确认体验。

**Non-Goals:**
- 不做慢查询阈值配置(`CONFIG SET slowlog-log-slower-than`)——属配置修改,超本轮范围。
- 不做树形视图的服务端聚合/懒加载(仅组织前端已加载键集);超大键空间的服务端前缀分页留待后续。
- 不改 INFO 监控既有指标与自动刷新(自动刷新是另一项纵向增强)。

## Decisions

### 决策 1:慢查询走独立 route,不塞进命令行 exec
新增 `POST /api/redis/slowlog`,入参 `{ connId, action: "get" | "reset", count? }`,而非让前端拼 `SLOWLOG GET` 走通用 `exec`。
- **理由**:慢查询需要结构化解析(ID/时间/耗时/命令/客户端)与集群逐主节点聚合,专用 route 可复用 `masterNodes()` 并返回类型化结果,前端零解析;RESET 的危险确认由服务端统一判定。
- **备选**:复用 `/api/redis/exec`——被否,前端要自行解析原始数组且无法结构化聚合集群多节点。

### 决策 2:SLOWLOG 命令分类落在 safety.ts
`slowlog reset` 加入 `DANGEROUS_COMMANDS`;`slowlog get/len` 不入任何名单(只读放行)。判定基于命令首 token,但 `slowlog` 是带子命令的复合命令。
- **理由**:命令行控制台里用户也可能直接敲 `SLOWLOG RESET`,统一在 safety 层拦截才不留缺口。因 `safety.commandName` 只取首 token(`slowlog`),需针对 SLOWLOG 子命令做例外:仅 `RESET` 危险,`GET/LEN` 安全。
- **处理**:在 safety.ts 增加对 `slowlog` 的子命令感知判定(读子命令时放行,`reset` 视危险),slowlog route 内部对 RESET 复用 `isDangerousCommand`/确认信封,与 exec 一致。
- **备选**:把整个 `slowlog` 标危险——被否,会导致只读连接连查看都被拦。

### 决策 3:树形视图为 KeyBrowser 内的纯前端视图切换
在 `KeyBrowser` 增加 `viewMode: "flat" | "tree"` 本地状态与切换按钮;树由已加载的 `keys` 数组按分隔符 `split` 构建。
- **理由**:平铺与树形共享同一份 `keys` 状态(同一 SCAN 结果),切换零成本、加载更多自动并入;满足 spec"不额外发起遍历"。
- **数据结构**:构建 `TreeNode { segment, fullKey?, children: Map, count }`,叶子持 `fullKey` 与其 `KeyInfo`(类型/TTL);渲染递归组件,折叠态用 `Set<string>` 记展开路径。
- **备选**:独立 TreeBrowser 组件——被否,会重复 SCAN/删除/选中逻辑,违反 DRY。

### 决策 4:慢查询作为 monitor 视图下的子标签
monitor 视图容器内提供「指标 / 慢查询」子切换,复用现有监控视图入口,不新增顶层视图 tab。
- **理由**:慢查询与 INFO 同属"监控"心智,顶层 tab(键浏览/命令行/监控)保持不变,降低导航复杂度。

## Risks / Trade-offs

- **[SLOWLOG 字段跨版本差异]** Redis 4.0 前无客户端地址/名字段 → 解析层对缺失字段容错回退"-",按数组长度判定版本,不硬取固定下标。
- **[复合命令安全判定漏洞]** 若 safety 仅看首 token 会误放/误拦 SLOWLOG → 显式对 `slowlog` 做子命令判定并加单测覆盖 `get/len/reset` 三种。
- **[树形仅覆盖已加载键]** 未"加载更多"的键不在树中,可能给"已展示全部"的错觉 → 沿用平铺视图既有的"已加载 N 个/加载更多"提示,树形复用同一 footer 语义。
- **[大量键构建树的性能]** 前端 split + Map 构建在数千键级可接受;超大量时由既有分页上限兜底,不一次性拉全量。

## Migration Plan

- 纯增量,无数据迁移、无破坏性变更。
- 后端:新增 slowlog route/解析、safety 增量,不影响既有 route。
- 前端:KeyBrowser 默认仍为平铺视图(`viewMode` 初始 "flat"),监控默认仍为指标子标签,行为向后兼容。
- 回滚:移除新增文件与 safety/组件增量即可,无残留状态。

## Open Questions

- 慢查询默认拉取条数(建议默认 128,与 redis-cli 习惯一致,可后续加输入框调整)——本轮取固定默认,不做可配置。
- 树形分隔符是否暴露为用户可配置输入——本轮固定默认 `:`,预留状态位,按需再开放 UI。
