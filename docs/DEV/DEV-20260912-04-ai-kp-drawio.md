---
type: DEV
title: 知识点和 Draw.io 工具映射实施方案
created: 2026-09-12
status: impl
---

# AI KP / Draw.io Implementation Plan

> Inline execution using superpowers:executing-plans. 不提交、不推送，不使用子代理。

**Goal:** 复用工具事务创建知识点与图表，支持预览、保存、编辑和安全撤销。

**Architecture:** learning-artifacts 新增 create_knowledge_point/create_diagram；ai-diagram 使用 saxes 严格解析并校验安全子集。App 映射既有标签；知识库加知识点列表和编辑。既有主进程、preload、env IPC 保持兼容，不改 schema。

**Tech Stack:** Electron、Vue、sql.js；把已安装的纯 JS saxes 6.0.0 声明为生产依赖，不引入 native build。

**Spec:** REQ-20260912-03-ai-kp-drawio.md。

## Tasks

- [ ] tests/ai-flashcard.cjs 增加两个新产物的参数验证、拒绝无实体写入、确认/重建数据库/撤销、修改和关联冲突测试；tests/ai-parser.cjs 覆盖既有 kp/drawio 标签。
- [ ] electron/main/ai-diagram.ts 导出 validateDiagram(xml: string): { nodes: number; edges: number }；限制 200000 字符、1000 cells、32 层，只允许 mxfile/diagram/mxGraphModel/root/mxCell/mxGeometry/mxPoint/Array。验证 id/parent/source/target 引用、坐标和基础结构；拒绝 DTD/PI/非空文本/CDATA、远程链接/图片、富 HTML 值。XML 原样保存，不执行。
- [ ] learning-artifacts.ts 对两个动作校验/预览/插入，复用完整行快照。知识点 child、code_snippets 引用或 links 阻止撤销；修改图表 XML 后阻止撤销。所有来源均须确认。
- [ ] App.vue / env.d.ts 扩展 action 联合类型和映射；AiToolCenter 显示中文名称和可滚动保留换行的预览；KnowledgeView 新增知识点页签、描述和编辑对话框，复用 kpList/kpUpsert。
- [ ] 增加 REQ/BIZ/DEV/PROG 索引，运行 npm test、typecheck、build、临时资料 Electron 测试。Draw.io 本机资源缺失时如实说明，不能声称图形编辑手测通过。

```js
assert.equal(tools.requestInternalTool('create_diagram', { title: '图', xml: '<broken>' }).status, 'failed')
assert.equal(tools.requestInternalTool('create_knowledge_point', { title: '闭包', description: '来源未知' }).status, 'pending_confirmation')
```
