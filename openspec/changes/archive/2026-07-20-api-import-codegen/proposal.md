## Why

接口调试常需与外部协作：别人给一条 cURL 要能一键导入调试；调好的接口要能导出成 curl / fetch 贴进代码或文档。① 的请求组装管线天然支持这对**对称操作**——导入是管线逆运算、代码生成是管线旁路终端。本 change 为四层规划第 ④ 层，仅依赖 ①。

> 四层规划第 ④ 层的 **④a（import/codegen，仅依赖 ①）**。**④b（OpenAPI / Postman 批量导入，依赖 ②）为后续单列 change，不在本 change 范围。** 整体路线与请求组装管线见已归档的 `add-api-client-core/design.md`。

## What Changes

- 新增**单条 cURL 导入**：粘贴 curl → 解析 → 反推 `RequestDraft` → 载入**新 tab**（管线逆运算）。
- 解析常见 curl 选项：`-X` 方法、URL、`-H` header、`-d`/`--data`/`--data-raw`/`--data-urlencoded` body、`-F` form-data、`-u` basic auth；未知选项忽略并提示。
- 新增**代码生成**：当前请求经 ① 组装得 wire 请求 → 序列化为 curl / fetch 字符串（管线旁路终端），目标可扩展，一键复制。
- 代码生成**「所见即所发」**：以组装后的 wire 为输入（若 ③ 环境在场，则为变量替换后的值）。
- **不改动**：①/②/③ 逻辑（纯叠加，复用 ① 组装函数）；旧 `/api/proxy`、compare。

## Capabilities

### New Capabilities
- `api-curl-import`：单条 cURL 导入——curl 解析、反推 `RequestDraft`、载入新 tab、未知选项与解析错误提示。
- `api-code-generation`：代码生成——组装后 wire → curl / fetch 字符串、目标可扩展、一键复制。

### Modified Capabilities
<!-- 无：纯前端叠加，复用 ① 组装函数，不改现有能力需求。 -->

## Impact

- **新增前端**：cURL 导入入口与解析器；代码生成面板与 generator（目标可扩展）。
- **复用**：① 的 `RequestDraft` 类型与组装函数（抽为共享，供实际发送与代码生成共用，避免漂移）。
- **无后端、无 DB、无 schema 变更**（④a 纯前端，仅依赖 ①）。
- **少依赖**：curl 解析与代码生成均自研轻量实现，不引重依赖。
- **不改动**：①/②/③、旧 `/api/proxy`、compare。
- **范围边界**：仅单条 cURL；OpenAPI / Postman 批量导入属 ④b（依赖 ②），后续单列。
