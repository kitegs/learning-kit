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

      <MarkdownView v-if="!editing" :content="displayContent" />
      <el-input
        v-else
        v-model="editingDraft"
        type="textarea"
        :rows="6"
        autofocus
      />

      <div v-if="msg.note" class="note-block">
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

// context menu
function onCtx(e: MouseEvent) {
  e.preventDefault()
  menu.open(e, [
    { label: '编辑', icon: 'Edit', action: startEdit },
    { label: '加笔记 / 标注', icon: 'EditPen', action: openNote },
    { label: '复制', icon: 'CopyDocument', shortcut: 'Ctrl+C', action: copyContent },
    { label: '引用此回答', icon: 'ChatLineSquare', shortcut: 'Ctrl+Q', action: () => emit('edit', props.msg.content) },
    { separator: true },
    { label: '生成闪卡', icon: 'Plus', danger: false, action: makeCard },
    { label: '复用到另一对话', icon: 'CopyDocument', action: openReuse },
    { separator: true },
    { label: '删除', icon: 'Delete', danger: true, action: onDelete }
  ])
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
  await window.lk.cardSave({ deckId, front, back: props.msg.content.slice(0, 800), kind: 'qa' })
  ElMessage.success('已生成闪卡，去"复习"中查看')
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
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--bg-soft);
  border: 1px solid transparent;
  &.user { border-color: rgba(78,161,255,0.25); }
  &.assistant { background: var(--bg-elev); }
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
  opacity: 0.6;
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