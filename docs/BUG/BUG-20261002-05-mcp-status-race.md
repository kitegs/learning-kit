---
type: BUG
title: MCP 状态旧响应覆盖新状态
created: 2026-10-02
status: fixed
relates: [REQ-20261002-02, DEV-20261002-03]
---

优先级 P2。useMcpStore.refresh/configure 直接替换 status；App 的 mcp:changed 监听也直接赋值，没有请求序号或统一事件接收入口。工具中心列表的并发刷新同样没有快照失效保护。

复现加载真实 store，经模拟 IPC 控制响应顺序：先开始旧 refresh（running=true），再开始新 refresh（running=false）；新响应先到、旧响应后到，最终显示 running=true。后台权限检查不受影响，不会因此绕过人工确认，但界面可能显示错误服务开关、数量和待确认项。

建议复用 ai-workflow store 已有的 sequence/capture 模式：读取加序号，事件/配置变更失效旧读取；将工具中心状态抽到单一 Pinia store，合并导入通知触发的重复刷新。不要为此取消主进程校验。补刷新乱序、事件与请求交错、关闭/轮换中途读取的测试。

本次仅复现和记录，未修复。
