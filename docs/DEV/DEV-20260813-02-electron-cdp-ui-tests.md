---
type: DEV
title: Electron CDP 笔记锚点 UI 测试方案
created: 2026-08-13
status: done
relates: [REQ-20260813-02, BUG-20260813-02]
---

# Electron CDP 笔记锚点 UI 测试方案

测试使用 Electron 32 内置 Chromium 的 DevTools Protocol，由 Node 24 原生 `WebSocket` 驱动，不增加 Playwright、Spectron 或原生依赖。主进程仅在存在 `LK_E2E_USER_DATA_DIR` 时覆盖 `userData` 路径，正式启动行为不变。

关键交互节点增加语义化 `data-testid`，其余断言通过真实正文、内容块 IPC、路由状态和锚点 DOM 完成。测试会捕获 `Runtime.exceptionThrown` 与控制台异常，并在失败时附带局部业务状态。

测试过程中修复：纸页输入前确保当前 spread 存在、显式解析 `app://kind/id`、标签页保留 `blockId`、目标笔记加载后再定位块、锚点 DOM 挂载期间按动画帧重试。

运行：`npm run test:ui:notebook-anchor`。
