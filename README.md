# Learning Kit

一个本地优先的 AI 学习工作台，将笔记、电子书、对话、OCR、闪卡和复习整理在同一个 Windows 桌面应用中。

> 当前状态：`0.1.0` 预发布版本。项目正在进行产品收敛，建议重要资料保留独立备份，不要把它作为唯一副本。

## 主要能力

- 护眼双页笔记：文本、公式、表格、图片、画笔、目录和位置链接。
- PDF / EPUB 阅读：目录、页码跳转、书签、划线、批注、便签和关联笔记。
- AI 对话：流式回答、对话轮次折叠、层级整理和本地测试模式。
- 知识管理：全局搜索、标签、内容块、双向链接和历史版本。
- 学习复习：闪卡、间隔重复、来源回链和学习统计。
- AI 工具：对笔记、图书和复习数据执行带预览、确认与撤销的本地操作。

离线 OCR、习题集和标准 MCP Server 仍在开发中，当前相关入口属于实验功能。

## 技术栈

- Electron 32 + electron-vite 2
- Vue 3 + TypeScript + Pinia + Element Plus
- Tiptap、PDF.js、EPUB.js、KaTeX、Tesseract.js
- sql.js 本地数据库
- OpenAI 兼容 AI 接口

## 本地运行

### 环境要求

- Windows 10 / 11
- Node.js 20 LTS 或更高版本
- npm

### 安装与启动

```powershell
git clone https://github.com/kitegs/learning-kit.git
cd learning-kit
npm ci --no-audit --no-fund
npm run dev
```

当前尚未提供正式安装包，需要从源码运行。

## 验证

```powershell
npm run typecheck
npm test
npm run build
```

笔记锚点 UI 回归测试：

```powershell
npm run test:ui:notebook-anchor
```

## 本地数据与隐私

- 笔记、图书索引、对话和复习数据保存在 Electron `app.getPath('userData')/data/` 下，不写入仓库。
- API Key 在系统支持时通过 Electron `safeStorage` 加密保存。
- AI 请求会发送给用户在设置中选择的服务商；本项目不提供中转服务器。
- 上传日志或提交 Issue 前，请删除 API Key、书籍内容、个人笔记和数据库文件。

## 已知限制

- 目前仅以 Windows 为目标平台。
- 尚无云同步、多人协作、自动更新和正式安装包。
- 笔记分页、PDF 批注、对话折叠等核心流程正在进行稳定性收敛。
- OCR 质量取决于扫描清晰度；高级文字层编辑尚未完成。

产品收敛范围和验收标准见：

- [产品收敛版本需求](docs/REQ/REQ-20260903-01-product-convergence.md)
- [产品收敛实施方案](docs/DEV/DEV-20260903-01-product-convergence.md)

## 开发约定

修改项目前请阅读 [AGENTS.md](AGENTS.md)。项目禁止引入需要 native build 的依赖；新增 IPC 必须同步主进程、preload 和渲染层类型声明。

## License

[MIT](LICENSE)
