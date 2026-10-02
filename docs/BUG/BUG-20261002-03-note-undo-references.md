---
type: BUG
title: 工具撤销新笔记未保护后续图谱引用
created: 2026-10-02
status: fixed
relates: [REQ-20261002-02, DEV-20261002-03, DEV-20260915-01]
---

优先级 P1。tool-service 的新建笔记撤销分支只校验笔记快照，随后直接 DELETE；未检查 graph_sources、graph_edges 的 note_id，以及 links/笔记锚点等后续引用。

复现使用现有模块和内存 sql.js：requestMcpTool 创建笔记，approveOperation 确认；graphNodeSave 引用笔记原文（不修改笔记）；undoOperation 返回 undone。结果 notes 从 1 降到 0，graph_sources 原始记录仍为 1，graphList 可见来源从 1 降到 0。没有修改用户真实资料。

建议：撤销创建笔记前先检测后续引用，存在则拒绝并给出解除引用提示；追加笔记的恢复也要检查新证据是否会失效。不得自动级联删除用户后来建立的图谱、来源和链接。不改已有 schema 定义，复用现有查询。补图谱来源、关系证据、链接、锚点和子笔记回归；没有引用时仍可撤销。

本次仅复现和记录，未修复。此前测试的“编辑后不可撤销”不能覆盖“未编辑但已被引用”。
