## Context

工具集是一个 Next.js 14(App Router)本地开发者工具箱,现有工具:数据比对、生成签名、接口调试、Redis管理。前三者与本 change 同属「无状态转换类」:纯前端、单页、无长连接。挂载机制成熟——`Navigation` 的 `TOOLS` 注册一条 + `app/<tool>/page.tsx` 即可,`tool-shell` 能力已保证工具间互不影响。技术栈已具备 CodeMirror(`@uiw/react-codemirror` + `@codemirror/lang-json`)与 vitest。

本工具是 7 个高频离线转换器的聚合面板,全部客户端计算,不新增后端、不建表、不触碰 `app.db`。与 Redis管理(引入连接池 / 后端 / 安全)相反,本 change 复杂度集中在**前端组织**与**转换纯函数的正确性**。

## Goals / Non-Goals

**Goals:**
- 单页多标签容器,7 个转换器各自独立,新增/删除某个转换器不影响其余。
- 转换逻辑抽为**纯函数**(`lib/convert/*`),与 React 组件解耦,便于 vitest 单测覆盖 happy-path 与错误分支。
- 零网络、零持久化;敏感输入不出浏览器。
- 复用暗色设计系统与 CodeMirror,视觉与既有工具一致。

**Non-Goals:**
- 不做 JWT 签名校验(仅解码,UI 明示)。
- 不做转换历史持久化 / 收藏(YAGNI;需要再议)。
- 不引入除 `js-yaml` 外的转换库(Base64/URL/UUID/正则/时间均用平台原生能力)。
- 不新增任何 `app/api/*` 路由或数据表。

## Decisions

### 决策 1:单能力 + 单页多标签,而非每个转换器一个路由/能力
选 `encoding-toolkit` 一个 capability、`/convert` 一个页面、内部标签切换。理由:7 个转换器都是小而同构的「输入→转换→输出」单元,与 `data-compare`(单能力多模式)同构,符合仓库粒度惯例与 KISS。
**Alternative**:每器一个路由 / 一个 capability(如 redis 的 5 能力)——被否,redis 是 5 个真子系统,本工具无此复杂度,拆分只会制造 7 份样板与导航噪音。

### 决策 2:转换逻辑纯函数化,置于 `lib/convert/*`
每个转换器的核心 = 纯函数(如 `jsonToYaml(text): string`、`decodeJwt(token): {header,payload}`、`parseTimestamp(...)`),组件只做输入绑定与结果渲染。理由:纯函数可被 vitest 直接覆盖,组件层只剩 UI;错误以抛异常或 `{ok,value,error}` 结果对象统一表达,由共享 UI 呈现。
**Alternative**:逻辑内联在组件 —— 被否,不可测且重复错误处理。

### 决策 3:仅新增 `js-yaml` 一个依赖
YAML ⇔ JSON 无可靠的原生实现,选社区标准 `js-yaml`(纯 JS、无网络、体积小)。**落地前经 context7 确认最新版 API**,YAML→对象用 `load`(非已弃用的 `safeLoad`,新版 `load` 默认即安全 schema),对象→YAML 用 `dump`。其余转换全用平台原生:`btoa`/`atob`(配 `TextEncoder`/`TextDecoder` 处理 UTF-8)、`encodeURI(Component)`/`decodeURI(Component)`、`crypto.randomUUID()`、`RegExp`。
**Alternative**:自研 YAML 解析 —— 被否,重复造轮子且易错。

### 决策 4:统一的输入/输出/错误/复制交互
抽 `components/convert/` 下的共享子组件(输入区、输出区、错误条、复制按钮),各转换器复用。JSON/YAML/文本用 CodeMirror,短输入(时间戳、UUID 数量、正则 flags)用普通输入框。错误统一走结果对象的 `error` 字段渲染为红色提示条,避免各器各写一套。

### 决策 5:UTF-8 安全的 Base64
`btoa`/`atob` 只处理 Latin-1,直接对中文等会抛错。采用 `TextEncoder`→字节→`btoa`(编码)与 `atob`→字节→`TextDecoder`(解码)链路;URL-safe 变体在标准结果上做 `+/`→`-_` 与去/补 `=` 的映射。

## Risks / Trade-offs

- **正则测试器遭遇灾难性回溯(ReDoS)导致 UI 卡死** → 运行用户 pattern 前限制测试文本长度上限,并对匹配施加合理护栏;必要时提示输入过大。纯前端无法完全杜绝,但可显著降低误伤。
- **`js-yaml` API 版本漂移(`safeLoad`/`load` 语义变更)** → 落地前经 context7 核对当前版本文档,固定使用默认安全 schema 的 `load`/`dump`,并在 vitest 覆盖一组往返用例(JSON→YAML→JSON 等价)。
- **Base64 UTF-8 处理不当产生乱码** → 强制走 `TextEncoder`/`TextDecoder` 链路,单测覆盖中文/emoji 往返。
- **JWT 被误当作"已验证"** → UI 显著标注「未校验签名」,spec 与代码注释同步说明,避免安全误用。
- **`crypto.randomUUID` 在非安全上下文(非 https/localhost)不可用** → 本工具本地 `localhost` 运行满足安全上下文;若不可用则回退到基于 `crypto.getRandomValues` 的 v4 构造并给出说明。
