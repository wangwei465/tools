## ADDED Requirements

### Requirement: 由 JSON 样本生成类型定义

系统 SHALL 接受一份 JSON 样本，推断其结构，并生成 TypeScript `interface`、Java POJO、Go `struct`（带 json tag）与 JSON Schema 四种目标输出；生成结果 SHALL 支持一键复制。

#### Scenario: 生成 TypeScript 接口

- **WHEN** 用户粘贴一个 JSON 对象并选择 TypeScript
- **THEN** 系统输出对应的 `interface` 定义，字段名与类型与样本一致

#### Scenario: 生成 Java POJO

- **WHEN** 用户选择 Java
- **THEN** 系统输出对应的类定义，包含字段声明，不预设任何注解框架

#### Scenario: 生成 Go 结构体

- **WHEN** 用户选择 Go
- **THEN** 系统输出对应的 `struct`，每个字段带与原 JSON 键名对应的 `json` tag

#### Scenario: 生成 JSON Schema

- **WHEN** 用户选择 JSON Schema
- **THEN** 系统输出描述该样本结构的 JSON Schema

#### Scenario: 非法 JSON

- **WHEN** 输入不是合法 JSON
- **THEN** 系统给出可读的错误提示，不产出任何代码

#### Scenario: 复制结果

- **WHEN** 用户点击复制
- **THEN** 生成的代码被完整写入剪贴板

### Requirement: 数组元素的字段并集与可选性推断

当样本中存在对象数组时，系统 SHALL 取所有元素字段的并集作为类型字段；未在全部元素中出现的字段 SHALL 标记为可选。

#### Scenario: 字段取并集

- **WHEN** 数组中不同元素含有不同字段
- **THEN** 生成的类型包含所有元素字段的并集

#### Scenario: 缺失字段标记可选

- **WHEN** 某字段只出现在部分元素中
- **THEN** 该字段在生成结果中被标记为可选（如 TypeScript 的 `?`）

#### Scenario: 全部元素都有的字段为必填

- **WHEN** 某字段在数组的每个元素中都出现
- **THEN** 该字段不被标记为可选

### Requirement: 嵌套结构的具名子类型

系统 SHALL 为嵌套对象生成具名子类型，名称由所属字段名推导（PascalCase 化并去复数）；名称冲突时 SHALL 追加数字后缀以消解。

#### Scenario: 嵌套对象生成子类型

- **WHEN** 样本中某字段的值为对象
- **THEN** 系统为该对象生成一个独立的具名类型，父类型引用它

#### Scenario: 数组字段名去复数

- **WHEN** 字段名为 `items` 且其元素为对象
- **THEN** 生成的子类型名为 `Item`

#### Scenario: 名称冲突消解

- **WHEN** 两个不同结构推导出相同的子类型名
- **THEN** 系统为后者追加数字后缀（如 `Item2`），生成结果中无重名类型

#### Scenario: 深层嵌套

- **WHEN** 样本存在多层嵌套对象
- **THEN** 系统逐层生成具名子类型，层级关系与样本一致

### Requirement: 不可推断值的保守取值与显式告知

当样本中的值无法确定类型时，系统 SHALL 生成不会误导的保守类型，并 SHALL 在生成结果之外单独输出一份「需人工确认的字段」清单，MUST NOT 静默给出一个看似确定的类型。

#### Scenario: null 值列入需确认清单

- **WHEN** 某字段的值为 `null`
- **THEN** 系统为其生成可空的任意类型，并将该字段列入需人工确认清单

#### Scenario: 空数组列入需确认清单

- **WHEN** 某字段的值为空数组
- **THEN** 系统无法推断元素类型，将该字段列入需人工确认清单

#### Scenario: 空对象列入需确认清单

- **WHEN** 某字段的值为空对象
- **THEN** 系统生成一个空类型，并将该字段列入需人工确认清单

#### Scenario: 元素类型不一致的数组

- **WHEN** 数组中的元素类型不一致（如同时含数字与字符串）
- **THEN** 系统将元素类型降级为任意类型，并将该字段列入需人工确认清单

#### Scenario: 清单为空时不误导

- **WHEN** 样本中所有字段的类型都可确定
- **THEN** 需确认清单为空，界面不展示无谓的警告

#### Scenario: 结果不被称作权威 schema

- **WHEN** 系统展示生成结果
- **THEN** 界面明确说明该结果由样本推断得出，需人工核对，MUST NOT 表述为权威 schema

### Requirement: 数值类型的范围与精度处理

系统 SHALL 依据数值的形态选择目标类型：含小数点的数值 SHALL 生成浮点类型；超出 JavaScript 安全整数范围的整数 SHALL 生成 64 位整数类型，并 SHALL 列入需人工确认清单。

#### Scenario: 小数生成浮点类型

- **WHEN** 某字段的值含小数点
- **THEN** 系统生成对应语言的浮点类型（如 Java `Double`、Go `float64`）

#### Scenario: 大整数生成 64 位整数并提示

- **WHEN** 某字段的整数值超出 JavaScript 安全整数范围
- **THEN** 系统生成 64 位整数类型（如 Java `Long`、Go `int64`），并将该字段列入需人工确认清单

#### Scenario: 普通整数

- **WHEN** 某字段的整数值在安全范围内
- **THEN** 系统生成常规整数类型

### Requirement: 非法标识符的转义与映射保留

当 JSON 键名不是目标语言的合法标识符（含语言关键字、以数字开头、含特殊字符）时，系统 SHALL 转义为合法标识符，并 SHALL 保留其与原始键名的对应关系；受影响字段 SHALL 列入需人工确认清单。

#### Scenario: 键名以数字开头

- **WHEN** JSON 键名以数字开头
- **THEN** 系统生成合法的字段名，并通过 tag 或注释保留原始键名

#### Scenario: 键名为语言关键字

- **WHEN** JSON 键名与目标语言的关键字冲突
- **THEN** 系统生成不冲突的字段名，并保留原始键名的对应关系

#### Scenario: 键名含特殊字符

- **WHEN** JSON 键名含连字符或空格等特殊字符
- **THEN** 系统生成合法字段名，并保留原始键名的对应关系

#### Scenario: 转义字段列入清单

- **WHEN** 任何字段名发生了转义
- **THEN** 该字段被列入需人工确认清单，提示生成代码可能需要手工核对

### Requirement: 嵌套深度上限

系统 SHALL 为 JSON 嵌套深度设置上限，超出上限时 SHALL 给出说明上限值的可读提示并停止生成，MUST NOT 让页面陷入无响应或栈溢出。

#### Scenario: 超深嵌套被拒绝

- **WHEN** 输入 JSON 的嵌套深度超过上限
- **THEN** 系统给出说明上限值的可读提示并停止生成，页面保持可交互

#### Scenario: 上限内正常生成

- **WHEN** 嵌套深度在上限之内
- **THEN** 系统正常生成结果

### Requirement: 推断与生成逻辑可独立测试

结构推断与各目标语言的代码生成 SHALL 实现为不依赖 UI 与网络的纯函数，且推断层与生成层分离，使新增目标语言只需新增一个生成器。

#### Scenario: 纯函数可直接测试

- **WHEN** 测试代码传入 JSON 样本调用推断与生成函数
- **THEN** 无需渲染组件即可断言推断出的结构与生成的代码文本

#### Scenario: 推断层与生成层分离

- **WHEN** 需要新增一种目标语言
- **THEN** 只需新增一个生成器，结构推断逻辑无需改动
