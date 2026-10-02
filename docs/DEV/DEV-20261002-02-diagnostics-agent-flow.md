---
type: DEV
title: 诊断采集与确认式 Agent 状态机
created: 2026-10-02
status: impl
relates: [REQ-20261002-01]
---

# 架构与兼容

新增 ai_request_diagnostics、agent_runs 表，仅 CREATE TABLE IF NOT EXISTS；不改现有列。诊断保留最近 200 条；Agent 保留业务操作关联，禁止静默删除待确认记录。新 IPC 同步 handler、preload、env；现有方法不删除、不改返回类型，仅请求及流事件类型增加可选字段，老调用兼容。默认 system prompt、ACTION 格式、CSP、数据路径不改。

纯诊断类使用单调时钟计时，首次内容而非首个 SSE 心跳作为首响应。错误持久化为固定分类，不保存原始消息。usage 只接受非负安全整数；finish_reason 不是网络流终点，继续读取末尾 usage 到 DONE 或 EOF。协议参考：https://developers.openai.com/cookbook/examples/how_to_stream_completions 。自定义接口默认不强制 stream_options，兼容服务商；可独立开启请求 usage。

主进程维护模型阶段及步骤预算，提案批次超过剩余预算时整批拒绝，重试消耗预算且只重新预览；确认始终复用 tool-service 的事务/权限/撤销实现。流程存为 JSON，操作 ID 是已执行结果的事实依据；重启中断模型阶段，不重放网络请求或成功工具。

# 教学

阅读顺序：共享类型 → 诊断类 → SSE usage → 主进程状态机 → Pinia → 状态面板。中文注释解释单调时钟、状态迁移、确认与重试的区别、幂等防护及步骤上限。
