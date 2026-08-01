<template>
  <section class="turn" :data-turn-id="turn.id" :class="{ collapsed: turn.collapsed }" :style="{ marginLeft: `${turn.depth * 22}px` }" draggable="true" @dragstart="$emit('drag-start', turn.id)" @dragover.prevent @drop.prevent="$emit('drop', turn.id)" @contextmenu.prevent="openTurnMenu">
    <div class="turn-head"><button class="fold" :title="turn.collapsed ? '展开本轮' : '折叠本轮'" @click="$emit('toggle-collapse', turn)">{{ turn.collapsed ? '›' : '⌄' }}</button><span>{{ turn.user ? '问答轮次' : 'AI 消息' }}</span><small v-if="turn.childrenCount">{{ turn.childrenCount }} 条追问</small><span class="drag">⠿ 拖动整理</span></div>
    <div v-if="turn.collapsed" class="collapsed-summary" @click="$emit('toggle-collapse', turn)">{{ turn.user?.content || turn.assistant?.content || '已折叠内容' }}</div>
    <template v-else>
      <MessageItem v-if="turn.user" :msg="turn.user" @edit="patch(turn.user, $event)" @set-note="setNote(turn.user, $event)" @delete="deleteMsg(turn.user)" />
      <MessageItem v-if="turn.assistant" :msg="turn.assistant" @edit="patch(turn.assistant, $event)" @set-note="setNote(turn.assistant, $event)" @delete="deleteMsg(turn.assistant)" />
      <div v-if="turn.assistant" class="followup"><el-input v-model="followup" size="small" placeholder="继续追问这条回答…（Enter 发送）" @keyup.enter="sendFollowup" /><el-button size="small" :disabled="!followup.trim()" @click="sendFollowup">追问</el-button></div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useChatStore, type Msg } from '../stores/chat'
import { useContextMenu } from '../stores/context-menu'
import MessageItem from './MessageItem.vue'

export type Turn = { id: string; parentTurnId: string | null; user?: Msg; assistant?: Msg; collapsed: boolean; depth: number; childrenCount: number }
const props = defineProps<{ turn: Turn }>()
const emit = defineEmits<{ (e: 'followup', value: { text: string; parentTurnId: string }): void; (e: 'toggle-collapse', turn: Turn): void; (e: 'drag-start', turnId: string): void; (e: 'drop', targetTurnId: string): void; (e: 'move-request', turn: Turn): void }>()
const chat = useChatStore()
const menu = useContextMenu()
const followup = ref('')
function sendFollowup() { const text = followup.value.trim(); if (!text) return; followup.value = ''; emit('followup', { text, parentTurnId: props.turn.id }) }
async function patch(msg: Msg, content: string) { msg.content = content; await window.lk.msgPatch(msg.id, { content }) }
async function setNote(msg: Msg, note: string) { msg.note = note; await window.lk.msgPatch(msg.id, { note }) }
async function deleteMsg(msg: Msg) { await chat.deleteMessage(msg.id) }
function openTurnMenu(e: MouseEvent) {
  menu.open(e, [
    { label: props.turn.collapsed ? '展开本轮' : '折叠本轮', icon: 'Fold' as any, action: () => emit('toggle-collapse', props.turn) },
    { label: '追问此轮', icon: 'ChatDotRound' as any, action: () => document.querySelector<HTMLInputElement>(`.turn[data-turn-id="${props.turn.id}"] input`)?.focus() },
    { separator: true },
    { label: '移动到其他对话', icon: 'Rank' as any, action: () => emit('move-request', props.turn) },
    { label: '复制本轮摘要', icon: 'CopyDocument' as any, action: async () => navigator.clipboard.writeText([props.turn.user?.content, props.turn.assistant?.content].filter(Boolean).join('\n\n')) },
  ])
}
</script>

<style scoped lang="scss">
.turn { border-left: 2px solid transparent; padding: 3px 0 10px; transition: border-color .15s, background .15s; }.turn:hover { border-left-color: var(--accent); }.turn-head { height: 24px; display: flex; align-items: center; gap: 7px; padding: 0 14px; color: var(--text-dim); font-size: 11px; }.turn-head small { color: var(--text-dim); }.fold { width: 20px; border: 0; background: transparent; color: var(--text-dim); cursor: pointer; font-size: 17px; }.drag { margin-left: auto; opacity: 0; cursor: grab; }.turn:hover .drag { opacity: 1; }.collapsed-summary { margin: 0 14px; padding: 8px 11px; border-radius: 6px; color: var(--text-dim); background: var(--bg-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }.followup { display: flex; gap: 6px; margin: 8px 14px 0 52px; }.followup :deep(.el-input) { flex: 1; }
</style>
