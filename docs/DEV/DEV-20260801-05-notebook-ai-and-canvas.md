# 笔记内 AI 与画布工作台实施方案

## 数据模型

将现有 `lk:notebook:v1` 演进为兼容的页面对象：`richText`、`strokes`、`objects`、`links`。保留 v1 的左右页 HTML/位图读取逻辑，并在保存时升级；不得改动 notes 表既有字段。大型 Draw.io XML 存入既有图表记录，页面只保存图表 ID、位置、尺寸和缩略图引用。

## 组件拆分

- `NotebookCanvas.vue`：双页布局、页面状态、图层、选区、撤销栈。
- `NotebookAiPanel.vue`：页内对话、上下文范围、流式回复、差异预览和应用/撤销。
- `NotebookContextMenu.ts`：根据选区、对象、空白页生成菜单。
- `NotebookDrawioDialog.vue`：复用现有 Draw.io 协议与保存能力，输出可嵌入对象。

## 分期

1. **画布基础**：矢量笔迹、荧光笔、橡皮、撤销重做、每页图层和对象选中。
2. **页内 AI**：小窗会话、选区操作、建议预览、确认写入、撤销。
3. **对象与引用**：图片/便签/引用的拖拽缩放，右键补全。
4. **Draw.io**：插入、再次编辑、导入导出、AI 草图预览。

## 风险控制

- AI 修改走 transaction：保存原始 HTML/对象状态，应用前后都压入撤销栈。
- 手写以点集而非仅 data URL 保存，避免橡皮/选择/缩放不可编辑；导出时再栅格化。
- 流式 AI 仍遵循现有 reactive proxy 规则，主进程不接触 DOM。
