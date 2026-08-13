## ADDED Requirements

### Requirement: INFO 分区解析
系统 SHALL 执行 `INFO` 并将文本解析为分区结构（server / clients / memory / stats / replication / keyspace），供前端结构化展示。

#### Scenario: 展示关键指标
- **WHEN** 用户打开某连接的监控面板
- **THEN** 系统展示 Redis 版本、运行时长、连接客户端数、内存占用（used_memory_human / maxmemory）、每秒指令数、键空间命中率、复制角色与从节点数

#### Scenario: 键空间概览
- **WHEN** 监控面板渲染 keyspace 分区
- **THEN** 展示各 db 的 key 数量与设置过期的 key 数量

### Requirement: 手动刷新
监控面板 SHALL 支持手动刷新以获取最新 INFO 快照。

#### Scenario: 刷新指标
- **WHEN** 用户点击「刷新」
- **THEN** 系统重新执行 `INFO` 并更新面板数据

### Requirement: 集群按节点聚合
当连接为集群类型时，系统 SHALL 对各主节点分别取 `INFO` 并按节点聚合展示。

#### Scenario: 集群多节点指标
- **WHEN** 集群连接打开监控面板
- **THEN** 系统对每个主节点取 INFO，按节点分栏展示，并对内存 / ops 等关键项提供汇总

### Requirement: 只读安全
INFO 监控 SHALL 为纯只读操作，不受读写模式限制，任何连接均可查看。

#### Scenario: 只读连接查看监控
- **WHEN** 只读模式连接打开监控面板
- **THEN** 正常展示 INFO 指标，不触发写拦截
