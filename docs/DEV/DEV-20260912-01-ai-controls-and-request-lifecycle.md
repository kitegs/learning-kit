---
type: DEV
title: AI 功能开关、提示词与请求生命周期方案
created: 2026-09-12
status: impl
relates: [REQ-20260912-01, BUG-20260912-01, BIZ-20260912-01]
---

# AI 功能开关、提示词与请求生命周期方案

## 配置模型

在 Pinia 设置 store 中新增 `customSystemPrompt`、`customSystemPromptEnabled`、`aiIncludeHistory`、`aiIncludeNoteContext`、`aiIncludeProgressContext` 和 `aiToolProposalsEnabled`。使用现有 settings IPC 持久化，不修改数据库 schema。

## 提示词合并

主进程继续从 `promt/system.txt` 或打包资源读取内置提示词。渲染层只传入可选的 `customSystemPrompt`；主进程在内置提示词后追加带边界标记的用户指令，内置隐私与工具确认规则始终保留。

## 请求类型和生命周期

在 `src/env.d.ts`、preload 与主进程共享相同字段名称：请求参数包含 provider、model、messages、temperature、apiKey、baseUrl 和 customSystemPrompt；流事件包含 delta、content、done、aborted、error。每个调用方保存 requestId、监听清理函数，并在页面离开或组件卸载时同时移除监听和调用 `aiChatAbort`。

## 上下文开关

- 主聊天关闭历史后只发送本轮用户消息。
- 笔记 AI 关闭上下文后只发送用户指令。
- 学习进度关闭统计后不发本地统计，并提示用户需要开启后才能生成个性化分析。
- 工具提案关闭后不解析或创建操作记录。

## 验证

增加静态契约与请求构建测试，覆盖设置持久化字段、提示词传递、上下文开关和取消调用；随后运行 `npm test`、两套 typecheck、build，并启动应用人工检查设置持久化和取消行为。
