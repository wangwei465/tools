## Why

现有工具集覆盖了「发请求 / 查数据 / 编解码 / 加解密」，但后端日常排障中最高频的两类纯文本操作仍然缺位：一是从日志里捞出的 SQL 无法直接执行（`?` 占位符与参数列表分离、单行挤成一坨），二是拿到一个雪花 ID、一个 cron 表达式或一段中文乱码时，只能靠脑补或临时写脚本。这两类需求全部是**纯函数计算**，不出网、不落库、无连接管理，边际成本极低却每天都会用到——是当前投入产出比最高的补齐项。

## What Changes

- 新增独立工具页 `/sql-kit`（导航名「SQL 工具」），以多标签组织四个 SQL 相关面板：
  - **参数填充**：把 MyBatis / JDBC 日志中的 `?` 占位符与 `Parameters: 1(Integer), abc(String), null` 参数列表合成可直接执行的 SQL，按参数类型决定是否加引号
  - **格式化**：SQL 美化（缩进/关键字换行）与压缩为单行，支持多方言
  - **IN 列表**：把按行/逗号分隔的一列值转成 `'a','b','c'` 或 `1,2,3`，可选去重与分批切块
  - **INSERT 生成**：CSV / JSON 数组 → `INSERT INTO` 语句，支持指定表名与批量单条/多值两种形式
- 扩充既有 `/convert` 面板，新增四个转换器标签：
  - **Cron 解析**：解析 5/6 段 cron 表达式，给出字段级人话描述与未来 N 次执行时间预览
  - **ID 解析**：雪花 ID 反解为时间戳 / 机器位 / 序列号（epoch 与位宽可配置并提供预设），MongoDB ObjectId 反解生成时间
  - **编码排查**：逐字符展示 code point、UTF-8 / UTF-16 / Latin-1 字节与 `\uXXXX` / `%XX` / HTML 实体形式，并提供「乱码还原」——枚举常见的（原编码 × 误解码）组合尝试还原被错误解读的文本
  - **进制运算**：2/8/10/16 进制互转（BigInt 精度）与位运算求值，附权限位 / 状态位图的置位解读
- 新增两个纯 JS 依赖：`sql-formatter`（SQL 美化）、`cron-parser`（cron 下次执行时间）
- 不改动任何既有工具的行为与路由；不新增任何服务端 API、不新增任何数据库表

## Capabilities

### New Capabilities
- `sql-toolkit`: SQL 工具箱——工具挂载与多标签布局、纯客户端约束，以及参数填充、格式化、IN 列表、INSERT 生成四类 SQL 文本处理

### Modified Capabilities
- `encoding-toolkit`: 在既有七个转换器之外新增 Cron 解析、ID 解析、编码排查、进制运算四个转换器要求；「工具挂载与面板布局」中的既有工具清单相应扩充

## Impact

- **新增代码**：`app/sql-kit/page.tsx`、`components/sql-kit/*`、`lib/sql-kit/*`（含单测）；`components/convert/{Cron,Id,Charset,Radix}Converter.tsx`、`lib/convert/{cron,id,charset,radix}.ts`（含单测）
- **修改代码**：`components/shell/Navigation.tsx` 追加一条工具注册；`app/convert/page.tsx` 追加四个标签；`app/globals.css` 追加 `sql-kit` 所需样式类
- **依赖**：`package.json` 新增 `sql-formatter`、`cron-parser` 两个运行时依赖（均为纯 JS、无原生模块、可在客户端打包）
- **不受影响**：`data/app.db` 无 schema 变更；`/compare`、`/signature`、`/api-client`、`/redis`、`/datastore`、`/crypto` 的行为与路由零改动；`/convert` 既有七个转换器逻辑不变
