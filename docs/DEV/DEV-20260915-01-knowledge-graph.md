---
type: DEV
title: 知识图谱实施方案
created: 2026-09-15
status: impl
---

# 实施

1. shared/knowledge-graph.ts 定义 IPC 数据与严格 JSON 校验。主进程 knowledge-graph.ts 管理节点、关系、来源、预览令牌与事务确认。
2. db.ts SCHEMA 只增加 graph_edges / graph_sources，不修改已有列；既有备份是整库导出，新表随库备份。通过 CREATE TABLE IF NOT EXISTS 兼容旧库。
3. 新增 graph:* handler、preload 方法、env 类型；旧 API 不变。写入 schedulePersist；事务失败回滚。
4. Pinia knowledge-graph store 封装读取/编辑/提取；KnowledgeGraph.vue 使用本地 SVG，无 CDN。模型输出不作为 HTML。提取期间可停止，离开视图取消请求。
5. 提案包含来源内容指纹；预览后确认时复核来源及图谱版本，避免覆盖并发修改。同名唯一知识点复用；歧义拒绝，重复关系去重。
6. 主聊天 retrieveGraph 可选字段和 settings 默认关闭开关；一跳来源笔记摘录按现有预算选取，路径作为数据而非指令。
7. 测试 sql.js 实库规则与事务、UI 手动编辑/提取预览/确认/重启、检索及关闭开关。保留云端未验收边界。

此次修改 preload/env 仅新增方法、可选字段；不修改默认 system prompt 或旧 ACTION 格式。图谱使用专用预览确认入口，并非新增自动执行 ACTION。
