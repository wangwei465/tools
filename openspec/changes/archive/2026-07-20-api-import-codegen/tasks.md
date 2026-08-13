## 1. 组装管线复用（避免漂移）

- [x] 1.1 抽出 / 复用 ① 的组装函数，产出 wire `{ method, url, headers, bodyType, body }`，供实际发送与代码生成**共用**（单一实现，DRY）

## 2. cURL 解析（逆运算）

- [x] 2.1 实现 curl tokenizer：处理引号、`\` 续行、空白分词
- [x] 2.2 解析选项 → 中间结构：`-X` 方法、URL、`-H` header、`-d`/`--data`/`--data-raw`/`--data-urlencoded` body、`-F` form-data、`-u` basic auth
- [x] 2.3 反推 `RequestDraft`：body 类型推断（json / urlencoded / form-data）、auth 映射、URL → Query params 拆分
- [x] 2.4 健壮性：畸形 / 不完整 curl 报错提示，不崩溃、不破坏当前 tab

## 3. cURL 导入 UI（api-curl-import）

- [x] 3.1 导入入口（粘贴框 / 按钮）→ 解析 → 载入**新 tab**
- [x] 3.2 未识别选项提示与解析错误提示

## 4. 代码生成（旁路终端，api-code-generation）

- [x] 4.1 定义 generator 接口 `wire → string`（开闭，便于扩展目标）
- [x] 4.2 curl generator：方法 / header / body / form / auth 的目标转义
- [x] 4.3 fetch (JS) generator
- [x] 4.4 代码生成面板：选择目标、展示、一键复制

## 5. 一致性

- [x] 5.1 代码生成以组装后的 wire 为输入（③ 在场则为替换后值），确保「所见即所发」

## 6. 验证

- [x] 6.1 `tsc --noEmit` 通过
- [x] 6.2 导入冒烟：GET、POST `-H`+`-d`(json)、`--data-urlencoded`、`-F` 含文件占位、`-u` basic；畸形 curl 报错
- [x] 6.3 生成冒烟：curl / fetch 与实际发送等价（含 params/headers/body/auth）；一键复制
- [x] 6.4 回归：①/②/③ 不受影响（纯前端叠加、复用 ① 组装）
