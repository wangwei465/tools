# redis-value Specification

## Purpose

类型化值——string/hash/list/set/zset 五类型的查看与编辑、TTL 设置（EXPIRE/PERSIST）。

## Requirements

### Requirement: 类型化值查看
系统 SHALL 按 key 的实际类型读取并展示值，覆盖 string / hash / list / set / zset 五种类型，统一返回 `{ type, value, ttl }`。

#### Scenario: 查看 string
- **WHEN** 用户选中一个 string 类型的 key
- **THEN** 展示其文本值（支持 JSON 美化）与 TTL

#### Scenario: 查看 hash
- **WHEN** 用户选中一个 hash 类型的 key
- **THEN** 以字段表（field → value）展示其内容

#### Scenario: 查看 list / set / zset
- **WHEN** 用户选中 list / set / zset 类型的 key
- **THEN** 分别以有序元素表 / 成员表 / 成员+score 表展示

#### Scenario: 大集合截断保护
- **WHEN** 目标集合元素数超过读取上限
- **THEN** 仅返回前 N 个元素并提示已截断，避免拖垮前端

### Requirement: 类型化值编辑
系统 SHALL 支持五种类型的写操作，写命令按类型分派；只读模式下拦截所有写操作。

#### Scenario: 编辑 string
- **WHEN** 用户修改 string 值并保存
- **THEN** 系统执行 `SET` 写回新值

#### Scenario: 编辑 hash 字段
- **WHEN** 用户改 / 增 / 删某个 hash 字段
- **THEN** 系统分别执行 `HSET` / `HDEL` 生效

#### Scenario: 编辑 list
- **WHEN** 用户对 list 做头尾增删或按索引改值
- **THEN** 系统执行对应 `LPUSH`/`RPUSH`/`LPOP`/`RPOP`/`LSET` 生效

#### Scenario: 编辑 set
- **WHEN** 用户增 / 删 set 成员
- **THEN** 系统执行 `SADD` / `SREM` 生效

#### Scenario: 编辑 zset
- **WHEN** 用户增 / 删成员或修改分数
- **THEN** 系统执行 `ZADD` / `ZREM` 生效

#### Scenario: 只读模式拦截写入
- **WHEN** 当前连接为只读模式且用户尝试保存任何值修改
- **THEN** 写操作被拦截并提示切换到读写模式

### Requirement: TTL 操作
系统 SHALL 支持对 key 设置 / 移除过期时间。

#### Scenario: 设置过期
- **WHEN** 用户为某 key 设置过期秒数
- **THEN** 系统执行 `EXPIRE` 并刷新展示的 TTL

#### Scenario: 移除过期（持久化）
- **WHEN** 用户对某带 TTL 的 key 移除过期
- **THEN** 系统执行 `PERSIST`，key 变为永久
