# Learning Kit

一个本地优先的 Windows AI 学习工作台，把 **阅读 → 笔记 → AI 辅助整理 → 间隔复习** 串成一个学习流程。

使用 Electron、Vue 3 和 TypeScript 构建；资料在本地管理，云端 AI 按用户配置调用。不同学习需求可以使用不同的对话 Prompt，AI 生成的学习条目经预览、确认后保存。

> 当前状态：`0.1.0` 预发布版本。项目正在进行产品收敛，建议重要资料保留独立备份，不要把它作为唯一副本。

## 界面预览

![Learning Kit 学习工作台](artifacts/ui-polish/workspace.png)

*2026-09-12 界面演示，使用隔离测试资料和预置回答，不代表真实云端模型效果。截图早于对话级 Prompt 按钮加入。*

## 主要能力

- 护眼双页笔记：文本、公式、表格、图片、画笔、目录和位置链接。
- PDF / EPUB 阅读：目录、页码跳转、书签、划线、批注、便签和关联笔记。
- AI 对话：流式回答与中途停止、对话轮次折叠、层级整理和本地测试模式。
- 对话独立 Prompt：继承全局、本对话专属、不追加自定义三种模式；提供可编辑的编程导师、阅读理解、英语陪练和写作润色模板。
- 可控上下文：对话历史、笔记上下文、学习统计和工具提案可开关；支持输入预算、历史裁剪及可选的本地笔记关键词检索。
- 知识管理：全局搜索、标签、内容块、双向链接和历史版本。
- 学习复习：闪卡、间隔重复、来源回链和学习统计。
- AI 工具：将结构化输出映射为笔记、闪卡、知识点、习题集或 Draw.io 图表等提案，经预览、确认后执行；支持的操作可在工具中心撤销。
- 界面设置：分类设置面板、多主题、搜索与工具中心快捷入口。

离线 OCR、习题集与 AI 图表映射仍需持续验证；标准 MCP Server 尚未作为完整能力交付。内部工具中心不等于标准 MCP 服务。

## AI 如何配置

1. 打开“设置”，选择 DeepSeek、OpenAI、阿里 DashScope 或自定义 OpenAI 兼容接口，填写模型与自己的 API Key。
2. 在连接设置中测试连接；需要真实模型回答时，关闭本地测试模式。
3. 在上下文设置中选择允许发送的内容、输入预算，以及是否开启笔记检索。
4. 在“回答偏好”中设置全局自定义 Prompt；也可打开某个对话顶部的“Prompt”按钮，为该对话单独配置。

专属 Prompt 替代全局自定义部分，不替换内置规则；保存后影响后续回答，不清空已有历史。笔记 AI 和复习分析仍使用全局配置。

知识点和图表等 AI 输出不是直接写库的命令：先生成工具提案，再由用户检查并确认。云端调用需要联网，可能产生服务商费用；本地测试模式仅用于体验预置流程。

## 工程实现

- **进程隔离**：渲染层经 preload 的类型化 `window.lk` 接口调用主进程；开启 `contextIsolation`，关闭 `nodeIntegration`。
- **本地持久化**：sql.js（SQLite WASM），写入节流与关闭保存握手，避免引入需要 native build 的数据库包。
- **流式生命周期**：处理分块 SSE、UTF-8 边界、取消和异常，配有回归测试。
- **上下文控制**：保留当前问题与系统规则，在预算内选择历史和检索片段；展示来源与裁剪信息。
- **工具输入校验**：学习条目先校验再生成提案；Draw.io XML 使用受限结构验证，不直接信任模型输出。

检索目前采用关键词匹配，不是向量语义检索；输入预算使用字符启发式估算，不是服务商的精确 token 或计费结果。

## 技术栈

- Electron 32 + electron-vite 2
- Vue 3 + TypeScript + Pinia + Element Plus
- Tiptap、PDF.js、EPUB.js、KaTeX、Tesseract.js
- sql.js 本地数据库
- OpenAI 兼容 AI 接口

## 本地运行

### 环境要求

- Windows 10 / 11
- `package.json` 声明 Node.js >= 20；建议使用 Node.js 24 运行完整开发与测试流程（当前测试依赖包含 jsdom 29）
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

Electron UI 回归（使用隔离临时资料，不使用日常资料库）：

```powershell
npm run test:ui:notebook-anchor
npm run test:ui:database-recovery
npm run test:ui:pdf-reader

# 以下测试需先 npm run build
node tests/ai-settings.e2e.cjs
node tests/conversation-prompt.e2e.cjs
node tests/ui-polish.e2e.cjs
```

验证记录：2026-09-13 类型检查、`npm test` 和生产构建通过；2026-09-12 已运行新增 AI 设置、界面与对话 Prompt 的隔离 Electron 测试。真实云端流式/停止/连接测试与开发模式人工 smoke 尚未完成整体验收。构建仍有 Sass API、Rollup 注释等警告。

## 代码结构

```text
electron/main/       主进程：数据库、AI 请求、检索、工具与文件服务
electron/preload/    window.lk IPC 桥接
electron/shared/     前后端共用的对话 Prompt 校验
src/components/     编辑器、输入框、工具预览等组件
src/views/          聊天、阅读器、笔记、知识库、复习和设置
src/stores/         Pinia 状态管理
tests/              逻辑回归与真实 Electron UI 测试
docs/               需求、技术方案、业务决策和验证记录
```

## 本地数据与隐私

- 笔记、图书索引、对话和复习数据保存在 Electron `app.getPath('userData')/data/` 下，不写入仓库。
- API Key 在系统支持时通过 Electron `safeStorage` 加密保存。
- AI 请求会发送给用户在设置中选择的服务商；本项目不提供中转服务器。
- “本地优先”不等于 AI 全程离线：问题、提示词与启用的历史/上下文/检索片段会随请求发送。请勿把敏感资料加入不可信服务商的请求。
- 上传日志或提交 Issue 前，请删除 API Key、书籍内容、个人笔记和数据库文件。

## 已知限制

- 目前仅以 Windows 为目标平台。
- 尚无云同步、多人协作、自动更新和正式安装包。
- 笔记分页、PDF 批注、对话折叠等核心流程正在进行稳定性收敛。
- OCR 质量取决于扫描清晰度；高级文字层编辑尚未完成。
- AI Draw.io 映射只接受受限、未压缩的 XML 子集，不保证导入任意 Draw.io 文档。
- 自动化测试不等于生产验证；尚未提供真实用户规模或性能收益的量化结论。

产品收敛范围和验收标准见：

- [产品收敛版本需求](docs/REQ/REQ-20260903-01-product-convergence.md)
- [产品收敛实施方案](docs/DEV/DEV-20260903-01-product-convergence.md)

## 开发约定

修改项目前请阅读 [AGENTS.md](AGENTS.md)。项目禁止引入需要 native build 的依赖；新增 IPC 必须同步主进程、preload 和渲染层类型声明。

## License

[MIT](LICENSE)
