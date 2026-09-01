## Why

工具集现在能转编码、能算哈希、能跑 SQL，但每天做得最多的一类活儿反而没有落点：手上一坨文本——从日志里 grep 出来的一列 ID、产品给的一份 Excel 粘贴、接口返回的一段 JSON——需要去重、排序、换个命名风格、转成另一种格式，或者照着它写出对应的实体类。这些事现在靠在线工具网站或者临时写脚本解决，前者要把内容贴到别人的服务器上，后者每次都得重写一遍。

这里面「JSON 转实体类」尤其高频：拿到一份接口报文要写对应的 DTO，手敲一遍既慢又容易漏字段、错类型。工具集已经有了 `api-client` 能拿到报文、有 `convert` 能格式化 JSON，唯独缺把报文变成代码的最后一步。

## What Changes

- 新增「文本工具」（`/text-kit`）挂载到全局导航，单页多标签组织，纯客户端计算、不出网、不落库，与 `convert` / `sql-kit` / `crypto` 三个工具的形态一致
- **行处理**：去重（保序）、排序（字典序 / 数值 / 长度，可反序）、去空行、去首尾空白、加前缀后缀、加行号、整体反转，以及两组文本的交集 / 差集 / 并集
- **命名风格转换**：`UPPER` / `lower` / `Title` / `camelCase` / `PascalCase` / `snake_case` / `kebab-case` / `CONSTANT_CASE` 互转，逐行批量处理
- **批量替换**：字面量与正则两种模式，支持捕获组引用，作用于整段文本并输出结果
- **表格转换**：CSV / TSV ⇄ JSON 数组 ⇄ Markdown 表格三向互转，含分隔符选择与首行是否为表头
- **文本统计**：字符数（含 / 不含空白）、行数、词数、UTF-8 字节数，以及各行长度的最大 / 最小值
- **类型代码生成**：粘贴 JSON 样本，生成 TypeScript `interface`、Java POJO、Go `struct`（带 json tag）与 JSON Schema；嵌套对象生成具名子类型，字段在数组元素间缺失时标记为可选
- **CSV 解析算法提取为中立模块**：`lib/sql-kit/csv.ts` 的解析实现移至 `lib/shared/csv.ts`，`sql-kit` 与 `text-kit` 各自以自己的结果类型包装，算法只保留一份

### 非目标

- **不重复实现已有能力**：JSON ⇄ YAML、Base64、URL 编码、正则「测试」、JWT 解析、进制转换留在「编码转换」；CSV / JSON → SQL `INSERT` 留在「SQL 工具」。本工具在相应面板给出交叉指引，MUST NOT 再实现一份
- 不做文件上传与下载，输入输出一律走文本框与剪贴板
- 不做 Excel（`.xlsx`）二进制格式的解析，只处理从 Excel 粘贴出来的 TSV 文本
- 不做代码生成的反向能力（类型定义 → JSON 样本）
- 不做 Protobuf / Avro / Thrift 等 IDL 的生成
- 不做多文件、多类型的批量代码生成工程，一次处理一份 JSON 样本
- 不做文本内容的持久化与历史记录

## Capabilities

### New Capabilities

- `text-toolkit`: 文本处理面板——行级处理（去重/排序/清理/加缀/行号/集合运算）、命名风格互转、字面量与正则批量替换、CSV/TSV 与 JSON 与 Markdown 表格三向互转、文本度量统计，以及工具导航挂载与统一的输入/输出/复制/错误交互
- `type-codegen`: 类型代码生成——由 JSON 样本推断结构并生成 TypeScript / Java / Go 类型定义与 JSON Schema，含嵌套类型具名化、数组元素字段并集与可选性推断、命名冲突消解与不可推断值的显式标记

### Modified Capabilities

无。`tool-shell` 的「工具可扩展性」要求已覆盖新增工具挂载的场景，无需求变更，此处仅登记影响。

## Impact

- **新增代码**：
  - `app/text-kit/page.tsx`
  - `components/text-kit/*`（六个面板 + `shared.tsx`）
  - `lib/text-kit/*`（`result.ts` / `lines.ts` / `naming.ts` / `replace.ts` / `table.ts` / `stats.ts` / `codegen/*`）
  - `lib/shared/csv.ts`（从 `lib/sql-kit/csv.ts` 提取的中立解析实现）
- **修改代码**：
  - `lib/sql-kit/csv.ts`：改为包装 `lib/shared/csv.ts`，对外签名与行为保持不变（由既有 `csv.test.ts` 保证）
  - `components/shell/Navigation.tsx`：`TOOLS` 追加 `{ href: "/text-kit", label: "文本工具" }`
- **依赖**：零新增。全部为原生字符串与 JSON 处理，不引入任何解析器或代码生成库
- **样式**：`app/globals.css` 追加 `tk-` 前缀样式，沿用暗色设计系统
- **测试**：`lib/text-kit/naming.test.ts`（分词与八种风格互转，重点覆盖连续大写、数字、混合分隔符）、`lines.test.ts`、`replace.test.ts`、`table.test.ts`、`stats.test.ts`、`codegen/*.test.ts`（类型推断与四种目标语言输出），全部为纯函数测试
- **数据库**：`app.db` 零变动，本工具不写任何持久化
- **风险**：
  - CSV 解析实现的位置迁移会触碰已上线的 `sql-kit`（缓解：纯移动不改逻辑，既有测试不做任何修改即须通过）
  - 命名风格转换的分词规则存在真实歧义（`HTTPServer`、`user2Name`、`foo_barBaz`），规则需定死并由单测锁住
  - 类型推断面对超大或超深 JSON 时的性能与可读性（缓解：设上限并给出可读提示）
