<template>
  <div class="rev-root">
    <aside class="side">
      <div class="head">
        <el-button size="small" type="primary" plain @click="newDeck">+ 牌组</el-button>
      </div>
      <div class="decks">
        <div v-for="d in decks" :key="d.id" class="deck" :class="{active: currentDeckId === d.id}" @click="selectDeck(d.id)" @contextmenu="(e: MouseEvent) => onDeckCtx(e, d)">
          <span class="d-title">{{ d.title }}</span>
          <el-button text size="small" @click.stop="addCardPrompt(d.id)">+卡</el-button>
          <el-button text size="small" type="danger" @click.stop="delDeck(d.id)">删</el-button>
        </div>
      </div>
    </aside>

    <main class="main">
      <!-- two views: session review & dashboard -->
      <div class="tabs">
        <button :class="{active: view==='review'}" @click="view='review'">复习</button>
        <button :class="{active: view==='dash'}" @click="view='dash'">统计</button>
        <button :class="{active: view==='cards'}" @click="view='cards'">卡片管理</button>
        <span class="spacer"></span>
        <el-button size="small" @click="askProgress">让 AI 总结学习进度</el-button>
      </div>

      <!-- Review session -->
      <div v-if="view==='review'" class="review">
        <div v-if="!queue.length" class="empty">
          <el-icon style="font-size: 48px; opacity:.5"><Select /></el-icon>
          <p>今日复习完成！</p>
          <p class="muted">没有到期卡片 - 接下来建议学习新内容或预习。</p>
        </div>
        <div v-else class="card-box">
          <div class="counter">待复习 {{ queue.length }} 张 · 牌组：{{ currentDeckTitle }}</div>
          <div class="front">
            <MarkdownView :content="cur.front" />
          </div>
          <div v-if="revealed" class="back">
            <MarkdownView :content="cur.back || '（无答案）'" />
          </div>
          <div class="actions">
            <el-button v-if="!revealed" type="primary" @click="revealed=true">显示答案</el-button>
            <template v-else>
              <el-button @click="rate(1)" type="danger">忘了</el-button>
              <el-button @click="rate(3)">困难</el-button>
              <el-button @click="rate(4)" type="primary">良好</el-button>
              <el-button @click="rate(5)" type="success">简单</el-button>
            </template>
          </div>
        </div>
      </div>

      <!-- Dashboard -->
      <div v-else-if="view==='dash'" class="dash">
        <div class="cards-grid">
          <div class="stat"><div class="v">{{ stats.dueCount ?? 0 }}</div><div class="k">今日待复习</div></div>
          <div class="stat"><div class="v">{{ stats.total ?? 0 }}</div><div class="k">总卡片</div></div>
          <div class="stat"><div class="v">{{ stats.streak ?? 0 }}</div><div class="k">连续学习天数</div></div>
          <div class="stat"><div class="v">{{ stats.overdueReviewed ?? 0 }}</div><div class="k">今日已复习</div></div>
        </div>
        <div class="h2">间隔分布</div>
        <div class="bars">
          <div v-for="b in intervalRows" :key="b.interval" class="bar-row">
            <span class="lbl">{{ b.interval === 0 ? '新' : 'I=' + b.interval }}</span>
            <div class="bar"><div class="fill" :style="{ width: barWidth(b.c) }"></div></div>
            <span class="n">{{ b.c }}</span>
          </div>
        </div>
        <div class="h2">学习打卡 (近期 60 天)</div>
        <div class="heatmap">
          <div
            v-for="d in heatDays"
            :key="d.date"
            class="cell"
            :style="{ background: heatColor(d.count) }"
            :title="d.date + ': ' + d.count + ' 张'"
          ></div>
        </div>
      </div>

      <!-- Cards manager -->
      <div v-else class="cards-mgr">
        <div class="cards-mgr-head">
          <span>当前 牌组：{{ currentDeckTitle || '（未选择）' }}</span>
          <el-button size="small" @click="addCardPrompt(currentDeckId)">+ 新建卡片</el-button>
        </div>
        <el-table :data="cards" stripe @row-contextmenu="onCardCtx">
          <el-table-column prop="front" label="正面" />
          <el-table-column prop="back" label="背面" />
          <el-table-column label="操作" width="180">
            <template #default="{ row }">
              <el-button text size="small" @click="editCard(row)">编辑</el-button>
              <el-button text size="small" type="danger" @click="delCard(row.id)">删</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </main>

    <!-- card edit dialog -->
    <el-dialog v-model="cardDialog.open" :title="(cardDialog.id ? '编辑' : '新建') + '卡片'" width="640px">
      <el-form label-position="top">
        <el-form-item label="牌组">
          <el-select v-model="cardDialog.deckId">
            <el-option v-for="d in decks" :key="d.id" :label="d.title" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="正面 (问题)">
          <el-input v-model="cardDialog.front" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="背面 (答案)">
          <el-input v-model="cardDialog.back" type="textarea" :rows="5" />
        </el-form-item>
        <el-form-item label="类型">
          <el-radio-group v-model="cardDialog.kind">
            <el-radio value="qa">问答</el-radio>
            <el-radio value="cloze">填空</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cardDialog.open = false">取消</el-button>
        <el-button type="primary" @click="saveCard">保存</el-button>
      </template>
    </el-dialog>

    <!-- AI progress -->
    <el-dialog v-model="progress.open" title="学习进度 (AI 总结)" width="700px">
      <div v-if="progress.loading" class="progress-loading"><el-icon class="rot"><Loading /></el-icon> 正在分析本地学习数据…</div>
      <MarkdownView v-else :content="progress.text" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import MarkdownView from '../components/MarkdownView.vue'
import { useChatStore, useSettingsStore } from '../stores/chat'
import { useContextMenu } from '../stores/context-menu'

const chat = useChatStore()
const settings = useSettingsStore()
const menu = useContextMenu()

const decks = ref<any[]>([])
const currentDeckId = ref<string | null>(null)
const view = ref<'review' | 'dash' | 'cards'>('review')

const queue = ref<any[]>([])
const revealed = ref(false)
const cards = ref<any[]>([])
const stats = ref<any>({})
const intervalRows = ref<any[]>([])
const heatDays = ref<{ date: string; count: number }[]>([])

const cur = computed(() => queue.value[0] || {})
const currentDeckTitle = computed(() => decks.value.find((d) => d.id === currentDeckId.value)?.title || '全部')

const cardDialog = ref({ open: false, id: '', deckId: '', front: '', back: '', kind: 'qa' })
const progress = ref({ open: false, loading: false, text: '' })

async function loadDecks() { decks.value = await window.lk.deckList() }

async function selectDeck(id: string) {
  currentDeckId.value = id
  cards.value = await window.lk.cardList(id)
  await refreshQueue()
}

async function newDeck() {
  const v = await ElMessageBox.prompt('牌组名', '新建牌组', { inputValue: '新牌组' })
  if (!v.value) return
  const id = await window.lk.uuid()
  await window.lk.deckUpsert({ id, title: v.value, sort: Date.now() })
  await loadDecks()
  currentDeckId.value = id
  cards.value = []
}

async function delDeck(id: string) {
  await ElMessageBox.confirm('删除这个牌组及其全部卡片？', '删除', { type: 'warning' })
  await window.lk.deckDelete(id)
  if (currentDeckId.value === id) { currentDeckId.value = null; cards.value = [] }
  await loadDecks()
  await refreshQueue()
}

function onDeckCtx(e: MouseEvent, d: any) {
  e.preventDefault()
  menu.open(e, [
    { label: '选择', icon: 'Select' as const, action: () => selectDeck(d.id) },
    { label: '重命名', icon: 'Edit' as const, action: () => renameDeck(d) },
    { label: '新建卡片', icon: 'Plus' as const, action: () => addCardPrompt(d.id) },
    { separator: true },
    { label: '删除', icon: 'Delete' as const, danger: true, action: () => delDeck(d.id) },
  ])
}

function onCardCtx(row: any, _col: any, e: MouseEvent) {
  e.preventDefault()
  menu.open(e, [
    { label: '编辑', icon: 'Edit' as const, action: () => editCard(row) },
    { label: '重置进度', icon: 'Refresh' as const, action: () => resetCard(row.id) },
    { separator: true },
    { label: '删除', icon: 'Delete' as const, danger: true, action: () => delCard(row.id) },
  ])
}

async function renameDeck(d: any) {
  const v = await ElMessageBox.prompt('新牌组名', '重命名', { inputValue: d.title })
  if (!v.value) return
  await window.lk.deckRename(d.id, v.value)
  loadDecks()
}

async function resetCard(id: string) {
  await window.lk.cardReset(id)
  if (currentDeckId.value) cards.value = await window.lk.cardList(currentDeckId.value)
  ElMessage.success('卡片进度已重置')
}

async function refreshQueue() {
  let all = await window.lk.srsDue()
  if (currentDeckId.value) all = all.filter((c) => c.deck_id === currentDeckId.value)
  queue.value = all
  revealed.value = false
}

async function rate(rating: 1 | 3 | 4 | 5) {
  if (!queue.value.length) return
  const card = queue.value.shift()!
  await window.lk.srsReview(card.id, rating)
  revealed.value = false
  if (!queue.value.length) {
    ElMessage.success('今日复习全部完成！')
    await loadStats()
  }
}

async function addCardPrompt(deckId: string | null) {
  if (!deckId) {
    if (!decks.value.length) { await newDeck() }
    deckId = decks.value[0]?.id || ''
  }
  cardDialog.value = { open: true, id: '', deckId: deckId as string, front: '', back: '', kind: 'qa' }
}

function editCard(row: any) {
  cardDialog.value = { open: true, id: row.id, deckId: row.deck_id, front: row.front, back: row.back, kind: row.kind || 'qa' }
}

async function saveCard() {
  const { id, deckId, front, back, kind } = cardDialog.value
  if (!deckId || !front.trim()) { ElMessage.warning('牌组/正面不能为空'); return }
  await window.lk.cardSave({ id: id || undefined, deckId, front, back, kind })
  cardDialog.value.open = false
  ElMessage.success('已保存')
  if (currentDeckId.value === deckId) cards.value = await window.lk.cardList(deckId)
}

async function delCard(id: string) {
  await window.lk.cardDelete(id)
  if (currentDeckId.value) cards.value = await window.lk.cardList(currentDeckId.value)
}

async function loadStats() {
  const s = await window.lk.srsStats()
  stats.value = s
  intervalRows.value = s.masteryByInterval || []
  // build 60-day heat map from streak dates
  const set = new Map((s.streakDays || []).map((d: any) => [d.date, d.count]))
  const days: any[] = []
  const today = new Date()
  for (let i = 59; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 3600 * 1000)
    const ds = d.toISOString().slice(0, 10)
    days.push({ date: ds, count: set.get(ds) || 0 })
  }
  heatDays.value = days
}

function barWidth(c: number) {
  const max = Math.max(1, ...intervalRows.value.map((b: any) => b.c))
  return Math.max(2, Math.round((c / max) * 100)) + '%'
}

function heatColor(c: number) {
  if (c === 0) return '#2a2a2a'
  if (c < 5) return '#3b6e8a'
  if (c < 15) return '#4ea1ff'
  return '#7fc7ff'
}

async function askProgress() {
  progress.value = { open: true, loading: true, text: '' }
  const _due = await window.lk.srsDue()
  void _due
  const s = await window.lk.srsStats()
  const bookStat = await window.lk.bookStat()
  const notesList = await window.lk.notesList()
  const mindmap = await window.lk.mindmapList()
  const summary = [
    `以下是该用户当前的本地学习数据快照（请基于此数据 + AI 判断给出复习建议，注意避免幻觉）。`,
    ``,
    `## SRS 复习`,
    `- 总卡片数: ${s.total}`,
    `- 今日待复习: ${s.dueCount}`,
    `- 今日已复习: ${s.overdueReviewed}`,
    `- 最近连续学习天数: ${s.streak}`,
    `- 间隔分布 (interval, count): ${intervalRows.value.map((b: any) => b.interval + ':' + b.c).join(', ') || '无数据'}`,
    ``,
    `## 图书馆`,
    `- 已导入电子书: ${bookStat.books}`,
    `- 划线条目: ${bookStat.highlights}`,
    ``,
    `## 笔记`,
    `- 笔记/目录条目: ${notesList.length}`,
    `- 思维导图: ${mindmap.length}`,
    ``,
    `请用中文给出：1) 哪些词/概念复习压力大需要优先处理；2) 下一步学习该做什么；3) 一句话鼓励。`
  ].join('\n')
  // send like a normal chat – but to keep independent store, send via stores
  // We piggyback on chat store: pick current conv or create a fresh one
  if (!chat.currentConvId) {
    const c = await chat.newConv(null, 'AI 进度总结')
    await chat.selectConv(c.id)
  }
  // Build and send
  const convId = chat.currentConvId!
  const userMsg: any = {
    id: await window.lk.uuid(), conversation_id: convId, role: 'user', content: summary, note: null, sort: Date.now() / 1000 | 0
  }
  await window.lk.msgSave(userMsg)
  chat.activeMessages.push(userMsg)
  const assistantMsg: any = {
    id: await window.lk.uuid(), conversation_id: convId, role: 'assistant', content: '', model: settings.model, sort: (Date.now() / 1000 | 0) + 1
  }
  assistantMsg.id = await chat.saveNewMessage(assistantMsg)
  chat.activeMessages.push(assistantMsg)

  const reqId = await window.lk.uuid()
  const off = window.lk.onAiChunk(reqId, (p: any) => {
    if (p.delta) assistantMsg.content += p.delta
    progress.value.text = assistantMsg.content
    if (p.error) progress.value.text += `\n\n> ⚠️ ${p.error}`
    if (p.done) {
      progress.value.loading = false
      window.lk.msgPatch(assistantMsg.id, { content: assistantMsg.content })
      off()
    }
  })
  await window.lk.aiChatStart({
    requestId: reqId,
    provider: settings.provider, model: settings.model,
    messages: [{ role: 'user', content: summary }],
    temperature: settings.temperature,
    apiKey: settings.currentApiKey(),
    baseUrl: settings.provider === 'custom' ? settings.customBaseUrl : undefined
  })
}

onMounted(async () => {
  await loadDecks()
  await loadStats()
  await refreshQueue()
})
</script>

<style scoped lang="scss">
.rev-root { flex: 1; display: flex; min-width: 0; min-height: 0; overflow: hidden; }
.side {
  width: 240px; background: var(--bg-soft); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; flex-shrink: 0;
}
.head { padding: 10px; border-bottom: 1px solid var(--border); }
.decks { overflow: auto; }
.deck {
  display: flex; align-items: center; padding: 8px 10px; cursor: pointer;
  border-bottom: 1px dashed var(--border);
  &:hover { background: rgba(255,255,255,0.04); }
  &.active { background: rgba(78,161,255,0.16); }
  .d-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.tabs { display: flex; align-items: center; gap: 4px; padding: 8px 12px; background: var(--bg-soft); border-bottom: 1px solid var(--border); }
.tabs button {
  background: transparent; border: none; color: var(--text-dim);
  padding: 6px 12px; cursor: pointer; border-radius: 4px;
  &:hover { background: rgba(255,255,255,0.05); color: var(--text); }
  &.active { color: var(--accent); border-bottom: 2px solid var(--accent); }
}
.spacer { flex: 1; }

.review { flex: 1; padding: 32px; overflow: auto; }
.empty { text-align: center; margin-top: 80px; color: var(--text-dim); }
.card-box {
  max-width: 720px; margin: 0 auto;
  border: 1px solid var(--border); border-radius: 10px;
  background: var(--bg-soft); padding: 24px;
}
.counter { color: var(--text-dim); margin-bottom: 12px; }
.front { font-size: 16px; line-height: 1.6; }
.back { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); }
.actions { margin-top: 24px; display: flex; gap: 8px; }

.dash .cards-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; padding: 16px 24px; }
.stat { background: var(--bg-soft); border: 1px solid var(--border); border-radius: 8px; padding: 16px; text-align: center; }
.stat .v { font-size: 28px; font-weight: 700; color: var(--accent); }
.stat .k { color: var(--text-dim); font-size: 13px; margin-top: 4px; }
.h2 { padding: 14px 24px 8px; font-weight: 600; }
.bars { padding: 0 24px 16px; display: flex; flex-direction: column; gap: 4px; max-width: 720px; }
.bar-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.bar-row .lbl { width: 60px; color: var(--text-dim); }
.bar-row .bar { flex: 1; background: #2a2a2a; height: 12px; border-radius: 6px; overflow: hidden; }
.bar-row .fill { background: var(--accent); height: 100%; }
.bar-row .n { width: 30px; text-align: right; }
.heatmap { padding: 0 24px 24px; display: grid; grid-template-columns: repeat(15, 1fr); gap: 4px; }
.cell { width: 100%; aspect-ratio: 1; border-radius: 3px; }

.cards-mgr { padding: 16px 24px; overflow: auto; }
.cards-mgr-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }

.progress-loading { display: flex; align-items: center; gap: 6px; color: var(--text-dim); }
.rot { animation: rot 1s linear infinite; }
@keyframes rot { to { transform: rotate(360deg); } }
.muted { color: var(--text-dim); font-size: 13px; }
</style>