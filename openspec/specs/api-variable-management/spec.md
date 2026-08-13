# api-variable-management Specification

## Purpose

变量管理——维护环境级变量（归属 `env_id`）与全局变量（`env_id=null`），提供按「当前环境 / 全局」分组的编辑面板支持增删改与启用切换，并将变量持久化到 `api_variables`。

## Requirements

### Requirement: 环境级变量
系统 SHALL 支持在某环境下维护变量（`key`/`value`/`enabled`），归属该环境（`env_id`）。

#### Scenario: 新增环境变量
- **WHEN** 用户在某环境下新增一条变量（如 `host = https://test.example.com`）
- **THEN** 该变量归属此环境，在该环境激活时参与替换

#### Scenario: 禁用变量
- **WHEN** 用户将某变量标记为禁用（`enabled=false`）
- **THEN** 该变量不参与替换

### Requirement: 全局变量
系统 SHALL 支持维护全局变量（`env_id=null`），对所有环境（含「无环境」）可见。

#### Scenario: 新增全局变量
- **WHEN** 用户新增一条全局变量
- **THEN** 无论当前激活哪个环境，该变量均参与替换（除非被同名环境变量覆盖）

### Requirement: 变量编辑面板
系统 SHALL 提供变量编辑面板，按「当前环境 / 全局」分组展示并支持增删改与启用切换。

#### Scenario: 编辑变量
- **WHEN** 用户在面板中修改某变量的 `key` 或 `value`
- **THEN** 修改被保存并在下次替换时生效

### Requirement: 变量持久化
变量 SHALL 持久化到 `api_variables`，刷新页面后保持。

#### Scenario: 刷新后保持
- **WHEN** 用户增改变量后刷新页面
- **THEN** 变量以变更后的状态重新加载
