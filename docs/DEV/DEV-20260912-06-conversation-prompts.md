---
type: DEV
title: 对话级提示词实施计划
created: 2026-09-12
status: impl
---

# Conversation Prompt Implementation Plan

> Inline execution using superpowers:executing-plans. No commit/push.

**Goal:** 不同对话独立使用 Prompt，兼容旧数据。

**Architecture:** 复用 settings，key 为 conversationPrompt.<conversationId>，JSON {mode,text}。electron/shared/conversation-prompt.ts 统一验证及优先级；chat store 经已有 IPC 读写；主进程按可选 conversationId 读取本次配置。主聊天发送显式传捕获的对话 ID，避免异步切换串用。

**Tech Stack:** TypeScript、Vue、Pinia、sql.js，零新依赖/表/IPC。

**Spec:** REQ-20260912-05-conversation-prompts.md。

- [ ] shared 模块提供 parseConversationPrompt(raw)、resolveConversationPrompt(config, globalPrompt)、conversationPromptKey(id)，允许 inherit/custom/none；custom 非空且最大 20000 字符。损坏配置明确报错，不悄悄换指令。
- [ ] chat store 增加 loadConversationPrompt(id)/saveConversationPrompt(id,value)；dialog 独立草稿、保存后才生效，捕获目标 ID，切换对话关闭。模板仅填入草稿。
- [ ] ai.ts 在 try 内按 ID 解析持久化配置，替换全局自定义部分，始终保留文件系统规则；preload/env 只加可选 conversationId 字段。笔记和统计调用保持不传此字段。
- [ ] 主聊天顶栏增加“对话 Prompt”按钮与模式标识，流式期间禁改（在途请求不改变）。测试两个对话隔离、继承、none、JSON 错误、模板、取消和重启。
- [ ] npm test/typecheck/build + 临时 Electron UI；真实云端与 dev 人工 smoke 单独标注未验收。

```js
assert.equal(resolveConversationPrompt({mode:'custom',text:'代码审查'}, '全局'), '代码审查')
assert.equal(resolveConversationPrompt({mode:'none',text:''}, '全局'), undefined)
```
