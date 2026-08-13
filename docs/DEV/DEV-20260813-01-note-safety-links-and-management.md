# DEV-20260813-01 笔记安全、位置链接与管理效率

状态：已完成

修正 preload 的 `IpcResult` 解包函数，使 `notes:upsert` 等包装 IPC 返回真实 `data`。笔记保存使用带 ID 和编辑 revision 的快照串行执行，只有当前 revision 保存成功才清除 dirty；检测到空 `pages` 时阻止覆盖，并在打开笔记时查询 `note_versions` 恢复最近有效正文。

纸质编辑器至少持有一个双页，版式增加持久化 `pageWidth`。位置链接通过 `content_blocks` 保存 `notebook-anchor`（spread + DOM anchor id），目标页插入轻量锚点；App 已有 `app://block/:id` 路由负责跨笔记打开并定位。

快捷键继续复用 Settings store，不增加 IPC。护眼主题对话树取消固定灰色，统一使用主题文字 token。

应用关闭改为主进程与渲染进程握手：主进程发送 `app:before-close`，笔记视图把当前保存队列注册到 `waitUntil`，全部结束后调用新增的 `app:close-ready`，主进程同步落盘再关闭窗口。保留 2.5 秒异常兜底，避免渲染层崩溃时窗口无法退出。新增 IPC 仅追加 preload 与 `env.d.ts` 声明，没有修改既有接口。

验证结果：`npm run typecheck`、`npm test`（22 项）、`npm run build` 和 `git diff --check` 均通过。
