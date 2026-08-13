# redis-keyspace Specification

## Purpose

键空间浏览——`SCAN` 游标分页 + `MATCH` 匹配（集群逐主节点）、类型识别、TTL 展示、key 删除。

## Requirements

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

### Requirement: 前缀树形视图切换
键浏览器 SHALL 在既有平铺列表之外提供「树形」视图切换;树形视图 SHALL 按可配置分隔符(默认 `:`)将当前已加载的 key 组织为层级前缀树,复用现有 `SCAN` + `MATCH` 的加载结果,不改变后端扫描逻辑,也不额外发起全量遍历。

#### Scenario: 切换到树形视图
- **WHEN** 用户在键浏览器点击「树形」视图切换
- **THEN** 系统将当前已加载的 key 按分隔符拆分为前缀层级,渲染为可折叠的树,不重新扫描后端

#### Scenario: 平铺与树形共享数据
- **WHEN** 用户在树形视图下点击「加载更多」续扫
- **THEN** 新增的 key 并入前缀树对应分支,平铺与树形视图基于同一份已加载键集合

#### Scenario: 无分隔符的键
- **WHEN** 某 key 不含分隔符(如 `foo`)
- **THEN** 该 key 作为根层级的叶子节点直接展示,不产生空前缀分组

### Requirement: 树形分支折叠与叶子节点操作
树形视图 SHALL 支持展开/折叠前缀分支;叶子节点 SHALL 复用既有值查看与删除路径,行为与平铺视图一致(选中进入值面板、删除需二次确认、只读模式拦截删除)。

#### Scenario: 展开折叠分支
- **WHEN** 用户点击某前缀分支节点
- **THEN** 系统展开或折叠该分支下的子节点,分支节点显示其下的 key 计数

#### Scenario: 选中叶子查看值
- **WHEN** 用户在树形视图选中一个叶子节点(完整 key)
- **THEN** 系统在值面板加载并展示该 key 的值,与平铺视图选中行为一致

#### Scenario: 树形视图删除叶子
- **WHEN** 用户对某叶子节点执行删除并确认(读写模式)
- **THEN** 系统执行 `DEL` 并从树中移除该叶子;只读模式下删除被拦截
