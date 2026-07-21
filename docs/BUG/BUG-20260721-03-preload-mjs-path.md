---
type: BUG
title: preload 加载路径 .js 找不到导致 window.lk undefined
created: 2026-07-21
status: fixed
relates: [REQ-20260721-01-mvp]
---

# BUG: preload 加载路径 .js 找不到导致 window.lk undefined

## 现象
切完 sql.js 后控制台大量报：
```
Cannot read properties of undefined (reading 'groupsTree')
Cannot read properties of undefined (reading 'bookList')
Cannot read properties of undefined (reading 'notesList')
```

## 复现步骤
1. 启动 electron-vite dev
2. 渲染层调用 `window.lk.xxx()`

## 期望 / 实际
- 期望：`window.lk` 由 preload 注入
- 实际：`window.lk` undefined

## 根因
electron-vite 默认 preload 输出文件名是 `index.mjs`，但 `electron/main/index.ts` 里写的是 `'../preload/index.js'`，preload 加载失败，`contextBridge.exposeInMainWorld` 没跑 → `window.lk` undefined。

## 修法
改 `electron/main/index.ts` 里的 preload 路径为 `'../preload/index.mjs'`。

## 关联来源
- 上游：REQ-20260721-01-mvp