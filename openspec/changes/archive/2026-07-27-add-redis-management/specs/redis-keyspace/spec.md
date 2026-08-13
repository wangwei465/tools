## ADDED Requirements

### Requirement: SCAN 游标分页浏览
系统 SHALL 用 `SCAN` 游标分页遍历键空间，禁用 `KEYS`；游标状态由前端持有并逐页回传，服务端无状态。

#### Scenario: 首页加载
- **WHEN** 用户在某连接下打开键浏览器（cursor 起点为 "0"）
- **THEN** 服务端执行 `SCAN 0 COUNT <n>` 返回一批 key 与 `nextCursor`

#### Scenario: 加载更多
- **WHEN** 用户点击「加载更多」并回传上次的 `nextCursor`
- **THEN** 服务端以该游标续扫，返回下一批 key 与新的 `nextCursor`

#### Scenario: 遍历结束
- **WHEN** `SCAN` 返回游标为 "0"
- **THEN** 系统标记本轮遍历完成，不再提供「加载更多」

#### Scenario: 集群逐主节点遍历
- **WHEN** 当前连接为集群类型
- **THEN** 系统对每个主节点（`nodes('master')`）分别 SCAN，游标为「节点索引 + 各节点 cursor」复合结构；所有节点游标均归 "0" 时才算遍历完成

### Requirement: 模式匹配
系统 SHALL 支持 `MATCH` 模式过滤键名（如 `user:*`）。

#### Scenario: 按模式过滤
- **WHEN** 用户输入匹配模式并浏览
- **THEN** `SCAN ... MATCH <pattern>` 仅返回匹配的 key

### Requirement: 类型与 TTL 展示
键列表 SHALL 展示每个 key 的数据类型与 TTL。

#### Scenario: 展示类型与 TTL
- **WHEN** 键列表渲染
- **THEN** 每个 key 附带其类型（string/hash/list/set/zset）与剩余 TTL（或"永久"）

### Requirement: 删除键
系统 SHALL 支持删除指定 key（`DEL`），删除前二次确认。

#### Scenario: 删除 key
- **WHEN** 用户对某 key 点击删除并确认
- **THEN** 系统执行 `DEL` 并从列表移除该 key

#### Scenario: 只读模式禁止删除
- **WHEN** 当前连接为只读模式
- **THEN** 删除操作被拦截并提示切换到读写模式
