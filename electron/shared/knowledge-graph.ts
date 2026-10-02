export const graphRelations = { prerequisite: '前置知识', contains: '包含', applies: '应用于', contrasts: '对比' } as const
export function knowledgeTitleKey(title: string): string { return title.trim().toLowerCase() }
export type GraphRelation = keyof typeof graphRelations
export interface GraphNode { id: string; title: string; description: string | null; mastery: string; chapter_id: string | null; parent_id: string | null; sort: number }
export interface GraphEdge { id: string; from_id: string; to_id: string; relation: GraphRelation; note_id: string; evidence: string; revision: string }
export interface GraphSource { node_id: string; note_id: string; evidence: string; revision: string; title: string; stale: boolean }
export interface GraphData { nodes: GraphNode[]; edges: GraphEdge[]; sources: GraphSource[]; notes: { id: string; title: string }[]; version: string }
export interface GraphNote { id: string; title: string; body: string; revision: string }
export interface GraphNodeInput { id?: string; title: string; description: string; noteId?: string; evidence?: string; version: string }
export interface GraphEdgeInput { id?: string; from: string; to: string; relation: GraphRelation; noteId?: string; evidence?: string; version: string }
export interface GraphDraft {
  nodes: { key: string; title: string; description: string; evidence: string }[]
  edges: { from: string; to: string; relation: GraphRelation; evidence: string }[]
}
export interface GraphPreview { token: string; draft: GraphDraft; reused: string[]; noteTitle: string }
export function graphText(value: unknown, label: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) throw new Error(`${label}无效（最多 ${max} 字符）`)
  return value.trim()
}
export function graphRelation(value: unknown): GraphRelation {
  if (typeof value !== 'string' || !Object.hasOwn(graphRelations, value)) throw new Error('不支持的知识关系')
  return value as GraphRelation
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('图谱条目必须是对象')
  return value as Record<string, unknown>
}
export function parseGraphDraft(raw: string): GraphDraft {
  if (typeof raw !== 'string' || raw.length > 60000) throw new Error('图谱输出过大')
  const clean = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let parsed: unknown
  try { parsed = JSON.parse(clean) } catch { throw new Error('AI 未返回有效图谱 JSON，请重新提取或编辑 JSON') }
  const obj = record(parsed)
  if (!Array.isArray(obj.nodes) || !obj.nodes.length || obj.nodes.length > 20 || !Array.isArray(obj.edges) || obj.edges.length > 40) throw new Error('提案需要 1–20 个知识点、最多 40 条关系')
  const nodes = obj.nodes.map(value => {
    const node = record(value)
    return { key: graphText(node.key, '节点标识', 80), title: graphText(node.title, '标题', 120), description: graphText(node.description, '描述', 2000, true), evidence: graphText(node.evidence, '原文证据', 500) }
  })
  if (new Set(nodes.map(n => n.key)).size !== nodes.length || new Set(nodes.map(n => knowledgeTitleKey(n.title))).size !== nodes.length) throw new Error('节点标识或标题重复')
  const keys = new Set(nodes.map(n => n.key))
  const edges = obj.edges.map(value => {
    const edge = record(value)
    const from = graphText(edge.from, '起点', 80), to = graphText(edge.to, '终点', 80)
    if (from === to || !keys.has(from) || !keys.has(to)) throw new Error('关系端点不存在或自连接')
    return { from, to, relation: graphRelation(edge.relation), evidence: graphText(edge.evidence, '关系证据', 500) }
  })
  return { nodes, edges }
}
