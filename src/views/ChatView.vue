<template>
  <div class="cluster-root">
    <!-- search bar -->
    <div class="search-bar" v-if="clusters.length">
      <input v-model="sq" placeholder="搜索本流…" @input="onSearch" @keydown.esc="sq='';onSearch()" />
      <span class="scnt" v-if="sq && totalHits">{{ hitIdx + 1 }}/{{ totalHits }}</span>
      <span class="scnt dim" v-else-if="sq">0/0</span>
      <button class="snb" :disabled="!totalHits" @click="jumpHit(-1)">▲</button>
      <button class="snb" :disabled="!totalHits" @click="jumpHit(1)">▼</button>
      <button class="snb" v-if="sq" @click="sq='';onSearch()">✕</button>
    </div>

    <div class="flow-wrap" ref="flowRef">
      <div class="flow" v-if="clusters.length">
        <template v-for="cl in clusters" :key="cl.id">
          <!-- cluster -->
          <div class="cluster" :data-cid="cl.id" :class="{ 'hit-cluster': cl.hit }">
            <!-- title anchor -->
            <div v-if="cl.kind === 'title'" class="anchor-title" :data-hit="cl.titleHit">
              <div class="eyebrow">主题</div>
              <h2 contenteditable="true" spellcheck="false" @blur="setTitle(cl, $event)" @click.stop>{{ cl.title }}</h2>
            </div>

            <!-- dialog anchor (first msg pair) -->
            <div v-if="cl.anchor" class="anchor" :data-hit="cl.anchorHit">
              <div class="bubble u"><div class="who"><span class="av">👤</span>你</div><div v-html="hl(cl.anchor.u)"></div></div>
              <div class="bubble a"><div class="who"><span class="av">🤖</span>AI</div><div v-html="hl(cl.anchor.a)"></div></div>
            </div>

            <!-- fold bar -->
            <div v-if="cl.items.length" class="foldbar" :class="{ open: stateOpen(cl.id) }"
              @click="toggleCluster(cl.id)"
              @dragover.prevent="dOver" @dragleave="dLeave" @drop="dropInto(cl, $event)">
              <span class="arr">▶</span>
              <span class="ft">展开关联对话 · {{ cl.items.length }} 条</span>
              <span class="fc" v-if="cl.items.length > 2 && !stateOpen(cl.id)">{{ cl.items.length }} 条</span>
            </div>

            <!-- collapsible panel -->
            <div class="collapsible" :class="{ open: stateOpen(cl.id) }">
              <div class="inner" @dragover.prevent="dOver" @dragleave="dLeave" @drop="dropInto(cl, $event)">
                <div class="panel">
                  <div v-for="(item) in visibleItems(cl)" :key="item.id" class="frow" :class="{ open: stateItemOpen(cl.id, item.id), 'hit-frow': item.hit }" :data-hit="item.hit ? '' : undefined">
                    <div class="frow-head" @click="toggleItem(cl.id, item.id)">
                      <span class="grip" draggable="true" @dragstart="dragItem($event, cl.id, item.id)" @click.stop>⋮⋮</span>
                      <span class="node"></span>
                      <span class="ftitle" v-html="hl(item.title)"></span>
                      <span class="ftag">关联</span>
                      <button class="fdel" title="移出" @click.stop="removeItem(cl.id, item.id)">✕</button>
                      <span class="farr">▶</span>
                    </div>
                    <div class="collapsible" :class="{ open: stateItemOpen(cl.id, item.id) }">
                      <div class="inner">
                        <div class="frow-body">
                          <div class="bubble u"><div class="who"><span class="av">👤</span>你</div><div v-html="hl(item.u)"></div></div>
                          <div class="bubble a"><div class="who"><span class="av">🤖</span>AI</div><div v-html="hl(item.a)"></div></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div v-if="cl.items.length > 2 && !cl.showAll" class="more-row" @click="cl.showAll = true">
                    ⋯ 展开其余 {{ cl.items.length - 2 }} 条关联对话
                  </div>
                  <div class="ask-area">
                    <input :ref="(el) => { if (el) askRefs[cl.id] = el as HTMLInputElement }" placeholder="在此主题下追问…" @keydown.enter.prevent="askHere(cl, $event)" />
                    <button @click="askHere(cl)">追问</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div v-else class="empty" :class="{ hit: !clusters.length }">
        <p>还没有对话簇。</p>
        <p class="hint">在下方输入框发送消息，或创建主题来组织学习。</p>
      </div>
    </div>

    <!-- insert bar -->
    <div class="ibar">
      <button @click="newTitleCluster">＋ 新主题</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useChatStore } from '../stores/chat'
import { ElMessage } from 'element-plus'

const chat = useChatStore()
const flowRef = ref<HTMLElement | null>(null)
const sq = ref('')
const askRefs: Record<string, HTMLInputElement> = {}

// ── cluster state ──
interface ItemData { id: string; title: string; u: string; a: string; hit?: boolean }
interface ClusterData {
  id: string; kind: 'dialog' | 'title'
  title: string
  anchor: { u: string; a: string } | null
  items: ItemData[]
  showAll: boolean
  hit?: boolean; titleHit?: boolean; anchorHit?: boolean
}
const openSet = reactive<Set<string>>(new Set())
const itemOpenSet = reactive<Set<string>>(new Set())
const clusters = ref<ClusterData[]>([])

function stateOpen(id: string) { return openSet.has(id) }
function toggleCluster(id: string) { if (openSet.has(id)) openSet.delete(id); else openSet.add(id) }
function stateItemOpen(cid: string, iid: string) { return itemOpenSet.has(cid + ':' + iid) }
function toggleItem(cid: string, iid: string) { const k = cid + ':' + iid; if (itemOpenSet.has(k)) itemOpenSet.delete(k); else itemOpenSet.add(k) }
function visibleItems(cl: ClusterData) { return cl.showAll ? cl.items : cl.items.slice(0, 2) }

// ── load data ──
async function loadClusters() {
  const groups = await window.lk.groupsTree()
  const convs = await window.lk.convAll()
  const result: ClusterData[] = []

  // Collect all msgs for each conv
  const allMsgs: Record<string, { role: string; content: string }[]> = {}
  for (const c of convs) {
    const msgs = await window.lk.msgList(c.id)
    allMsgs[c.id] = msgs.map((m: any) => ({ role: m.role, content: m.content }))
  }

  // Groups with conversations → clusters
  for (const g of groups) {
    const groupConvs = convs.filter((c: any) => c.group_id === g.id)
    if (!groupConvs.length) continue

    // first conv is anchor if it has user+assistant msgs
    const firstMsgs = allMsgs[groupConvs[0].id] || []
    const uMsg = firstMsgs.find((m: any) => m.role === 'user')
    const aMsg = firstMsgs.find((m: any) => m.role === 'assistant')

    const cluster: ClusterData = {
      id: g.id, kind: 'dialog',
      title: g.title || groupConvs[0].title,
      anchor: uMsg ? { u: uMsg.content.slice(0, 300), a: aMsg ? aMsg.content.slice(0, 300) : '' } : null,
      items: [],
      showAll: false
    }
    // remaining convs → foldable items
    for (let i = 1; i < groupConvs.length; i++) {
      const msgs = allMsgs[groupConvs[i].id] || []
      cluster.items.push({
        id: groupConvs[i].id,
        title: groupConvs[i].title || '对话',
        u: (msgs.find((m: any) => m.role === 'user')?.content || '').slice(0, 200),
        a: (msgs.find((m: any) => m.role === 'assistant')?.content || '').slice(0, 200),
      })
    }
    result.push(cluster)
  }

  // Groups without convs → title clusters
  for (const g of groups) {
    const hasConv = convs.some((c: any) => c.group_id === g.id)
    if (!hasConv) {
      result.push({ id: g.id, kind: 'title', title: g.title, anchor: null, items: [], showAll: false })
    }
  }

  // Root-level convs (no group) → each as its own dialog cluster
  const rootConvs = convs.filter((c: any) => !c.group_id)
  for (const c of rootConvs) {
    const msgs = allMsgs[c.id] || []
    const uMsg = msgs.find((m: any) => m.role === 'user')
    const aMsg = msgs.find((m: any) => m.role === 'assistant')
    result.push({
      id: c.id, kind: 'dialog',
      title: c.title,
      anchor: uMsg ? { u: uMsg.content.slice(0, 300), a: aMsg ? aMsg.content.slice(0, 300) : '' } : null,
      items: [], showAll: false
    })
  }

  clusters.value = result
}

// ── search ──
let hitIdx = 0
const totalHits = ref(0)
let hitEls: HTMLElement[] = []

function hl(text: string): string {
  if (!sq.value.trim()) return esc(text)
  const re = new RegExp('(' + escRe(sq.value.trim()) + ')', 'gi')
  return esc(text).replace(re, '<mark class="hit">$1</mark>')
}
function esc(s: string) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function escRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

function onSearch() {
  const q = sq.value.trim().toLowerCase()
  // Mark hits on clusters
  for (const cl of clusters.value) {
    cl.hit = false; cl.titleHit = false; cl.anchorHit = false
    if (!q) continue
    if (cl.title.toLowerCase().includes(q)) { cl.hit = true; cl.titleHit = true }
    if (cl.anchor && (cl.anchor.u.toLowerCase().includes(q) || cl.anchor.a.toLowerCase().includes(q))) { cl.hit = true; cl.anchorHit = true }
    for (const item of cl.items) {
      item.hit = false
      if (item.title.toLowerCase().includes(q) || item.u.toLowerCase().includes(q) || item.a.toLowerCase().includes(q)) item.hit = true
    }
  }
  nextTick(() => {
    hitEls = [...document.querySelectorAll('.cluster[data-cid] > [data-hit], .frow[data-hit]')] as HTMLElement[]
    totalHits.value = hitEls.length
    hitIdx = 0
    if (hitEls.length) activateHit()
  })
}

function activateHit() {
  document.querySelectorAll('.hit-active').forEach(e => e.classList.remove('hit-active'))
  const el = hitEls[hitIdx]
  if (!el) return
  el.classList.add('hit-active')
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  totalHits.value = hitEls.length
}

function jumpHit(d: number) {
  if (!hitEls.length) return
  hitIdx = (hitIdx + d + hitEls.length) % hitEls.length
  activateHit()
}

// ── drag ──
let dragData: { kind: 'conv'; id: string } | null = null

function dragItem(e: DragEvent, _cid: string, iid: string) {
  dragData = { kind: 'conv', id: iid }
  e.dataTransfer!.effectAllowed = 'move'
  e.dataTransfer!.setData('text/plain', iid)
}

function dOver(e: DragEvent) { e.currentTarget && (e.currentTarget as HTMLElement).classList.add('drag-over') }
function dLeave(e: DragEvent) { e.currentTarget && (e.currentTarget as HTMLElement).classList.remove('drag-over') }

function dropInto(targetCl: ClusterData, e: DragEvent) {
  e.currentTarget && (e.currentTarget as HTMLElement).classList.remove('drag-over')
  if (!dragData) return
  // Move conv to this group
  const convId = dragData.id
  if (!convId) return
  const groupId = targetCl.id.startsWith('g') || targetCl.id.startsWith('c') ? targetCl.id : null
  window.lk.convUpsert({ id: convId, group_id: groupId, title: '对话', sort: Date.now() })
  dragData = null
  ElMessage.success('已关联')
  loadClusters()
}

// ── actions ──
async function newTitleCluster() {
  const id = await window.lk.uuid()
  await window.lk.groupUpsert({ id, parent_id: null, title: '新主题', sort: Date.now(), expanded: 1 })
  await loadClusters()
  nextTick(() => {
    const h2 = document.querySelector(`[data-cid="${id}"] h2`) as HTMLElement
    if (h2) { h2.focus(); window.getSelection()?.selectAllChildren(h2) }
  })
}

function setTitle(cl: ClusterData, e: Event) {
  const t = (e.target as HTMLElement).innerText.trim()
  if (t && t !== cl.title) {
    cl.title = t
    window.lk.groupUpsert({ id: cl.id, parent_id: null, title: t, sort: 0, expanded: 1 })
  }
}

async function askHere(cl: ClusterData, e?: Event) {
  const input = e ? (e.target as HTMLInputElement) : askRefs[cl.id]
  if (!input) return
  const t = input.value.trim()
  if (!t) return
  input.value = ''
  const c = await chat.newConv(cl.id, t.slice(0, 30))
  await chat.selectConv(c.id)
  // Trigger send
  window.dispatchEvent(new CustomEvent('lk:send-with-text', { detail: { text: t } }))
}

async function removeItem(_cid: string, iid: string) {
  await window.lk.convUpsert({ id: iid, group_id: null, title: '对话', sort: Date.now() })
  ElMessage.success('已移出')
  loadClusters()
}

// ── lifecycle ──
onMounted(() => {
  loadClusters()
})
watch(() => chat.convs, () => loadClusters())
</script>

<style scoped lang="scss">
.cluster-root {
  flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden;
}
.search-bar {
  display: flex; align-items: center; gap: 6px; padding: 8px 26px;
  border-bottom: 1px solid var(--border); background: var(--bg);
  input {
    flex: 1; max-width: 340px; border: 1px solid var(--border); border-radius: 8px;
    padding: 6px 10px; font-size: 13px; background: var(--bg-soft); outline: none; font-family: inherit; color: var(--text);
    &:focus { border-color: var(--accent); }
  }
}
.scnt { font-size: 11px; color: var(--text-dim); font-variant-numeric: tabular-nums; }
.scnt.dim { opacity: .5; }
.snb {
  background: none; border: 1px solid var(--border); border-radius: 5px; padding: 3px 8px;
  cursor: pointer; font-size: 11px; color: var(--text); transition: .1s;
  &:hover { background: var(--bg-soft); }
  &:disabled { opacity: .3; cursor: default; }
}
.flow-wrap { flex: 1; overflow-y: auto; padding: 20px 26px 40px; }
.flow { max-width: 780px; margin: 0 auto; }

/* ── cluster ── */
.cluster { margin-bottom: 8px; }
.anchor { position: relative; padding-left: 18px; margin-bottom: 2px; }
.anchor::before {
  content: ''; position: absolute; left: 0; top: 8px; bottom: 8px;
  width: 3px; border-radius: 3px;
  background: linear-gradient(var(--accent), color-mix(in srgb, var(--accent) 50%, transparent));
}

/* ── bubbles ── */
.bubble { padding: 12px 16px; border-radius: 12px; font-size: 14px; line-height: 1.7; margin-bottom: 8px; }
.bubble .who { font-size: 11px; font-weight: 600; color: var(--text-dim); margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
.bubble .av { width: 20px; height: 20px; border-radius: 5px; display: grid; place-items: center; font-size: 11px; }
.bubble.u { background: color-mix(in srgb, var(--accent) 10%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent); margin-left: 30px; border-bottom-left-radius: 5px; }
.bubble.u .av { background: color-mix(in srgb, var(--accent) 20%, transparent); }
.bubble.a { background: var(--bg-elev); border: 1px solid var(--border); margin-right: 26px; border-bottom-right-radius: 5px; }
.bubble.a .av { background: var(--bg-soft); }

/* ── title anchor ── */
.anchor-title { padding: 10px 0 14px 18px; position: relative; }
.anchor-title::before {
  content: ''; position: absolute; left: 0; top: 14px; bottom: 18px;
  width: 3px; border-radius: 3px;
  background: linear-gradient(#e8a040, #f0ca8a);
}
.anchor-title .eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: #e8a040; }
.anchor-title h2 {
  font-family: 'Georgia', 'Noto Serif SC', serif; font-weight: 600; font-size: 22px;
  line-height: 1.25; margin-top: 4px; outline: none; border-radius: 6px; padding: 2px 6px; margin-left: -6px;
  &:focus { background: color-mix(in srgb, #e8a040 12%, transparent); }
}

/* ── fold bar ── */
.foldbar {
  margin: 4px 0 2px 18px; display: flex; align-items: center; gap: 8px;
  padding: 8px 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 8%, transparent), transparent);
  border-radius: 10px; cursor: pointer; user-select: none; transition: .15s;
  &:hover { border-color: var(--accent); box-shadow: var(--shadow); transform: translateY(-1px); }
  &.open { border-radius: 10px 10px 0 0; }
  &.drag-over { outline: 2px dashed var(--accent); outline-offset: 2px; background: color-mix(in srgb, var(--accent) 15%, transparent); }
}
.arr { width: 16px; height: 16px; display: grid; place-items: center; color: var(--accent); font-size: 10px; transition: transform .22s; }
.foldbar.open .arr { transform: rotate(90deg); }
.ft { font-size: 12px; font-weight: 600; color: color-mix(in srgb, var(--text) 80%, var(--accent)); flex: 1; }
.fc { font-size: 11px; color: var(--accent); background: var(--bg); border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent); padding: 1px 8px; border-radius: 8px; }

/* ── collapsible panel ── */
.collapsible { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .3s ease; }
.collapsible.open { grid-template-rows: 1fr; }
.collapsible > .inner { overflow: hidden; min-height: 0; }
.panel {
  margin: 0 0 6px 18px; border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
  border-top: none; border-radius: 0 0 10px 10px;
  background: color-mix(in srgb, var(--bg) 80%, transparent);
  padding: 6px 10px 10px;
  &.drag-over { outline: 2px dashed var(--accent); outline-offset: -3px; }
}

/* ── fold row ── */
.frow {
  border: 1px solid var(--border); background: var(--bg-elev); border-radius: 9px;
  margin: 5px 0; transition: .15s; overflow: hidden;
  &:hover { border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
  &.open { border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
}
.frow-head {
  display: flex; align-items: center; gap: 8px; padding: 9px 11px; cursor: pointer; user-select: none;
}
.grip { color: transparent; cursor: grab; font-size: 12px; letter-spacing: -2px; transition: .12s; user-select: none; }
.frow:hover .grip { color: var(--text-dim); }
.grip:active { cursor: grabbing; }
.node { width: 8px; height: 8px; border-radius: 50%; background: #c5cdd8; flex-shrink: 0; transition: .15s; }
.frow:hover .node, .frow.open .node { background: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent); }
.ftitle { flex: 1; font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ftag { font-size: 10px; color: var(--text-dim); }
.fdel { opacity: 0; background: none; border: none; cursor: pointer; color: var(--text-dim); font-size: 11px; padding: 2px 5px; border-radius: 4px; transition: .1s; }
.frow:hover .fdel { opacity: 1; }
.fdel:hover { color: #c0392b; background: #fbeceb; }
.farr { color: var(--text-dim); font-size: 9px; transition: transform .2s; }
.frow.open .farr { transform: rotate(90deg); color: var(--accent); }
.frow-body { padding: 0 14px 10px 28px; }
.frow-body .bubble { font-size: 13px; margin: 6px 0; }
.frow-body .bubble.u { margin-left: 0; }
.frow-body .bubble.a { margin-right: 0; }

.more-row {
  text-align: center; padding: 6px; font-size: 12px; color: var(--accent); cursor: pointer;
  border: 1px dashed color-mix(in srgb, var(--accent) 30%, transparent); border-radius: 7px;
  margin: 5px 0; transition: .12s;
  &:hover { background: color-mix(in srgb, var(--accent) 8%, transparent); }
}

.ask-area { display: flex; gap: 6px; margin-top: 6px; }
.ask-area input {
  flex: 1; border: 1px solid var(--border); border-radius: 7px; padding: 6px 10px;
  font-size: 12px; font-family: inherit; outline: none; background: var(--bg);
  &:focus { border-color: var(--accent); }
}
.ask-area button {
  background: var(--accent); color: #fff; border: none; border-radius: 7px; padding: 0 12px;
  cursor: pointer; font-size: 12px; white-space: nowrap;
}

/* ── empty ── */
.empty { text-align: center; padding-top: 80px; color: var(--text-dim); .hint { font-size: 13px; } }

/* ── insert bar ── */
.ibar { display: flex; justify-content: center; gap: 8px; padding: 2px 26px 14px; }
.ibar button {
  background: var(--bg-elev); border: 1px dashed var(--border); padding: 5px 14px;
  border-radius: 7px; font-size: 11px; color: var(--text-dim); cursor: pointer; font-family: inherit;
  &:hover { border-color: var(--accent); color: var(--accent); }
}

/* ── search highlights ── */
:deep(.hit) {
  background: #f0e4c8; color: #8a6400; border-radius: 2px; padding: 0 1px;
}
.hit-active { animation: pulse 1s ease; }
@keyframes pulse { 0% { box-shadow: 0 0 0 0 var(--accent); } 100% { box-shadow: 0 0 0 8px transparent; } }
</style>
