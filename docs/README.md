# 项目文档体系

`docs/` 是 Learning Kit 的开发文档总目录。所有 `.md` 都用英文小写 kebab-case，并遵守下面的命名与用途规范。AI 代理在创建新任务时按这套机制写文档；在阅读代码前，先看 `docs/` 里相关的 REQ/DEV/PROG 了解上下文。

## 目录结构

```
docs/
├── README.md         # 本文件：分类、命名、模板规范
├── REQ/              # 需求文档
├── PROG/             # 进度日志（每天一篇）
├── BUG/              # 缺陷记录
├── BIZ/              # 业务/策略决策
└── DEV/              # 技术方案
```

## 文档类型总览

| 类型 | 用途 | 触发条件 | 何时写 |
|---|---|---|---|
| **REQ** 需求文档 | 新功能或大范围改造 | 任何超过 1 小时的新功能 / 跨多模块改动 | 任务开始前 |
| **PROG** 进度日志 | 每天记录 | 每个开发日 | 当天结束 |
| **BUG** 缺陷记录 | 记录 bug | 发现任何 bug | 立即 |
| **BIZ** 业务决策 | 业务流程或实现策略调整 | 决策一个策略/默认行为/取舍 | 决定时 |
| **DEV** 技术方案 | 复杂模块拆解 | 复杂实施前先写好阶段方案 | 实施前 |

## 命名格式

```
<TYPE>-YYYYMMDD-XX-<kebab-case-short-title>.md
```

- **TYPE**：REQ / PROG / BUG / BIZ / DEV
- **YYYYMMDD**：文档创建日期
- **XX**：当天同类型的两位流水号（01 表示今天第 1 篇此类型）
- **short-title**：kebab-case 短标题，3–6 个词

### 例外
- PROG 一天一文件，没有流水号：`PROG-YYYYMMDD.md`
- 同一天有 PROG 的补充版，用 `PROG-YYYYMMDD-02-amend.md` 等

### 示例
- `REQ-20260721-01-epub-reader.md`
- `PROG-20260721.md`
- `BUG-20260721-01-pdf-text-select-missed.md`
- `BIZ-20260721-01-disable-remote-sync.md`
- `DEV-20260721-01-epub-renderer-pipeline.md`

## 写作模板

每个文档**必带**前置元信息块：

```markdown
---
type: REQ
title: <一句话标题>
created: YYYY-MM-DD
status: draft | in-progress | done | blocked | obsolete
relates: [REQ-..., BUG-...]   # 可选
---
```

### REQ 模板
```markdown
---
type: REQ
title: ...
created: YYYY-MM-DD
status: draft
---

# <标题>

## 背景
为什么需要这个

## 范围
- 包含：
- 不包含：

## 用户故事
作为 ... 我希望 ... 以便 ...

## 验收标准
1. [ ] ...
2. [ ] ...

## 关联
- 上游：(无)
- 下游：DEV-...
```

### PROG 模板（一日一篇，简洁点）
```markdown
---
type: PROG
title: YYYY-MM-DD 进度
created: YYYY-MM-DD
status: done
---

# YYYY-MM-DD 进度

## 完成
- ...

## 遇到的问题
- ...

## 下一步
- ...
```

### BUG 模板
```markdown
---
type: BUG
title: ...
created: YYYY-MM-DD
status: open | fixed | wontfix
relates: [REQ-...]
---

# BUG: <标题>

## 现象
（最小复现）

## 复现步骤
1. ...

## 期望 / 实际
- 期望：
- 实际：

## 根因（修复后填）
-

## 修法
-

## 关联来源
- REQ-...
```

### BIZ 模板
```markdown
---
type: BIZ
title: ...
created: YYYY-MM-DD
status: accepted | superseded
superseds: [BIZ-...]   # 可选
---

# 业务决策: <标题>

## 背景

## 备选方案

| 方案 | 优点 | 缺点 |
|---|---|---|
| A | | |
| B | | |

## 决定
选 X，理由：

## 影响
- 影响：
- 不影响：
```

### DEV 模板
```markdown
---
type: DEV
title: ...
created: YYYY-MM-DD
status: draft | impl | done
relates: [REQ-...]
---

# 技术方案: <标题>

## 目标
对应 REQ-... 的什么验收项

## 范围
模块/文件级覆盖
- electron/main/...
- src/views/...

## 数据 / Schema
新增/改 schema 列、IPC 命名

## 阶段拆解
1. ...
2. ...

## 验证方式
- typecheck
- npm run dev smoke test: ...

## 风险
- ...
```

## 索引

每类文档目录维护一份 `README.md` 索引文件，按时间倒序列出该类型所有 .md 文件。每写一个新文档，**必须**在末尾把文件名补进对应目录的 README。

格式参考：

```markdown
# REQ 目录

| Date | File | Title | Status |
|---|---|---|---|
| 2026-07-21 | REQ-20260721-01-epub-reader.md | EPUB 阅读器接入 | draft |
```

## 状态机

每个文档 `status` 字段如下流转；AI 代理要做对应动作：

| 状态 | 含义 | 下一步允许 |
|---|---|---|
| draft | 起草 | → in-progress / obsolete |
| in-progress | 工作中 | → done / blocked |
| done | 完成 | （终点） |
| blocked | 被卡住 | → in-progress / obsolete |
| obsolete | 失效（被 BIZ 替换、需求变更） | （终点） |
| accepted | BIZ 专用：决定采纳 | → superseded |
| superseded | BIZ 专用：被新 BIZ 替换 | （终点） |
| open | BUG 专用 | → fixed / wontfix |
| fixed / wontfix | BUG 专用 | （终点） |
| impl | DEV 专用：开始实施 | → done |

## 重要约定

- **任何超过 1 小时的新功能**必须先有 REQ，再到 DEV；不写 REQ 就上代码的 PR 直接拒绝
- **PROG 每天必写**：当天结束 AI 代理自动产 PROG-YYYYMMDD.md，并维护一份全局索引 `docs/PROG/README.md`
- **BIZ 的副作用**：BIZ 通过之后，相关 REQ / DEV 的 `relates` 必须更新，避免遗漏
- 文档**只允许新建 + 改状态**，不允许编辑老文档内容。要修订请发新 DEV / BIZ 说明（"superseds"）
- 不允许把 README.md 当成普通笔记堆。它只用来索引
- 请 AI 代理：每次写完一份新文档，输出格式化好的：
  `已创建 docs/TYPE/FILE-NAME.md`，并把文件名插入相同 TYPE 的 README 表格首行