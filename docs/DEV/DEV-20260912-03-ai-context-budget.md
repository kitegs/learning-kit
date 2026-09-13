---
type: DEV
title: AI 上下文预算与笔记检索
created: 2026-09-12
status: impl
relates: [REQ-20260912-01]
---

# AI Context Implementation Plan

> Inline execution using superpowers:executing-plans; no commit without authorization.

**Goal:** 限制估算输入量，按需检索未删除笔记，提供来源反馈。

**Architecture:** 主进程统一预算和本地参数化关键词检索；三个调用入口传递可选配置；设置保存与取消保持一致。无新数据库表、无新 IPC，已有请求只新增可选字段，兼容旧调用。

**Tech Stack:** TypeScript / Vue / sql.js，无新增依赖。

**Spec:** 用户本轮“做上下文预算和检索”；沿用 REQ-20260912-01 开关及隐私要求。

## Tasks

- [ ] 新增 electron/main/ai-context.ts，导出 estimateTokens(text)、prepareContext(messages, budget, snippets)。默认输入预算 8192，范围 2048–65536；系统规则与最后用户问题超限时拒绝发送，不静默截断。历史按最近完整轮次选择；资料最多四条，每条最多 1200 字符。估算不是服务商 tokenizer，不保证模型精确限制。
- [ ] 新增 electron/main/ai-retrieval.ts，导出 retrieveNotes(query)。查询仅 notes.deleted_at IS NULL；中文双字词及英文单词，参数化 LIKE 转义通配符，候选最多 80 条、输出最多四条。无命中则不附加资料。不使用 embedding，不声称语义检索。
- [ ] ai.ts 在 fetch 前准备上下文并发送 contextSummary 元信息。资料作为不可信参考，不能覆盖系统规则；预算不包含模型输出，界面提醒预留输出空间。
- [ ] chat store、SettingsDialog 增加 aiInputBudget、aiRetrievalEnabled，默认检索关闭；三个调用点传入预算，只有主对话启用跨笔记检索（其他入口保持其原上下文开关语义）。显示实际发送来源及裁剪计数。不改已发布 IPC 的既有字段。
- [ ] tests/ai-context.cjs 使用真实预算模块与 sql.js 数据库验证超限、轮次、通配符、中文命中和软删除；运行 npm test、typecheck、build、临时资料 Electron 测试。真实云端及手工 dev smoke 未运行不得宣称全验收。

## Test cases

```js
assert.throws(() => prepareContext([{role:'system',content:'中'.repeat(9000)},{role:'user',content:'问'}],2048,[]), /预算/)
assert.ok(result.summary.estimatedTokens <= result.summary.budget)
assert.equal(retrieveNotes('完全不存在的词').length, 0)
```
