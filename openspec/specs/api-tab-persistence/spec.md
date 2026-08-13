# api-tab-persistence Specification

## Purpose

tab 会话持久化——持久化打开的 tab 列表、激活的 `tabId`，以及各 tab 的请求草稿（`RequestDraft`）、dirty 状态与关联节点 id（含未命名请求草稿），刷新工具页时恢复上次的工作现场；恢复范围收窄为仅恢复请求草稿，不恢复响应结果，form-data 文件字段沿用内存态不持久化。

## Requirements

### Requirement: tab 会话持久化
系统 SHALL 持久化 tab 会话，包括打开的 tab 列表、激活的 `tabId`，以及各 tab 的请求草稿（`RequestDraft`）、dirty 状态与关联节点 id。

#### Scenario: 编辑后持久化会话
- **WHEN** 用户新建 / 关闭 tab 或修改某 tab 的请求草稿
- **THEN** 系统持久化更新后的会话状态

### Requirement: 刷新恢复工作现场
重新加载工具页时，系统 SHALL 恢复上次的 tab 会话（打开的 tab、激活项、各 tab 的请求草稿）。

#### Scenario: 刷新恢复 tab 与草稿
- **WHEN** 用户在有多个 tab 且含未保存草稿时刷新页面
- **THEN** 系统恢复这些 tab、激活项与各自的请求草稿

### Requirement: 未命名请求草稿持久化
未保存到集合的「未命名请求」tab 的草稿 SHALL 一并持久化，刷新后不丢失。

#### Scenario: 未命名草稿刷新保留
- **WHEN** 用户在一个未保存的「未命名请求」tab 中填写了请求后刷新
- **THEN** 该 tab 与其草稿被恢复，仍处于未关联节点状态

### Requirement: 会话恢复的收窄边界
会话恢复 SHALL 恢复请求草稿，但 SHALL NOT 恢复上次的响应结果；form-data 文件字段沿用①的内存态，SHALL NOT 持久化。

#### Scenario: 响应结果不恢复
- **WHEN** 用户在某 tab 得到响应后刷新页面
- **THEN** 该 tab 被恢复但响应区为空，需重新发送

#### Scenario: 文件字段不恢复
- **WHEN** 用户在 form-data 中选择过文件后刷新页面
- **THEN** 文件字段需重新选择（不被持久化）
