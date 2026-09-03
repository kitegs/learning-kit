import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

// Wraps an IPC result — throws if !ok, passes through data otherwise.
// Handles both old-style (direct return) and new-style ({ok,data,error}) responses.
function u<T>(r: any): T {
  if (r && typeof r === 'object' && 'ok' in r && r.ok === false) throw new Error(r.error || 'IPC error')
  if (r && typeof r === 'object' && 'ok' in r && r.ok === true) return r.data as T
  return r as T
}

const api = {
  // app lifecycle
  onAppBeforeClose: (cb: () => void | Promise<void>) => {
    const listener = () => { void cb() }
    ipcRenderer.on('app:before-close', listener)
    return () => ipcRenderer.removeListener('app:before-close', listener)
  },
  appCloseReady: () => ipcRenderer.invoke('app:close-ready'),

  // settings
  getSetting: (key: string) => ipcRenderer.invoke('db:settings:get', key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('db:settings:set', key, value),
  allSettings: () => ipcRenderer.invoke('db:settings:all'),
  ocrRecognize: (imageDataUrl: string) => ipcRenderer.invoke('ocr:recognize', imageDataUrl).then(u),

  // groups
  groupsTree: () => ipcRenderer.invoke('db:groups:tree'),
  groupUpsert: (g) => ipcRenderer.invoke('db:group:upsert', g),
  groupDelete: (id) => ipcRenderer.invoke('db:group:delete', id),

  // conversations
  convList: (groupId) => ipcRenderer.invoke('db:conv:list', groupId),
  convAll: () => ipcRenderer.invoke('db:conv:all'),
  convUpsert: (c) => ipcRenderer.invoke('db:conv:upsert', c).then(u),
  convDelete: (id) => ipcRenderer.invoke('db:conv:delete', id),
  convRename: (id, title) => ipcRenderer.invoke('db:conv:rename', id, title),
  convTouch: (id) => ipcRenderer.invoke('db:conv:touch', id),

  // messages
  msgList: (convId) => ipcRenderer.invoke('db:msg:list', convId),
  msgSave: (m) => ipcRenderer.invoke('db:msg:save', m).then(u),
  msgPatch: (id, patch) => ipcRenderer.invoke('db:msg:patch', id, patch).then(u),
  msgDelete: (id) => ipcRenderer.invoke('db:msg:delete', id),
  turnCollapse: (turnId: string, collapsed: boolean) => ipcRenderer.invoke('db:turn:collapse', turnId, collapsed).then(u),
  turnMove: (args: { turnId: string; targetConversationId: string; afterTurnId?: string | null; targetFoldId?: string | null }) => ipcRenderer.invoke('db:turn:move', args).then(u),
  turnReparent: (args: { turnId: string; targetConversationId: string; parentTurnId?: string | null; foldId?: string | null; position: 'before' | 'inside' | 'after'; referenceTurnId?: string | null }) => ipcRenderer.invoke('db:turn:reparent', args).then(u),
  turnRestore: (turnId: string) => ipcRenderer.invoke('db:turn:restore', turnId).then(u),
  foldList: (conversationId: string) => ipcRenderer.invoke('db:fold:list', conversationId),
  foldCreate: (fold: { conversationId: string; title?: string; tags?: string; sort?: number }) => ipcRenderer.invoke('db:fold:create', fold).then(u),
  foldPatch: (id: string, patch: { title?: string; tags?: string; collapsed?: boolean }) => ipcRenderer.invoke('db:fold:patch', id, patch).then(u),
  foldDelete: (id: string) => ipcRenderer.invoke('db:fold:delete', id).then(u),
  uuid: () => ipcRenderer.invoke('db:uuid'),

  // ai
  aiModels: (provider: string) => ipcRenderer.invoke('ai:models', provider),
  aiSystemPrompt: () => ipcRenderer.invoke('ai:system-prompt'),
  aiChatStart: (args: any) => ipcRenderer.invoke('ai:chat:start', args),
  aiChatAbort: (reqId: string) => ipcRenderer.invoke('ai:chat:abort', reqId),
  aiTest: (args: any) => ipcRenderer.invoke('ai:test', args),
  onAiChunk: (reqId: string, cb: (p: any) => void) => {
    const channel = `ai:chunk:${reqId}`
    const listener = (_e: IpcRendererEvent, payload: any) => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },

  // books
  bookImport: () => ipcRenderer.invoke('book:import'),
  bookList: () => ipcRenderer.invoke('book:list'),
  bookUpdate: (id: string, patch: any) => ipcRenderer.invoke('book:update', id, patch),
  bookDelete: (id: string) => ipcRenderer.invoke('book:delete', id),
  bookUrl: (id: string) => `book://${id}`,
  highlightAdd: (h: any) => ipcRenderer.invoke('book:highlight:add', h),
  highlightList: (bookId: string) => ipcRenderer.invoke('book:highlight:list', bookId),
  highlightUpdate: (id: string, patch: any) => ipcRenderer.invoke('book:highlight:update', id, patch),
  highlightDelete: (id: string) => ipcRenderer.invoke('book:highlight:delete', id),
  bookmarkAdd: (b: any) => ipcRenderer.invoke('book:bookmark:add', b),
  bookmarkList: (bookId: string) => ipcRenderer.invoke('book:bookmark:list', bookId),
  bookmarkDelete: (id: string) => ipcRenderer.invoke('book:bookmark:delete', id),
  bookStat: () => ipcRenderer.invoke('book:stat'),

  annList: (bookId: string, page: number) => ipcRenderer.invoke('book:ann:list', bookId, page),
  annListAll: (bookId: string) => ipcRenderer.invoke('book:ann:listAll', bookId),
  annSave: (a: any) => ipcRenderer.invoke('book:ann:save', a),
  annDelete: (id: string) => ipcRenderer.invoke('book:ann:delete', id),
  annClear: (bookId: string, page: number) => ipcRenderer.invoke('book:ann:clear', bookId, page),

  // notes & mindmaps
  notesList: () => ipcRenderer.invoke('notes:list'),
  notesGet: (id: string) => ipcRenderer.invoke('notes:get', id),
  notesUpsert: (n: any) => ipcRenderer.invoke('notes:upsert', n).then(u),
  notesPatch: (id: string, patch: any) => ipcRenderer.invoke('notes:patch', id, patch).then(u),
  notesCreateFromMessage: (args: { messageId: string; title?: string; tags?: string; parentId?: string | null }) =>
    ipcRenderer.invoke('notes:create-from-message', args).then(u),
  notesDelete: (id: string) => ipcRenderer.invoke('notes:delete', id),
  notesExport: (id: string) => ipcRenderer.invoke('notes:export', id),
  noteVersions: (noteId: string) => ipcRenderer.invoke('notes:versions', noteId),
  noteVersionGet: (id: string) => ipcRenderer.invoke('notes:version:get', id).then(u),
  noteVersionRestore: (id: string) => ipcRenderer.invoke('notes:version:restore', id).then(u),

  blockUpsert: (block: { id?: string; sourceType: string; sourceId: string; blockType?: string; text?: string; anchor?: string; anchorKey?: string; metadata?: string; sourceHash?: string }) => ipcRenderer.invoke('blocks:upsert', block).then(u),
  blockGet: (id: string) => ipcRenderer.invoke('blocks:get', id).then(u),
  blockList: () => ipcRenderer.invoke('blocks:list'),
  blockForSource: (sourceType: string, sourceId: string) => ipcRenderer.invoke('blocks:forSource', sourceType, sourceId),
  blockDelete: (id: string) => ipcRenderer.invoke('blocks:delete', id).then(u),

  attrsGet: (entityType: string, entityId: string) => ipcRenderer.invoke('attrs:get', entityType, entityId),
  attrsSet: (entityType: string, entityId: string, attrs: Record<string, string>) => ipcRenderer.invoke('attrs:set', entityType, entityId, attrs).then(u),
  attrsList: (entityType: string) => ipcRenderer.invoke('attrs:list', entityType),

  toolRunCreate: (run: { conversationId?: string | null; actionType: string; params?: string; preview?: string; rollback?: string }) => ipcRenderer.invoke('ai:tool-run:create', run).then(u),
  toolRunComplete: (id: string, status: 'applied' | 'failed' | 'ignored', result?: string) => ipcRenderer.invoke('ai:tool-run:complete', id, status, result).then(u),
  toolRunList: (conversationId?: string | null) => ipcRenderer.invoke('ai:tool-run:list', conversationId),

  // Confirmed local tool service
  toolPreview: (request: { action: string; params: Record<string, unknown> }) =>
    ipcRenderer.invoke('tool:preview', request).then(u),
  toolExecute: (request: { action: string; params: Record<string, unknown> }) =>
    ipcRenderer.invoke('tool:execute', request).then(u),
  toolProposeInternal: (request: { action: string; params: Record<string, unknown> }) =>
    ipcRenderer.invoke('tool:propose-internal', request).then(u),
  toolApprove: (operationId: string) => ipcRenderer.invoke('tool:approve', operationId).then(u),
  toolReject: (operationId: string) => ipcRenderer.invoke('tool:reject', operationId).then(u),
  toolUndo: (operationId: string) => ipcRenderer.invoke('tool:undo', operationId).then(u),
  toolOperations: (filter?: { source?: 'internal-ai' | 'mcp' | 'renderer'; status?: string; limit?: number }) =>
    ipcRenderer.invoke('tool:operations', filter).then(u),

  backupCreate: () => ipcRenderer.invoke('safety:backup:create'),
  backupRestore: () => ipcRenderer.invoke('safety:backup:restore'),

  mindmapList: () => ipcRenderer.invoke('mindmap:list'),
  mindmapGet: (id: string) => ipcRenderer.invoke('mindmap:get', id),
  mindmapUpsert: (m: any) => ipcRenderer.invoke('mindmap:upsert', m),
  mindmapDelete: (id: string) => ipcRenderer.invoke('mindmap:delete', id),

  // srs
  deckList: () => ipcRenderer.invoke('deck:list'),
  deckUpsert: (d: any) => ipcRenderer.invoke('deck:upsert', d),
  deckDelete: (id: string) => ipcRenderer.invoke('deck:delete', id),
  deckRename: (id: string, t: string) => ipcRenderer.invoke('deck:rename', id, t),
  cardList: (deckId: string) => ipcRenderer.invoke('card:list', deckId),
  cardAll: () => ipcRenderer.invoke('card:all'),
  cardSave: (c: any) => ipcRenderer.invoke('card:save', c),
  cardDelete: (id: string) => ipcRenderer.invoke('card:delete', id),
  cardReset: (id: string) => ipcRenderer.invoke('card:reset', id),
  srsDue: () => ipcRenderer.invoke('srs:due'),
  srsReview: (id: string, rating: 1 | 3 | 4 | 5) => ipcRenderer.invoke('srs:review', id, rating),
  srsPreview: (id: string) => ipcRenderer.invoke('srs:preview', id),
  srsStats: () => ipcRenderer.invoke('srs:stats'),
  srsFromNote: (deckId: string, front: string, back: string, sourceNoteId?: string) =>
    ipcRenderer.invoke('srs:fromNote', deckId, front, back, sourceNoteId),
  srsFromSource: (deckId: string, front: string, back: string, sourceType?: string, sourceId?: string) =>
    ipcRenderer.invoke('srs:fromSource', deckId, front, back, sourceType, sourceId),
  srsExport: () => ipcRenderer.invoke('srs:export'),
  srsImport: () => ipcRenderer.invoke('srs:import'),

  search: (q: string) => ipcRenderer.invoke('search:all', q),

  // PRD v3 APIs
  chapterList: (bookId: string) => ipcRenderer.invoke('chapter:list', bookId),
  chapterUpsert: (c: any) => ipcRenderer.invoke('chapter:upsert', c),
  chapterDelete: (id: string) => ipcRenderer.invoke('chapter:delete', id),

  kpList: (chapterId: string|null) => ipcRenderer.invoke('kp:list', chapterId),
  kpUpsert: (kp: any) => ipcRenderer.invoke('kp:upsert', kp),
  kpDelete: (id: string) => ipcRenderer.invoke('kp:delete', id),
  kpSetMastery: (id: string, mastery: string) => ipcRenderer.invoke('kp:setMastery', id, mastery),

  linkCreate: (l: any) => ipcRenderer.invoke('links:create', l),
  linkList: (st: string, si: string) => ipcRenderer.invoke('links:list', st, si),
  linkListTargets: (tt: string, ti: string) => ipcRenderer.invoke('links:listTargets', tt, ti),
  linkRelate: (st: string, si: string, tt: string, ti: string, lt: string) => ipcRenderer.invoke('links:relate', st, si, tt, ti, lt),
  linkRemove: (id: string) => ipcRenderer.invoke('links:remove', id),
  linkAllForEntity: (t: string, id: string) => ipcRenderer.invoke('links:allForEntity', t, id),

  secList: (chapterId: string) => ipcRenderer.invoke('sec:list', chapterId),
  secUpsert: (s: any) => ipcRenderer.invoke('sec:upsert', s),

  progAdd: (r: any) => ipcRenderer.invoke('prog:add', r),
  progList: (rt: string, ri: string) => ipcRenderer.invoke('prog:list', rt, ri),
  progCount: (rt: string) => ipcRenderer.invoke('prog:count', rt),

  planList: () => ipcRenderer.invoke('plan:list'),
  planUpsert: (p: any) => ipcRenderer.invoke('plan:upsert', p),
  planDelete: (id: string) => ipcRenderer.invoke('plan:delete', id),

  diagList: () => ipcRenderer.invoke('diag:list'),
  diagUpsert: (d: any) => ipcRenderer.invoke('diag:upsert', d),
  diagDelete: (id: string) => ipcRenderer.invoke('diag:delete', id),

  codeList: (kpId: string|null) => ipcRenderer.invoke('code:list', kpId),
  codeUpsert: (c: any) => ipcRenderer.invoke('code:upsert', c),
  codeDelete: (id: string) => ipcRenderer.invoke('code:delete', id),

  drawioPort: () => ipcRenderer.invoke('drawio:port'),
}

try {
  contextBridge.exposeInMainWorld('lk', api)
} catch (err) {
  console.error('preload expose error:', err)
}
