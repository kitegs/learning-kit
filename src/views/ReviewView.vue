<template>
  <div class="rev-root" @keydown="onRevKey" tabindex="0" ref="revRoot">
    <aside class="side">
      <div class="head">
        <el-button size="small" type="primary" plain @click="newDeck">+ 新建牌组</el-button>
      </div>
      <div class="decks">
        <div v-for="d in decks" :key="d.id" class="deck" :class="{active: currentDeckId === d.id}" @click="selectDeck(d.id)" @contextmenu="(e: MouseEvent) => onDeckCtx(e, d)">
          <span class="d-title">{{ d.title }}</span>
          <span class="d-count" v-if="d._due">{{ d._due }}</span>
          <el-button text size="small" @click.stop="addCardPrompt(d.id)">+</el-button>
          <el-button text size="small" type="danger" @click.stop="delDeck(d.id)">x</el-button>
        </div>
      </div>
    </aside>

    <main class="main">
      <div class="tabs">
        <button :class="{active: view==='review'}" @click="view='review'">开始复习</button>
        <button :class="{active: view==='dash'}" @click="view='dash'">学习统计</button>
        <button :class="{active: view==='cards'}" @click="view='cards'">卡片管理</button>
        <span class="spacer"></span>
        <el-button size="small" @click="askProgress">AI 学习建议</el-button>
      </div>

      <!-- Review session -->
      <div v-if="view==='review'" class="review">
        <div v-if="!queue.length" class="empty">
          <div class="empty-icon">{{ decks.length ? '✓' : '📚' }}</div>
          <p class="empty-title">{{ decks.length ? '当前没有待复习卡片' : '从一组闪卡开始复习' }}</p>
          <p class="muted">{{ decks.length ? '可以新建卡片，或在笔记、AI 回复和电子书划线中一键生成闪卡。' : '先创建牌组和卡片；新卡会立刻进入本次复习。' }}</p>
          <div class="empty-actions"><el-button type="primary" @click="decks.length ? addCardPrompt(currentDeckId) : newDeck()">{{ decks.length ? '新建卡片' : '新建牌组' }}</el-button><el-button plain @click="createSampleCard">创建一张示例卡片</el-button></div>
          <p class="review-guide">使用方式：先点“显示答案”，再按掌握程度选择“重来 / 困难 / 良好 / 简单”。也可用空格、1、2、3、4 键操作。</p>
          <div class="empty-stats">
            <div class="es"><span class="es-v">{{ stats.total ?? 0 }}</span><span class="es-k">Total</span></div>
            <div class="es"><span class="es-v">{{ stats.streak ?? 0 }}</span><span class="es-k">Streak</span></div>
            <div class="es"><span class="es-v">{{ todayReviewed }}</span><span class="es-k">Today</span></div>
          </div>
        </div>
        <div v-else class="card-box" :class="{ revealed }">
          <div class="card-header">
            <span class="counter">
              <span class="c-new">{{ newReviewed }}/{{ totalNew }}</span>
              <span class="c-sep">+</span>
              <span class="c-old">{{ oldReviewed }}/{{ totalOld }}</span>
              <span class="c-sep">剩余</span>
              <span class="c-remain">{{ queue.length }}</span>
            </span>
            <span class="deck-label">{{ currentDeckTitle }}</span>
          </div>

          <div class="card-body">
            <div class="front" v-html="renderFront"></div>
            <transition name="flip">
              <div v-if="revealed" class="back" v-html="renderBack"></div>
            </transition>
          </div>

          <div class="card-actions">
            <template v-if="!revealed">
              <button class="btn-show" @click="reveal">
                <span class="btn-show-label">显示答案</span>
                <span class="btn-show-key">空格</span>
              </button>
            </template>
            <template v-else>
              <button class="rate-btn rate-again" @click="rate(1)" title="重来（1）">
                <span class="rate-emoji">&#x1F648;</span>
                <span class="rate-label">重来</span>
                <span class="rate-key">1</span>
              </button>
              <button class="rate-btn rate-hard" @click="rate(3)" title="困难（2）">
                <span class="rate-emoji">&#x1F62C;</span>
                <span class="rate-label">困难</span>
                <span class="rate-key">2</span>
              </button>
              <button class="rate-btn rate-good" @click="rate(4)" title="良好（3）">
                <span class="rate-emoji">&#x1F60A;</span>
                <span class="rate-label">良好</span>
                <span class="rate-key">3</span>
              </button>
              <button class="rate-btn rate-easy" @click="rate(5)" title="简单（4）">
                <span class="rate-emoji">&#x1F308;</span>
                <span class="rate-label">简单</span>
                <span class="rate-key">4</span>
              </button>
            </template>
          </div>
          <div class="card-hint" v-if="revealed">
            <span>下次复习：<strong>{{ previewInterval }}</strong></span>
          </div>
        </div>
      </div>

      <!-- Dashboard -->
      <div v-else-if="view==='dash'" class="dash">
        <div class="cards-grid">
          <div class="stat"><div class="v">{{ stats.dueCount ?? 0 }}</div><div class="k">今日待复习</div></div>
          <div class="stat"><div class="v">{{ stats.total ?? 0 }}</div><div class="k">全部卡片</div></div>
          <div class="stat"><div class="v">{{ stats.streak ?? 0 }}</div><div class="k">连续学习天数</div></div>
          <div class="stat"><div class="v">{{ todayReviewed }}</div><div class="k">今日已复习</div></div>
        </div>
        <div class="h2">复习间隔分布</div>
        <div class="bars">
          <div v-for="b in intervalRows" :key="b.interval" class="bar-row">
            <span class="lbl">{{ b.interval === 0 ? '新卡' : b.interval + ' 天' }}</span>
            <div class="bar"><div class="fill" :style="{ width: barWidth(b.c) }"></div></div>
            <span class="n">{{ b.c }}</span>
          </div>
        </div>
        <div class="h2">学习活跃度（60 天）</div>
        <div class="heatmap">
          <div v-for="d in heatDays" :key="d.date" class="cell" :style="{ background: heatColor(d.count) }" :title="d.date + ': ' + d.count"></div>
        </div>
      </div>

      <!-- Cards manager -->
      <div v-else class="cards-mgr">
        <div class="cards-mgr-head">
          <span>当前牌组：{{ currentDeckTitle || '未选择' }}</span>
          <el-button size="small" @click="addCardPrompt(currentDeckId)">+ 新建卡片</el-button>
        </div>
        <el-table :data="cards" stripe @row-contextmenu="onCardCtx">
          <el-table-column prop="front" label="问题" />
          <el-table-column prop="back" label="答案" />
          <el-table-column label="操作" width="180">
            <template #default="{ row }">
              <el-button text size="small" @click="editCard(row)">编辑</el-button>
              <el-button text size="small" type="danger" @click="delCard(row.id)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </main>

    <!-- card edit dialog -->
    <el-dialog v-model="cardDialog.open" :title="cardDialog.id ? '编辑卡片' : '新建卡片'" width="640px">
      <el-form label-position="top">
        <el-form-item label="牌组">
          <el-select v-model="cardDialog.deckId">
            <el-option v-for="d in decks" :key="d.id" :label="d.title" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="问题">
          <el-input v-model="cardDialog.front" type="textarea" :rows="3" placeholder="可用 --- 分隔题干与额外提示" />
        </el-form-item>
        <el-form-item label="答案">
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
    <el-dialog v-model="progress.open" title="AI 学习建议" width="700px">
      <div v-if="progress.loading" class="progress-loading"><el-icon class="rot"><Loading /></el-icon> 正在分析学习数据…</div>
      <MarkdownView v-else :content="progress.text" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import MarkdownView from '../components/MarkdownView.vue'
import { renderMarkdown } from '../helpers/markdown'
import { useChatStore, useSettingsStore } from '../stores/chat'
import { useContextMenu } from '../stores/context-menu'

const chat = useChatStore()
const settings = useSettingsStore()
const menu = useContextMenu()
const revRoot = ref<HTMLElement|null>(null)

const decks = ref<any[]>([])
const currentDeckId = ref<string|null>(null)
const view = ref<'review'|'dash'|'cards'>('review')
const queue = ref<any[]>([])
const revealed = ref(false)
const cards = ref<any[]>([])
const stats = ref<any>({})
const intervalRows = ref<any[]>([])
const heatDays = ref<{date:string;count:number}[]>([])
const todayReviewed = ref(0)
const newReviewed = ref(0)
const oldReviewed = ref(0)
const totalNew = ref(0)
const totalOld = ref(0)

const cur = computed(() => queue.value[0] || {})
const currentDeckTitle = computed(() => decks.value.find((d) => d.id === currentDeckId.value)?.title || 'All')

// Content-aware front/back: if front contains '---', show only above the line as question
const renderFront = computed(() => {
  const f = cur.value.front || ''
  const parts = f.split(/\n---\n|\n\|\|\|/)
  return renderMarkdown(parts[0])
})
const renderBack = computed(() => {
  const f = cur.value.front || ''
  const parts = f.split(/\n---\n|\n\|\|\|/)
  const hidden = parts.length > 1 ? parts.slice(1).join('\n') : ''
  return renderMarkdown((hidden ? hidden + '\n\n' : '') + (cur.value.back || ''))
})

// Preview next interval
const previewInterval = computed(() => {
  const c = cur.value
  if (!c.ease) return '1d'
  const e = c.ease || 2.5, i = c.interval || 0, r = c.reps || 0
  if (r === 0) return '1d'
  if (r === 1) return '6d'
  return Math.round(i * e) + 'd'
})

const cardDialog = ref({ open: false, id: '', deckId: '', front: '', back: '', kind: 'qa' })
const progress = ref({ open: false, loading: false, text: '' })

async function loadDecks() {
  decks.value = await window.lk.deckList()
  // load due counts per deck
  const allDue = await window.lk.srsDue()
  for (const d of decks.value) {
    d._due = allDue.filter((c: any) => c.deck_id === d.id).length || 0
  }
}

async function selectDeck(id: string) {
  currentDeckId.value = id
  cards.value = await window.lk.cardList(id)
  await refreshQueue()
  revRoot.value?.focus()
}

async function newDeck() {
  const v = await ElMessageBox.prompt('牌组名称', '新建牌组', { inputValue: '默认牌组' })
  if (!v.value) return
  const id = await window.lk.uuid()
  await window.lk.deckUpsert({ id, title: v.value, sort: Date.now() })
  await loadDecks(); await selectDeck(id)
}

async function delDeck(id: string) {
  await ElMessageBox.confirm('Delete deck and all cards?', 'Delete', { type: 'warning' })
  await window.lk.deckDelete(id)
  if (currentDeckId.value === id) { currentDeckId.value = null; cards.value = [] }
  await loadDecks(); await refreshQueue()
}

function onDeckCtx(e: MouseEvent, d: any) {
  e.preventDefault()
  menu.open(e, [
    { label: '选择牌组', icon: 'Select' as any, action: () => selectDeck(d.id) },
    { label: '重命名', icon: 'Edit' as any, action: () => renameDeck(d) },
    { label: '新建卡片', icon: 'Plus' as any, action: () => addCardPrompt(d.id) },
    { separator: true },
    { label: '删除', icon: 'Delete' as any, danger: true, action: () => delDeck(d.id) },
  ])
}

function onCardCtx(row: any, _col: any, e: MouseEvent) {
  e.preventDefault()
  menu.open(e, [
    { label: '编辑', icon: 'Edit' as any, action: () => editCard(row) },
    { label: '重置复习进度', icon: 'Refresh' as any, action: () => resetCard(row.id) },
    { separator: true },
    { label: '删除', icon: 'Delete' as any, danger: true, action: () => delCard(row.id) },
  ])
}

async function renameDeck(d: any) {
  const v = await ElMessageBox.prompt('New name', 'Rename', { inputValue: d.title })
  if (!v.value) return; await window.lk.deckRename(d.id, v.value); loadDecks()
}
async function resetCard(id: string) {
  await window.lk.cardReset(id)
  if (currentDeckId.value) cards.value = await window.lk.cardList(currentDeckId.value)
  ElMessage.success('已重置复习进度')
}

async function refreshQueue() {
  let all = await window.lk.srsDue()
  if (currentDeckId.value) all = all.filter((c: any) => c.deck_id === currentDeckId.value)
  queue.value = all
  revealed.value = false
  // count new vs old
  totalNew.value = all.filter((c: any) => (c.reps || 0) === 0).length
  totalOld.value = all.length - totalNew.value
  newReviewed.value = 0; oldReviewed.value = 0
  revRoot.value?.focus()
}

function reveal() { revealed.value = true }

async function rate(rating: 1|3|4|5) {
  if (!queue.value.length) return
  const card = queue.value.shift()!
  const isNew = (card.reps || 0) === 0
  if (isNew) newReviewed.value++; else oldReviewed.value++
  todayReviewed.value++
  await window.lk.srsReview(card.id, rating)
  revealed.value = false
  if (!queue.value.length) {
    ElMessage.success('本轮复习完成！')
    await loadStats()
  }
  revRoot.value?.focus()
}

// Keyboard handler for review
function onRevKey(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
  if (view.value !== 'review' || !queue.value.length) return
  if (!revealed.value) {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); reveal() }
  } else {
    if (e.key === '1' || e.key === 'j' || e.key === 'a') { e.preventDefault(); rate(1) }
    else if (e.key === '2' || e.key === 'k' || e.key === 's') { e.preventDefault(); rate(3) }
    else if (e.key === '3' || e.key === 'l' || e.key === 'd' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); rate(4) }
    else if (e.key === '4' || e.key === ';' || e.key === 'f') { e.preventDefault(); rate(5) }
  }
}

async function addCardPrompt(deckId: string|null) {
  if (!deckId) { if (!decks.value.length) await newDeck(); deckId = decks.value[0]?.id || '' }
  cardDialog.value = { open: true, id: '', deckId: deckId as string, front: '', back: '', kind: 'qa' }
}
function editCard(row: any) {
  cardDialog.value = { open: true, id: row.id, deckId: row.deck_id, front: row.front, back: row.back, kind: row.kind || 'qa' }
}
async function saveCard() {
  const { id, deckId, front, back, kind } = cardDialog.value
  if (!deckId || !front.trim()) { ElMessage.warning('请选择牌组并填写问题'); return }
  await window.lk.cardSave({ id: id || undefined, deckId, front, back, kind })
  cardDialog.value.open = false; ElMessage.success('已保存，新卡已加入待复习队列')
  if (currentDeckId.value === deckId) cards.value = await window.lk.cardList(deckId)
  await loadDecks(); await refreshQueue()
}
async function createSampleCard() {
  let deckId = currentDeckId.value || decks.value[0]?.id
  if (!deckId) {
    deckId = await window.lk.uuid()
    await window.lk.deckUpsert({ id: deckId, title: '默认牌组', sort: Date.now() })
  }
  await window.lk.cardSave({ deckId, front: '什么是间隔重复？', back: '一种根据掌握程度安排下次复习时间的方法。', kind: 'qa' })
  await loadDecks(); await selectDeck(deckId)
  ElMessage.success('已创建示例卡片，现在可开始复习')
}
async function delCard(id: string) {
  await window.lk.cardDelete(id)
  if (currentDeckId.value) cards.value = await window.lk.cardList(currentDeckId.value)
}

async function loadStats() {
  const s = await window.lk.srsStats()
  stats.value = s; intervalRows.value = s.masteryByInterval || []
  todayReviewed.value = s.overdueReviewed || 0
  const set = new Map((s.streakDays || []).map((d: any) => [d.date, d.count]))
  const days: any[] = []; const today = new Date()
  for (let i = 59; i >= 0; i--) { const d = new Date(today.getTime() - i * 86400000); const ds = d.toISOString().slice(0, 10); days.push({ date: ds, count: set.get(ds) || 0 }) }
  heatDays.value = days
}
function barWidth(c: number) { const max = Math.max(1, ...intervalRows.value.map((b: any) => b.c)); return Math.max(2, Math.round((c / max) * 100)) + '%' }
function heatColor(c: number) { if (c === 0) return '#2a2a2a'; if (c < 5) return '#3b6e8a'; if (c < 15) return '#4ea1ff'; return '#7fc7ff' }

async function askProgress() {
  progress.value = { open: true, loading: true, text: '' }
  const s = await window.lk.srsStats()
  const bookStat = await window.lk.bookStat()
  const notesList = await window.lk.notesList()
  const mindmap = await window.lk.mindmapList()
  const summary = `Local learning data snapshot:\n\n## SRS\n- Total cards: ${s.total}\n- Due today: ${s.dueCount}\n- Reviewed today: ${s.overdueReviewed}\n- Streak: ${s.streak} days\n- Intervals: ${intervalRows.value.map((b: any) => b.interval + ':' + b.c).join(', ') || 'none'}\n\n## Library\n- Books: ${bookStat.books}\n- Highlights: ${bookStat.highlights}\n\n## Notes\n- Notes: ${notesList.length}\n- Mindmaps: ${mindmap.length}\n\nPlease give: 1) priority review items 2) next study step 3) one encouraging sentence.`
  if (!chat.currentConvId) { const c = await chat.newConv(null, 'AI Progress'); await chat.selectConv(c.id) }
  const convId = chat.currentConvId!
  const userMsg: any = { id: await window.lk.uuid(), conversation_id: convId, role: 'user', content: summary, note: null, sort: Date.now() / 1000 | 0 }
  await window.lk.msgSave(userMsg); chat.activeMessages.push(userMsg)
  const assistantMsg: any = { id: await window.lk.uuid(), conversation_id: convId, role: 'assistant', content: '', model: settings.model, sort: (Date.now() / 1000 | 0) + 1 }
  assistantMsg.id = await chat.saveNewMessage(assistantMsg); chat.activeMessages.push(assistantMsg)
  const reqId = await window.lk.uuid()
  const off = window.lk.onAiChunk(reqId, (p: any) => {
    if (p.delta) assistantMsg.content += p.delta; progress.value.text = assistantMsg.content
    if (p.error) progress.value.text += '\n\n> ' + p.error
    if (p.done) { progress.value.loading = false; window.lk.msgPatch(assistantMsg.id, { content: assistantMsg.content }); off() }
  })
  await window.lk.aiChatStart({ requestId: reqId, provider: settings.provider, model: settings.model, messages: [{ role: 'user', content: summary }], temperature: settings.temperature, apiKey: settings.currentApiKey(), baseUrl: settings.provider === 'custom' ? settings.customBaseUrl : undefined })
}

onMounted(async () => { await loadDecks(); await loadStats(); await refreshQueue() })
onUnmounted(() => {})
</script>

<style scoped lang="scss">
.rev-root { flex:1; display:flex; min-width:0; min-height:0; overflow:hidden; outline:none; }
.side { width:220px; background:var(--bg-soft); border-right:1px solid var(--border); display:flex; flex-direction:column; flex-shrink:0; }
.head { padding:8px 10px; border-bottom:1px solid var(--border); }
.decks { overflow:auto; flex:1; }
.deck { display:flex; align-items:center; padding:7px 10px; cursor:pointer; border-bottom:1px dashed var(--border); transition:background .12s; &:hover { background:rgba(127,127,127,.06); } &.active { background:rgba(78,161,255,.14); } .d-title { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; } .d-count { font-size:11px; color:var(--accent); margin-right:4px; min-width:18px; text-align:center; } }
.main { flex:1; display:flex; flex-direction:column; min-width:0; }
.tabs { display:flex; align-items:center; gap:4px; padding:6px 12px; background:var(--bg-soft); border-bottom:1px solid var(--border); }
.tabs button { background:transparent; border:none; color:var(--text-dim); padding:5px 12px; cursor:pointer; border-radius:4px; font-size:13px; transition:all .12s; &:hover { background:rgba(127,127,127,.08); color:var(--text); } &.active { color:var(--accent); border-bottom:2px solid var(--accent); font-weight:600; } }
.spacer { flex:1; }

.review { flex:1; padding:24px; overflow:auto; display:flex; align-items:flex-start; justify-content:center; }
.empty { text-align:center; margin-top:60px; }
.empty-icon { font-size:56px; color:var(--accent); opacity:.6; margin-bottom:12px; }
.empty-title { font-size:20px; font-weight:700; color:var(--text); margin-bottom:4px; }
.empty-actions { display:flex; justify-content:center; gap:8px; margin-top:18px; }.review-guide { max-width:460px; margin:16px auto 0; color:var(--text-dim); font-size:12px; line-height:1.7; }.empty-stats { display:flex; gap:24px; justify-content:center; margin-top:24px; }
.es { text-align:center; } .es-v { display:block; font-size:24px; font-weight:700; color:var(--accent); } .es-k { font-size:11px; color:var(--text-dim); text-transform:uppercase; letter-spacing:.5px; }

.card-box { width:100%; max-width:680px; border:1px solid var(--border); border-radius:12px; background:var(--bg-soft); overflow:hidden; transition:box-shadow .2s; &.revealed { box-shadow:0 4px 24px rgba(78,161,255,.08); } }
.card-header { display:flex; justify-content:space-between; align-items:center; padding:10px 20px; border-bottom:1px solid var(--border); font-size:12px; }
.counter { display:flex; gap:4px; align-items:center; }
.c-new { color:#ff6b6b; font-weight:600; } .c-old { color:#51cf66; font-weight:600; } .c-sep { color:var(--text-dim); } .c-remain { color:var(--accent); font-weight:700; font-size:14px; }
.deck-label { color:var(--text-dim); }
.card-body { padding:28px 24px; min-height:180px; }
.front { font-size:17px; line-height:1.7; }
.back { margin-top:20px; padding-top:20px; border-top:1px dashed var(--border); font-size:15px; line-height:1.7; animation:fadeSlide .25s ease; }
@keyframes fadeSlide { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
.flip-enter-active { animation:fadeSlide .25s ease; }

.card-actions { padding:12px 20px 16px; display:flex; gap:8px; justify-content:center; }
.btn-show { display:flex; align-items:center; gap:8px; padding:10px 32px; border:1px solid var(--accent); border-radius:8px; background:transparent; color:var(--accent); font-size:15px; font-weight:600; cursor:pointer; transition:all .15s; &:hover { background:var(--accent); color:#fff; } }
.btn-show-key { font-size:11px; opacity:.6; border:1px solid currentColor; border-radius:3px; padding:1px 5px; }

.rate-btn { display:flex; flex-direction:column; align-items:center; gap:2px; padding:10px 16px; border:1px solid var(--border); border-radius:8px; background:transparent; cursor:pointer; transition:all .15s; min-width:72px; &:hover { transform:translateY(-2px); box-shadow:0 4px 12px rgba(0,0,0,.15); } }
.rate-emoji { font-size:22px; }
.rate-label { font-size:12px; font-weight:600; }
.rate-key { font-size:10px; opacity:.5; border:1px solid currentColor; border-radius:3px; padding:0 4px; margin-top:2px; }
.rate-again { color:#ff6b6b; border-color:#ff6b6b40; &:hover { background:#ff6b6b18; } }
.rate-hard { color:#ffa94d; border-color:#ffa94d40; &:hover { background:#ffa94d18; } }
.rate-good { color:#4ea1ff; border-color:#4ea1ff40; &:hover { background:#4ea1ff18; } }
.rate-easy { color:#51cf66; border-color:#51cf6640; &:hover { background:#51cf6618; } }

.card-hint { text-align:center; padding:0 20px 12px; font-size:12px; color:var(--text-dim); }

.dash .cards-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; padding:16px 20px; }
.stat { background:var(--bg-soft); border:1px solid var(--border); border-radius:10px; padding:16px; text-align:center; transition:transform .15s; &:hover { transform:translateY(-2px); } }
.stat .v { font-size:28px; font-weight:700; color:var(--accent); } .stat .k { color:var(--text-dim); font-size:12px; margin-top:4px; text-transform:uppercase; letter-spacing:.5px; }
.h2 { padding:14px 20px 8px; font-weight:600; font-size:14px; }
.bars { padding:0 20px 16px; display:flex; flex-direction:column; gap:4px; max-width:680px; }
.bar-row { display:flex; align-items:center; gap:8px; font-size:12px; } .bar-row .lbl { width:50px; color:var(--text-dim); } .bar-row .bar { flex:1; background:rgba(127,127,127,.12); height:10px; border-radius:5px; overflow:hidden; } .bar-row .fill { background:var(--accent); height:100%; border-radius:5px; transition:width .3s; } .bar-row .n { width:30px; text-align:right; }
.heatmap { padding:0 20px 20px; display:grid; grid-template-columns:repeat(15,1fr); gap:3px; } .cell { width:100%; aspect-ratio:1; border-radius:3px; transition:transform .1s; &:hover { transform:scale(1.3); } }

.cards-mgr { padding:16px 20px; overflow:auto; } .cards-mgr-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
.progress-loading { display:flex; align-items:center; gap:6px; color:var(--text-dim); }
.rot { animation:rot 1s linear infinite; } @keyframes rot { to { transform:rotate(360deg); } }
.muted { color:var(--text-dim); font-size:13px; }
</style>
