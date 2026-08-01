<template>
  <div class="chat-scroll" ref="scroller">
    <div class="msg-list" v-if="turns.length">
      <div class="flow-intro"><span class="eyebrow">连续对话流</span><span>{{ turns.length }} 轮问答 · 每轮可拖入章节收纳</span><el-button size="small" plain @click="createFold">+ 新建章节</el-button></div>
      <template v-for="block in flowBlocks" :key="block.id">
        <ConversationTurn v-if="block.kind === 'turn'" :turn="block.turn" @followup="$emit('followup', $event)" @toggle-collapse="toggleCollapse" @drag-start="dragTurnId = $event" @drop="dropToRoot" @move-into-chapter="dropIntoFold" @move-request="openMove" @restore="restoreTurn" @toggle-chapter="toggleFold" @chapter-menu="openChapterMenu" />
        <section v-else class="fold-group" :class="{ closed: block.fold.collapsed, 'is-drop-target': dropFoldId === block.fold.id }" @dragenter.prevent="dropFoldId = block.fold.id" @dragover.prevent="dropFoldId = block.fold.id" @dragleave="dropFoldId = ''" @drop.prevent="dropIntoFold(block.fold.id)">
          <header class="fold-head" @click="toggleFold(block.fold)" @contextmenu.prevent="openFoldMenu($event, block.fold)">
            <span class="fold-arrow">▶</span>
            <div class="fold-copy"><span class="fold-kicker">第 {{ foldNumber(block.fold.id) }} 章 · 对话 #{{ conversationNumber }}</span><span class="fold-title">{{ block.fold.title }}</span><span class="fold-summary">{{ foldSummary(block.turns) }}</span></div>
            <div class="fold-meta"><span v-for="tag in foldTags(block.fold)" :key="tag" class="tag">#{{ tag }}</span><span v-for="link in foldLinks(block.fold.id)" :key="link.id" class="reference" @click.stop="removeLink(link.id)">↗ {{ conversationTitle(link.target_id) }} ×</span></div>
            <span class="fold-count">{{ block.turns.length }} 轮</span><span class="fold-hint">{{ dropFoldId === block.fold.id ? '松开鼠标收纳本轮' : '右键管理 · 拖到这里收纳' }}</span><el-button text size="small" @click.stop="openFoldMenu($event, block.fold)">···</el-button>
          </header>
          <div v-if="dropFoldId === block.fold.id" class="root-drop-tip">松开鼠标，将“用户消息 + AI 回复”折叠收纳到「{{ block.fold.title }}」</div>
          <div v-show="!block.fold.collapsed" class="fold-content"><div class="chapter-note">章节内保持连续追问；每条追问会显示在对应 AI 回复框中。</div><ConversationTurn v-for="turn in block.turns" :key="turn.id" :turn="turn" @followup="$emit('followup', $event)" @toggle-collapse="toggleCollapse" @drag-start="dragTurnId = $event" @drop="dropIntoFold(block.fold.id)" @move-into-chapter="dropIntoFold" @move-request="openMove" @restore="restoreTurn" @toggle-chapter="toggleFold" @chapter-menu="openChapterMenu" /></div>
        </section>
      </template>
    </div>
    <div v-else class="empty"><p>还没有对话。</p><p class="hint">在下方输入框发送消息开始学习。</p></div>
    <el-dialog v-model="moveDialog.open" title="移动问答轮次" width="480px"><p>会同时移动这一轮和它下面的全部追问；以后可通过右键恢复原位置。</p><el-select v-model="moveDialog.targetConv" filterable placeholder="搜索或选择目标对话"><el-option v-for="conv in chat.convs" :key="conv.id" :label="conv.title" :value="conv.id" /></el-select><template #footer><el-button @click="moveDialog.open=false">取消</el-button><el-button type="primary" @click="moveToConversation">移动</el-button></template></el-dialog>
    <el-dialog v-model="referenceDialog.open" title="关联其他对话章节" width="500px"><p>在此章节下保留一条可回看的对话关联，不会移动原内容。</p><el-select v-model="referenceDialog.targetConv" filterable placeholder="搜索对话标题"><el-option v-for="conv in referenceCandidates" :key="conv.id" :label="`对话 #${conversationIndex(conv.id)} · ${conv.title}`" :value="conv.id" /></el-select><template #footer><el-button @click="referenceDialog.open=false">取消</el-button><el-button type="primary" @click="addReference">添加关联</el-button></template></el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useChatStore, type Msg } from '../stores/chat'
import { useContextMenu } from '../stores/context-menu'
import ConversationTurn, { type Chapter, type Turn } from '../components/ConversationTurn.vue'

type Fold = Omit<Chapter, 'turns'>
type FoldLink = { id: string; target_id: string }
type FlowBlock = { kind: 'turn'; id: string; turn: Turn } | { kind: 'fold'; id: string; fold: Fold; turns: Turn[] }
defineEmits<{ (e: 'followup', value: { text: string; parentTurnId: string }): void }>()
const chat = useChatStore()
const menu = useContextMenu()
const scroller = ref<HTMLElement | null>(null)
const dragTurnId = ref('')
const dropFoldId = ref('')
const folds = ref<Fold[]>([])
const linksByFold = ref<Record<string, FoldLink[]>>({})
const moveDialog = ref({ open: false, turnId: '', targetConv: '' })
const referenceDialog = ref({ open: false, foldId: '', targetConv: '' })
const messages = computed(() => chat.activeMessages)
const conversationNumber = computed(() => chat.currentConvId ? conversationIndex(chat.currentConvId) : 1)
const referenceCandidates = computed(() => chat.convs.filter((conv) => conv.id !== chat.currentConvId))
const turns = computed<Turn[]>(() => {
  const map = new Map<string, Turn>(); const order: string[] = []; let legacy: Turn | undefined
  for (const message of messages.value) {
    let id = message.turn_id || message.id
    if (!message.turn_id && message.role === 'assistant' && legacy && legacy.assistant === undefined) id = legacy.id
    let turn = map.get(id)
    if (!turn) { turn = { id, parentTurnId: message.parent_turn_id ?? null, collapsed: Number(message.collapsed || 0) === 1, depth: 0, childrenCount: 0, foldId: message.fold_id ?? null, children: [], branches: [] }; map.set(id, turn); order.push(id) }
    if (message.role === 'user' && !turn.user) { turn.user = message; legacy = turn } else if (message.role === 'assistant' && !turn.assistant) turn.assistant = message
  }
  const list = order.map((id) => map.get(id)!)
  for (const turn of list) { let parent = turn.parentTurnId ? map.get(turn.parentTurnId) : undefined; if (parent) parent.children.push(turn); while (parent) { turn.depth++; parent.childrenCount++; parent = parent.parentTurnId ? map.get(parent.parentTurnId) : undefined } }
  for (const turn of list) turn.branches = makeBranches(turn.children)
  return list
})
const flowBlocks = computed<FlowBlock[]>(() => {
  const blocks: FlowBlock[] = []; const seenFolds = new Set<string>(); const foldMap = new Map(folds.value.map((fold) => [fold.id, fold]))
  for (const turn of turns.value.filter((item) => !item.parentTurnId)) { const fold = turn.foldId ? foldMap.get(turn.foldId) : undefined; if (!fold) blocks.push({ kind: 'turn', id: turn.id, turn }); else if (!seenFolds.has(fold.id)) { seenFolds.add(fold.id); blocks.push({ kind: 'fold', id: fold.id, fold, turns: turns.value.filter((item) => !item.parentTurnId && item.foldId === fold.id) }) } }
  return blocks
})
function makeBranches(items: Turn[]) { const result: Turn['branches'] = []; const seen = new Set<string>(); const foldMap = new Map(folds.value.map((fold) => [fold.id, fold])); for (const turn of items) { const fold = turn.foldId ? foldMap.get(turn.foldId) : undefined; if (!fold) result.push({ kind: 'turn', id: turn.id, turn }); else if (!seen.has(fold.id)) { seen.add(fold.id); result.push({ kind: 'chapter', id: fold.id, chapter: { ...fold, turns: items.filter((item) => item.foldId === fold.id) } }) } }; return result }
function scrollToBottom() { nextTick(() => { if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight }) }
function conversationIndex(id: string) { return Math.max(0, chat.convs.findIndex((conv) => conv.id === id)) + 1 }
function conversationTitle(id: string) { return chat.convs.find((conv) => conv.id === id)?.title ?? '已关联对话' }
function foldNumber(id: string) { return Math.max(0, folds.value.findIndex((fold) => fold.id === id)) + 1 }
function foldTags(fold: Fold) { return (fold.tags ?? '').split(/[,，]/).map((tag) => tag.trim()).filter(Boolean) }
function foldSummary(items: Turn[]) { const source = items[0]?.user?.content || items[0]?.assistant?.content || '拖入问答后会在这里形成章节摘要'; return source.replace(/\s+/g, ' ').slice(0, 72) }
function foldLinks(id: string) { return linksByFold.value[id] ?? [] }
async function loadLinks() { const entries = await Promise.all(folds.value.map(async (fold) => [fold.id, (await window.lk.linkList('fold', fold.id)).filter((link: any) => link.target_type === 'conversation') as FoldLink[]] as const)); linksByFold.value = Object.fromEntries(entries) }
watch(() => messages.value.map((m: Msg) => m.id + ':' + m.content.length).join('|'), scrollToBottom)
watch(() => chat.currentConvId, async (id) => { if (id) { folds.value = await window.lk.foldList(id) as Fold[]; await loadLinks() }; scrollToBottom() }, { immediate: true })
async function reload() { const id = chat.currentConvId; if (!id) return; await chat.selectConv(id); folds.value = await window.lk.foldList(id) as Fold[]; await loadLinks() }
async function toggleCollapse(turn: Turn) { const collapsed = !turn.collapsed; await window.lk.turnCollapse(turn.id, collapsed); for (const message of messages.value) if (message.turn_id === turn.id) message.collapsed = collapsed ? 1 : 0 }
async function dropToRoot(targetTurnId: string) { if (!dragTurnId.value || dragTurnId.value === targetTurnId || !chat.currentConvId) return; await window.lk.turnMove({ turnId: dragTurnId.value, targetConversationId: chat.currentConvId, afterTurnId: targetTurnId, targetFoldId: null }); dragTurnId.value = ''; await reload() }
async function dropIntoFold(foldId: string) { dropFoldId.value = ''; if (!dragTurnId.value || !chat.currentConvId) return; await window.lk.turnMove({ turnId: dragTurnId.value, targetConversationId: chat.currentConvId, targetFoldId: foldId }); dragTurnId.value = ''; await reload() }
async function createFold() { if (!chat.currentConvId) return; const result = await ElMessageBox.prompt('为章节命名', '新建对话章节', { inputValue: '待整理追问' }).catch(() => null); if (!result?.value) return; await window.lk.foldCreate({ conversationId: chat.currentConvId, title: result.value }); await reload() }
async function toggleFold(fold: Fold) { await window.lk.foldPatch(fold.id, { collapsed: !fold.collapsed }); fold.collapsed = fold.collapsed ? 0 : 1 }
async function renameFold(fold: Fold) { const result = await ElMessageBox.prompt('章节名称', '重命名章节', { inputValue: fold.title }).catch(() => null); if (!result?.value) return; await window.lk.foldPatch(fold.id, { title: result.value }); fold.title = result.value }
async function editTags(fold: Fold) { const result = await ElMessageBox.prompt('用逗号分隔标签', '章节标签', { inputValue: fold.tags ?? '' }).catch(() => null); if (!result) return; await window.lk.foldPatch(fold.id, { tags: result.value }); fold.tags = result.value }
async function deleteFold(id: string) { await window.lk.foldDelete(id); await reload() }
function openMove(turn: Turn) { moveDialog.value = { open: true, turnId: turn.id, targetConv: '' } }
async function moveToConversation() { if (!moveDialog.value.targetConv) return; await window.lk.turnMove({ turnId: moveDialog.value.turnId, targetConversationId: moveDialog.value.targetConv, targetFoldId: null }); moveDialog.value.open = false; await reload() }
async function restoreTurn(turn: Turn) { await window.lk.turnRestore(turn.id); await reload() }
function openReference(fold: Fold) { referenceDialog.value = { open: true, foldId: fold.id, targetConv: '' } }
async function addReference() { const dialog = referenceDialog.value; if (!dialog.targetConv) return; await window.lk.linkRelate('fold', dialog.foldId, 'conversation', dialog.targetConv, 'references'); dialog.open = false; await loadLinks() }
async function removeLink(id: string) { await window.lk.linkRemove(id); await loadLinks() }
function openFoldMenu(e: MouseEvent, fold: Fold) { menu.open(e, [
  { label: fold.collapsed ? '展开章节' : '折叠章节', icon: 'Fold' as any, action: () => toggleFold(fold) },
  { label: '重命名章节', icon: 'EditPen' as any, action: () => renameFold(fold) },
  { label: '添加标签', icon: 'CollectionTag' as any, action: () => editTags(fold) },
  { label: '搜索关联其他对话', icon: 'Connection' as any, action: () => openReference(fold) },
  { separator: true },
  { label: '解散章节并移出所有轮次', icon: 'FolderDelete' as any, danger: true, action: () => deleteFold(fold.id) }
]) }
function openChapterMenu(data: { event: MouseEvent; chapter: Chapter }) { openFoldMenu(data.event, data.chapter) }
</script>

<style scoped lang="scss">
.chat-scroll { flex: 1; overflow-y: auto; padding: 30px 0 76px; background: radial-gradient(900px 500px at 7% 0%, rgba(216,164,120,.07), transparent 62%), radial-gradient(760px 520px at 100% 100%, rgba(78,201,176,.055), transparent 65%), var(--bg); }
.msg-list { max-width: 824px; margin: 0 auto; padding: 0 24px; }.flow-intro { display: flex; align-items: center; gap: 10px; padding: 0 8px 18px; color: var(--text-dim); font-size: 11px; }.eyebrow { color: var(--accent); font-size: 10px; font-weight: 700; letter-spacing: .1em; }.flow-intro :deep(.el-button) { margin-left: auto; }
.fold-group { margin: 10px 0 16px; border: 1px solid color-mix(in srgb, var(--accent) 27%, var(--border)); border-radius: 14px; overflow: hidden; background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 7%, var(--bg-elev)), var(--bg-elev)); box-shadow: 0 5px 22px rgba(0,0,0,.07); transition: border-color .16s, box-shadow .16s, transform .16s; }.fold-group:hover { border-color: var(--accent); box-shadow: 0 10px 28px rgba(0,0,0,.13); }.fold-group.is-drop-target { border: 2px dashed var(--accent); box-shadow: 0 0 0 5px color-mix(in srgb, var(--accent) 14%, transparent); }
.fold-head { display: grid; grid-template-columns: 16px minmax(190px,1fr) auto auto auto; align-items: center; gap: 10px; padding: 12px 13px; cursor: pointer; color: var(--text-dim); font-size: 12px; }.fold-arrow { color: var(--accent); font-size: 9px; transition: transform .2s; }.fold-copy { min-width: 0; display: grid; gap: 2px; }.fold-kicker { color: var(--accent); font-size: 10px; font-weight: 650; letter-spacing: .03em; }.fold-title { color: var(--text); font-size: 13px; font-weight: 700; }.fold-summary { overflow: hidden; color: var(--text-dim); font-size: 11px; white-space: nowrap; text-overflow: ellipsis; }.fold-meta { display: flex; gap: 4px; max-width: 185px; overflow: hidden; }.tag,.reference,.fold-count { flex: none; border-radius: 10px; padding: 2px 7px; font-size: 10px; }.tag { background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent-text); }.reference { cursor: pointer; background: var(--bg-soft); color: var(--text-dim); }.fold-count { background: var(--accent-dim); color: var(--accent-text); }.fold-hint { font-size: 10px; }.fold-group.closed .fold-arrow { transform: rotate(-90deg); }.root-drop-tip { margin: 0 10px 10px; padding: 10px 12px; border-radius: 8px; background: color-mix(in srgb, var(--accent) 13%, transparent); color: var(--accent-text); font-size: 11px; }.fold-content { padding: 5px 8px 8px; border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent); background: rgba(0,0,0,.055); }.chapter-note { padding: 7px 10px 4px 34px; color: var(--text-dim); font-size: 10px; }.empty { text-align: center; margin-top: 120px; color: var(--text-dim); .hint { font-size: 13px; } }
@media (max-width: 680px) { .msg-list { padding: 0 12px; }.fold-head { grid-template-columns: 16px 1fr auto; }.fold-meta,.fold-hint { display: none; } }
</style>
