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

### Requirement: 响应 JSONPath 提取视图
响应区 SHALL 在 Body / Headers / Cookies 之外提供 JSONPath 视图，允许用户输入 JSONPath 表达式对**当前响应体**求值，并展示命中值与命中路径；该视图 SHALL 仅在响应为 JSON 类型时可用，非 JSON 响应下 SHALL 明确说明不可用的原因而非报错。

#### Scenario: 对当前响应体求值
- **WHEN** 响应为 JSON 且用户在 JSONPath 视图输入合法表达式
- **THEN** 响应区展示该表达式在当前响应体上的全部命中值及其路径

#### Scenario: 无需手工粘贴响应
- **WHEN** 用户切换到 JSONPath 视图
- **THEN** 系统直接以当前响应体为求值目标，用户无需复制粘贴响应内容

#### Scenario: 非 JSON 响应下不可用
- **WHEN** 响应的 Content-Type 非 JSON（如 text/html、二进制类型）
- **THEN** JSONPath 视图不可用并说明原因，不对非 JSON 内容强行求值

#### Scenario: 表达式错误不影响其他视图
- **WHEN** 用户输入非法表达式导致求值失败
- **THEN** 系统在 JSONPath 视图内提示错误，Body / Headers / Cookies 视图内容不受影响

#### Scenario: 切换响应后状态可预期
- **WHEN** 用户发送新请求得到新响应
- **THEN** JSONPath 视图针对新响应体求值，不展示上一次响应的结果
