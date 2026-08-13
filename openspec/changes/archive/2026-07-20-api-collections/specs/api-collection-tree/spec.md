## ADDED Requirements

### Requirement: 侧边栏集合树
系统 SHALL 在接口调试工具页提供侧边栏集合树，以 `api_nodes` 邻接表结构（`parent_id` 指向父节点）展示 `folder` 与 `request` 节点的层级，`folder` 可展开 / 折叠。

#### Scenario: 展示节点层级
- **WHEN** 用户打开接口调试工具页
- **THEN** 侧边栏按父子层级展示集合树，`folder` 与 `request` 节点以不同图标区分

#### Scenario: 展开与折叠文件夹
- **WHEN** 用户点击某 `folder` 的展开 / 折叠控件
- **THEN** 该文件夹的直接子节点相应显示或隐藏

### Requirement: 新建节点
集合树 SHALL 支持在根级或任意 `folder` 下新建 `folder` 或 `request` 节点，新节点追加到目标层级末尾（`sort_order` 递增）。

#### Scenario: 新建文件夹
- **WHEN** 用户在某 `folder` 上选择「新建文件夹」并命名
- **THEN** 系统在该 `folder` 下创建一个 `folder` 节点并展示

#### Scenario: 新建请求节点
- **WHEN** 用户选择「新建请求」
- **THEN** 系统创建一个空白 `request` 节点并可随即打开编辑

### Requirement: 重命名节点
集合树 SHALL 支持重命名 `folder` 与 `request` 节点。

#### Scenario: 重命名节点
- **WHEN** 用户对某节点执行重命名并输入新名称
- **THEN** 该节点显示新名称并持久化

### Requirement: 删除节点
集合树 SHALL 支持删除节点；删除 `folder` 时级联删除其整棵子树。

#### Scenario: 删除请求节点
- **WHEN** 用户删除某 `request` 节点并确认
- **THEN** 该节点从树中移除并持久化

#### Scenario: 删除文件夹级联子树
- **WHEN** 用户删除一个含子节点的 `folder` 并确认
- **THEN** 该 `folder` 及其全部子孙节点一并被移除

### Requirement: 移动与排序
集合树 SHALL 支持通过拖拽将节点移动到其他 `folder`（改 `parent_id`）或调整同级顺序（改 `sort_order`）。

#### Scenario: 移动到其他文件夹
- **WHEN** 用户将某节点拖入另一个 `folder`
- **THEN** 该节点的父节点更新为目标 `folder` 并出现在其子级

#### Scenario: 同级重新排序
- **WHEN** 用户在同一层级内拖拽调整某节点位置
- **THEN** 该层级节点按新顺序展示，`sort_order` 相应更新

### Requirement: 集合树持久化
节点的增删改移 SHALL 持久化到 `api_nodes` 表，刷新页面后集合树保持一致。

#### Scenario: 刷新后保持
- **WHEN** 用户在集合树做出变更后刷新页面
- **THEN** 集合树以变更后的状态重新加载
