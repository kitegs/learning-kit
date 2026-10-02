import { createHash } from 'node:crypto'
import { getDb, qOne, qRun, schedulePersist } from './db'
import { requestMcpTool, type ToolResult } from './tool-service'
import { noteSchema, knowledgeSchema, operationSchema, emptySchema } from '../../mcp/schema'
import { toolLabel } from '../shared/tools'

export function mcpPendingCount(): number {
  return Number((qOne(getDb(), "SELECT COUNT(*) AS n FROM tool_operations WHERE source='mcp' AND status='pending_confirmation'") as { n: number }).n)
}
function operationStatus(operationId: string): ToolResult {
  const row = qOne(getDb(), "SELECT id,action,status,affected_json,result_json FROM tool_operations WHERE id=? AND source='mcp'", [operationId]) as { id: string; action: string; status: ToolResult['status']; affected_json: string; result_json: string | null } | undefined
  if (!row) throw new Error('找不到外部导入记录')
  const result = JSON.parse(row.result_json || '{}') as { error?: string }
  // 完整预览只给应用内确认界面，避免外部 AI 每次轮询都再次接收正文。
  return { operationId: row.id, status: row.status, preview: toolLabel(row.action), affected: JSON.parse(row.affected_json) as string[], ...(result.error ? { error: result.error } : {}) }
}
export function dispatchMcpImport(method: string, raw: unknown): unknown {
  if (method === 'status') { emptySchema.parse(raw); return { running: true, pending: mcpPendingCount(), importsRequireConfirmation: true } }
  if (method === 'import_status') return operationStatus(operationSchema.parse(raw).operationId)
  if (method !== 'import_note' && method !== 'import_knowledge_point') throw new Error('不支持的 MCP 方法')
  const input = method === 'import_note' ? noteSchema.parse(raw) : knowledgeSchema.parse(raw)
  const { requestKey, ...params } = input
  const digest = createHash('sha256').update(JSON.stringify({ method, params })).digest('hex')
  const db = getDb()
  const existing = qOne(db, 'SELECT digest,operation_id FROM mcp_import_requests WHERE request_key=?', [requestKey]) as { digest: string; operation_id: string } | undefined
  if (existing) {
    if (existing.digest !== digest) throw new Error('requestKey 已用于不同内容，请为新导入提供新 key')
    return operationStatus(existing.operation_id)
  }
  if (mcpPendingCount() >= 100) throw new Error('待确认导入已达 100 项，请先处理工具中心队列')
  // 防重记录与待确认提案同事务写入；socket 断开后重试也不重复创建。
  db.exec('BEGIN TRANSACTION')
  try {
    const result = requestMcpTool(method === 'import_note' ? 'create_note' : 'create_knowledge_point', params)
    if (!result.operationId || result.status !== 'pending_confirmation') throw new Error(result.error || '导入提案未创建')
    qRun(db, 'INSERT INTO mcp_import_requests(request_key,digest,operation_id) VALUES(?,?,?)', [requestKey, digest, result.operationId])
    db.exec('COMMIT'); schedulePersist()
    return operationStatus(result.operationId)
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
