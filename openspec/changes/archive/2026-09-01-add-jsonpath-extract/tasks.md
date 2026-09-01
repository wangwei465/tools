## 1. 依赖引入与安全门禁

- [x] 1.1 安装 `jsonpath-plus@^10.4.0` 为生产依赖，确认解析到的实际版本不低于 10.4.0（低于该版本存在已知 RCE 公告）
- [x] 1.2 运行 `npm audit`，确认 `jsonpath-plus` 及其依赖链（`jsep` 系列）无 high / critical 级别公告；若出现高危则暂停实施并回到 design 重新评估选型
- [x] 1.3 确认 `package.json` 与 `package-lock.json` 同步（`npm ci` 可通过），避免二者失配

## 2. 求值核心（lib 层，两个入口共用）

- [x] 2.1 新建 `lib/convert/jsonpath.ts`，定义规模上限常量 `MAX_JSON_LENGTH = 1_000_000` 与 `MAX_RESULTS = 1_000`，并附注释说明为何不沿用 `regex.ts` 的阈值
- [x] 2.2 实现求值函数：入参为 JSON 文本与 JSONPath 表达式，返回 `ConvertResult`，遵循 `lib/convert/result.ts` 的 `ok()` / `err()` 约定，不抛异常
- [x] 2.3 调用 `JSONPath` 时显式传入 `eval: 'safe'` 与 `resultType: 'all'`，并在该处加注释标明这是安全控制点、禁止改为 `'native'`
- [x] 2.4 实现错误三分类：JSON 解析失败 → `err`（附解析原因）；表达式非法 → `err`（措辞与前者可区分）；合法但零命中 → `ok`（空结果集，非错误）
- [x] 2.5 实现规模保护：文档超 `MAX_JSON_LENGTH` 时直接 `err` 并在消息中含当前大小与上限；命中数超 `MAX_RESULTS` 时截断并在结果中携带总命中数与截断标记
- [x] 2.6 将每个命中规范化为「值 + 路径」结构对外暴露，供两个入口渲染
- [x] 2.7 实现表达式前置校验（实施阶段发现库不校验语法，见 design 决策 11）：空表达式提示输入；必须以 `$` 开头；方括号、圆括号、引号必须配对；不得以 `.` 结尾。校验不通过直接 `err`，不将其送入求值

## 3. 求值核心单元测试

- [x] 3.1 新建 `lib/convert/jsonpath.test.ts`，覆盖语法场景：点路径、递归下降 `$..id`、数组索引、数组切片、通配符、过滤表达式
- [x] 3.2 覆盖错误分类场景：非法 JSON、非法表达式、零命中返回成功且结果为空——三者断言互不混淆
- [x] 3.3 覆盖规模保护场景：超长文档被拒并给出上限提示；命中数超限时结果被截断且总数与截断标记正确
- [x] 3.4 断言每个命中的路径字段与预期路径一致（不只断言值）
- [x] 3.5 针对前置校验补充回归用例：`$[`、`$.a[`、`$.`、`$..`、`abc`、`$["x` 等必须判为非法，MUST NOT 静默返回根文档或零命中

## 4. 编码转换入口（第八个转换器）

- [x] 4.1 新建 `components/convert/JsonPathConverter.tsx`：JSON 输入区 + 表达式输入 + 结果区三段式，复用 `components/convert/shared.tsx` 既有的输入/输出/复制/错误交互
- [x] 4.2 在编码转换面板的转换器注册处加入 JSONPath 标签，使标签总数由七个变为八个
- [x] 4.3 结果区逐条展示「路径 + 值」，并提供复制能力（至少可复制单条命中路径）
- [x] 4.4 区分呈现三类反馈：JSON 非法、表达式非法用错误样式；零命中用普通提示样式而非错误样式

## 5. 接口调试入口（响应区第四个页签）

- [x] 5.1 在 `components/api-client/ResponsePane.tsx` 的响应子页签中新增 `JSONPath`，置于 Body / Headers / Cookies 之后
- [x] 5.2 该页签以当前响应体为求值目标，用户无需粘贴；求值调用 `@/lib/convert/jsonpath`，不跨 `components/` 目录引用 convert 模块的组件
- [x] 5.3 非 JSON 响应（含二进制）下该页签禁用并说明原因，判定复用既有的 `isJson` 逻辑
- [x] 5.4 新响应到达时清空上一次的求值结果，避免展示过期数据（与折叠态复位同一处理时机）
- [x] 5.5 表达式求值失败时错误仅限于该页签内，Body / Headers / Cookies 视图不受影响

## 6. 工作台高度拖动调整

- [x] 6.1 在 `app/api-client/page.tsx` 的 `.apic-workbench` 内、`RequestPane` 与 `ResponsePane` 之间插入分隔条元素，并以状态保存请求参数区高度（仅受控一侧，响应区维持 `flex: 1`）
- [x] 6.2 用 Pointer Events 实现拖动：`pointerdown` 时 `setPointerCapture`，`pointermove` 更新高度，`pointerup` 释放捕获；不在 document 上挂载全局监听
- [x] 6.3 实现高度钳制函数（下界 120px，上界为容器高度 − 160px），并在拖动中、初始读取、窗口 `resize` 三处统一调用同一函数
- [x] 6.4 以独立 localStorage 键持久化高度，不并入 `session.ts` 的 tab 会话；存储不可用、值损坏或越界时静默回退默认高度，不阻断渲染
- [x] 6.5 `app/globals.css`：`.apic-subpane` 由 `max-height: 34vh` 改为受控高度；新增分隔条样式，命中区域不小于 6px、光标为 `row-resize`，hover 与拖动中有视觉反馈
- [x] 6.6 `components/api-client/BodyEditor.tsx`：raw 分支 CodeMirror 高度由固定 `220px` 改为填满容器，`.apic-body-cm` 改为纵向 flex 使工具条固定、编辑区伸缩（对齐 `.apic-resp-cm` 既有结构）——**缺此项则拖动无实际效果**

## 7. JSONPath 样式

- [x] 7.1 在 `app/globals.css` 新增 JSONPath 结果区样式，复用既有暗色设计变量与 `apic-` / 编码转换既有类名风格
- [x] 7.2 结果区在长路径与长值下不撑破布局（换行或滚动），与响应区既有的填满高度行为兼容

## 8. 验证与收尾

- [x] 8.1 `npx tsc --noEmit` 通过，无类型错误
- [x] 8.2 `npx vitest run` 全绿，且新增用例确实被执行
- [x] 8.3 dev 冒烟（JSONPath）：`/convert` 的 JSONPath 标签与 `/api-client` 的 JSONPath 页签均可用；用一段深层嵌套 JSON 验证 `$..id` 能取到跨层级结果
- [x] 8.4 dev 冒烟（拖动）：拖动分隔条两区实时变化；Body 编辑区确实随之变高；拖到上下极限时两区仍可用；刷新后高度保持；显著缩小窗口后无区域被压没
- [x] 8.5 冒烟结束后确认 dev 进程与端口无残留（`netstat` 复查后终止 node 进程）
- [x] 8.6 确认全程未触碰 `data/app.db` 中的业务数据，无新增 API 路由与数据库结构变更
