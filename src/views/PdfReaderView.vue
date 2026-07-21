<template>
  <div class="reader-root">
    <aside class="side" :class="{ open: sideOpen }">
      <div class="side-tabs">
        <button :class="{active: tab==='toc'}" @click="tab='toc'">TOC</button>
        <button :class="{active: tab==='marks'}" @click="tab='marks'">Book/HL</button>
      </div>
      <div class="side-body">
        <div v-if="tab==='toc'">
          <el-empty v-if="!outline.length" description="no TOC" :image-size="60" />
          <div v-for="(it, i) in outline" :key="i" class="toc-item" :style="{ paddingLeft: it.depth*12+'px' }" @click="goOutline(it)">{{ it.title }}</div>
        </div>
        <div v-else>
          <el-button size="small" plain @click="addBookmark" style="margin-bottom:6px">+ Bookmark</el-button>
          <el-empty v-if="!bookmarks.length" description="none" :image-size="60" />
          <div v-for="b in bookmarks" :key="b.id" class="mark" @click="goPage(b.page)">Page {{ b.page }} <el-button text size="small" type="danger" @click.stop="delBookmark(b.id)">x</el-button></div>
          <el-divider content-position="left">HL ({{ highlights.length }})</el-divider>
          <div v-for="h in highlights" :key="h.id" class="hl" @click="goPage(h.page)">
            <div class="hl-text">{{ h.text }}</div>
            <el-button text size="small" @click.stop="askHl(h)">AI</el-button>
            <el-button text size="small" type="danger" @click.stop="delHl(h.id)">x</el-button>
          </div>
        </div>
      </div>
    </aside>
    <div class="main">
      <div class="ctrl">
        <el-button size="small" text @click="$emit('back')">Back</el-button>
        <el-button size="small" text @click="sideOpen=!sideOpen">TOC</el-button>
        <span class="title">{{ book?.title }}</span>
        <span class="spacer"></span>
        <el-button size="small" @click="prevPage" :disabled="page<=1">&lt;</el-button>
        <span class="pg-ind">{{ page }}/{{ totalPages }}</span>
        <el-button size="small" @click="nextPage" :disabled="!totalPages||page>=totalPages">&gt;</el-button>
        <el-slider v-model="zoom" :min="80" :max="300" :step="10" style="width:100px;margin:0 6px" @change="() => renderPage()" />
        <span>{{ zoom }}%</span>
        <el-button size="small" @click="fitZoom" title="Fit width">Fit</el-button>
        <el-button size="small" @click="resetView" title="Reset to first page + default zoom">Reset</el-button>
        <el-button size="small" :type="annMode?'primary':'default'" @click="annMode=!annMode;renderPage()">Annotate</el-button>
      </div>
      <div v-if="annMode" class="ann-toolbar">
        <el-button-group size="small">
          <el-button :type="annTool==='pen'?'primary':'default'" @click="annTool='pen'">Pen</el-button>
          <el-button :type="annTool==='highlighter'?'primary':'default'" @click="annTool='highlighter'">Hi-Light</el-button>
          <el-button :type="annTool==='rect'?'primary':'default'" @click="annTool='rect'">Rect</el-button>
          <el-button :type="annTool==='circle'?'primary':'default'" @click="annTool='circle'">Circle</el-button>
          <el-button :type="annTool==='line'?'primary':'default'" @click="annTool='line'">Line</el-button>
          <el-button :type="annTool==='eraser'?'primary':'default'" @click="annTool='eraser'">Eraser</el-button>
        </el-button-group>
        <el-color-picker v-model="annColor" size="small" style="margin-left:6px" />
        <el-slider v-model="annWidth" :min="1" :max="12" :step="0.5" style="width:80px;margin-left:6px" />
        <el-button size="small" @click="clearPageAnnotations">Clear Page</el-button>
      </div>
      <div class="canvas-wrap" ref="wrap" @click="onCanvasClick" @mousedown="onDragStart" @mousemove="onDragMove" @mouseup="onDragEnd" @mouseleave="onDragEnd">
        <div ref="pageHost" class="page-host" @mouseup="onSelectionEnd"></div>
        <div v-if="loading" class="loading">Loading page {{ page }}...</div>
      <div v-if="dragHint" class="drag-hint">{{ dragHint }}</div>
      </div>
    </div>
    <div v-if="selPopup.show" class="sel-popup" :style="{ top: selPopup.y+'px', left:selPopup.x+'px' }">
      <button @click="askSel('Analyze?')">Analyze</button>
      <button @click="askSel('Summarize?')">Summary</button>
      <button @click="saveSel">Highlight</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { ElMessage, ElMessageBox } from 'element-plus'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const props = defineProps<{ bookIdProp: string | null }>()
const emit = defineEmits<{ (e: 'back'): void; (e: 'ask-ai', p: { quote: string; question?: string; bookId: string; page: number }): void }>()

const bookId = ref(props.bookIdProp)
const book = ref<any>(null)
const sideOpen = ref(true)
const tab = ref<'toc'|'marks'>('toc')
const wrap = ref<HTMLElement|null>(null)
const pageHost = ref<HTMLElement|null>(null)
const loading = ref(false)
const totalPages = ref(0)
const page = ref(1)
const zoom = ref(120)
const outline = ref<any[]>([])
const bookmarks = ref<any[]>([])
const highlights = ref<any[]>([])
const annMode = ref(false)
const annTool = ref<'pen'|'highlighter'|'rect'|'circle'|'line'|'eraser'>('pen')
const annColor = ref('#ffeb3b')
const annWidth = ref(3)
const selPopup = ref({ show: false, x: 0, y: 0, text: '' })

// mouse drag to flip pages
const DRAG_THRESHOLD = 60
let dragStartX = 0
let dragStartY = 0
let isDragging = false
let didDrag = false
const dragHint = ref<string | null>(null)

let pdfDoc: any = null
let annCtx: CanvasRenderingContext2D | null = null
let annCanvas: HTMLCanvasElement | null = null
let drawing = false
let startX = 0, startY = 0
let annPoints: number[][] = []
let canFlipNext = true // scrolling guard: only flip when fully scrolled

async function load() {
  if (!bookId.value) return
  loading.value = true
  const list = await window.lk.bookList()
  book.value = list.find((b: any) => b.id === bookId.value) || null
  bookmarks.value = await window.lk.bookmarkList(bookId.value)
  highlights.value = await window.lk.highlightList(bookId.value)
  const url = window.lk.bookUrl(bookId.value)
  pdfDoc = await pdfjsLib.getDocument({ url } as any).promise
  totalPages.value = pdfDoc.numPages
  if (book.value?.total_pages !== pdfDoc.numPages) await window.lk.bookUpdate(bookId.value, { total_pages: pdfDoc.numPages })
  if (book.value?.last_page) page.value = Math.min(book.value.last_page, pdfDoc.numPages)
  const raw = await pdfDoc.getOutline()
  outline.value = flattenOutline(raw)
  loading.value = false
  await renderPage()
}

function flattenOutline(items: any[], depth=0): any[] {
  const out: any[] = []; if (!items) return out
  for (const it of items) { out.push({ title: it.title, dest: it.dest, depth }); if (it.items) out.push(...flattenOutline(it.items, depth+1)) }
  return out
}

async function goOutline(it: any) {
  if (!pdfDoc) return
  let dest: any = it.dest
  if (typeof dest === 'string') dest = await pdfDoc.getDestination(dest)
  if (!dest?.[0]) return
  const idx = await pdfDoc.getPageIndex(dest[0])
  page.value = idx + 1
  await renderPage()
}

async function renderPage() {
  if (!pdfDoc || !pageHost.value) return
  loading.value = true
  const myToken = page.value
  const host = pageHost.value
  host.innerHTML = ''
  const p = await pdfDoc.getPage(page.value)
  if (myToken !== page.value) { loading.value = false; return }

  // compute scale: fit width by default, allow zoom override
  const cssW = wrap.value!.clientWidth - 40
  const base = p.getViewport({ scale: 1 })
  const fitScale = Math.min(cssW / base.width, 1.2)
  const scale = fitScale * (zoom.value / 100)
  const vp = p.getViewport({ scale })
  const w = Math.round(vp.width), h = Math.round(vp.height)

  const container = document.createElement('div')
  container.className = 'page-container'
  container.style.cssText = `position:relative;margin:0 auto;width:${w}px;min-height:${h}px;background:#fff;box-shadow:0 0 10px rgba(0,0,0,0.3)`

  const canvas = document.createElement('canvas')
  const dpr = window.devicePixelRatio || 1
  canvas.width = w * dpr; canvas.height = h * dpr
  canvas.style.cssText = `position:absolute;top:0;left:0;width:${w}px;height:${h}px`
  container.appendChild(canvas)
  const ctx = canvas.getContext('2d')!
  await p.render({ canvasContext: ctx, viewport: vp, transform: [dpr, 0, 0, dpr, 0, 0] } as any).promise

  // annotation overlay
  annCanvas = document.createElement('canvas')
  annCanvas.width = w; annCanvas.height = h
  annCanvas.style.cssText = `position:absolute;top:0;left:0;width:${w}px;height:${h}px;z-index:2`
  container.appendChild(annCanvas)
  annCtx = annCanvas.getContext('2d')!

  if (annMode.value) {
    annCanvas.addEventListener('mousedown', onAnnMouseDown)
    annCanvas.addEventListener('mousemove', onAnnMouseMove)
    annCanvas.addEventListener('mouseup', onAnnMouseUp)
    annCanvas.style.cursor = 'crosshair'
  }

  host.appendChild(container)

  // render text highlights
  const pgHls = highlights.value.filter((hl: any) => hl.page === page.value && hl.rect_x != null)
  if (annCtx) {
    for (const hl of pgHls) {
      const rx = hl.rect_x * w, ry = hl.rect_y * h, rw = hl.rect_w * w, rh = hl.rect_h * h
      annCtx.fillStyle = 'rgba(255,220,80,0.35)'; annCtx.fillRect(rx, ry, rw, rh)
    }
  }

  // load annotations from DB
  const rows = await window.lk.annList(bookId.value!, page.value)
  renderAnnotations(rows)

  window.lk.bookUpdate(bookId.value!, { last_page: page.value })
  loading.value = false
}

function renderAnnotations(rows: any[]) {
  if (!annCtx || !rows) return
  for (const r of rows) {
    const d = JSON.parse(r.data || '{}')
    annCtx!.save()
    if (r.type === 'pen') {
      annCtx!.strokeStyle = d.color || annColor.value; annCtx!.lineWidth = d.width || annWidth.value
      annCtx!.lineCap = 'round'; annCtx!.lineJoin = 'round'; annCtx!.beginPath()
      for (let i = 0; i < (d.points?.length || 0); i++) { const pt = d.points[i]; i===0 ? annCtx!.moveTo(pt[0],pt[1]) : annCtx!.lineTo(pt[0],pt[1]) }
      annCtx!.stroke()
    } else if (r.type === 'highlighter') {
      annCtx!.strokeStyle = d.color || '#ffeb3b'; annCtx!.globalAlpha = 0.35; annCtx!.lineWidth = (d.width||8)*2
      annCtx!.lineCap = 'round'; annCtx!.beginPath()
      for (let i = 0; i < (d.points?.length || 0); i++) { const pt = d.points[i]; i===0 ? annCtx!.moveTo(pt[0],pt[1]) : annCtx!.lineTo(pt[0],pt[1]) }
      annCtx!.stroke(); annCtx!.globalAlpha = 1
    } else if (r.type === 'rect') {
      annCtx!.strokeStyle = d.color || annColor.value; annCtx!.lineWidth = d.width || annWidth.value
      annCtx!.strokeRect(d.x, d.y, d.w, d.h)
    } else if (r.type === 'circle') {
      annCtx!.strokeStyle = d.color || annColor.value; annCtx!.lineWidth = d.width || annWidth.value
      annCtx!.beginPath(); annCtx!.ellipse(d.x, d.y, d.rx, d.ry, 0, 0, Math.PI*2); annCtx!.stroke()
    } else if (r.type === 'line') {
      annCtx!.strokeStyle = d.color || annColor.value; annCtx!.lineWidth = d.width || annWidth.value
      annCtx!.beginPath(); annCtx!.moveTo(d.x1, d.y1); annCtx!.lineTo(d.x2, d.y2); annCtx!.stroke()
    }
    annCtx!.restore()
  }
}

function redrawAnnotations(rows: any[]) {
  if (!annCtx) return
  annCtx.clearRect(0, 0, annCtx.canvas.width, annCtx.canvas.height)
  renderAnnotations(rows)
}

// annotation drawing
function onAnnMouseDown(e: MouseEvent) {
  if (!annMode.value || !annCanvas) return
  drawing = true
  const rect = annCanvas.getBoundingClientRect()
  startX = (e.clientX - rect.left) * (annCanvas.width / rect.width)
  startY = (e.clientY - rect.top) * (annCanvas.height / rect.height)
  annPoints = [[startX, startY]]
}
function onAnnMouseMove(e: MouseEvent) {
  if (!drawing || !annMode.value || !annCanvas || !annCtx) return
  const rect = annCanvas.getBoundingClientRect()
  const x = (e.clientX - rect.left) * (annCanvas.width / rect.width)
  const y = (e.clientY - rect.top) * (annCanvas.height / rect.height)
  if (annTool.value === 'pen' || annTool.value === 'highlighter') {
    annPoints.push([x, y]); annCtx.save()
    annCtx.strokeStyle = annTool.value === 'highlighter' ? '#ffeb3b' : annColor.value
    annCtx.globalAlpha = annTool.value === 'highlighter' ? 0.35 : 1
    annCtx.lineWidth = annTool.value === 'highlighter' ? annWidth.value*2 : annWidth.value
    annCtx.lineCap = 'round'; annCtx.lineJoin = 'round'; annCtx.beginPath()
    for (let i = 0; i < annPoints.length; i++) { i===0 ? annCtx.moveTo(annPoints[i][0], annPoints[i][1]) : annCtx.lineTo(annPoints[i][0], annPoints[i][1]) }
    annCtx.stroke(); annCtx.restore()
  } else if (annTool.value === 'eraser') {
    annPoints.push([x, y]); annCtx.save()
    annCtx.globalCompositeOperation = 'destination-out'; annCtx.lineWidth = annWidth.value*3; annCtx.lineCap = 'round'
    annCtx.beginPath(); for (let i = 0; i < annPoints.length; i++) { i===0 ? annCtx.moveTo(annPoints[i][0], annPoints[i][1]) : annCtx.lineTo(annPoints[i][0], annPoints[i][1]) }
    annCtx.stroke(); annCtx.restore()
  } else if (annTool.value === 'rect' || annTool.value === 'circle' || annTool.value === 'line') {
    // preview
    window.lk.annList(bookId.value!, page.value).then(redrawAnnotations)
    annCtx.save(); annCtx.strokeStyle = annColor.value; annCtx.lineWidth = annWidth.value
    if (annTool.value === 'rect') { annCtx.strokeRect(startX, startY, x-startX, y-startY) }
    else if (annTool.value === 'circle') { const rx = Math.abs(x-startX)/2, ry = Math.abs(y-startY)/2; annCtx.beginPath(); annCtx.ellipse(startX+(x-startX)/2, startY+(y-startY)/2, rx||1, ry||1, 0, 0, Math.PI*2); annCtx.stroke() }
    else if (annTool.value === 'line') { annCtx.beginPath(); annCtx.moveTo(startX, startY); annCtx.lineTo(x, y); annCtx.stroke() }
    annCtx.restore()
  }
}
function onAnnMouseUp() {
  if (!drawing || !annMode.value) return; drawing = false
  const c = annColor.value, w = annWidth.value
  if (annTool.value === 'pen' || annTool.value === 'highlighter') {
    window.lk.annSave({ bookId: bookId.value, page: page.value, type: annTool.value, data: JSON.stringify({ color: c, width: w, points: annPoints }) }).catch(()=>{})
  } else if (annTool.value === 'eraser') {
    // eraser already applied visually; save the eraser stroke
  } else if (annTool.value === 'rect') {
    const last = annPoints[annPoints.length-1] || [startX, startY]
    const x = Math.min(startX, last[0]), y = Math.min(startY, last[1]), w2 = Math.abs(last[0]-startX), h = Math.abs(last[1]-startY)
    window.lk.annSave({ bookId: bookId.value, page: page.value, type: 'rect', data: JSON.stringify({ color: c, width: w, x, y, w: w2, h }) }).catch(()=>{})
    window.lk.annList(bookId.value!, page.value).then(redrawAnnotations)
  } else if (annTool.value === 'circle') {
    const last = annPoints[annPoints.length-1] || [startX, startY]
    const dx = last[0]-startX, dy = last[1]-startY
    window.lk.annSave({ bookId: bookId.value, page: page.value, type: 'circle', data: JSON.stringify({ color: c, width: w, x: startX+dx/2, y: startY+dy/2, rx: Math.abs(dx/2)||1, ry: Math.abs(dy/2)||1 }) }).catch(()=>{})
    window.lk.annList(bookId.value!, page.value).then(redrawAnnotations)
  } else if (annTool.value === 'line') {
    const last = annPoints[annPoints.length-1] || [startX, startY]
    window.lk.annSave({ bookId: bookId.value, page: page.value, type: 'line', data: JSON.stringify({ color: c, width: w, x1: startX, y1: startY, x2: last[0], y2: last[1] }) }).catch(()=>{})
    window.lk.annList(bookId.value!, page.value).then(redrawAnnotations)
  }
  annPoints = []
}

// === Wheel-based page flipping (novel style) ===
function onWheel(e: WheelEvent) {
  if (!wrap.value || !wrap.value.contains(e.target as Node)) return
  if (e.ctrlKey) {
    // Ctrl+wheel = zoom
    e.preventDefault()
    zoom.value = Math.max(80, Math.min(300, zoom.value - Math.sign(e.deltaY) * 10))
    renderPage()
    return
  }
  // Normal wheel = page flip (if page fits in viewport)
  // If page is zoomed in and scrollable, let native scroll happen first
  const w = wrap.value!
  const atTop = w.scrollTop <= 0
  const atBottom = w.scrollTop + w.clientHeight >= w.scrollHeight - 2
  if (e.deltaY > 0 && atBottom && canFlipNext) {
    // scroll down at bottom => next page
    e.preventDefault()
    canFlipNext = false
    nextPage()
    setTimeout(() => { canFlipNext = true }, 300)
  } else if (e.deltaY < 0 && atTop && page.value > 1 && canFlipNext) {
    // scroll up at top => prev page
    e.preventDefault()
    canFlipNext = false
    prevPage()
    setTimeout(() => { canFlipNext = true }, 300)
  }
}

// click left/right side to flip
function onCanvasClick(e: MouseEvent) {
  if (annMode.value) return // don't flip in annotation mode
  if (e.target instanceof HTMLButtonElement) return
  if (didDrag) { didDrag = false; return } // suppress click right after drag
  const w = wrap.value!; const x = e.clientX - w.getBoundingClientRect().left
  const ratio = x / w.clientWidth
  if (ratio < 0.35) prevPage()
  else if (ratio > 0.65) nextPage()
}

function nextPage() {
  if (page.value < totalPages.value) { page.value++; renderPage() }
}
function prevPage() {
  if (page.value > 1) { page.value--; renderPage() }
}
function goPage(p: number) { page.value = p; renderPage() }

// fit width (zoom = 100)
function fitZoom() { zoom.value = 100; renderPage(); ElMessage.success('fit width') }
// reset view
function resetView() { page.value = 1; zoom.value = 100; renderPage(); wrap.value?.scrollTo({ top: 0 }); ElMessage.success('reset view') }

// === drag-to-flip ===
let lastDx = 0
function onDragStart(e: MouseEvent) {
  if (annMode.value && e.target instanceof HTMLCanvasElement) return
  dragStartX = e.clientX
  dragStartY = e.clientY
  isDragging = true
  didDrag = false
  lastDx = 0
  dragHint.value = null
}
function onDragMove(e: MouseEvent) {
  if (!isDragging || !wrap.value) return
  const dx = e.clientX - dragStartX
  const dy = e.clientY - dragStartY
  if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return
  if (Math.abs(dx) > Math.abs(dy) * 1.5) {
    didDrag = true
    lastDx = dx
    if (dx < -DRAG_THRESHOLD) { dragHint.value = 'Release ->' }
    else if (dx > DRAG_THRESHOLD) { dragHint.value = '<- Release' }
    else { dragHint.value = `Drag ${Math.round(Math.abs(dx))}/${DRAG_THRESHOLD}px` }
  }
}
function onDragEnd() {
  if (!isDragging) return
  isDragging = false
  if (didDrag) {
    if (lastDx < -DRAG_THRESHOLD && page.value < totalPages.value) nextPage()
    else if (lastDx > DRAG_THRESHOLD && page.value > 1) prevPage()
  }
  dragHint.value = null
}

async function addBookmark() {
  await window.lk.bookmarkAdd({ bookId: bookId.value, page: page.value, label: `Page ${page.value}` })
  bookmarks.value = await window.lk.bookmarkList(bookId.value!); ElMessage.success('Bookmark added')
}
async function delBookmark(id: string) { await window.lk.bookmarkDelete(id); bookmarks.value = await window.lk.bookmarkList(bookId.value!) }

function onSelectionEnd(e: MouseEvent) {
  if (annMode.value) return
  const sel = window.getSelection(); if (!sel) return
  const text = sel.toString().trim()
  if (!text || text.length < 2) { selPopup.value.show = false; return }
  const rect = wrap.value!.getBoundingClientRect()
  selPopup.value = { show: true, x: Math.min(e.clientX - rect.left, rect.width - 200), y: Math.max(40, e.clientY - rect.top - 50), text }
}

function askSel(prefix: string) { emit('ask-ai', { quote: selPopup.value.text, question: prefix, bookId: bookId.value!, page: page.value }); selPopup.value.show = false }
async function saveSel() {
  if (!selPopup.value.text) return
  await window.lk.highlightAdd({ bookId: bookId.value, page: page.value, text: selPopup.value.text, color: 'yellow' })
  highlights.value = await window.lk.highlightList(bookId.value!); selPopup.value.show = false; ElMessage.success('Highlighted')
  renderPage()
}

function askHl(h: any) { emit('ask-ai', { quote: h.text, bookId: bookId.value!, page: h.page }) }
async function delHl(id: string) { await window.lk.highlightDelete(id); highlights.value = await window.lk.highlightList(bookId.value!); renderPage() }

async function clearPageAnnotations() {
  await ElMessageBox.confirm('Clear annotations on this page?', 'Clear', { type: 'warning' })
  await window.lk.annClear(bookId.value!, page.value)
  if (annCtx) annCtx.clearRect(0, 0, annCtx.canvas.width, annCtx.canvas.height)
  ElMessage.success('Page cleared')
}

function onKey(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); prevPage() }
  else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); nextPage() }
  else if (e.key === 'Escape') { selPopup.value.show = false; sideOpen.value = true }
}

onMounted(() => {
  load()
  window.addEventListener('keydown', onKey)
  window.addEventListener('wheel', onWheel, { passive: false })
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('wheel', onWheel)
})
</script>

<style scoped lang="scss">
.reader-root { flex:1; display:flex; min-width:0; background:var(--bg); position:relative; }
.side { width:240px; background:var(--bg-soft); border-right:1px solid var(--border); display:flex; flex-direction:column; flex-shrink:0; overflow:hidden; transition:width 0.2s; }
.side:not(.open) { width:0; min-width:0; border:none; }
.side-tabs { display:flex; border-bottom:1px solid var(--border); flex-shrink:0; }
.side-tabs button { flex:1; padding:8px; border:none; background:transparent; color:var(--text-dim); cursor:pointer; &.active { color:var(--accent); border-bottom:2px solid var(--accent) } }
.side-body { flex:1; overflow:auto; padding:8px 10px; font-size:13px; }
.toc-item { padding:4px 6px; cursor:pointer; border-radius:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; &:hover { background:rgba(127,127,127,0.12) } }
.mark { display:flex; gap:4px; align-items:center; padding:4px 0; border-bottom:1px dashed var(--border); cursor:pointer; }
.hl { padding:6px 4px; border-left:2px solid #d4b469; margin-bottom:6px; cursor:pointer; }
.hl-text { font-size:12px; max-height:60px; overflow:hidden; }
.main { flex:1; display:flex; flex-direction:column; min-width:0; }
.ctrl { height:38px; flex:0 0 38px; display:flex; align-items:center; gap:6px; padding:0 12px; background:var(--bg-soft); border-bottom:1px solid var(--border); }
.title { font-weight:600; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.spacer { flex:1; }
.pg-ind { font-size:12px; color:var(--text-dim); min-width:50px; text-align:center; }
.ann-toolbar { display:flex; align-items:center; gap:4px; padding:4px 12px; background:var(--bg-soft); border-bottom:1px solid var(--border); flex-wrap:wrap; font-size:12px; }
.canvas-wrap { flex:1; overflow-y:auto; overflow-x:hidden; padding:10px 0; background:#3b3b3b; position:relative; display:flex; justify-content:center; }
.canvas-wrap::-webkit-scrollbar { width:8px; }
.canvas-wrap::-webkit-scrollbar-thumb { background:var(--accent); border-radius:5px; }
.canvas-wrap::-webkit-scrollbar-track { background:var(--bg); }
.page-host { margin:0 auto; }
.loading { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:var(--text-dim); background:rgba(0,0,0,0.3); z-index:5; }
.sel-popup { position:absolute; z-index:30; display:flex; gap:4px; background:var(--bg-elev); border:1px solid var(--border); border-radius:6px; padding:4px; box-shadow:var(--shadow); }
.sel-popup button { border:none; background:transparent; color:var(--text); padding:4px 8px; border-radius:4px; cursor:pointer; &:hover { background:var(--accent); color:#fff } }
.drag-hint { position:absolute; bottom:18px; right:18px; z-index:20; background:rgba(0,0,0,0.7); color:#fff; padding:6px 14px; border-radius:6px; font-size:12px; pointer-events:none; }
</style>