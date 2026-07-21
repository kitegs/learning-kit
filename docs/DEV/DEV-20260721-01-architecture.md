---
type: DEV
title: 模块分层与 IPC 设计
created: 2026-07-21
status: done
relates: [REQ-20260721-01-mvp]
---

# 技术方案: 模块分层与 IPC 设计

## 目标
对应 REQ-20260721-01 的对话 / 图书馆 / 笔记 / 思维导图 / SRS 全模块。

## 范围
- `electron/main/{index,db,ipc-db,ai,book,srs,notes}.ts`
- `electron/preload/index.ts` 全量 `window.lk.*` 暴露
- `src/env.d.ts` 全量类型声明
- `src/App.vue` + 5 模式切换 + 5 个 view
- `electron.vite.config.ts` 加 @vitejs/plugin-vue

## 数据 / Schema
`SCHEMA` 常量一次性 exec 6 张表 + 2 索引：settings / groups / conversations / messages / notes / books / bookmarks / highlights / mindmaps / decks / cards / review_log / streak

## IPC 命名约定
- `db:` 对话/分组/消息
- `book:` 图书馆
- `ai:` 模型选择 / 流式 chat
- `deck:` / `card:` / `srs:` 复习
- `notes:` / `mindmap:` 笔记与思维导图

## 阶段拆解
1. ✅ 对话主线（settings / groups / conv / msg IPC + App.vue 主页 + Settings + SidebarView）
2. ✅ 切 sql.js（见 BIZ-20260721-01，重建 db.ts + ipc-db.ts）
3. ✅ book:// 协议 + PDF.js reader + 选段询问 + 划线
4. ✅ 笔记 + 思维导图 markmap 接入
5. ✅ SRS SM-2 + 统计面板 + 进度 AI 总结

## 验证方式
- `npm run typecheck` 0 errors
- `npm run build`
- `npm run dev` 启动后控制台无 `Error occurred`
- 5 模式切换均无报错

## 风险
- sql.js 重复 prepare 重复使用导致 `Statement closed`（已规避：每次 prepare 用完 free）
- preload 输出为 `.mjs`，主进程引用要用 `../preload/index.mjs`（已修）
- CSP 要加 `book:` 与 `worker-src 'self' blob:`（已修）

## 关联
- 上游：REQ-20260721-01
- 关联决策：BIZ-20260721-01