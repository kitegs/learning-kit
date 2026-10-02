import { ipcMain } from 'electron'
import { getDb, qAll, qOne, qRun, schedulePersist, uuid } from './db'
import { registerIpc } from './ipc-helpers'
import { attachFsrsState } from './srs'
import { isArtifact, validateArtifact, createArtifact, undoArtifact, type ArtifactSnapshot } from './learning-artifacts'
import { toolDefinitions, type ToolAction, type ToolCenterQuery, type ToolCenterRow, type ToolCenterPage, type ToolCenterSnapshot } from '../shared/tools'

export type { ToolAction } from '../shared/tools'

export interface ToolRequest {
  source: 'internal-ai' | 'mcp' | 'renderer'
  action: ToolAction
  params: Record<string, unknown>
}

export interface ToolResult {
  operationId: string
  status: 'applied' | 'pending_confirmation' | 'failed' | 'undone' | 'rejected'
  preview: string
  affected: string[]
  error?: string
}

export interface ToolOperationFilter {
  source?: ToolRequest['source']
  status?: string
  limit?: number
}

type NoteRow = {
  id: string; title: string; body: string; parent_id: string | null; sort: number; tags: string | null
  kind: string; favorite: number; created_at: string; updated_at: string; deleted_at: number | null
}
type BookmarkRow = { id: string; book_id: string; page: number; label: string | null; href: string | null; created_at: string }
type RowSnapshot =
  | ArtifactSnapshot
  | { entity: 'card'; id: string; before: null; after: Record<string, unknown> }
  | { entity: 'note'; id: string; before: NoteRow | null; after: NoteRow }
  | { entity: 'bookmark'; id: string; before: BookmarkRow | null; after: BookmarkRow }
type StoredOperation = { id: string; source: ToolRequest['source']; action: ToolAction; params_json: string; preview: string | null; status: string; affected_json: string; snapshots_json: string }

export function notePostStateMatches(expected: NoteRow, current: NoteRow | undefined): boolean {
  return !!current && current.id === expected.id && current.title === expected.title && current.body === expected.body && current.parent_id === expected.parent_id && current.sort === expected.sort && current.tags === expected.tags && current.kind === expected.kind && current.favorite === expected.favorite && current.created_at === expected.created_at && current.updated_at === expected.updated_at && current.deleted_at === expected.deleted_at
}

export function requiresConfirmation(request: Pick<ToolRequest, 'source' | 'action'>): boolean {
  if (request.source === 'internal-ai' || request.source === 'mcp') return true
  return Object.hasOwn(toolDefinitions, request.action) ? toolDefinitions[request.action].confirm : true
}

function stringParam(params: Record<string, unknown>, key: string): string
function stringParam(params: Record<string, unknown>, key: string, required: false): string | null
function stringParam(params: Record<string, unknown>, key: string, required = true): string | null {
  const value = params[key]
  if (typeof value === 'string' && value.trim()) return value
  if (required) throw new Error(`缺少有效参数：${key}`)
  return null
}
function numberParam(params: Record<string, unknown>, key: string, fallback: number): number {
  const value = params[key]
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`参数必须是数字：${key}`)
  return value
}
function parseAffected(raw: string): string[] { try { return JSON.parse(raw) as string[] } catch { return [] } }

function prepareFlashcard(request: ToolRequest, preview = false): void {
  if (request.action === 'create_flashcard_from_error') {
    const questionId = stringParam(request.params, 'questionId')
    const question = qOne(getDb(), 'SELECT prompt,answer_json,explanation FROM exercise_questions WHERE id=? AND EXISTS (SELECT 1 FROM exercise_attempts WHERE question_id=? AND correct=0)', [questionId, questionId]) as { prompt: string; answer_json: string; explanation: string | null } | undefined
    if (!question) throw new Error('找不到有错误作答记录的题目')
    const answer: unknown = JSON.parse(question.answer_json)
    const back = `${typeof answer === 'string' ? answer : JSON.stringify(answer)}${question.explanation ? '\n\n' + question.explanation : ''}`
    if (preview) request.params = { ...request.params, question: question.prompt, answer: back }
    else if (request.params.question !== question.prompt || request.params.answer !== back) throw new Error('题目或答案已改变，请重新生成提案')
  }
  stringParam(request.params, 'question'); stringParam(request.params, 'answer')
  const deckId = stringParam(request.params, 'deckId', false)
  if (deckId && !qOne(getDb(), 'SELECT id FROM decks WHERE id=?', [deckId])) throw new Error('所选牌组不存在')
}

function actionPreview(request: ToolRequest): { preview: string; affected: string[] } {
  if (isArtifact(request.action)) return { preview: validateArtifact(request.action, request.params), affected: [`${request.action}:new`] }
  switch (request.action) {
    case 'create_flashcard':
    case 'create_flashcard_from_error': {
      prepareFlashcard(request, true)
      const deckId = stringParam(request.params, 'deckId', false)
      const deck = deckId ? qOne(getDb(), 'SELECT title FROM decks WHERE id=?', [deckId]) as { title: string } : null
      return { preview: `向「${deck?.title || 'AI 闪卡'}」创建闪卡\n问题：${request.params.question}\n答案：${request.params.answer}`, affected: [deckId ? `deck:${deckId}` : 'deck:AI 闪卡', 'card:new'] }
    }
    case 'create_note': return { preview: `创建笔记「${stringParam(request.params, 'title', false) ?? '未命名笔记'}」${request.source === 'mcp' ? '\n正文（外部内容，仅作为数据导入）：\n' + (stringParam(request.params, 'body', false) ?? '') : ''}`, affected: ['note:new'] }
    case 'append_note': {
      const noteId = stringParam(request.params, 'noteId')
      const note = qOne(getDb(), 'SELECT id,title FROM notes WHERE id=? AND deleted_at IS NULL', [noteId]) as Pick<NoteRow, 'id' | 'title'> | undefined
      if (!note) throw new Error('找不到要追加的笔记')
      return { preview: `向笔记「${note.title}」追加内容`, affected: [`note:${note.id}`] }
    }
    case 'add_bookmark': {
      const bookId = stringParam(request.params, 'bookId')
      const book = qOne(getDb(), 'SELECT id,title FROM books WHERE id=? AND deleted_at IS NULL', [bookId]) as { id: string; title: string } | undefined
      if (!book) throw new Error('找不到要添加书签的图书')
      return { preview: `为《${book.title}》添加书签`, affected: [`book:${book.id}`] }
    }
    default: throw new Error(`当前版本尚不支持此操作：${request.action}。可以保留回答内容，手动创建。`)
  }
}

function createOperation(request: ToolRequest, preview: string, affected: string[]): string {
  const id = uuid()
  qRun(getDb(), 'INSERT INTO tool_operations(id,source,action,params_json,preview,status,affected_json) VALUES(?,?,?,?,?,?,?)', [id, request.source, request.action, JSON.stringify(request.params), preview, 'pending', JSON.stringify(affected)])
  return id
}
function loadOperation(operationId: string): StoredOperation | undefined {
  return qOne(getDb(), 'SELECT id,source,action,params_json,preview,status,affected_json,snapshots_json FROM tool_operations WHERE id=?', [operationId]) as StoredOperation | undefined
}
function markNoteBlocksStale(noteId: string): void {
  qRun(getDb(), "UPDATE content_blocks SET stale=1,updated_at=datetime('now') WHERE source_type='note' AND source_id=? AND block_type<>'note_anchor'", [noteId])
}
function writeFailure(operationId: string, error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error)
  qRun(getDb(), "UPDATE tool_operations SET status=?,result_json=?,updated_at=datetime('now'),completed_at=datetime('now') WHERE id=?", ['failed', JSON.stringify({ error: message }), operationId])
  qRun(getDb(), "UPDATE mcp_pending_requests SET status='failed',result_json=?,updated_at=datetime('now'),resolved_at=datetime('now') WHERE operation_id=? AND status='pending'", [JSON.stringify({ error: message }), operationId])
  schedulePersist()
  return { operationId, status: 'failed', preview: '', affected: [], error: message }
}

function executeMutation(request: ToolRequest): { affected: string[]; snapshots: RowSnapshot[] } {
  if (isArtifact(request.action)) {
    const snapshot = createArtifact(request.action, request.params)
    return { affected: [`${request.action}:${snapshot.id}`], snapshots: [snapshot] }
  }
  switch (request.action) {
    case 'create_flashcard':
    case 'create_flashcard_from_error': {
      prepareFlashcard(request)
      let deckId = stringParam(request.params, 'deckId', false)
      if (!deckId) {
        const deck = qOne(getDb(), 'SELECT id FROM decks WHERE title=? ORDER BY created_at,id LIMIT 1', ['AI 闪卡']) as { id: string } | undefined
        deckId = deck?.id || uuid()
        if (!deck) qRun(getDb(), 'INSERT INTO decks(id,title,sort) VALUES(?,?,?)', [deckId, 'AI 闪卡', Date.now()])
      }
      const id = uuid()
      qRun(getDb(), 'INSERT INTO cards(id,deck_id,front,back,kind) VALUES(?,?,?,?,?)', [id, deckId, stringParam(request.params, 'question'), stringParam(request.params, 'answer'), 'qa'])
      attachFsrsState(id)
      const after = qOne(getDb(), 'SELECT * FROM cards WHERE id=?', [id]) as Record<string, unknown>
      return { affected: [`deck:${deckId}`, `card:${id}`], snapshots: [{ entity: 'card', id, before: null, after }] }
    }
    case 'create_note': {
      const id = uuid()
      qRun(getDb(), 'INSERT INTO notes(id,title,body,parent_id,sort,tags,kind) VALUES(?,?,?,?,?,?,?)', [id, stringParam(request.params, 'title', false) ?? '未命名笔记', stringParam(request.params, 'body', false) ?? '', stringParam(request.params, 'parentId', false), Date.now(), stringParam(request.params, 'tags', false), stringParam(request.params, 'kind', false) ?? 'note'])
      const after = qOne(getDb(), 'SELECT * FROM notes WHERE id=?', [id]) as NoteRow
      return { affected: [`note:${id}`], snapshots: [{ entity: 'note', id, before: null, after }] }
    }
    case 'append_note': {
      const id = stringParam(request.params, 'noteId'), text = stringParam(request.params, 'text')
      const before = qOne(getDb(), 'SELECT * FROM notes WHERE id=? AND deleted_at IS NULL', [id]) as NoteRow | undefined
      if (!before) throw new Error('找不到要追加的笔记')
      qRun(getDb(), "UPDATE notes SET body=?,updated_at=datetime('now') WHERE id=?", [before.body ? `${before.body}\n\n${text}` : text, id])
      markNoteBlocksStale(id)
      const after = qOne(getDb(), 'SELECT * FROM notes WHERE id=?', [id]) as NoteRow
      return { affected: [`note:${id}`], snapshots: [{ entity: 'note', id, before, after }] }
    }
    case 'add_bookmark': {
      const id = uuid(), bookId = stringParam(request.params, 'bookId')
      const book = qOne(getDb(), 'SELECT id FROM books WHERE id=? AND deleted_at IS NULL', [bookId]) as { id: string } | undefined
      if (!book) throw new Error('找不到要添加书签的图书')
      qRun(getDb(), 'INSERT INTO bookmarks(id,book_id,page,label,href) VALUES(?,?,?,?,?)', [id, bookId, numberParam(request.params, 'page', 0), stringParam(request.params, 'label', false), stringParam(request.params, 'href', false)])
      const after = qOne(getDb(), 'SELECT * FROM bookmarks WHERE id=?', [id]) as BookmarkRow
      return { affected: [`book:${bookId}`, `bookmark:${id}`], snapshots: [{ entity: 'bookmark', id, before: null, after }] }
    }
    default: throw new Error(`操作尚未实现：${request.action}`)
  }
}

function applyOperation(operation: StoredOperation): ToolResult {
  const request: ToolRequest = { source: operation.source, action: operation.action, params: JSON.parse(operation.params_json) as Record<string, unknown> }
  const db = getDb()
  db.exec('BEGIN TRANSACTION')
  try {
    const mutation = executeMutation(request)
    qRun(db, "UPDATE tool_operations SET status=?,affected_json=?,snapshots_json=?,result_json=?,updated_at=datetime('now'),completed_at=datetime('now') WHERE id=?", ['applied', JSON.stringify(mutation.affected), JSON.stringify(mutation.snapshots), JSON.stringify({ affected: mutation.affected }), operation.id])
    qRun(db, "UPDATE mcp_pending_requests SET status='approved',result_json=?,updated_at=datetime('now'),resolved_at=datetime('now') WHERE operation_id=? AND status='pending'", [JSON.stringify({ affected: mutation.affected }), operation.id])
    db.exec('COMMIT')
    schedulePersist()
    return { operationId: operation.id, status: 'applied', preview: operation.preview ?? '', affected: mutation.affected }
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* transaction already ended */ }
    return writeFailure(operation.id, error)
  }
}

function submit(request: ToolRequest): ToolResult {
  let preview = ''; let affected: string[] = []; let operationId = ''
  try {
    const prepared = actionPreview(request); preview = prepared.preview; affected = prepared.affected
    operationId = createOperation(request, preview, affected)
    if (requiresConfirmation(request)) {
      if (request.source === 'mcp') qRun(getDb(), 'INSERT INTO mcp_pending_requests(id,operation_id,request_json) VALUES(?,?,?)', [uuid(), operationId, JSON.stringify(request)])
      qRun(getDb(), "UPDATE tool_operations SET status='pending_confirmation',updated_at=datetime('now') WHERE id=?", [operationId])
      schedulePersist()
      return { operationId, status: 'pending_confirmation', preview, affected }
    }
    const operation = loadOperation(operationId)
    if (!operation) throw new Error('工具操作创建失败')
    return applyOperation(operation)
  } catch (error) {
    if (!operationId) return { operationId: '', status: 'failed', preview, affected, error: error instanceof Error ? error.message : String(error) }
    return writeFailure(operationId, error)
  }
}

export function requestInternalTool(action: ToolAction, params: Record<string, unknown>): ToolResult { return submit({ source: 'internal-ai', action, params }) }
export function requestMcpTool(action: ToolAction, params: Record<string, unknown>): ToolResult { return submit({ source: 'mcp', action, params }) }
export function executeRendererTool(action: ToolAction, params: Record<string, unknown>): ToolResult {
  const request: ToolRequest = { source: 'renderer', action, params }
  if (requiresConfirmation(request)) return { operationId: '', status: 'failed', preview: '', affected: [], error: '该操作必须先通过确认流程提交' }
  return submit(request)
}
export function previewRendererTool(action: ToolAction, params: Record<string, unknown>): ToolResult {
  const prepared = actionPreview({ source: 'renderer', action, params })
  return { operationId: '', status: 'pending_confirmation', ...prepared }
}
export function approveOperation(operationId: string): ToolResult {
  const operation = loadOperation(operationId)
  if (!operation) return { operationId, status: 'failed', preview: '', affected: [], error: '找不到工具操作记录' }
  if (operation.status !== 'pending_confirmation') return { operationId, status: 'failed', preview: operation.preview ?? '', affected: parseAffected(operation.affected_json), error: '操作不在待确认状态' }
  return applyOperation(operation)
}
export function rejectOperation(operationId: string): ToolResult {
  const operation = loadOperation(operationId)
  if (!operation) return { operationId, status: 'failed', preview: '', affected: [], error: '找不到工具操作记录' }
  const affected = parseAffected(operation.affected_json)
  if (operation.status !== 'pending_confirmation') return { operationId, status: 'failed', preview: operation.preview ?? '', affected, error: '操作不在待确认状态' }
  qRun(getDb(), "UPDATE tool_operations SET status='rejected',result_json=?,updated_at=datetime('now'),completed_at=datetime('now') WHERE id=?", [JSON.stringify({ rejected: true }), operationId])
  qRun(getDb(), "UPDATE mcp_pending_requests SET status='rejected',result_json=?,updated_at=datetime('now'),resolved_at=datetime('now') WHERE operation_id=? AND status='pending'", [JSON.stringify({ rejected: true }), operationId])
  schedulePersist()
  return { operationId, status: 'rejected', preview: operation.preview ?? '', affected }
}
export function listOperations(filter: ToolOperationFilter = {}): Record<string, unknown>[] {
  const conditions: string[] = [], values: unknown[] = []
  if (filter.source) { conditions.push('source=?'); values.push(filter.source) }
  if (filter.status) { conditions.push('status=?'); values.push(filter.status) }
  const limit = Math.min(Math.max(Math.floor(filter.limit ?? 120), 1), 300)
  return qAll(getDb(), `SELECT * FROM tool_operations${conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''} ORDER BY created_at DESC,id DESC LIMIT ?`, [...values, limit]) as Record<string, unknown>[]
}
/** 分页前过滤状态。队列再大也不会挤占已执行历史；不回传快照和参数副本。 */
export function toolCenterSnapshot(query: ToolCenterQuery = {}): ToolCenterSnapshot {
  if (query.source && !['internal-ai', 'mcp', 'renderer'].includes(query.source)) throw new Error('无效操作来源')
  if (query.status && !['applied', 'failed', 'undone', 'rejected'].includes(query.status)) throw new Error('无效历史状态')
  const readPage = (pending: boolean): ToolCenterPage => {
    const where = [pending ? "status='pending_confirmation'" : "status<>'pending_confirmation'"]
    const params: unknown[] = []
    if (query.source) { where.push('source=?'); params.push(query.source) }
    if (!pending && query.status) { where.push('status=?'); params.push(query.status) }
    const clause = where.join(' AND '), pageSize = 12
    const total = Number((qOne(getDb(), `SELECT COUNT(*) AS n FROM tool_operations WHERE ${clause}`, params) as { n: number }).n)
    const requested = pending ? query.pendingPage : query.historyPage
    if (requested !== undefined && (!Number.isSafeInteger(requested) || requested < 1)) throw new Error('页码必须为正整数')
    const page = Math.min(requested ?? 1, Math.max(1, Math.ceil(total / pageSize)))
    const rows = qAll(getDb(), `SELECT id,action,source,status,preview,affected_json,result_json,created_at FROM tool_operations WHERE ${clause} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`, [...params, pageSize, (page - 1) * pageSize]) as (StoredOperation & { result_json: string | null; created_at: string })[]
    const items: ToolCenterRow[] = rows.map(row => {
      let error: string | null = null
      try { const result = JSON.parse(row.result_json || '{}') as { error?: string }; error = result.error || null } catch { error = '结果记录损坏' }
      return { id: row.id, action: row.action, source: row.source, status: row.status as ToolCenterRow['status'], preview: row.preview || '', affected: parseAffected(row.affected_json), error, createdAt: row.created_at }
    })
    return { items, total, page, pageSize }
  }
  return { pending: readPage(true), history: readPage(false) }
}
function assertNoteUndoUnreferenced(noteId: string, deleting: boolean): void {
  const db = getDb()
  // 快照匹配不代表安全：引用在其他表里产生，并不会改 notes.updated_at。
  if (qOne(db, 'SELECT node_id FROM graph_sources WHERE note_id=? LIMIT 1', [noteId]) || qOne(db, 'SELECT id FROM graph_edges WHERE note_id=? LIMIT 1', [noteId])) throw new Error('笔记已被知识图谱引用，请先解除来源或关系再撤销')
  if (qOne(db, 'SELECT id FROM links WHERE source_id=? OR target_id=? LIMIT 1', [noteId, noteId])) throw new Error('笔记已关联其他资料，请先解除链接再撤销')
  if (qOne(db, 'SELECT id FROM notes WHERE parent_id=? LIMIT 1', [noteId])) throw new Error('笔记已有子条目，无法安全撤销')
  if (qOne(db, "SELECT id FROM content_blocks WHERE source_type='note' AND source_id=? LIMIT 1", [noteId])) throw new Error('笔记已有定位锚点或内容块引用，请先处理来源内容块再撤销')
  // 自定义属性/版本也可能独立写入；不将后来产生的用户数据当作可清理索引。
  if (deleting && qOne(db, 'SELECT id FROM entity_attributes WHERE entity_id=? LIMIT 1', [noteId])) throw new Error('笔记已有自定义属性，无法安全撤销')
  if (deleting && qOne(db, 'SELECT id FROM note_versions WHERE note_id=? LIMIT 1', [noteId])) throw new Error('笔记已有历史版本，无法安全撤销')
}
export function undoOperation(operationId: string): ToolResult {
  const operation = loadOperation(operationId)
  if (!operation) return { operationId, status: 'failed', preview: '', affected: [], error: '找不到工具操作记录' }
  const affected = parseAffected(operation.affected_json)
  if (operation.status !== 'applied') return { operationId, status: 'failed', preview: operation.preview ?? '', affected, error: '只有已执行的操作可以撤销' }
  let snapshots: RowSnapshot[]
  try { snapshots = JSON.parse(operation.snapshots_json) as RowSnapshot[] } catch { return { operationId, status: 'failed', preview: operation.preview ?? '', affected, error: '操作快照损坏，无法安全撤销' } }
  const db = getDb(); db.exec('BEGIN TRANSACTION')
  try {
    for (const snapshot of snapshots) {
      if (snapshot.entity === 'artifact') { undoArtifact(snapshot); continue }
      if (snapshot.entity === 'note') {
        const current = qOne(db, 'SELECT * FROM notes WHERE id=?', [snapshot.id]) as NoteRow | undefined
        if (!notePostStateMatches(snapshot.after, current)) throw new Error('笔记已被更新，无法安全撤销')
        assertNoteUndoUnreferenced(snapshot.id, !snapshot.before)
        if (!snapshot.before) qRun(db, 'DELETE FROM notes WHERE id=?', [snapshot.id])
        else { qRun(db, "UPDATE notes SET title=?,body=?,parent_id=?,sort=?,tags=?,kind=?,favorite=?,deleted_at=?,updated_at=datetime('now') WHERE id=?", [snapshot.before.title, snapshot.before.body, snapshot.before.parent_id, snapshot.before.sort, snapshot.before.tags, snapshot.before.kind, snapshot.before.favorite, snapshot.before.deleted_at, snapshot.id]); markNoteBlocksStale(snapshot.id) }
      } else if (snapshot.entity === 'card') {
        const current = qOne(db, 'SELECT * FROM cards WHERE id=?', [snapshot.id]) as Record<string, unknown> | undefined
        if (!current || Object.keys(snapshot.after).some((key) => current[key] !== snapshot.after[key]) || qOne(db, 'SELECT id FROM review_log WHERE card_id=? LIMIT 1', [snapshot.id])) throw new Error('闪卡已被修改或复习，无法安全撤销')
        qRun(db, 'DELETE FROM card_scheduling WHERE card_id=?', [snapshot.id])
        qRun(db, 'DELETE FROM cards WHERE id=?', [snapshot.id])
      } else {
        const current = qOne(db, 'SELECT * FROM bookmarks WHERE id=?', [snapshot.id]) as BookmarkRow | undefined
        if (!current || current.id !== snapshot.after.id || current.book_id !== snapshot.after.book_id || current.page !== snapshot.after.page || current.label !== snapshot.after.label || current.href !== snapshot.after.href || current.created_at !== snapshot.after.created_at) throw new Error('书签已被更新，无法安全撤销')
        if (!snapshot.before) qRun(db, 'DELETE FROM bookmarks WHERE id=?', [snapshot.id])
      }
    }
    qRun(db, "UPDATE tool_operations SET status='undone',updated_at=datetime('now'),completed_at=datetime('now') WHERE id=?", [operationId])
    db.exec('COMMIT'); schedulePersist()
    return { operationId, status: 'undone', preview: operation.preview ?? '', affected }
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* transaction already ended */ }
    return { operationId, status: 'failed', preview: operation.preview ?? '', affected, error: error instanceof Error ? error.message : String(error) }
  }
}
export function registerToolIpcs(ipc: typeof ipcMain): void {
  registerIpc(ipc, 'tool:preview', (_event, input: { action: ToolAction; params: Record<string, unknown> }) => previewRendererTool(input.action, input.params))
  registerIpc(ipc, 'tool:execute', (_event, input: { action: ToolAction; params: Record<string, unknown> }) => executeRendererTool(input.action, input.params))
  registerIpc(ipc, 'tool:propose-internal', (_event, input: { action: ToolAction; params: Record<string, unknown> }) => requestInternalTool(input.action, input.params))
  registerIpc(ipc, 'tool:approve', (_event, operationId: string) => approveOperation(operationId))
  registerIpc(ipc, 'tool:reject', (_event, operationId: string) => rejectOperation(operationId))
  registerIpc(ipc, 'tool:undo', (_event, operationId: string) => undoOperation(operationId))
  registerIpc(ipc, 'tool:operations', (_event, filter?: ToolOperationFilter) => listOperations(filter))
  registerIpc(ipc, 'tool:center', (_event, query?: ToolCenterQuery) => toolCenterSnapshot(query))
}
