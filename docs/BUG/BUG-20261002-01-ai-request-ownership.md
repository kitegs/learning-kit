---
type: BUG
title: AI 请求未隔离窗口归属
created: 2026-10-02
status: fixed
---

# 复现

tests/ai-runtime.cjs 新增 owner=1 的请求，owner=2 调用相同 ID 的 abort。预期 owner=1 信号未取消，实际 aborted=true，断言失败。

原因：__aiReq 全局 Map 仅以 requestId 为键。重名请求会替换控制器，abort 不校验发起窗口，finally 无条件 delete。

处理：按窗口分组、拒绝活跃 ID 重复、身份匹配后释放；窗口销毁取消请求。既有 IPC 不改签名，所有调用者保持兼容。

# 验证结果

修改前跨窗口取消回归断言失败，修改后通过。纯模块与运行时测试覆盖请求归属、重复 ID、取消后占用、迟到清理和渲染进程销毁；隔离 Electron 的生产及开发模式模拟 SSE 测试通过。类型检查、全量测试与构建通过。此缺陷已修复；真实云端及人工 smoke 验收仍待进行，不据此宣称整条 AI 链路完成验收。
