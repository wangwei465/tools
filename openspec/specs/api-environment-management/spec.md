# api-environment-management Specification

## Purpose

环境管理——支持环境的增删改查（`api_environments`）、单激活环境切换（含「无环境」），以及环境与激活状态的持久化。

## Requirements

### Requirement: 环境 CRUD
系统 SHALL 支持创建、重命名、删除环境（`api_environments`）。

#### Scenario: 创建环境
- **WHEN** 用户新建一个环境并命名（如「测试」）
- **THEN** 系统创建该环境并出现在环境列表中

#### Scenario: 重命名环境
- **WHEN** 用户重命名某环境
- **THEN** 该环境以新名称展示并持久化

#### Scenario: 删除环境
- **WHEN** 用户删除某环境并确认
- **THEN** 该环境及其环境级变量一并移除

### Requirement: 单激活环境切换
系统 SHALL 提供环境切换器，同一时刻至多一个环境为激活（`is_active`）；支持切换到「无环境」（仅全局变量生效）。

#### Scenario: 切换激活环境
- **WHEN** 用户在切换器中选择某环境
- **THEN** 该环境成为激活环境，其余环境取消激活，后续请求以此环境解析变量

#### Scenario: 切换到「无环境」
- **WHEN** 用户选择「无环境」
- **THEN** 无环境级变量生效，仅全局变量参与替换

### Requirement: 环境与激活态持久化
环境及其激活状态 SHALL 持久化到 `api_environments`，刷新页面后保持。

#### Scenario: 刷新保持激活环境
- **WHEN** 用户设置某环境为激活后刷新页面
- **THEN** 该环境仍为激活状态
