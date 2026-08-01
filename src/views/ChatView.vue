<template>
  <div class="chat-scroll" ref="scroller">
    <div class="msg-list" v-if="turns.length">
      <ConversationTurn v-for="turn in turns" :key="turn.id" :turn="turn" @followup="$emit('followup', $event)" @toggle-collapse="toggleCollapse" @drag-start="dragTurnId = $event" @drop="dropTurn" @move-request="openMove" />
    </div>
    <div v-else class="empty"><p>还没有对话。</p><p class="hint">在下方输入框发送消息开始学习。</p></div>
    <el-dialog v-model="moveDialog.open" title="移动问答轮次" width="480px"><p>会同时移动这轮下的全部追问。</p><el-select v-model="moveDialog.targetConv" filterable placeholder="搜索或选择目标对话"><el-option v-for="conv in chat.convs" :key="conv.id" :label="conv.title" :value="conv.id" /></el-select><template #footer><el-button @click="moveDialog.open=false">取消</el-button><el-button type="primary" @click="moveToConversation">移动</el-button></template></el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useChatStore, type Msg } from '../stores/chat'
import ConversationTurn, { type Turn } from '../components/ConversationTurn.vue'

defineEmits<{ (e: 'followup', value: { text: string; parentTurnId: string }): void }>()
const chat = useChatStore()
const scroller = ref<HTMLElement | null>(null)
const dragTurnId = ref('')
const moveDialog = ref({ open: false, turnId: '', targetConv: '' })
const messages = computed(() => chat.activeMessages)
const turns = computed<Turn[]>(() => {
  const map = new Map<string, Turn>()
  const order: string[] = []
  let legacy: Turn | undefined
  for (const message of messages.value) {
    let id = message.turn_id || message.id
    if (!message.turn_id && message.role === 'assistant' && legacy && legacy.assistant === undefined) id = legacy.id
    let turn = map.get(id)
    if (!turn) { turn = { id, parentTurnId: message.parent_turn_id ?? null, collapsed: Number(message.collapsed || 0) === 1, depth: 0, childrenCount: 0 }; map.set(id, turn); order.push(id) }
    if (message.role === 'user' && !turn.user) { turn.user = message; legacy = turn }
    else if (message.role === 'assistant' && !turn.assistant) turn.assistant = message
  }
  const list = order.map((id) => map.get(id)!)
  for (const turn of list) { let parent = turn.parentTurnId ? map.get(turn.parentTurnId) : undefined; while (parent) { turn.depth++; parent.childrenCount++; parent = parent.parentTurnId ? map.get(parent.parentTurnId) : undefined } }
  return list
})
function scrollToBottom() { nextTick(() => { if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight }) }
watch(() => messages.value.map((m: Msg) => m.id + ':' + m.content.length).join('|'), scrollToBottom)
watch(() => chat.currentConvId, scrollToBottom)
async function toggleCollapse(turn: Turn) { const collapsed = !turn.collapsed; await window.lk.turnCollapse(turn.id, collapsed); for (const message of messages.value) if (message.turn_id === turn.id) message.collapsed = collapsed ? 1 : 0 }
async function dropTurn(targetTurnId: string) { if (!dragTurnId.value || dragTurnId.value === targetTurnId || !chat.currentConvId) return; await window.lk.turnMove({ turnId: dragTurnId.value, targetConversationId: chat.currentConvId, afterTurnId: targetTurnId }); dragTurnId.value = ''; await chat.selectConv(chat.currentConvId) }
function openMove(turn: Turn) { moveDialog.value = { open: true, turnId: turn.id, targetConv: '' } }
async function moveToConversation() { if (!moveDialog.value.targetConv) return; await window.lk.turnMove({ turnId: moveDialog.value.turnId, targetConversationId: moveDialog.value.targetConv }); const current = chat.currentConvId; moveDialog.value.open = false; if (current) await chat.selectConv(current) }
</script>

<style scoped lang="scss">
.chat-scroll { flex: 1; overflow-y: auto; padding: 12px 0 24px; background: var(--bg); }.msg-list { max-width: 960px; margin: 0 auto; padding: 0 24px; }.empty { text-align: center; margin-top: 120px; color: var(--text-dim); .hint { font-size: 13px; } }
</style>
