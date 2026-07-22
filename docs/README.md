# 项目文档体系

`docs/` 是 Learning Kit 的开发文档总目录。所有 `.md` 都用英文小写 kebab-case，并遵守下面的命名与用途规范。

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

| 类型 | 用途 | 触发条件 |
|---|---|---|
| **REQ** 需求文档 | 新功能或大范围改造 | 任何超过 1 小时的新功能 |
| **PROG** 进度日志 | 每天记录 | 每个开发日结束 |
| **BUG** 缺陷记录 | 记录 bug | 发现任何 bug |
| **BIZ** 业务决策 | 业务流程或实现策略调整 | 决定一个策略/默认行为/取舍 |
| **DEV** 技术方案 | 复杂模块拆解 | 复杂实施前 |

## 命名格式

```
<TYPE>-YYYYMMDD-XX-<kebab-case-short-title>.md
```

### 例外
- PROG 一天一文件，无流水号：`PROG-YYYYMMDD.md`
- 同一天有补充版用 `PROG-YYYYMMDD-02-amend.md`

### 示例
- `REQ-20260721-01-mvp.md`
- `PROG-20260721-03-amend.md`
- `BUG-20260721-01-better-sqlite3-native-build.md`
- `BIZ-20260721-01-sqljs.md`
- `DEV-20260721-01-architecture.md`

## 写作模板

每个文档**必带**前置元信息块：

```markdown
---
type: REQ/PROG/BUG/BIZ/DEV
title: <一句话标题>
created: YYYY-MM-DD
status: draft | in-progress | done | blocked | obsolete | fixed | wontfix | accepted | superseded | open | impl
relates: [相关文档编号]
---
```

## 状态机

| 状态 | 用途 | 下一步允许 |
|---|---|---|
| draft | 起草中 | → in-progress / obsolete |
| in-progress | 工作中 | → done / blocked |
| done / fixed / accepted | 完成 | （终点） |
| blocked | 被卡住 | → in-progress / obsolete |
| obsolete / superseded / wontfix | 失效/拒绝 | （终点） |
| open | BUG 专用 | → fixed / wontfix |
| impl | DEV 专用：开始实施 | → done |

## 重要约定

- **任何超过 1 小时的新功能**必须先有 REQ，再到 DEV；不写 REQ 就上代码的 PR 直接拒绝
- **PROG 每天必写**：当天结束 AI 代理自动产 PROG-YYYYMMDD.md，并维护全局索引
- 文档**只允许新建 + 改状态**，不允许编辑老文档内容。要修订请发新 DEV / BIZ 说明
- 每个新文档必须在对应 TYPE 的 README.md 索引表格中添加一行
