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
          <div v-for="it in outline" :key="it.dest" class="toc-item" :style="{ paddingLeft: it.depth*12+'px' }" @click="goOutline(it)">{{ it.title }}</div>
        </div>
        <div v-else>
          <el-button size="small" plain @click="addBookmark" style="margin-bottom:6px">+ Bookmark</el-button>
          <el-empty v-if="!bookmarks.length" description="none" :image-size="60" />
          <div v-for="b in bookmarks" :key="b.id" class="mark" @click="goPage(b.page)">Page {{ b.page }} <el-button text size="small" type="danger" @click.stop="delBookmark(b.id)">x</el-button></div>
          <el-divider content-position="left">HL ({{ highlights.length }})</el-divider>
          <div v-for="h in highlights" :key="h.id" class="hl" @click="goPage(h.page)">
            <div class="hl-text">{{ h.text }}</div>
            <el-button text size="small" @click.stop="askHl(h)">Ask AI</el-button>
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
        <el-input-number v-model="pageInput" :min="1" :max="totalPages||1" size="small" controls-position="right" style="width:80px" @change="onPageInput" />
        <el-slider v-model="zoom" :min="50" :max="300" :step="10" style="width:100px;margin:0 6px" @change="() => debouncedRender()" />
        <span>{{ zoom }}%</span>
        <el-button size="small" :type="annMode?'primary':'default'" @click="annMode=!annMode;debouncedRender()">Annotate</el-button>
      </div>
      <div v-if="annMode" class="ann-toolbar">
        <el-button-group size="small">
          <el-button :type="annTool==='pen'?'primary':'default'" @click="annTool='pen'">Pen</el-button>
          <el-button :type="annTool==='highlighter'?'primary':'default'" @click="annTool='highlighter'">Highlighter</el-button>
          <el-button :type="annTool==='rect'?'primary':'default'" @click="annTool='rect'">Rect</el-button>
          <el-button :type="annTool==='circle'?'primary':'default'" @click="annTool='circle'">Circle</el-button>
          <el-button :type="annTool==='line'?'primary':'default'" @click="annTool='line'">Line</el-button>
          <el-button :type="annTool==='text'?'primary':'default'" @click="annTool='text'">Text</el-button>
          <el-button :type="annTool==='eraser'?'primary':'default'" @click="annTool='eraser'">Eraser</el-button>
        </el-button-group>
        <el-color-picker v-model="annColor" size="small" style="margin-left:6px" />
        <el-slider v-model="annWidth" :min="1" :max="12" :step="0.5" style="width:80px;margin-left:6px" />
        <el-button size="small" @click="deleteSelected">Del Sel</el-button>
        <el-button size="small" @click="clearAllAnnotations">Clear All</el-button>
        <el-button size="small" type="primary" @click="saveAllAnnotations">Save</el-button>
      </div>
      <div class="canvas-wrap" ref="wrap">
        <div ref="pageHost" class="page-host" @mouseup="onSelectionEnd"></div>
        <div v-if="loading" class="loading">Loading...</div>
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
const pageInput = ref(1)
const zoom = ref(130)
const outline = ref<any[]>([])
const bookmarks = ref<any[]>([])
const highlights = ref<any[]>([])
const scrollMode = ref(true)
const annMode = ref(false)
const annTool = ref<'pen'|'highlighter'|'rect'|'circle'|'line'|'text'|'eraser'>('pen')
const annColor = ref('#ffeb3b')
const annWidth = ref(3)
const selPopup = ref({ show: false, x: 0, y: 0, text: '' })

let pdfDoc: any = null
// stores per-page annotation data loaded from DB: page -> Annotation[]
let annData: Map<number, any[]> = new Map()
let drawing = false
let annCtxs: Map<number, CanvasRenderingContext2D | null> = new Map()
// for shape drawing
let startX = 0, startY = 0

async function load() {
  if (!bookId.value) return; loading.value = true
  const list = await window.lk.bookList()
  book.value = list.find((b: any) => b.id === bookId.value) || null
  bookmarks.value = await window.lk.bookmarkList(bookId.value)
  highlights.value = await window.lk.highlightList(bookId.value)
  const url = window.lk.bookUrl(bookId.value)
  pdfDoc = await pdfjsLib.getDocument({ url } as any).promise
  totalPages.value = pdfDoc.numPages
  if (book.value?.total_pages !== pdfDoc.numPages) await window.lk.bookUpdate(bookId.value, { total_pages: pdfDoc.numPages })
  if (book.value?.last_page) { page.value = Math.min(book.value.last_page, pdfDoc.numPages); pageInput.value = page.value }
  const raw = await pdfDoc.getOutline()
  outline.value = flattenOutline(raw)
  scrollMode.value = true
  await renderAll()
  loading.value = false
  setTimeout(() => scrollToPage(page.value), 300)
}

function flattenOutline(items: any[], depth=0): any[] {
  const out: any[] = []; if (!items) return out
  for (const it of items) { out.push({ title: it.title, dest: it.dest, depth }); if (it.items) out.push(...flattenOutline(it.items, depth+1)) }
  return out
}

async function goOutline(it: any) {
  if (!pdfDoc) return; let dest: any = it.dest
  if (typeof dest === 'string') dest = await pdfDoc.getDestination(dest)
  if (!dest?.[0]) return
  const idx = await pdfDoc.getPageIndex(dest[0]); page.value = idx+1; pageInput.value = page.value
  scrollToPage(page.value)
}

let renderToken = 0
let renderTimer: any = null
function debouncedRender(delay = 150) {
  if (renderTimer) clearTimeout(renderTimer)
  renderTimer = setTimeout(() => { renderAll(); renderTimer = null }, delay)
}

async function renderAll() {
  if (!pdfDoc || !pageHost.value) return
  const myToken = ++renderToken
  loading.value = true
  // remember scroll position so user doesn't jump to top after re-render
  const prevScroll = wrap.value!.scrollTop
  const prevHeight = wrap.value!.scrollHeight
  const scrollRatio = prevHeight > 0 ? prevScroll / prevHeight : 0

  const host = pageHost.value; host.innerHTML = ''
  annCtxs.clear()
  const cssW = wrap.value!.clientWidth - 40
  for (let pg = 1; pg <= totalPages.value; pg++) {
    if (myToken !== renderToken) return // cancelled by a newer render call
    const p = await pdfDoc.getPage(pg)
    const base = p.getViewport({ scale: 1 })
    const scale = Math.min(cssW / base.width, 1.5) * (zoom.value / 100)
    const vp = p.getViewport({ scale })
    const w = Math.round(vp.width), h = Math.round(vp.height)
    const container = document.createElement('div')
    container.className = 'page-container'
    container.style.cssText = `position:relative;margin:0 auto 8px;width:${w}px;height:${h}px;background:#fff;box-shadow:0 0 10px rgba(0,0,0,0.3)`

    const canvas = document.createElement('canvas')
    canvas.className = 'pdf-canvas'
    const dpr = window.devicePixelRatio || 1
    canvas.width = w * dpr; canvas.height = h * dpr
    canvas.style.cssText = `position:absolute;top:0;left:0;width:${w}px;height:${h}px`
    container.appendChild(canvas)
    const ctx = canvas.getContext('2d')!
    await p.render({ canvasContext: ctx, viewport: vp, transform: [dpr, 0, 0, dpr, 0, 0] } as any).promise
    if (myToken !== renderToken) return

    const annCanvas = document.createElement('canvas')
    annCanvas.className = 'ann-canvas'
    annCanvas.width = w; annCanvas.height = h
    annCanvas.style.cssText = `position:absolute;top:0;left:0;width:${w}px;height:${h}px;z-index:2`
    container.appendChild(annCanvas)
    const aCtx = annCanvas.getContext('2d')!
    annCtxs.set(pg, aCtx)
    if (annMode.value) {
      annCanvas.addEventListener('mousedown', (e) => onAnnMouseDown(e, pg, annCanvas))
      annCanvas.addEventListener('mousemove', (e) => onAnnMouseMove(e, pg, annCanvas))
      annCanvas.addEventListener('mouseup', () => onAnnMouseUp(pg))
      annCanvas.style.cursor = 'crosshair'
    }
    annCanvas.dataset.page = String(pg)
    host.appendChild(container)

    const pgHls = highlights.value.filter((hl: any) => hl.page === pg && hl.rect_x != null)
    for (const hl of pgHls) {
      if (!aCtx) continue
      const rx = hl.rect_x * w, ry = hl.rect_y * h, rw = hl.rect_w * w, rh = hl.rect_h * h
      aCtx.fillStyle = 'rgba(255,220,80,0.35)'; aCtx.fillRect(rx, ry, rw, rh)
    }
    renderAnnotations(pg, annData.get(pg) || [])
    // yield so input events still go through
    await new Promise((r) => setTimeout(r, 0))
  }
  // restore scroll proportionally
  const newHeight = wrap.value!.scrollHeight
  wrap.value!.scrollTop = scrollRatio * newHeight
  if (book.value) window.lk.bookUpdate(bookId.value!, { last_page: page.value })
  loading.value = false
}

function renderAnnotations(pg: number, rows: any[]) {
  const aCtx = annCtxs.get(pg)
  if (!aCtx || !rows) return
  for (const r of rows) {
    const d = JSON.parse(r.data || '{}')
    aCtx.save()
    if (r.type === 'pen') {
      aCtx.strokeStyle = d.color || annColor.value; aCtx.lineWidth = d.width || annWidth.value; aCtx.lineCap = 'round'
      aCtx.lineJoin = 'round'
      aCtx.beginPath()
      for (let i = 0; i < (d.points?.length || 0); i++) {
        const p2 = d.points[i]; i === 0 ? aCtx.moveTo(p2[0], p2[1]) : aCtx.lineTo(p2[0], p2[1])
      }
      aCtx.stroke()
    } else if (r.type === 'highlighter') {
      aCtx.strokeStyle = d.color || '#ffeb3b'; aCtx.globalAlpha = 0.35; aCtx.lineWidth = (d.width || 8) * 2
      aCtx.lineCap = 'round'; aCtx.beginPath()
      for (let i = 0; i < (d.points?.length || 0); i++) {
        const p2 = d.points[i]; i === 0 ? aCtx.moveTo(p2[0], p2[1]) : aCtx.lineTo(p2[0], p2[1])
      }
      aCtx.stroke(); aCtx.globalAlpha = 1
    } else if (r.type === 'rect') {
      aCtx.strokeStyle = d.color || annColor.value; aCtx.lineWidth = d.width || annWidth.value
      aCtx.strokeRect(d.x, d.y, d.w, d.h)
    } else if (r.type === 'circle') {
      aCtx.strokeStyle = d.color || annColor.value; aCtx.lineWidth = d.width || annWidth.value
      aCtx.beginPath(); aCtx.ellipse(d.x, d.y, d.rx, d.ry, 0, 0, Math.PI*2); aCtx.stroke()
    } else if (r.type === 'line') {
      aCtx.strokeStyle = d.color || annColor.value; aCtx.lineWidth = d.width || annWidth.value
      aCtx.beginPath(); aCtx.moveTo(d.x1, d.y1); aCtx.lineTo(d.x2, d.y2); aCtx.stroke()
    } else if (r.type === 'text') {
      aCtx.fillStyle = d.color || annColor.value; aCtx.font = `${d.fontSize || 16}px sans-serif`
      aCtx.fillText(d.text || '', d.x, d.y)
    }
    aCtx.restore()
  }
}

// annotation drawing handlers
let annPoints: number[][] = []
function redrawPageAnnotations(pg: number) {
  const aCtx = annCtxs.get(pg); if (!aCtx) return
  const rows = annData.get(pg) || []
  aCtx.clearRect(0, 0, aCtx.canvas.width, aCtx.canvas.height)
  renderAnnotations(pg, rows)
}
function onAnnMouseDown(e: MouseEvent, _pg: number, canvas: HTMLCanvasElement) {
  if (!annMode.value) return; drawing = true
  const rect = canvas.getBoundingClientRect()
  const x = (e.clientX - rect.left) * (canvas.width / rect.width)
  const y = (e.clientY - rect.top) * (canvas.height / rect.height)
  startX = x; startY = y
  annPoints = [[x, y]]
}
function onAnnMouseMove(e: MouseEvent, pg: number, canvas: HTMLCanvasElement) {
  if (!drawing || !annMode.value) return
  const rect = canvas.getBoundingClientRect()
  const x = (e.clientX - rect.left) * (canvas.width / rect.width)
  const y = (e.clientY - rect.top) * (canvas.height / rect.height)
  const aCtx = annCtxs.get(pg); if (!aCtx) return
  if (annTool.value === 'pen' || annTool.value === 'highlighter') {
    annPoints.push([x, y]); aCtx.save()
    aCtx.strokeStyle = annTool.value === 'highlighter' ? '#ffeb3b' : annColor.value
    aCtx.globalAlpha = annTool.value === 'highlighter' ? 0.35 : 1
    aCtx.lineWidth = annTool.value === 'highlighter' ? annWidth.value * 2 : annWidth.value
    aCtx.lineCap = 'round'; aCtx.lineJoin = 'round'
    aCtx.beginPath()
    for (let i = 0; i < annPoints.length; i++) { i === 0 ? aCtx.moveTo(annPoints[i][0], annPoints[i][1]) : aCtx.lineTo(annPoints[i][0], annPoints[i][1]) }
    aCtx.stroke(); aCtx.restore()
  } else if (annTool.value === 'eraser') {
    annPoints.push([x, y]); aCtx.save()
    aCtx.globalCompositeOperation = 'destination-out'; aCtx.lineWidth = annWidth.value * 3; aCtx.lineCap = 'round'
    aCtx.beginPath(); for (let i = 0; i < annPoints.length; i++) { i === 0 ? aCtx.moveTo(annPoints[i][0], annPoints[i][1]) : aCtx.lineTo(annPoints[i][0], annPoints[i][1]) }
    aCtx.stroke(); aCtx.restore()
  } else if (annTool.value === 'rect' || annTool.value === 'circle' || annTool.value === 'line') {
    // preview shape on a copy of the layer
    redrawPageAnnotations(pg)
    aCtx.save(); aCtx.strokeStyle = annColor.value; aCtx.lineWidth = annWidth.value
    if (annTool.value === 'rect') { const w2 = x - startX, h2 = y - startY; aCtx.strokeRect(startX, startY, w2, h2) }
    else if (annTool.value === 'circle') { const rx = Math.abs(x - startX) / 2, ry = Math.abs(y - startY) / 2; aCtx.beginPath(); aCtx.ellipse(startX + (x-startX)/2, startY + (y-startY)/2, rx||1, ry||1, 0, 0, Math.PI*2); aCtx.stroke() }
    else if (annTool.value === 'line') { aCtx.beginPath(); aCtx.moveTo(startX, startY); aCtx.lineTo(x, y); aCtx.stroke() }
    aCtx.restore()
  }
}
function onAnnMouseUp(pg: number) {
  if (!drawing || !annMode.value) return; drawing = false
  const aCtx = annCtxs.get(pg); if (!aCtx) return
  const c = annColor.value, w = annWidth.value
  if (annTool.value === 'pen' || annTool.value === 'highlighter') {
    window.lk.annSave({ bookId: bookId.value, page: pg, type: annTool.value, data: JSON.stringify({ color: c, width: w, points: annPoints }) }).catch(() => {})
  } else if (annTool.value === 'eraser') {
    window.lk.annSave({ bookId: bookId.value, page: pg, type: 'eraser', data: JSON.stringify({ points: annPoints }) }).catch(() => {})
    redrawPageAnnotations(pg)
  } else if (annTool.value === 'rect') {
    const w2 = (annPoints[0]?.[0] || startX) - startX, h2 = (annPoints[0]?.[1] || startY) - startY
    const x = w2 >= 0 ? startX : startX + w2, y = h2 >= 0 ? startY : startY + h2
    const aw = Math.abs(w2), ah = Math.abs(h2)
    window.lk.annSave({ bookId: bookId.value, page: pg, type: 'rect', data: JSON.stringify({ color: c, width: w, x, y, w: aw, h: ah }) }).catch(() => {})
    redrawPageAnnotations(pg)
  } else if (annTool.value === 'circle') {
    const dx = (annPoints[0]?.[0] || startX) - startX, dy = (annPoints[0]?.[1] || startY) - startY
    window.lk.annSave({ bookId: bookId.value, page: pg, type: 'circle', data: JSON.stringify({ color: c, width: w, x: startX + dx/2, y: startY + dy/2, rx: Math.abs(dx/2)||1, ry: Math.abs(dy/2)||1 }) }).catch(() => {})
    redrawPageAnnotations(pg)
  } else if (annTool.value === 'line') {
    const endX = annPoints[0]?.[0] || startX, endY = annPoints[0]?.[1] || startY
    window.lk.annSave({ bookId: bookId.value, page: pg, type: 'line', data: JSON.stringify({ color: c, width: w, x1: startX, y1: startY, x2: endX, y2: endY }) }).catch(() => {})
    redrawPageAnnotations(pg)
  }
  annPoints = []
}

function onWheel(e: WheelEvent) {
  // only handle wheel when inside this reader view
  if (!wrap.value || !wrap.value.contains(e.target as Node)) return
  if (e.ctrlKey) {
    e.preventDefault()
    zoom.value = Math.max(50, Math.min(300, zoom.value - Math.sign(e.deltaY) * 10))
    debouncedRender(80)
  }
  // when not ctrl, let native scroll happen normally
}

function scrollToPage(pg: number) {
  if (!wrap.value || !pageHost.value) return
  const containers = pageHost.value.querySelectorAll('.page-container')
  const target = containers[pg - 1] as HTMLElement | undefined
  if (!target) return
  const wrapTop = wrap.value.getBoundingClientRect().top
  const targetTop = target.getBoundingClientRect().top
  wrap.value.scrollTo({ top: wrap.value.scrollTop + (targetTop - wrapTop), behavior: 'smooth' })
}

function onPageInput(v: number | undefined) { if (!v) return; page.value = Math.max(1, Math.min(v, totalPages.value||1)); pageInput.value = page.value; scrollToPage(page.value) }

function goPage(p: number) { page.value = p; pageInput.value = p; scrollToPage(p) }

async function addBookmark() {
  await window.lk.bookmarkAdd({ bookId: bookId.value, page: page.value, label: `Page ${page.value}` })
  bookmarks.value = await window.lk.bookmarkList(bookId.value!); ElMessage.success('Bookmark added')
}
async function delBookmark(id: string) { await window.lk.bookmarkDelete(id); bookmarks.value = await window.lk.bookmarkList(bookId.value!) }

function onSelectionEnd(e: MouseEvent) {
  const sel = window.getSelection(); if (!sel) return
  const text = sel.toString().trim()
  if (!text || text.length < 2) { selPopup.value.show = false; return }
  const rect = wrap.value!.getBoundingClientRect()
  selPopup.value = { show: true, x: Math.min(e.clientX - rect.left, rect.width - 200), y: Math.max(40, e.clientY - rect.top - 50), text }
}

function askSel(prefix: string) { emit('ask-ai', { quote: selPopup.value.text, question: prefix, bookId: bookId.value!, page: page.value }); selPopup.value.show = false }
async function saveSel() {
  if (!selPopup.value.text) return
  const host = pageHost.value!
  const sel = window.getSelection(); let rectX: number|null = null, rectY: number|null = null, rectW: number|null = null, rectH: number|null = null
  if (sel && sel.rangeCount) { try { const r = sel.getRangeAt(0).getClientRects(); if (r.length) { const hR = host.getBoundingClientRect(); rectX = (r[0].left - hR.left) / hR.width; rectY = (r[0].top - hR.top) / hR.height; rectW = r[0].width / hR.width; rectH = r[0].height / hR.height } } catch {} }
  await window.lk.highlightAdd({ bookId: bookId.value, page: page.value, text: selPopup.value.text, color: 'yellow', rectX, rectY, rectW, rectH })
  highlights.value = await window.lk.highlightList(bookId.value!); selPopup.value.show = false; ElMessage.success('Highlighted')
}

function askHl(h: any) { emit('ask-ai', { quote: h.text, bookId: bookId.value!, page: h.page }) }
async function delHl(id: string) { await window.lk.highlightDelete(id); highlights.value = await window.lk.highlightList(bookId.value!) }

// annotation management
async function saveAllAnnotations() {
  if (!bookId.value) return
  for (let pg = 1; pg <= totalPages.value; pg++) {
    const rows = await window.lk.annList(bookId.value, pg)
    annData.set(pg, rows)
  }
  ElMessage.success('Annotations saved')
}

async function clearAllAnnotations() {
  if (!bookId.value) return
  await ElMessageBox.confirm('Clear all annotations?', 'Clear', { type: 'warning' })
  for (let pg = 1; pg <= totalPages.value; pg++) {
    await window.lk.annClear(bookId.value, pg)
    const aCtx = annCtxs.get(pg)
    if (aCtx) aCtx.clearRect(0, 0, aCtx.canvas.width, aCtx.canvas.height)
  }
  annData.clear(); ElMessage.success('All annotations cleared')
}

function deleteSelected() {
  // simplified: last annotation on current visible page
}

function onKey(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement) return
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); const val = page.value - 1; if (val >= 1) { page.value = val; pageInput.value = val; scrollToPage(val) } }
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); const val = page.value + 1; if (val <= totalPages.value) { page.value = val; pageInput.value = val; scrollToPage(val) } }
  if (e.key === 'Escape') selPopup.value.show = false
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
.side { width:260px; background:var(--bg-soft); border-right:1px solid var(--border); display:flex; flex-direction:column; flex-shrink:0; overflow:hidden; transition:width 0.2s; }
.side:not(.open) { width:0; min-width:0; border:none; padding:0; }
.side-tabs { display:flex; border-bottom:1px solid var(--border); flex-shrink:0; }
.side-tabs button { flex:1; padding:8px; border:none; background:transparent; color:var(--text-dim); cursor:pointer; &.active { color:var(--accent); border-bottom:2px solid var(--accent) } }
.side-body { flex:1; overflow:auto; padding:8px 10px; font-size:13px; }
.toc-item { padding:4px 6px; cursor:pointer; border-radius:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; &:hover { background:rgba(127,127,127,0.12) } }
.mark { display:flex; gap:4px; align-items:center; padding:4px 0; border-bottom:1px dashed var(--border); cursor:pointer; }
.hl { padding:6px 4px; border-left:2px solid #d4b469; margin-bottom:6px; }
.hl-text { font-size:12px; max-height:60px; overflow:hidden; }
.main { flex:1; display:flex; flex-direction:column; min-width:0; }
.ctrl { height:38px; flex:0 0 38px; display:flex; align-items:center; gap:6px; padding:0 12px; background:var(--bg-soft); border-bottom:1px solid var(--border); }
.title { font-weight:600; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.spacer { flex:1; }
.ann-toolbar { display:flex; align-items:center; gap:4px; padding:4px 12px; background:var(--bg-soft); border-bottom:1px solid var(--border); flex-wrap:wrap; font-size:12px; }
.canvas-wrap { flex:1; overflow-y:scroll; overflow-x:hidden; padding:14px 0 60px; background:#3b3b3b; position:relative; }
.canvas-wrap::-webkit-scrollbar { width:10px; }
.canvas-wrap::-webkit-scrollbar-thumb { background:var(--accent); border-radius:5px; }
.canvas-wrap::-webkit-scrollbar-track { background:var(--bg); }
.page-host { margin:0 auto; }
.loading { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:var(--text-dim); }
.sel-popup { position:absolute; z-index:30; display:flex; gap:4px; background:var(--bg-elev); border:1px solid var(--border); border-radius:6px; padding:4px; box-shadow:var(--shadow); }
.sel-popup button { border:none; background:transparent; color:var(--text); padding:4px 8px; border-radius:4px; cursor:pointer; &:hover { background:var(--accent); color:#fff } }
</style>