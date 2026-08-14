## Context

工具集现有五个工具，其中「生成签名」(`/signature`) 把签名规则硬编码为 `md5(时间戳 + appId + appSecret)`，MD5 走 `POST /api/signature` 用 Node `node:crypto` 计算（原因见该路由注释：浏览器 `SubtleCrypto` 不支持 MD5）。「编码转换」(`/convert`) 则是另一种形态：单页多标签、纯前端计算、spec 明确约束不出网不落库。

本次要新增的加解密工具箱在算法面上与两者都有交集，但约束不同：它需要 MD5、AES-ECB、RSA 这些 Web Crypto 不覆盖的算法，因此无法沿用 `/convert` 的纯前端模式。

**现有可复用的模式：**
- `lib/convert/result.ts` 的 `ConvertResult<T> = { ok, value?, error? }` 与 `ok()` / `err()` / `errMessage()` 工具函数——纯函数不抛异常给 UI
- `components/convert/shared.tsx` 的 `CodeArea` / `CopyButton` / `ErrorBar` / `ConverterFrame` 四个共享组件
- `app/convert/page.tsx` 的标签注册表模式（`TABS` 常量数组 + 动态渲染当前组件）
- `components/shell/Navigation.tsx` 的 `TOOLS` 工具注册表

**约束：** 单人本地开发工具，服务端与浏览器同机；无 UI 库，样式为手写暗色设计系统；测试用 vitest。

## Goals / Non-Goals

**Goals:**

- 一次补齐后端联调所需的算法面：哈希、HMAC、对称加解密、非对称加解密与验签、密钥派生
- 零新增依赖，全部基于 Node 内置 `node:crypto`
- 算法实现集中在 `lib/crypto/`，纯函数、可被 vitest 用公开测试向量直接验证
- `/signature` 的对外行为逐字节不变，仅内部改为复用新实现，消除重复的 MD5 计算代码
- 明文与密钥不落库、不写日志，且该约束在 spec 层可验证

**Non-Goals:**

- bcrypt——`node:crypto` 不提供，纳入需引第三方依赖，与零依赖取舍冲突；口令场景由 PBKDF2 / scrypt 覆盖
- 密钥的保存与密钥库管理，本工具只做一次性计算
- 文件加解密、流式大文件哈希，仅处理文本输入
- 密钥对生成（RSA keygen）——首版只消费用户已有的 PEM 密钥

## Decisions

### 决策一：全部算法统一走服务端 `POST /api/crypto`，而非混合前后端

**选择：** 单一服务端入口，浏览器只负责收集参数与渲染结果。

**理由：** 混合方案（SHA/HMAC/AES-CBC 走 Web Crypto，MD5/AES-ECB/RSA 走服务端）虽然隐私更优，但会产生两套代码路径、两套错误语义，并且用户需要理解"哪些算法出网哪些不出网"这一无谓的心智负担。统一走服务端换来单一实现、单一错误分类、单一测试面，且 `node:crypto` 的算法覆盖是完整的。

**代价与缓解：** 明文与密钥经本地 HTTP 传到同机 Next 服务端，破坏了 `/convert` 建立的"纯前端不出网"惯例。缓解方式是把"不落库、不写日志、仅当次计算"写成 spec 的强制要求（见 `crypto-compute-api`），并在页面顶部向用户明示计算位置。这是本地单人工具，同机传输的实际风险可接受。

**被否方案：** 引入 `spark-md5` + `node-forge` 做纯前端——依赖变重，且第三方 JS 加密实现的正确性与常量时间特性难以担保。

### 决策二：`/api/crypto` 用单端点 + `op` 判别联合，而非每种算法一个路由

**选择：** `POST /api/crypto`，请求体形如 `{ op: "hash" | "hmac" | "encrypt" | "decrypt" | "sign" | "verify" | "kdf", ...算法参数 }`，响应统一为 `{ ok: true, value }` 或 `{ ok: false, error }`。

**理由：** 七种操作共享同一套输入编码解析、错误分类与响应形状，拆成七个路由会把这套公共逻辑复制七遍，违反 DRY；而 `op` 字段的分发在 `lib/crypto` 里就是一次 switch。响应形状刻意与 `ConvertResult` 对齐，前端可以直接复用 `ErrorBar` 的渲染约定。

**被否方案：** RESTful 多路由（`/api/crypto/hash`、`/api/crypto/hmac`…）——路由数量膨胀，公共校验逻辑难以收敛。

### 决策三：`lib/crypto/` 为纯函数层，路由只做解析与分发

**选择：** 分层为 `lib/crypto/{hash,hmac,symmetric,asymmetric,kdf}.ts` 五个纯函数模块 + `types.ts`（结果类型与编码工具），`app/api/crypto/route.ts` 只负责 JSON 解析、调用分发、包 `NextResponse`。

**理由：** 纯函数层不依赖 `Request`/`Response`，vitest 可以直接喂 RFC 测试向量断言，无需起 HTTP 服务。这与 `lib/convert` + 组件层的既有分层完全同构。结果类型复用 `ConvertResult` 的形状（`lib/crypto/types.ts` 定义自己的 `CryptoResult`，不跨模块 import `lib/convert`，避免两个工具耦合）。

**被否方案：** 逻辑直接写在路由里——不可单测，且 `/signature` 无法复用。

### 决策四：输入/输出编码作为显式参数，不做自动嗅探

**选择：** 每个需要二进制输入的字段（密钥、IV、密文、签名）都带一个显式的编码下拉：`utf8` / `hex` / `base64`；哈希与 HMAC 的输出编码同样显式选择 `hex` / `base64`。

**理由：** 自动嗅探"这串是 hex 还是 base64"在短输入上必然歧义（`"abc123"` 两种解读都合法），静默猜错会产出看似成功实则错误的结果——这是加密工具里最危险的失败模式。显式选择把歧义交还给用户，且与主流工具（CyberChef、OpenSSL CLI）的心智一致。

### 决策五：UI 沿用 `/convert` 的标签注册表模式，但共享组件独立一份

**选择：** `app/crypto/page.tsx` 复制 `TABS` 注册表模式；共享组件新建 `components/crypto/shared.tsx`，而非 import `components/convert/shared.tsx`。

**理由：** 注册表模式是值得复制的**模式**，几行代码；而共享组件若跨工具 import，会让两个本应独立演进的工具产生耦合——`/convert` 改一次 `CopyButton` 就可能波及 `/crypto`，违背 tool-shell spec 里"新增工具不影响既有工具"的要求。加密面板的输入控件（编码下拉、密钥框、模式选择）与转换面板差异也确实够大。CSS 类前缀用 `crypto-`，与 `conv-` 隔离。

**权衡说明：** 这是有意接受的少量重复（`CopyButton` / `ErrorBar` 约 30 行）。若第三个工具再需要同一组件，届时再上提到 `components/shared/`——按 YAGNI，现在不做这层抽象。

### 决策六：`/signature` 只换 MD5 实现，页面与 API 契约不动

**选择：** `app/api/signature/route.ts` 保留全部校验逻辑与响应形状，仅把 `createHash("md5")...` 一行替换为调用 `lib/crypto/hash.ts` 的 `hash({ algorithm: "md5", input: raw, inputEncoding: "utf8", outputEncoding: "hex" })`，并保留 lowercase 语义。

**理由：** 该页面服务着确定的业务规则，任何行为变化都是无谓的破坏。收编的价值在于 MD5 计算只有一处实现，而非 UI 统一。

## Risks / Trade-offs

- **明文与密钥经本地 HTTP 出浏览器** → spec 强制约束不落库、不写日志、不进 `app.db`；页面顶部明示"计算在本地服务端执行"；不在 `console.log` 中打印任何请求体字段。

- **AES-ECB 与 PKCS#1 v1.5 是已知弱模式，工具提供它们可能被误用于新系统** → 在 UI 上对 ECB 标注"仅用于对接遗留系统，勿用于新设计"；GCM 作为对称加密的默认选中模式。

- **GCM 认证标签处理易错**：Node 的 `cipher.getAuthTag()` 与 `decipher.setAuthTag()` 必须成对且顺序正确，写错会导致解密静默失败或抛不可读的异常 → 认证标签作为独立输入/输出字段显式暴露（不做"密文尾部自动拼接标签"这类隐式约定），并在 `symmetric.test.ts` 中覆盖"标签被篡改则解密失败"的用例。

- **`node:crypto` 的异常信息对用户不可读**（如 `error:1C800064:Provider routines::bad decrypt`）→ 在 `lib/crypto` 层做错误分类映射，把常见失败翻译成可读中文（密钥长度不符、padding 错误、认证标签校验失败、PEM 格式无法解析），未知异常回落到原始 message 而非吞掉。

- **密钥长度与算法不匹配**（如给 AES-256 传 16 字节密钥）→ 解码后在纯函数层前置校验字节长度，给出"AES-256 需要 32 字节密钥，当前 16 字节"这类含实际数值的提示，而非让 `node:crypto` 抛底层错误。

- **收编 signature 时改坏现有行为** → 先为 `/api/signature` 现有契约补一个回归测试（固定输入 → 固定签名值），再做替换，确保重构前后输出一致。

## Migration Plan

无数据迁移。新增路由与页面为纯增量；`/signature` 的替换由回归测试兜底，回滚只需还原该文件的一行调用。

## Open Questions

- 无阻塞性问题。bcrypt 是否补齐、共享组件是否上提到 `components/shared/`，均已按 YAGNI 推迟到有实际第二需求时再定。
