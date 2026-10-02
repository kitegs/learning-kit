---
type: BUG
title: 流结束事件被前端提前移除监听丢失
created: 2026-10-02
status: fixed
relates: [REQ-20261002-01]
---

# 复现及原因

隔离 Electron 主聊天测试中，回答已完整显示，主进程诊断 completed、Agent awaiting_tools，但渲染层仍保留 model_running，没有预览。invoke 返回与 contextBridge 转发的 chunk 回调不保证同步到达，onSend finally 提前移除了监听。

# 修复与验收

等待终止 chunk 后再清理监听，用户停止主动结束等待，缺失终止事件有有界超时。用主聊天真实 UI→本地 SSE→工具预览回归，以及停止/重启测试验收。
