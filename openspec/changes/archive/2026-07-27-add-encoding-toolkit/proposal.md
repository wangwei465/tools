## Why

日常开发绕不开一堆零碎转换——解一段 Base64、把时间戳换成可读时间、JSON 转 YAML、拆一个 JWT 看 payload、验个正则。目前只能散落在多个在线网站(还有把敏感串贴到第三方站的风险)或临时写脚本。工具集已有的三个「无状态转换类」工具(数据比对 / 生成签名 / 接口调试)证明这类纯前端工具挂载成本极低,本 change 把上述高频离线转换收进同一个本地面板,**全部在浏览器端计算,零网络请求、零落库**,消除敏感数据外泄面。

## What Changes

- 新增「编码转换」工具菜单(`/convert`),沿用现有外壳:`Navigation` 的 `TOOLS` 追加一条 + `app/convert/page.tsx` 单页多标签布局,复用暗色设计系统与 CodeMirror。**纯客户端**,不新增任何 `app/api/*` 路由、不动 `lib/db` 与 `app.db`。
- 面板内提供 7 个转换器,各为独立可验收纵切:
  - **JSON ⇔ YAML** 互转,附 JSON 美化 / 压缩 / 校验(非法输入给出可读错误)。
  - **Base64** 编解码,支持标准与 URL-safe 变体。
  - **URL** 编解码,区分 component(`encodeURIComponent`)与整串(`encodeURI`)。
  - **时间戳 ⇔ 日期** 互转,支持秒 / 毫秒、本地 / UTC 展示。
  - **UUID v4** 批量生成(可指定数量)。
  - **JWT 解析**:解码 header / payload 展示(Base64URL),**不验签**,并明确标注未校验签名。
  - **正则测试器**:pattern + flags + 测试文本,高亮所有匹配并列出分组。
- **不改动**:数据比对 / 生成签名 / 接口调试 / Redis管理及其 API、`app.db` 既有表与既有能力。

## Capabilities

### New Capabilities
- `encoding-toolkit`:编码转换面板——单页多标签的纯前端开发者转换工具,涵盖 JSON⇔YAML、Base64、URL、时间戳⇔日期、UUID 生成、JWT 解析、正则测试七类高频离线转换,全部客户端计算、不落库、不发网络请求;含工具导航挂载与统一的输入/输出/复制/错误交互。

### Modified Capabilities
<!-- 无:编码转换为全新独立菜单。新工具的挂载由 `tool-shell` 的「工具可扩展性」需求既有覆盖,本 change 只是其一次实例化,不改动其需求。 -->

## Impact

- **新增依赖**:`js-yaml`(YAML ⇔ JSON 互转;轻量、纯 JS、无网络。落地前经 context7 确认最新 API 与安全的 `load`/`dump` 用法)。其余转换用平台原生能力(`atob`/`btoa`、`encodeURIComponent`、`crypto.randomUUID`、`RegExp`)。
- **新增前端**:`app/convert/page.tsx` + `components/convert/*`(标签容器 + 七个转换器组件 + 共享输入输出/复制/错误 UI);转换纯函数抽到 `lib/convert/*` 便于 vitest 单测。
- **导航**:`components/shell/Navigation.tsx` 的 `TOOLS` 追加 `{ href:"/convert", label:"编码转换" }`。
- **复用**:暗色设计系统、CodeMirror(JSON/YAML/文本编辑与高亮)、既有 `app/signature/page.tsx` 的纯前端工具骨架。
- **无后端 / 无数据层**:不新增 API 路由、不建表、不触碰 `app.db`;所有计算在客户端完成,无任何出网请求。
- **约束**:JWT 仅解码不验签(UI 明示);正则测试运行用户输入的 pattern,需防 UI 卡死(超时 / 长度保护)。
