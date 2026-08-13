# api-response-viewer Specification

## Purpose

响应展示——状态码/耗时/大小、Body 按 content-type 分流、Headers、Cookies；非 2xx 也展示。

## Requirements

### Requirement: 响应状态摘要
响应区 SHALL 展示状态码（按 2xx/3xx/4xx/5xx 区分配色）、耗时与响应大小。

#### Scenario: 展示状态摘要
- **WHEN** 请求返回响应
- **THEN** 响应区展示状态码、耗时（ms）与大小

### Requirement: 响应体按类型展示
响应区 SHALL 依据响应 `Content-Type` 分流展示 Body：JSON 美化、HTML/XML 高亮、纯文本原样；二进制类型给出「无法预览」提示。

#### Scenario: JSON 响应美化
- **WHEN** 响应 Content-Type 为 application/json
- **THEN** 响应区以美化（缩进/可折叠）方式展示 JSON

#### Scenario: 二进制响应提示
- **WHEN** 响应为二进制类型（如 image/*、application/octet-stream）
- **THEN** 响应区给出「无法预览」提示而非展示乱码

### Requirement: 展示非 2xx 响应体
系统 SHALL 对非 2xx 响应同样展示其响应体与状态，不将其作为「失败」丢弃。

#### Scenario: 展示 4xx/5xx 响应体
- **WHEN** 目标接口返回 4xx 或 5xx 且带响应体
- **THEN** 响应区展示该状态码与响应体内容

### Requirement: 响应 Headers 与 Cookies
响应区 SHALL 展示响应 Headers，并从 `Set-Cookie` 解析展示 Cookies。

#### Scenario: 展示响应 Headers
- **WHEN** 请求返回响应
- **THEN** 响应区可查看完整的响应 Header 列表

#### Scenario: 展示 Cookies
- **WHEN** 响应包含 Set-Cookie
- **THEN** 响应区在 Cookies 视图展示对应 cookie（第一版仅键值）
