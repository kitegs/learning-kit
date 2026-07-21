# Learning Kit — AGENTS.md

> 给 AI 代理（和新人）的项目说明书。改这个项目前先读完本文；任何破坏下列"不允许修改"项的 PR 直接拒绝。

---

## 1. 技术栈与主要目录

### 技术栈
- **运行平台**：Windows（暂时）；安卓与跨端不在范围内
- **应用框架**：Electron 32 + electron-vite 2
- **前端**：Vue 3.5 + TypeScript 5 + Pinia 2 + Element Plus 2 + Vite 5
- **Markdown**：marked 14 + highlight.js 11 + DOMPurify 3
- **PDF**：pdfjs-dist 4
- **思维导图**：markmap-lib + markmap-view
- **存储**：sql.js（SQLite WASM）+ 本地文件持久化，位于 `app.getPath('userData')/data/`
- **AI 接口**：OpenAI 兼容协议（DeepSeek / OpenAI / 阿里,DashScope / 自定义 baseUrl），SSE 流式
- **无原生依赖**：故意避开 `better-sqlite3`/`node-gyp`，所以**禁止并入任何需要 native build 的包**，否则所有 Windows 用户的 CI/启动都会崩

### 主要目录
```
learning-kit/
├── electron/
│   ├── main/                  # 主进程
│   │   ├── index.ts           # 应用入口、IPC 注册
│   │   ├── db.ts               # sql.js 初始化 + 持久化 + schema
│   │   ├── ipc-db.ts           # 对话/分组/消息 IPC
│   │   ├── ai.ts               # AI 流式请求
│   │   ├── book.ts             # 图书馆、划线、书签 + book:// 协议
│   │   ├── srs.ts              # SRS (SM-2) 复习卡 IPC
│   │   └── notes.ts            # 笔记 + 思维导图 IPC
│   └── preload/
│       └── index.ts            # contextBridge 暴露 window.lk.*
├── src/                       # 渲染进程
│   ├── App.vue                # 顶层布局 + 5 模式切换 + 对话发送主流程
│   ├── main.ts                # Vue/ElementPlus/Pinia 初始化
│   ├── env.d.ts               # 全局 Window.lk 类型声明
│   ├── styles/global.scss     # 暗色主题变量
│   ├── helpers/markdown.ts    # Markdown 渲染管道
│   ├── stores/chat.ts         # 对话 store + 设置 store
│   ├── components/            # LeftRail, ComposeBar, MessageItem, MarkdownView
│   └── views/                 # SidebarView, ChatView, LibraryView,
│                              # PdfReaderView, NotesView, MindmapView,
│                              # ReviewView, SettingsDialog, StudyPlanDialog
├── resources/promt/system.txt # 默认 system prompt（用户可在 promt/ 覆盖）
├── docs/                      # 项目文档（REQ/PROG/BUG/BIZ/DEV，见下）
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
- **TypeScript strict 风格**：禁用 `any` 在非业务代码处，新加 IPC/handler 走类型签名；渲染层严禁 `require`，主进程严禁触 DOM。
- **优先复用**：先 grep 已有 IPC/stores/views，再考虑新增；前后重复实现的东西，必须把通用部分抽到 `src/components/`。
- **不写未使用的变量/导入**：会卡 `npm run typecheck`（TS6133）。
- **IPC 命名**：`db:` / `book:` / `card:` / `srs:` / `notes:` / `mindmap:` / `ai:` 等域前缀，动词在后（`db:conv:upsert`）；暴露给渲染层的 API 必须同步在 `src/env.d.ts` 的 `window.lk` 类型里加声明。
- **数据库写入必须节流持久化**：所有写 IPC 末尾调用 `schedulePersist()`，禁止同步 `persist()` 在热路径里。
- **状态读取**：渲染层用 Pinia store（`useChatStore`/`useSettingsStore`），不要直接 `window.lk.*` 在组件里读，除非是单次 onMounted 拉取。
- **CSS**：用 scoped emotion + SCSS，全局样式在 `styles/global.scss`；暗色 token 用 CSS 变量（`--bg`/`--accent` 等）。
- **不要加 emoji / 写在文件里注释，除非用户明确要求**。
- **安全默认**：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: false`（sql.js 走 fetch）。
- **CSP**：新增外部 CDN 必须先在 `src/index.html` 的 CSP 加白名单，理由写到对应 DEV 文档。

### 数据库 schema 演进
- schema 在 `electron/main/db.ts` 的 `SCHEMA` 常量里，一次性 `db.exec()` 全部跑；新表只允许 `CREATE TABLE IF NOT EXISTS`。
- 字段变更不开 ALTER 通道——目前直接重建数据库可以接受（用户数据应在各自的 sqlite/mindmap 表保留；如破坏兼容需发 BIZ-XXX 说明迁移）。

### 提交
- 永远不要在没说明的情况下 push/commit。先确认 `git status`。
- 提交信息：中文小写动词开头，对应一个文档编号；例：`FEAT: 实现 EPUB 阅读器 (DEV-20260721-01-epub-reader)`。

---

## 4. 不允许修改的范围

以下文件/目录改一字符就要在 DEV/REQ 里说理由，否则 PR 自动打回：

| 行为 | 禁令 |
|---|---|
| **`electron/main/db.ts` 的 `SCHEMA` 已有表的列定义** | 改字段会丢用户数据；如要演化请发 BIZ-XXX + 在 `DEV-XXX` 里写迁移脚本 |
| **`app.getPath('userData')/data/` 下的任何文件** | 用户实际数据；只允许经 IPC 读写，不允许开发期手工删 |
| **`src/env.d.ts` 中已发布 IPC 的现有签名** | 改签名会让既有前端崩溃；只允许新增重载或新增 IPC |
| **`electron/preload/index.ts` 暴露过的 `window.lk.*` 现有方法** | 同上，向后兼容只增不减 |
| **`bundle` 出口、`main` 字段、ESM `"type": "module"`** | 一改 vite/electron 启动全崩 |
| **`.npmrc` 中移除 sql.js / 不要并回 `better-sqlite3`** | 引入 native 包会拖垮 Windows 装机 |
| **CSP 削弱策略**：移除 `'unsafe-eval'` 之外的某项，或加入 `https://*` 通配 | 安全红线 |
| **默认 system prompt** `resources/promt/system.txt` | 它是需求里强调的 AI 反幻觉约束，改了要先发 BIZ 留痕 |

如要加新 IPC / 加新 schema 表 / 加新 store，**允许且鼓励**——但必须同步更新 `src/env.d.ts` 的类型声明，并在对应 PROG 里说明。

---

## 5. 完成任务后的验证要求

> 没有跑完下列任一项，不允许声称"完成"。

### 必须
1. **类型检查全绿**
   - `npm run typecheck:web` — 0 errors
   - `npm run typecheck:node` — 0 errors
   - 失败一律按报错行号修，禁止 `// @ts-ignore` 兜底通过

2. **构建通过**
   - `npm run build` — 输出 `out/main`、`out/preload`、`out/renderer`，无 vite 报错

3. **smoke test（手测）**
   - 启动 `npm run dev`，窗口标题为 `Learning Kit`，控制台**无 `Error occurred` / `Cannot read` / `Unhandled` 之类**
   - 触发你新改的功能 1 次
   - 触发了写 IPC 的：操作前后断开/重连不报错

4. **数据持久化验证**
   - 关闭窗口、再次打开后，你的改动产生的数据仍在（settings/groups/notes/cards/highlights 都进 SQLite）

### 必须（涉及 AI / 流式）
- 设置面板填真实 DeepSeek 或 OpenAI API key 后，能收到一个流式返回；中途按"停止"能干净终止
- AI 系统提示词仍加载：用户给的 `promt/system.txt`（项目根目录）若存在则覆盖 `resources/promt/system.txt`

### 建议
- 涉及 IPC 的新签名：在渲染层用一个最小组件调一次（即使你只是临时调试），确认 round-trip 通
- 涉及 PDF 渲染：导入一本真实 PDF、翻页、选段、加划线、点"问 AI"

### 严禁
- 用"它在我机器上能跑"、"用户可以自己设置一下绕过"来糊弄任务完成
- 删 `.tsbuildinfo` 跑过 typecheck

---

## 6. 文档体系约定（docs/ 目录）

每个 `.md` 文件必须遵守下面命名格式与用途；新文档创建后**把文件名加进对应 `docs/<TYPE>/README.md` 索引**。

| 类型 | 命名 | 用途 |
|---|---|---|
| **REQ** 需求文档 | `REQ-YYYYMMDD-XX-*.md` | 新功能或大范围改造前必写，明确范围、验收标准 |
| **PROG** 进度日志 | `PROG-YYYYMMDD.md` | 每天一日志，记录完成了什么、遇到什么问题 |
| **BUG** 缺陷记录 | `BUG-YYYYMMDD-XX-*.md` | 发现 bug 立即记录，关联来源 REQ |
| **BIZ** 业务决策 | `BIZ-YYYYMMDD-XX-*.md` | 业务流程或实现策略的确认和调整 |
| **DEV** 技术方案 | `DEV-YYYYMMDD-XX-*.md` | 复杂模块拆解、阶段实施方案 |

- `XX` 为两位流水号（01、02…）当天同类型第几篇
- `*` 用 kebab-case 短标题：例 `DEV-20260721-01-epub-reader.md`
- 跨任务关联用 `关联: REQ-20260720-01-...` 在文末写
- 详见 `docs/README.md` 模板