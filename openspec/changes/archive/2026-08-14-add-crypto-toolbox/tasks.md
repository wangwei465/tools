## 1. 现有行为兜底

- [x] 1.1 为 `/api/signature` 现有契约补回归测试：固定 timestamp/appId/appSecret 断言签名值，作为收编重构的前后一致性基准
- [x] 1.2 运行 `npm test` 确认新增回归测试在改动前通过

## 2. 纯函数层：类型与编码

- [x] 2.1 新建 `lib/crypto/types.ts`，定义 `CryptoResult<T> = { ok, value?, error? }` 与 `ok()` / `err()` / `errMessage()`（形状对齐 `lib/convert/result.ts`，但不跨工具 import）
- [x] 2.2 在 `lib/crypto/types.ts` 中实现显式编码解析 `decodeInput(text, encoding: "utf8"|"hex"|"base64"): CryptoResult<Buffer>` 与 `encodeOutput(buf, encoding: "hex"|"base64"): string`，hex 非法字符与 base64 非法输入均返回可读错误
- [x] 2.3 新建 `lib/crypto/errors.ts`，实现底层异常到可读中文的分类映射（密钥长度不符 / padding 错误 / GCM 认证标签校验失败 / PEM 无法解析），未归类异常回落原始 message

## 3. 纯函数层：算法实现

- [x] 3.1 实现 `lib/crypto/hash.ts`：MD5/SHA1/SHA256/SHA512，参数含输入编码与输出编码
- [x] 3.2 实现 `lib/crypto/hmac.ts`：四种摘要算法的 HMAC，密钥编码与输出编码可选，密钥为空时前置报错
- [x] 3.3 实现 `lib/crypto/symmetric.ts` 的 CBC 与 ECB 加解密：AES-128/192/256，密钥字节长度前置校验（错误信息含期望值与实际值），CBC 需 IV
- [x] 3.4 在 `lib/crypto/symmetric.ts` 中实现 GCM 加解密：认证标签作为独立输入/输出字段显式暴露，不做密文尾部隐式拼接
- [x] 3.5 实现 `lib/crypto/asymmetric.ts`：RSA 公钥加密 / 私钥解密 / 私钥签名 / 公钥验签，PEM 密钥解析失败给可读提示；验签不通过返回 `ok: true` 且结果为"未通过"，不作为异常
- [x] 3.6 实现 `lib/crypto/kdf.ts`：PBKDF2（盐值、迭代次数、输出长度、摘要算法）与 scrypt（盐值、cost 参数、输出长度），数值参数非正整数时前置报错

## 4. 纯函数层测试

- [x] 4.1 `lib/crypto/hash.test.ts`：用公开测试向量校验四种摘要算法，覆盖 hex/base64 输出与 hex 输入非法的错误路径
- [x] 4.2 `lib/crypto/hmac.test.ts`：用 RFC 2202 / RFC 4231 测试向量校验 HMAC-MD5/SHA1/SHA256
- [x] 4.3 `lib/crypto/symmetric.test.ts`：CBC/ECB/GCM 加解密往返一致；GCM 认证标签被篡改时解密失败；AES-256 传 16 字节密钥时报含数值的长度错误
- [x] 4.4 `lib/crypto/asymmetric.test.ts`：用测试用 PEM 密钥对校验加解密往返与签名验签往返，签名不匹配时验签返回未通过，非法 PEM 给可读错误
- [x] 4.5 `lib/crypto/kdf.test.ts`：用 RFC 6070 向量校验 PBKDF2，scrypt 覆盖往返确定性与非法参数报错
- [x] 4.6 运行 `npm test` 确认纯函数层全部通过

## 5. 服务端端点

- [x] 5.1 新建 `app/api/crypto/route.ts`：解析 JSON 请求体，按 `op` 分发到 `lib/crypto` 对应实现，统一封装 `{ ok, value }` / `{ ok, error }` 响应
- [x] 5.2 处理 `op` 缺失、不受支持及请求体非法 JSON 三类入口错误，返回可读中文提示
- [x] 5.3 审查路由实现：确认无任何 `console.log` 打印请求体字段，无任何数据库写入，路由内不含算法计算逻辑

## 6. 收编 signature

- [x] 6.1 将 `app/api/signature/route.ts` 的 `createHash("md5")` 替换为调用 `lib/crypto/hash.ts`，保留全部现有校验、lowercase 语义与响应形状
- [x] 6.2 运行 1.1 的回归测试，确认签名输出与重构前逐字符一致

## 7. UI：共享组件与页面外壳

- [x] 7.1 新建 `components/crypto/shared.tsx`：`CopyButton` / `ErrorBar` / `PanelFrame` 与编码选择下拉 `EncodingSelect`，CSS 类前缀统一用 `crypto-`
- [x] 7.2 新建 `app/crypto/page.tsx`：沿用 `TABS` 注册表模式组织五个标签，各标签组件状态独立保持（切换标签不重置已有输入）
- [x] 7.3 页面头部加入计算位置说明文案：计算在本地服务端执行、输入不被保存
- [x] 7.4 在 `components/shell/Navigation.tsx` 的 `TOOLS` 中追加 `{ href: "/crypto", label: "加解密" }`

## 8. UI：五个算法面板

- [x] 8.1 `components/crypto/HashPanel.tsx`：算法选择、输入编码、输出编码、输入区、结果区与复制
- [x] 8.2 `components/crypto/HmacPanel.tsx`：摘要算法、密钥与密钥编码、消息、输出编码、结果与复制
- [x] 8.3 `components/crypto/SymmetricPanel.tsx`：密钥位数、模式（GCM 默认选中）、密钥/IV/密文/认证标签各带独立编码选择，加密与解密方向切换；选中 ECB 时展示遗留系统风险提示
- [x] 8.4 `components/crypto/AsymmetricPanel.tsx`：PEM 密钥输入、加密/解密/签名/验签四种操作、签名摘要算法选择，验签结果以通过/未通过明确展示
- [x] 8.5 `components/crypto/KdfPanel.tsx`：PBKDF2 与 scrypt 切换，各自的参数输入与输出编码选择
- [x] 8.6 各面板统一接入 `ErrorBar` 展示可读中文错误，确认单个面板失败不影响其他面板

## 9. 样式

- [x] 9.1 在 `app/globals.css` 追加 `crypto-` 前缀样式，复用既有暗色设计系统的 CSS 变量与类命名习惯
- [x] 9.2 核对 `/crypto` 与 `/convert`、`/redis` 的视觉一致性（标签栏、输入框、按钮、错误条）

## 10. 验收

- [x] 10.1 `npm run build` 通过，无 TypeScript 报错
- [x] 10.2 `npm test` 全量通过
- [x] 10.3 冒烟：逐标签走通哈希、HMAC、AES-GCM 往返、RSA 签名验签、PBKDF2 五条主路径
- [x] 10.4 冒烟：验证 `/compare`、`/signature`、`/api-client`、`/redis`、`/convert` 五个既有工具行为未受影响
- [x] 10.5 冒烟后确认 `data/app.db` 无新增记录，并按项目惯例清理 dev server 残留进程
