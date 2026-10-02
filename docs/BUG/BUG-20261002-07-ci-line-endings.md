---
type: BUG
title: Windows CI 的工具测试依赖 LF 换行
created: 2026-10-02
status: fixed
relates: [DEV-20261002-05-ci-refresh]
---

## 证据

GitHub run 37002983930（078bfc4）安装和类型检查通过，`tests/tool-service.cjs:43` 提取 `notePostStateMatches` 时返回 null。原正则硬编码 LF；将本地源码仅在内存中改为 CRLF 可复现。业务断言尚未执行，不应跳过此测试。

## 修复与验收

用已有 TypeScript 编译器的语法树提取并执行纯函数，覆盖 LF、CRLF 和多行函数体，保留审批与撤销冲突断言。更新 CI 运行环境；本地结果与云端结果分别记录，不把本地通过描述为 GitHub 绿灯。
