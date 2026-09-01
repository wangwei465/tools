## ADDED Requirements

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
