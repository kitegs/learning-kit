import { getDb, qAll, qOne, qRun, uuid } from './db'
import { validateDiagram } from './ai-diagram'

export type ArtifactAction = 'create_mindmap' | 'create_plan' | 'create_conversation' | 'create_exercise_set' | 'create_knowledge_point' | 'create_diagram'
export type ArtifactSnapshot = { entity: 'artifact'; kind: ArtifactAction; id: string; after: Record<string, unknown>; questions: Record<string, unknown>[] }
const tables: Record<ArtifactAction, string> = { create_mindmap: 'mindmaps', create_plan: 'study_plans', create_conversation: 'conversations', create_exercise_set: 'exercise_sets', create_knowledge_point: 'knowledge_points', create_diagram: 'diagrams' }
export function isArtifact(action: string): action is ArtifactAction { return Object.hasOwn(tables, action) }
function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`请提供${name}`)
  return value
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('产物参数必须是 JSON 对象')
  return value as Record<string, unknown>
}
export function validateArtifact(action: ArtifactAction, params: Record<string, unknown>): string {
  const title = text(params.title, '标题')
  if (title.length > 300) throw new Error('产物标题不能超过 300 字符')
  if (action === 'create_knowledge_point') {
    if (params.description !== undefined && (typeof params.description !== 'string' || params.description.length > 10000)) throw new Error('知识点描述必须是 10000 字符以内的文本')
    return `${title}\n${params.description || '暂无描述'}\n保存到：知识库 → 知识点；未关联章节；掌握状态：未学习`
  }
  if (action === 'create_diagram') {
    const xml = text(params.xml, 'Draw.io XML')
    const graph = validateDiagram(xml)
    return `${title}\n保存到：思维导图 → 图表列表；${graph.nodes} 个节点 / ${graph.edges} 条连线\nXML 源码预览（确认后可在 Draw.io 编辑）：\n${xml}`
  }
  if (action === 'create_mindmap') return `${title}\n${text(params.body, '思维导图 Markdown')}`
  if (action === 'create_plan') {
    const plan = object(params.plan)
    text(plan.goal, '学习目标')
    if (!Array.isArray(plan.weeks) || !plan.weeks.length || plan.weeks.length > 104) throw new Error('学习计划需要 1–104 周安排')
    for (const item of plan.weeks) {
      const week = object(item)
      if (!Number.isInteger(week.week) || Number(week.week) < 1 || !Array.isArray(week.tasks) || !week.tasks.every(task => typeof task === 'string')) throw new Error('周计划需要有效周数和文本任务列表')
    }
    return `${title}\n${JSON.stringify(plan, null, 2)}`
  }
  if (action === 'create_exercise_set') {
    if (!Array.isArray(params.questions) || !params.questions.length || params.questions.length > 50) throw new Error('习题集需要 1–50 道含题目和答案的题；仅有来源范围无法创建')
    return `${title}\n` + params.questions.map((item, i) => {
      const question = object(item)
      return `${i + 1}. ${text(question.prompt, '题目')}\n答案：${text(question.answer, '答案')}`
    }).join('\n\n')
  }
  return title
}
export function createArtifact(action: ArtifactAction, params: Record<string, unknown>): ArtifactSnapshot {
  validateArtifact(action, params)
  const db = getDb(), id = uuid()
  if (action === 'create_knowledge_point') qRun(db, 'INSERT INTO knowledge_points(id,title,description,mastery) VALUES(?,?,?,?)', [id, params.title, params.description ?? '', 'unseen'])
  if (action === 'create_diagram') qRun(db, 'INSERT INTO diagrams(id,title,xml,format) VALUES(?,?,?,?)', [id, params.title, params.xml, 'drawio'])
  if (action === 'create_mindmap') qRun(db, 'INSERT INTO mindmaps(id,title,body) VALUES(?,?,?)', [id, params.title, params.body])
  if (action === 'create_plan') qRun(db, 'INSERT INTO study_plans(id,title,plan_json) VALUES(?,?,?)', [id, params.title, JSON.stringify(params.plan)])
  if (action === 'create_conversation') qRun(db, 'INSERT INTO conversations(id,title,sort) VALUES(?,?,?)', [id, params.title, Date.now()])
  if (action === 'create_exercise_set') {
    qRun(db, 'INSERT INTO exercise_sets(id,title,source_json) VALUES(?,?,?)', [id, params.title, JSON.stringify(params.source ?? [])])
    for (const [index, item] of (params.questions as Record<string, unknown>[]).entries()) {
      qRun(db, 'INSERT INTO exercise_questions(id,set_id,type,prompt,answer_json,explanation,sort) VALUES(?,?,?,?,?,?,?)', [uuid(), id, 'qa', item.prompt, JSON.stringify(item.answer), typeof item.explanation === 'string' ? item.explanation : null, index])
    }
  }
  return { entity: 'artifact', kind: action, id, after: qOne(db, `SELECT * FROM ${tables[action]} WHERE id=?`, [id]) as Record<string, unknown>, questions: action === 'create_exercise_set' ? qAll(db, 'SELECT * FROM exercise_questions WHERE set_id=? ORDER BY id', [id]) : [] }
}
function same(expected: Record<string, unknown>, actual?: Record<string, unknown>): boolean { return !!actual && Object.keys(expected).every(key => expected[key] === actual[key]) }
export function undoArtifact(snapshot: ArtifactSnapshot): void {
  if (!isArtifact(snapshot.kind)) throw new Error('无法识别产物快照')
  const db = getDb(), table = tables[snapshot.kind]
  if (!same(snapshot.after, qOne(db, `SELECT * FROM ${table} WHERE id=?`, [snapshot.id]))) throw new Error('产物已修改，无法安全撤销')
  if (qOne(db, 'SELECT id FROM links WHERE source_id=? OR target_id=? LIMIT 1', [snapshot.id, snapshot.id])) throw new Error('产物已关联其他资料，无法撤销')
  if (snapshot.kind === 'create_knowledge_point' && (qOne(db, 'SELECT id FROM knowledge_points WHERE parent_id=? LIMIT 1', [snapshot.id]) || qOne(db, 'SELECT id FROM code_snippets WHERE kp_id=? LIMIT 1', [snapshot.id]))) throw new Error('知识点已有子条目或代码引用，无法撤销')
  if (snapshot.kind === 'create_conversation' && qOne(db, 'SELECT id FROM messages WHERE conversation_id=? LIMIT 1', [snapshot.id])) throw new Error('对话已有消息，无法撤销')
  if (snapshot.kind === 'create_exercise_set') {
    const questions = qAll(db, 'SELECT * FROM exercise_questions WHERE set_id=? ORDER BY id', [snapshot.id]) as Record<string, unknown>[]
    if (questions.length !== snapshot.questions.length || questions.some((question, i) => !same(snapshot.questions[i], question))) throw new Error('习题已改变，无法撤销')
    if (qOne(db, 'SELECT a.id FROM exercise_attempts a JOIN exercise_questions q ON q.id=a.question_id WHERE q.set_id=? LIMIT 1', [snapshot.id])) throw new Error('习题已有作答，无法撤销')
    qRun(db, 'DELETE FROM exercise_questions WHERE set_id=?', [snapshot.id])
  }
  qRun(db, `DELETE FROM ${table} WHERE id=?`, [snapshot.id])
}
