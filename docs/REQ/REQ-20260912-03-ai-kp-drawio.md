---
type: REQ
title: AI 知识点与 Draw.io 提案
created: 2026-09-12
status: in progress
---

# 范围

用户要求把 AI 输出转成知识库条目或可编辑图表，经预览、确认后保存。沿用 AI 工具总开关、工具中心确认/拒绝/撤销；不自动覆盖既有条目。

知识点沿用 <kp>标题|书籍|章节|掌握建议</kp>，创建独立 knowledge_points 条目，原始来源及掌握建议放描述，默认掌握程度 unseen，避免把 AI 推测当成真实掌握进度。未明确 ID 的来源不自动关联。知识库增加可查看和编辑知识点的入口。

Draw.io 沿用 <drawio> XML </drawio>，第一版接受未压缩 mxGraphModel 或单页 mxfile，拒绝外部资源、HTML 标签内容、DTD、处理指令、畸形 XML 和超量图。预览显示完整 XML 及节点/连线数，确认后保存到 diagrams，由既有图表页面编辑。不是执行 XML 代码。

验收覆盖提案不写实体、确认/拒绝、重启恢复、编辑后拒绝撤销及恶意 XML 拒绝。真实模型联调与人工 smoke 未运行时明确保留未验收状态。
