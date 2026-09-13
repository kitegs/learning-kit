---
type: BIZ
title: AI 知识点来源与图表安全范围
created: 2026-09-12
status: accepted
---

沿用既有 kp/drawio 标签，不修改默认 system prompt。知识点默认未学习，AI 掌握建议仅存为描述；没有可靠 ID 不自动创建/关联书籍和章节。图表使用纯 JS saxes（现有间接开发依赖转直接生产依赖）校验有限 XML 子集；第一版不支持压缩图、外部图片及 HTML 标签，以免模型输出触发外部资源加载。复用已发布 IPC，只增加 ToolAction 类型枚举；不改方法签名或数据库列。
