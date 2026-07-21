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
        <div class="results" v-if="hasAny">
          <Section v-if="r.books.length" title="图书馆" :items="r.books" :label="(it)=>it.title + (it.author ? ' · '+it.author : '')" :sel="selIdx" :start="start.book" @run="(it) => $emit('jump', { kind: 'book', id: it.id })" />
          <Section v-if="r.conversations.length" title="对话" :items="r.conversations" :label="(it)=>it.title || '(未命名)'" :sel="selIdx" :start="start.conv" @run="(it) => $emit('jump', { kind: 'conv', id: it.id })" />
          <Section v-if="r.messages.length" title="消息" :items="r.messages" :label="(it)=>(it.role === 'user' ? '我：' : 'AI：') + it.snippet" :sel="selIdx" :start="start.msg" @run="(it) => $emit('jump', { kind: 'msg', conversationId: it.conversation_id, id: it.id })" />
          <Section v-if="r.notes.length" title="笔记" :items="r.notes" :label="(it)=>it.title + ' — ' + it.snippet" :sel="selIdx" :start="start.note" @run="(it) => $emit('jump', { kind: 'note', id: it.id })" />
          <Section v-if="r.mindmaps.length" title="思维导图" :items="r.mindmaps" :label="(it)=>it.title + ' — ' + it.snippet" :sel="selIdx" :start="start.mindmap" @run="(it) => $emit('jump', { kind: 'mindmap', id: it.id })" />
          <Section v-if="r.highlights.length" title="电子书划线" :items="r.highlights" :label="(it)=>`第${it.page}页：` + it.snippet" :sel="selIdx" :start="start.hl" @run="(it) => $emit('jump', { kind: 'highlight', bookId: it.book_id, page: it.page })" />
          <Section v-if="r.cards.length" title="复习卡片" :items="r.cards" :label="(it)=>it.snippet + (it.back ? ' / ' + it.back : '')" :sel="selIdx" :start="start.card" @run="(it) => $emit('jump', { kind: 'card', deckId: it.deck_id, id: it.id })" />
        </div>
        <div v-else class="empty">
          <p v-if="!query">开始输入即可跨数据搜索</p>
          <p v-else>无结果</p>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Search } from '@element-plus/icons-vue'
import Section from './SearchSection.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'jump', target: { kind: string; id?: string; conversationId?: string; bookId?: string; deckId?: string; page?: number }): void
}>()

const query = ref('')
const input = ref<HTMLInputElement | null>(null)
const r = ref<any>({ conversations: [], messages: [], notes: [], mindmaps: [], highlights: [], cards: [], books: [] })
const selIdx = ref(0)
let timer: any = null

const start = computed(() => {
  let s = 0
  const map: Record<string, number> = {}
  const accum = (key: string, items: any[]) => { map[key] = s; s += items.length }
  accum('book', r.value.books)
  accum('conv', r.value.conversations)
  accum('msg', r.value.messages)
  accum('note', r.value.notes)
  accum('mindmap', r.value.mindmaps)
  accum('hl', r.value.highlights)
  accum('card', r.value.cards)
  return map
})

const total = computed(() => r.value.books.length + r.value.conversations.length + r.value.messages.length + r.value.notes.length + r.value.mindmaps.length + r.value.highlights.length + r.value.cards.length)
const hasAny = computed(() => total.value > 0)

watch(() => props.open, (v) => {
  if (v) {
    query.value = ''
    r.value = { conversations: [], messages: [], notes: [], mindmaps: [], highlights: [], cards: [], books: [] }
    selIdx.value = 0
    nextTick(() => input.value?.focus())
  }
})

watch(query, (v) => {
  if (timer) clearTimeout(timer)
  if (!v.trim()) { r.value = { conversations: [], messages: [], notes: [], mindmaps: [], highlights: [], cards: [], books: [] }; return }
  timer = setTimeout(async () => {
    r.value = await window.lk.search(v.trim())
    selIdx.value = 0
  }, 180)
})

function close() { emit('close') }
function moveSel(d: number) { selIdx.value = Math.max(0, Math.min(total.value - 1, selIdx.value + d)) }
function openSel() {
  if (!hasAny.value) return
  // find which section this idx belongs to and dispatch
  const wrap = (key: string, items: any[], fn: (it: any) => void) => {
    const startI = start.value[key]
    items.forEach((it, i) => {
      if (startI + i === selIdx.value) fn(it)
    })
  }
  wrap('book', r.value.books, (it) => emit('jump', { kind: 'book', id: it.id }))
  wrap('conv', r.value.conversations, (it) => emit('jump', { kind: 'conv', id: it.id }))
  wrap('msg', r.value.messages, (it) => emit('jump', { kind: 'msg', conversationId: it.conversation_id, id: it.id }))
  wrap('note', r.value.notes, (it) => emit('jump', { kind: 'note', id: it.id }))
  wrap('mindmap', r.value.mindmaps, (it) => emit('jump', { kind: 'mindmap', id: it.id }))
  wrap('hl', r.value.highlights, (it) => emit('jump', { kind: 'highlight', bookId: it.book_id, page: it.page }))
  wrap('card', r.value.cards, (it) => emit('jump', { kind: 'card', deckId: it.deck_id, id: it.id }))
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
.results {
  flex: 1;
  overflow: auto;
  padding: 6px 0;
}
.empty { padding: 60px 0; text-align: center; color: var(--text-dim); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>