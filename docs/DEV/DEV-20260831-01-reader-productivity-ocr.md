# 电子书效率与离线 OCR 技术方案

## 修复设计

1. 抽取 `matchesShortcut`，要求 Ctrl/Cmd、Shift、Alt 的“需要与实际”完全一致；阅读器读取设置 store。
2. PDF 渲染增加递增 epoch，并在异步边界校验；一次渲染固定 `targetPage`，所有便签读写使用捕获页码。
3. 新便签使用相对书页坐标，旧像素坐标继续兼容。
4. 关联笔记正文写入 `app://book/<id>?page=<page>`，同时调用 `links:relate`。
5. 目录识别先读取 pdf.js 文字层；无文字层时把本地渲染 PNG 经 IPC 交给 Tesseract.js `chi_sim` WASM Worker。模型随 npm 依赖离线提供，图片仅在本机进程间传递。
6. 识别结果解析“标题 + 页码”，支持偏移，预览确认后写入 `chapters`；生成项使用可识别 ID，重建时只替换自动生成目录。
7. 文本目录导入使用纯函数解析器，支持 `**标题**`、`# / ##` 和中英文冒号页码；标题页码继承首个子条目，数据库 `parent_id` 保存层级。
8. `chapter:upsert` 在冲突更新时清除 `deleted_at`，避免软删除目录以相同 ID 重建后退出重开消失。
9. OCR 对伪文字层做目录条目质量评估；不合格时渲染高分辨率灰度增强页面并使用目录友好的单块分割模式。
10. 第一次编辑 PDF 原生目录时解析其 destination 页码并物化为本地 `manual-toc:*` 章节；后续右键增删改、层级调整统一写回 `chapters`。

## 安全与兼容

- OCR IPC 仅接受 PNG data URL，限制 40 MB。
- 每次最多识别 20 页，避免长时间占用 CPU/内存。
- 没有修改现有 IPC 签名；仅新增 `ocrRecognize`。
- `chapters.deleted_at`、`knowledge_points.deleted_at` 和 `sections.content_hash` 仅通过迁移增加，兼容旧库。

## 验证

- `npm run typecheck:web`
- `npm run typecheck:node`
- `npm test`
- `npm run build`
- `node tests/ocr-smoke.mjs <中文图片>`
- 启动 Electron，确认窗口标题为 Learning Kit。
