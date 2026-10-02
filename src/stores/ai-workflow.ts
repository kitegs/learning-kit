import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AgentRun, AgentToolInput, AiDiagnostic } from '../../electron/shared/ai-workflow'

export const useAiWorkflowStore = defineStore('ai-workflow', () => {
  const diagnostics = ref<AiDiagnostic[]>([])
  const runs = ref<AgentRun[]>([])
  const busy = ref(false)
  const error = ref('')
  let currentConversation: string | undefined
  let sequence = 0
  function capture(payload: { diagnostic?: AiDiagnostic; agentRun?: AgentRun }): void {
    // 新事件比正在返回的列表快照更新，失效旧读取，避免“已完成”被改回“生成中”。
    if ((payload.diagnostic && (!currentConversation || payload.diagnostic.conversationId === currentConversation)) || (payload.agentRun && (!currentConversation || payload.agentRun.conversationId === currentConversation))) sequence++
    if (payload.diagnostic && (!currentConversation || payload.diagnostic.conversationId === currentConversation)) diagnostics.value = [payload.diagnostic, ...diagnostics.value.filter(row => row.id !== payload.diagnostic!.id)].slice(0, 200)
    if (payload.agentRun && (!currentConversation || payload.agentRun.conversationId === currentConversation)) runs.value = [payload.agentRun, ...runs.value.filter(row => row.id !== payload.agentRun!.id)].slice(0, 40)
  }
  async function refresh(conversationId?: string): Promise<void> {
    if (currentConversation !== conversationId) { diagnostics.value = []; runs.value = [] }
    currentConversation = conversationId
    const ticket = ++sequence
    try {
      const [nextDiagnostics, nextRuns] = await Promise.all([window.lk.aiDiagnosticsList(conversationId), window.lk.agentRunsList(conversationId)])
      // 切换对话时，慢返回的旧列表不能覆盖新列表。
      if (ticket !== sequence) return
      diagnostics.value = nextDiagnostics; runs.value = nextRuns; error.value = ''
    } catch (reason: unknown) { if (ticket === sequence) error.value = reason instanceof Error ? reason.message : '运行记录加载失败' }
  }
  async function prepare(id: string, inputs: AgentToolInput[]): Promise<AgentRun> {
    const run = await window.lk.agentRunPrepare(id, inputs)
    capture({ agentRun: run })
    return run
  }
  async function decide(id: string, stepId: string, decision: 'approve' | 'reject' | 'retry'): Promise<void> {
    if (busy.value) return
    busy.value = true; error.value = ''
    const previous = runs.value.find(run => run.id === id)
    if (decision === 'approve' && previous) capture({ agentRun: { ...previous, status: 'executing', steps: previous.steps.map(step => step.id === stepId ? { ...step, status: 'running' } : step) } })
    try { capture({ agentRun: await window.lk.agentStepDecide(id, stepId, decision) }) }
    catch (reason: unknown) {
      if (previous) capture({ agentRun: previous })
      await refresh(currentConversation)
      error.value = reason instanceof Error ? reason.message : '步骤操作失败'
    }
    finally { busy.value = false }
  }
  async function clearDiagnostics(): Promise<void> {
    await window.lk.aiDiagnosticsClear()
    // 失效正在加载的列表，避免清空后被旧响应填回。
    sequence++; diagnostics.value = []
  }
  return { diagnostics, runs, busy, error, capture, refresh, prepare, decide, clearDiagnostics }
})
