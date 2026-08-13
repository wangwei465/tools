# data-compare Specification

## Purpose

数据比对工具——提供"字符串"与"JSON"两种比对模式，支持左右两侧内容输入、JSON 格式化/压缩展示与非法 JSON 处理、基于规范化内容或原始文本的 hash 计算与一致性判定，以及基于 JSON Path 的差异展示（值不同/右侧多出/右侧缺失）、扁平与树形差异视图切换和字符串逐行 diff。

## Requirements

### Requirement: 比对模式切换
数据比对工具 SHALL 提供"字符串"与"JSON"两种比对模式，用户可在顶部切换，切换后左右输入区与比对逻辑随之改变。

#### Scenario: 默认模式
- **WHEN** 用户首次打开比对工具
- **THEN** 系统处于某一默认模式（JSON），并明确标示当前模式

#### Scenario: 切换到字符串模式
- **WHEN** 用户点击"字符串"模式
- **THEN** 系统按原始文本方式处理输入，并禁用（灰掉）JSON 专属的视图切换按钮

### Requirement: 左右内容输入
数据比对工具 SHALL 提供左右两个输入区，供用户分别粘贴待比对的内容。

#### Scenario: 输入两侧内容
- **WHEN** 用户在左右输入区分别粘贴内容
- **THEN** 系统分别接收并保存两侧内容用于后续比对

### Requirement: JSON 格式化展示
在 JSON 模式下，输入区 SHALL 使用代码编辑器（CodeMirror）对内容进行格式化展示，包含缩进、语法高亮，并支持在"格式化"与"压缩"之间切换查看。

#### Scenario: 粘贴压缩的 JSON
- **WHEN** 用户在 JSON 模式下粘贴一段单行压缩的合法 JSON
- **THEN** 系统自动以缩进、语法高亮的格式化形式展示该 JSON

#### Scenario: 切回原始/压缩视图
- **WHEN** 用户点击"压缩/格式化"切换
- **THEN** 系统在压缩形式与格式化形式之间切换展示，且不改变参与比对的实际数据

### Requirement: 非法 JSON 处理
在 JSON 模式下，当某侧输入不是合法 JSON 时，系统 SHALL 明确标注错误位置，并暂停该次比对（不计算 hash、不产出差异）。

#### Scenario: 输入非法 JSON
- **WHEN** 用户在 JSON 模式下输入语法错误或被截断的 JSON
- **THEN** 系统在编辑器中标注错误位置并给出提示，且不显示 hash 与差异结果

#### Scenario: 修正后恢复比对
- **WHEN** 用户将非法 JSON 修正为合法 JSON
- **THEN** 系统恢复 hash 计算与差异比对

### Requirement: Hash 计算与展示
数据比对工具 SHALL 为左右两侧各自计算并展示 hash 值。JSON 模式下 hash MUST 基于规范化后的内容计算；字符串模式下 hash MUST 基于原始文本计算。

#### Scenario: JSON 规范化后计算 hash
- **WHEN** 两侧为语义相同但 key 顺序或空白不同的 JSON（如 `{"a":1,"b":2}` 与 `{"b":2,"a":1}`）
- **THEN** 两侧规范化后的 hash 相等，判定为一致

#### Scenario: 字符串按原始文本计算 hash
- **WHEN** 两侧字符串存在任意逐字节差异（含空格、换行）
- **THEN** 两侧 hash 不相等，判定为不一致

#### Scenario: 展示两侧 hash
- **WHEN** 两侧内容有效并完成计算
- **THEN** 系统分别展示左、右两侧的 hash 值

### Requirement: 一致性判定
数据比对工具 SHALL 依据两侧 hash 是否相等，给出"一致"或"不一致"的明确结论。

#### Scenario: hash 一致
- **WHEN** 两侧 hash 相等
- **THEN** 系统显示"一致"结论，可不展开差异明细

#### Scenario: hash 不一致
- **WHEN** 两侧 hash 不相等
- **THEN** 系统显示"不一致"结论，并在结果区展示差异明细

### Requirement: JSON 规范化规则
在 JSON 模式下，规范化 SHALL 对对象 key 排序、压缩无意义空白；数组顺序 MUST 保持敏感（顺序不同视为不同）。

#### Scenario: 对象 key 顺序无关
- **WHEN** 两侧对象仅 key 顺序不同、键值对应相同
- **THEN** 规范化后判定为相等

#### Scenario: 数组顺序敏感
- **WHEN** 两侧数组元素相同但顺序不同（如 `["a","b"]` 与 `["b","a"]`）
- **THEN** 规范化后判定为不相等，并作为差异列出

### Requirement: JSON 差异展示
当 JSON 两侧不一致时，系统 SHALL 以 JSON Path 定位每个差异点，并区分三类：值不同、右侧多出、右侧缺失。

#### Scenario: 值不同
- **WHEN** 某路径在两侧都存在但值不同（如 `user.age` 为 20 与 21）
- **THEN** 系统以该路径列出"值不同"，并同时展示左右两侧的值

#### Scenario: 右侧多出的键
- **WHEN** 某路径仅在右侧存在
- **THEN** 系统以该路径列出"右侧多出"

#### Scenario: 右侧缺失的键
- **WHEN** 某路径仅在左侧存在
- **THEN** 系统以该路径列出"右侧缺失"

### Requirement: 差异视图切换
在 JSON 模式下，差异结果 SHALL 支持"扁平路径列表"与"树形高亮"两种视图，用户可切换；字符串模式下该切换 MUST 被禁用。

#### Scenario: 扁平路径视图
- **WHEN** 用户选择扁平视图
- **THEN** 系统以路径列表形式逐条展示所有差异点

#### Scenario: 树形高亮视图
- **WHEN** 用户选择树形视图
- **THEN** 系统以保留 JSON 结构的树形展示，并在发生变化的节点上高亮标注

#### Scenario: 字符串模式禁用切换
- **WHEN** 当前处于字符串模式
- **THEN** 视图切换按钮被禁用（灰掉或隐藏）

### Requirement: 字符串差异展示
在字符串模式下，系统 SHALL 以逐行 diff 的方式展示两侧文本差异。

#### Scenario: 逐行比对
- **WHEN** 两侧字符串存在差异
- **THEN** 系统按行高亮展示新增、删除、修改的行
