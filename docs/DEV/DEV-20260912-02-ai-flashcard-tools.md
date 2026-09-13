---
type: DEV
title: AI 普通闪卡和错题闪卡执行链
created: 2026-09-12
status: impl
relates: [REQ-20260912-01]
---

# AI 普通闪卡和错题闪卡执行链

新增 create_flashcard 动作，保持既有 IPC 和 ACTION 格式，普通 card 不再映射成错题动作。普通闪卡要求 question/answer，错题闪卡必须指向存在且有错误作答记录的 exercise_questions；提案时冻结题面和答案，确认时再次验证来源仍有效。

复用 cards/decks/card_scheduling；新卡采用既有 FSRS 初始化。用户未指定牌组时采用“AI 闪卡”牌组，创建前展示目标。撤销删除未修改且未复习的卡片及调度状态；保留可复用牌组。写入和撤销都复用 tool-service 的事务和 schedulePersist。

测试使用 sql.js 内存数据库加载真实 SCHEMA，覆盖提案无卡片写入、确认创建、重复确认拒绝、重建数据库后恢复操作、撤销及修改/复习冲突。最终运行 npm test、typecheck、build 与 Electron 验证；真实服务商联调单独记录。
