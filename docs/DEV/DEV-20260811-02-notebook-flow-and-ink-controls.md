# DEV-20260811-02 笔记排版流与画笔控制

`OpenNotebookEditor` 继续保留 JSON 笔记格式和旧的 `layout` 字段。分页从字符容量改为测量 contenteditable 的实际 `scrollHeight`：优先按完整 HTML 块（段落、表格、列表）移动，单个过长文本块再按文字边界拆分。这样字体、行距、图片和表格都会参与分页。

粘贴入口截获剪贴板内容：保留并净化常见富文本表格、列表和图片；纯文本按段落插入，识别 LaTex 分隔公式和简单等式并用 KaTeX 渲染。画笔选项作为可选 `ink` 字段序列化，老数据使用默认值。

缩放事件只在 Ctrl/Command 修饰时 preventDefault 并调整画布缩放；普通滚轮交给原生页面行为。
