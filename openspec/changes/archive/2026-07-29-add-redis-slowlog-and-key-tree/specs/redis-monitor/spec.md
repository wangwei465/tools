## ADDED Requirements

### Requirement: 慢查询日志拉取与解析
系统 SHALL 通过 `SLOWLOG GET <n>` 拉取慢命令条目并解析为结构化字段,通过 `SLOWLOG LEN` 获取当前慢日志总条数,供监控面板以列表展示。每条 SHALL 至少解析:条目 ID、发生时间戳、执行耗时(微秒)、命令及其参数、客户端地址与客户端名(Redis 4.0+ 提供时)。

#### Scenario: 展示慢查询列表
- **WHEN** 用户在监控面板打开「慢查询」子视图
- **THEN** 系统执行 `SLOWLOG LEN` 与 `SLOWLOG GET <n>`,按耗时从高到低(或发生时间倒序)展示条目的时间、耗时、命令与客户端信息,并显示总条数

#### Scenario: 无慢查询记录
- **WHEN** 慢日志为空(`SLOWLOG LEN` 为 0)
- **THEN** 面板展示"暂无慢查询记录",不报错

#### Scenario: 命令参数超长截断
- **WHEN** 某条慢命令的参数极长(Redis 对超长参数以省略标记截断)
- **THEN** 系统原样展示 Redis 返回的(可能已截断的)参数,不做二次解析破坏

### Requirement: 慢查询清空需危险二次确认
系统 SHALL 支持 `SLOWLOG RESET` 清空慢日志,该操作 MUST 归类为危险命令并要求二次确认后才执行;只读模式下 MUST 拦截该操作。

#### Scenario: 清空前二次确认
- **WHEN** 用户点击「清空慢日志」
- **THEN** 系统弹出二次确认(展示目标连接名与环境),确认后才执行 `SLOWLOG RESET`

#### Scenario: 只读模式禁止清空
- **WHEN** 当前连接为只读模式,用户尝试清空慢日志
- **THEN** 操作被拦截并提示切换到读写模式,不执行 `SLOWLOG RESET`

### Requirement: 集群按主节点聚合慢查询
当连接为集群类型时,系统 SHALL 对各主节点分别取慢日志并按节点分栏展示;`SLOWLOG RESET` SHALL 逐主节点执行。

#### Scenario: 集群多节点慢查询
- **WHEN** 集群连接打开慢查询子视图
- **THEN** 系统对每个主节点(`nodes('master')`)分别 `SLOWLOG GET/LEN`,按节点分栏展示各自的条目

### Requirement: 慢查询只读拉取不受读写模式限制
`SLOWLOG GET` 与 `SLOWLOG LEN` SHALL 为纯只读操作,任何连接(含只读模式)均可查看,不触发写拦截。

#### Scenario: 只读连接查看慢查询
- **WHEN** 只读模式连接打开慢查询子视图
- **THEN** 正常展示慢查询条目,不触发写拦截(仅清空受限)
