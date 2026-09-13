---
type: DEV
title: 学习工作台 UI 实施方案
created: 2026-09-12
status: impl
---

# Interface Polish Implementation Plan

> Inline execution with superpowers:executing-plans; no commit/push, no subagents.

**Goal:** 统一常用操作与设置导航，并展示实际 Electron 界面。

**Architecture:** SettingsDialog 保留原表单，以 v-show 分区及侧边按钮导航，保存/取消覆盖所有表单草稿；Dock 新增前端事件直达 App 已有搜索/工具中心。ComposeBar 与 MindmapView 小范围统一，不改 Dock 网格和数据库。

**Tech Stack:** Vue、Element Plus、SCSS、Electron CDP；无新增依赖。

**Spec:** REQ-20260912-04-interface-polish.md。

- [ ] SettingsDialog.vue 增加 section 状态和六个导航按钮，默认连接页，分区保留 DOM；取消恢复 provider/model/temperature/baseUrl/testMode/theme/快捷键等草稿，API key 改为保存时落盘。主题仅临时预览，取消恢复。备份操作标注立即执行。
- [ ] Dock.vue 增加 search/tools 事件，替换说明式 AI/底栏搜索与操作记录入口；App.vue 接入现有 overlay/drawer。保留有独立含义的模块导航。
- [ ] ComposeBar.vue 用统一图标替代 Emoji，整理输入区状态层级；MindmapView.vue 的主要按钮/提示汉化，重命名与 XML 导入使用 ElMessageBox.prompt，删除明确确认。
- [ ] tests/ui-polish.e2e.cjs 复用现有临时目录启动/关闭辅助，截图写入工作区 artifacts/ui-polish；使用可见测试窗口和有超时的截图请求，验证导航和设置取消/保存。更新已有 AI UI 测试的分类入口，不削弱业务断言。
- [ ] npm test / npm run typecheck / npm run build / Electron UI 验证，查看截图后再交付。保留未运行的人工/真实云端验收说明。

```js
assert.equal(await cdp.evaluate(`getComputedStyle(document.querySelector('[data-settings-panel="connection"]')).display !== 'none'`), true)
assert.equal(await cdp.evaluate(`window.lk.getSetting('theme')`), savedTheme)
```
