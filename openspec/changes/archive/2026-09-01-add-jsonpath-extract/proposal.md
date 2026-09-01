## Why

ES 查询等场景的 JSON 响应嵌套极深（如 `hits.hits[0]._source.preConsultation.main.id`），当前只能在折叠树里逐层展开、肉眼定位字段，效率低且易看错层级。接口调试与编码转换两个模块都缺少「按路径表达式直接取值」的能力，用户被迫把响应复制到外部工具（jq、在线 JSONPath 求值器）处理，既割裂又有把业务数据贴到第三方站点的风险。

同一场景还暴露出工作台布局的问题：请求参数区高度被固定上限锁死，响应区吃掉全部剩余空间。编写较长的 ES 查询 DSL 时请求区局促，而查看短响应时又空置大片区域，两者比例无法按当前任务调整。这与上面的定位问题指向同一件事——面对深而长的 JSON，现有界面既不好找、也不好看。

## What Changes

- 新增 JSONPath 求值核心：接受 JSONPath 表达式与 JSON 文本，输出全部命中值及其具体路径；覆盖根节点、子节点、递归下降、数组索引、切片、通配符、过滤表达式等常用语法。
- 非法表达式、非法 JSON、零命中三种情况给出彼此可区分的可读反馈，不抛未捕获异常。
- 对超大文档与海量命中设置上限保护，避免界面卡死（沿用正则测试器已有的同类保护思路）。
- 接口调试响应区新增 `JSONPath` 页签，位于 Body / Headers / Cookies 之后，对当前响应体求值；非 JSON 响应下该页签不可用。
- 编码转换面板新增 `JSONPath` 转换器，转换器由七类扩展为八类，可对任意粘贴的 JSON 求值。
- 求值全程在浏览器端完成，不出网、不落库，与编码转换既有的隐私约束保持一致。
- 接口调试工作台的请求参数区与响应区之间新增可拖动分隔条，两区高度比例可由用户调整；当前请求区高度被固定上限锁死，面对 ES 这类「请求体短、响应体长」或反之的场景无法自适应。
- 请求 Body 的 JSON 编辑器高度改为填满其容器，使其随拖动实际变化——当前编辑器高度写死，仅放大容器不会让编辑区变大。

## Capabilities

### New Capabilities
- `jsonpath-extract`: JSONPath 表达式对 JSON 文档求值的核心能力——语法覆盖范围、命中结果与路径输出、错误分类反馈、规模上限保护，供多个入口复用。

### Modified Capabilities
- `api-response-viewer`: 响应区视图集合由 Body / Headers / Cookies 三类扩展为四类，新增对当前响应体的 JSONPath 求值视图，并规定非 JSON 响应下的降级行为。
- `encoding-toolkit`: 面板组织由「七个转换器」扩展为「八个转换器」，新增 JSONPath 转换器标签。
- `api-client-workbench`: 三区布局中的请求参数区与响应区高度由固定改为用户可拖动调整，并规定调整边界与跨会话保持行为。

## Impact

- **新增代码**：`lib/convert/jsonpath.ts`（求值核心，遵循现有 `ConvertResult` 的 `ok`/`err` 约定）及其单元测试；`components/convert/JsonPathConverter.tsx`（编码转换入口）；接口调试侧的 JSONPath 视图组件；工作台的可拖动分隔条。
- **修改代码**：`components/api-client/ResponsePane.tsx`（新增页签与视图分流）；`components/api-client/BodyEditor.tsx`（JSON 编辑器高度由固定改为填满容器）；`app/api-client/page.tsx`（工作台布局引入分隔条与高度状态）；编码转换面板的转换器注册表；`app/globals.css`（新增视图与分隔条样式，请求参数区由固定上限改为可变高度）。
- **依赖**：需要一份 JSONPath 求值实现。是引入既有 npm 包还是自研受限子集，涉及包体积、过滤表达式的求值安全性（部分库依赖 `eval`/`Function`）与语法覆盖度的权衡，在 design 阶段决策。拖动交互不引入依赖。
- **不受影响**：数据比对、生成签名、Redis 管理模块无改动；接口调试的请求侧数据、集合、环境变量、历史等能力无改动；无数据库结构变更，无新增 API 路由。
