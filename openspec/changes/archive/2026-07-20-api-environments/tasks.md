## 1. 数据层与建表（lib/db）

- [x] 1.1 在 `lib/db` 增加 `api_environments` 建表：`id, name, is_active`，`CREATE TABLE IF NOT EXISTS`（幂等）
- [x] 1.2 在 `lib/db` 增加 `api_variables` 建表：`id, env_id(nullable=全局), key, value, enabled`
- [x] 1.3 封装环境数据访问：CRUD、设激活（单激活：置一取消其余）
- [x] 1.4 封装变量数据访问：按环境 / 全局 CRUD、`enabled` 切换、删除环境时级联其环境级变量

## 2. 后端 API

- [x] 2.1 `app/api/environments`：`GET` 列表 / `POST` 建 / `PATCH` 改名·激活 / `DELETE`
- [x] 2.2 `app/api/variables`：`GET`（按 env / 全局）/ `POST` / `PATCH` / `DELETE`

## 3. 变量解析与替换引擎

- [x] 3.1 变量解析：合并「激活环境变量 + 全局变量」，环境覆盖全局，仅 `enabled` 生效 → 得 `{key: value}` 映射
- [x] 3.2 `{{key}}` 扫描替换函数：单趟替换、未定义保留原样并标记（值内 `{{}}` 不二次解析）
- [x] 3.3 接入组装管线**最前段**：`RequestDraft` → 替换 →（Auth → Query → Body）→ 信封；无变量时输出等同 ①

## 4. 状态模型（useReducer）

- [x] 4.1 `AppState` 增 `environments`、`variables`、`activeEnvId`；actions（`LOAD_ENVS`/`LOAD_VARS`/`UPSERT_ENV`/`UPSERT_VAR`/`DELETE_*`/`SET_ACTIVE_ENV`）
- [x] 4.2 挂载时拉取 `/api/environments`、`/api/variables`，恢复激活环境

## 5. 环境与变量 UI

- [x] 5.1 环境切换器：选择激活环境，含「无环境」
- [x] 5.2 环境管理：创建 / 重命名 / 删除
- [x] 5.3 变量编辑面板：「当前环境 / 全局」分组，`key`/`value`/`enabled` 增删改
- [x] 5.4 敏感值掩码显示（可选）

## 6. 替换体验

- [x] 6.1 未定义变量可见提示（输入区高亮或发送前警告）
- [x] 6.2 发送前「替换后预览」：展示 URL / headers / body 的最终值

## 7. 验证

- [x] 7.1 `tsc --noEmit` 通过
- [x] 7.2 dev 冒烟：建环境 / 变量、切换激活、`{{var}}` 在 url/header/body 替换、环境 > 全局优先级、禁用变量不生效、未定义原样 + 提示、预览
- [x] 7.3 回归：无变量时请求与 ①/② 一致；② 的集合 / 历史 / 会话与 ① 的组装子逻辑不回归
