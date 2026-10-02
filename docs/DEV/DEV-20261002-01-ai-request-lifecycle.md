---
type: DEV
title: 教学第一步：AI 请求归属与取消
created: 2026-10-02
status: impl
---

# 问题与目标

主进程当前以全局 requestId 管理 AbortController，缺少窗口归属。跨窗口同名 ID 可互相覆盖/取消，旧请求 finally 也可能删除新请求记录。

提取纯 TypeScript AiRequestRegistry，按 WebContents.id 和 requestId 分组。同一窗口正在处理的 ID 不允许复用；abort 只发出取消信号，finally 按控制器身份释放记录。窗口销毁取消其全部请求。IPC 现有方法及返回类型不变。

# 教学切片

先看 failing test 的输入、预期和实际结果；再读 begin / abort / release 三个动作；最后讨论 why finally、why identity check、why per-window ownership。这个模块没有模型依赖和数据库写入。

练习留给用户：为超时或首次内容到达补充独立测试，并解释取消请求与 UI 隐藏结果为何是两回事。后续请求诊断、Python Agent、Java 后端按独立教学阶段推进。

用户选择由代理实现升级、用户跟着逐段理解。本轮在请求管理模块与 IPC 接入处加入中文设计注释，重点说明两层索引、取消不等于结束、控制器身份检查、finally 清理以及窗口销毁后的回调保护；不进行全仓逐行注释。

# 验证

运行时复现跨窗口取消；纯模块验证同名 ID、重复请求、旧 cleanup、窗口销毁与资源释放；再跑类型检查、回归、构建和隔离 Electron 模拟 SSE。真实云端和人工 dev smoke 尚未验收。
