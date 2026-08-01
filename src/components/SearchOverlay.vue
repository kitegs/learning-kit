<template>
  <Transition name="fade">
    <div v-if="open" class="search-overlay" @click="close">
      <div class="box" @click.stop>
        <div class="search-bar">
          <el-icon><Search /></el-icon>
          <input
            ref="input"
            v-model="query"
            placeholder="搜索对话 / 消息 / 笔记 / 思维导图 / 划线 / 卡片 / 书 …（Esc 关闭）"
            @keydown.esc.prevent="close"
            @keydown.down.prevent="moveSel(1)"
            @keydown.up.prevent="moveSel(-1)"
            @keydown.enter.prevent="openSel"
          />
          <span class="kbd">Ctrl+K</span>
        </div>
        <div class="scope-bar" v-if="query">
          <button v-for="item in scopes" :key="item.id" :class="{ active: scope === item.id }" @click="scope = item.id">{{ item.label }}</button>
          <span class="tag-tip">输入 #标签 可筛选标签</span>
        </div>
        <div class="results" v-if="hasAny">
          <Section v-if="show('reading') && r.books.length" title="图书馆" :items="r.books" :label="(it)=>it.title + (it.author ? ' · '+it.author : '')" :sel="selIdx" :start="start.book" @run="(it) => $emit('jump', { kind: 'book', id: it.id })" />
          <Section v-if="show('chat') && r.conversations.length" title="对话" :items="r.conversations" :label="(it)=>it.title || '(未命名)'" :sel="selIdx" :start="start.conv" @run="(it) => $emit('jump', { kind: 'conv', id: it.id })" />
          <Section v-if="show('chat') && r.messages.length" title="消息" :items="r.messages" :label="(it)=>(it.role === 'user' ? '我：' : 'AI：') + it.snippet" :sel="selIdx" :start="start.msg" @run="(it) => $emit('jump', { kind: 'msg', conversationId: it.conversation_id, id: it.id })" />
          <Section v-if="show('notes') && r.notes.length" title="笔记" :items="r.notes" :label="(it)=>it.title + ' — ' + it.snippet" :sel="selIdx" :start="start.note" @run="(it) => $emit('jump', { kind: 'note', id: it.id })" />
          <Section v-if="show('notes') && r.mindmaps.length" title="思维导图" :items="r.mindmaps" :label="(it)=>it.title + ' — ' + it.snippet" :sel="selIdx" :start="start.mindmap" @run="(it) => $emit('jump', { kind: 'mindmap', id: it.id })" />
          <Section v-if="show('reading') && r.highlights.length" title="电子书划线" :items="r.highlights" :label="(it)=>`第${it.page}页：` + it.snippet" :sel="selIdx" :start="start.hl" @run="(it) => $emit('jump', { kind: 'highlight', bookId: it.book_id, page: it.page })" />
          <Section v-if="show('review') && r.cards.length" title="复习卡片" :items="r.cards" :label="(it)=>it.snippet + (it.back ? ' / ' + it.back : '')" :sel="selIdx" :start="start.card" @run="(it) => $emit('jump', { kind: 'card', deckId: it.deck_id, id: it.id })" />
          <Section v-if="show('notes') && r.kps.length" title="知识点" :items="r.kps" :label="(it)=>it.title + ' — ' + it.snippet" :sel="selIdx" :start="start.kp" @run="(it) => $emit('jump', { kind: 'kp', id: it.id })" />
        </div>
        <div v-else-if="!query && history.length" class="history-section">
          <div class="hist-header"><span>Recent Searches</span><button @click="clearHistory">Clear</button></div>
          <div v-for="(h, i) in history" :key="i" class="hist-item" @click="query = h; input?.focus()">
            <el-icon><Clock /></el-icon>
            <span>{{ h }}</span>
            <button class="hist-del" @click.stop="removeHistory(i)">&times;</button>
          </div>
        </div>
        <div v-else class="empty">
          <p v-if="!query">Type to search across all data</p>
          <p v-else>No results</p>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Search, Clock } from '@element-plus/icons-vue'
import Section from './SearchSection.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'jump', target: { kind: string; id?: string; conversationId?: string; bookId?: string; deckId?: string; page?: number }): void
}>()

const query = ref('')
const input = ref<HTMLInputElement | null>(null)
const history = ref<string[]>([])
const HISTORY_KEY = 'lk_search_history'
const r = ref<any>({ conversations: [], messages: [], notes: [], mindmaps: [], highlights: [], cards: [], books: [], kps: [] })
const selIdx = ref(0)
const scope = ref<'all' | 'notes' | 'chat' | 'reading' | 'review'>('all')
const scopes = [
  { id: 'all' as const, label: '全部' }, { id: 'notes' as const, label: '笔记' }, { id: 'chat' as const, label: '对话' },
  { id: 'reading' as const, label: '阅读' }, { id: 'review' as const, label: '复习' },
]
let timer: any = null

const start = computed(() => {
  let s = 0
  const map: Record<string, number> = {}
  const accum = (key: string, items: any[]) => { map[key] = s; s += items.length }
  accum('book', visibleItems(r.value.books, 'reading'))
  accum('conv', visibleItems(r.value.conversations, 'chat'))
  accum('msg', visibleItems(r.value.messages, 'chat'))
  accum('note', visibleItems(r.value.notes, 'notes'))
  accum('mindmap', visibleItems(r.value.mindmaps, 'notes'))
  accum('hl', visibleItems(r.value.highlights, 'reading'))
  accum('card', visibleItems(r.value.cards, 'review'))
  accum('kp', visibleItems(r.value.kps, 'notes'))
  return map
})

const total = computed(() =>
  visibleItems(r.value.books, 'reading').length + visibleItems(r.value.conversations, 'chat').length + visibleItems(r.value.messages, 'chat').length +
  visibleItems(r.value.notes, 'notes').length + visibleItems(r.value.mindmaps, 'notes').length + visibleItems(r.value.highlights, 'reading').length +
  visibleItems(r.value.cards, 'review').length + visibleItems(r.value.kps, 'notes').length
)
const hasAny = computed(() => total.value > 0)

watch(() => props.open, (v) => {
  if (v) {
    query.value = ''
    r.value = { conversations: [], messages: [], notes: [], mindmaps: [], highlights: [], cards: [], books: [], kps: [] }
    selIdx.value = 0
    scope.value = 'all'
    try { history.value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { history.value = [] }
    nextTick(() => input.value?.focus())
  }
})

watch(query, (v) => {
  if (timer) clearTimeout(timer)
  if (!v.trim()) { r.value = { conversations: [], messages: [], notes: [], mindmaps: [], highlights: [], cards: [], books: [], kps: [] }; return }
  timer = setTimeout(async () => {
    r.value = await window.lk.search(v.trim())
    selIdx.value = 0
  }, 180)
})
watch(scope, () => { selIdx.value = 0 })

function close() { emit('close') }
function show(group: Exclude<typeof scope.value, 'all'>) { return scope.value === 'all' || scope.value === group }
function visibleItems(items: any[], group: Exclude<typeof scope.value, 'all'>) { return show(group) ? items : [] }
function moveSel(d: number) { selIdx.value = Math.max(0, Math.min(total.value - 1, selIdx.value + d)) }
function clearHistory() { history.value = []; localStorage.removeItem(HISTORY_KEY) }
function removeHistory(i: number) { history.value.splice(i, 1); localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value)) }
function openSel() {
  if (!hasAny.value) return
  // save to history
  if (query.value.trim()) {
    const q = query.value.trim()
    history.value = [q, ...history.value.filter(h => h !== q)].slice(0, 20)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value))
  }
  // find which section this idx belongs to and dispatch
  const wrap = (key: string, items: any[], fn: (it: any) => void) => {
    const startI = start.value[key]
    items.forEach((it, i) => {
      if (startI + i === selIdx.value) fn(it)
    })
  }
  wrap('book', visibleItems(r.value.books, 'reading'), (it) => emit('jump', { kind: 'book', id: it.id }))
  wrap('conv', visibleItems(r.value.conversations, 'chat'), (it) => emit('jump', { kind: 'conv', id: it.id }))
  wrap('msg', visibleItems(r.value.messages, 'chat'), (it) => emit('jump', { kind: 'msg', conversationId: it.conversation_id, id: it.id }))
  wrap('note', visibleItems(r.value.notes, 'notes'), (it) => emit('jump', { kind: 'note', id: it.id }))
  wrap('mindmap', visibleItems(r.value.mindmaps, 'notes'), (it) => emit('jump', { kind: 'mindmap', id: it.id }))
  wrap('hl', visibleItems(r.value.highlights, 'reading'), (it) => emit('jump', { kind: 'highlight', bookId: it.book_id, page: it.page }))
  wrap('card', visibleItems(r.value.cards, 'review'), (it) => emit('jump', { kind: 'card', deckId: it.deck_id, id: it.id }))
  wrap('kp', visibleItems(r.value.kps, 'notes'), (it) => emit('jump', { kind: 'kp', id: it.id }))
}
</script>

<style scoped lang="scss">
.search-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 9000;
  display: flex;
  justify-content: center;
  padding-top: 12vh;
}
.box {
  width: 720px;
  max-width: 92vw;
  max-height: 70vh;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.search-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
  .el-icon { color: var(--text-dim); }
  input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text);
    font-size: 15px;
    font-family: inherit;
  }
  .kbd { color: var(--text-dim); font-size: 12px; }
}
.scope-bar { display:flex; align-items:center; gap:6px; padding:7px 16px; border-bottom:1px solid var(--border); background:var(--bg-soft); }
.scope-bar button { border:1px solid var(--border); border-radius:12px; padding:3px 9px; color:var(--text-dim); background:var(--bg-elev); cursor:pointer; font-size:11px; }.scope-bar button.active { border-color:var(--accent); background:var(--accent-dim); color:var(--accent-text); }.tag-tip { margin-left:auto; color:var(--text-dim); font-size:11px; }
.results {
  flex: 1;
  overflow: auto;
  padding: 6px 0;
}
.empty { padding: 60px 0; text-align: center; color: var(--text-dim); }
.history-section { padding: 8px 0; }
.hist-header { display: flex; justify-content: space-between; align-items: center; padding: 4px 16px 8px; font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: .5px; }
.hist-header button { border: none; background: transparent; color: var(--text-dim); cursor: pointer; font-size: 11px; &:hover { color: var(--accent); } }
.hist-item { display: flex; align-items: center; gap: 8px; padding: 6px 16px; cursor: pointer; font-size: 13px; color: var(--text); &:hover { background: rgba(127,127,127,.08); } }
.hist-item .el-icon { color: var(--text-dim); font-size: 14px; }
.hist-del { border: none; background: transparent; color: var(--text-dim); cursor: pointer; margin-left: auto; font-size: 14px; opacity: 0; &:hover { color: #ff5c5c; } }
.hist-item:hover .hist-del { opacity: 1; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
