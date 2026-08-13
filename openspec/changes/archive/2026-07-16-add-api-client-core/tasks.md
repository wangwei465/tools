## 1. 脚手架与导航

- [x] 1.1 新建 `app/api-client/page.tsx` 骨架（三区布局：tab 栏 / 请求区 / 响应区占位）
- [x] 1.2 在 `components/shell/Navigation.tsx` 的 `TOOLS` 注册表追加 `{ href: "/api-client", label: "接口调试" }`
- [x] 1.3 在 `app/globals.css` 新增 `.apic-*` 样式区块，沿用暗色设计系统变量（`--bg-surface`/`--border`/`--accent` 等）

## 2. 通用代理后端 /api/request

- [x] 2.1 新建 `app/api/request/route.ts`，接收统一 JSON 信封 `{ method, url, headers, bodyType, body }`，校验 url/method 合法性
- [x] 2.2 按 `bodyType` 重组请求体：raw→字符串；urlencoded→`URLSearchParams`；form-data→Node `FormData`（文件从 base64 还原）；none→无 body
- [x] 2.3 以指定方法透传 `fetch`，用 `AbortController` 实现超时；打点计算 `timeMs`
- [x] 2.4 读取响应体（带大小上限），返回 `{ status, statusText, headers, body(原样文本), timeMs, size }`
- [x] 2.5 确保**不做 JSON 校验、非 2xx 不判失败**，任意 Content-Type 原样返回

## 3. 状态模型（useReducer）

- [x] 3.1 定义类型：`RequestDraft`(method/url/params[]/headers[]/body/auth)、`ResponseState`、`Tab`、`AppState`
- [x] 3.2 实现 reducer 与 actions（`NEW_TAB`/`CLOSE_TAB`/`ACTIVATE_TAB`/`PATCH_REQUEST`/`SET_SENDING`/`SET_RESPONSE`），action 以 `tabId` 寻址
- [x] 3.3 实现 dirty 判定（request 相对初始态是否变化）

## 4. 请求构造 UI

- [x] 4.1 请求行：方法下拉（GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS）+ URL 输入 + 发送/取消按钮
- [x] 4.2 Query params 表格 ⇄ URL 双向同步（表格改动写回 URL；URL 失焦解析回填，以 URL 为真相源）
- [x] 4.3 Headers 表格（键值 + 启用/禁用单行）
- [x] 4.4 Body 编辑：none / raw(JSON，复用 CodeMirror) / form-data(文本+文件字段) / x-www-form-urlencoded
- [x] 4.5 Auth 编辑：none / bearer / basic / apikey（注入位置 header|query）

## 5. 请求组装管线

- [x] 5.1 实现组装函数：`RequestDraft` →（Auth 注入 → Query 合并到 URL → Body 序列化）→ JSON 信封
- [x] 5.2 form-data 文件转 base64 装入信封（预留 ③ 变量替换段插入点）

## 6. 工作台交互（多 tab + 发送）

- [x] 6.1 tab 栏：新建 / 切换 / 关闭 + dirty(●) 标记；关闭激活标签时切换到相邻标签
- [x] 6.2 发送：调用组装管线 → `POST /api/request` → 写入当前 tab 的 response；「发送中」态
- [x] 6.3 取消：`AbortController` 中止进行中的请求，回到可编辑态

## 7. 响应展示

- [x] 7.1 状态摘要：状态码（2xx/3xx/4xx/5xx 配色）+ 耗时 + 大小
- [x] 7.2 Body 分流：json 美化(CodeMirror 只读) / html·xml 高亮 / text 原样 / 二进制「无法预览」提示；**非 2xx 也展示 body**
- [x] 7.3 Response Headers 视图
- [x] 7.4 Cookies 视图（解析 `Set-Cookie`，第一版仅键值）

## 8. 验证

- [x] 8.1 `tsc --noEmit` 通过
- [x] 8.2 启动 dev，对各方法 / 各 body 类型冒烟（GET、POST-JSON、form-data 含文件、urlencoded），核对响应展示与非 2xx 展示
- [x] 8.3 验证 URL⇄params 同步、多 tab 切换保留结果、取消生效
