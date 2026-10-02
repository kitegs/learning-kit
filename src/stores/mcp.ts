import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { McpStatus } from '../../electron/shared/mcp'

export const useMcpStore = defineStore('mcp', () => {
  const status = ref<McpStatus>({ enabled: false, running: false, pending: 0, error: null })
  const busy = ref(false), error = ref('')
  let sequence = 0
  function capture(next: McpStatus): void {
    // 推送事件比已发出的读取更新；事件和配置都失效旧响应。
    sequence++; status.value = next
  }
  async function refresh() {
    if (busy.value) return
    const ticket = ++sequence
    try { const next = await window.lk.mcpStatus(); if (ticket === sequence) { status.value = next; error.value = '' } }
    catch (e) { if (ticket === sequence) error.value = e instanceof Error ? e.message : '无法读取 MCP 状态' }
  }
  async function configure(enabled: boolean, rotate = false) {
    if (busy.value) return
    const ticket = ++sequence
    busy.value = true; error.value = ''
    try { const next = await window.lk.mcpConfigure(enabled, rotate); if (ticket === sequence) status.value = next }
    catch (e) { error.value = e instanceof Error ? e.message : '更新失败' }
    finally { busy.value = false }
  }
  async function copyConfig() {
    error.value = ''
    try { await navigator.clipboard.writeText(JSON.stringify(await window.lk.mcpClientConfig(), null, 2)); return true }
    catch (e) { error.value = e instanceof Error ? e.message : '复制失败'; return false }
  }
  return { status, busy, error, capture, refresh, configure, copyConfig }
})
