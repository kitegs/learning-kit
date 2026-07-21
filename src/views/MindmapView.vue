<template>
  <div class="mm-root" :class="{ fullscreen: isFullscreen }">
    <!-- toolbar -->
    <div class="head" v-show="!isFullscreen || showToolbar">
      <el-select v-model="currentId" placeholder="Mindmap" @change="onChangeSelect" style="width:180px" size="small">
        <el-option v-for="m in list" :key="m.id" :label="m.title" :value="m.id" />
      </el-select>
      <el-input v-if="current" v-model="current.title" style="width:160px" size="small" @change="save" />
      <span v-if="dirty" class="dirty-dot" title="Unsaved changes"></span>
      <el-button size="small" @click="newMap" type="primary" plain>+ New</el-button>
      <el-button size="small" @click="save" :disabled="!current">Save</el-button>
      <el-button size="small" @click="del" :disabled="!current" type="danger" plain>Del</el-button>
      <span class="sep"></span>
      <el-radio-group v-model="viewMode" size="small">
        <el-radio-button value="md">MD</el-radio-button>
        <el-radio-button value="both">Both</el-radio-button>
        <el-radio-button value="draw">Draw</el-radio-button>
      </el-radio-group>
      <span class="sep"></span>
      <el-button-group size="small">
        <el-button @click="zoomIn" title="Zoom In">+</el-button>
        <el-button @click="zoomOut" title="Zoom Out">-</el-button>
        <el-button @click="fitView" title="Fit">Fit</el-button>
      </el-button-group>
      <el-button-group size="small">
        <el-button @click="undo" :disabled="!canUndo" title="Undo (Ctrl+Z)">U</el-button>
        <el-button @click="redo" :disabled="!canRedo" title="Redo (Ctrl+Shift+Z)">R</el-button>
      </el-button-group>
      <el-button-group size="small">
        <el-button @click="exportPng" :disabled="!current" title="Export PNG">PNG</el-button>
        <el-button @click="exportSvg" :disabled="!current" title="Export SVG">SVG</el-button>
      </el-button-group>
      <el-input v-model="searchQuery" placeholder="Search nodes..." size="small" style="width:140px" clearable @input="highlightSearch" />
      <span class="spacer"></span>
      <el-button size="small" @click="toggleFullscreen" :title="isFullscreen?'Exit fullscreen (Esc)':'Fullscreen'">{{ isFullscreen ? 'Exit FS' : 'FS' }}</el-button>
    </div>

    <!-- both mode -->
    <div class="split" v-if="viewMode==='both'">
      <div class="md-pane">
        <textarea ref="taRef" v-model="bodyDraft" class="ta" spellcheck="false" @input="onMdInput"
          placeholder="# Mindmap&#10;- Topic&#10;  - Branch&#10;    - Leaf"
          @keydown="onMdKeydown"></textarea>
      </div>
      <div class="mm-pane" ref="mmPanel">
        <div ref="svgHost" class="svg-host"></div>
        <!-- inline node editor overlay -->
        <div v-if="nodeEditor.show" class="node-editor" :style="{ left: nodeEditor.x+'px', top: nodeEditor.y+'px' }">
          <input ref="nodeInput" v-model="nodeEditor.text" @keydown.enter="commitNodeEdit" @keydown.escape="cancelNodeEdit" @blur="commitNodeEdit" />
        </div>
      </div>
    </div>

    <!-- md only -->
    <div class="split" v-if="viewMode==='md'">
      <textarea ref="taRef" v-model="bodyDraft" class="ta" spellcheck="false" @input="onMdInput"
        placeholder="# Mindmap&#10;- Topic&#10;  - Branch"
        @keydown="onMdKeydown"></textarea>
      <div class="mm-pane">
        <div ref="svgHost2" class="svg-host"></div>
        <div v-if="nodeEditor.show" class="node-editor" :style="{ left: nodeEditor.x+'px', top: nodeEditor.y+'px' }">
          <input ref="nodeInput" v-model="nodeEditor.text" @keydown.enter="commitNodeEdit" @keydown.escape="cancelNodeEdit" @blur="commitNodeEdit" />
        </div>
      </div>
    </div>

    <!-- draw mode -->
    <div class="draw-panel" v-if="viewMode==='draw'">
      <div class="draw-toolbar">
        <el-button-group size="small">
          <el-button :type="tool==='pen'?'primary':'default'" @click="tool='pen'">Pen</el-button>
          <el-button :type="tool==='eraser'?'primary':'default'" @click="tool='eraser'">Eraser</el-button>
        </el-button-group>
        <el-color-picker v-model="penColor" size="small" />
        <el-slider v-model="penSize" :min="1" :max="8" :step="0.5" style="width:80px" />
        <el-button size="small" @click="clearCanvas">Clear</el-button>
        <el-button size="small" type="primary" @click="saveDrawing" :disabled="!current">Save</el-button>
      </div>
      <canvas ref="drawCanvas" class="draw-canvas"
        @mousedown="startDraw" @mousemove="doDraw" @mouseup="endDraw" @mouseleave="endDraw"></canvas>
    </div>

    <!-- keyboard shortcut help -->
    <div v-if="showHelp" class="help-overlay" @click="showHelp=false">
      <div class="help-card" @click.stop>
        <h3>Keyboard Shortcuts</h3>
        <table>
          <tr><td>Tab</td><td>Add child node</td></tr>
          <tr><td>Enter</td><td>Add sibling node</td></tr>
          <tr><td>Delete / Backspace</td><td>Delete selected node</td></tr>
          <tr><td>F2</td><td>Edit selected node</td></tr>
          <tr><td>Ctrl+Z</td><td>Undo</td></tr>
          <tr><td>Ctrl+Shift+Z</td><td>Redo</td></tr>
          <tr><td>Ctrl+S</td><td>Save</td></tr>
          <tr><td>Ctrl+F</td><td>Search nodes</td></tr>
          <tr><td>Ctrl+=/-</td><td>Zoom in/out</td></tr>
          <tr><td>Ctrl+0</td><td>Fit view</td></tr>
          <tr><td>Esc</td><td>Exit fullscreen / close editor</td></tr>
          <tr><td>?</td><td>Toggle this help</td></tr>
        </table>
        <el-button size="small" @click="showHelp=false" style="margin-top:12px">Close</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, nextTick, computed } from 'vue'
import { Transformer } from 'markmap-lib'
import { Markmap } from 'markmap-view'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useContextMenu } from '../stores/context-menu'

const transformer = new Transformer()
const menu = useContextMenu()

// state
const list = ref<any[]>([])
const current = ref<any>(null)
const currentId = ref('')
const bodyDraft = ref('')
const svgHost = ref<HTMLElement|null>(null)
const svgHost2 = ref<HTMLElement|null>(null)
const mmPanel = ref<HTMLElement|null>(null)
const taRef = ref<HTMLTextAreaElement|null>(null)
const nodeInput = ref<HTMLInputElement|null>(null)
const drawCanvas = ref<HTMLCanvasElement|null>(null)
const viewMode = ref<'md'|'both'|'draw'>('both')
const dirty = ref(false)
const isFullscreen = ref(false)
const showToolbar = ref(true)
const showHelp = ref(false)
const searchQuery = ref('')

// node editor overlay
const nodeEditor = ref({ show: false, x: 0, y: 0, text: '', lineIdx: -1 })

// undo/redo
const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
const canUndo = computed(() => undoStack.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)

// draw
const tool = ref<'pen'|'eraser'>('pen')
const penColor = ref('#4ea1ff')
const penSize = ref(3)
let drawing = false
let dCtx: CanvasRenderingContext2D|null = null

let mm: Markmap|null = null
let renderTimer: any = null
let selectedNodeText = ''
let autoSaveTimer: any = null

// ── markdown line helpers ──
interface MdLine { indent: number; content: string; raw: string }
function parseLines(text: string): MdLine[] {
  return text.split('\n').map(raw => {
    const m = raw.match(/^(\s*)[-*]\s+(.*)/)
    if (m) return { indent: m[1].length, content: m[2], raw }
    const hm = raw.match(/^(#+)\s+(.*)/)
    if (hm) return { indent: -1, content: hm[2], raw }
    return { indent: -2, content: raw.trim(), raw }
  })
}
function findLineByContent(lines: MdLine[], text: string): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].content === text && lines[i].indent >= 0) return i
  }
  return -1
}
function getSubtreeEnd(lines: MdLine[], idx: number): number {
  const baseIndent = lines[idx].indent
  let end = idx
  for (let i = idx + 1; i < lines.length; i++) {
    if (lines[i].indent >= 0 && lines[i].indent > baseIndent) end = i
    else if (lines[i].indent >= 0 && lines[i].indent <= baseIndent) break
    else if (lines[i].indent === -2 && lines[i].raw.trim() === '') end = i
    else break
  }
  return end
}
function addChildNode(text: string, childText: string) {
  pushUndo()
  const lines = parseLines(bodyDraft.value)
  const idx = findLineByContent(lines, text)
  if (idx < 0) return
  const newIndent = lines[idx].indent + 2
  const end = getSubtreeEnd(lines, idx)
  const newLine = ' '.repeat(newIndent) + '- ' + childText
  const rawLines = bodyDraft.value.split('\n')
  rawLines.splice(end + 1, 0, newLine)
  bodyDraft.value = rawLines.join('\n')
  afterEdit()
}
function addSiblingNode(text: string, siblingText: string) {
  pushUndo()
  const lines = parseLines(bodyDraft.value)
  const idx = findLineByContent(lines, text)
  if (idx < 0) return
  const end = getSubtreeEnd(lines, idx)
  const newLine = ' '.repeat(lines[idx].indent) + '- ' + siblingText
  const rawLines = bodyDraft.value.split('\n')
  rawLines.splice(end + 1, 0, newLine)
  bodyDraft.value = rawLines.join('\n')
  afterEdit()
}
function deleteNode(text: string) {
  pushUndo()
  const lines = parseLines(bodyDraft.value)
  const idx = findLineByContent(lines, text)
  if (idx < 0) return
  const end = getSubtreeEnd(lines, idx)
  const rawLines = bodyDraft.value.split('\n')
  rawLines.splice(idx, end - idx + 1)
  bodyDraft.value = rawLines.join('\n')
  afterEdit()
}
function editNodeText(oldText: string, newText: string) {
  if (oldText === newText) return
  pushUndo()
  const lines = parseLines(bodyDraft.value)
  const idx = findLineByContent(lines, oldText)
  if (idx < 0) return
  const rawLines = bodyDraft.value.split('\n')
  rawLines[idx] = ' '.repeat(lines[idx].indent) + '- ' + newText
  bodyDraft.value = rawLines.join('\n')
  afterEdit()
}

// ── undo/redo ──
function pushUndo() {
  undoStack.value.push(bodyDraft.value)
  if (undoStack.value.length > 50) undoStack.value.shift()
  redoStack.value = []
}
function undo() {
  if (!undoStack.value.length) return
  redoStack.value.push(bodyDraft.value)
  bodyDraft.value = undoStack.value.pop()!
  afterEdit()
}
function redo() {
  if (!redoStack.value.length) return
  undoStack.value.push(bodyDraft.value)
  bodyDraft.value = redoStack.value.pop()!
  afterEdit()
}

// ── edit lifecycle ──
function onMdInput() {
  dirty.value = true
  scheduleRender()
  scheduleAutoSave()
}
function afterEdit() {
  dirty.value = true
  scheduleRender()
  scheduleAutoSave()
}
function scheduleAutoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => { if (dirty.value && current.value) save() }, 3000)
}
function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer)
  renderTimer = setTimeout(render, 180)
}

// ── render ──
function render() {
  const host = viewMode.value === 'md' ? svgHost2.value : svgHost.value
  if (!host) return
  if (!mm) {
    host.innerHTML = '<svg style="width:100%;height:100%"></svg>'
    mm = Markmap.create(host.querySelector('svg') as any, {
      duration: 300,
      maxWidth: 200,
    })
  }
  const { root } = transformer.transform(bodyDraft.value || '# \n')
  mm.setData(root)
  mm.fit()
  // after render, attach node interaction
  nextTick(() => attachNodeListeners(host))
}

function attachNodeListeners(host: HTMLElement) {
  const svg = host.querySelector('svg')
  if (!svg) return
  const nodes = svg.querySelectorAll('g.markmap-node')
  nodes.forEach((g) => {
    const fo = g.querySelector('foreignObject')
    const textEl = fo?.querySelector('div') || fo?.querySelector('span') || g.querySelector('text')
    const nodeText = textEl?.textContent?.trim() || ''
    if (!nodeText) return

    // remove old listeners by cloning
    const target = (fo || g) as HTMLElement
    const clone = target.cloneNode(true) as HTMLElement
    target.parentNode?.replaceChild(clone, target)

    clone.style.cursor = 'pointer'
    clone.addEventListener('dblclick', (e: MouseEvent) => {
      e.preventDefault(); e.stopPropagation()
      openNodeEditor(nodeText, e, host)
    })
    clone.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault(); e.stopPropagation()
      selectedNodeText = nodeText
      showNodeMenu(e, nodeText)
    })
    clone.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation()
      selectedNodeText = nodeText
      // highlight selected
      svg.querySelectorAll('g.markmap-node').forEach(n => n.classList.remove('mm-selected'))
      const parentG = clone.closest('g.markmap-node')
      if (parentG) parentG.classList.add('mm-selected')
    })
  })
}

// ── node editor overlay ──
function openNodeEditor(text: string, e: MouseEvent, host: HTMLElement) {
  const rect = host.getBoundingClientRect()
  nodeEditor.value = {
    show: true,
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
    text,
    lineIdx: findLineByContent(parseLines(bodyDraft.value), text),
  }
  selectedNodeText = text
  nextTick(() => { nodeInput.value?.focus(); nodeInput.value?.select() })
}
function commitNodeEdit() {
  if (!nodeEditor.value.show) return
  const oldText = selectedNodeText
  const newText = nodeEditor.value.text.trim()
  nodeEditor.value.show = false
  if (newText && newText !== oldText) editNodeText(oldText, newText)
}
function cancelNodeEdit() { nodeEditor.value.show = false }

// ── node context menu ──
function showNodeMenu(e: MouseEvent, text: string) {
  menu.open(e, [
    { label: 'Edit', icon: 'Edit' as any, action: () => {
      const host = viewMode.value === 'md' ? svgHost2.value : svgHost.value
      if (host) openNodeEditor(text, e, host)
    }},
    { label: 'Add Child', icon: 'Plus' as any, shortcut: 'Tab', action: () => addChildNode(text, 'New node') },
    { label: 'Add Sibling', icon: 'Plus' as any, shortcut: 'Enter', action: () => addSiblingNode(text, 'New node') },
    { separator: true },
    { label: 'Collapse/Expand', icon: 'ArrowDown' as any, action: () => toggleCollapse(text) },
    { separator: true },
    { label: 'Delete Node', icon: 'Delete' as any, danger: true, shortcut: 'Del', action: () => deleteNode(text) },
  ])
}

function toggleCollapse(_text: string) {
  // markmap handles fold via its own API; for now toggle via markdown comment
  // TODO: implement proper fold state
}

// ── search/highlight ──
function highlightSearch() {
  const host = viewMode.value === 'md' ? svgHost2.value : svgHost.value
  if (!host) return
  const svg = host.querySelector('svg')
  if (!svg) return
  svg.querySelectorAll('g.markmap-node').forEach(g => g.classList.remove('mm-search-hit'))
  if (!searchQuery.value.trim()) return
  const q = searchQuery.value.toLowerCase()
  svg.querySelectorAll('g.markmap-node').forEach(g => {
    const t = g.textContent?.toLowerCase() || ''
    if (t.includes(q)) g.classList.add('mm-search-hit')
  })
}

// ── zoom ─
function zoomIn() { if (mm) { const svg = getSvg(); if (svg) mm.zoom?.(1.2) } }
function zoomOut() { if (mm) { const svg = getSvg(); if (svg) mm.zoom?.(0.8) } }
function fitView() { mm?.fit() }
function getSvg() {
  const host = viewMode.value === 'md' ? svgHost2.value : svgHost.value
  return host?.querySelector('svg') || null
}

// ── export ──
function exportSvg() {
  const svg = getSvg()
  if (!svg) return
  const clone = svg.cloneNode(true) as SVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const blob = new Blob([clone.outerHTML], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = (current.value?.title || 'mindmap') + '.svg'; a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('SVG exported')
}
function exportPng() {
  const svg = getSvg()
  if (!svg) return
  const clone = svg.cloneNode(true) as SVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const svgData = new XMLSerializer().serializeToString(clone)
  const canvas = document.createElement('canvas')
  const bbox = svg.getBoundingClientRect()
  canvas.width = bbox.width * 2; canvas.height = bbox.height * 2
  const ctx2 = canvas.getContext('2d')!
  ctx2.scale(2, 2)
  ctx2.fillStyle = '#fff'; ctx2.fillRect(0, 0, bbox.width, bbox.height)
  const img = new Image()
  img.onload = () => {
    ctx2.drawImage(img, 0, 0, bbox.width, bbox.height)
    const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = (current.value?.title || 'mindmap') + '.png'; a.click()
    ElMessage.success('PNG exported')
  }
  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)))
}

// ── fullscreen ──
function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
  if (isFullscreen.value) document.documentElement.requestFullscreen?.()
  else document.exitFullscreen?.()
  nextTick(() => { mm?.fit() })
}

// ── keyboard shortcuts ──
function onGlobalKey(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
    if (e.key === 'Escape' && nodeEditor.value.show) { cancelNodeEdit(); return }
    return
  }
  if (e.key === '?' && !e.ctrlKey) { showHelp.value = !showHelp.value; return }
  if (e.key === 'Escape') { if (isFullscreen.value) toggleFullscreen(); nodeEditor.value.show = false; return }
  if (e.ctrlKey && e.key === 's') { e.preventDefault(); save(); return }
  if (e.ctrlKey && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return }
  if (e.ctrlKey && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); return }
  if (e.ctrlKey && e.key === 'Z') { e.preventDefault(); redo(); return }
  if (e.ctrlKey && e.key === 'f') { e.preventDefault(); const inp = document.querySelector('.head input[placeholder*="Search"]') as HTMLInputElement; inp?.focus(); return }
  if (e.ctrlKey && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomIn(); return }
  if (e.ctrlKey && e.key === '-') { e.preventDefault(); zoomOut(); return }
  if (e.ctrlKey && e.key === '0') { e.preventDefault(); fitView(); return }
  if (!selectedNodeText) return
  if (e.key === 'Tab') { e.preventDefault(); addChildNode(selectedNodeText, 'New node'); return }
  if (e.key === 'Enter') { e.preventDefault(); addSiblingNode(selectedNodeText, 'New node'); return }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteNode(selectedNodeText); selectedNodeText = ''; return }
  if (e.key === 'F2') { e.preventDefault(); const host = viewMode.value === 'md' ? svgHost2.value : svgHost.value; if (host) { const svg = host.querySelector('svg'); const nodes = svg?.querySelectorAll('g.markmap-node'); if (nodes) { for (const g of nodes) { if (g.textContent?.trim() === selectedNodeText) { const r = g.getBoundingClientRect(); openNodeEditor(selectedNodeText, { clientX: r.left + r.width/2, clientY: r.top + r.height/2 } as MouseEvent, host); break } } } } return }
}

function onMdKeydown(e: KeyboardEvent) {
  if (e.ctrlKey && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
  else if (e.ctrlKey && (e.key === 'z' && e.shiftKey || e.key === 'Z')) { e.preventDefault(); redo() }
  else if (e.ctrlKey && e.key === 's') { e.preventDefault(); save() }
}

// ── CRUD ──
async function loadList() { list.value = await window.lk.mindmapList() }
async function onChangeSelect(id: string) {
  if (!id) return
  current.value = await window.lk.mindmapGet(id)
  bodyDraft.value = current.value.body || ''
  undoStack.value = []; redoStack.value = []; dirty.value = false
  mm = null // force re-create markmap instance
  await nextTick(); render()
  await nextTick(); loadCanvasFromData(current.value.drawing)
}
async function newMap() {
  const id = await window.lk.mindmapUpsert({ title: 'New Mindmap', body: '# Mindmap\n- Central Topic\n  - Branch A\n    - Leaf 1\n    - Leaf 2\n  - Branch B\n  - Branch C' })
  await loadList(); currentId.value = id; await onChangeSelect(id)
}
async function save() {
  if (!current.value) return
  const drawingData = await getCanvasData()
  await window.lk.mindmapUpsert({ id: current.value.id, title: current.value.title, body: bodyDraft.value, drawing: drawingData, annotations: '' })
  dirty.value = false; ElMessage.success('saved'); loadList()
}
async function del() {
  if (!current.value) return
  await ElMessageBox.confirm('Delete this mindmap?', 'Delete', { type: 'warning' })
  await window.lk.mindmapDelete(current.value.id)
  current.value = null; currentId.value = ''; bodyDraft.value = ''; mm = null; loadList()
}

// ── canvas drawing ──
function setupCanvas() {
  if (!drawCanvas.value) return
  const c = drawCanvas.value
  c.width = c.parentElement!.clientWidth || 800; c.height = (window.innerHeight - 130) || 500
  dCtx = c.getContext('2d'); if (dCtx) { dCtx.lineCap = 'round'; dCtx.lineJoin = 'round' }
  loadCanvasFromData(current.value?.drawing)
}
function loadCanvasFromData(dataUrl: string|undefined) {
  if (!dataUrl || !drawCanvas.value) return
  const img = new Image()
  img.onload = () => { if (!drawCanvas.value) return; const c = drawCanvas.value; const cx = c.getContext('2d'); if (!cx) return; cx.clearRect(0, 0, c.width, c.height); cx.drawImage(img, 0, 0, c.width, c.height) }
  img.src = dataUrl
}
async function getCanvasData(): Promise<string> { return drawCanvas.value?.toDataURL('image/png') || '' }
async function saveDrawing() {
  if (!current.value) return
  const d = await getCanvasData()
  await window.lk.mindmapUpsert({ id: current.value.id, title: current.value.title, body: bodyDraft.value, drawing: d, annotations: '' })
  ElMessage.success('Drawing saved')
}
function clearCanvas() { if (drawCanvas.value && dCtx) dCtx.clearRect(0, 0, drawCanvas.value.width, drawCanvas.value.height) }
function startDraw(e: MouseEvent) { drawing = true; const r = drawCanvas.value!.getBoundingClientRect(); if (dCtx) { dCtx.beginPath(); dCtx.moveTo(e.clientX - r.left, e.clientY - r.top) } }
function doDraw(e: MouseEvent) {
  if (!drawing || !dCtx) return; const r = drawCanvas.value!.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top
  if (tool.value === 'eraser') { dCtx.globalCompositeOperation = 'destination-out'; dCtx.lineWidth = penSize.value * 3; dCtx.strokeStyle = 'rgba(0,0,0,1)' }
  else { dCtx.globalCompositeOperation = 'source-over'; dCtx.lineWidth = penSize.value; dCtx.strokeStyle = penColor.value }
  dCtx.lineTo(x, y); dCtx.stroke()
}
function endDraw() { drawing = false; if (dCtx) dCtx.globalCompositeOperation = 'source-over' }

watch(viewMode, () => { nextTick(() => { mm = null; if (viewMode.value === 'draw') setupCanvas(); else render() }) })

onMounted(async () => {
  await loadList()
  if (!list.value.length) await newMap()
  else { currentId.value = list.value[0].id; await onChangeSelect(currentId.value) }
  window.addEventListener('resize', () => { mm?.fit(); if (viewMode.value === 'draw') setupCanvas() })
  window.addEventListener('keydown', onGlobalKey)
  document.addEventListener('fullscreenchange', () => { isFullscreen.value = !!document.fullscreenElement })
})
onBeforeUnmount(() => { mm = null; window.removeEventListener('keydown', onGlobalKey) })
</script>

<style scoped lang="scss">
.mm-root { flex:1; display:flex; flex-direction:column; min-height:0; overflow:hidden; position:relative; }
.mm-root.fullscreen { position:fixed; inset:0; z-index:9000; background:var(--bg); }
.head { display:flex; align-items:center; gap:5px; padding:6px 10px; background:var(--bg-soft); border-bottom:1px solid var(--border); flex-wrap:wrap; flex-shrink:0; }
.sep { width:1px; height:20px; background:var(--border); margin:0 2px; flex-shrink:0; }
.spacer { flex:1; }
.dirty-dot { width:8px; height:8px; border-radius:50%; background:#ff9800; flex-shrink:0; animation:pulse 1.5s infinite; }
@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
.split { flex:1; display:flex; min-height:0; overflow:hidden; }
.md-pane { flex:1; display:flex; min-width:0; overflow:hidden; }
.ta { width:100%; height:100%; border:none; outline:none; background:var(--bg); color:var(--text); font-family:'JetBrains Mono',Consolas,monospace; font-size:13px; padding:12px 16px; resize:none; border-right:1px solid var(--border); box-sizing:border-box; line-height:1.6; }
.mm-pane { flex:1; position:relative; min-width:0; overflow:hidden; background:var(--bg); }
.svg-host { width:100%; height:100%; position:absolute; inset:0; }
.svg-host :deep(svg) { width:100%; height:100%; }

/* node interaction styles */
.svg-host :deep(g.markmap-node) { cursor:pointer; transition:opacity 0.15s; }
.svg-host :deep(g.markmap-node:hover foreignObject div),
.svg-host :deep(g.markmap-node:hover text) { filter:brightness(1.15); }
.svg-host :deep(g.mm-selected circle) { stroke:var(--accent) !important; stroke-width:3px !important; }
.svg-host :deep(g.mm-selected foreignObject div) { outline:2px solid var(--accent); outline-offset:2px; border-radius:4px; }
.svg-host :deep(g.mm-search-hit circle) { stroke:#ff9800 !important; stroke-width:3px !important; }
.svg-host :deep(g.mm-search-hit foreignObject div) { background:rgba(255,152,0,0.15) !important; border-radius:4px; }

.node-editor { position:absolute; z-index:20; }
.node-editor input { background:var(--bg-elev); color:var(--text); border:2px solid var(--accent); border-radius:4px; padding:4px 8px; font-size:13px; min-width:120px; outline:none; box-shadow:0 2px 12px rgba(0,0,0,0.3); }

.draw-panel { flex:1; display:flex; flex-direction:column; min-height:0; overflow:hidden; }
.draw-toolbar { display:flex; align-items:center; gap:6px; padding:6px 10px; background:var(--bg-soft); border-bottom:1px solid var(--border); flex-shrink:0; }
.draw-canvas { flex:1; background:#fff; cursor:crosshair; border:none; }
html[data-theme="dark"] .draw-canvas { background:#2a2a2a; }

.help-overlay { position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; }
.help-card { background:var(--bg-elev); border:1px solid var(--border); border-radius:10px; padding:24px 32px; max-width:420px; box-shadow:0 8px 32px rgba(0,0,0,0.4); }
.help-card h3 { margin:0 0 16px; font-size:18px; color:var(--text); }
.help-card table { width:100%; border-collapse:collapse; }
.help-card td { padding:4px 8px; font-size:13px; color:var(--text); border-bottom:1px solid var(--border); }
.help-card td:first-child { font-family:'JetBrains Mono',monospace; color:var(--accent); white-space:nowrap; width:140px; }
</style>