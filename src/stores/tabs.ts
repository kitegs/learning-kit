import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type TabType = 'chat' | 'note' | 'ebook' | 'mindmap' | 'review' | 'library'

export interface Tab {
  id: string
  type: TabType
  title: string
  data: {
    convId?: string
    noteId?: string
    bookId?: string
    mindmapId?: string
  }
  pinned?: boolean
  preview?: boolean
}

const uid = () => Math.random().toString(36).slice(2, 10)

export const useTabStore = defineStore('tabs', () => {
  const tabs = ref<Tab[]>([
    { id: uid(), type: 'chat', title: 'Chat', data: {} }
  ])
  const activeId = ref(tabs.value[0].id)

  const activeTab = computed(() => tabs.value.find(t => t.id === activeId.value) || tabs.value[0])

  function activate(id: string) { activeId.value = id }

  function openTab(tab: Omit<Tab, 'id'> & { id?: string }): Tab {
    // if preview tab of same type+data exists, replace it
    if (!tab.pinned) {
      const existing = tabs.value.find(t =>
        t.preview && t.type === tab.type &&
        JSON.stringify(t.data) === JSON.stringify(tab.data)
      )
      if (existing) {
        existing.title = tab.title
        existing.preview = false
        activeId.value = existing.id
        return existing
      }
      // check if same type+data already open (non-preview)
      const dup = tabs.value.find(t =>
        t.type === tab.type &&
        JSON.stringify(t.data) === JSON.stringify(tab.data)
      )
      if (dup) { activeId.value = dup.id; return dup }
    }
    const id = tab.id || uid()
    const newTab: Tab = { ...tab, id }
    // insert after active tab
    const idx = tabs.value.findIndex(t => t.id === activeId.value)
    tabs.value.splice(idx + 1, 0, newTab)
    activeId.value = id
    return newTab
  }

  function closeTab(id: string) {
    const idx = tabs.value.findIndex(t => t.id === id)
    if (idx < 0) return
    const wasActive = activeId.value === id
    // A reader must always have a visible exit. Replacing the last ebook tab
    // with the library home is clearer than making its close button a no-op.
    if (tabs.value.length === 1) {
      if (tabs.value[0].type === 'ebook') {
        tabs.value[0] = { id, type: 'library', title: '图书馆', data: {} }
        activeId.value = id
      }
      return
    }
    tabs.value.splice(idx, 1)
    if (wasActive) {
      activeId.value = tabs.value[Math.min(idx, tabs.value.length - 1)].id
    }
  }

  function closeOthers(id: string) {
    tabs.value = tabs.value.filter(t => t.id === id || t.pinned)
    activeId.value = id
  }

  function closeRight(id: string) {
    const idx = tabs.value.findIndex(t => t.id === id)
    tabs.value = tabs.value.filter((t, i) => i <= idx || t.pinned)
    if (!tabs.value.find(t => t.id === activeId.value)) activeId.value = id
  }

  function pinTab(id: string) {
    const t = tabs.value.find(t => t.id === id)
    if (t) { t.pinned = !t.pinned; t.preview = false }
  }

  function renameTab(id: string, title: string) {
    const t = tabs.value.find(t => t.id === id)
    if (t) t.title = title
  }

  function moveTab(fromIdx: number, toIdx: number) {
    const [item] = tabs.value.splice(fromIdx, 1)
    tabs.value.splice(toIdx, 0, item)
  }

  // wheel scroll on tab bar
  function onTabWheel(e: WheelEvent) {
    const el = e.currentTarget as HTMLElement
    if (el) el.scrollLeft += e.deltaY
  }

  return { tabs, activeId, activeTab, activate, openTab, closeTab, closeOthers, closeRight, pinTab, renameTab, moveTab, onTabWheel }
})
