<template>
  <section class="turn" :data-turn-id="turn.id" :class="{ collapsed: turn.collapsed, dragging: dragging }" :style="{ marginLeft: `${turn.depth * 22}px` }" draggable="true" @dragstart="startDrag" @dragend="dragging = false" @dragover.prevent @drop.prevent="$emit('drop', turn.id)" @contextmenu.prevent="openTurnMenu">
    <div class="turn-head"><button class="fold" :title="turn.collapsed ? '展开本轮' : '折叠本轮'" @click="$emit('toggle-collapse', turn)">{{ turn.collapsed ? '›' : '⌄' }}</button><span>{{ turn.user ? '问答轮次' : 'AI 消息' }}</span><small v-if="turn.childrenCount">{{ turn.childrenCount }} 条追问</small><span class="drag">⠿ 拖动整轮</span></div>
    <div v-if="turn.collapsed" class="collapsed-summary" @click="$emit('toggle-collapse', turn)"><span>折叠的问答</span>{{ turn.user?.content || turn.assistant?.content || '已折叠内容' }}</div>
    <template v-else>
      <MessageItem v-if="turn.user" :msg="turn.user" @edit="patch(turn.user, $event)" @set-note="setNote(turn.user, $event)" @delete="deleteMsg(turn.user)" />
      <div v-if="turn.assistant" class="assistant-reply" draggable="true" @dragstart.stop="startDrag" @dragend="dragging = false">
        <div class="reply-label"><span>AI 回复</span><span class="reply-drag">⠿ 从此处拖动整轮到章节</span></div>
        <MessageItem :msg="turn.assistant" @edit="patch(turn.assistant, $event)" @set-note="setNote(turn.assistant, $event)" @delete="deleteMsg(turn.assistant)" />
        <div v-if="turn.branches.length" class="reply-branches">
          <template v-for="branch in turn.branches" :key="branch.id">
            <section v-if="branch.kind === 'chapter'" class="embedded-chapter" :class="{ closed: branch.chapter.collapsed, 'is-drop-target': dropChapterId === branch.chapter.id }" @dragenter.prevent="dropChapterId = branch.chapter.id" @dragover.prevent="dropChapterId = branch.chapter.id" @dragleave="dropChapterId = ''" @drop.stop.prevent="dropIntoChapter(branch.chapter.id)">
              <header class="embedded-head" @click="$emit('toggle-chapter', branch.chapter)" @contextmenu.prevent="$emit('chapter-menu', { event: $event, chapter: branch.chapter })"><span class="chapter-arrow">▶</span><span class="chapter-name">{{ branch.chapter.title }}</span><span class="chapter-count">{{ branch.chapter.turns.length }} 条追问</span><span class="chapter-hint">拖到这里折叠收纳</span></header>
              <div v-if="dropChapterId === branch.chapter.id" class="drop-tip">松开鼠标，将“用户消息 + AI 回复”收进「{{ branch.chapter.title }}」</div>
              <div v-show="!branch.chapter.collapsed" class="chapter-turns"><ConversationTurn v-for="child in branch.chapter.turns" :key="child.id" :turn="child" @followup="$emit('followup', $event)" @toggle-collapse="$emit('toggle-collapse', $event)" @drag-start="$emit('drag-start', $event)" @drop="$emit('drop', $event)" @move-into-chapter="$emit('move-into-chapter', $event)" @move-request="$emit('move-request', $event)" @restore="$emit('restore', $event)" @toggle-chapter="$emit('toggle-chapter', $event)" @chapter-menu="$emit('chapter-menu', $event)" /></div>
            </section>
            <ConversationTurn v-else :turn="branch.turn" @followup="$emit('followup', $event)" @toggle-collapse="$emit('toggle-collapse', $event)" @drag-start="$emit('drag-start', $event)" @drop="$emit('drop', $event)" @move-into-chapter="$emit('move-into-chapter', $event)" @move-request="$emit('move-request', $event)" @restore="$emit('restore', $event)" @toggle-chapter="$emit('toggle-chapter', $event)" @chapter-menu="$emit('chapter-menu', $event)" />
          </template>
        </div>
        <div class="followup"><span class="followup-label">追问这条回复</span><el-input v-model="followup" size="small" placeholder="继续追问…（Enter 发送）" @keyup.enter="sendFollowup" /><el-button size="small" type="primary" :disabled="!followup.trim()" @click="sendFollowup">追问</el-button></div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useChatStore, type Msg } from '../stores/chat'
import { useContextMenu } from '../stores/context-menu'
import MessageItem from './MessageItem.vue'

export type Chapter = { id: string; title: string; tags?: string; collapsed: number; sort: number; turns: Turn[] }
export type TurnBranch = { kind: 'turn'; id: string; turn: Turn } | { kind: 'chapter'; id: string; chapter: Chapter }
export type Turn = { id: string; parentTurnId: string | null; user?: Msg; assistant?: Msg; collapsed: boolean; depth: number; childrenCount: number; foldId: string | null; children: Turn[]; branches: TurnBranch[] }
const props = defineProps<{ turn: Turn }>()
const emit = defineEmits<{ (e: 'followup', value: { text: string; parentTurnId: string }): void; (e: 'toggle-collapse', turn: Turn): void; (e: 'drag-start', turnId: string): void; (e: 'drop', targetTurnId: string): void; (e: 'move-into-chapter', chapterId: string): void; (e: 'move-request', turn: Turn): void; (e: 'restore', turn: Turn): void; (e: 'toggle-chapter', chapter: Chapter): void; (e: 'chapter-menu', data: { event: MouseEvent; chapter: Chapter }): void }>()
const chat = useChatStore()
const menu = useContextMenu()
const followup = ref('')
const dragging = ref(false)
const dropChapterId = ref('')
function sendFollowup() { const text = followup.value.trim(); if (!text) return; followup.value = ''; emit('followup', { text, parentTurnId: props.turn.id }) }
function startDrag(event: DragEvent) { dragging.value = true; event.dataTransfer?.setData('application/x-learning-kit-turn', props.turn.id); event.dataTransfer?.setData('text/plain', props.turn.id); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'; emit('drag-start', props.turn.id) }
function dropIntoChapter(chapterId: string) { dropChapterId.value = ''; emit('move-into-chapter', chapterId) }
async function patch(msg: Msg, content: string) { msg.content = content; await window.lk.msgPatch(msg.id, { content }) }
async function setNote(msg: Msg, note: string) { msg.note = note; await window.lk.msgPatch(msg.id, { note }) }
async function deleteMsg(msg: Msg) { await chat.deleteMessage(msg.id) }
function openTurnMenu(e: MouseEvent) { menu.open(e, [
  { label: props.turn.collapsed ? '展开本轮' : '折叠本轮', icon: 'Fold' as any, action: () => emit('toggle-collapse', props.turn) },
  { label: '追问此轮', icon: 'ChatDotRound' as any, action: () => document.querySelector<HTMLInputElement>(`.turn[data-turn-id="${props.turn.id}"] input`)?.focus() },
  { separator: true },
  { label: '移动到其他对话', icon: 'Rank' as any, action: () => emit('move-request', props.turn) },
  ...(props.turn.user?.origin_conversation_id || props.turn.assistant?.origin_conversation_id ? [{ label: '恢复原位置', icon: 'RefreshLeft' as any, action: () => emit('restore', props.turn) }] : []),
  { label: '复制本轮摘要', icon: 'CopyDocument' as any, action: async () => navigator.clipboard.writeText([props.turn.user?.content, props.turn.assistant?.content].filter(Boolean).join('\n\n')) },
]) }
</script>

<style scoped lang="scss">
.turn { border-left: 2px solid transparent; padding: 3px 0 12px; transition: border-color .15s, opacity .15s; }.turn:hover { border-left-color: var(--accent); }.turn.dragging { opacity: .48; }.turn-head { height: 24px; display: flex; align-items: center; gap: 7px; padding: 0 14px; color: var(--text-dim); font-size: 11px; }.turn-head small { color: var(--text-dim); }.fold { width: 20px; border: 0; background: transparent; color: var(--text-dim); cursor: pointer; font-size: 17px; }.drag { margin-left: auto; opacity: 0; cursor: grab; }.turn:hover .drag { opacity: 1; }.collapsed-summary { display: flex; gap: 9px; margin: 0 14px; padding: 9px 11px; border-radius: 7px; color: var(--text-dim); background: var(--bg-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }.collapsed-summary span { color: var(--accent); font-size: 10px; flex: none; }.assistant-reply { margin: 7px 22px 0 0; padding: 7px; border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border)); border-radius: 15px; background: linear-gradient(140deg, color-mix(in srgb, var(--accent) 5%, var(--bg-elev)), var(--bg-elev)); }.reply-label { display: flex; padding: 1px 6px 6px; color: var(--accent); font-size: 10px; font-weight: 700; letter-spacing: .05em; }.reply-drag { margin-left: auto; color: var(--text-dim); font-weight: 400; opacity: 0; }.assistant-reply:hover .reply-drag { opacity: 1; }.assistant-reply :deep(.msg.assistant) { margin-right: 0; border-color: transparent; background: transparent; box-shadow: none; }.reply-branches { margin: 8px 4px 4px 28px; }.embedded-chapter { margin: 8px 0; border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border)); border-radius: 10px; overflow: hidden; background: var(--bg-soft); transition: border-color .15s, box-shadow .15s; }.embedded-chapter.is-drop-target { border: 2px dashed var(--accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 14%, transparent); }.embedded-head { display: flex; align-items: center; gap: 7px; min-height: 34px; padding: 0 10px; cursor: pointer; color: var(--text-dim); font-size: 11px; }.chapter-arrow { color: var(--accent); font-size: 9px; }.closed .chapter-arrow { transform: rotate(-90deg); }.chapter-name { color: var(--text); font-weight: 650; }.chapter-count { padding: 1px 6px; border-radius: 9px; background: var(--accent-dim); color: var(--accent-text); font-size: 10px; }.chapter-hint { margin-left: auto; color: var(--accent); font-size: 10px; }.drop-tip { margin: 0 8px 8px; padding: 9px 10px; border-radius: 7px; background: color-mix(in srgb, var(--accent) 13%, transparent); color: var(--accent-text); font-size: 11px; }.chapter-turns { padding: 0 5px 6px; border-top: 1px solid var(--border); }.chapter-turns .turn { margin-left: 0 !important; }.followup { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 7px; margin: 9px 5px 3px 32px; padding-top: 8px; border-top: 1px dashed var(--border); }.followup-label { color: var(--text-dim); font-size: 10px; }.followup :deep(.el-input) { min-width: 0; }
</style>
