## MODIFIED Requirements

### Requirement: 工具挂载与面板布局
编码转换工具 SHALL 作为独立菜单挂载到系统外壳,在 `Navigation` 的工具导航中出现,并以单页多标签(八个转换器)的方式组织,复用暗色设计系统;新增本工具不影响任何既有工具。

#### Scenario: 从导航进入
- **WHEN** 用户点击导航中的「编码转换」入口
- **THEN** 系统在外壳内加载 `/convert` 页面,展示转换器标签栏,且全局导航保持可用

#### Scenario: 切换转换器标签
- **WHEN** 用户在面板内点击某个转换器标签(如「Base64」)
- **THEN** 系统展示该转换器的输入/输出区,其余转换器内容隐藏,当前标签明确高亮

#### Scenario: 不影响既有工具
- **WHEN** 编码转换工具被加入导航
- **THEN** 数据比对 / 生成签名 / 接口调试 / Redis管理 的行为与路由均不受影响

## ADDED Requirements

### Requirement: JSONPath 提取器
编码转换工具 SHALL 提供 JSONPath 提取器:接受任意粘贴的 JSON 文本与一个 JSONPath 表达式,展示全部命中值及其在源文档中的路径;结果 SHALL 可复制;非法输入 SHALL 按 JSON 非法 / 表达式非法 / 零命中三类分别给出反馈。

#### Scenario: 对粘贴的 JSON 求值
- **WHEN** 用户粘贴一段 JSON 并输入合法的 JSONPath 表达式
- **THEN** 系统展示该表达式的全部命中值及对应路径

#### Scenario: 复制结果
- **WHEN** 用户对求值结果执行复制
- **THEN** 系统将命中结果写入剪贴板并给出复制成功的反馈

#### Scenario: 输入非法 JSON
- **WHEN** 用户粘贴的文本不是合法 JSON
- **THEN** 系统提示 JSON 非法,不影响其他转换器

#### Scenario: 输入非法表达式
- **WHEN** 用户输入语法非法的 JSONPath 表达式
- **THEN** 系统提示表达式语法错误,且与 JSON 非法的提示明确区分

#### Scenario: 零命中提示
- **WHEN** 表达式合法但在文档中无匹配
- **THEN** 系统以「无匹配」提示呈现,不使用错误样式
