import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ToolCenterQuery, ToolCenterSnapshot, ToolSource, ToolStatus } from '../../electron/shared/tools'
import { useMcpStore } from './mcp'

export const useToolCenterStore = defineStore('tool-center', () => {
  const snapshot = ref<ToolCenterSnapshot>({ pending: { items: [], total: 0, page: 1, pageSize: 12 }, history: { items: [], total: 0, page: 1, pageSize: 12 } })
  const query = ref<ToolCenterQuery>({ pendingPage: 1, historyPage: 1 })
  const loading = ref(false), busy = ref(false), loadError = ref(''), actionError = ref(''), notice = ref('')
  const mcp = useMcpStore()
  let sequence = 0, timer: ReturnType<typeof setTimeout> | undefined
  async function refresh(): Promise<void> {
    if (timer) { clearTimeout(timer); timer = undefined }
    const ticket = ++sequence
    loading.value = true
    try {
      const next = await window.lk.toolCenter({ ...query.value })
      if (ticket !== sequence) return
      snapshot.value = next; query.value.pendingPage = next.pending.page; query.value.historyPage = next.history.page
      loadError.value = ''
    } catch (e) { if (ticket === sequence) loadError.value = e instanceof Error ? e.message : '操作记录加载失败' }
    finally { if (ticket === sequence) loading.value = false }
  }
  function scheduleRefresh(): void {
    // 事件到达时就失效旧读；短时间连续导入合并为一次读取，避免刷新风暴。
    sequence++
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = undefined; void refresh() }, 80)
  }
  async function filter(source?: ToolSource, status?: Exclude<ToolStatus, 'pending_confirmation'>): Promise<void> {
    query.value = { source, status, pendingPage: 1, historyPage: 1 }; await refresh()
  }
  async function page(kind: 'pending' | 'history', value: number): Promise<void> {
    query.value[kind === 'pending' ? 'pendingPage' : 'historyPage'] = value; await refresh()
  }
  async function decide(ids: string[], decision: 'approve' | 'reject' | 'undo'): Promise<void> {
    if (busy.value || !ids.length) return
    busy.value = true; actionError.value = ''; notice.value = ''; sequence++; loading.value = false
    const errors: string[] = []; let completed = 0
    try {
      // 串行执行保留操作顺序；同名提案第二次确认会重新校验，不会并发绕过约束。
      for (const id of new Set(ids)) {
        try {
          const result = await (decision === 'approve' ? window.lk.toolApprove(id) : decision === 'reject' ? window.lk.toolReject(id) : window.lk.toolUndo(id))
          if (result.status === 'failed') errors.push(result.error || '操作失败')
          else completed++
        } catch (e) { errors.push(e instanceof Error ? e.message : '操作失败') }
      }
      actionError.value = [...new Set(errors)].join('；')
      notice.value = completed ? `已${decision === 'approve' ? '执行' : decision === 'reject' ? '拒绝' : '撤销'} ${completed} 项` : ''
      await refresh(); await mcp.refresh()
    } finally { busy.value = false }
  }
  return { snapshot, query, loading, busy, loadError, actionError, notice, refresh, scheduleRefresh, filter, page, decide }
})
