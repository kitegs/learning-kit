import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

// Wraps an IPC result — throws if !ok, passes through data otherwise.
// Handles both old-style (direct return) and new-style ({ok,data,error}) responses.
function u<T>(r: any): T {
  if (r && typeof r === 'object' && 'ok' in r && r.ok === false) throw new Error(r.error || 'IPC error')
  return r as T
}

const api = {
  // settings
  getSetting: (key: string) => ipcRenderer.invoke('db:settings:get', key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('db:settings:set', key, value),
  allSettings: () => ipcRenderer.invoke('db:settings:all'),

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
  foldList: (conversationId: string) => ipcRenderer.invoke('db:fold:list', conversationId),
  foldCreate: (fold: { conversationId: string; title?: string; sort?: number }) => ipcRenderer.invoke('db:fold:create', fold).then(u),
  foldPatch: (id: string, patch: { title?: string; collapsed?: boolean }) => ipcRenderer.invoke('db:fold:patch', id, patch).then(u),
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
  srsStats: () => ipcRenderer.invoke('srs:stats'),
  srsFromNote: (deckId: string, front: string, back: string, sourceNoteId?: string) =>
    ipcRenderer.invoke('srs:fromNote', deckId, front, back, sourceNoteId),

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
