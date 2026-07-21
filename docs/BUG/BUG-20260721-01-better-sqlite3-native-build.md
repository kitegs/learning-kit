---
type: BUG
title: better-sqlite3 native build 在 Windows 全部失败
created: 2026-07-21
status: wontfix
relates: [REQ-20260721-01-mvp]
---

# BUG: better-sqlite3 native build 在 Windows 全部失败

## 现象
`npm install` 时 `better-sqlite3` 的 install 步骤反复报错、整包回滚。

## 复现步骤
1. `npm install --no-audit --no-fund`
2. 卡在 `prebuild-install || node-gyp rebuild --release`

## 期望 / 实际
- 期望：包安装成功
- 实际：MSBuild 失败 exit code 1

## 根因
1. 先报 `MSB8020: 无法找到 ClangCL 的生成工具` —— better-sqlite3@11 的 sqlite 定位子项目要求 Clang 平台工具集
2. 用户装 Clang 后又报 `MSB6006: llvm-lib.exe 中退出代码 1`，疑似 vcpkg 注入 LIB 路径冲突
3. 走 npmmirror 镜像预构建二进制也失败（仍回退去本地编译）
4. 降到 better-sqlite3@9.x 也不行，prebuild 仍回退编译

## 修法
**不修**。直接换为 `sql.js`（WASM），见 BIZ-20260721-01-sqljs。

## 关联来源
- REQ-20260721-01-mvp
- 决策依据：BIZ-20260721-01-sqljs