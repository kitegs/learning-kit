# DEV-20260811-01 电子书返回与文本标记修复

图书馆首页与阅读器路由分离：关闭当前电子书标签或主动返回书架时清除 `openBookId` 并激活 library 标签；最后一个 ebook 标签替换为 library 标签。

PDF 新增 `highlights.rects_json`，保留旧单矩形列兼容。保存 Range 的全部 ClientRect；高亮层独立于手绘批注层，以 multiply 混合渲染。EPUB 使用 epub.js rendition annotations API 根据已存 CFI 恢复/删除正文高亮。
