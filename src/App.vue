<template>
  <Dock :mode="mode" :outline-items="outlineItems" :tag-items="tagItems" :bookmark-items="bookmarkItems" @switch="onModeSwitch" @outline-click="onOutlineClick">
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
          <el-tag v-if="mode === 'chat'" size="small" :type="settings.testMode ? 'warning' : (settings.connected ? 'success' : 'info')" :effect="settings.testMode || settings.connected ? 'dark' : 'plain'" :class="{'tag-glow': settings.connected && !settings.testMode}">{{ settings.testMode ? '测试模式 · 本地预设回复' : `${settings.provider} - ${settings.model}` }}</el-tag>
        </div>
        <div class="toolbar">
          <el-button size="small" @click="searchOpen=true">搜索</el-button>
          <el-button v-if="mode === 'chat'" size="small" @click="openStudyPlan">学习方案</el-button>
          <el-button size="small" @click="openSettings">设置</el-button>
          <el-button size="small" type="primary" @click="newBlankNote">新建笔记</el-button>
          <el-button v-if="mode === 'chat' && openBookId" size="small" type="warning" @click="goBackToBook">← 回到电子书</el-button>
        </div>
      </header>
      <TabBar />
      <div class="view-slot">
        <component :is="contentComponent" :key="mode === 'library' && openBookId ? `reader:${openBookId}` : mode" :bookIdProp="openBookId" :jump-note-id="jumpToNoteId" :jump-block-id="jumpToBlockId" :jump-page="jumpToHighlight?.page" :jump-href="jumpToBookHref" @open-book="openBook" @back="onReaderBack" @ask-ai="onAskFromReader" @followup="onFollowup" />
      </div>
      <template v-if="mode === 'chat'">
        <ComposeBar @send="onSend" :streaming="streaming" :citation="pendingCitation" @abort="onAbort" @dismiss-citation="pendingCitation = null" @open-tools="toolCenterOpen = true" @quick="onChatQuickAction" />
      </template>
    </main>
  </Dock>
  <SettingsDialog v-model="settingsVisible" @saved="onSettingsSaved" />
  <StudyPlanDialog v-model="studyPlanVisible" @created="onStudyPlanCreated" />
  <ContextOverlay />
  <SearchOverlay :open="searchOpen" @close="searchOpen=false" @jump="onSearchJump" />
  <SelectionToolbar @ai="onSelectionAi" />
  <AiToolCenter v-model="toolCenterOpen" :proposals="toolProposals" :history="toolHistory" @apply="applyToolProposals" @reject="ignoreToolProposals" />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { ChatDotRound, Reading, Edit, Share, DataLine, Collection } from '@element-plus/icons-vue'
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
import KnowledgeView from './views/KnowledgeView.vue'
import AttributeView from './views/AttributeView.vue'
import ContextOverlay from './components/ContextOverlay.vue'
import SearchOverlay from './components/SearchOverlay.vue'
import SelectionToolbar from './components/SelectionToolbar.vue'
import TabBar from './components/TabBar.vue'
import AiToolCenter, { type AiToolProposal } from './components/AiToolCenter.vue'
import { useTabStore } from './stores/tabs'
import { useChatStore, useSettingsStore } from './stores/chat'

export type Mode = 'chat' | 'library' | 'notes' | 'mindmap' | 'review' | 'knowledge' | 'attributes'

// ── user action log (ring buffer in localStorage) ──
const LOG_KEY = 'lk_action_log'
const LOG_MAX = 200
function log(action: string, detail = '') {
  try {
    const log: string[] = JSON.parse(localStorage.getItem(LOG_KEY) || '[]')
    log.push(`${Date.now()}|${action}|${detail.slice(0, 120)}`)
    if (log.length > LOG_MAX) log.splice(0, log.length - LOG_MAX)
    localStorage.setItem(LOG_KEY, JSON.stringify(log))
  } catch { /* ignore */ }
}
function dumpLog() {
  try {
    const log: string[] = JSON.parse(localStorage.getItem(LOG_KEY) || '[]')
    if (log.length) {
      console.log('=== LAST', log.length, 'ACTIONS ===')
      log.forEach(l => console.log('  ' + l))
    }
  } catch { /* ignore */ }
}
function clearLog() {
  localStorage.removeItem(LOG_KEY)
}

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
const pendingCitation = ref<{ bookTitle: string; bookId: string; page: number; quote: string } | null>(null)
const toolCenterOpen = ref(false)
const toolProposals = ref<AiToolProposal[]>([])
const toolHistory = ref<any[]>([])

let switchSeq = 0
function switchMode(target: Mode, ctx?: { bookId?: string; bookHref?: string; noteId?: string; blockId?: string; convId?: string; highlight?: { bookId: string; page: number } }) {
  const seq = ++switchSeq
  if (target !== 'chat') { streaming.value = false; activeAbort?.(); activeAbort = null; pendingCitation.value = null }
  // Keep the active reader route while the user works elsewhere.  The reader is
  // deliberately unmounted outside the library to release PDF/EPUB resources,
  // but its book id stays available so returning to "图书馆" restores the book.
  // Only the reader's explicit "返回" action clears this state.
  jumpToNoteId.value = null
  jumpToBlockId.value = null
  jumpToHighlight.value = null
  jumpToBookHref.value = null
  mode.value = target
  if (seq !== switchSeq) return
  if (ctx?.bookId) openBookId.value = ctx.bookId
  if (ctx?.noteId) jumpToNoteId.value = ctx.noteId
  if (ctx?.blockId) jumpToBlockId.value = ctx.blockId
  if (ctx?.convId) chat.selectConv(ctx.convId)
  if (ctx?.highlight) jumpToHighlight.value = ctx.highlight
  if (ctx?.bookHref) jumpToBookHref.value = ctx.bookHref
}

// watch tab activation -> switch mode + data
watch(() => tabStore.activeTab, (tab) => {
  if (!tab) return
  // A library tab is always the library home, not the last reader that was open.
  if (tab.type === 'library') openBookId.value = null
  const m = tab.type === 'ebook' ? 'library' : tab.type === 'note' ? 'notes' : tab.type === 'mindmap' ? 'mindmap' : tab.type === 'review' ? 'review' : tab.type === 'library' ? 'library' : 'chat'
  switchMode(m as Mode, { bookId: tab.data.bookId, noteId: tab.data.noteId })
})
watch(() => tabStore.tabs.map((tab) => `${tab.type}:${tab.data.bookId ?? ''}`).join('|'), () => {
  const id = openBookId.value
  if (id && !tabStore.tabs.some((tab) => tab.type === 'ebook' && tab.data.bookId === id)) openBookId.value = null
})

const jumpToNoteId = ref<string | null>(null)
const jumpToBlockId = ref<string | null>(null)
const jumpToHighlight = ref<{ bookId: string; page: number } | null>(null)
const jumpToBookHref = ref<string | null>(null)
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
    case 'knowledge': return Collection
    case 'attributes': return Collection
    default: return ChatDotRound
  }
})
const modeTitle = computed(() => {
  const m: Record<string, string> = { library: '图书馆', notes: '笔记', mindmap: '思维导图', review: '复习', knowledge: '知识库', attributes: '属性视图' }
  return m[mode.value] || '对话'
})
const contentComponent = computed(() => {
  if (mode.value === 'chat') return ChatView
  if (mode.value === 'library' && openBookId.value) return bookKind.value === 'epub' ? EpubReaderView : PdfReaderView
  if (mode.value === 'library') return LibraryView
  if (mode.value === 'notes') return NotesView
  if (mode.value === 'mindmap') return MindmapView
  if (mode.value === 'review') return ReviewView
  if (mode.value === 'knowledge') return KnowledgeView
  if (mode.value === 'attributes') return AttributeView
  return ChatView
})
watch(openBookId, async (id) => {
  if (!id) return
  const list = await window.lk.bookList()
  const b = list.find((x: any) => x.id === id)
  bookKind.value = b?.kind || 'pdf'
})

function openLibraryHome() {
  openBookId.value = null
  switchMode('library')
  tabStore.openTab({ type: 'library', title: '图书馆', data: {} })
}
function onModeSwitch(m: Mode) { log('mode_switch', m); if (m === 'library') openLibraryHome(); else switchMode(m) }
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
async function newBlankNote() {
  const title = '未命名笔记'
  const id = await window.lk.notesUpsert({ title, body: '', kind: 'note', sort: Date.now() })
  switchMode('notes', { noteId: id })
  tabStore.openTab({ type: 'note', title, data: { noteId: id } })
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
function onReaderBack() { log('reader_back'); openLibraryHome() }
function goBackToBook() { log('go_back_book'); switchMode('library') }
function onSearchJump(target: { kind: string; id?: string; conversationId?: string; bookId?: string; deckId?: string; page?: number; href?: string }) {
  log('search_jump', target.kind + (target.id ? ' ' + target.id.slice(0,8) : ''))
  searchOpen.value = false
  if (target.kind === 'conv' && target.id) switchMode('chat', { convId: target.id })
  else if (target.kind === 'msg' && target.conversationId) switchMode('chat', { convId: target.conversationId })
  else if (target.kind === 'note' && target.id) switchMode('notes', { noteId: target.id })
  else if (target.kind === 'mindmap') switchMode('mindmap')
  else if (target.kind === 'book' && target.id) switchMode('library', { bookId: target.id })
  else if (target.kind === 'highlight' && target.bookId) switchMode('library', { bookId: target.bookId, bookHref: target.href, highlight: { bookId: target.bookId, page: target.page || 1 } })
  else if (target.kind === 'card') switchMode('review')
  else if (target.kind === 'block' && target.id) window.dispatchEvent(new CustomEvent('lk:nav', { detail: { href: `app://block/${target.id}` } }))
  else if (target.kind === 'kp') switchMode('notes')
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
  if (matchShortcut(e, sc('newNote'))) { e.preventDefault(); newBlankNote(); return }
  if (matchShortcut(e, sc('toggleTheme'))) { e.preventDefault(); settings.setTheme(settings.theme === 'dark' ? 'light' : 'dark'); return }
  if (matchShortcut(e, sc('saveNote'))) {
    e.preventDefault(); window.dispatchEvent(new CustomEvent('lk:save-note')); return
  }
  if (matchShortcut(e, sc('sendMessage'))) { e.preventDefault(); window.dispatchEvent(new CustomEvent('lk:send-message')); return }
  // tab shortcuts
  if ((e.ctrlKey || e.metaKey) && e.key === 't') { e.preventDefault(); tabStore.openTab({ type: 'chat', title: 'Chat', data: {} }); return }
  if ((e.ctrlKey || e.metaKey) && e.key === 'w') { e.preventDefault(); tabStore.closeTab(tabStore.activeId); return }
}
async function openBook(id: string) {
  log('open_book', id.slice(0, 8))
  const books = await window.lk.bookList()
  const selected = books.find((x: any) => x.id === id)
  // Resolve the reader kind before the component mounts, preventing an EPUB
  // from briefly being created as a PDF reader on a cold reopen.
  bookKind.value = selected?.kind === 'epub' ? 'epub' : 'pdf'
  switchMode('library', { bookId: id })
  tabStore.openTab({ type: 'ebook', title: selected?.title || 'Book', data: { bookId: id } })
  window.lk.bookUpdate(id, {}).catch(() => {})
}
async function onAskFromReader(payload: { quote: string; question?: string; bookId: string; page: number }) {
  log('ask_from_reader', `book=${payload.bookId.slice(0,8)} page=${payload.page}`)
  switchMode('chat')
  // Find or create a folder named after the book
  const books = await window.lk.bookList()
  const book = books.find((b: any) => b.id === payload.bookId)
  const bookTitle = book?.title || 'Ebook'
  let groupId: string | null = null
  const existingGroups = await window.lk.groupsTree()
  const bookGroup = existingGroups.find((g: any) => g.title === bookTitle && !g.parent_id)
  if (bookGroup) {
    groupId = bookGroup.id
  } else {
    const gid = await window.lk.uuid()
    await window.lk.groupUpsert({ id: gid, parent_id: null, title: bookTitle, sort: Date.now(), expanded: 1 })
    groupId = gid
    await chat.refreshGroups()
  }
  // Reuse an existing conversation in this book's folder, or create one
  const existingConvs = await window.lk.convAll()
  const bookConv = existingConvs.findLast((c: any) => c.group_id === groupId && (c.origin_context || '').includes(payload.bookId))
  let convId: string
  if (bookConv) {
    convId = bookConv.id
    await chat.selectConv(convId)
    await window.lk.convTouch(convId)
  } else {
    const newC = await chat.newConv(groupId, '问答 · ' + bookTitle)
    convId = newC.id
    await chat.selectConv(convId)
    await window.lk.convUpsert({
      id: convId, group_id: groupId, title: newC.title,
      origin_context: JSON.stringify({ book_id: payload.bookId, book_title: bookTitle, page: payload.page, selected_text: payload.quote, trigger: 'selection_ask', first: true })
    } as any)
  }
  // Set citation preview — user edits prompt then sends manually
  pendingCitation.value = { bookTitle, bookId: payload.bookId, page: payload.page, quote: payload.quote }
}
async function onStudyPlanCreated(planText: string) {
  if (!chat.currentConvId) { const c = await chat.newConv(null, '学习方案'); await chat.selectConv(c.id) }
  await onSend(planText)
}
function localTestReply(text: string) {
  const topic = text.trim().replace(/\s+/g, ' ').slice(0, 72) || '这条学习问题'
  return `> 🧪 **测试模式 · 本地预设回复**\n> 此回复未调用 API，不消耗 Token；这轮问答已按正常方式保存，可用于测试追问、拖动和折叠。\n\n### 关于「${topic}」\n\n这是用于界面测试的固定示例回答。你可以将这轮拖进章节，或在下方继续追问，验证多级对话的整理效果。\n\n**测试要点**\n\n- 用户消息与 AI 回复属于同一轮\n- 可拖入折叠组或变成另一轮的追问\n- 切换对话、重启软件后仍会保留\n\n> 想恢复真实模型回答，请在“设置”中关闭测试模式。`
}
async function onSend(text: string, parentTurnId: string | null = null) {
  if (streaming.value) return
  log('send_start', text.slice(0, 60))
  const citation = pendingCitation.value
  if (citation) pendingCitation.value = null
  let convId: string | null = null
  let rMsg: any | null = null
  try {
    if (!chat.currentConvId) { const c = await chat.newConv(null, text.slice(0, 30) || 'New Chat'); await chat.selectConv(c.id) }
    convId = chat.currentConvId!
    const citationText = citation
      ? citation.page
        ? `> 📖 **${citation.bookTitle}** · 第 ${citation.page} 页\n> *"${citation.quote.slice(0, 300)}${citation.quote.length > 300 ? '...' : ''}"*\n\n`
        : `> 📝 **${citation.bookTitle}**\n> *"${citation.quote.slice(0, 300)}${citation.quote.length > 300 ? '...' : ''}"*\n\n`
      : ''
    const turnId = await window.lk.uuid()
    const userMsg: any = {
      id: await window.lk.uuid(), conversation_id: convId, role: 'user',
      content: citationText + text,
      note: citation ? JSON.stringify({ _citation: { book: citation.bookTitle, bookId: citation.bookId, page: citation.page, quote: citation.quote } }) : null,
      sort: Date.now(), turn_id: turnId, parent_turn_id: parentTurnId
    }
    await window.lk.msgSave(userMsg); chat.activeMessages.push(userMsg)
    const assistantMsg: any = { id: await window.lk.uuid(), conversation_id: convId, role: 'assistant', content: '', model: settings.testMode ? 'local-test' : settings.model, sort: Date.now() + 1, turn_id: turnId, parent_turn_id: parentTurnId }
    assistantMsg.id = await chat.saveNewMessage(assistantMsg)
    chat.activeMessages.push(assistantMsg)
    // grab the reactive proxy from the array so mutations trigger re-render
    rMsg = chat.activeMessages[chat.activeMessages.length - 1]
    if (settings.testMode) {
      rMsg.content = localTestReply(text)
      await window.lk.msgPatch(rMsg.id, { content: rMsg.content })
      await window.lk.convTouch(convId)
      log('test_reply', `len=${rMsg.content.length}`)
      return
    }
    if (!settings.currentApiKey()) {
      rMsg.content = `> 未配置 API Key。此轮对话已保存，可拖动、折叠或继续编辑。\n\n请在“设置”中配置 ${settings.provider} 的 API Key，或开启“测试模式”使用本地预设回复。`
      rMsg.model = 'system'
      await window.lk.msgPatch(rMsg.id, { content: rMsg.content })
      await window.lk.convTouch(convId)
      return
    }
    streaming.value = true; activeAbort?.()
    currentReqId = await window.lk.uuid()
    const requestConvId = convId
    const history = chat.activeMessages.filter((m) => m.id !== rMsg.id).map((m) => ({ role: m.role, content: m.content })).slice(-12)
    log('stream_start', currentReqId.slice(0, 8))
    activeAbort = window.lk.onAiChunk(currentReqId, (p: any) => {
      try {
        if (p.error) rMsg.content += `\n\n> Error: ${p.error}`
        if (p.delta) rMsg.content += p.delta
        if (p.done) {
          log('stream_done', `len=${rMsg.content.length}`)
          streaming.value = false
          const actions = parseActions(rMsg.content)
          if (actions.length) {
            toolProposals.value = actions.map((action, index) => ({ id: `${rMsg.id}:${index}`, type: action.type, params: action.params, rawBlock: action.rawBlock }))
            toolCenterOpen.value = true
            rMsg.content += '\n\n---\n> AI 已提出工具操作，请在“AI 工具管理中心”确认后执行。'
          }
          window.lk.msgPatch(rMsg.id, { content: rMsg.content }).catch((e: any) => console.warn('[chunk] msgPatch fail', e))
          window.lk.convTouch(requestConvId).catch((e: any) => console.warn('[chunk] convTouch fail', e))
        }
      } catch (e) { console.error('[onChunk]', e) }
    })
    await window.lk.aiChatStart({ requestId: currentReqId, provider: settings.provider, model: settings.model, messages: history, temperature: settings.temperature, apiKey: settings.currentApiKey(), baseUrl: settings.provider === 'custom' ? settings.customBaseUrl : undefined })
  } catch (err: any) {
    streaming.value = false
    log('send_error', err?.message || String(err))
    const msg = err?.message || String(err)
    console.error('[onSend] send failed:', err)
    if (rMsg) {
      rMsg.content = `**发送失败：** ${msg}\n\n这轮对话已保存。请检查设置中的 API Key、网络或切换到测试模式。`
      rMsg.model = 'error'
      window.lk.msgPatch(rMsg.id, { content: rMsg.content }).catch((e: any) => console.warn('[send] msgPatch fail', e))
    } else if (convId) {
      chat.activeMessages.push({ id: await window.lk.uuid(), conversation_id: convId, role: 'assistant', content: `**发送失败：** ${msg}`, model: 'error' } as any)
    }
  }
}
function onFollowup(payload: { text: string; parentTurnId: string }) { onSend(payload.text, payload.parentTurnId) }
function onAbort() { if (currentReqId) window.lk.aiChatAbort(currentReqId); streaming.value = false; activeAbort?.(); activeAbort = null }
function onChatQuickAction(action: 'summary' | 'study' | 'cards') {
  const prompts = { summary: '请总结当前对话的要点，并提出一个可确认的摘要笔记操作。', study: '请根据当前对话生成下一步学习计划，并提出一个可确认的学习计划操作。', cards: '请从当前对话生成 3 张高质量闪卡，并分别提出可确认的闪卡操作。' }
  onSend(prompts[action])
}

function onSelectionAi(text: string, action: string) {
  log('sel_ai', action + ' ' + text.slice(0, 40))
  pendingCitation.value = { bookTitle: '笔记选段', bookId: '', page: 0, quote: text }
  switchMode('chat')
}

// ── action parser & executor (PRD v3) ──
interface ParsedAction { type: string; params: string[]; rawBlock: string }
function parseActions(text: string): ParsedAction[] {
  const out: ParsedAction[] = []
  // Parse <kp>...</kp>
  let m: RegExpExecArray | null
  const reKp = /<kp>([\s\S]*?)<\/kp>/g
  while ((m = reKp.exec(text)) !== null) {
    out.push({ type: 'kp', params: m[1].split('|').map(s => s.trim()), rawBlock: m[0] })
  }
  // Parse <summary>...</summary>
  const reSum = /<summary>([\s\S]*?)<\/summary>/g
  while ((m = reSum.exec(text)) !== null) {
    out.push({ type: 'summary', params: [m[1].trim()], rawBlock: m[0] })
  }
  // Parse <mindmap>...</mindmap>
  const reMm = /<mindmap>([\s\S]*?)<\/mindmap>/g
  while ((m = reMm.exec(text)) !== null) {
    out.push({ type: 'mindmap', params: [m[1].trim()], rawBlock: m[0] })
  }
  // Parse <drawio>...</drawio>
  const reDrawio = /<drawio>([\s\S]*?)<\/drawio>/g
  while ((m = reDrawio.exec(text)) !== null) {
    out.push({ type: 'drawio', params: [m[1].trim()], rawBlock: m[0] })
  }
  // Parse <plan>...</plan>
  const rePlan = /<plan>([\s\S]*?)<\/plan>/g
  while ((m = rePlan.exec(text)) !== null) {
    out.push({ type: 'plan', params: [m[1].trim()], rawBlock: m[0] })
  }
  // Legacy [[ACTION:...]] support
  const reLegacy = /\[\[ACTION:(\w+)\|([^\]]*)\]\]/g
  while ((m = reLegacy.exec(text)) !== null) {
    out.push({ type: m[1], params: m[2].split('|').map(s => s.trim()), rawBlock: m[0] })
  }
  return out
}
async function executeActions(actions: ParsedAction[]): Promise<string> {
  const results: string[] = []
  for (const a of actions) {
    try {
      if (a.type === 'kp' && a.params.length >= 4) {
        await window.lk.kpUpsert({
          title: a.params[0],
          description: a.params.slice(1).join(' | '),
          mastery: 'unseen',
          chapterId: null,
          sort: Date.now()
        })
        results.push(`- Knowledge point saved: **${a.params[0]}**`)
      } else if (a.type === 'summary') {
        const sid = await window.lk.notesUpsert({
          title: 'AI Summary: ' + (a.params[0] || '').slice(0, 50),
          body: a.params[0] || '',
          kind: 'note',
          sort: Date.now()
        })
        results.push(`- Summary saved as note (id: ${sid.slice(0, 8)})`)
      } else if (a.type === 'mindmap') {
        const mid = await window.lk.mindmapUpsert({ title: 'AI Mindmap', body: a.params[0] || '' })
        results.push(`- Mindmap created (id: ${mid.slice(0, 8)})`)
      } else if (a.type === 'drawio') {
        const xml = a.params[0] || ''
        // Validate XML
        if (xml.includes('<mxGraphModel') || xml.includes('<mxfile')) {
          const id = await window.lk.diagUpsert({ title: 'AI Diagram', xml, format: 'drawio' })
          results.push(`- Draw.io diagram created (id: ${id.slice(0, 8)})`)
          // Dispatch to DrawioView if it's listening
          window.dispatchEvent(new CustomEvent('lk:ai-xml-result', { detail: { xml, id } }))
        } else {
          results.push('- Draw.io: AI returned invalid XML, not saved')
        }
      } else if (a.type === 'plan') {
        try {
          const plan = JSON.parse(a.params[0] || '{}')
          const pid = await window.lk.planUpsert({ title: plan.goal || 'Study Plan', plan_json: JSON.stringify(plan), template: plan.method || 'custom' })
          results.push(`- Study plan saved (id: ${pid.slice(0, 8)})`)
        } catch { results.push('- Plan: invalid JSON, not saved') }
      } else if (a.type === 'note' && a.params.length >= 2) {
        await window.lk.notesUpsert({ title: a.params[0], body: a.params[1], kind: 'note', sort: Date.now() })
        results.push(`- Note created: **${a.params[0]}**`)
      } else if (a.type === 'card' && a.params.length >= 2) {
        const decks = await window.lk.deckList()
        let deckId = decks[0]?.id
        if (!deckId) { const did = await window.lk.uuid(); await window.lk.deckUpsert({ id: did, title: 'Default', sort: 0 }); deckId = did }
        await window.lk.cardSave({ deckId, front: a.params[0], back: a.params[1], kind: 'qa' })
        results.push(`- Flashcard created: **${a.params[0].slice(0, 40)}**`)
      } else if (a.type === 'mindmap_legacy' && a.params.length >= 2) {
        await window.lk.mindmapUpsert({ title: a.params[0], body: a.params[1] })
        results.push(`- Mindmap created: **${a.params[0]}**`)
      } else if (a.type === 'conversation' && a.params[0] === 'create' && a.params[1]) {
        const id = await window.lk.uuid()
        await window.lk.convUpsert({ id, group_id: null, title: a.params[1], sort: Date.now() })
        await chat.refreshConvs(null)
        results.push(`- Conversation created: **${a.params[1]}**`)
      } else if (a.type === 'bookmark' && a.params.length >= 2) {
        await window.lk.bookmarkAdd({ bookId: a.params[0], page: Number(a.params[1]) || 1, label: a.params[2] || 'AI 书签' })
        results.push(`- Bookmark added: 第 ${a.params[1] || 1} 页`)
      }
    } catch (err: any) {
      results.push(`- Failed [${a.type}]: ${err?.message || err}`)
    }
  }
  return results.join('\n')
}
async function refreshToolHistory() { toolHistory.value = await window.lk.toolRunList(chat.currentConvId || null) }
watch(toolCenterOpen, (open) => { if (open) refreshToolHistory().catch(() => {}) })
async function ignoreToolProposals() {
  for (const proposal of toolProposals.value) {
    const id = await window.lk.toolRunCreate({ conversationId: chat.currentConvId, actionType: proposal.type, params: JSON.stringify(proposal.params), preview: `已忽略：${proposal.params.join(' · ').slice(0, 120)}` })
    await window.lk.toolRunComplete(id, 'ignored')
  }
  toolProposals.value = []; toolCenterOpen.value = false
}
async function applyToolProposals(proposals: AiToolProposal[]) {
  const summaries: string[] = []
  for (const proposal of proposals) {
    const runId = await window.lk.toolRunCreate({ conversationId: chat.currentConvId, actionType: proposal.type, params: JSON.stringify(proposal.params), preview: proposal.params.join(' · ').replace(/\s+/g, ' ').slice(0, 160) })
    const itemSummary = await executeActions([{ type: proposal.type, params: proposal.params, rawBlock: proposal.rawBlock }])
    const status = itemSummary.includes('Failed') ? 'failed' : 'applied'
    await window.lk.toolRunComplete(runId, status, JSON.stringify({ summary: itemSummary }))
    summaries.push(itemSummary)
  }
  const summary = summaries.join('\n')
  toolProposals.value = []
  toolCenterOpen.value = false
  await refreshToolHistory()
  if (summary) {
    const convId = chat.currentConvId
    if (convId) {
      const audit: any = { id: await window.lk.uuid(), conversation_id: convId, role: 'assistant', content: `✅ 已确认执行 AI 工具操作：\n${summary}`, model: 'tool-center', sort: Date.now() }
      await window.lk.msgSave(audit)
      chat.activeMessages.push(audit)
    }
  }
}

onMounted(async () => {
  dumpLog(); clearLog()
  log('app_start')
  window.addEventListener('error', (ev) => { console.error('[global]', ev.error || ev.message); log('global_error', String(ev.error || ev.message).slice(0, 100)) })
  window.addEventListener('unhandledrejection', (ev) => { console.error('[unhandled]', ev.reason); log('unhandled_rej', String(ev.reason).slice(0, 100)) })
  // debug: detect when activeMessages is cleared unexpectedly
  watch(() => chat.currentConvId, (id, old) => { log('convId', (old||'').slice(0,8) + '->' + (id||'').slice(0,8)) })
  watch(() => chat.activeMessages.length, (n, old) => {
    if (n === 0 && old > 0) { log('msgs_cleared', 'was ' + old); console.trace('[debug] activeMessages cleared! was:', old) }
  })
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('lk:ai-action', onAiAction as EventListener)
  window.addEventListener('lk:nav', onNav as EventListener)
  await settings.load(); await chat.refreshGroups(); chat.convs = await window.lk.convAll()
  // silent connection test on startup
  if (!settings.testMode && settings.currentApiKey()) {
    window.lk.aiTest({ provider: settings.provider, model: settings.model, apiKey: settings.currentApiKey(), baseUrl: settings.provider === 'custom' ? settings.customBaseUrl : undefined })
      .then((r: any) => { settings.setConnected(!!r?.ok) }).catch(() => {})
  }
  if (chat.convs.length === 0) {
    const c = await chat.newConv(null, '欢迎')
    chat.activeMessages.push({ id: 'welcome', conversation_id: c.id, role: 'assistant', content: '你好，我是你的私人学习助手。\n\n- 左侧切换 对话 / 图书馆 / 笔记 / 思维导图 / 复习模式\n- 对话模式下可在树里建目录折叠管理对话\n- 图书馆导入PDF后可划线选段向我提问\n- 在设置里填好API Key即可开始', model: 'welcome' } as any)
  }
  await chat.selectConv(chat.convs[0].id)
})
async function onAiAction(e: Event) {
  const { text, prompt, expectXml } = (e as CustomEvent).detail
  log('ai_action', (prompt||'').slice(0, 40))
  if (!expectXml) switchMode('chat')
  if (!chat.currentConvId) { const c = await chat.newConv(null, 'AI Action'); await chat.selectConv(c.id) }
  await onSend(`${prompt}\n\n---\n${text}`)
}

async function onNav(e: Event) {
  const { href } = (e as CustomEvent).detail as { href: string }
  const u = new URL(href)
  const kind = u.hostname
  const id = u.pathname.replace(/^\//, '')
  if (!id) return
  log('nav', kind + ' ' + id.slice(0, 8))
  if (kind === 'note') { switchMode('notes', { noteId: id }) }
  else if (kind === 'book') {
    const page = Number(u.searchParams.get('page'))
    const cfi = u.searchParams.get('cfi')
    switchMode('library', { bookId: id, bookHref: cfi || undefined, highlight: Number.isFinite(page) && page > 0 ? { bookId: id, page } : undefined })
    window.lk.bookUpdate(id, {}).catch(() => {})
  }
  else if (kind === 'conv') { switchMode('chat', { convId: id }) }
  else if (kind === 'kp') { switchMode('notes') }
  else if (kind === 'block') {
    const block = await window.lk.blockGet(id)
    if (!block) return
    if (block.source_type === 'note') {
      switchMode('notes', { noteId: block.source_id, blockId: id })
      tabStore.openTab({ type: 'note', title: '内容块', data: { noteId: block.source_id } })
      return
    }
    else if (block.source_type === 'highlight') {
      try {
        const meta = JSON.parse(block.metadata || '{}') as { bookId?: string; page?: number; href?: string | null }
        if (meta.bookId) {
          switchMode('library', { bookId: meta.bookId, bookHref: meta.href || undefined, highlight: { bookId: meta.bookId, page: meta.page || 1 } })
          tabStore.openTab({ type: 'ebook', title: '内容块', data: { bookId: meta.bookId } })
          return
        }
      } catch { /* invalid historical metadata falls back to no navigation */ }
    }
  }
  tabStore.openTab({ type: kind === 'note' ? 'note' : kind === 'book' ? 'ebook' : 'chat', title: kind, data: kind === 'book' ? { bookId: id } : kind === 'note' ? { noteId: id } : {} })
}

onUnmounted(() => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('lk:ai-action', onAiAction as EventListener); window.removeEventListener('lk:nav', onNav as EventListener); activeAbort?.() })
</script>

<style scoped lang="scss">
.side { flex-shrink: 0; overflow: hidden; }
.resizer { width: 4px; cursor: col-resize; background: var(--border); flex-shrink: 0; &:hover { background: var(--accent); } }
.content { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; }
.topbar { height: 44px; flex: 0 0 44px; display: flex; align-items: center; justify-content: space-between; padding: 0 12px; background: var(--bg-soft); border-bottom: 1px solid var(--border); }
.title-area { display: flex; gap: 8px; align-items: center; flex: 1; min-width: 0; }
.title-input { max-width: 360px; background: transparent; }
.toolbar { display: flex; gap: 8px; }
.mode-icon { color: var(--accent); font-size: 18px; }
.mode-title { font-weight: 600; }
.tag-glow { animation: glow 2s ease-in-out infinite; }
@keyframes glow {
  0%, 100% { box-shadow: 0 0 4px rgba(81,207,102,0.4); }
  50% { box-shadow: 0 0 12px rgba(81,207,102,0.8), 0 0 20px rgba(81,207,102,0.3); }
}
.view-slot { flex: 1; display: flex; min-height: 0; overflow: hidden; }
</style>
