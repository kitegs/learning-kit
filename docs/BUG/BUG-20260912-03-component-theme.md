---
type: BUG
title: Element Plus 控件未跟随应用主题
created: 2026-09-12
status: fixed
---

# 现象与根因

真实 Electron 截图中纸张主题下按钮、开关仍是默认蓝色，弹窗为纯白。global.scss 在 html 上映射 Element Plus 变量，优先级低于组件库的 :root。改为 html[data-theme]，同步 primary 派生色、表面色、禁用态与蒙层，保持既有五种主题。

重新构建并查看截图，纸张主题按钮和开关已使用绿色，弹窗使用暖白表面。首张设置截图还抓到打开动画中间帧；截图脚本加入 document.fonts.ready、有限动画结束和双 requestAnimationFrame 等待，重拍后无透叠。未修改图像文件来伪造效果。
