## ADDED Requirements

### Requirement: 通用请求代理
系统 SHALL 提供后端代理 `POST /api/request`，代表前端向目标接口发起请求，以规避浏览器 CORS。

#### Scenario: 经代理发起请求
- **WHEN** 前端发送请求
- **THEN** 请求先到达 `POST /api/request`，由服务端向目标地址发起并回传响应

### Requirement: 透传任意方法与请求体
代理 SHALL 接收统一 JSON 信封 `{ method, url, headers, bodyType, body }`，按 `bodyType` 重组请求体（raw→字符串、urlencoded→表单串、form-data→multipart 且文件从 base64 还原），并以指定方法透传。

#### Scenario: 透传 POST + JSON body
- **WHEN** 信封为 `{ method:"POST", bodyType:"raw", body:"{...}" }`
- **THEN** 代理以 POST 与该 JSON body 请求目标地址

#### Scenario: 透传 form-data 含文件
- **WHEN** 信封 bodyType 为 form-data 且含 base64 文件字段
- **THEN** 代理还原文件并以 multipart/form-data 请求目标地址

### Requirement: 返回完整响应元信息
代理 SHALL 返回目标响应的 `{ status, statusText, headers, body, timeMs, size }`，其中 body 为原样文本，不做 JSON 解析或改写。

#### Scenario: 返回响应元信息
- **WHEN** 目标接口返回响应
- **THEN** 代理返回状态码、状态文本、响应头、原样 body、耗时与大小

### Requirement: 不校验响应类型、不因非 2xx 判失败
代理 SHALL 原样返回任意 Content-Type 的响应，且 SHALL NOT 因目标返回非 2xx 而将其转为代理层错误。

#### Scenario: 非 2xx 原样返回
- **WHEN** 目标接口返回 4xx 或 5xx
- **THEN** 代理照常返回该状态码与响应体，而非返回代理层错误

#### Scenario: 非 JSON 原样返回
- **WHEN** 目标接口返回 HTML 或纯文本
- **THEN** 代理原样返回该文本，不报「非 JSON」错误

### Requirement: 超时、取消与大小上限
代理 SHALL 支持请求超时与前端取消（AbortController），并对超大响应设置大小上限。

#### Scenario: 请求超时
- **WHEN** 目标接口在超时时长内无响应
- **THEN** 代理中止请求并返回超时错误

#### Scenario: 响应超过大小上限
- **WHEN** 目标响应体超过设定的大小上限
- **THEN** 代理停止读取并返回「响应过大」错误
