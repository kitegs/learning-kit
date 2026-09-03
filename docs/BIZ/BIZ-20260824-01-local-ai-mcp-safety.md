---
type: BIZ
title: 本机 AI 与 MCP 写入安全策略
created: 2026-08-24
status: accepted
relates: [BIZ-20260801-01-ai-tool-confirmation, REQ-20260824-01-local-ai-mcp-ocr-exercises]
---

# 本机 AI 与 MCP 写入安全策略

## 决策

- 内置 AI 始终为预览确认制；确认前不得写入。
- 外部 Codex 通过本机 stdio MCP 访问正在运行的 Learning Kit。Bridge 不持有数据库文件权限模型，不直接访问 SQLite。
- 外部直接执行：创建笔记、追加笔记、整理、生成题目、生成闪卡、添加书签。
- 应用内确认：删除、覆盖整篇笔记、批量移动、导入/恢复、修改 API 或安全设置。
- 每个写入操作写入审计日志、受影响对象和操作前快照；撤销只在对象未被之后的人工/AI 操作修改时可用，防止旧撤销覆盖新内容。

## 原因

用户希望 Codex 能真正整理本机资料，但需要避免外部进程绕开应用确认、直接破坏数据库或覆盖后来编辑。
