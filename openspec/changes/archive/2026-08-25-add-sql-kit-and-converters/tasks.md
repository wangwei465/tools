## 1. 依赖与准备

- [x] 1.1 安装 `sql-formatter` 与 `cron-parser` 到 `dependencies`，在 `package.json` 中确认版本
- [x] 1.2 确认 `cron-parser` 实际版本的 API 形态（v4 `parseExpression()` / v5 `CronExpressionParser.parse()`），把差异封在 `lib/convert/cron.ts` 的单一适配函数内，UI 层不直接接触库 API
- [x] 1.3 确认两个库在客户端组件中可正常打包（起 dev 访问一次 `/convert`，无 node 模块解析报错）

## 2. 转换器：分布式 ID 解析（零新依赖，先做）

- [x] 2.1 `lib/convert/id.ts`：雪花 ID 用 `BigInt` 拆解为时间戳 / 机器位 / 序列号，epoch 与三段位宽为入参，位宽之和 > 63 时返回 `err`
- [x] 2.2 `lib/convert/id.ts`：ObjectId 前 4 字节秒级时间解析；按输入形态自动分流（24 位 hex → ObjectId，纯数字 → 雪花）
- [x] 2.3 `lib/convert/id.test.ts`：覆盖默认纪元解析、自定义 epoch、自定义位宽、位宽和越界、超 `Number.MAX_SAFE_INTEGER` 的 ID、ObjectId、非法输入
- [x] 2.4 `components/convert/IdConverter.tsx`：ID 输入 + epoch 输入与预设下拉 + 三段位宽输入，结果按本地 / UTC 双时区展示，错误走 `ErrorBar`
- [x] 2.5 注册到 `app/convert/page.tsx` 的 `TABS`

## 3. 转换器：进制转换与位运算

- [x] 3.1 `lib/convert/radix.ts`：`BigInt` 的 2/8/10/16 进制互转，非法字符返回 `err`
- [x] 3.2 `lib/convert/radix.ts`：置位解读——列出值中为 1 的位序号与对应权重
- [x] 3.3 `lib/convert/radix.ts`：位运算表达式求值，自研递归下降求值器，仅支持整数字面量与 `& | ^ ~ << >> ( )`，MUST NOT 使用 `eval` / `new Function`
- [x] 3.4 `lib/convert/radix.test.ts`：覆盖四进制互转、大整数精度、各位运算符与优先级、括号、非法字符、非法表达式
- [x] 3.5 `components/convert/RadixConverter.tsx`：四进制输入框联动 + 表达式求值区 + 置位列表
- [x] 3.6 注册到 `TABS`

## 4. 转换器：Cron 表达式解析

- [x] 4.1 `lib/convert/cron.ts`：适配函数封装 `cron-parser`，输入表达式 + 基准时间 + 次数，输出未来执行时间数组，解析失败返回 `err`
- [x] 4.2 `lib/convert/cron.ts`：自研字段级中文描述（5 段 / 6 段分别处理，识别 `*` / `*/n` / 区间 / 枚举）
- [x] 4.3 `lib/convert/cron.ts`：解析失败且表达式含 `L` / `W` / `#` 时，错误信息明确指出不支持 Quartz 扩展语法
- [x] 4.4 `lib/convert/cron.test.ts`：覆盖 5 段与 6 段、`*/5` 类表达式、指定基准时间、指定次数、字段越界、扩展语法提示
- [x] 4.5 `components/convert/CronConverter.tsx`：表达式输入 + 次数输入 + 基准时间输入，展示字段描述表与执行时间列表
- [x] 4.6 注册到 `TABS`

## 5. 转换器：字符编码排查与乱码还原

- [x] 5.1 `lib/convert/charset.ts`：逐字符视图——code point、UTF-8 / UTF-16 / Latin-1 字节、`\uXXXX` / `%XX` / HTML 实体，正确处理代理对（emoji 等增补平面字符）
- [x] 5.2 `lib/convert/charset.ts`：超长输入保护——超过阈值时截断逐字符列表并返回截断标记
- [x] 5.3 `lib/convert/charset.ts`：`TextDecoder` 反查表构建（字符 → 字节），惰性构建 + 模块级缓存 + 构建前用 `new TextDecoder(enc)` 探测编码是否受支持
- [x] 5.4 `lib/convert/charset.ts`：乱码还原——原编码固定 UTF-8，误解码候选取 `latin-1 / gbk / gb18030 / big5`，另加 gbk 字节被按 UTF-8 读的反向候选；按「U+FFFD 占比 + CJK 占比」打分排序，含 U+FFFD 时返回不可逆标记
- [x] 5.5 `lib/convert/charset.ts`：GBK 十六进制字节 → 文本解码
- [x] 5.6 `lib/convert/charset.test.ts`：覆盖中文 / ASCII / emoji 的字节与转义形式、截断保护、典型乱码还原（UTF-8 被按 GBK 读、被按 Latin-1 读）、含 U+FFFD 的不可逆标记、不受支持编码的跳过、GBK hex 解码
- [x] 5.7 `components/convert/CharsetConverter.tsx`：文本输入 + 逐字符表格 + 「尝试还原」按钮与候选结果列表（标注可信度与不可逆），各表示可复制
- [x] 5.8 注册到 `TABS`

## 6. SQL 工具：页面骨架

- [x] 6.1 `components/sql-kit/shared.tsx`：自建输入区 / 输出区 / 复制按钮 / 错误条 / 面板外框，不从 `components/convert` 或 `components/crypto` 跨工具引入
- [x] 6.2 `app/sql-kit/page.tsx`：四个面板同时挂载、用 CSS 控制显隐（切标签不丢输入），标签栏与页头
- [x] 6.3 `components/shell/Navigation.tsx` 的 `TOOLS` 追加 `{ href: "/sql-kit", label: "SQL 工具" }`

## 7. SQL 工具：日志参数填充

- [x] 7.1 `lib/sql-kit/fill.ts`：占位符扫描器——跳过 `'...'`（含 `''` 转义）、`"..."`、`` `...` ``、`--` 到行尾、`/* */`，只收集真实 `?` 的位置
- [x] 7.2 `lib/sql-kit/fill.ts`：参数列表解析（`值(类型)` 逗号分隔），类型映射决定是否加引号，字符串内 `'` 转义为 `''`，字面量 `null` 原样输出
- [x] 7.3 `lib/sql-kit/fill.ts`：占位符数与参数数不一致时返回 `err` 并带上两侧数量，不做部分填充
- [x] 7.4 `lib/sql-kit/fill.ts`：整段日志自动拆分——从含 `Preparing:` / `Parameters:` 的文本中提取 SQL 与参数列表
- [x] 7.5 `lib/sql-kit/fill.test.ts`：覆盖正常填充、字符串/注释内的 `?` 被跳过、数量不匹配报错、`null`、值内单引号转义、整段日志拆分
- [x] 7.6 `components/sql-kit/FillPanel.tsx`：SQL 与参数双输入区 + 整段粘贴自动拆分入口 + 结果区与复制，界面标注「结果供人工核对与手动执行」

## 8. SQL 工具：格式化与压缩

- [x] 8.1 `lib/sql-kit/format.ts`：封装 `sql-formatter` 提供美化与压缩两种输出，方言为入参，异常时返回 `err` 且不丢弃原文
- [x] 8.2 `lib/sql-kit/format.test.ts`：覆盖美化、压缩、方言切换、无法格式化时保留原文
- [x] 8.3 `components/sql-kit/FormatPanel.tsx`：输入区 + 方言下拉 + 美化/压缩按钮 + 输出区与复制

## 9. SQL 工具：IN 列表生成

- [x] 9.1 `lib/sql-kit/inList.ts`：按行/分隔符切分，支持带引号与不带引号、去重、去首尾空白、忽略空行、按 N 分批，值内 `'` 转义为 `''`
- [x] 9.2 `lib/sql-kit/inList.test.ts`：覆盖带引号/不带引号、去重、空白与空行、分批、值内单引号
- [x] 9.3 `components/sql-kit/InListPanel.tsx`：输入区 + 选项行（引号 / 去重 / 分批大小）+ 输出区与复制

## 10. SQL 工具：INSERT 语句生成

- [x] 10.1 `lib/sql-kit/csv.ts`：RFC4180 子集解析器——逗号分隔、双引号包裹、`""` 转义、字段内换行，分隔符与是否含表头为入参
- [x] 10.2 `lib/sql-kit/insert.ts`：由 CSV 或 JSON 对象数组生成 INSERT，支持「每行一条」与「单条多值」两种形式；数值/布尔不加引号、空值输出 `null`、字符串加引号并转义
- [x] 10.3 `lib/sql-kit/insert.ts`：错误分类——JSON 非法 / JSON 非对象数组 / CSV 列数与表头不一致 / 表名缺失，各自给出可读提示
- [x] 10.4 `lib/sql-kit/{csv,insert}.test.ts`：覆盖引号包裹与转义、字段内换行、自定义分隔符、无表头列名、两种输出形式、各类错误分支
- [x] 10.5 `components/sql-kit/InsertPanel.tsx`：输入区 + 表名 / 分隔符 / 表头 / 输出形式选项 + 输出区与复制

## 11. 样式

- [x] 11.1 `app/globals.css` 追加 `sqlk-*` 前缀样式（页面、标签栏、面板框、输入输出、选项行、错误条），沿用暗色设计系统的 CSS 变量
- [x] 11.2 `app/globals.css` 追加四个新转换器所需的 `conv-*` 补充类（字符表格、候选结果列表、cron 执行时间列表、置位列表）

## 12. 验证

- [x] 12.1 `npm test` 全绿，新增单测均通过
- [x] 12.2 `npm run build` 通过，无类型错误、无 node 模块打包报错
- [x] 12.3 浏览器冒烟 `/convert`：四个新标签逐一验证正常路径与错误路径，并确认既有八个转换器行为未变
- [x] 12.4 浏览器冒烟 `/sql-kit`：四个面板逐一验证，重点确认切换标签不丢输入、参数填充跳过字符串内 `?`、数量不匹配硬报错
- [x] 12.5 确认全程无网络请求（DevTools Network 面板为空）且 `data/app.db` 无变化
- [x] 12.6 冒烟结束后清理 dev server 残留进程（`netstat` 找端口 PID 后 `taskkill`），避免端口占用残留
