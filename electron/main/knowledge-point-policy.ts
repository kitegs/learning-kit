import { getDb, qAll } from './db'
import { knowledgeTitleKey } from '../shared/knowledge-graph'
export { knowledgeTitleKey } from '../shared/knowledge-graph'

// SQLite lower() 仅完整处理 ASCII；用 JS Unicode 小写保证各入口比较规则一致。
export function assertUniqueKnowledgeTitle(title: string, exceptId?: string): void {
  const rows = qAll(getDb(), 'SELECT id,title FROM knowledge_points WHERE deleted_at IS NULL') as { id: string; title: string }[]
  if (rows.some(row => row.id !== exceptId && knowledgeTitleKey(row.title) === knowledgeTitleKey(title))) {
    throw new Error('同名知识点已存在，请编辑已有节点或更换标题')
  }
}
