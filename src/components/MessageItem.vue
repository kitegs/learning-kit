<template>
  <div class="msg" :class="msg.role" @contextmenu="onCtx">
    <div class="avatar" :class="msg.role">
      <el-icon><User v-if="msg.role === 'user'" /><Cpu v-else /></el-icon>
    </div>
    <div class="body">
      <div class="meta">
        <span class="role">{{ roleLabel }}</span>
        <span class="model" v-if="msg.model">· {{ msg.model }}</span>
      </div>

      <CitationBlock
        v-if="citation"
        :book="citation.book"
        :book-id="citation.bookId"
        :page="citation.page"
        :quote="citation.quote"
        @go-to-book="onGoToBook"
      />

      <MarkdownView v-if="!editing" :content="displayContent" />
      <el-input
        v-else
        v-model="editingDraft"
        type="textarea"
        :rows="6"
        autofocus
      />

      <div v-if="msg.note && !citation" class="note-block">
        <div class="note-head">
          <el-icon><EditPen /></el-icon> 笔记
          <el-button text size="small" @click="openNote">编辑</el-button>
        </div>
        <div class="note-content">{{ msg.note }}</div>
      </div>

      <div class="actions">
        <el-button text size="small" @click="startEdit" v-if="!editing">编辑</el-button>
        <el-button text size="small" type="primary" @click="saveEdit" v-else>保存</el-button>
        <el-button text size="small" @click="cancelEdit" v-if="editing">取消</el-button>
        <el-button text size="small" @click="openNote">加笔记</el-button>
        <el-button text size="small" type="primary" @click="saveToKnowledge">保存到知识库</el-button>
        <el-button text size="small" @click="copyContent">复制</el-button>
        <el-button text size="small" type="danger" @click="onDelete">删除</el-button>
      </div>
    </div>

    <el-dialog v-model="noteVisible" title="编辑笔记 / 关联相同主题的对话" width="600px">
      <el-input v-model="noteDraft" type="textarea" :rows="8" placeholder="为这条 AI 回答关联某本书 / 知识点，或写下自己的笔记" />
      <template #footer>
        <el-button @click="noteVisible = false">取消</el-button>
        <el-button type="primary" @click="saveNote">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="knowledgeDialog.open" title="保存到知识库" width="520px">
      <el-form label-position="top">
        <el-form-item label="笔记标题"><el-input v-model="knowledgeDialog.title" /></el-form-item>
        <el-form-item label="标签"><el-input v-model="knowledgeDialog.tags" placeholder="例如：数学，错题，重点" /></el-form-item>
        <el-form-item label="保存到"><el-select v-model="knowledgeDialog.parentId" placeholder="收集箱"><el-option label="收集箱" value="" /><el-option v-for="folder in knowledgeDialog.folders" :key="folder.id" :label="folder.title" :value="folder.id" /></el-select></el-form-item>
      </el-form>
      <template #footer><el-button @click="knowledgeDialog.open = false">取消</el-button><el-button type="primary" :loading="knowledgeDialog.saving" @click="confirmSaveToKnowledge">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="reuseDialog.open" title="复用本条内容" width="640px">
      <el-form label-position="top">
        <el-form-item label="目标对话">
          <el-select v-model="reuseDialog.targetConv" placeholder="选择或将本对话标题留空以新建">
            <el-option v-for="c in chat.convs" :key="c.id" :label="c.title" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="作为">
          <el-radio-group v-model="reuseDialog.role">
            <el-radio value="user">用户消息</el-radio>
            <el-radio value="assistant">助手消息</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="正文">
          <el-input v-model="reuseDialog.content" type="textarea" :rows="8" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reuseDialog.open = false">取消</el-button>
        <el-button type="primary" @click="doReuse">复用</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import MarkdownView from './MarkdownView.vue'
import CitationBlock from './CitationBlock.vue'
import type { Msg } from '../stores/chat'
import { useContextMenu } from '../stores/context-menu'
import { useChatStore } from '../stores/chat'

const props = defineProps<{ msg: Msg }>()
const emit = defineEmits<{
  (e: 'edit', content: string): void
  (e: 'set-note', note: string): void
  (e: 'delete'): void
}>()
const chat = useChatStore()
const menu = useContextMenu()

const roleLabel = computed(() => (props.msg.role === 'user' ? 'You' : 'AI'))
const displayContent = computed(() => {
  const c = props.msg.content
  if (c !== undefined && c !== null && c !== '') return c
  if (props.msg.role === 'assistant') return '<span class="typing-dots">Thinking<span class="dot-anim">...</span></span>'
  return ''
})
const citation = computed(() => {
  try {
    if (props.msg.note && props.msg.note.includes('_citation')) {
      const parsed = JSON.parse(props.msg.note)
      return parsed._citation || null
    }
  } catch { /* not JSON */ }
  return null
})

const editing = ref(false)
const editingDraft = ref('')
function startEdit() { editingDraft.value = props.msg.content; editing.value = true }
function saveEdit() { emit('edit', editingDraft.value); editing.value = false }
function cancelEdit() { editing.value = false }

const noteVisible = ref(false)
const noteDraft = ref('')
function openNote() { noteDraft.value = props.msg.note || ''; noteVisible.value = true }
function saveNote() { emit('set-note', noteDraft.value); noteVisible.value = false }

async function copyContent() {
  await navigator.clipboard.writeText(props.msg.content || '')
  ElMessage.success('已复制')
}

function onDelete() { emit('delete') }

function onGoToBook(bookId: string) {
  window.dispatchEvent(new CustomEvent('lk:nav', { detail: { href: `app://book/${bookId}` } }))
}

// context menu
function onCtx(e: MouseEvent) {
  e.preventDefault()
  menu.open(e, [
    { label: '编辑', icon: 'Edit', action: startEdit },
    { label: '加笔记 / 标注', icon: 'EditPen', action: openNote },
    { label: '保存到知识库', icon: 'FolderAdd', action: saveToKnowledge },
    { label: '复制', icon: 'CopyDocument', shortcut: 'Ctrl+C', action: copyContent },
    { label: '引用此回答', icon: 'ChatLineSquare', shortcut: 'Ctrl+Q', action: () => emit('edit', props.msg.content) },
    { separator: true },
    { label: 'AI 辅助', icon: 'MagicStick', children: [
      { label: '解释这条内容', icon: 'Reading', action: () => askAi('请解释下面这条内容，并指出学习重点。') },
      { label: '续写 / 延伸', icon: 'Right', action: () => askAi('请基于下面内容继续展开，补充下一步学习方向。') },
      { label: '改写得更清楚', icon: 'EditPen', action: () => askAi('请将下面内容改写得更清楚、结构更适合学习。') },
      { label: '生成复习题', icon: 'QuestionFilled', action: () => askAi('请基于下面内容生成 3 道复习问答题，并提出可确认的闪卡操作。') },
      { label: '提出工具操作', icon: 'Tools', action: () => askAi('请根据下面内容提出需要的笔记、闪卡、计划或思维导图工具操作；仅提出，不要假设已经执行。') },
    ] },
    { label: '重新生成', icon: 'RefreshRight', action: () => askAi('请在不重复原话的前提下，为下面问题重新生成一个更好的回答。') },
    { separator: true },
    { label: '生成闪卡', icon: 'Plus', danger: false, action: makeCard },
    { label: '复用到另一对话', icon: 'CopyDocument', action: openReuse },
    { separator: true },
    { label: '删除', icon: 'Delete', danger: true, action: onDelete }
  ])
}
function askAi(prompt: string) {
  if (!props.msg.content.trim()) return
  window.dispatchEvent(new CustomEvent('lk:ai-action', { detail: { text: props.msg.content, prompt } }))
}

async function saveToKnowledge() {
  if (!props.msg.content.trim()) { ElMessage.warning('这条消息还没有可保存的内容'); return }
  const notes = await window.lk.notesList()
  knowledgeDialog.value = { open: true, saving: false, title: (props.msg.content.replace(/\s+/g, ' ').trim().slice(0, 48) || 'AI 知识片段'), tags: 'AI', parentId: '', folders: notes.filter((note: any) => note.kind === 'folder').map((note: any) => ({ id: note.id, title: note.title })) }
}
const knowledgeDialog = ref({ open: false, saving: false, title: '', tags: 'AI', parentId: '', folders: [] as Array<{ id: string; title: string }> })
async function confirmSaveToKnowledge() {
  try {
    knowledgeDialog.value.saving = true
    const noteId = await window.lk.notesCreateFromMessage({ messageId: props.msg.id, title: knowledgeDialog.value.title, tags: knowledgeDialog.value.tags, parentId: knowledgeDialog.value.parentId || null })
    knowledgeDialog.value.open = false
    ElMessage.success('已保存到知识库')
    window.dispatchEvent(new CustomEvent('lk:nav', { detail: { href: `app://note/${noteId}` } }))
  } catch (err: unknown) {
    ElMessage.error('保存失败：' + (err instanceof Error ? err.message : String(err)))
  } finally {
    knowledgeDialog.value.saving = false
  }
}

async function makeCard() {
  if (!props.msg.content) return
  let decks = await window.lk.deckList()
  if (!decks.length) {
    await window.lk.deckUpsert({ id: await window.lk.uuid(), title: '默认牌组', sort: 0 })
    decks = await window.lk.deckList()
  }
  const deckId = decks[0].id
  const front = (props.msg.content.split('\n').slice(0, 3).join('\n') || '').slice(0, 240)
  await window.lk.srsFromSource(deckId, front, props.msg.content.slice(0, 800), 'conversation', props.msg.conversation_id)
  ElMessage.success('已生成闪卡，可从复习卡跳回这段对话')
}

// reuse dialogs
const reuseDialog = ref({ open: false, targetConv: '', role: 'user', content: '' })
function openReuse() {
  reuseDialog.value = {
    open: true,
    targetConv: chat.convs.find((c) => c.id === chat.currentConvId)?.id || '',
    role: props.msg.role,
    content: props.msg.content
  }
}
async function doReuse() {
  if (!reuseDialog.value.content.trim()) { ElMessage.warning('正文不能为空'); return }
  let convId = reuseDialog.value.targetConv
  if (!convId) {
    const c = await chat.newConv(null, '复用片段')
    convId = c.id
  }
  await window.lk.msgSave({
    conversation_id: convId,
    role: reuseDialog.value.role,
    content: reuseDialog.value.content,
    sort: Math.floor(Date.now() / 1000)
  })
  reuseDialog.value.open = false
  ElMessage.success('已复用')
}
</script>

<style scoped lang="scss">
.msg {
  display: flex;
  gap: 10px;
  padding: 10px 13px;
  border-radius: 12px;
  border: 1px solid transparent;
  transition: background .15s, border-color .15s, box-shadow .15s;
  &.user { margin-left: 26px; background: color-mix(in srgb, var(--accent) 9%, var(--bg-elev)); border-color: color-mix(in srgb, var(--accent) 28%, var(--border)); }
  &.assistant { margin-right: 22px; background: color-mix(in srgb, var(--bg-elev) 78%, transparent); border-color: var(--border); }
  &:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); box-shadow: 0 8px 22px rgba(0,0,0,.1); }
}
.avatar {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  flex-shrink: 0;
}
.msg.user .avatar { background: #6e8fa7; }
.body { flex: 1; min-width: 0; }
.meta { font-size: 12px; color: var(--text-dim); margin-bottom: 4px; }
.actions {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  opacity: 0.35;
}
.msg:hover .actions { opacity: 1; }
.note-block {
  margin-top: 8px;
  border-left: 3px solid #d4b469;
  padding: 4px 10px;
  background: rgba(212,180,105,0.08);
  border-radius: 4px;
  font-size: 13px;
}
.note-head {
  display: flex; align-items: center; gap: 6px;
  color: var(--text-dim);
  font-size: 12px;
}
</style>

<style lang="scss">
.typing-dots { color: var(--text-dim); font-style: italic; }
.dot-anim { display: inline-block; animation: dotPulse 1.4s steps(4, end) infinite; }
@keyframes dotPulse {
  0% { opacity: 0.2; }
  50% { opacity: 1; }
  100% { opacity: 0.2; }
}
</style>
