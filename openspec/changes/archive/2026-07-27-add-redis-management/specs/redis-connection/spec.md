## ADDED Requirements

### Requirement: 连接配置 CRUD
系统 SHALL 支持创建、编辑、删除 Redis 连接配置（`redis_connections`），字段含名称、host、port、password、db 索引、环境标签、读写模式，并持久化。

#### Scenario: 创建连接
- **WHEN** 用户填写 host/port/password/db 与名称并保存
- **THEN** 系统创建该连接并出现在连接列表中，密码明文存 `redis_connections`

#### Scenario: 编辑连接
- **WHEN** 用户修改某连接的配置并保存
- **THEN** 配置更新并持久化，连接池中对应的旧 client 被销毁，下次使用按新配置重建

#### Scenario: 删除连接
- **WHEN** 用户删除某连接并确认
- **THEN** 该连接配置移除，连接池中对应 client 关闭并移除

### Requirement: 连接测试
系统 SHALL 提供连接测试，对目标 Redis 执行 PING 验证可达性与认证。

#### Scenario: 测试成功
- **WHEN** 用户对某连接点击"测试"且 Redis 可达、认证通过
- **THEN** 返回成功（PONG）并提示连接正常

#### Scenario: 测试失败
- **WHEN** 目标不可达、端口错误或认证失败
- **THEN** 返回失败并展示错误原因，不建立常驻连接

### Requirement: 环境标签与读写模式
连接 SHALL 携带环境标签（本地 / 测试 / 生产）与读写模式（读写 / 只读）；新建生产连接默认只读。

#### Scenario: 生产连接默认只读
- **WHEN** 用户新建连接并将环境标为「生产」
- **THEN** 读写模式默认置为「只读」

#### Scenario: 标签在操作界面可见
- **WHEN** 用户选中某连接进行操作
- **THEN** 界面显著展示该连接的名称与环境标签，供操作前辨识

### Requirement: 连接类型（单机 / 集群 / 哨兵）
连接 SHALL 支持三种类型：单机（standalone）、集群（cluster）、哨兵（sentinel），配置节点信息随类型而异，连接池按类型建立对应 client。

#### Scenario: 单机连接
- **WHEN** 用户选择「单机」并填写单个 host:port
- **THEN** 连接池以 `new Redis({host,port,...})` 建连

#### Scenario: 集群连接
- **WHEN** 用户选择「集群」并填写多个节点（host:port 列表）
- **THEN** 连接池以 `Redis.Cluster(nodes)` 建连，命令按槽位自动路由

#### Scenario: 哨兵连接
- **WHEN** 用户选择「哨兵」并填写哨兵节点列表与 master 名称
- **THEN** 连接池以哨兵配置（`sentinels` + `name`）建连到当前主节点

### Requirement: 服务端连接池单例
系统 SHALL 以 `globalThis.__redisPool` 维护 `Map<connId, client>` 单例，按 connId 建连 / 复用长连接，热重载存活。

#### Scenario: 复用连接
- **WHEN** 同一 connId 的多次操作先后到达
- **THEN** 复用同一 client，不重复建连

#### Scenario: 配置变更销毁旧连接
- **WHEN** 某连接被编辑或删除
- **THEN** 连接池销毁并移除该 connId 的 client，避免使用陈旧连接
