---
type: BUG
title: 锚点创建与跨笔记定位存在运行时竞态
created: 2026-08-13
status: fixed
relates: [REQ-20260813-02, DEV-20260813-02]
---

# 锚点创建与跨笔记定位存在运行时竞态

自动化 UI 测试确认了三条运行时故障：空笔记初次输入可能访问不存在的 `pages[spread]`；Chromium 对未注册 `app://` scheme 的 `hostname` 解析不稳定；打开内容块标签时标签监听再次切换模式并清空 `blockId`。此外锚点高亮可能早于纸页 DOM 恢复。

已分别增加纸页不变量保护、内部协议显式解析、Tab 数据携带 `blockId`、有序打开与渲染重试。两次真实应用启动的 UI 测试现已覆盖并通过。
