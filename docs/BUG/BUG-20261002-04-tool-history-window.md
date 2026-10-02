---
type: BUG
title: 待确认项挤掉工具历史与撤销入口
created: 2026-10-02
status: fixed
relates: [REQ-20261002-02, DEV-20261002-03]
---

优先级 P2。App.refreshToolHistory 对每个来源先读取最新 40 条，再在前端排除 pending_confirmation；AiToolCenter 进一步只展示前 8 条且没有分页入口。

内存 sql.js 复现：确认一条 MCP 笔记操作，再创建 40 条更晚的待确认操作。应用使用的 listOperations({source:'mcp',limit:40}).filter(...) 得到 0 条历史，但数据库实际保留 1 条 applied。执行记录未丢失，却不能通过当前工具中心找到对应撤销入口。

建议：后端先过滤已处理状态再限制/分页，保持已发布 IPC 签名向后兼容；工具中心分开待确认队列和执行历史，提供加载更多/来源与状态筛选。补超过 40 待确认、超过 8 已处理项和同时间戳稳定排序测试。

本次仅复现和记录，未修复。
