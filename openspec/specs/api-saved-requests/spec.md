# api-saved-requests Specification

## Purpose

已保存请求——把当前 tab 的 `RequestDraft` 保存为 `request` 节点（请求定义存入节点的 `definition` JSON blob），支持首次保存、覆盖保存、另存为新节点、从集合树打开还原到 tab（含复用已打开 tab），以及基于关联节点 `definition` 的 dirty 判定与保存后清除。

## Requirements

### Requirement: 保存当前请求为节点
系统 SHALL 支持把当前 tab 的 `RequestDraft` 保存为 `request` 节点，请求定义整体存入该节点的 `definition` JSON blob。

#### Scenario: 首次保存并选择位置
- **WHEN** 用户对一个未关联节点的 tab 点击「保存」，选择目标 `folder` 并命名
- **THEN** 系统在该位置创建 `request` 节点、写入当前请求定义，并将该 tab 关联到此节点

#### Scenario: 保存到已关联节点
- **WHEN** 用户对已关联节点的 tab 点击「保存」
- **THEN** 系统以当前请求定义覆盖该节点的 `definition`

### Requirement: 打开已保存请求
系统 SHALL 支持从集合树的 `request` 节点打开，将其 `definition` 还原为 `RequestDraft` 载入 tab。

#### Scenario: 打开还原到新 tab
- **WHEN** 用户双击集合树中的某 `request` 节点
- **THEN** 系统新建一个 tab、载入该节点的请求定义并与之关联

#### Scenario: 复用已打开的 tab
- **WHEN** 用户打开的节点已存在关联 tab
- **THEN** 系统激活该已有 tab 而非重复打开

### Requirement: 另存为新节点
系统 SHALL 支持将当前请求另存为一个新的 `request` 节点。

#### Scenario: 另存为
- **WHEN** 用户对当前 tab 选择「另存为」，选择位置并命名
- **THEN** 系统创建新 `request` 节点写入当前定义，当前 tab 关联切换到新节点

### Requirement: 已保存请求的 dirty 判定
tab SHALL 记录其关联的 `request` 节点；当 tab 的请求相对已保存 `definition` 发生变化时标记 dirty，保存后清除。

#### Scenario: 编辑后标记 dirty
- **WHEN** 用户修改了已关联节点的 tab 的请求内容
- **THEN** 该 tab 显示未保存改动标记（dirty）

#### Scenario: 保存后清除 dirty
- **WHEN** 用户保存该 tab
- **THEN** dirty 标记消除，节点 `definition` 与 tab 内容一致
