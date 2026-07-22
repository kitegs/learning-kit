---
type: DEV
title: Phase 2-4 功能实现方案
created: 2026-07-22
status: done
relates: [REQ-20260721-01-mvp]
---

# Phase 2-4 功能实现方案

## Phase 2: 标签页 + 子菜单 + 搜索历史

### 标签页系统
- `src/stores/tabs.ts` — Tab store，管理 `Tab[]`，支持 open/close/closeOthers/closeRight/pin/rename/move
- `src/components/TabBar.vue` — 标签栏，拖拽排序、中键关闭、右键菜单、Ctrl+T/W、预览标签(斜体)
- App.vue 集成：TabBar 在 topbar 下方，watch activeTab 切换 mode+data

### 右键子菜单
- ContextOverlay 支持 `children: CxItem[]`，hover 展开子菜单，智能定位（空间不足翻左/翻上），ESC 逐级关闭
- PdfReaderView 的高亮颜色改为子菜单（Highlight → Yellow/Green/Blue/Pink）

### 搜索历史
- SearchOverlay 加 history 数组，localStorage 持久化 `lk_search_history`
- 空查询时显示历史列表，逐条删除/清空

## Phase 3: 主题变量 + AI 子菜单 + Undo/Redo

### 主题变量 60+
- global.scss 重构为 Material Design 表面层级模型（bg/elev/elev-2/elev-3）
- 8 种文字高亮色 + 8 种背景高亮色，语义色（success/warning/danger/info）
- 暗/亮两套完整 token，阴影/圆角/间距/字体大小体系化

### AI 右键子菜单 + 自定义动作
- NotesView 右键 → AI 子菜单：Continue/Summarize/Brainstorm/Fix/Explain/Generate flashcards
- 自定义 AI 动作：localStorage `lk_ai_actions` 存 JSON，用户可编辑
- 触发 AI 动作 → dispatch `lk:ai-action` CustomEvent → App.vue 捕获 → 发消息到对话

### Undo/Redo
- NotesView 加 undo/redo Stack，最大 80 步
- 每次 insertCmd/applySlash/onTab 自动 push，Ctrl+Z/Shift+Z 触发
- 切换笔记时清空栈

## Phase 4: Gutter + Dock + Tiptap

### Gutter 行号
- NotesView 左侧 44px 行号栏，当前行蓝色高亮，hover 显示 ☰ 拖拽手柄
- 右键菜单：Duplicate/Delete/Move up/Move down/Select/Make card

### 三侧 Dock
- `src/components/Dock.vue` — CSS Grid 布局（3 列 48px/1fr/32px + 底栏 26px）
- 左 dock：模式切换(5 图标) + 面板切换(Outline/Tags/Bookmarks) + 主题切换
- 右 dock：AI/Backlinks 面板
- 底 dock：Search/Console 面板
- 面板可拖拽调宽/高，slide 动画入场

### Tiptap 块编辑器
- 安装 14 个扩展：StarterKit+Underline+Highlight+TaskList+Table+Image+Link+Placeholder
- `src/components/BlockEditor.vue` — 工具栏(B/I/U/S/HL/H1-4/UL/OL/Todo/Quote/Code/HR/Table/Img/Undo/Redo)
- NotesView 工具栏新增 **MD/Block** 切换按钮，保留 textarea 模式作为 fallback

## 验证
- typecheck:web — 0 errors
- typecheck:node — 0 errors
- build — 成功
- dev — 正常启动