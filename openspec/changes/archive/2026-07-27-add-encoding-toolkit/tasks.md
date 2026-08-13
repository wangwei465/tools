## 1. 依赖与骨架

- [x] 1.1 安装依赖 `js-yaml`(实测 v5.2.2,自带类型无需 `@types`;`safeLoad`/`safeDump` 已移除,`load`/`dump` 默认即安全 schema。context7 MCP 未连接,改以实测安装版本的 dts + 往返验证确认 API)
- [x] 1.2 `Navigation.tsx` 的 `TOOLS` 追加 `{ href:"/convert", label:"编码转换" }`
- [x] 1.3 `app/convert/page.tsx`:单页多标签容器骨架(七个转换器标签 + 内容区切换),参考 `app/signature/page.tsx` 纯前端样板,复用暗色设计系统
- [x] 1.4 `components/convert/` 共享子组件:输入区 / 输出区(CodeMirror 与普通输入)/ 错误提示条 / 复制按钮;统一的 `{ok,value,error}` 结果渲染

## 2. 转换纯函数(lib/convert)

- [x] 2.1 `lib/convert/jsonYaml.ts`:`jsonToYaml` / `yamlToJson` / `formatJson` / `minifyJson`,非法输入返回可读错误
- [x] 2.2 `lib/convert/base64.ts`:`encodeBase64` / `decodeBase64`(经 `TextEncoder`/`TextDecoder` 保 UTF-8;支持标准与 URL-safe 变体)
- [x] 2.3 `lib/convert/url.ts`:component 与整串两级的 encode/decode,非法转义序列返回错误
- [x] 2.4 `lib/convert/datetime.ts`:时间戳(秒/毫秒)⇔ 日期,输出本地 + UTC,非法输入返回错误
- [x] 2.5 `lib/convert/uuid.ts`:v4 生成(`crypto.randomUUID`,非安全上下文回退 `getRandomValues`),支持批量数量
- [x] 2.6 `lib/convert/jwt.ts`:三段式拆分 + Base64URL 解码 header/payload(不验签),段数/编码非法返回错误
- [x] 2.7 `lib/convert/regex.ts`:构造 `RegExp`(pattern+flags)、收集匹配区间与捕获分组;非法 pattern 返回错误;测试文本长度上限保护

## 3. 转换器 UI(逐个可验收)

- [x] 3.1 JSON⇔YAML 转换器组件:方向切换 + 美化/压缩,复用 CodeMirror,接 `jsonYaml.ts`
- [x] 3.2 Base64 转换器组件:编/解码 + 标准/URL-safe 变体切换
- [x] 3.3 URL 转换器组件:编/解码 + component/整串模式切换
- [x] 3.4 时间戳⇔日期 转换器组件:方向切换 + 秒/毫秒 + 本地/UTC 双展示
- [x] 3.5 UUID 转换器组件:数量输入 + 生成 + 逐行展示 + 复制
- [x] 3.6 JWT 解析器组件:输入 token,分栏展示 header/payload,显著标注「未校验签名」
- [x] 3.7 正则测试器组件:pattern + flags + 测试文本,匹配高亮 + 分组列表

## 4. 单元测试(vitest)

- [x] 4.1 `lib/convert/*` 纯函数单测:各转换器 happy-path + 错误分支;重点覆盖 JSON⇔YAML 往返等价、Base64 中文/emoji 往返、时间戳秒/毫秒边界、JWT 非法段数、非法正则

## 5. 验证

- [x] 5.1 `tsc --noEmit` 通过;`vitest run` 全绿
- [x] 5.2 dev 冒烟:导航进入 `/convert`,逐个转换器验 happy-path 与错误提示;确认切换标签互不干扰(Playwright headless 驱动 7 转换器:JSON→YAML/Base64/URL/时间戳/UUID/JWT/正则 输出均正确,Base64 非法输入弹错误条;标签切换正常)
- [x] 5.3 隐私约束核验:浏览器 Network 面板确认转换过程零请求;确认无写入 `app.db`(Playwright 捕获全程仅 7 个 GET=页面+`_next` 静态资源,`/api/` 调用数=0;静态 grep 确认 convert 代码无 fetch/XHR、未 import lib/db)
- [x] 5.4 回归:数据比对 / 生成签名 / 接口调试 / Redis管理 路由与行为不受影响(`/compare`、`/signature`、`/api-client`、`/redis` 均 HTTP 200;既有 45 单测全绿;未新增 API 路由、Navigation 仅追加一行)
