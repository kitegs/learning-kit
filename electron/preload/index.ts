import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

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
  convUpsert: (c) => ipcRenderer.invoke('db:conv:upsert', c),
  convDelete: (id) => ipcRenderer.invoke('db:conv:delete', id),
  convRename: (id, title) => ipcRenderer.invoke('db:conv:rename', id, title),
  convTouch: (id) => ipcRenderer.invoke('db:conv:touch', id),

  // messages
  msgList: (convId) => ipcRenderer.invoke('db:msg:list', convId),
  msgSave: (m) => ipcRenderer.invoke('db:msg:save', m),
  msgPatch: (id, patch) => ipcRenderer.invoke('db:msg:patch', id, patch),
  msgDelete: (id) => ipcRenderer.invoke('db:msg:delete', id),
  uuid: () => ipcRenderer.invoke('db:uuid'),

  // ai
  aiModels: (provider: string) => ipcRenderer.invoke('ai:models', provider),
  aiSystemPrompt: () => ipcRenderer.invoke('ai:system-prompt'),
  aiChatStart: (args: any) => ipcRenderer.invoke('ai:chat:start', args),
  aiChatAbort: (reqId: string) => ipcRenderer.invoke('ai:chat:abort', reqId),
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
  notesUpsert: (n: any) => ipcRenderer.invoke('notes:upsert', n),
  notesPatch: (id: string, patch: any) => ipcRenderer.invoke('notes:patch', id, patch),
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

  search: (q: string) => ipcRenderer.invoke('search:all', q)
}

try {
  contextBridge.exposeInMainWorld('lk', api)
} catch (err) {
  console.error('preload expose error:', err)
}