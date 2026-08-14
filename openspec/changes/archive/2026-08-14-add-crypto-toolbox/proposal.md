## Why

后端联调中高频需要临时算哈希、验 HMAC、解一段 AES 密文或用 RSA 验签，目前工具集里只有一个把规则写死成 `md5(时间戳 + appId + appSecret)` 的「生成签名」页，只能服务单一业务，其余场景仍要去翻在线网站——把密钥粘贴到第三方站点既不安全也不可控。本次把该窄实现泛化为通用的加解密工具箱，一次补齐日常联调所需的算法面。

## What Changes

- 新增「加解密」工具（`/crypto`），挂载到全局导航，采用与「编码转换」一致的单页多标签布局，含四个标签：
  - **哈希**：MD5 / SHA1 / SHA256 / SHA512，输出 hex 与 base64 两种编码
  - **HMAC**：以上四种摘要算法配合密钥计算 HMAC，密钥支持 UTF-8 / hex / base64 三种解读方式
  - **对称加解密**：AES-128/192/256，支持 CBC / ECB / GCM 三种模式，可配置 IV、padding 与 GCM 认证标签
  - **非对称**：RSA 公钥加密 / 私钥解密、私钥签名 / 公钥验签，PEM 格式密钥输入
- 新增密钥派生能力：PBKDF2 与 scrypt，用于口令哈希与比对场景
- 所有算法计算统一由服务端 Node `node:crypto` 执行（新增 `POST /api/crypto` 单一入口），明文与密钥仅用于当次计算，不落库、不写日志
- 现有「生成签名」页面与 `/signature` 路由、`/api/signature` 行为保持完全不变，仅将其 MD5 计算改为复用新工具箱的公共实现，消除重复（非 BREAKING，使用者零感知）

### 非目标

- **bcrypt 不在首版范围**：`node:crypto` 不提供 bcrypt，纳入它必须引入第三方依赖，与本次"零新依赖"的取舍冲突。口令哈希场景由 PBKDF2 / scrypt 覆盖，bcrypt 待后续单独评估
- 不做密钥的持久化保存与密钥库管理，本工具只做一次性计算
- 不做文件加解密与大文件哈希，仅处理文本输入

## Capabilities

### New Capabilities

- `crypto-toolbox`: 加解密工具箱——哈希、HMAC、对称加解密、非对称加解密与验签、密钥派生五类算法的统一面板与服务端计算约束，含工具导航挂载、编码选择、错误提示与复制交互
- `crypto-compute-api`: 加解密计算服务端点——`POST /api/crypto` 的统一请求/响应契约、算法参数校验、错误分类，以及明文与密钥不落库、不记日志的隐私约束

### Modified Capabilities

<!-- 无。/signature 与 /convert 的对外行为均不变，仅 signature 的内部实现复用新 lib，不涉及需求级变更 -->

## Impact

- **新增代码**：`app/crypto/page.tsx`、`components/crypto/*`（四个标签组件 + 共享输入输出组件）、`lib/crypto/*`（hash / hmac / symmetric / asymmetric / kdf 纯函数 + 结果类型）、`app/api/crypto/route.ts`
- **修改代码**：`components/shell/Navigation.tsx` 追加一条工具注册；`app/api/signature/route.ts` 改为调用 `lib/crypto` 的 MD5 实现
- **样式**：`app/globals.css` 追加 `/crypto` 页面样式，沿用既有暗色设计系统的变量与类命名习惯
- **依赖**：无新增依赖，全部使用 Node 内置 `node:crypto`
- **测试**：`lib/crypto/*.test.ts`，用各算法的公开测试向量（RFC 2202 HMAC、NIST AES、RFC 6070 PBKDF2 等）校验实现正确性
- **数据库**：无 schema 变更，不写 `app.db`
- **风险**：明文与密钥经由本地 HTTP 传到同机 Next 服务端，与 `/convert` 的"纯前端不出网"约定不同，需在 spec 中显式约束不落库、不记日志，并在页面上向用户说明
