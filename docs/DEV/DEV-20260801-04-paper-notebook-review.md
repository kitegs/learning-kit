# 纸质笔记与复习数据技术方案

- 新笔记使用 `<!-- lk:notebook:v1 -->` 加 JSON 页面数据保存左右页富文本和画笔图层，不新增 schema；旧 Markdown 在首次打开时转换为左页富文本，仍可通过兼容入口编辑。
- 手写及图片以 data URL 嵌入 Markdown，使笔记在现有 notes 表中持久化、导出后仍可显示。
- 引用使用 `app://note|book|conv`，由 App 统一解析；电子书页码经 query 传给 PDF/EPUB 阅读器。
- 复习导入导出通过主进程文件选择器完成，导入使用主键 upsert，写入后调用 `schedulePersist()`。
