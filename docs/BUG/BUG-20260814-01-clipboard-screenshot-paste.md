---
type: BUG
title: 纸质笔记无法粘贴剪贴板截图
created: 2026-08-14
status: fixed
relates: [REQ-20260814-01, DEV-20260814-01]
---

# 纸质笔记无法粘贴剪贴板截图

原 `paste` 处理只读取 `text/html` 和 `text/plain`，Windows 截图在剪贴板中通常是 `image/png` 文件项，因此会被阻止默认粘贴后插入空内容。

现已优先识别图片文件项，异步读取并插入 `<img>`，随后同步纸页、触发分页和自动保存。自动化测试使用真实 `ClipboardEvent + DataTransfer + image/png File` 验证。
