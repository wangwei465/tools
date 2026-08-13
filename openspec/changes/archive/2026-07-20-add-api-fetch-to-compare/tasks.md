## 1. 数据层（SQLite）

- [x] 1.1 引入 `better-sqlite3` 依赖，`data/app.db` 及 `data/` 加入 `.gitignore`
- [x] 1.2 实现 `lib/db/index.ts`：单例连接 + 惰性建表（`CREATE TABLE IF NOT EXISTS`）
- [x] 1.3 建表 `app_settings(key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)`
- [x] 1.4 建表 `request_records(id, name, url, method, headers_json, use_count, last_used_at, created_at)`，`(url, method)` 唯一
- [x] 1.5 实现令牌配置读写：`getTokenConfig()` / `setTokenConfig(cfg)`（读写 `key='global_token_config'` 单行）
- [x] 1.6 实现历史记录 `upsertRecord()`（按 url+method upsert，累加 use_count、更新 last_used_at/headers_json）与 `searchRecords(keyword)`（匹配 url/name，按 last_used_at 倒序）

## 2. 后端 API

- [x] 2.1 实现 `GET/POST /api/settings/token`：读取 / 保存统一令牌配置
- [x] 2.2 实现 `GET /api/request-records?keyword=`：返回筛选后的历史记录
- [x] 2.3 将 `app/api/proxy/route.ts` 由 501 占位改为真实 GET 代理
- [x] 2.4 代理内合并 Header：读取令牌配置注入（Header 名/Prefix），叠加单侧普通 Header，同名单侧覆盖
- [x] 2.5 代理设置请求超时与响应大小上限，非 2xx / 超时 / 超限返回明确错误
- [x] 2.6 代理校验响应为合法 JSON：失败返回 `ok:false` 且不写历史；成功返回 body 并 upsert 历史

## 3. 统一令牌设置（前端）

- [x] 3.1 新增统一令牌设置组件（Header 名 / Prefix / Token 输入 + 保存）
- [x] 3.2 在比对页顶部增加"统一请求设置"入口（弹窗或折叠面板）
- [x] 3.3 接入 `/api/settings/token` 读取回显与保存

## 4. 前端请求区

- [x] 4.1 新增请求区组件：URL 输入框 + 普通 Header 键值编辑 + "请求并回填"按钮
- [x] 4.2 在左右编辑器上方各挂载一个请求区，仅 JSON 模式显示/启用
- [x] 4.3 点击请求：调用 `/api/proxy` 发送 `{ url, headers }`，处理加载与错误态
- [x] 4.4 请求成功后格式化响应 JSON，经 `setLeftText/setRightText` 回填对应编辑器，自动触发现有比对

## 5. 请求历史下拉筛选

- [x] 5.1 URL 输入框增加下拉：输入时调用 `/api/request-records` 按关键字筛选
- [x] 5.2 选中历史项回填 URL 与普通 Headers（不回填令牌）

## 6. 验证

- [x] 6.1 验证左/右接口请求成功后 JSON 回填并触发 hash/diff 比对
- [x] 6.2 验证统一令牌被自动携带、单侧同名 Header 覆盖全局
- [x] 6.3 验证历史记录保存普通 Headers 但不含令牌，且下拉筛选/复用可用
- [x] 6.4 验证非法 JSON 响应、非 2xx、超时、超限均返回明确错误且不回填/不写历史
- [x] 6.5 验证字符串模式下请求区被隐藏/禁用
