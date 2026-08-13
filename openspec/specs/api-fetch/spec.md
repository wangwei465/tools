# api-fetch Specification

## Purpose

接口请求回填——在数据比对工具的 JSON 模式下，于左右编辑器上方各提供独立请求区（地址、普通 Header、请求按钮），通过后端 `POST /api/proxy` 代理发起 GET 请求以规避 CORS 并隐藏令牌，校验响应为合法 JSON 后回填对应侧编辑器并自动触发差异比对。

## Requirements

### Requirement: 左右侧接口请求区
数据比对工具在 JSON 模式下 SHALL 于左右两个编辑器上方各提供一个请求区，包含请求地址输入框、普通 Header 配置与"请求并回填"按钮，供用户分别为左右两侧发起接口请求。

#### Scenario: JSON 模式显示请求区
- **WHEN** 用户处于 JSON 模式
- **THEN** 左右编辑器上方各显示一个请求区（地址输入框、Header 配置、请求按钮）

#### Scenario: 字符串模式隐藏请求区
- **WHEN** 用户切换到字符串模式
- **THEN** 系统隐藏或禁用左右请求区

#### Scenario: 左右独立请求
- **WHEN** 用户在左侧请求区点击"请求并回填"
- **THEN** 系统仅请求左侧地址并仅回填左侧编辑器，不影响右侧内容

### Requirement: GET 请求方法
接口请求第一版 SHALL 仅支持 GET 方法。

#### Scenario: 发起 GET 请求
- **WHEN** 用户填写请求地址并点击"请求并回填"
- **THEN** 系统以 GET 方法请求该地址

### Requirement: 后端代理请求
系统 SHALL 通过后端 API route 代理外部接口请求，而非由浏览器直接请求目标接口，以规避 CORS 并使令牌不暴露于前端。

#### Scenario: 通过代理发起请求
- **WHEN** 前端发起接口请求
- **THEN** 请求先到达后端 `POST /api/proxy`，由服务端携带合并后的 Header 请求目标地址并返回响应

#### Scenario: 目标接口不可达
- **WHEN** 服务端请求目标地址失败（网络错误、超时、非 2xx 状态）
- **THEN** 代理返回明确错误信息，前端提示失败且不回填编辑器

### Requirement: 普通 Header 配置
每侧请求区 SHALL 支持配置任意数量的普通 Header 键值对，随该侧请求一并发送。

#### Scenario: 配置并发送自定义 Header
- **WHEN** 用户为某侧添加 Header（如 `tenant-id: dev`）并发起请求
- **THEN** 服务端在请求目标接口时携带该 Header

### Requirement: 响应 JSON 校验与回填
代理 SHALL 校验目标接口响应是否为合法 JSON；仅当为合法 JSON 时才回填对应编辑器，否则返回错误且不回填。

#### Scenario: 合法 JSON 响应回填
- **WHEN** 目标接口返回合法 JSON
- **THEN** 系统将响应格式化后写入对应侧编辑器

#### Scenario: 非 JSON 响应
- **WHEN** 目标接口返回非合法 JSON（如 HTML、纯文本）
- **THEN** 系统返回"响应不是合法 JSON"的错误提示，且不回填编辑器

### Requirement: 回填后自动触发比对
请求成功回填编辑器后，系统 SHALL 自动触发现有 hash 计算与差异比对，无需用户额外操作。

#### Scenario: 回填后自动比对
- **WHEN** 某侧请求成功并回填 JSON
- **THEN** 系统按现有比对逻辑重新计算该侧 hash 并在两侧均有效时更新差异结果
