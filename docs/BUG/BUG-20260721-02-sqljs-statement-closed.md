---
type: BUG
title: sql.js 重复使用 prepared statement 报 Statement closed
created: 2026-07-21
status: fixed
relates: [BIZ-20260721-01-sqljs]
---

# BUG: sql.js 重复使用 prepared statement 报 Statement closed

## 现象
切到 sql.js 后启动应用，主控制台反复打印：
```
Error occurred in handler for 'db:msg:list': Statement closed
Error occurred in handler for 'db:settings:set': NOT NULL constraint failed: settings.value
```

## 复现步骤
1. 用 `stmtCache` 缓存 prepare 出来的 statement
2. 多次 `stmt.step()` / `reset()` 后再 bind

## 期望 / 实际
- 期望：缓存的 prepared statement 可重复使用
- 实际：sql.js 的 statement 在某些 step/reset/free 之后会进入 closed 状态，下次使用报错

## 根因
sql.js 的 `Statement` 不像 better-sqlite3 那样支持高效长生命周期复用；一旦内部资源回收，再调用就 throw。我做了不必要的 cache 优化。

附带 bug: `unwrapParams` 把数组参数塞成 `{1:.., 2:..}` 对象再传，sql.js 期望直接给数组，导致 settings.value 传入变成 undefined → NOT NULL 约束失败。

## 修法
- 删除 `stmtCache`
- `run / all / get` 每次 `d.prepare(sql)` 用完即 `stmt.free()`
- helper 签名直接收 `unknown[]`，不再转对象

## 关联来源
- 关联决策：BIZ-20260721-01-sqljs
- 影响文件：electron/main/ipc-db.ts