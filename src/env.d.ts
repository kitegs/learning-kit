/// <reference types="vite/client" />
/// <reference types="electron-vite/node" />
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const c: DefineComponent<{}, {}, any>
  export default c
}

interface LkApi {
  getSetting: (k: string) => Promise<string | null>
  setSetting: (k: string, v: string) => Promise<boolean>
  allSettings: () => Promise<{ key: string; value: string }[]>
  groupsTree: () => Promise<RawRow[]>
  groupUpsert: (g: any) => Promise<boolean>
  groupDelete: (id: string) => Promise<boolean>
  convList: (g: string | null) => Promise<any[]>
  convAll: () => Promise<any[]>
  convUpsert: (c: any) => Promise<boolean>
  convDelete: (id: string) => Promise<boolean>
  convRename: (id: string, t: string) => Promise<boolean>
  convTouch: (id: string) => Promise<boolean>
  msgList: (c: string) => Promise<any[]>
  msgSave: (m: any) => Promise<string>
  msgPatch: (id: string, patch: { content?: string; note?: string | null }) => Promise<boolean>
  msgDelete: (id: string) => Promise<boolean>
  uuid: () => Promise<string>

  aiModels: (p: string) => Promise<string[]>
  aiSystemPrompt: () => Promise<string>
  aiChatStart: (a: any) => Promise<string | false>
  aiChatAbort: (r: string) => Promise<boolean>
  onAiChunk: (r: string, cb: (p: any) => void) => () => void

  bookImport: () => Promise<string[]>
  bookList: () => Promise<any[]>
  bookUpdate: (id: string, patch: any) => Promise<boolean>
  bookDelete: (id: string) => Promise<boolean>
  bookUrl: (id: string) => string
  highlightAdd: (h: any) => Promise<string>
  highlightList: (bookId: string) => Promise<any[]>
  highlightUpdate: (id: string, patch: any) => Promise<boolean>
  highlightDelete: (id: string) => Promise<boolean>
  bookmarkAdd: (b: any) => Promise<string>
  bookmarkList: (bookId: string) => Promise<any[]>
  bookmarkDelete: (id: string) => Promise<boolean>
  bookStat: () => Promise<any>

  annList: (bookId: string, page: number) => Promise<any[]>
  annListAll: (bookId: string) => Promise<any[]>
  annSave: (a: any) => Promise<string>
  annDelete: (id: string) => Promise<boolean>
  annClear: (bookId: string, page: number) => Promise<boolean>

  notesList: () => Promise<any[]>
  notesGet: (id: string) => Promise<any>
  notesUpsert: (n: any) => Promise<string>
  notesPatch: (id: string, patch: any) => Promise<boolean>
  notesDelete: (id: string) => Promise<boolean>
  notesExport: (id: string) => Promise<boolean>

  mindmapList: () => Promise<any[]>
  mindmapGet: (id: string) => Promise<any>
  mindmapUpsert: (m: any) => Promise<string>
  mindmapDelete: (id: string) => Promise<boolean>

  deckList: () => Promise<any[]>
  deckUpsert: (d: any) => Promise<boolean>
  deckDelete: (id: string) => Promise<boolean>
  deckRename: (id: string, t: string) => Promise<boolean>
  cardList: (deckId: string) => Promise<any[]>
  cardAll: () => Promise<any[]>
  cardSave: (c: any) => Promise<string>
  cardDelete: (id: string) => Promise<boolean>
  cardReset: (id: string) => Promise<boolean>
  srsDue: () => Promise<any[]>
  srsReview: (id: string, rating: 1 | 3 | 4 | 5) => Promise<any>
  srsStats: () => Promise<any>
  srsFromNote: (deckId: string, front: string, back: string, sourceNoteId?: string) => Promise<string>

  search: (q: string) => Promise<any>
}

interface RawRow {
  [k: string]: any
}

declare global {
  interface Window {
    lk: LkApi
  }
}
export {}