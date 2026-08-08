import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ThemeId = 'dark' | 'light' | 'paper' | 'sepia' | 'forest'

export interface GroupNode {
  id: string
  parentId: string | null
  title: string
  sort: number
  expanded: boolean
  children: GroupNode[]
}

export interface Conv {
  id: string
  group_id: string | null
  title: string
  sort: number
  created_at?: string
  updated_at?: string
}

export interface Msg {
  id: string
  conversation_id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  note?: string | null
  model?: string | null
  sort?: number
  turn_id?: string
  parent_turn_id?: string | null
  collapsed?: number
  fold_id?: string | null
  origin_conversation_id?: string | null
  origin_fold_id?: string | null
  origin_sort?: number | null
}

export const useChatStore = defineStore('chat', () => {
  const groups = ref<GroupNode[]>([])
  const convs = ref<Conv[]>([])
  const currentConvId = ref<string | null>(null)
  const activeMessages = ref<Msg[]>([])

  function buildTree(rows: any[]): GroupNode[] {
    const map = new Map<string, GroupNode>()
    const roots: GroupNode[] = []
    for (const r of rows) {
      map.set(r.id, {
        id: r.id,
        parentId: r.parent_id ?? null,
        title: r.title,
        sort: r.sort,
        expanded: !!r.expanded,
        children: []
      })
    }
    for (const r of rows) {
      const node = map.get(r.id)!
      const parent = map.get(r.parent_id ?? '')
      if (parent) parent.children.push(node)
      else roots.push(node)
    }
    const sortRec = (arr: GroupNode[]) => {
      arr.sort((a, b) => a.sort - b.sort)
      arr.forEach((n) => sortRec(n.children))
    }
    sortRec(roots)
    return roots
  }

  async function refreshGroups() {
    const rows = await window.lk.groupsTree()
    groups.value = buildTree(rows)
  }

  async function refreshConvs(groupId: string | null) {
    convs.value = await window.lk.convList(groupId)
  }

  async function selectConv(id: string) {
    currentConvId.value = id
    activeMessages.value = await window.lk.msgList(id)
  }

  async function newConv(groupId: string | null = null, title = '新的对话'): Promise<Conv> {
    const id = await window.lk.uuid()
    const sort = Math.floor(Date.now() / 1000)
    await window.lk.convUpsert({ id, group_id: groupId, title, sort })
    const conv: Conv = { id, group_id: groupId, title, sort }
    convs.value = [...convs.value, conv]
    return conv
  }

  async function saveNewMessage(m: Partial<Msg> & { conversation_id: string }): Promise<string> {
    const id = await window.lk.uuid()
    await window.lk.msgSave({
      id,
      conversation_id: m.conversation_id,
      role: m.role ?? 'user',
      content: m.content ?? '',
      note: m.note ?? null,
      model: m.model ?? null,
      sort: m.sort ?? Math.floor(Date.now() / 1000),
      turn_id: m.turn_id,
      parent_turn_id: m.parent_turn_id ?? null,
      collapsed: m.collapsed ?? 0,
      fold_id: m.fold_id ?? null
    })
    return id
  }

  async function patchMessage(id: string, patch: { content?: string; note?: string | null }) {
    await window.lk.msgPatch(id, patch)
  }

  async function deleteMessage(id: string) {
    await window.lk.msgDelete(id)
    activeMessages.value = activeMessages.value.filter((m) => m.id !== id)
  }

  async function deleteConv(id: string) {
    await window.lk.convDelete(id)
    convs.value = convs.value.filter((c) => c.id !== id)
    if (currentConvId.value === id) {
      activeMessages.value = []
      currentConvId.value = null
    }
  }

  return {
    groups,
    convs,
    activeMessages,
    currentConvId,
    refreshGroups,
    refreshConvs,
    selectConv,
    newConv,
    saveNewMessage,
    patchMessage,
    deleteMessage,
    deleteConv,
    buildTree
  }
})

export const useSettingsStore = defineStore('settings', () => {
  const provider = ref('deepseek')
  const model = ref('deepseek-v4-flash')
  const models: Record<string, string[]> = { openai: [], deepseek: [], dashscope: [], custom: [] }
  const apiKeys = ref<Record<string, string>>({})
  const customBaseUrl = ref('')
  const systemPrompt = ref('')
  const temperature = ref(0.6)
  const theme = ref<ThemeId>('dark')
  const connected = ref(false)
  const testMode = ref(false)
  const noteAutosaveMs = ref(900)
  const readerTheme = ref<'paper' | 'sepia' | 'night'>('paper')
  const reviewNewLimit = ref(30)

  const defaultShortcuts = {
    search: 'Ctrl+K',
    newConv: 'Ctrl+N',
    newNote: 'Ctrl+Shift+N',
    toggleTheme: 'Ctrl+L',
    sendMessage: 'Ctrl+Enter',
    saveNote: 'Ctrl+S',
    pageLeft: 'ArrowLeft',
    pageRight: 'ArrowRight',
    pageFirst: 'Home',
    pageLast: 'End',
    centerPage: 'Ctrl+0',
    addBookmark: 'Ctrl+D',
    fullscreen: 'F11',
    undo: 'Ctrl+Z',
    redo: 'Ctrl+Shift+Z',
    deleteSelected: 'Delete',
    cancel: 'Escape',
  }
  const shortcuts = ref<Record<string, string>>({ ...defaultShortcuts })

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', theme.value)
  }

  async function load() {
    provider.value = (await window.lk.getSetting('provider')) || 'deepseek'
    model.value = (await window.lk.getSetting('model')) || 'deepseek-v4-flash'
    temperature.value = Number(await window.lk.getSetting('temperature')) || 0.6
    customBaseUrl.value = (await window.lk.getSetting('customBaseUrl')) || ''
    testMode.value = (await window.lk.getSetting('testMode')) === 'true'
    const t = await window.lk.getSetting('theme')
    theme.value = t === 'light' || t === 'paper' || t === 'sepia' || t === 'forest' ? t : 'dark'
    applyTheme()
    // load shortcuts
    const raw = await window.lk.getSetting('shortcuts')
    if (raw) try { shortcuts.value = { ...defaultShortcuts, ...JSON.parse(raw) } } catch { shortcuts.value = { ...defaultShortcuts } }
    const rows = await window.lk.allSettings()
    for (const r of rows) { if (r.key.startsWith('apiKey.')) apiKeys.value[r.key.slice('apiKey'.length)] = r.value }
    for (const p of ['openai', 'deepseek', 'dashscope', 'custom']) { models[p] = await window.lk.aiModels(p) }
    if (!model.value && models[provider.value]?.length) model.value = models[provider.value][0]
    systemPrompt.value = await window.lk.aiSystemPrompt()
    noteAutosaveMs.value = Number(await window.lk.getSetting('noteAutosaveMs')) || 900
    const storedReaderTheme = await window.lk.getSetting('readerTheme')
    readerTheme.value = storedReaderTheme === 'sepia' || storedReaderTheme === 'night' ? storedReaderTheme : 'paper'
    reviewNewLimit.value = Number(await window.lk.getSetting('reviewNewLimit')) || 30
  }

  async function saveShortcuts() {
    await window.lk.setSetting('shortcuts', JSON.stringify(shortcuts.value))
  }

  async function setTheme(t: ThemeId) { theme.value = t; applyTheme(); await window.lk.setSetting('theme', t) }
  async function saveAll() {
    await window.lk.setSetting('provider', provider.value); await window.lk.setSetting('model', model.value)
    await window.lk.setSetting('temperature', String(temperature.value)); await window.lk.setSetting('customBaseUrl', customBaseUrl.value)
    await window.lk.setSetting('testMode', String(testMode.value))
    await window.lk.setSetting('theme', theme.value)
    await window.lk.setSetting('noteAutosaveMs', String(noteAutosaveMs.value))
    await window.lk.setSetting('readerTheme', readerTheme.value)
    await window.lk.setSetting('reviewNewLimit', String(reviewNewLimit.value))
    await saveShortcuts()
    for (const [k, v] of Object.entries(apiKeys.value)) await window.lk.setSetting('apiKey.' + k, v)
  }

  function modelList(): string[] { return models[provider.value] || [] }
  function currentApiKey(): string { return apiKeys.value[provider.value] || '' }
  async function saveApiKey() { await window.lk.setSetting('apiKey.' + provider.value, apiKeys.value[provider.value] || '') }
  function setConnected(v: boolean) { connected.value = v }
  function getShortcut(key: string): string { return shortcuts.value[key] || (defaultShortcuts as any)[key] || '' }

  return { provider, model, models, apiKeys, customBaseUrl, systemPrompt, temperature, theme, connected, testMode, noteAutosaveMs, readerTheme, reviewNewLimit, shortcuts, defaultShortcuts, load, saveAll, setTheme, applyTheme, modelList, currentApiKey, saveApiKey, setConnected, saveShortcuts, getShortcut }
})
