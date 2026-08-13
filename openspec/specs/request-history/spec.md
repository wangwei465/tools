# request-history Specification

## Purpose

请求历史——在接口请求成功后记录 URL、请求方法、普通 Headers、使用次数与最近使用时间（不记录统一令牌），支持在 URL 输入框按关键词下拉筛选并选中回填以快速复用；历史记录使用 SQLite 持久化。

## Requirements

### Requirement: 记录成功请求的地址
系统 SHALL 在接口请求成功后记录该请求的地址与配置，用于后续复用。记录内容包含 URL、请求方法、普通 Headers、使用次数与最近使用时间；MUST NOT 记录统一令牌。

#### Scenario: 首次请求写入记录
- **WHEN** 某个此前未记录的 URL 请求成功
- **THEN** 系统新增一条历史记录，使用次数为 1 并记录当前时间为最近使用时间

#### Scenario: 重复请求累加
- **WHEN** 某个已记录的 URL 再次请求成功
- **THEN** 系统更新该记录的使用次数加 1、刷新最近使用时间，并更新其普通 Headers

#### Scenario: 不记录令牌
- **WHEN** 请求携带了统一令牌并成功
- **THEN** 写入的历史记录中不包含统一令牌值

### Requirement: 历史地址下拉筛选
URL 输入框 SHALL 支持从历史记录中按关键词下拉筛选，用户可选择已有地址快速复用。

#### Scenario: 关键词筛选
- **WHEN** 用户在 URL 输入框输入关键词
- **THEN** 系统按 URL 或名称匹配历史记录，并以最近使用时间倒序展示候选项

#### Scenario: 选中回填
- **WHEN** 用户从下拉候选中选择一条历史记录
- **THEN** 系统将该记录的 URL 与普通 Headers 回填到当前侧请求区，但不回填令牌

#### Scenario: 无匹配项
- **WHEN** 用户输入的关键词无任何历史记录匹配
- **THEN** 系统展示空结果，用户仍可手动输入新地址请求

### Requirement: 历史记录持久化
请求历史 SHALL 使用 SQLite 存储，页面刷新或重启后历史记录依然可用于筛选复用。

#### Scenario: 重启后仍可复用
- **WHEN** 用户重启应用后在 URL 输入框输入关键词
- **THEN** 系统仍能从 SQLite 中筛选出此前记录的历史地址
