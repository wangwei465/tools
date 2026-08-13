# api-curl-import Specification

## Purpose

cURL 导入——粘贴一条 cURL 命令，解析常见选项并映射到请求构造，载入新 tab；对畸形输入保持健壮。

## Requirements

### Requirement: 粘贴 cURL 导入
系统 SHALL 支持粘贴一条 cURL 命令，解析为 `RequestDraft` 并载入一个**新 tab**（不覆盖当前编辑中的 tab）。

#### Scenario: 导入 GET curl
- **WHEN** 用户粘贴 `curl https://api.example.com/users` 并导入
- **THEN** 系统新建 tab，方法为 GET、URL 为该地址

#### Scenario: 导入带 header 与 body 的 POST curl
- **WHEN** 用户粘贴含 `-X POST -H 'Content-Type: application/json' -d '{"a":1}'` 的 curl
- **THEN** 新 tab 方法为 POST、含该 Header、Body 为 raw(JSON) 且内容为 `{"a":1}`

### Requirement: 解析常见 curl 选项
cURL 解析 SHALL 覆盖常见选项：`-X` 方法、URL、`-H` header、`-d`/`--data`/`--data-raw`/`--data-urlencoded` body、`-F` form-data、`-u` basic auth；能处理引号与 `\` 续行。

#### Scenario: 解析 form-data
- **WHEN** curl 含 `-F 'name=foo' -F 'file=@/path/x.png'`
- **THEN** Body 类型为 form-data，含文本字段 `name` 与文件字段 `file`（保留路径占位）

#### Scenario: 解析 basic auth
- **WHEN** curl 含 `-u user:pass`
- **THEN** Auth 类型为 basic，用户名 / 密码相应填入

#### Scenario: 忽略未知选项并提示
- **WHEN** curl 含无法识别的选项
- **THEN** 系统忽略该选项、完成其余解析，并提示存在未识别选项

### Requirement: 导入映射到请求构造
解析结果 SHALL 正确映射到 ① 的请求构造：方法、URL ⇄ Query params、Headers、Body 类型（据 content-type 与选项推断）、Auth。

#### Scenario: 依据选项推断 body 类型
- **WHEN** curl 使用 `--data-urlencoded 'a=1&b=2'`
- **THEN** Body 类型为 x-www-form-urlencoded，键值为 `a=1`、`b=2`

### Requirement: 导入健壮性
对不完整或畸形的 cURL，系统 SHALL 给出解析错误提示而非崩溃，且不破坏当前 tab。

#### Scenario: 畸形 curl 报错
- **WHEN** 用户粘贴无法解析的文本并导入
- **THEN** 系统提示解析失败，当前 tab 保持不变
