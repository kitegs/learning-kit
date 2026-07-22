# Learning Kit — AGENTS.md

> 给 AI 代理（和新人）的项目说明书。改这个项目前先读完本文；任何破坏下列"不允许修改"项的 PR 直接拒绝。

---

## 1. 技术栈与主要目录

### 技术栈
- **运行平台**：Windows（暂时）；安卓与跨端不在范围内
- **应用框架**：Electron 32 + electron-vite 2
- **前端**：Vue 3.5 + TypeScript 5 + Pinia 2 + Element Plus 2 + Vite 5
- **编辑器**：Tiptap（@tiptap/vue-3）14 扩展：StarterKit + Underline + Highlight + TaskList + Table + Image + Link + Placeholder
- **Markdown**：marked 14 + highlight.js 11 + DOMPurify 3
- **PDF**：pdfjs-dist 4（TextLayer 实现选文字）
- **EPUB**：epubjs 0.3
- **思维导图**：markmap-lib + markmap-view
- **存储**：sql.js（SQLite WASM）+ 本地文件持久化，位于 `app.getPath('userData')/data/`
- **AI 接口**：OpenAI 兼容协议（DeepSeek / OpenAI / 阿里 DashScope / 自定义 baseUrl），SSE 流式
- **无原生依赖**：故意避开 `better-sqlite3`/`node-gyp`，所以**禁止并入任何需要 native build 的包**

### 主要目录
```
learning-kit/
├── electron/
│   ├── main/                  # 主进程
│   │   ├── index.ts           # 应用入口、IPC 注册
│   │   ├── db.ts               # sql.js 初始化 + 持久化 + schema + migrate
│   │   ├── ipc-db.ts           # 对话/分组/消息 IPC
│   │   ├── ai.ts               # AI 流式请求 + 连接测试
│   │   ├── book.ts             # 图书馆、划线、书签、页面标注 + book:// 协议
│   │   ├── srs.ts              # SRS (SM-2) 复习卡IPC
│   │   ├── notes.ts            # 笔记 + 思维导图 IPC
│   │   └── search.ts           # 全文搜索 IPC
│   └── preload/
│       └── index.ts            # contextBridge 暴露 window.lk.*（~70 方法）
├── src/
│   ├── App.vue                # Dock 布局 + 标签页 + 对话发送 + 快捷键
│   ├── main.ts                # Vue/ElementPlus/Pinia 初始化
│   ├── env.d.ts               # 全局 Window.lk 类型声明
│   ├── styles/global.scss     # 60+ CSS 变量（暗/亮两套）
│   ├── helpers/markdown.ts    # Markdown 渲染管道
│   ├── stores/                # chat.ts（对话+设置+快捷键）、tabs.ts（标签页）、context-menu.ts
│   ├── components/
│   │   ├── BlockEditor.vue    # Tiptap 块编辑器
│   │   ├── Dock.vue           # 三侧 dock（左/右/底）
│   │   ├── TabBar.vue         # 标签页栏
│   │   ├── ContextOverlay.vue # 右键菜单（支持子菜单）
│   │   ├── SearchOverlay.vue  # Ctrl+K 搜索 overlay
│   │   ├── SelectionToolbar.vue # 选区浮动格式化工具栏
│   │   ├── ComposeBar.vue     # 对话输入框
│   │   ├── MessageItem.vue    # 单条消息显示
│   │   ├── MarkdownView.vue   # Markdown 渲染
│   │   └── AnnotationLayer.vue # 思维导图注释层
│   └── views/
│       ├── SidebarView.vue    # 对话树侧栏
│       ├── ChatView.vue       # 对话列表
│       ├── LibraryView.vue    # 图书馆列表
│       ├── PdfReaderView.vue  # PDF 阅读器（文本层+标注+便签+翻页）
│       ├── EpubReaderView.vue # EPUB 阅读器
│       ├── NotesView.vue      # 笔记（textarea + gutter + slash + undo）
│       ├── MindmapView.vue    # 思维导图（md/draw/both + 节点编辑）
│       ├── ReviewView.vue     # SRS 复习 + 统计仪表盘
│       ├── SettingsDialog.vue # 设置（API/模型/主题/快捷键）
│       └── StudyPlanDialog.vue# 学习方案生成
├── resources/promt/system.txt # 默认 system prompt（含 [[ACTION:...]] 指令格式）
├── docs/                      # 项目文档
├── run-dev.bat                # 一键启动脚本
├── electron.vite.config.ts
├── tsconfig.{json,node,web}.json
└── package.json
```

---

## 2. 构建、测试、格式化命令

| 目的 | 命令 |
|---|---|
| 安装依赖 | `npm install --no-audit --no-fund` |
| **启动开发**（热重载） | `npm run dev` |
| 检查类型（渲染） | `npm run typecheck:web` |
| 检查类型（主进程+preload） | `npm run typecheck:node` |
| 全量类型检查 | `npm run typecheck` |
| 生产构建 | `npm run build` |
| 启动构建后的产物 | `npm run preview` 或 `npm start` |

> 当前未配置 lint/format；新增 prettier/eslint 前请发 BIZ-XXX-*.md。

项目暂无自动化测试。新功能要**手动 smoke-test 一次**才能写 DEV 完成。

---

## 3. 团队代码约定

### 通用
- **TypeScript strict 风格**：禁止 `any` 在非业务代码处；新加 IPC/handler 走类型签名；渲染层严禁 `require`，主进程严禁触 DOM。
- **优先复用**：先 grep 已有 IPC/stores/views/components，再考虑新增。
- **不写未使用的变量/导入**：会卡 `npm run typecheck`（TS6133）。
- **IPC 命名**：`db:` / `book:` / `card:` / `srs:` / `notes:` / `mindmap:` / `ai:` / `book:ann:` 等域前缀，动词在后（`db:conv:upsert`）。暴露给渲染层的 API 必须同步在 `src/env.d.ts` 的 `window.lk` 类型里加声明。
- **新 IPC 的三大同步**：创建 handler → preload 暴露 → env.d.ts 加类型。缺一不可。
- **数据库写入必须节流持久化**：所有写 IPC 末尾调用 `schedulePersist()`，禁止在热路径同步 `persist()`。
- **状态读取**：渲染层用 Pinia store（`useChatStore`/`useSettingsStore`/`useTabStore`），不要直接 `window.lk.*` 在组件里读，除非是单次 onMounted 拉取。
- **CSS**：用 scoped SCSS；全局样式在 `styles/global.scss`；主题 token 用 CSS 变量（`--bg`/`--accent`/`--bg-elev` 等）。
- **安全默认**：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: false`（sql.js 走 fetch）。
- **CSP**：新增外部 CDN 必须先在 `src/index.html` 的 CSP 加白名单，理由写到对应 DEV 文档。

### 布局体系
- 页面主体由 `Dock.vue` 用 CSS Grid 包裹（3 列：48px dock-left | 1fr center | 32px dock-right + 26px bottom bar）
- 内容模块通过 Dock slot 渲染到 `.dock-center`
- 各视图根元素必须设 `flex: 1; min-width: 0; min-height: 0; overflow: hidden;` 以免撑破 flex 容器

### 数据库 schema 演进
- schema 在 `electron/main/db.ts` 的 `SCHEMA` 常量里，一次性 `db.exec()` 全部跑；新表只允许 `CREATE TABLE IF NOT EXISTS`。
- 加字段要在 `migrate()` 函数里用 `ALTER TABLE ADD COLUMN` 兼容老库，并在 SCHEMA 里同步更新。
- 禁止改已有列的类型/约束，只能新增。破坏兼容需发 BIZ-XXX。

### 流式 AI 响应式陷阱
- `onSend` 创建的 assistantMsg 是普通对象，push 进 `chat.activeMessages`（ref 数组）后，**必须从数组中取出 proxy 引用**（`rMsg = chat.activeMessages[last]`），回调里所有修改都得走 `rMsg` 才能触发视图更新。
- 详见 git commit `75433ed`。

### Pseudo-Tool-Calling
- AI 回复中的 `[[ACTION:type|param1|param2]]` 标签在流结束后自动解析执行。
- 当前支持：`note`、`card`、`mindmap`、`bookmark`。
- 新 action 类型必须在 `src/App.vue` 的 `executeActions()` 函数里加 handler。

### 提交
- 永远不要在没说明的情况下 push/commit。先确认 `git status`。
- 提交信息：英文小写动词开头，附简短说明；例：`fix: streaming display - use reactive proxy from array instead of raw object ref`。

---

## 4. 不允许修改的范围

以下文件/目录改一字符就要在 DEV/REQ 里说理由：

| 行为 | 禁令 |
|---|---|
| **`electron/main/db.ts` 的 `SCHEMA` 已有表的列定义** | 改字段会丢用户数据；演化先发 BIZ-XXX + 写迁移脚本 |
| **`app.getPath('userData')/data/` 下的任何文件** | 用户实际数据；只允许经 IPC 读写 |
| **`src/env.d.ts` 中已发布 IPC 的现有签名** | 改签名会让既有前端崩溃；只允许新增 |
| **`electron/preload/index.ts` 暴露过的 `window.lk.*` 现有方法** | 同上，向后兼容只增不减 |
| **`bundle` 出口、`main` 字段、ESM `"type": "module"`** | 一改 vite/electron 启动全崩 |
| **`.npmrc` 中移除 sql.js / 不要并回 `better-sqlite3`** | 引入 native 包会拖垮 Windows 装机 |
| **CSP 削弱策略** | 安全红线 |
| **默认 system prompt `resources/promt/system.txt`** | 改了要先发 BIZ 留痕 |
| **`[[ACTION:...]]` 指令格式** | 前后端都依赖此格式解析，改格式要同步更新 App.vue 的 `parseActions` |

如要加新 IPC / 新 schema 表 / 新 store / 新 action type，**允许且鼓励**——但必须同步更新 `src/env.d.ts` 的类型声明，并在对应 PROG 里说明。

---

## 5. 完成任务后的验证要求

> 没有跑完下列任一项，不允许声称"完成"。

### 必须
1. **类型检查全绿**
   - `npm run typecheck:web` — 0 errors
   - `npm run typecheck:node` — 0 errors
   - 禁止 `// @ts-ignore` 兜底通过

2. **构建通过**
   - `npm run build` — 无 vite 报错

3. **smoke test（手测）**
   - 启动 `npm run dev`，窗口标题为 `Learning Kit`，控制台**无 `Error occurred` / `Cannot read` / `Unhandled` / `Wrong API` 之类**
   - 触发你新改的功能 1 次
   - 触发了写 IPC 的：操作前后断开/重连不报错

4. **数据持久化验证**
   - 关闭窗口、再次打开后，改动产生的数据仍在

### 必须（涉及 AI / 流式）
- 设置面板填真实 DeepSeek 或 OpenAI API key 后，能收到一个流式返回；中途按"停止"能干净终止
- AI 系统提示词仍加载：用户给的 `promt/system.txt`（项目根目录）若存在则覆盖 `resources/promt/system.txt`
- 连接测试按钮（Settings → Test Connection）能显示 OK/FAIL

### 严禁
- 用"它在我机器上能跑"、"用户可以自己设置一下绕过"来糊弄任务完成
- 删 `.tsbuildinfo` 跑过 typecheck

---

## 6. 文档体系约定（docs/ 目录）

每个 `.md` 文件必须遵守下面命名格式与用途；新文档创建后**把文件名加进对应 `docs/<TYPE>/README.md` 索引**。

| 类型 | 命名 | 用途 |
|---|---|---|
| **REQ** 需求文档 | `REQ-YYYYMMDD-XX-*.md` | 新功能或大范围改造前必写 |
| **PROG** 进度日志 | `PROG-YYYYMMDD.md` | 每天一日志，记录完成/问题/下一步 |
| **BUG** 缺陷记录 | `BUG-YYYYMMDD-XX-*.md` | 发现 bug 立即记录 |
| **BIZ** 业务决策 | `BIZ-YYYYMMDD-XX-*.md` | 业务流程或实现策略的确认和调整 |
| **DEV** 技术方案 | `DEV-YYYYMMDD-XX-*.md` | 复杂模块拆解、阶段实施方案 |

- `XX` 为当天同类型流水号（01、02…）
- `*` 用 kebab-case 短标题：例 `DEV-20260722-01-phase2-4-features.md`
- 详见 `docs/README.md` 模板

## 7. 预设快捷键一览

在设置面板可修改：

| 功能 | 默认键 |
|---|---|
| 搜索 | Ctrl+K |
| 新对话 | Ctrl+N |
| 新笔记（空白） | Ctrl+Shift+N |
| 切换主题 | Ctrl+L |
| 发送消息 | Ctrl+Enter |
| 保存笔记 | Ctrl+S |
| 翻页（左/上） | ArrowLeft / ArrowUp |
| 翻页（右/下） | ArrowRight / ArrowDown |
| 首页/末页 | Home / End |
| 页面居中 | Ctrl+0 |
| 加书签 | Ctrl+D |
| 全屏 | F11 |
| 撤销/重做 | Ctrl+Z / Ctrl+Shift+Z |
| 删除选中 | Delete |
| 取消/关闭 | Escape |
| 新建标签页 | Ctrl+T |
| 关闭标签页 | Ctrl+W |
