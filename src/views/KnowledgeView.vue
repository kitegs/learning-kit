<template>
  <div class="knowledge-root">
    <aside class="filter-panel">
      <div class="panel-title">知识库</div>
      <button v-for="item in filters" :key="item.key" class="filter" :class="{ active: activeFilter === item.key }" @click="activeFilter = item.key">
        <span>{{ item.label }}</span><small>{{ countFor(item.key) }}</small>
      </button>
      <div class="tag-title">标签</div>
      <button v-for="tag in tags" :key="tag" class="tag-filter" :class="{ active: activeTag === tag }" @click="activeTag = activeTag === tag ? '' : tag">#{{ tag }}</button>
      <div v-if="!tags.length" class="muted">还没有标签</div>
    </aside>
    <main class="knowledge-main">
      <header class="knowledge-head">
        <div><h2>{{ currentTitle }}</h2><p>集中管理自己写下的笔记与从 AI 沉淀的知识。</p></div>
        <el-input v-model="query" class="search" placeholder="搜索知识库" clearable />
      </header>
      <div v-if="filteredNotes.length" class="note-grid">
        <button v-for="note in filteredNotes" :key="note.id" class="note-card" @click="openNote(note.id)">
          <div class="card-top"><span class="source" :class="note.isAi ? 'ai' : 'own'">{{ note.isAi ? 'AI 沉淀' : '我的笔记' }}</span><time>{{ formatDate(note.updated_at) }}</time></div>
          <h3>{{ note.title }}</h3>
          <p>{{ excerpt(note.body) }}</p>
          <div v-if="note.tagList.length" class="tags"><span v-for="tag in note.tagList" :key="tag">#{{ tag }}</span></div>
        </button>
      </div>
      <div v-else class="empty"><strong>这里还没有知识条目</strong><span>在 AI 回答菜单中选择“保存到知识库”，内容会先进入收集箱。</span></div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

type Filter = 'all' | 'inbox' | 'ai' | 'own'
type NoteItem = { id: string; title: string; body: string; parent_id: string | null; tags: string | null; updated_at?: string; isAi: boolean; tagList: string[] }

const rawNotes = ref<Array<Record<string, unknown>>>([])
const aiNoteIds = ref(new Set<string>())
const activeFilter = ref<Filter>('all')
const activeTag = ref('')
const query = ref('')
const filters: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: '全部知识' }, { key: 'inbox', label: '收集箱' }, { key: 'ai', label: 'AI 沉淀' }, { key: 'own', label: '我的笔记' }
]

const notes = computed<NoteItem[]>(() => rawNotes.value
  .filter((note) => note.kind !== 'folder')
  .map((note) => {
    const id = String(note.id)
    const links = aiNoteIds.value.has(id)
    return { id, title: String(note.title || '未命名笔记'), body: String(note.body || ''), parent_id: note.parent_id ? String(note.parent_id) : null, tags: note.tags ? String(note.tags) : '', updated_at: note.updated_at ? String(note.updated_at) : '', isAi: links, tagList: parseTags(String(note.tags || '')) }
  }))

const inboxId = computed(() => String(rawNotes.value.find((note) => note.kind === 'folder' && note.title === '收集箱' && !note.parent_id)?.id || ''))
const tags = computed(() => [...new Set(notes.value.flatMap((note) => note.tagList))].sort((a, b) => a.localeCompare(b, 'zh-CN')))
const filteredNotes = computed(() => notes.value.filter((note) => {
  if (activeFilter.value === 'inbox' && note.parent_id !== inboxId.value) return false
  if (activeFilter.value === 'ai' && !note.isAi) return false
  if (activeFilter.value === 'own' && note.isAi) return false
  if (activeTag.value && !note.tagList.includes(activeTag.value)) return false
  const q = query.value.trim().toLowerCase()
  return !q || `${note.title} ${note.body} ${note.tags}`.toLowerCase().includes(q)
}))
const currentTitle = computed(() => filters.find((item) => item.key === activeFilter.value)?.label || '知识库')

function parseTags(value: string): string[] { return value.split(/[\s,#，]+/).map((tag) => tag.trim()).filter(Boolean) }
function excerpt(value: string): string { return value.replace(/^>.*$/gm, '').replace(/\s+/g, ' ').trim().slice(0, 150) || '暂无正文' }
function formatDate(value?: string): string { return value ? value.slice(0, 10) : '' }
function countFor(filter: Filter): number {
  if (filter === 'inbox') return notes.value.filter((note) => note.parent_id === inboxId.value).length
  if (filter === 'ai') return notes.value.filter((note) => note.isAi).length
  if (filter === 'own') return notes.value.filter((note) => !note.isAi).length
  return notes.value.length
}
function openNote(id: string) { window.dispatchEvent(new CustomEvent('lk:nav', { detail: { href: `app://note/${id}` } })) }
async function load() {
  rawNotes.value = await window.lk.notesList()
  const linked = await Promise.all(rawNotes.value.filter((note) => note.kind !== 'folder').map(async (note) => {
    const links = await window.lk.linkAllForEntity('note', String(note.id))
    return links.some((link: Record<string, unknown>) => link.link_type === 'saved_to_knowledge' && link.target_type === 'note' && link.target_id === note.id) ? String(note.id) : ''
  }))
  aiNoteIds.value = new Set(linked.filter(Boolean))
}
onMounted(load)
</script>

<style scoped lang="scss">
.knowledge-root { flex: 1; min-width: 0; min-height: 0; overflow: hidden; display: flex; background: var(--bg); }
.filter-panel { width: 220px; flex: 0 0 220px; padding: 18px 12px; overflow: auto; background: var(--bg-soft); border-right: 1px solid var(--border); }
.panel-title, .tag-title { margin: 0 8px 10px; font-size: 12px; font-weight: 700; color: var(--text-dim); letter-spacing: .04em; }
.tag-title { margin-top: 24px; }
.filter { width: 100%; border: 0; background: transparent; color: var(--text); padding: 8px; display: flex; justify-content: space-between; border-radius: 6px; cursor: pointer; text-align: left; &:hover { background: var(--bg-hover); } &.active { background: var(--accent-dim); color: var(--accent-text); font-weight: 600; } small { color: var(--text-dim); } }
.tag-filter { display: inline-block; margin: 3px; border: 0; border-radius: 12px; background: var(--bg-elev); color: var(--text-dim); padding: 4px 8px; cursor: pointer; font-size: 12px; &.active { background: var(--accent); color: var(--text-on-accent); } }
.muted { margin: 8px; color: var(--text-dim); font-size: 12px; }
.knowledge-main { flex: 1; min-width: 0; overflow: auto; padding: 28px clamp(20px, 5vw, 68px); }
.knowledge-head { display: flex; gap: 24px; align-items: center; justify-content: space-between; margin-bottom: 26px; h2 { margin: 0 0 6px; font-size: 24px; } p { margin: 0; color: var(--text-dim); font-size: 13px; } }
.search { width: min(300px, 40vw); }
.note-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px; }
.note-card { min-height: 170px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-elev); color: var(--text); padding: 16px; text-align: left; cursor: pointer; transition: transform .15s, border-color .15s; &:hover { transform: translateY(-2px); border-color: var(--accent); } h3 { margin: 12px 0 8px; font-size: 15px; } p { margin: 0; color: var(--text-dim); font-size: 13px; line-height: 1.6; } }
.card-top { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--text-dim); }.source { padding: 2px 6px; border-radius: 8px; &.ai { color: #8f6ee8; background: rgba(143,110,232,.12); } &.own { color: var(--accent-text); background: var(--accent-dim); } }
.tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 14px; span { font-size: 11px; color: var(--text-dim); } }
.empty { min-height: 300px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--text-dim); text-align: center; strong { color: var(--text); } }
</style>
