# redis-console Specification

## Purpose

命令控制台——原始命令执行、结果回显、命令历史、只读拦截与危险命令二次确认。

## Requirements

### Requirement: 原始命令执行
系统 SHALL 提供 redis-cli 式命令控制台，将用户输入的原始命令透传给目标 Redis 并原样回显结果。

#### Scenario: 执行读命令
- **WHEN** 用户输入 `GET user:1` 并执行
- **THEN** 系统对当前连接执行该命令并原样展示返回值

#### Scenario: 执行写命令（读写模式）
- **WHEN** 当前连接为读写模式，用户输入 `SET k v` 并执行
- **THEN** 系统执行并展示结果（OK）

#### Scenario: 命令出错
- **WHEN** 命令语法错误或 Redis 返回错误
- **THEN** 系统原样展示错误信息，不中断控制台

### Requirement: 命令历史
控制台 SHALL 保留本会话内的命令历史，供快速回填复用。

#### Scenario: 回填历史命令
- **WHEN** 用户在输入框调取上一条历史命令
- **THEN** 该命令回填到输入框可再次执行

### Requirement: 只读模式拦截写命令
当连接为只读模式时，系统 SHALL 拦截写命令，判定基于服务端硬编码的命令白/黑名单，不信任前端。

#### Scenario: 只读拦截写命令
- **WHEN** 只读连接下用户执行 `SET`/`DEL`/`HSET` 等写命令
- **THEN** 命令被拦截，提示当前为只读模式，需切换后才能执行

### Requirement: 危险命令二次确认
系统 SHALL 对危险命令（如 `FLUSHALL`/`FLUSHDB`/`CONFIG`/`SHUTDOWN`/`DEBUG` 等）要求二次确认后才执行，确认弹窗展示连接名与环境标签。

#### Scenario: 危险命令拦截待确认
- **WHEN** 用户执行 `FLUSHALL` 且未确认
- **THEN** 系统不执行，弹出确认窗并显示目标连接名与环境标签

#### Scenario: 确认后执行
- **WHEN** 用户在确认窗明确确认（confirm=true）
- **THEN** 系统才执行该危险命令
