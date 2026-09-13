<template>
  <div class="knowledge-root">
    <aside class="filter-panel">
      <div class="panel-title">知识库</div>
      <button class="filter" :class="{ active: activeFilter === 'points' }" @click="activeFilter = 'points'"><span>知识点</span><small>{{ points.length }}</small></button>
      <button v-for="item in filters" :key="item.key" class="filter" :class="{ active: activeFilter === item.key }" @click="activeFilter = item.key">
        <span>{{ item.label }}</span><small>{{ countFor(item.key) }}</small>
      </button>
      <div class="tag-title">标签</div>
      <button v-for="tag in tags" :key="tag" class="tag-filter" :class="{ active: activeTag === tag }" @click="activeTag = activeTag === tag ? '' : tag">#{{ tag }}</button>
      <div v-if="!tags.length" class="muted">还没有标签</div>
      <div class="tag-title">目录</div>
      <button class="filter" :class="{ active: !activeFolderId }" @click="activeFolderId = ''"><span>所有目录</span></button>
      <button v-for="folder in folders" :key="folder.id" class="filter" :class="{ active: activeFolderId === folder.id }" @click="activeFolderId = folder.id"><span>📁 {{ folder.title }}</span><small>{{ countInFolder(folder.id) }}</small></button>
    </aside>
    <main class="knowledge-main">
      <header class="knowledge-head">
        <div><h2>{{ currentTitle }}</h2><p>集中管理自己写下的笔记与从 AI 沉淀的知识。</p></div>
        <div class="head-actions"><el-input v-model="query" class="search" placeholder="搜索知识库" clearable /><el-button type="primary" @click="createNote">新建笔记</el-button></div>
      </header>
      <div v-if="activeFilter === 'points'" class="note-grid">
        <button v-for="point in filteredPoints" :key="point.id" class="note-card" @click="editPoint(point)"><div class="card-top"><span class="source">知识点 · {{ point.mastery === 'unseen' ? '未学习' : point.mastery }}</span></div><h3>{{ point.title }}</h3><p>{{ point.description || '暂无描述' }}</p></button>
        <p v-if="!filteredPoints.length" class="muted">暂无匹配知识点。确认 AI 知识点提案后会显示在这里。</p>
      </div>
      <div v-else-if="filteredNotes.length" class="note-grid">
        <button v-for="note in filteredNotes" :key="note.id" class="note-card" @click="openNote(note.id)">
          <div class="card-top"><span class="source" :class="note.isAi ? 'ai' : 'own'">{{ note.isAi ? 'AI 沉淀' : '我的笔记' }}</span><span class="card-actions"><span class="favorite" :class="{ marked: note.favorite }" role="button" :title="note.favorite ? '取消收藏' : '收藏'" @click.stop="toggleFavorite(note)">★</span><time>{{ formatDate(note.updated_at) }}</time></span></div>
          <h3>{{ note.title }}</h3>
          <p>{{ excerpt(note.body) }}</p>
          <div class="card-footer"><span class="folder">{{ note.folderTitle ? '📁 ' + note.folderTitle : '未归档' }}</span><div v-if="note.tagList.length" class="tags"><span v-for="tag in note.tagList" :key="tag">#{{ tag }}</span></div></div>
        </button>
      </div>
      <div v-else class="empty"><strong>这里还没有知识条目</strong><span>在 AI 回答菜单中选择“保存到知识库”，内容会先进入收集箱。</span></div>
    </main>
    <el-dialog v-model="pointOpen" title="编辑知识点" width="min(600px, calc(100vw - 32px))">
      <el-input v-model="pointDraft.title" placeholder="知识点标题" maxlength="300" />
      <el-input v-model="pointDraft.description" type="textarea" :rows="8" maxlength="10000" placeholder="描述与来源" style="margin-top:12px" />
      <template #footer><el-button @click="pointOpen = false">取消</el-button><el-button type="primary" :loading="pointSaving" @click="savePoint">保存知识点</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'

type Filter = 'all' | 'inbox' | 'ai' | 'own' | 'favorite' | 'points'
type KnowledgePoint = { id: string; title: string; description: string | null; mastery: string; chapter_id: string | null; parent_id: string | null; sort: number }
const points = ref<KnowledgePoint[]>([])
const pointOpen = ref(false)
const pointSaving = ref(false)
const pointDraft = ref<KnowledgePoint>({ id: '', title: '', description: '', mastery: 'unseen', chapter_id: null, parent_id: null, sort: 0 })
function editPoint(point: KnowledgePoint) { pointDraft.value = { ...point }; pointOpen.value = true }
async function savePoint() {
  if (!pointDraft.value.title.trim() || pointSaving.value) return
  pointSaving.value = true
  try {
    const point = pointDraft.value
    await window.lk.kpUpsert({ ...point, chapterId: point.chapter_id, parentId: point.parent_id })
    points.value = points.value.map(row => row.id === point.id ? { ...point } : row)
    pointOpen.value = false
    ElMessage.success('知识点已保存')
  } catch (error: unknown) { ElMessage.error(error instanceof Error ? error.message : '知识点保存失败') }
  finally { pointSaving.value = false }
}
type NoteItem = { id: string; title: string; body: string; parent_id: string | null; tags: string | null; updated_at?: string; isAi: boolean; favorite: boolean; tagList: string[]; folderTitle: string }

const rawNotes = ref<Array<Record<string, unknown>>>([])
const aiNoteIds = ref(new Set<string>())
const activeFilter = ref<Filter>('all')
const activeTag = ref('')
const activeFolderId = ref('')
const query = ref('')
const filteredPoints = computed(() => points.value.filter(point => `${point.title} ${point.description || ''}`.toLowerCase().includes(query.value.trim().toLowerCase())))
const filters: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: '全部知识' }, { key: 'inbox', label: '收集箱' }, { key: 'ai', label: 'AI 沉淀' }, { key: 'own', label: '我的笔记' }, { key: 'favorite', label: '收藏' }
]

const notes = computed<NoteItem[]>(() => rawNotes.value
  .filter((note) => note.kind !== 'folder')
  .map((note) => {
    const id = String(note.id)
    const links = aiNoteIds.value.has(id)
    const folder = rawNotes.value.find((item) => item.id === note.parent_id && item.kind === 'folder')
    return { id, title: String(note.title || '未命名笔记'), body: String(note.body || ''), parent_id: note.parent_id ? String(note.parent_id) : null, tags: note.tags ? String(note.tags) : '', updated_at: note.updated_at ? String(note.updated_at) : '', isAi: links, favorite: Number(note.favorite || 0) === 1, tagList: parseTags(String(note.tags || '')), folderTitle: folder ? String(folder.title) : '' }
  }))

const inboxId = computed(() => String(rawNotes.value.find((note) => note.kind === 'folder' && note.title === '收集箱' && !note.parent_id)?.id || ''))
const folders = computed(() => rawNotes.value.filter((note) => note.kind === 'folder').map((note) => ({ id: String(note.id), title: String(note.title) })))
const tags = computed(() => [...new Set(notes.value.flatMap((note) => note.tagList))].sort((a, b) => a.localeCompare(b, 'zh-CN')))
const filteredNotes = computed(() => notes.value.filter((note) => {
  if (activeFilter.value === 'inbox' && note.parent_id !== inboxId.value) return false
  if (activeFilter.value === 'ai' && !note.isAi) return false
  if (activeFilter.value === 'own' && note.isAi) return false
  if (activeFilter.value === 'favorite' && !note.favorite) return false
  if (activeTag.value && !note.tagList.includes(activeTag.value)) return false
  if (activeFolderId.value && note.parent_id !== activeFolderId.value) return false
  const q = query.value.trim().toLowerCase()
  return !q || `${note.title} ${note.body} ${note.tags}`.toLowerCase().includes(q)
}))
const currentTitle = computed(() => activeFilter.value === 'points' ? '知识点' : filters.find((item) => item.key === activeFilter.value)?.label || '知识库')

function parseTags(value: string): string[] { return value.split(/[\s,#，]+/).map((tag) => tag.trim()).filter(Boolean) }
function excerpt(value: string): string { return value.replace(/^>.*$/gm, '').replace(/\s+/g, ' ').trim().slice(0, 150) || '暂无正文' }
function formatDate(value?: string): string { return value ? value.slice(0, 10) : '' }
function countFor(filter: Filter): number {
  if (filter === 'inbox') return notes.value.filter((note) => note.parent_id === inboxId.value).length
  if (filter === 'ai') return notes.value.filter((note) => note.isAi).length
  if (filter === 'own') return notes.value.filter((note) => !note.isAi).length
  if (filter === 'favorite') return notes.value.filter((note) => note.favorite).length
  return notes.value.length
}
function countInFolder(folderId: string): number { return notes.value.filter((note) => note.parent_id === folderId).length }
function openNote(id: string) { window.dispatchEvent(new CustomEvent('lk:nav', { detail: { href: `app://note/${id}` } })) }
async function createNote() {
  const id = await window.lk.notesUpsert({ title: '未命名笔记', body: '', parent_id: null, sort: Date.now(), tags: '', kind: 'note' })
  openNote(id)
}
async function toggleFavorite(note: NoteItem) {
  await window.lk.notesPatch(note.id, { favorite: !note.favorite })
  const raw = rawNotes.value.find((item) => String(item.id) === note.id)
  if (raw) raw.favorite = note.favorite ? 0 : 1
}
async function load() {
  points.value = await window.lk.kpList(null)
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
.knowledge-head { display: flex; gap: 24px; align-items: center; justify-content: space-between; margin-bottom: 26px; h2 { margin: 0 0 6px; font-size: 24px; } p { margin: 0; color: var(--text-dim); font-size: 13px; } }.head-actions { display: flex; align-items: center; gap: 8px; }
.search { width: min(300px, 40vw); }
.note-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px; }
.note-card { min-height: 170px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-elev); color: var(--text); padding: 16px; text-align: left; cursor: pointer; transition: transform .15s, border-color .15s; &:hover { transform: translateY(-2px); border-color: var(--accent); } h3 { margin: 12px 0 8px; font-size: 15px; } p { margin: 0; color: var(--text-dim); font-size: 13px; line-height: 1.6; } }
.card-top, .card-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--text-dim); }.source { padding: 2px 6px; border-radius: 8px; &.ai { color: #8f6ee8; background: rgba(143,110,232,.12); } &.own { color: var(--accent-text); background: var(--accent-dim); } }.favorite { color: var(--text-dim); font-size: 16px; line-height: 1; cursor: pointer; &.marked { color: #e6ad39; } }
.card-footer { margin-top: 14px; }.folder { display: block; margin-bottom: 5px; color: var(--text-dim); font-size: 11px; }.tags { display: flex; flex-wrap: wrap; gap: 5px; span { font-size: 11px; color: var(--text-dim); } }
.empty { min-height: 300px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--text-dim); text-align: center; strong { color: var(--text); } }
</style>
