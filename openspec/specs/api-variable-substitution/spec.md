# api-variable-substitution Specification

## Purpose

变量替换——在请求组装管线最前段将 `RequestDraft` 各字段中的 `{{变量}}` 替换为解析值，遵循「激活环境级 > 全局级」优先级与启用规则，对未定义变量保留原样并提示（不阻断发送），并支持发送前预览替换后的实际请求。

## Requirements

### Requirement: `{{变量}}` 替换
请求组装管线 SHALL 在最前段把 `RequestDraft` 各字段（url、query params、headers、body 文本、auth）中的 `{{key}}` 替换为解析值，再进入 ① 的 Auth / Query / Body 组装。

#### Scenario: URL 中变量替换
- **WHEN** URL 为 `{{host}}/users` 且 `host` 解析为 `https://test.example.com`
- **THEN** 实际请求的 URL 为 `https://test.example.com/users`

#### Scenario: Header 中变量替换
- **WHEN** 某 Header 值为 `Bearer {{token}}` 且 `token` 已定义
- **THEN** 实际请求携带替换后的 Header 值

#### Scenario: Body 中变量替换
- **WHEN** raw JSON body 含 `{{userId}}` 且已定义
- **THEN** 实际发送的 body 中该占位被替换为对应值

### Requirement: 作用域与优先级
变量解析 SHALL 遵循「激活环境级 > 全局级」优先级，且仅启用（`enabled`）的变量参与。

#### Scenario: 环境变量覆盖全局
- **WHEN** 同名变量在激活环境与全局各有定义
- **THEN** 替换取激活环境的值

#### Scenario: 禁用变量不参与
- **WHEN** 某 `{{key}}` 对应变量被禁用
- **THEN** 该变量视为未定义，不用于替换

### Requirement: 未定义变量处理
对未定义的 `{{key}}`，系统 SHALL 保留原样（不替换）并给出可见提示，且 SHALL NOT 阻断发送。

#### Scenario: 未定义变量保留原样并提示
- **WHEN** 请求含 `{{unknown}}` 且无对应启用变量
- **THEN** 该占位原样保留、界面给出未定义提示，用户仍可发送

### Requirement: 替换后预览
系统 SHALL 支持在发送前查看变量代入后的实际请求（至少 URL、headers、body 的最终值）。

#### Scenario: 预览替换后请求
- **WHEN** 用户在含变量的请求上打开「预览」
- **THEN** 系统展示变量替换后的实际 URL / headers / body
