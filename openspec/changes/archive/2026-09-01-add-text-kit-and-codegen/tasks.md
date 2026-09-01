## 1. 地基：结果类型、面板外壳与导航

- [x] 1.1 新建 `lib/text-kit/result.ts`：`TextResult<T> = { ok, value?, error? }` 与 `ok` / `err` / `errMessage`，形状对齐 `lib/sql-kit/result.ts`，并按既有决策**不跨工具 import**（顶部注释写明这一取舍）
- [x] 1.2 新建 `components/text-kit/shared.tsx`：`PanelFrame`、`TextField`、`Select`、`Checkbox`、`InlineInput`、`CopyButton`、`ErrorBar`，对齐 `components/sql-kit/shared.tsx` 的接口习惯
- [x] 1.3 新建 `app/text-kit/page.tsx`：单页多标签外壳，各面板状态提升为页面级，切换标签不重置
- [x] 1.4 在 `components/shell/Navigation.tsx` 的 `TOOLS` 中追加 `{ href: "/text-kit", label: "文本工具" }`
- [x] 1.5 在 `app/globals.css` 追加 `tk-` 前缀样式，沿用暗色设计系统的变量与类命名习惯
- [x] 1.6 新建 `lib/text-kit/limits.ts`：输入体积上限与 JSON 嵌套深度上限的常量与校验函数，超限返回带上限值的可读错误

## 2. CSV 解析提取（触碰已上线的 sql-kit，需最高谨慎）

- [x] 2.1 新建 `lib/shared/csv.ts`：将 `lib/sql-kit/csv.ts` 的解析实现整体移入，**不依赖任何工具的结果类型**——解析失败抛出带可读 message 的错误；保留 `DELIMITERS`、`CsvOptions`、`CsvTable` 的定义
- [x] 2.2 改写 `lib/sql-kit/csv.ts` 为薄包装：`parseCsv(text, options): SqlResult<CsvTable>` 内部 `try/catch` 调用共享实现，**对外签名与行为保持不变**，并 re-export 既有的 `DELIMITERS` 等符号以免调用方改动
- [x] 2.3 运行 `npm test`，确认 `lib/sql-kit/csv.test.ts` **零修改**全部通过；若测试需要任何改动则中止本组并重新评估（说明这不再是纯移动）
- [x] 2.4 确认 `components/sql-kit/InsertPanel.tsx` 等既有调用方无需任何改动
- [x] 2.5 新建 `lib/shared/csv.test.ts`：补充对共享实现的直接测试（引号包裹、转义双引号、字段内换行、分隔符切换、首行表头开关）

## 3. 行处理、命名转换与替换

- [x] 3.1 新建 `lib/text-kit/lines.ts`：去重（保序）、排序（字典序/数值/长度 + 反序）、去空行、去首尾空白、加前缀后缀、加行号（起始值可指定）、整体反转
- [x] 3.2 在 `lines.ts` 实现数值排序的容错：存在非数值行时返回可读错误，MUST NOT 静默产出错误顺序
- [x] 3.3 在 `lines.ts` 实现两组文本的交集 / 差集 / 并集，结果去重
- [x] 3.4 `lib/text-kit/lines.test.ts`：覆盖去重保序、三种排序 + 反序、数值排序容错、集合运算三种、加行号起始值
- [x] 3.5 新建 `lib/text-kit/naming.ts`：实现**唯一一份分词器** `splitWords(input): string[]`，严格按 design 决策二的七条规则
- [x] 3.6 在 `naming.ts` 实现八个重组器（`UPPER` / `lower` / `Title` / `camelCase` / `PascalCase` / `snake_case` / `kebab-case` / `CONSTANT_CASE`），全部消费 `splitWords` 的输出，MUST NOT 各自再切词
- [x] 3.7 `lib/text-kit/naming.test.ts`：逐条覆盖分词规则表——`fooBarBaz`、`HTTPServer`、`address1`（不切）、`user2Name`（切）、`foo__bar`（空词丢弃）、`foo_barBaz`（混合），并覆盖八种目标风格的重组
- [x] 3.8 新建 `lib/text-kit/replace.ts`：字面量与正则两种模式，返回替换结果与替换次数；正则支持捕获组引用；非法正则前置捕获为可读错误
- [x] 3.9 `lib/text-kit/replace.test.ts`：覆盖字面量全量替换、正则捕获组引用、非法正则可读报错、无匹配时次数为 0
- [x] 3.10 新建 `components/text-kit/LinesPanel.tsx`、`NamingPanel.tsx`、`ReplacePanel.tsx`；`NamingPanel` 在界面上展示分词规则说明；`ReplacePanel` 给出指向「编码转换」正则测试的指引

## 4. 表格转换与统计

- [x] 4.1 新建 `lib/text-kit/table.ts`：定义中枢模型 `{ header: string[]; rows: string[][] }`
- [x] 4.2 实现三个 parse：CSV/TSV（包装 `lib/shared/csv.ts`）、JSON 数组（字段取并集，嵌套值序列化为紧凑 JSON）、Markdown 表格（容忍缺失对齐行、按最长行补空单元格）
- [x] 4.3 实现三个 stringify：CSV/TSV、JSON 数组、Markdown 表格（含表头行与对齐行）
- [x] 4.4 所有转换一律走「源 → 中枢 → 目标」，MUST NOT 实现任何格式间的直连转换
- [x] 4.5 非法 JSON 与无法解析的 Markdown 返回可读错误，MUST NOT 产出错位表格
- [x] 4.6 `lib/text-kit/table.test.ts`：覆盖三向互转、字段并集与缺失留空、嵌套值不展开、分隔符与表头开关、非法输入报错、Markdown 宽松解析
- [x] 4.7 新建 `lib/text-kit/stats.ts`：字符数（含/不含空白）、行数、词数、UTF-8 字节数、各行长度最大/最小值
- [x] 4.8 `lib/text-kit/stats.test.ts`：重点覆盖中文等多字节字符的 UTF-8 字节数、空输入全 0、含空白与不含空白的差异
- [x] 4.9 新建 `components/text-kit/TablePanel.tsx`（给出指向「SQL 工具」生成 INSERT 的指引）与 `StatsPanel.tsx`

## 5. 阶段验收：文本工具可独立上线

- [x] 5.1 `npm run build` 与 `npm test` 通过，无 TypeScript 报错
- [x] 5.2 冒烟：五个面板各走通一次典型输入输出与复制
- [x] 5.3 冒烟：命名转换对 `HTTPServer` / `address1` / `user2Name` 三个边界输入的结果与规格一致
- [x] 5.4 冒烟：超出体积上限的输入被拒绝且页面保持可交互
- [x] 5.5 冒烟：`/sql-kit` 的 INSERT 面板与 CSV 相关行为未受 CSV 提取影响

## 6. 类型代码生成

- [x] 6.1 新建 `lib/text-kit/codegen/infer.ts`：JSON 样本 → 中间结构模型（字段名、类型、可选性、嵌套子类型、需确认标记），推断层与目标语言完全解耦
- [x] 6.2 实现数组元素的字段并集与可选性推断（未在全部元素出现即可选）
- [x] 6.3 实现嵌套对象的具名子类型：字段名 PascalCase 化并去复数（`items` → `Item`），冲突时追加数字后缀
- [x] 6.4 实现不可推断值的处理：`null`、空数组、空对象、元素类型不一致的数组，各自给保守类型并写入需确认清单
- [x] 6.5 实现数值类型判定：含小数点走浮点；超出安全整数范围走 64 位整数并写入需确认清单
- [x] 6.6 接入嵌套深度上限，超限返回带上限值的可读错误，MUST NOT 递归到栈溢出
- [x] 6.7 `lib/text-kit/codegen/infer.test.ts`：覆盖字段并集与可选性、子类型命名与去复数、命名冲突后缀、四类不可推断值、大整数与小数、深度超限
- [x] 6.8 新建四个生成器 `codegen/{typescript,java,go,jsonschema}.ts`，全部消费同一份中间结构模型
- [x] 6.9 在各生成器中实现非法标识符转义并保留原始键名映射（Go 靠 tag、Java 靠注释、TS 靠引号键），受影响字段写入需确认清单
- [x] 6.10 `lib/text-kit/codegen/*.test.ts`：四种目标各覆盖基础对象、嵌套子类型、可选字段、非法标识符转义
- [x] 6.11 新建 `components/text-kit/CodegenPanel.tsx`：JSON 输入 + 目标语言切换 + 结果复制；**独立区域展示需人工确认清单**，清单为空时不展示
- [x] 6.12 在 `CodegenPanel` 明确标注结果由样本推断得出、需人工核对，MUST NOT 表述为权威 schema

## 7. 最终验收

- [x] 7.1 `npm run build` 通过，无 TypeScript 报错
- [x] 7.2 `npm test` 全量通过
- [x] 7.3 冒烟：四种目标语言各生成一次，结果可直接粘贴使用
- [x] 7.4 冒烟：含 `null`、空数组、大整数、非法标识符的样本，需确认清单如实列出对应字段
- [x] 7.5 冒烟：全部字段可确定的样本，需确认清单为空且界面不展示无谓警告
- [x] 7.6 冒烟：验证 `/compare`、`/signature`、`/api-client`、`/redis`、`/datastore`、`/convert`、`/crypto`、`/sql-kit` 八个既有工具行为未受影响
- [x] 7.7 确认全程无网络请求、`app.db` 无任何变动
- [x] 7.8 冒烟后按项目惯例清理 dev server 残留进程（`netstat` 找 PID 后 `taskkill`）
