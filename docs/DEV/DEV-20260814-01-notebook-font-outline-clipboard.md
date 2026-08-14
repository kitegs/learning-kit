---
type: DEV
title: 纸质笔记字体目录与剪贴板图片实现
created: 2026-08-14
status: done
relates: [REQ-20260814-01, BUG-20260814-01]
---

# 纸质笔记字体目录与剪贴板图片实现

`NotebookLayout` 新增向后兼容的 `fontFamily`，渲染层映射为本机安全字体栈。目录扫描每个双页的 H1–H3，为缺少 ID 的标题生成稳定 `lk-heading-*` 标识，并记录 spread、左右页和层级；点击目录时切页、等待 DOM 挂载、滚动并高亮。

剪贴板粘贴优先检查 `DataTransferItem`/`FileList` 中的图片，通过 `FileReader` 转为 data URL，在原选区插入并进入现有分页、撤销和自动保存链。异步读取期间若笔记已切换则取消，避免写入错误笔记。

快捷键沿用 Settings store：F2、Ctrl+Alt+O、Ctrl+Alt+1/2/3。现有 Electron CDP UI 测试扩展为验证标题快捷键、目录定位、字体字号、模拟截图粘贴及重启恢复。
