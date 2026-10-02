import { ipcMain } from 'electron'
import { createHash } from 'crypto'
import { getDb, qAll, qOne, qRun, uuid, schedulePersist } from './db'
import { graphText, graphRelation, parseGraphDraft, graphRelations } from '../shared/knowledge-graph'
import type { GraphData, GraphNode, GraphEdge, GraphSource, GraphNote, GraphDraft, GraphPreview, GraphNodeInput, GraphEdgeInput } from '../shared/knowledge-graph'
import type { ContextSnippet } from './ai-context'
import { assertUniqueKnowledgeTitle, knowledgeTitleKey } from './knowledge-point-policy'

const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function graphNote(id: string): GraphNote {
  graphText(id, '笔记 ID', 200)
  const row = qOne(getDb(), "SELECT id,title,body FROM notes WHERE id=? AND kind='note' AND deleted_at IS NULL", [id]) as Omit<GraphNote, 'revision'> | undefined
  if (!row) throw new Error('来源笔记不存在或已删除')
  return { ...row, revision: digest(row) }
}
export function graphList(): GraphData {
  const db = getDb()
  const nodes = qAll(db, 'SELECT id,title,description,mastery,chapter_id,parent_id,sort FROM knowledge_points WHERE deleted_at IS NULL ORDER BY id') as GraphNode[]
  const edges = qAll(db, `SELECT e.* FROM graph_edges e JOIN knowledge_points a ON a.id=e.from_id JOIN knowledge_points b ON b.id=e.to_id
    WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL ORDER BY e.id`) as GraphEdge[]
  const sourceRows = qAll(db, `SELECT s.*,n.title,n.body FROM graph_sources s JOIN knowledge_points p ON p.id=s.node_id
    JOIN notes n ON n.id=s.note_id WHERE p.deleted_at IS NULL AND n.deleted_at IS NULL AND n.kind='note' ORDER BY s.node_id,s.note_id`) as (Omit<GraphSource, 'stale'> & { body: string })[]
  const sources: GraphSource[] = sourceRows.map(({ body, ...row }) => ({ ...row, stale: row.revision !== digest({ id: row.note_id, title: row.title, body }) }))
  const notes = qAll(db, "SELECT id,title FROM notes WHERE deleted_at IS NULL AND kind='note' ORDER BY updated_at DESC") as GraphData['notes']
  return { nodes, edges, sources, notes, version: digest({ nodes, edges, sources }) }
}
function checkVersion(version: string): void {
  if (version !== graphList().version) throw new Error('图谱已改变，请刷新并重新确认')
}
function nodeExists(id: string): void {
  graphText(id, '知识点 ID', 200)
  if (!qOne(getDb(), 'SELECT id FROM knowledge_points WHERE id=? AND deleted_at IS NULL', [id])) throw new Error('知识点不存在或已删除')
}
function evidence(noteId?: string, quote?: string): { noteId: string; quote: string; revision: string } {
  if (!noteId) {
    if (quote?.trim()) throw new Error('请先选择来源笔记')
    return { noteId: '', quote: '', revision: '' }
  }
  const note = graphNote(noteId), text = graphText(quote, '原文证据', 500)
  if (!note.body.includes(text)) throw new Error('证据不是来源笔记的连续原文，请复制原文片段')
  return { noteId, quote: text, revision: note.revision }
}
function transaction<T>(work: () => T): T {
  const db = getDb()
  db.run('BEGIN TRANSACTION')
  try { const result = work(); db.run('COMMIT'); schedulePersist(); return result }
  catch (error) { db.run('ROLLBACK'); throw error }
}
function attach(nodeId: string, source: ReturnType<typeof evidence>): void {
  if (source.noteId) qRun(getDb(), 'INSERT INTO graph_sources(node_id,note_id,evidence,revision) VALUES(?,?,?,?) ON CONFLICT(node_id,note_id) DO UPDATE SET evidence=excluded.evidence,revision=excluded.revision', [nodeId, source.noteId, source.quote, source.revision])
}
export function graphNodeSave(input: GraphNodeInput): string {
  checkVersion(input.version)
  const title = graphText(input.title, '标题', 120), description = graphText(input.description, '描述', 2000, true)
  if (input.id) nodeExists(input.id)
  assertUniqueKnowledgeTitle(title, input.id)
  const source = evidence(input.noteId, input.evidence), id = input.id || uuid()
  return transaction(() => {
    if (input.id) qRun(getDb(), "UPDATE knowledge_points SET title=?,description=?,updated_at=datetime('now') WHERE id=?", [title, description, id])
    else qRun(getDb(), 'INSERT INTO knowledge_points(id,title,description) VALUES(?,?,?)', [id, title, description])
    attach(id, source)
    return id
  })
}
export function graphEdgeSave(input: GraphEdgeInput): string {
  checkVersion(input.version); nodeExists(input.from); nodeExists(input.to)
  if (input.from === input.to) throw new Error('不允许自连接')
  const relation = graphRelation(input.relation), source = evidence(input.noteId, input.evidence)
  if (input.id && !qOne(getDb(), 'SELECT id FROM graph_edges WHERE id=?', [input.id])) throw new Error('关系已不存在')
  const existing = qOne(getDb(), 'SELECT id FROM graph_edges WHERE from_id=? AND to_id=? AND relation=? AND note_id=? AND id<>?', [input.from, input.to, relation, source.noteId, input.id || ''])
  if (existing) throw new Error('这条关系已存在')
  const id = input.id || uuid()
  return transaction(() => {
    qRun(getDb(), `INSERT INTO graph_edges(id,from_id,to_id,relation,note_id,evidence,revision) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET from_id=excluded.from_id,to_id=excluded.to_id,relation=excluded.relation,note_id=excluded.note_id,evidence=excluded.evidence,revision=excluded.revision`, [id, input.from, input.to, relation, source.noteId, source.quote, source.revision])
    return id
  })
}
export function graphEdgeRemove(id: string, version: string): boolean {
  checkVersion(version); graphText(id, '关系 ID', 200)
  return transaction(() => { qRun(getDb(), 'DELETE FROM graph_edges WHERE id=?', [id]); return true })
}

type Pending = { owner: number; noteId: string; revision: string; version: string; draft: GraphDraft; resolved: Map<string, string>; expires: number }
const proposals = new Map<string, Pending>()
export function graphPreview(noteId: string, revision: string, raw: string, owner = 0): GraphPreview {
  for (const [key, value] of proposals) if (value.expires < Date.now()) proposals.delete(key)
  if (proposals.size >= 100) throw new Error('待确认提案过多，请稍后重试')
  const note = graphNote(noteId)
  if (note.revision !== revision) throw new Error('来源笔记已改变，请重新提取')
  const draft = parseGraphDraft(raw), data = graphList(), resolved = new Map<string, string>(), reused: string[] = []
  for (const node of draft.nodes) {
    evidence(noteId, node.evidence)
    const matches = data.nodes.filter(n => knowledgeTitleKey(n.title) === knowledgeTitleKey(node.title))
    if (matches.length > 1) throw new Error(`同名知识点有歧义：${node.title}，请先整理或修改提案标题`)
    if (matches.length) { resolved.set(node.key, matches[0].id); reused.push(node.title) }
    else resolved.set(node.key, uuid())
  }
  for (const edge of draft.edges) evidence(noteId, edge.evidence)
  const token = uuid()
  proposals.set(token, { owner, noteId, revision, version: data.version, draft, resolved, expires: Date.now() + 15 * 60 * 1000 })
  return { token, draft, reused, noteTitle: note.title }
}
export function graphApply(token: string, owner = 0): boolean {
  const proposal = proposals.get(token)
  if (!proposal || proposal.owner !== owner || proposal.expires < Date.now()) throw new Error('提案过期或已处理，请重新预览')
  const { noteId, revision, version, draft, resolved } = proposal
  if (graphNote(noteId).revision !== revision) throw new Error('来源笔记已改变，请重新提取')
  checkVersion(version)
  transaction(() => {
    for (const node of draft.nodes) {
      const id = resolved.get(node.key)!
      if (!qOne(getDb(), 'SELECT id FROM knowledge_points WHERE id=?', [id])) qRun(getDb(), 'INSERT INTO knowledge_points(id,title,description) VALUES(?,?,?)', [id, node.title, node.description])
      attach(id, evidence(noteId, node.evidence))
    }
    for (const edge of draft.edges) qRun(getDb(), `INSERT INTO graph_edges(id,from_id,to_id,relation,note_id,evidence,revision) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(from_id,to_id,relation,note_id) DO UPDATE SET evidence=excluded.evidence,revision=excluded.revision`, [uuid(), resolved.get(edge.from)!, resolved.get(edge.to)!, edge.relation, noteId, edge.evidence, revision])
  })
  proposals.delete(token)
  return true
}
export function retrieveGraph(query: string): ContextSnippet[] {
  const data = graphList(), lower = query.slice(0, 2000).toLowerCase()
  const seeds = data.nodes.filter(n => n.title.trim().length > 1 && lower.includes(n.title.trim().toLowerCase())).sort((a, b) => b.title.length - a.title.length || a.id.localeCompare(b.id)).slice(0, 3)
  const paths = new Map(seeds.map(n => [n.id, `命中知识点：${n.title}`]))
  const results: ContextSnippet[] = [], seen = new Set<string>()
  const append = (noteId: string, revision: string, quote: string, path: string) => {
    if (results.length >= 4 || seen.has(noteId)) return
    try {
      const note = graphNote(noteId)
      if (note.revision !== revision) return
      seen.add(noteId)
      const start = Math.max(0, note.body.indexOf(quote) - 80)
      results.push({ id: note.id, title: note.title, text: `图谱路径（用户确认的关系，可能有误）：${path}\n${note.body.slice(start, start + 900)}`, path })
    } catch { /* Deleted source notes are never sent. */ }
  }
  for (const edge of data.edges) {
    const a = seeds.find(n => n.id === edge.from_id), b = seeds.find(n => n.id === edge.to_id)
    if (!a && !b) continue
    // An AI-sourced stale edge must not expand the graph.
    if (edge.note_id) { try { if (graphNote(edge.note_id).revision !== edge.revision) continue } catch { continue } }
    const from = data.nodes.find(n => n.id === edge.from_id)!, to = data.nodes.find(n => n.id === edge.to_id)!
    const path = `${from.title} —${graphRelations[edge.relation]}→ ${to.title}`
    if (paths.size < 12) { if (a && !paths.has(to.id)) paths.set(to.id, path); if (b && !paths.has(from.id)) paths.set(from.id, path) }
    if (edge.note_id) append(edge.note_id, edge.revision, edge.evidence, path)
  }
  for (const [id, path] of paths) for (const source of data.sources.filter(s => s.node_id === id && !s.stale)) append(source.note_id, source.revision, source.evidence, path)
  return results
}
export function registerGraphIpcs(ipc: typeof ipcMain): void {
  ipc.handle('graph:list', () => graphList())
  ipc.handle('graph:note', (_e, id: string) => graphNote(id))
  ipc.handle('graph:node:save', (_e, input: GraphNodeInput) => graphNodeSave(input))
  ipc.handle('graph:edge:save', (_e, input: GraphEdgeInput) => graphEdgeSave(input))
  ipc.handle('graph:edge:remove', (_e, id: string, version: string) => graphEdgeRemove(id, version))
  ipc.handle('graph:preview', (e, noteId: string, revision: string, raw: string) => graphPreview(noteId, revision, raw, e.sender.id))
  ipc.handle('graph:apply', (e, token: string) => graphApply(token, e.sender.id))
  ipc.handle('graph:discard', (e, token: string) => { if (proposals.get(token)?.owner === e.sender.id) proposals.delete(token); return true })
}
