import type { ipcMain } from 'electron'
import { getDb, qAll, qOne, qRun, schedulePersist, uuid } from './db'
import { requestInternalTool, approveOperation, rejectOperation, type ToolAction, type ToolResult } from './tool-service'
import type { AgentRun, AgentToolInput, AiDiagnostic } from '../shared/ai-workflow'
import { supportedTool } from '../shared/tools'

const owners = new Map<string, number>()
type JsonRow = { data_json: string }

function saveRun(run: AgentRun): AgentRun {
  run.updatedAt = Date.now()
  qRun(getDb(), 'INSERT OR REPLACE INTO agent_runs(id,conversation_id,started_at,data_json) VALUES(?,?,?,?)', [run.id, run.conversationId, run.startedAt, JSON.stringify(run)])
  schedulePersist()
  return run
}

/** 工具操作记录是事实来源：外部确认、撤销和重启后也不能重放已成功步骤。 */
export function getAgentRun(id: string): AgentRun {
  const row = qOne(getDb(), 'SELECT data_json FROM agent_runs WHERE id=?', [id]) as JsonRow | undefined
  if (!row) throw new Error('找不到 Agent 执行记录')
  const run = JSON.parse(row.data_json) as AgentRun
  for (const step of run.steps) {
    if (!step.operationId) continue
    const operation = qOne(getDb(), 'SELECT status,result_json FROM tool_operations WHERE id=?', [step.operationId]) as { status: string; result_json: string | null } | undefined
    if (!operation) { step.status = 'interrupted'; step.error = '工具操作记录不存在，请检查数据恢复情况'; continue }
    if (['applied', 'failed', 'rejected', 'undone', 'pending_confirmation'].includes(operation.status)) {
      step.status = operation.status as typeof step.status
      if (operation.status === 'failed') {
        try { step.error = (JSON.parse(operation.result_json || '{}') as { error?: string }).error || '工具执行失败' }
        catch { step.error = '工具执行失败' }
      } else step.error = undefined
    }
  }
  if (run.steps.length > 1) {
    const tools = run.steps.slice(1)
    run.status = tools.some(s => s.status === 'failed') ? 'failed' : tools.some(s => s.status === 'pending_confirmation') ? 'awaiting_confirmation' : tools.some(s => s.status === 'interrupted') ? 'interrupted' : 'completed'
  }
  return run
}

export function beginAgentRun(owner: number, requestId: string, conversationId: string | undefined, maxSteps = 6): AgentRun {
  if (!Number.isInteger(maxSteps) || maxSteps < 2 || maxSteps > 20) throw new Error('Agent 步骤上限必须为 2–20')
  const run: AgentRun = { id: uuid(), requestId, conversationId: conversationId || null, startedAt: Date.now(), updatedAt: Date.now(), maxSteps, usedSteps: 1, status: 'model_running', steps: [{ id: uuid(), kind: 'model', label: '模型生成', status: 'running', attempts: 1 }] }
  saveRun(run)
  owners.set(run.id, owner)
  return run
}

export function finishAgentModel(id: string, status: 'completed' | 'failed' | 'cancelled'): AgentRun {
  const run = getAgentRun(id)
  if (run.status !== 'model_running') return run
  run.steps[0].status = status === 'completed' ? 'completed' : status === 'cancelled' ? 'interrupted' : 'failed'
  run.status = status === 'completed' ? 'awaiting_tools' : status
  if (status !== 'completed') owners.delete(id)
  return saveRun(run)
}

export function cancelAgentOwner(owner: number): void {
  for (const [id, sender] of owners) {
    if (sender !== owner) continue
    const run = getAgentRun(id)
    if (run.status === 'model_running') finishAgentModel(id, 'cancelled')
    else if (run.status === 'awaiting_tools') { run.status = 'cancelled'; saveRun(run) }
    owners.delete(id)
  }
}

function validateInput(value: AgentToolInput): void {
  if (!value || !supportedTool(value.action) || !value.params || typeof value.params !== 'object' || Array.isArray(value.params)) throw new Error('Agent 工具或参数无效')
  if (JSON.stringify(value).length > 200_000) throw new Error('Agent 工具参数过大')
}

export function prepareAgentTools(owner: number, id: string, inputs: AgentToolInput[]): AgentRun {
  const run = getAgentRun(id)
  if (owners.get(id) !== owner || run.status !== 'awaiting_tools') throw new Error('流程不在可预览状态或不属于当前窗口')
  if (!Array.isArray(inputs) || inputs.length + run.usedSteps > run.maxSteps) {
    run.status = 'failed'; run.error = '工具数量超过步骤上限，请减少操作后重新生成'
    owners.delete(id)
    return saveRun(run)
  }
  // 整批先检查预算及基础结构，不能创建一半提案后才发现超过限制。
  try { inputs.forEach(validateInput) }
  catch { run.status = 'failed'; run.error = '模型工具输出无效，请重新生成'; owners.delete(id); return saveRun(run) }
  getDb().exec('BEGIN TRANSACTION')
  try {
    for (const input of inputs) {
      const result = requestInternalTool(input.action as ToolAction, input.params)
      run.steps.push({ id: uuid(), kind: 'tool', label: input.action, status: result.status === 'pending_confirmation' ? result.status : 'failed', attempts: 1, operationId: result.operationId || undefined, input, preview: result.preview, error: result.error })
      run.usedSteps++
    }
    run.status = run.steps.some(s => s.status === 'failed') ? 'failed' : inputs.length ? 'awaiting_confirmation' : 'completed'
    saveRun(run)
    getDb().exec('COMMIT')
    owners.delete(id)
    return run
  } catch (error) {
    getDb().exec('ROLLBACK')
    throw error
  }
}

export function decideAgentStep(id: string, stepId: string, decision: 'approve' | 'reject' | 'retry'): AgentRun {
  const run = getAgentRun(id)
  const step = run.steps.find(s => s.id === stepId && s.kind === 'tool')
  if (!step) throw new Error('找不到工具步骤')
  let result: ToolResult
  if (decision === 'retry') {
    // 重试不直接写入，也不重放成功步骤；新提案必须再次由用户确认。
    if (step.status !== 'failed' || !step.input) throw new Error('只有失败工具步骤可以重新预览')
    if (run.usedSteps >= run.maxSteps) throw new Error('已达到步骤上限，不能继续重试')
    validateInput(step.input)
    result = requestInternalTool(step.input.action as ToolAction, step.input.params)
    step.attempts++; run.usedSteps++
  } else {
    if (step.status !== 'pending_confirmation' || !step.operationId) throw new Error('该步骤不在待确认状态，不能重复执行')
    if (decision === 'approve') {
      // 先记录执行阶段。若进程在后续写入中退出，恢复时以工具事务结果为准。
      step.status = 'running'; run.status = 'executing'; saveRun(run)
    }
    result = decision === 'approve' ? approveOperation(step.operationId) : rejectOperation(step.operationId)
  }
  step.operationId = result.operationId || undefined
  step.preview = result.preview
  step.error = result.error
  step.status = result.status
  run.status = run.steps.some(s => s.status === 'failed') ? 'failed' : run.steps.some(s => s.status === 'pending_confirmation') ? 'awaiting_confirmation' : 'completed'
  return saveRun(run)
}

export function listAgentRuns(conversationId?: string): AgentRun[] {
  const rows = qAll(getDb(), `SELECT id FROM agent_runs ${conversationId ? 'WHERE conversation_id=?' : ''} ORDER BY started_at DESC,id DESC LIMIT 40`, conversationId ? [conversationId] : []) as { id: string }[]
  return rows.map(row => getAgentRun(row.id))
}

export function saveDiagnostic(value: AiDiagnostic): void {
  qRun(getDb(), 'INSERT INTO ai_request_diagnostics(id,conversation_id,started_at,data_json) VALUES(?,?,?,?)', [value.id, value.conversationId, value.startedAt, JSON.stringify(value)])
  qRun(getDb(), 'DELETE FROM ai_request_diagnostics WHERE id NOT IN (SELECT id FROM ai_request_diagnostics ORDER BY started_at DESC,id DESC LIMIT 200)')
  schedulePersist()
}

export function registerAiWorkflowIpcs(ipc: typeof ipcMain): void {
  // 应用重启不可能继续旧网络请求；保留中断事实，不偷偷再次请求或执行。
  owners.clear()
  for (const row of qAll(getDb(), 'SELECT data_json FROM agent_runs') as JsonRow[]) {
    const run = JSON.parse(row.data_json) as AgentRun
    if (run.status === 'model_running' || run.status === 'awaiting_tools') {
      run.status = 'interrupted'; run.error = '应用关闭时流程中断，请重新发送问题'
      if (run.steps[0].status === 'running') run.steps[0].status = 'interrupted'
      saveRun(run)
    }
  }
  ipc.handle('ai:diagnostics:list', (_event, conversationId?: string) => (qAll(getDb(), `SELECT data_json FROM ai_request_diagnostics ${conversationId ? 'WHERE conversation_id=?' : ''} ORDER BY started_at DESC,id DESC LIMIT 200`, conversationId ? [conversationId] : []) as JsonRow[]).map(row => JSON.parse(row.data_json) as AiDiagnostic))
  ipc.handle('ai:diagnostics:clear', () => { qRun(getDb(), 'DELETE FROM ai_request_diagnostics'); schedulePersist(); return true })
  ipc.handle('ai:agent:list', (_event, conversationId?: string) => listAgentRuns(conversationId))
  ipc.handle('ai:agent:prepare', (event, id: string, inputs: AgentToolInput[]) => prepareAgentTools(event.sender.id, id, inputs))
  ipc.handle('ai:agent:decide', (_event, id: string, stepId: string, decision: 'approve' | 'reject' | 'retry') => {
    if (!['approve', 'reject', 'retry'].includes(decision)) throw new Error('Agent 决策无效')
    return decideAgentStep(id, stepId, decision)
  })
}
