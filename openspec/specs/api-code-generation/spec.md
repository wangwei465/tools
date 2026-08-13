# api-code-generation Specification

## Purpose

代码生成——以「组装后的 wire 请求」为统一输入，生成 cURL、fetch 等多目标等价代码，支持一键复制，且生成结果与实际发送一致。

## Requirements

### Requirement: 生成 cURL
系统 SHALL 把当前请求（经 ① 组装管线得到的 wire 请求）生成等价的 cURL 命令字符串。

#### Scenario: 生成 curl
- **WHEN** 用户对一个含方法 / headers / body 的请求选择生成 curl
- **THEN** 系统输出等价的 `curl` 命令，含方法、各 Header、Body

### Requirement: 生成 fetch（JavaScript）
系统 SHALL 生成等价的 JavaScript `fetch` 代码。

#### Scenario: 生成 fetch
- **WHEN** 用户选择生成 fetch
- **THEN** 系统输出等价的 `fetch(url, { method, headers, body })` 代码

### Requirement: 目标可扩展与一键复制
代码生成 SHALL 以「组装后的 wire 请求」为统一输入，支持多目标（至少 curl、fetch）且目标可扩展；SHALL 支持一键复制生成结果。

#### Scenario: 切换生成目标
- **WHEN** 用户在代码生成面板切换目标（curl ↔ fetch）
- **THEN** 系统展示对应目标的代码

#### Scenario: 复制生成代码
- **WHEN** 用户点击「复制」
- **THEN** 生成的代码被复制到剪贴板

### Requirement: 生成结果与实际发送一致
生成的代码 SHALL 反映经 ① 组装管线后的实际请求；若 ③ 环境在场，SHALL 基于变量替换后的值生成。

#### Scenario: 所见即所发
- **WHEN** 请求含 Auth 与 Query params，用户生成 curl
- **THEN** 生成的 curl 与实际经代理发送的 wire 请求一致（Auth 已注入、params 已并入 URL）
