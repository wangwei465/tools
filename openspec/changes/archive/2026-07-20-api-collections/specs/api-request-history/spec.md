## ADDED Requirements

### Requirement: 发送后落历史
每次经代理发送请求并得到结果后，系统 SHALL 追加一条 `api_history` 记录，包含请求快照（`snapshot` JSON）、`status`、`time_ms`、`size`、`created_at`；若请求来自已保存节点则关联 `node_id`。

#### Scenario: 成功响应落历史
- **WHEN** 一次请求成功返回响应
- **THEN** 系统新增一条历史记录，含请求快照与状态 / 耗时 / 大小

#### Scenario: 错误也落历史
- **WHEN** 一次请求以错误（超时 / 网络失败 / 非 2xx）结束
- **THEN** 系统同样落一条历史记录并标注其结果状态

### Requirement: 历史列表回看
系统 SHALL 提供历史面板，按时间倒序展示历史记录，可查看某条记录的请求与结果摘要。

#### Scenario: 查看历史条目
- **WHEN** 用户打开历史面板并选择某条记录
- **THEN** 系统展示该记录的请求快照与状态 / 耗时 / 大小摘要

### Requirement: 重放历史到 tab
系统 SHALL 支持把某条历史的请求快照重放——载入一个 tab 供再次编辑与发送。

#### Scenario: 重放历史请求
- **WHEN** 用户对某条历史记录点击「重放」
- **THEN** 系统以该记录的请求快照新建（或载入）一个 tab

### Requirement: 历史持久化与清理
历史记录 SHALL 持久化到 `api_history`，刷新后保持；系统 SHALL 支持删除单条或清空历史。

#### Scenario: 刷新后保持
- **WHEN** 用户刷新页面
- **THEN** 历史面板重新加载既有历史记录

#### Scenario: 清空历史
- **WHEN** 用户执行「清空历史」并确认
- **THEN** 全部历史记录被移除
