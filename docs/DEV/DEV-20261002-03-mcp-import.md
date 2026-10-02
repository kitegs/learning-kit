---
type: DEV
title: 标准 MCP 桥接与确认导入实现
created: 2026-10-02
status: impl
relates: [REQ-20261002-02, BIZ-20261002-01]
---

调用路径：外部 MCP 客户端 → stdio SDK Server → 有鉴权的 JSON-line named pipe → Electron 导入服务 → 已有 tool-service → 用户工具中心确认 → sql.js。

`mcp/server.ts` 独立 Node 20+ 入口，stdout 仅写 MCP 协议，诊断用 stderr。独立 tsconfig 输出，不改变 Electron 的 main/type/bundle 入口。官方 SDK 文档：https://github.com/modelcontextprotocol/typescript-sdk 。

主进程重复校验输入，限制单笔长度、报文大小、连接数量、超时和待确认队列；使用 `mcp_import_requests` 新表存 requestKey、内容哈希、operationId。提案和防重记录同事务提交；重试返回当前操作状态，不将 pending 冒充 applied。仅允许查询 MCP 来源的操作。知识点复用现有 `create_knowledge_point` 工具，不自动建立图谱关系。

新增 MCP status/configure/client-config IPC，preload/env 同步新增。新增 Pinia store 承载服务状态，设置页提供开关与配置。工具中心合并 internal-ai/mcp，标明来源，导入笔记预览包含全文；不将外部文本视作指令执行。

受保护文件变更理由：db.ts 仅增 CREATE TABLE IF NOT EXISTS；preload/env 仅增方法；其余已有 API、默认 prompt、CSP 不变。真实模型流式调用和人工 smoke 未验证前保持 impl，不声称全部验收完成。
