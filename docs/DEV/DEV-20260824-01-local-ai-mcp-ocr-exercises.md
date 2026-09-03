---
type: DEV
title: 本机 AI 工具、MCP、OCR 与习题集技术方案
created: 2026-08-24
status: impl
relates: [REQ-20260824-01-local-ai-mcp-ocr-exercises, BIZ-20260824-01-local-ai-mcp-safety]
---

# 本机 AI 工具、MCP、OCR 与习题集技术方案

## 模块边界

```
Codex client ─stdio─> learning-kit-mcp bridge ─named pipe─> Electron main ─IPC services─> sql.js/files
                                      │                              │
                                      └──── no direct DB access ──────┘
Renderer ─preload─> Electron main tool/exercise/OCR handlers
```

`electron/main/tool-service.ts` 是唯一业务写入入口：内部 AI、Electron IPC 与命名管道都调用同一套类型化的 `executeTool`、`previewTool` 和 `undoOperation`。安全策略在服务层而不是 UI 层执行。

## 数据演进

在 `db.ts` 只新增表和索引：

- `exercise_sets`、`exercise_questions`、`exercise_attempts`：题集、题目与作答/错题状态。
- `ocr_jobs`、`ocr_blocks`、`book_outline_overrides`：OCR 工作、待确认/已确认文本块和补充目录。
- `tool_operations`：内部/外部调用的审计、确认状态、影响对象、快照、撤销条件与结果。
- `mcp_pending_requests`：需要应用内确认的外部操作，供工具中心显示。

所有表经 `CREATE TABLE IF NOT EXISTS` 进入 SCHEMA；不修改既有列。新写 IPC 在 handler、preload 和 `src/env.d.ts` 同步增加，写后调用 `schedulePersist()`。

## MCP

新增 `mcp/bridge.ts`（单独 Node 进程）和 `electron/main/mcp-pipe.ts`（主进程命名管道服务器）。Bridge 使用 `@modelcontextprotocol/server` 的 `serveStdio`，全部日志走 stderr。工具形态：

- 读取：`learning_kit_status`、`search_learning_data`、`get_note`、`get_book_source`、`list_exercise_sets`。
- 直接写：`create_note`、`append_note`、`organize_note`、`create_exercise_set`、`create_flashcard_from_error`、`add_bookmark`。
- 需确认：`request_delete`、`request_replace_note`、`request_bulk_move`、`request_import_restore`、`request_security_change`。

Bridge 使用逐行 JSON 请求/响应，并带请求 ID、超时和运行中应用校验。Electron 关闭时关闭管道；主进程仅接受当前用户 SID 的命名管道连接。

## OCR

`electron/main/ocr.ts` 管理离线 PaddleOCR 调用。首版通过可配置的本机 Python/PaddleOCR 命令执行，模型目录在应用数据目录；没有安装时返回明确安装状态，不静默联网下载。OCR 将页图和识别框保存为待确认 blocks，渲染端覆盖展示。确认后写 `content_blocks(source_type='book_ocr')`，确保现有搜索和 `app://block` 导航复用同一语义。

## PDF 失效根因与修复

现有 `PdfReaderView.vue` 的 `annCanvas` 在非手绘模式仍位于 `textLayer` 上方（z-index 3 对 2）且默认接收 pointer events；因此浏览器不能在文本层建立选区。修复要求为：非手绘时 `pointer-events:none`；进入手绘时为 `auto`，并只在该模式绑定画笔监听器。新增回归测试验证文本层不会被覆盖并验证跨行选区矩形可保存。

## UI

新增 `ExerciseView.vue` 作为 Dock 独立模块；`AiToolCenter.vue` 增加内置/外部来源、风险、预览、确认/拒绝、撤销和审计详情。`PdfReaderView.vue` 增加 OCR 面板、待确认文字块编辑器、范围选择和目录补充入口。
