/// <reference types="vite/client" />
/// <reference types="electron-vite/node" />
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const c: DefineComponent<{}, {}, any>
  export default c
}

interface LkApi {
  toolCenter: (query?: import('../electron/shared/tools').ToolCenterQuery) => Promise<import('../electron/shared/tools').ToolCenterSnapshot>
  mcpStatus: () => Promise<import('../electron/shared/mcp').McpStatus>
  mcpConfigure: (enabled: boolean, rotate?: boolean) => Promise<import('../electron/shared/mcp').McpStatus>
  mcpClientConfig: () => Promise<import('../electron/shared/mcp').McpClientConfig>
  onMcpChanged: (cb: (status: import('../electron/shared/mcp').McpStatus) => void) => () => void
  aiDiagnosticsList: (conversationId?: string) => Promise<import('../electron/shared/ai-workflow').AiDiagnostic[]>
  aiDiagnosticsClear: () => Promise<boolean>
  agentRunsList: (conversationId?: string) => Promise<import('../electron/shared/ai-workflow').AgentRun[]>
  agentRunPrepare: (id: string, inputs: import('../electron/shared/ai-workflow').AgentToolInput[]) => Promise<import('../electron/shared/ai-workflow').AgentRun>
  agentStepDecide: (id: string, stepId: string, decision: 'approve' | 'reject' | 'retry') => Promise<import('../electron/shared/ai-workflow').AgentRun>
  graphList: () => Promise<import('../electron/shared/knowledge-graph').GraphData>
  graphNote: (id: string) => Promise<import('../electron/shared/knowledge-graph').GraphNote>
  graphNodeSave: (input: import('../electron/shared/knowledge-graph').GraphNodeInput) => Promise<string>
  graphEdgeSave: (input: import('../electron/shared/knowledge-graph').GraphEdgeInput) => Promise<string>
  graphEdgeRemove: (id: string, version: string) => Promise<boolean>
  graphPreview: (noteId: string, revision: string, raw: string) => Promise<import('../electron/shared/knowledge-graph').GraphPreview>
  graphApply: (token: string) => Promise<boolean>
  graphDiscard: (token: string) => Promise<boolean>
  onAppBeforeClose: (cb: () => void | Promise<void>) => () => void
  appCloseReady: () => Promise<boolean>
  getSetting: (k: string) => Promise<string | null>
  setSetting: (k: string, v: string) => Promise<boolean>
  allSettings: () => Promise<{ key: string; value: string }[]>
  ocrRecognize: (imageDataUrl: string) => Promise<{ text: string; confidence: number }>
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
  turnCollapse: (turnId: string, collapsed: boolean) => Promise<boolean>
  turnMove: (args: { turnId: string; targetConversationId: string; afterTurnId?: string | null; targetFoldId?: string | null }) => Promise<boolean>
  turnReparent: (args: { turnId: string; targetConversationId: string; parentTurnId?: string | null; foldId?: string | null; position: 'before' | 'inside' | 'after'; referenceTurnId?: string | null }) => Promise<boolean>
  turnRestore: (turnId: string) => Promise<boolean>
  foldList: (conversationId: string) => Promise<any[]>
  foldCreate: (fold: { conversationId: string; title?: string; tags?: string; sort?: number }) => Promise<string>
  foldPatch: (id: string, patch: { title?: string; tags?: string; collapsed?: boolean }) => Promise<boolean>
  foldDelete: (id: string) => Promise<boolean>
  uuid: () => Promise<string>

  aiModels: (p: string) => Promise<string[]>
  aiSystemPrompt: () => Promise<string>
  aiChatStart: (a: AiChatStartArgs) => Promise<string | false>
  aiChatAbort: (r: string) => Promise<boolean>
  aiTest: (args: { provider: string; model: string; apiKey: string; baseUrl?: string }) => Promise<{ ok: boolean; reply?: string; error?: string }>
  onAiChunk: (r: string, cb: (p: AiChunkPayload) => void) => () => void

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
  notesCreateFromMessage: (args: { messageId: string; title?: string; tags?: string; parentId?: string | null }) => Promise<string>
  notesDelete: (id: string) => Promise<boolean>
  notesExport: (id: string) => Promise<boolean>
  noteVersions: (noteId: string) => Promise<any[]>
  noteVersionGet: (id: string) => Promise<any>
  noteVersionRestore: (id: string) => Promise<boolean>

  blockUpsert: (block: { id?: string; sourceType: string; sourceId: string; blockType?: string; text?: string; anchor?: string; anchorKey?: string; metadata?: string; sourceHash?: string }) => Promise<string>
  blockGet: (id: string) => Promise<any>
  blockList: () => Promise<any[]>
  blockForSource: (sourceType: string, sourceId: string) => Promise<any[]>
  blockDelete: (id: string) => Promise<boolean>

  attrsGet: (entityType: string, entityId: string) => Promise<any[]>
  attrsSet: (entityType: string, entityId: string, attrs: Record<string, string>) => Promise<boolean>
  attrsList: (entityType: string) => Promise<any[]>

  toolRunCreate: (run: { conversationId?: string | null; actionType: string; params?: string; preview?: string; rollback?: string }) => Promise<string>
  toolRunComplete: (id: string, status: 'applied' | 'failed' | 'ignored', result?: string) => Promise<boolean>
  toolRunList: (conversationId?: string | null) => Promise<any[]>

  toolPreview: (request: ToolInput) => Promise<ToolResult>
  toolExecute: (request: ToolInput) => Promise<ToolResult>
  toolProposeInternal: (request: ToolInput) => Promise<ToolResult>
  toolApprove: (operationId: string) => Promise<ToolResult>
  toolReject: (operationId: string) => Promise<ToolResult>
  toolUndo: (operationId: string) => Promise<ToolResult>
  toolOperations: (filter?: ToolOperationFilter) => Promise<RawRow[]>

  backupCreate: () => Promise<{ path: string; bytes: number } | null>
  backupRestore: () => Promise<boolean>
  databaseStatus: () => Promise<DatabasePersistenceStatus>
  databaseRetrySave: () => Promise<boolean>
  onDatabaseStatus: (cb: (status: DatabasePersistenceStatus) => void) => () => void

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
  srsPreview: (id: string) => Promise<{ algorithm: 'fsrs'; again: number; hard: number; good: number; easy: number } | null>
  srsStats: () => Promise<any>
  srsFromNote: (deckId: string, front: string, back: string, sourceNoteId?: string) => Promise<string>
  srsFromSource: (deckId: string, front: string, back: string, sourceType?: string, sourceId?: string) => Promise<string>
  srsExport: () => Promise<boolean>
  srsImport: () => Promise<{ decks: number; cards: number }>

  search: (q: string) => Promise<any>

  // PRD v3
  chapterList: (bookId: string) => Promise<any[]>
  chapterUpsert: (c: any) => Promise<string>
  chapterDelete: (id: string) => Promise<boolean>
  kpList: (chapterId: string|null) => Promise<any[]>
  kpUpsert: (kp: any) => Promise<string>
  kpDelete: (id: string) => Promise<boolean>
  kpSetMastery: (id: string, mastery: string) => Promise<boolean>
  linkCreate: (l: any) => Promise<string>
  linkList: (st: string, si: string) => Promise<any[]>
  linkListTargets: (tt: string, ti: string) => Promise<any[]>
  linkRelate: (st: string, si: string, tt: string, ti: string, lt: string) => Promise<string>
  linkRemove: (id: string) => Promise<boolean>
  linkAllForEntity: (t: string, id: string) => Promise<any[]>
  secList: (chapterId: string) => Promise<any[]>
  secUpsert: (s: any) => Promise<string>
  progAdd: (r: any) => Promise<string>
  progList: (rt: string, ri: string) => Promise<any[]>
  progCount: (rt: string) => Promise<any[]>
  planList: () => Promise<any[]>
  planUpsert: (p: any) => Promise<string>
  planDelete: (id: string) => Promise<boolean>
  diagList: () => Promise<any[]>
  diagUpsert: (d: any) => Promise<string>
  diagDelete: (id: string) => Promise<boolean>
  codeList: (kpId: string|null) => Promise<any[]>
  codeUpsert: (c: any) => Promise<string>
  codeDelete: (id: string) => Promise<boolean>

  drawioPort: () => Promise<number>
}

type ToolAction =
  | 'create_knowledge_point' | 'create_diagram'
  | 'create_mindmap' | 'create_plan' | 'create_conversation'
  | 'create_flashcard'
  | 'create_note'
  | 'append_note'
  | 'add_bookmark'
  | 'organize_note'
  | 'create_exercise_set'
  | 'create_flashcard_from_error'
  | 'delete'
  | 'replace_note'
  | 'bulk_move'
  | 'import_restore'
  | 'security_change'

interface ToolInput {
  action: ToolAction
  params: Record<string, unknown>
}

interface ToolResult {
  operationId: string
  status: 'applied' | 'pending_confirmation' | 'failed' | 'undone' | 'rejected'
  preview: string
  affected: string[]
  error?: string
}

interface ToolOperationFilter {
  source?: 'internal-ai' | 'mcp' | 'renderer'
  status?: string
  limit?: number
}

interface RawRow {
  [k: string]: any
}

interface AiChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface AiChatStartArgs {
  diagnosticsEnabled?: boolean
  requestUsage?: boolean
  agentEnabled?: boolean
  agentMaxSteps?: number
  requestId: string
  provider: string
  model: string
  messages: AiChatMessage[]
  temperature?: number
  apiKey?: string
  baseUrl?: string
  customSystemPrompt?: string
  conversationId?: string
  inputBudget?: number
  retrieveNotes?: boolean
  retrieveGraph?: boolean
}

interface AiChunkPayload {
  diagnostic?: import('../electron/shared/ai-workflow').AiDiagnostic
  agentRun?: import('../electron/shared/ai-workflow').AgentRun
  contextSummary?: { budget: number; estimatedTokens: number; droppedMessages: number; sources: { id: string; title: string; path?: string }[]; omittedSources: number }
  delta?: string
  content?: string
  done: boolean
  aborted?: boolean
  error?: string
}

declare global {
  interface DatabasePersistenceStatus {
    state: 'idle' | 'saving' | 'saved' | 'error'
    message?: string
    savedAt?: number
  }

  interface Window {
    lk: LkApi
  }
}
export {}
