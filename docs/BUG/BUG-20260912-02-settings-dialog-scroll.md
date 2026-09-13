---
type: BUG
title: 设置弹窗滚动样式未命中
created: 2026-09-12
status: fixed
---

# 复现与根因

本轮设置区新增局部 :deep 滚动样式后，真实 Electron CDP 读取到 el-dialog__body 高度 2717px，而不是 65vh。Element Plus 弹窗挂载到组件外，原选择器没有命中。

改为专属 lk-settings-dialog 类下的 :global 选择器，不影响其他弹窗。加入实际 DOM 高度及 overflowY 断言，临时用户目录 Electron 回归通过。

额外发现测试窗口 visibilityState 为 hidden 时 Page.captureScreenshot 一直等待；该截图尝试未产出图片。经正常关闭窗口结束，移除无超时截图请求，保留可确定完成的 DOM 布局断言。未进行人工视觉验收。
