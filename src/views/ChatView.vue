<template>
  <div class="chat-scroll" ref="scroller">
    <div class="msg-list" v-if="turns.length">
      <div class="flow-intro"><span class="eyebrow">连续对话流</span><span>{{ turns.length }} 轮问答 · 可拖入折叠组整理</span><el-button size="small" plain @click="createFold">+ 折叠组</el-button></div>
      <template v-for="block in flowBlocks" :key="block.id">
        <ConversationTurn v-if="block.kind === 'turn'" :turn="block.turn" @followup="$emit('followup', $event)" @toggle-collapse="toggleCollapse" @drag-start="dragTurnId = $event" @drop="dropToRoot" @move-request="openMove" />
        <section v-else class="fold-group" :class="{ closed: block.fold.collapsed }" @dragover.prevent @drop.prevent="dropIntoFold(block.fold.id)">
          <header class="fold-head" @click="toggleFold(block.fold)"><span class="fold-arrow">▶</span><span class="fold-title">{{ block.fold.title }}</span><span class="fold-count">{{ block.turns.length }} 轮</span><span class="fold-hint">拖到这里收纳</span><el-button text size="small" @click.stop="renameFold(block.fold)">重命名</el-button><el-button text size="small" type="danger" @click.stop="deleteFold(block.fold.id)">解散</el-button></header>
          <div v-show="!block.fold.collapsed" class="fold-content"><ConversationTurn v-for="turn in block.turns" :key="turn.id" :turn="turn" @followup="$emit('followup', $event)" @toggle-collapse="toggleCollapse" @drag-start="dragTurnId = $event" @drop="dropIntoFold(block.fold.id)" @move-request="openMove" /></div>
        </section>
      </template>
    </div>
    <div v-else class="empty"><p>还没有对话。</p><p class="hint">在下方输入框发送消息开始学习。</p></div>
    <el-dialog v-model="moveDialog.open" title="移动问答轮次" width="480px"><p>会同时移动这轮下的全部追问。</p><el-select v-model="moveDialog.targetConv" filterable placeholder="搜索或选择目标对话"><el-option v-for="conv in chat.convs" :key="conv.id" :label="conv.title" :value="conv.id" /></el-select><template #footer><el-button @click="moveDialog.open=false">取消</el-button><el-button type="primary" @click="moveToConversation">移动</el-button></template></el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useChatStore, type Msg } from '../stores/chat'
import ConversationTurn, { type Turn } from '../components/ConversationTurn.vue'

type Fold = { id: string; title: string; collapsed: number; sort: number }
type FlowBlock = { kind: 'turn'; id: string; turn: Turn } | { kind: 'fold'; id: string; fold: Fold; turns: Turn[] }
defineEmits<{ (e: 'followup', value: { text: string; parentTurnId: string }): void }>()
const chat = useChatStore()
const scroller = ref<HTMLElement | null>(null)
const dragTurnId = ref('')
const folds = ref<Fold[]>([])
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
    if (!turn) { turn = { id, parentTurnId: message.parent_turn_id ?? null, collapsed: Number(message.collapsed || 0) === 1, depth: 0, childrenCount: 0, foldId: message.fold_id ?? null }; map.set(id, turn); order.push(id) }
    if (message.role === 'user' && !turn.user) { turn.user = message; legacy = turn }
    else if (message.role === 'assistant' && !turn.assistant) turn.assistant = message
  }
  const list = order.map((id) => map.get(id)!)
  for (const turn of list) { let parent = turn.parentTurnId ? map.get(turn.parentTurnId) : undefined; while (parent) { turn.depth++; parent.childrenCount++; parent = parent.parentTurnId ? map.get(parent.parentTurnId) : undefined } }
  return list
})
const flowBlocks = computed<FlowBlock[]>(() => {
  const blocks: FlowBlock[] = []; const seenFolds = new Set<string>(); const foldMap = new Map(folds.value.map((fold) => [fold.id, fold]))
  for (const turn of turns.value) { const fold = turn.foldId ? foldMap.get(turn.foldId) : undefined; if (!fold) blocks.push({ kind: 'turn', id: turn.id, turn }); else if (!seenFolds.has(fold.id)) { seenFolds.add(fold.id); blocks.push({ kind: 'fold', id: fold.id, fold, turns: turns.value.filter((item) => item.foldId === fold.id) }) } }
  return blocks
})
function scrollToBottom() { nextTick(() => { if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight }) }
watch(() => messages.value.map((m: Msg) => m.id + ':' + m.content.length).join('|'), scrollToBottom)
watch(() => chat.currentConvId, async (id) => { if (id) folds.value = await window.lk.foldList(id); scrollToBottom() }, { immediate: true })
async function reload() { const id = chat.currentConvId; if (!id) return; await chat.selectConv(id); folds.value = await window.lk.foldList(id) }
async function toggleCollapse(turn: Turn) { const collapsed = !turn.collapsed; await window.lk.turnCollapse(turn.id, collapsed); for (const message of messages.value) if (message.turn_id === turn.id) message.collapsed = collapsed ? 1 : 0 }
async function dropToRoot(targetTurnId: string) { if (!dragTurnId.value || dragTurnId.value === targetTurnId || !chat.currentConvId) return; await window.lk.turnMove({ turnId: dragTurnId.value, targetConversationId: chat.currentConvId, afterTurnId: targetTurnId, targetFoldId: null }); dragTurnId.value = ''; await reload() }
async function dropIntoFold(foldId: string) { if (!dragTurnId.value || !chat.currentConvId) return; await window.lk.turnMove({ turnId: dragTurnId.value, targetConversationId: chat.currentConvId, targetFoldId: foldId }); dragTurnId.value = ''; await reload() }
async function createFold() { if (!chat.currentConvId) return; const result = await ElMessageBox.prompt('为折叠组命名', '新建折叠组', { inputValue: '待整理追问' }).catch(() => null); if (!result?.value) return; await window.lk.foldCreate({ conversationId: chat.currentConvId, title: result.value }); folds.value = await window.lk.foldList(chat.currentConvId) }
async function toggleFold(fold: Fold) { await window.lk.foldPatch(fold.id, { collapsed: !fold.collapsed }); fold.collapsed = fold.collapsed ? 0 : 1 }
async function renameFold(fold: Fold) { const result = await ElMessageBox.prompt('折叠组名称', '重命名', { inputValue: fold.title }).catch(() => null); if (!result?.value) return; await window.lk.foldPatch(fold.id, { title: result.value }); fold.title = result.value }
async function deleteFold(id: string) { await window.lk.foldDelete(id); await reload() }
function openMove(turn: Turn) { moveDialog.value = { open: true, turnId: turn.id, targetConv: '' } }
async function moveToConversation() { if (!moveDialog.value.targetConv) return; await window.lk.turnMove({ turnId: moveDialog.value.turnId, targetConversationId: moveDialog.value.targetConv, targetFoldId: null }); moveDialog.value.open = false; await reload() }
</script>

<style scoped lang="scss">
.chat-scroll { flex: 1; overflow-y: auto; padding: 28px 0 70px; background: radial-gradient(800px 480px at 7% 0%, rgba(216,164,120,.055), transparent 62%), radial-gradient(720px 520px at 100% 100%, rgba(78,201,176,.045), transparent 65%), var(--bg); }.msg-list { max-width: 800px; margin: 0 auto; padding: 0 24px; }.flow-intro { display: flex; align-items: center; gap: 10px; padding: 0 8px 18px; color: var(--text-dim); font-size: 11px; }.eyebrow { color: var(--accent); font-size: 10px; font-weight: 700; letter-spacing: .08em; }.flow-intro :deep(.el-button) { margin-left: auto; }.fold-group { margin: 8px 0 14px; border: 1px solid color-mix(in srgb, var(--accent) 26%, var(--border)); border-radius: 12px; overflow: hidden; background: color-mix(in srgb, var(--accent) 5%, var(--bg-elev)); transition: border-color .16s, box-shadow .16s; }.fold-group:hover { border-color: var(--accent); box-shadow: 0 6px 24px rgba(0,0,0,.12); }.fold-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; cursor: pointer; color: var(--text-dim); font-size: 12px; }.fold-arrow { color: var(--accent); font-size: 9px; transition: transform .2s; }.fold-title { color: var(--text); font-weight: 600; }.fold-count { border-radius: 10px; padding: 1px 7px; background: var(--accent-dim); color: var(--accent-text); font-size: 10px; }.fold-hint { margin-left: auto; font-size: 10px; }.fold-group.closed .fold-arrow { transform: rotate(-90deg); }.fold-content { padding: 4px 8px 8px; border-top: 1px solid var(--border); background: rgba(0,0,0,.08); }.empty { text-align: center; margin-top: 120px; color: var(--text-dim); .hint { font-size: 13px; } }
</style>
