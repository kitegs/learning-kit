<template>
  <div class="app-root" @drop.prevent @dragover.prevent>
    <Dock :mode="mode" :outline-items="outlineItems" :tag-items="tagItems" :bookmark-items="bookmarkItems" @switch="onModeSwitch" @outline-click="onOutlineClick" />
    <template v-if="mode === 'chat'">
      <SidebarView :style="{ width: sideWidth + 'px' }" class="side chat-side" />
      <div class="resizer" @mousedown="startResize"></div>
    </template>
    <main class="content">
      <header class="topbar">
        <div class="title-area">
          <el-icon class="mode-icon"><component :is="modeIcon" /></el-icon>
          <el-input v-if="mode === 'chat'" v-model="titleDraft" class="title-input" size="small" placeholder="对话标题" @change="applyTitle" @blur="applyTitle" />
          <span v-else class="mode-title">{{ modeTitle }}</span>
          <el-tag v-if="mode === 'chat'" size="small" type="info" effect="dark">{{ settings.provider }} - {{ settings.model }}</el-tag>
        </div>
        <div class="toolbar">
          <el-button size="small" @click="searchOpen=true">搜索</el-button>
          <el-button v-if="mode === 'chat'" size="small" @click="openStudyPlan">学习方案</el-button>
          <el-button size="small" @click="openSettings">设置</el-button>
          <el-button v-if="mode === 'chat'" size="small" type="primary" @click="newBlankConv">新建空笔记</el-button>
        </div>
      </header>
      <TabBar />
      <div class="view-slot">
        <component :is="contentComponent" :bookIdProp="openBookId" @open-book="openBook" @back="onReaderBack" @ask-ai="onAskFromReader" />
      </div>
      <template v-if="mode === 'chat'">
        <ComposeBar @send="onSend" :streaming="streaming" @abort="onAbort" />
      </template>
    </main>
    <SettingsDialog v-model="settingsVisible" @saved="onSettingsSaved" />
    <StudyPlanDialog v-model="studyPlanVisible" @created="onStudyPlanCreated" />
    <ContextOverlay />
    <SearchOverlay :open="searchOpen" @close="searchOpen=false" @jump="onSearchJump" />
    <SelectionToolbar />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { ChatDotRound, Reading, Edit, Share, DataLine } from '@element-plus/icons-vue'
import Dock from './components/Dock.vue'
import SidebarView from './views/SidebarView.vue'
import ChatView from './views/ChatView.vue'
import ComposeBar from './components/ComposeBar.vue'
import SettingsDialog from './views/SettingsDialog.vue'
import StudyPlanDialog from './views/StudyPlanDialog.vue'
import LibraryView from './views/LibraryView.vue'
import PdfReaderView from './views/PdfReaderView.vue'
import EpubReaderView from './views/EpubReaderView.vue'
import NotesView from './views/NotesView.vue'
import MindmapView from './views/MindmapView.vue'
import ReviewView from './views/ReviewView.vue'
import ContextOverlay from './components/ContextOverlay.vue'
import SearchOverlay from './components/SearchOverlay.vue'
import SelectionToolbar from './components/SelectionToolbar.vue'
import TabBar from './components/TabBar.vue'
import { useTabStore } from './stores/tabs'
import { useChatStore, useSettingsStore } from './stores/chat'

export type Mode = 'chat' | 'library' | 'notes' | 'mindmap' | 'review'

const chat = useChatStore()
const settings = useSettingsStore()
const tabStore = useTabStore()
const settingsVisible = ref(false)
const studyPlanVisible = ref(false)
const sideWidth = ref(280)
const titleDraft = ref('')
const streaming = ref(false)
const mode = ref<Mode>('chat')
const openBookId = ref<string | null>(null)
const searchOpen = ref(false)

// watch tab activation -> switch mode + data
watch(() => tabStore.activeTab, (tab) => {
  if (!tab) return
  const m = tab.type === 'ebook' ? 'library' : tab.type === 'note' ? 'notes' : tab.type === 'mindmap' ? 'mindmap' : tab.type === 'review' ? 'review' : tab.type === 'library' ? 'library' : 'chat'
  mode.value = m as Mode
  if (tab.data.bookId) openBookId.value = tab.data.bookId
})

const jumpToNoteId = ref<string | null>(null)
const jumpToHighlight = ref<{ bookId: string; page: number } | null>(null)
const bookKind = ref<'pdf' | 'epub'>('pdf')

// dock panel data
const outlineItems = computed(() => {
  // extract headings from current note body or chat messages
  const body = chat.activeMessages?.map((m: any) => m.content).join('\n') || ''
  const lines = body.split('\n')
  const items: {level:number;text:string;line:number}[] = []
  lines.forEach((l: string, i: number) => {
    const m = l.match(/^(#{1,6})\s+(.+)/)
    if (m) items.push({ level: m[1].length, text: m[2], line: i })
  })
  return items
})
const tagItems = computed(() => {
  const tags = new Set<string>()
  const body = chat.activeMessages?.map((m: any) => m.content).join(' ') || ''
  body.replace(/#(\w[\w-]*)/g, (_: string, t: string) => { tags.add(t); return '' })
  return [...tags]
})
const bookmarkItems = ref<any[]>([])

function onOutlineClick(_line: number) {
  // scroll to line in editor - dispatch event
}

let activeAbort: (() => void) | null = null
let currentReqId: string | null = null

const modeIcon = computed(() => {
  switch (mode.value) {
    case 'library': return Reading
    case 'notes': return Edit
    case 'mindmap': return Share
    case 'review': return DataLine
    default: return ChatDotRound
  }
})
const modeTitle = computed(() => {
  const m: Record<string, string> = { library: '图书馆', notes: '笔记', mindmap: '思维导图', review: '复习' }
  return m[mode.value] || '对话'
})
const contentComponent = computed(() => {
  if (mode.value === 'chat') return ChatView
  if (mode.value === 'library' && openBookId.value) return bookKind.value === 'epub' ? EpubReaderView : PdfReaderView
  if (mode.value === 'library') return LibraryView
  if (mode.value === 'notes') return NotesView
  if (mode.value === 'mindmap') return MindmapView
  if (mode.value === 'review') return ReviewView
  return ChatView
})
watch(openBookId, async (id) => {
  if (!id) return
  const list = await window.lk.bookList()
  const b = list.find((x: any) => x.id === id)
  bookKind.value = b?.kind || 'pdf'
})

function onModeSwitch(m: Mode) { mode.value = m; if (m !== 'library') openBookId.value = null }
function startResize(e: MouseEvent) {
  const startX = e.clientX; const startW = sideWidth.value
  const move = (ev: MouseEvent) => { sideWidth.value = Math.max(220, Math.min(560, startW + (ev.clientX - startX))) }
  const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
}
function openSettings() { settingsVisible.value = true }
function openStudyPlan() { studyPlanVisible.value = true }
async function newBlankConv() {
  const c = await chat.newConv(null, '空白笔记 ' + new Date().toLocaleTimeString())
  await chat.refreshConvs(null); await chat.selectConv(c.id)
}
function watchCurrentConv() { titleDraft.value = chat.convs.find((c) => c.id === chat.currentConvId)?.title || '' }
watch(() => chat.currentConvId, watchCurrentConv)
function applyTitle() {
  if (!chat.currentConvId) return
  window.lk.convRename(chat.currentConvId, titleDraft.value || '未命名')
  const c = chat.convs.find((x) => x.id === chat.currentConvId)
  if (c) c.title = titleDraft.value
}
function onSettingsSaved() {}
function onReaderBack() { openBookId.value = null }
function onSearchJump(target: { kind: string; id?: string; conversationId?: string; bookId?: string; deckId?: string; page?: number }) {
  searchOpen.value = false
  if (target.kind === 'conv' && target.id) { mode.value = 'chat'; chat.selectConv(target.id) }
  else if (target.kind === 'msg' && target.conversationId) { mode.value = 'chat'; chat.selectConv(target.conversationId) }
  else if (target.kind === 'note' && target.id) { mode.value = 'notes'; jumpToNoteId.value = target.id }
  else if (target.kind === 'mindmap') { mode.value = 'mindmap' }
  else if (target.kind === 'book' && target.id) { mode.value = 'library'; openBookId.value = target.id }
  else if (target.kind === 'highlight' && target.bookId) { mode.value = 'library'; openBookId.value = target.bookId; jumpToHighlight.value = { bookId: target.bookId, page: target.page || 1 } }
  else if (target.kind === 'card') { mode.value = 'review' }
}
function matchShortcut(e: KeyboardEvent, sc: string): boolean {
  if (!sc) return false
  const parts = sc.split('+').map((p) => p.trim())
  const needCtrl = parts.includes('Ctrl') || parts.includes('Cmd')
  const needShift = parts.includes('Shift')
  const needAlt = parts.includes('Alt')
  const targetKey = parts[parts.length - 1].toUpperCase()
  const isSingleKey = parts.length === 1
  if (needCtrl && !e.ctrlKey && !e.metaKey) return false
  if (needShift && !e.shiftKey) return false
  if (needAlt && !e.altKey) return false
  if (isSingleKey && (e.ctrlKey || e.metaKey || e.altKey)) return false
  return e.key.toUpperCase() === targetKey
}

function onKeyDown(e: KeyboardEvent) {
  // skip when typing in inputs/textareas
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
    if (!(e.ctrlKey || e.metaKey)) return
  }
  const sc = settings.getShortcut
  if (matchShortcut(e, sc('search'))) { e.preventDefault(); searchOpen.value = true; return }
  if (matchShortcut(e, sc('newConv'))) { e.preventDefault(); newBlankConv(); return }
  if (matchShortcut(e, sc('toggleTheme'))) { e.preventDefault(); settings.setTheme(settings.theme === 'dark' ? 'light' : 'dark'); return }
  if (matchShortcut(e, sc('saveNote'))) {
    e.preventDefault(); window.dispatchEvent(new CustomEvent('lk:save-note')); return
  }
  if (matchShortcut(e, sc('sendMessage'))) { e.preventDefault(); window.dispatchEvent(new CustomEvent('lk:send-message')); return }
  // tab shortcuts
  if ((e.ctrlKey || e.metaKey) && e.key === 't') { e.preventDefault(); tabStore.openTab({ type: 'chat', title: 'Chat', data: {} }); return }
  if ((e.ctrlKey || e.metaKey) && e.key === 'w') { e.preventDefault(); tabStore.closeTab(tabStore.activeId); return }
}
function openBook(id: string) {
  openBookId.value = id; mode.value = 'library'
  window.lk.bookList().then(books => { const b = books.find((x: any) => x.id === id); tabStore.openTab({ type: 'ebook', title: b?.title || 'Book', data: { bookId: id } }) })
  window.lk.bookUpdate(id, {}).catch(() => {})
}
async function onAskFromReader(payload: { quote: string; question?: string; bookId: string; page: number }) {
  mode.value = 'chat'
  if (!chat.currentConvId) { const c = await chat.newConv(null, '电子书问答'); await chat.selectConv(c.id) }
  await onSend(`【电子书选段, 第 ${payload.page} 页】\n> ${payload.quote}\n\n${payload.question || '请解析这段内容'}`)
}
async function onStudyPlanCreated(planText: string) {
  if (!chat.currentConvId) { const c = await chat.newConv(null, '学习方案'); await chat.selectConv(c.id) }
  await onSend(planText)
}
async function onSend(text: string) {
  if (streaming.value) return
  if (!chat.currentConvId) { const c = await chat.newConv(null, text.slice(0, 30) || '新对话'); await chat.selectConv(c.id) }
  const convId = chat.currentConvId!
  const userMsg: any = { id: await window.lk.uuid(), conversation_id: convId, role: 'user', content: text, note: null, sort: Math.floor(Date.now() / 1000) }
  await window.lk.msgSave(userMsg); chat.activeMessages.push(userMsg)
  const assistantMsg: any = { id: await window.lk.uuid(), conversation_id: convId, role: 'assistant', content: '', model: settings.model, sort: Math.floor(Date.now() / 1000) + 1 }
  assistantMsg.id = await chat.saveNewMessage(assistantMsg); chat.activeMessages.push(assistantMsg)
  streaming.value = true; activeAbort?.()
  currentReqId = await window.lk.uuid()
  const history = chat.activeMessages.filter((m) => m.id !== assistantMsg.id).map((m) => ({ role: m.role, content: m.content })).slice(-12)
  activeAbort = window.lk.onAiChunk(currentReqId, (p: any) => {
    if (p.error) assistantMsg.content += `\n\n> 错误: ${p.error}`
    if (p.delta) assistantMsg.content += p.delta
    if (p.done) { streaming.value = false; window.lk.msgPatch(assistantMsg.id, { content: assistantMsg.content }).then(() => window.lk.convTouch(convId)) }
  })
  await window.lk.aiChatStart({ requestId: currentReqId, provider: settings.provider, model: settings.model, messages: history, temperature: settings.temperature, apiKey: settings.currentApiKey(), baseUrl: settings.provider === 'custom' ? settings.customBaseUrl : undefined })
}
function onAbort() { if (currentReqId) window.lk.aiChatAbort(currentReqId); streaming.value = false; activeAbort?.(); activeAbort = null }

onMounted(async () => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('lk:ai-action', onAiAction as EventListener)
  await settings.load(); await chat.refreshGroups(); await chat.refreshConvs(null)
  if (chat.convs.length === 0) {
    const c = await chat.newConv(null, '欢迎')
    chat.activeMessages.push({ id: 'welcome', conversation_id: c.id, role: 'assistant', content: '你好，我是你的私人学习助手。\n\n- 左侧切换 对话 / 图书馆 / 笔记 / 思维导图 / 复习模式\n- 对话模式下可在树里建目录折叠管理对话\n- 图书馆导入PDF后可划线选段向我提问\n- 在设置里填好API Key即可开始', model: 'welcome' } as any)
  }
  await chat.selectConv(chat.convs[0].id)
})
async function onAiAction(e: Event) {
  const { text, prompt } = (e as CustomEvent).detail
  mode.value = 'chat'
  if (!chat.currentConvId) { const c = await chat.newConv(null, 'AI Action'); await chat.selectConv(c.id) }
  await onSend(`${prompt}\n\n---\n${text}`)
}

onUnmounted(() => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('lk:ai-action', onAiAction as EventListener); activeAbort?.() })
</script>

<style scoped lang="scss">
.app-root { display: flex; height: 100vh; width: 100vw; }
.side { height: 100vh; }
.resizer { width: 4px; cursor: col-resize; background: var(--border); &:hover { background: var(--accent); } }
.content { flex: 1; display: flex; flex-direction: column; min-width: 0; height: 100vh; }
.view-slot { flex: 1; display: flex; min-height: 0; overflow: hidden; }
.topbar { height: 44px; flex: 0 0 44px; display: flex; align-items: center; justify-content: space-between; padding: 0 12px; background: var(--bg-soft); border-bottom: 1px solid var(--border); }
.title-area { display: flex; gap: 8px; align-items: center; flex: 1; min-width: 0; }
.title-input { max-width: 360px; background: transparent; }
.toolbar { display: flex; gap: 8px; }
.mode-icon { color: var(--accent); font-size: 18px; }
.mode-title { font-weight: 600; }
</style>