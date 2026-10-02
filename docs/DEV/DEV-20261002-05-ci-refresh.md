---
type: DEV
title: CI 环境统一与隔离 Electron 回归
created: 2026-10-02
status: impl
relates: [BUG-20261002-07-ci-line-endings]
---

## 范围

修复测试提取函数的换行依赖，不修改业务函数、数据库、已发布 IPC、默认 prompt、Electron 入口或 ESM 模式。Node 开发基线升级为 24（`.node-version`），同步 package/lock 的 engines 与 README；不升级 Electron 或添加原生依赖。

## 工作流

- Windows verify 保留 npm ci、类型检查、全部逻辑测试、生产构建。
- 官方 checkout/setup-node/upload-artifact 更新到核验过的 v7 发布提交，使用完整 SHA。
- push/PR/手动触发；同一 PR/ref 取消过期运行；保持 contents:read 和不保存 checkout 凭据。
- verify 后按矩阵运行笔记锚点、AI 工作流、MCP 导入 UI 回归；每个 job 单独构建，失败互不取消。
- UI 失败在关闭窗口前尽力保存截图与脱敏诊断，上传仅 `test-results/ui/`，不上传资料库、客户端配置或凭据。错误采集超时不能掩盖原始失败。
- AI 测试只用本地模拟 SSE，不配置真实云端 key；保留停止/确认/重启断言。

## 验证边界

本地执行类型检查、逻辑测试、构建和三个生产 UI 测试；开发模式用隔离 profile 验证启动与持久化。云端 workflow 需提交推送后才能验收。本轮不提交/推送，不引入安装包发布；CD 发布策略另行确认。

官方版本依据：https://github.com/actions/checkout/releases/tag/v7.0.1 、https://github.com/actions/setup-node/releases/tag/v7.0.0 、https://github.com/actions/upload-artifact/releases/tag/v7.0.1 。
