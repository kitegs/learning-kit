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
            <span class="hl-dot-sm" :style="{ background: HL_COLORS[h.color] || HL_COLORS.yellow }"></span>
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
        <span class="zoom-lbl">{{ zoom }}%</span>
        <el-button size="small" @click="fitZoom">Fit</el-button>
        <el-button size="small" @click="resetView">Reset</el-button>
        <el-button v-if="panX!==0||panY!==0" size="small" type="warning" @click="recenterPage">Center</el-button>
        <el-button size="small" :type="annMode?'primary':'default'" @click="annMode=!annMode;renderPage()">Annotate</el-button>
        <el-button size="small" type="success" @click="refOpen=true">引用</el-button>
      </div>
      <div v-if="annMode" class="ann-toolbar">
        <el-button-group size="small">
          <el-button :type="annTool==='pen'?'primary':'default'" @click="annTool='pen'">画笔</el-button>
          <el-button :type="annTool==='highlighter'?'primary':'default'" @click="annTool='highlighter'">荧光笔</el-button>
          <el-button :type="annTool==='rect'?'primary':'default'" @click="annTool='rect'">矩形</el-button>
          <el-button :type="annTool==='circle'?'primary':'default'" @click="annTool='circle'">圆形</el-button>
          <el-button :type="annTool==='line'?'primary':'default'" @click="annTool='line'">直线</el-button>
          <el-button :type="annTool==='eraser'?'primary':'default'" title="点击要删除的图形">橡皮擦</el-button>
          <el-button :type="annTool==='sticky'?'primary':'default'" @click="annTool='sticky'">便签</el-button>
        </el-button-group>
        <el-color-picker v-model="annColor" size="small" style="margin-left:6px" />
        <el-slider v-model="annWidth" :min="1" :max="12" :step="0.5" style="width:80px;margin-left:6px" />
        <el-button size="small" @click="clearPageAnnotations">清除本页批注</el-button>
      </div>
      <div class="canvas-wrap" ref="wrap"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @contextmenu.prevent="onContextMenu"
        @wheel="onWheel"
        @mouseup="onSelectionEnd"
      >
        <div ref="pageHost" class="page-host"></div>
        <div v-if="loading" class="loading">Loading page {{ page }}...</div>
        <div v-if="dragHint" class="drag-hint">{{ dragHint }}</div>
      </div>
    </div>
    <div v-if="selPopup.show" class="sel-popup" :style="{ top: selPopup.y+'px', left: selPopup.x+'px' }">
      <button @click="copySelection">Copy</button>
      <div class="hl-colors">
        <button v-for="c in ['yellow','green','blue','pink']" :key="c" class="hl-dot" :class="{active: hlColor===c}" :style="{ background: HL_COLORS[c] }" @click="hlColor=c as any" :title="c"></button>
      </div>
      <button @click="saveSel">Highlight</button>
      <div class="ai-dd">
        <button @click="aiMenuOpen=!aiMenuOpen">AI &#9662;</button>
        <div v-if="aiMenuOpen" class="ai-menu">
          <button @click="askSel('Analyze this passage in detail')">Analyze</button>
          <button @click="askSel('Summarize the key points')">Summarize</button>
          <button @click="askSel('Translate this to Chinese and explain key terms')">Translate</button>
        </div>
      </div>
    </div>
    <!-- highlight action bar (click on existing highlight) -->
    <div v-if="hlActionBar.show" class="hl-action-bar" :style="{ top: hlActionBar.y+'px', left: hlActionBar.x+'px' }">
      <button @click="hlActionCopy">Copy</button>
      <button @click="hlActionAI">AI</button>
      <div class="hl-colors">
        <button v-for="c in ['yellow','green','blue','pink']" :key="c" class="hl-dot" :class="{active: hlActionBar.color===c}" :style="{ background: HL_COLORS[c] }" @click="hlActionColor(c)" :title="c"></button>
      </div>
      <button class="danger" @click="hlActionDelete">Del</button>
    </div>
  </div>
  <Teleport to="body">
    <EbookRefPanel :visible="refOpen" :items="outline" :total-pages="totalPages" :current-page="page" @close="refOpen=false" @confirm="handleRef" />
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useContextMenu } from '../stores/context-menu'
import EbookRefPanel from '../components/EbookRefPanel.vue'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const props = defineProps<{ bookIdProp: string | null; jumpPage?: number | null }>()
const emit = defineEmits<{ (e: 'back'): void; (e: 'ask-ai', p: { quote: string; question?: string; bookId: string; page: number }): void }>()
const menu = useContextMenu()

// ── state ──
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
const annTool = ref<'pen'|'highlighter'|'rect'|'circle'|'line'|'eraser'|'sticky'>('pen')
const annColor = ref('#ffeb3b')
const annWidth = ref(3)
const selPopup = ref({ show: false, x: 0, y: 0, text: '', rectX: null as number|null, rectY: null as number|null, rectW: null as number|null, rectH: null as number|null })
const aiMenuOpen = ref(false)
const refOpen = ref(false)
const dragHint = ref<string|null>(null)
const hlColor = ref<'yellow'|'green'|'blue'|'pink'>('yellow')
const hlActionBar = ref({ show: false, x: 0, y: 0, id: '', text: '', color: '' })

const HL_COLORS: Record<string, string> = {
  yellow: 'rgba(255,220,80,0.35)',
  green: 'rgba(120,220,120,0.35)',
  blue: 'rgba(120,180,255,0.35)',
  pink: 'rgba(255,140,180,0.35)',
}

// pan state (middle-mouse / space+left free page move)
const panX = ref(0)
const panY = ref(0)
let isPanning = false
let panSX = 0, panSY = 0, panSPX = 0, panSPY = 0
let spaceHeld = false
let lastMidClick = 0

// unified drag state
type DragAct = 'none'|'pan'|'annotate'|'edge-flip'|'select'
let curAct: DragAct = 'none'
let edgeSX = 0, edgeDir: 'l'|'r' = 'l'

// annotation state
let pdfDoc: any = null
let annCtx: CanvasRenderingContext2D|null = null
let annCanvas: HTMLCanvasElement|null = null
let drawing = false
let aSX = 0, aSY = 0
let annPts: number[][] = []

// apply pan transform reactively
watch([panX, panY], () => {
  const c = pageHost.value?.querySelector('.page-container') as HTMLElement
  if (c) c.style.transform = `translate(${panX.value}px, ${panY.value}px)`
})

// ── lifecycle ──
async function load() {
  if (!bookId.value) return
  loading.value = true
  const list = await window.lk.bookList()
  book.value = list.find((b: any) => b.id === bookId.value) || null
  bookmarks.value = await window.lk.bookmarkList(bookId.value)
  highlights.value = await window.lk.highlightList(bookId.value)
  pdfDoc = await pdfjsLib.getDocument({ url: window.lk.bookUrl(bookId.value) } as any).promise
  totalPages.value = pdfDoc.numPages
  if (book.value?.total_pages !== pdfDoc.numPages) await window.lk.bookUpdate(bookId.value, { total_pages: pdfDoc.numPages })
  if (props.jumpPage) page.value = Math.min(Math.max(1, props.jumpPage), pdfDoc.numPages)
  else if (book.value?.last_page) page.value = Math.min(book.value.last_page, pdfDoc.numPages)
  outline.value = flattenOutline(await pdfDoc.getOutline())
  loading.value = false
  await renderPage()
}

function flattenOutline(items: any[], depth = 0): any[] {
  const out: any[] = []; if (!items) return out
  for (const it of items) { out.push({ title: it.title, dest: it.dest, depth }); if (it.items) out.push(...flattenOutline(it.items, depth + 1)) }
  return out
}

async function renderPage() {
  if (!pdfDoc || !pageHost.value) return
  loading.value = true
  const host = pageHost.value; host.innerHTML = ''
  const p = await pdfDoc.getPage(page.value)
  const cssW = wrap.value!.clientWidth - 40
  const base = p.getViewport({ scale: 1 })
  const scale = Math.min(cssW / base.width, 1.2) * (zoom.value / 100)
  const vp = p.getViewport({ scale })
  const w = Math.round(vp.width), h = Math.round(vp.height)
  const dpr = window.devicePixelRatio || 1

  const container = document.createElement('div')
  container.className = 'page-container'
  container.style.cssText = `position:relative;margin:0 auto;width:${w}px;min-height:${h}px;background:#fff;box-shadow:0 0 10px rgba(0,0,0,0.3);transform:translate(${panX.value}px,${panY.value}px)`

  const canvas = document.createElement('canvas')
  canvas.width = w * dpr; canvas.height = h * dpr
  canvas.style.cssText = `position:absolute;top:0;left:0;width:${w}px;height:${h}px`
  container.appendChild(canvas)
  const ctx = canvas.getContext('2d')!
  await p.render({ canvasContext: ctx, viewport: vp, transform: [dpr, 0, 0, dpr, 0, 0] } as any).promise

  // text layer (transparent, selectable)
  const textLayerDiv = document.createElement('div')
  textLayerDiv.className = 'textLayer'
  textLayerDiv.style.cssText = `position:absolute;top:0;left:0;width:${w}px;height:${h}px;z-index:2;overflow:hidden`
  container.appendChild(textLayerDiv)
  try {
    const textContent = await p.getTextContent()
    const tl = new (pdfjsLib as any).TextLayer({ textContentSource: textContent, container: textLayerDiv, viewport: vp })
    await tl.render()
  } catch { /* text layer optional */ }
  // in annotate mode, text layer should not capture events
  if (annMode.value) textLayerDiv.style.pointerEvents = 'none'

  // annotation overlay
  annCanvas = document.createElement('canvas')
  annCanvas.width = w; annCanvas.height = h
  annCanvas.style.cssText = `position:absolute;top:0;left:0;width:${w}px;height:${h}px;z-index:3`
  container.appendChild(annCanvas)
  annCtx = annCanvas.getContext('2d')!
  if (annMode.value) {
    annCanvas.addEventListener('mousedown', onAnnMouseDown)
    annCanvas.addEventListener('mousemove', onAnnMouseMove)
    annCanvas.addEventListener('mouseup', onAnnMouseUp)
    annCanvas.addEventListener('mouseleave', onAnnMouseUp)
    annCanvas.style.cursor = 'crosshair'
  } else {
    // in reading mode, annotation canvas should not block text selection
    annCanvas.style.pointerEvents = 'none'
  }
  host.appendChild(container)

  // text highlights
  if (annCtx) {
    for (const hl of highlights.value.filter((x: any) => x.page === page.value && x.rect_x != null)) {
      annCtx.fillStyle = HL_COLORS[hl.color] || HL_COLORS.yellow
      annCtx.fillRect(hl.rect_x * w, hl.rect_y * h, hl.rect_w * w, hl.rect_h * h)
    }
  }

  // annotations from DB
  const rows = await window.lk.annList(bookId.value!, page.value)
  renderAnnotations(rows)

  // sticky notes as HTML
  for (const sr of rows.filter((r: any) => r.type === 'sticky')) {
    const d = JSON.parse(sr.data || '{}')
    const div = document.createElement('div')
    div.className = 'sticky-note'
    div.style.cssText = `position:absolute;left:${d.x}px;top:${d.y}px;width:${d.w || 130}px;min-height:40px;background:${d.color || '#fff9c4'};border:1px solid #d4b469;border-radius:4px;z-index:10;box-shadow:2px 2px 6px rgba(0,0,0,0.15);font-size:12px`
    div.dataset.annId = sr.id
    // drag handle bar
    const bar = document.createElement('div')
    bar.className = 'sticky-bar'
    bar.style.cssText = 'cursor:move;display:flex;justify-content:space-between;align-items:center;padding:1px 4px;background:rgba(0,0,0,0.06);border-radius:4px 4px 0 0'
    const dot = document.createElement('span'); dot.textContent = '⋮⋮'; dot.style.cssText = 'font-size:10px;color:#999;cursor:move'
    const del = document.createElement('button'); del.textContent = '×'; del.style.cssText = 'border:none;background:none;cursor:pointer;font-size:13px;color:#999;line-height:1'
    del.addEventListener('click', (ev) => { ev.stopPropagation(); window.lk.annDelete(sr.id).then(() => renderPage()) })
    bar.appendChild(dot); bar.appendChild(del)
    // drag via title bar (left button only)
    bar.addEventListener('mousedown', (ev) => {
      if (ev.button !== 0) return
      ev.stopPropagation()
      const sx = ev.clientX, sy = ev.clientY
      const ox = parseFloat(div.style.left), oy = parseFloat(div.style.top)
      const mv = (me: MouseEvent) => { div.style.left = (ox + me.clientX - sx) + 'px'; div.style.top = (oy + me.clientY - sy) + 'px' }
      const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); window.lk.annSave({ id: sr.id, bookId: bookId.value, page: page.value, type: 'sticky', data: JSON.stringify({ ...d, x: parseFloat(div.style.left), y: parseFloat(div.style.top) }) }) }
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
    })
    const ta = document.createElement('textarea')
    ta.value = d.text || ''
    ta.style.cssText = 'width:100%;border:none;outline:none;background:transparent;font-size:12px;resize:vertical;min-height:28px;padding:2px 4px'
    ta.addEventListener('change', () => { window.lk.annSave({ id: sr.id, bookId: bookId.value, page: page.value, type: 'sticky', data: JSON.stringify({ ...d, text: ta.value }) }) })
    ta.addEventListener('mousedown', (ev) => ev.stopPropagation()) // don't drag sticky when editing text
    div.appendChild(bar); div.appendChild(ta)
    container.appendChild(div)
  }

  window.lk.bookUpdate(bookId.value!, { last_page: page.value })
  loading.value = false
}

function renderAnnotations(rows: any[]) {
  if (!annCtx) return
  for (const r of rows) {
    if (r.type === 'sticky') continue
    const d = JSON.parse(r.data || '{}')
    annCtx.save()
    if (r.type === 'pen') {
      annCtx.strokeStyle = d.color || annColor.value; annCtx.lineWidth = d.width || annWidth.value; annCtx.lineCap = 'round'; annCtx.lineJoin = 'round'
      annCtx.beginPath(); for (let i = 0; i < (d.points?.length || 0); i++) { const pt = d.points[i]; i === 0 ? annCtx.moveTo(pt[0], pt[1]) : annCtx.lineTo(pt[0], pt[1]) }; annCtx.stroke()
    } else if (r.type === 'highlighter') {
      annCtx.strokeStyle = d.color || '#ffeb3b'; annCtx.globalAlpha = 0.35; annCtx.lineWidth = (d.width || 8) * 2; annCtx.lineCap = 'round'
      annCtx.beginPath(); for (let i = 0; i < (d.points?.length || 0); i++) { const pt = d.points[i]; i === 0 ? annCtx.moveTo(pt[0], pt[1]) : annCtx.lineTo(pt[0], pt[1]) }; annCtx.stroke(); annCtx.globalAlpha = 1
    } else if (r.type === 'rect') { annCtx.strokeStyle = d.color || annColor.value; annCtx.lineWidth = d.width || annWidth.value; annCtx.strokeRect(d.x, d.y, d.w, d.h) }
    else if (r.type === 'circle') { annCtx.strokeStyle = d.color || annColor.value; annCtx.lineWidth = d.width || annWidth.value; annCtx.beginPath(); annCtx.ellipse(d.x, d.y, d.rx, d.ry, 0, 0, Math.PI * 2); annCtx.stroke() }
    else if (r.type === 'line') { annCtx.strokeStyle = d.color || annColor.value; annCtx.lineWidth = d.width || annWidth.value; annCtx.beginPath(); annCtx.moveTo(d.x1, d.y1); annCtx.lineTo(d.x2, d.y2); annCtx.stroke() }
    annCtx.restore()
  }
}

// ── navigation ──
function prevPage() { if (page.value > 1) { page.value--; renderPage() } }
function nextPage() { if (page.value < totalPages.value) { page.value++; renderPage() } }
function goPage(p: number) { page.value = p; panX.value = 0; panY.value = 0; renderPage() }
async function goOutline(it: any) {
  if (!pdfDoc) return; let dest: any = it.dest
  if (typeof dest === 'string') dest = await pdfDoc.getDestination(dest)
  if (!dest?.[0]) return
  page.value = (await pdfDoc.getPageIndex(dest[0])) + 1
  panX.value = 0; panY.value = 0; renderPage()
}
function fitZoom() { zoom.value = 100; panX.value = 0; panY.value = 0; renderPage() }
function resetView() { page.value = 1; zoom.value = 100; panX.value = 0; panY.value = 0; renderPage(); wrap.value?.scrollTo({ top: 0 }) }

// ── pan (middle-mouse / space+left) ──
function startPan(e: PointerEvent) {
  isPanning = true
  panSX = e.clientX; panSY = e.clientY; panSPX = panX.value; panSPY = panY.value
  wrap.value?.setPointerCapture(e.pointerId)
  if (wrap.value) wrap.value.style.cursor = 'grabbing'
}
function movePan(e: PointerEvent) {
  if (!isPanning) return
  panX.value = panSPX + (e.clientX - panSX)
  panY.value = panSPY + (e.clientY - panSY)
  clampPan()
}
function endPan() {
  isPanning = false
  if (wrap.value) wrap.value.style.cursor = ''
}
function clampPan() {
  if (!wrap.value || !pageHost.value) return
  const c = pageHost.value.querySelector('.page-container') as HTMLElement
  if (!c) return
  const wr = wrap.value.getBoundingClientRect()
  // temporarily remove transform to get natural position
  const oldT = c.style.transform; c.style.transform = ''
  const nr = c.getBoundingClientRect(); c.style.transform = oldT
  const pw = nr.width, ph = nr.height, minV = 120
  const nL = nr.left - wr.left, nT = nr.top - wr.top
  panX.value = Math.max(minV - nL - pw, Math.min(wr.width - minV - nL, panX.value))
  panY.value = Math.max(minV - nT - ph, Math.min(wr.height - minV - nT, panY.value))
}
function recenterPage() {
  const sx = panX.value, sy = panY.value, t0 = performance.now()
  function anim(t: number) {
    const p = Math.min(1, (t - t0) / 200), e = p * (2 - p)
    panX.value = sx * (1 - e); panY.value = sy * (1 - e)
    if (p < 1) requestAnimationFrame(anim)
  }
  requestAnimationFrame(anim)
}

// ── unified pointer handler ──
function onPointerDown(e: PointerEvent) {
  // middle button → always pan (highest priority)
  if (e.button === 1) {
    const now = Date.now()
    if (now - lastMidClick < 300) { recenterPage(); lastMidClick = 0; return }
    lastMidClick = now
    startPan(e); curAct = 'pan'; return
  }
  // left button
  if (e.button === 0) {
    // space held → pan equivalent
    if (spaceHeld) { startPan(e); curAct = 'pan'; return }
    // annotate mode → draw (handled by annCanvas listeners)
    if (annMode.value) { curAct = 'annotate'; return }
    // edge strips → flip drag
    const wr = wrap.value!.getBoundingClientRect()
    const x = e.clientX - wr.left
    if (x < 24) { curAct = 'edge-flip'; edgeSX = e.clientX; edgeDir = 'l'; dragHint.value = '< drag to prev'; return }
    if (x > wr.width - 24) { curAct = 'edge-flip'; edgeSX = e.clientX; edgeDir = 'r'; dragHint.value = 'drag to next >'; return }
    // otherwise → text selection (browser default)
    curAct = 'select'
  }
}
function onPointerMove(e: PointerEvent) {
  if (curAct === 'pan') { movePan(e); return }
  if (curAct === 'edge-flip') {
    const dx = e.clientX - edgeSX
    if (edgeDir === 'l') dragHint.value = dx < -60 ? 'Release → prev' : `< ${Math.abs(Math.round(dx))}/60`
    else dragHint.value = dx > 60 ? 'Release → next' : `${Math.round(dx)}/60 >`
  }
}
function onPointerUp(e: PointerEvent) {
  if (curAct === 'pan') { endPan(); curAct = 'none'; return }
  if (curAct === 'edge-flip') {
    const dx = e.clientX - edgeSX
    if (edgeDir === 'l' && dx < -60) prevPage()
    if (edgeDir === 'r' && dx > 60) nextPage()
    dragHint.value = null; curAct = 'none'; return
  }
  curAct = 'none'
}

// ── annotation drawing ──
function onAnnMouseDown(e: MouseEvent) {
  if (!annMode.value || !annCanvas) return
  const rect = annCanvas.getBoundingClientRect()
  const x = (e.clientX - rect.left) * (annCanvas.width / rect.width)
  const y = (e.clientY - rect.top) * (annCanvas.height / rect.height)
  if (annTool.value === 'sticky') {
    window.lk.annSave({ bookId: bookId.value, page: page.value, type: 'sticky', data: JSON.stringify({ x, y, w: 130, h: 60, text: '', color: '#fff9c4' }) }).then(() => renderPage())
    return
  }
  if (annTool.value === 'eraser') {
    eraseAnnotationAt(x, y)
    return
  }
  drawing = true; aSX = x; aSY = y; annPts = [[x, y]]
}
function onAnnMouseMove(e: MouseEvent) {
  if (!drawing || !annMode.value || !annCanvas || !annCtx) return
  const rect = annCanvas.getBoundingClientRect()
  const x = (e.clientX - rect.left) * (annCanvas.width / rect.width)
  const y = (e.clientY - rect.top) * (annCanvas.height / rect.height)
  if (annTool.value === 'pen' || annTool.value === 'highlighter') {
    annPts.push([x, y]); annCtx.save()
    annCtx.strokeStyle = annTool.value === 'highlighter' ? '#ffeb3b' : annColor.value
    annCtx.globalAlpha = annTool.value === 'highlighter' ? 0.35 : 1
    annCtx.lineWidth = annTool.value === 'highlighter' ? annWidth.value * 2 : annWidth.value
    annCtx.lineCap = 'round'; annCtx.lineJoin = 'round'; annCtx.beginPath()
    for (let i = 0; i < annPts.length; i++) { i === 0 ? annCtx.moveTo(annPts[i][0], annPts[i][1]) : annCtx.lineTo(annPts[i][0], annPts[i][1]) }
    annCtx.stroke(); annCtx.restore()
  } else if (annTool.value === 'rect' || annTool.value === 'circle' || annTool.value === 'line') {
    annPts[1] = [x, y]
    window.lk.annList(bookId.value!, page.value).then((rows) => { if (annCtx) { annCtx.clearRect(0, 0, annCtx.canvas.width, annCtx.canvas.height); renderAnnotations(rows) } })
    annCtx.save(); annCtx.strokeStyle = annColor.value; annCtx.lineWidth = annWidth.value
    if (annTool.value === 'rect') annCtx.strokeRect(aSX, aSY, x - aSX, y - aSY)
    else if (annTool.value === 'circle') { const rx = Math.abs(x - aSX) / 2, ry = Math.abs(y - aSY) / 2; annCtx.beginPath(); annCtx.ellipse(aSX + (x - aSX) / 2, aSY + (y - aSY) / 2, rx || 1, ry || 1, 0, 0, Math.PI * 2); annCtx.stroke() }
    else if (annTool.value === 'line') { annCtx.beginPath(); annCtx.moveTo(aSX, aSY); annCtx.lineTo(x, y); annCtx.stroke() }
    annCtx.restore()
  }
}
function onAnnMouseUp(e: MouseEvent) {
  if (!drawing || !annMode.value) return; drawing = false
  if (annCanvas && (annTool.value === 'rect' || annTool.value === 'circle' || annTool.value === 'line')) {
    const rect = annCanvas.getBoundingClientRect()
    annPts[1] = [(e.clientX - rect.left) * (annCanvas.width / rect.width), (e.clientY - rect.top) * (annCanvas.height / rect.height)]
  }
  const c = annColor.value, w = annWidth.value
  const last = annPts[annPts.length - 1] || [aSX, aSY]
  if (annTool.value === 'pen' || annTool.value === 'highlighter') {
    window.lk.annSave({ bookId: bookId.value, page: page.value, type: annTool.value, data: JSON.stringify({ color: c, width: w, points: annPts }) })
  } else if (annTool.value === 'rect') {
    const x = Math.min(aSX, last[0]), y = Math.min(aSY, last[1])
    window.lk.annSave({ bookId: bookId.value, page: page.value, type: 'rect', data: JSON.stringify({ color: c, width: w, x, y, w: Math.abs(last[0] - aSX), h: Math.abs(last[1] - aSY) }) }).then(() => window.lk.annList(bookId.value!, page.value).then(renderAnnotations))
  } else if (annTool.value === 'circle') {
    const dx = last[0] - aSX, dy = last[1] - aSY
    window.lk.annSave({ bookId: bookId.value, page: page.value, type: 'circle', data: JSON.stringify({ color: c, width: w, x: aSX + dx / 2, y: aSY + dy / 2, rx: Math.abs(dx / 2) || 1, ry: Math.abs(dy / 2) || 1 }) }).then(() => window.lk.annList(bookId.value!, page.value).then(renderAnnotations))
  } else if (annTool.value === 'line') {
    window.lk.annSave({ bookId: bookId.value, page: page.value, type: 'line', data: JSON.stringify({ color: c, width: w, x1: aSX, y1: aSY, x2: last[0], y2: last[1] }) }).then(() => window.lk.annList(bookId.value!, page.value).then(renderAnnotations))
  }
  annPts = []
}

async function clearPageAnnotations() {
  await ElMessageBox.confirm('确定清除本页所有手绘批注和便签吗？', '清除本页批注', { type: 'warning' })
  await window.lk.annClear(bookId.value!, page.value)
  renderPage()
}

function distToSegment(x: number, y: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1
  const t = dx || dy ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy))) : 0
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
}
function annotationHit(row: any, x: number, y: number) {
  let d: any
  try { d = JSON.parse(row.data || '{}') } catch { return false }
  const tolerance = Math.max(10, (d.width || annWidth.value) * 3)
  if (row.type === 'pen' || row.type === 'highlighter') {
    const pts = d.points || []
    return pts.some((p: number[], index: number) => index > 0 && distToSegment(x, y, pts[index - 1][0], pts[index - 1][1], p[0], p[1]) <= tolerance)
  }
  if (row.type === 'line') return distToSegment(x, y, d.x1, d.y1, d.x2, d.y2) <= tolerance
  if (row.type === 'rect') return x >= d.x - tolerance && x <= d.x + d.w + tolerance && y >= d.y - tolerance && y <= d.y + d.h + tolerance
  if (row.type === 'circle') { const rx = Math.max(1, d.rx), ry = Math.max(1, d.ry); return Math.abs(Math.hypot((x - d.x) / rx, (y - d.y) / ry) - 1) <= tolerance / Math.max(rx, ry) }
  return false
}
async function eraseAnnotationAt(x: number, y: number) {
  const rows = await window.lk.annList(bookId.value!, page.value)
  const hit = [...rows].reverse().find((row: any) => annotationHit(row, x, y))
  if (!hit) { ElMessage.info('未选中批注，请点击线条或图形边缘'); return }
  await window.lk.annDelete(hit.id)
  await renderPage()
}

// ── context menus (A / B / C) ──
function onContextMenu(e: MouseEvent) {
  const sel = window.getSelection()
  const hasSel = sel && sel.toString().trim().length > 0
  const target = e.target as HTMLElement
  const stickyEl = target.closest('.sticky-note') as HTMLElement | null

  if (hasSel) { showMenuB(e); return }
  if (stickyEl) { showMenuC(e, stickyEl); return }
  showMenuA(e)
}

function showMenuA(e: MouseEvent) {
  const items: any[] = [
    { label: '在此添加便签', icon: 'EditPen' as any, action: () => addStickyAt(e) },
    { label: '询问 AI：本页内容', icon: 'ChatDotRound' as any, action: () => emit('ask-ai', { quote: `(第 ${page.value} 页)`, question: '请概述这一页的内容。', bookId: bookId.value!, page: page.value }) },
    { label: '添加书签', icon: 'Star' as any, action: addBookmark },
    { separator: true },
    { label: annMode.value ? '退出批注模式' : '进入批注模式', icon: 'Edit' as any, action: () => { annMode.value = !annMode.value; renderPage() } },
    { label: '清除本页批注', icon: 'Delete' as any, danger: true, action: clearPageAnnotations },
    { separator: true },
  ]
  if (panX.value !== 0 || panY.value !== 0) items.push({ label: '页面居中', icon: 'Aim' as any, action: recenterPage })
  items.push({ label: '适应宽度', icon: 'FullScreen' as any, action: fitZoom })
  items.push({ label: '重置视图', icon: 'RefreshLeft' as any, action: resetView })
  menu.open(e, items)
}

function showMenuB(e: MouseEvent) {
  const text = window.getSelection()?.toString().trim() || ''
  selPopup.value.show = false
  // capture rect for highlight
  let rx: number|null = null, ry: number|null = null, rw: number|null = null, rh: number|null = null
  const container = pageHost.value?.querySelector('.page-container') as HTMLElement
  const sel = window.getSelection()
  if (container && sel && sel.rangeCount) {
    try {
      const rects = sel.getRangeAt(0).getClientRects()
      if (rects.length) { const cr = container.getBoundingClientRect(); const r = rects[0]; rx = (r.left-cr.left)/cr.width; ry = (r.top-cr.top)/cr.height; rw = r.width/cr.width; rh = r.height/cr.height }
    } catch {}
  }
  menu.open(e, [
    { label: '复制', icon: 'CopyDocument' as any, action: () => { navigator.clipboard.writeText(text); ElMessage.success('已复制') } },
    { label: '添加划线', icon: 'EditPen' as any, children: [
      { label: '黄色', icon: 'Sunny' as any, action: () => saveSelText(text, rx, ry, rw, rh) },
      { label: '绿色', icon: 'Sunny' as any, action: () => { hlColor.value='green'; saveSelText(text, rx, ry, rw, rh); hlColor.value='yellow' } },
      { label: '蓝色', icon: 'Sunny' as any, action: () => { hlColor.value='blue'; saveSelText(text, rx, ry, rw, rh); hlColor.value='yellow' } },
      { label: '粉色', icon: 'Sunny' as any, action: () => { hlColor.value='pink'; saveSelText(text, rx, ry, rw, rh); hlColor.value='yellow' } },
    ]},
    { label: '询问 AI', icon: 'ChatDotRound' as any, action: () => emit('ask-ai', { quote: text, question: '请分析这段内容。', bookId: bookId.value!, page: page.value }) },
    { label: '生成闪卡', icon: 'Plus' as any, action: () => makeCardFromSelection(text) },
    { separator: true },
    { label: '添加引用便签', icon: 'EditPen' as any, action: () => addStickyAt(e, text) },
    { label: '添加书签', icon: 'Star' as any, action: addBookmark },
  ])
}

async function makeCardFromSelection(text: string) {
  if (!text || !bookId.value) { ElMessage.warning('请先选中一段电子书文字'); return }
  let decks = await window.lk.deckList()
  if (!decks.length) {
    await window.lk.deckUpsert({ id: await window.lk.uuid(), title: '默认牌组', sort: 0 })
    decks = await window.lk.deckList()
  }
  const front = `请解释《${book.value?.title || '电子书'}》第 ${page.value} 页的这段内容：\n${text.slice(0, 240)}`
  await window.lk.srsFromSource(decks[0].id, front, text.slice(0, 1000), 'book', bookId.value)
  ElMessage.success('已生成闪卡，可从复习卡跳回本书')
}

function showMenuC(e: MouseEvent, stickyEl: HTMLElement) {
  const annId = stickyEl.dataset.annId || ''
  const colors = ['#fff9c4', '#c8e6c9', '#bbdefb', '#f8bbd0']
  const colorLabels = ['黄色', '绿色', '蓝色', '粉色']
  menu.open(e, [
    ...colors.map((c, i) => ({ label: colorLabels[i], icon: 'CircleCheck' as any, action: () => changeStickyColor(annId, c) })),
    { separator: true },
    { label: '复制便签', icon: 'CopyDocument' as any, action: () => duplicateSticky(annId, stickyEl) },
    { label: '询问 AI：此便签', icon: 'ChatDotRound' as any, action: () => {
      const ta = stickyEl.querySelector('textarea')
      emit('ask-ai', { quote: ta?.value || '', question: 'Explain this note', bookId: bookId.value!, page: page.value })
    }},
    { separator: true },
    { label: '删除', icon: 'Delete' as any, danger: true, action: () => { window.lk.annDelete(annId).then(() => renderPage()) } },
  ])
}

async function addStickyAt(e: MouseEvent, prefillText?: string) {
  const c = pageHost.value?.querySelector('.page-container') as HTMLElement
  if (!c) return
  const cr = c.getBoundingClientRect()
  const x = e.clientX - cr.left, y = e.clientY - cr.top
  await window.lk.annSave({ bookId: bookId.value, page: page.value, type: 'sticky', data: JSON.stringify({ x, y, w: 130, h: 60, text: prefillText || '', color: '#fff9c4' }) })
  renderPage()
}

async function changeStickyColor(annId: string, color: string) {
  const rows = await window.lk.annList(bookId.value!, page.value)
  const r = rows.find((x: any) => x.id === annId)
  if (!r) return
  const d = JSON.parse(r.data || '{}')
  await window.lk.annSave({ id: annId, bookId: bookId.value, page: page.value, type: 'sticky', data: JSON.stringify({ ...d, color }) })
  renderPage()
}

async function duplicateSticky(annId: string, _el: HTMLElement) {
  const rows = await window.lk.annList(bookId.value!, page.value)
  const r = rows.find((x: any) => x.id === annId)
  if (!r) return
  const d = JSON.parse(r.data || '{}')
  await window.lk.annSave({ bookId: bookId.value, page: page.value, type: 'sticky', data: JSON.stringify({ ...d, x: (d.x || 0) + 12, y: (d.y || 0) + 12 }) })
  renderPage()
}

// ── selection ──
function onSelectionEnd(e: MouseEvent) {
  if (annMode.value || curAct === 'pan') return
  hlActionBar.value.show = false
  const sel = window.getSelection(); if (!sel) return
  const text = sel.toString().trim()
  if (!text || text.length < 2) {
    selPopup.value.show = false
    checkHighlightClick(e)
    return
  }
  // capture selection rect relative to page container
  let rectX: number|null = null, rectY: number|null = null, rectW: number|null = null, rectH: number|null = null
  const container = pageHost.value?.querySelector('.page-container') as HTMLElement
  if (container && sel.rangeCount) {
    try {
      const range = sel.getRangeAt(0)
      const rects = range.getClientRects()
      if (rects.length) {
        const cr = container.getBoundingClientRect()
        const r = rects[0]
        rectX = (r.left - cr.left) / cr.width
        rectY = (r.top - cr.top) / cr.height
        rectW = r.width / cr.width
        rectH = r.height / cr.height
      }
    } catch { /* ignore */ }
  }
  const wr = wrap.value!.getBoundingClientRect()
  selPopup.value = { show: true, x: Math.min(e.clientX - wr.left, wr.width - 260), y: Math.max(40, e.clientY - wr.top - 50), text, rectX, rectY, rectW, rectH }
  aiMenuOpen.value = false
}

function checkHighlightClick(e: MouseEvent) {
  const container = pageHost.value?.querySelector('.page-container') as HTMLElement
  if (!container) return
  const cr = container.getBoundingClientRect()
  const nx = (e.clientX - cr.left) / cr.width
  const ny = (e.clientY - cr.top) / cr.height
  const hit = highlights.value.find((h: any) => h.page === page.value && h.rect_x != null && nx >= h.rect_x && nx <= h.rect_x + h.rect_w && ny >= h.rect_y && ny <= h.rect_y + h.rect_h)
  if (hit) {
    const wr = wrap.value!.getBoundingClientRect()
    hlActionBar.value = { show: true, x: Math.min(e.clientX - wr.left, wr.width - 240), y: Math.max(10, e.clientY - wr.top - 40), id: hit.id, text: hit.text, color: hit.color || 'yellow' }
  }
}
function copySelection() { navigator.clipboard.writeText(selPopup.value.text); ElMessage.success('Copied'); selPopup.value.show = false }
function askSel(q: string) { emit('ask-ai', { quote: selPopup.value.text, question: q, bookId: bookId.value!, page: page.value }); selPopup.value.show = false; aiMenuOpen.value = false }
async function saveSel() {
  const sp = selPopup.value
  await saveSelText(sp.text, sp.rectX, sp.rectY, sp.rectW, sp.rectH)
  selPopup.value.show = false
}
async function saveSelText(text: string, rx?: number|null, ry?: number|null, rw?: number|null, rh?: number|null) {
  await window.lk.highlightAdd({ bookId: bookId.value, page: page.value, text, color: hlColor.value, rectX: rx ?? null, rectY: ry ?? null, rectW: rw ?? null, rectH: rh ?? null })
  highlights.value = await window.lk.highlightList(bookId.value!); ElMessage.success('Highlighted'); renderPage()
}
function askHl(h: any) { emit('ask-ai', { quote: h.text, bookId: bookId.value!, page: h.page }) }
async function delHl(id: string) { await window.lk.highlightDelete(id); highlights.value = await window.lk.highlightList(bookId.value!); renderPage() }

// highlight action bar handlers
function hlActionCopy() { navigator.clipboard.writeText(hlActionBar.value.text); ElMessage.success('Copied'); hlActionBar.value.show = false }
function hlActionAI() { emit('ask-ai', { quote: hlActionBar.value.text, question: 'Analyze this highlighted passage', bookId: bookId.value!, page: page.value }); hlActionBar.value.show = false }
async function hlActionColor(c: string) {
  await window.lk.highlightUpdate(hlActionBar.value.id, { color: c })
  highlights.value = await window.lk.highlightList(bookId.value!)
  hlActionBar.value.color = c; renderPage()
}
async function hlActionDelete() { await delHl(hlActionBar.value.id); hlActionBar.value.show = false }
async function addBookmark() { await window.lk.bookmarkAdd({ bookId: bookId.value, page: page.value, label: `Page ${page.value}` }); bookmarks.value = await window.lk.bookmarkList(bookId.value!); ElMessage.success('Bookmark added') }
async function delBookmark(id: string) { await window.lk.bookmarkDelete(id); bookmarks.value = await window.lk.bookmarkList(bookId.value!) }

// ── keyboard ──
function onKey(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) { if (e.key === 'Escape') (e.target as HTMLElement).blur(); return }
  if (e.key === ' ') { spaceHeld = true; if (wrap.value) wrap.value.style.cursor = 'grab'; e.preventDefault(); return }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); prevPage() }
  else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); nextPage() }
  else if (e.key === 'Home') { e.preventDefault(); page.value = 1; panX.value = 0; panY.value = 0; renderPage() }
  else if (e.key === 'End') { e.preventDefault(); page.value = totalPages.value; panX.value = 0; panY.value = 0; renderPage() }
  else if (e.ctrlKey && e.key === '0') { e.preventDefault(); recenterPage() }
  else if (e.ctrlKey && e.key === 'd') { e.preventDefault(); addBookmark() }
  else if (e.key === 'Escape') { selPopup.value.show = false; aiMenuOpen.value = false; if (annMode.value) { annMode.value = false; renderPage() } }
}
function onKeyUp(e: KeyboardEvent) {
  if (e.key === ' ') { spaceHeld = false; if (wrap.value && !isPanning) wrap.value.style.cursor = '' }
}

// ── wheel ──
function onWheel(e: WheelEvent) {
  if (!wrap.value || !wrap.value.contains(e.target as Node)) return
  if (e.ctrlKey) { e.preventDefault(); zoom.value = Math.max(80, Math.min(300, zoom.value - Math.sign(e.deltaY) * 10)); renderPage(); return }
  if (e.shiftKey) { e.preventDefault(); panX.value -= e.deltaY; clampPan(); return }
  // normal: scroll within page, flip at edges
  const w = wrap.value
  const atTop = w.scrollTop <= 0, atBottom = w.scrollTop + w.clientHeight >= w.scrollHeight - 2
  if (e.deltaY > 0 && atBottom) { e.preventDefault(); nextPage() }
  else if (e.deltaY < 0 && atTop && page.value > 1) { e.preventDefault(); prevPage() }
}

// ── reference panel ──
async function handleRef(data: { startPage: number; endPage: number; action: string; chapterTitle?: string }) {
  refOpen.value = false
  // Extract text from selected pages
  const pages: string[] = []
  for (let p = data.startPage; p <= data.endPage; p++) {
    try {
      const pageObj = await pdfDoc.getPage(p)
      const tc = await pageObj.getTextContent()
      pages.push(tc.items.map((i: any) => i.str).filter(Boolean).join(' '))
    } catch { pages.push('') }
  }
  const quote = pages.join('\n').trim().slice(0, 3000)
  if (!quote) { ElMessage.warning('未能提取文本'); return }

  const refTitle = data.chapterTitle || `${data.startPage}–${data.endPage} 页`

  if (data.action === 'analyze' || data.action === 'summary') {
    const question = data.action === 'summary' ? '请总结这段内容' : '请分析这段内容'
    emit('ask-ai', { quote, question, bookId: bookId.value || '', page: data.startPage })
  } else if (data.action === 'note') {
    const noteId = await window.lk.uuid()
    await window.lk.notesUpsert({ id: noteId, title: '引用 · ' + refTitle, body: quote, kind: 'note', sort: Date.now() })
    ElMessage.success('笔记已创建')
  } else if (data.action === 'card') {
    let decks = await window.lk.deckList()
    let deckId = decks[0]?.id
    if (!deckId) {
      deckId = await window.lk.uuid()
      await window.lk.deckUpsert({ id: deckId, title: '默认牌组', sort: 0 })
    }
    await window.lk.cardSave({ deckId, front: refTitle, back: quote.slice(0, 500), kind: 'qa' })
    ElMessage.success('闪卡已创建')
  }
}

// ── lifecycle hooks ──
onMounted(() => {
  load()
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKeyUp)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('keyup', onKeyUp)
})
</script>

<style scoped lang="scss">
.reader-root { flex:1; display:flex; min-width:0; min-height:0; overflow:hidden; background:var(--bg); position:relative; }
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
.zoom-lbl { font-size:11px; color:var(--text-dim); min-width:36px; }
.ann-toolbar { display:flex; align-items:center; gap:4px; padding:4px 12px; background:var(--bg-soft); border-bottom:1px solid var(--border); flex-wrap:wrap; font-size:12px; }
.canvas-wrap { flex:1; overflow-y:auto; overflow-x:hidden; padding:10px 0; background:#3b3b3b; position:relative; display:flex; justify-content:center; }
.canvas-wrap::-webkit-scrollbar { width:8px; }
.canvas-wrap::-webkit-scrollbar-thumb { background:var(--accent); border-radius:5px; }
.canvas-wrap::-webkit-scrollbar-track { background:var(--bg); }
.page-host { margin:0 auto; }
.loading { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:var(--text-dim); background:rgba(0,0,0,0.3); z-index:5; }
.drag-hint { position:absolute; bottom:18px; right:18px; z-index:20; background:rgba(0,0,0,0.7); color:#fff; padding:6px 14px; border-radius:6px; font-size:12px; pointer-events:none; }
.sel-popup { position:absolute; z-index:30; display:flex; gap:2px; background:var(--bg-elev); border:1px solid var(--border); border-radius:6px; padding:4px; box-shadow:var(--shadow); align-items:center; }
.sel-popup > button, .ai-dd > button { border:none; background:transparent; color:var(--text); padding:4px 8px; border-radius:4px; cursor:pointer; font-size:12px; &:hover { background:var(--accent); color:#fff } }
.ai-dd { position:relative; }
.ai-menu { position:absolute; top:100%; left:0; background:var(--bg-elev); border:1px solid var(--border); border-radius:6px; box-shadow:var(--shadow); padding:4px 0; min-width:140px; z-index:31; }
.ai-menu button { display:block; width:100%; text-align:left; border:none; background:transparent; color:var(--text); padding:5px 12px; cursor:pointer; font-size:12px; &:hover { background:var(--accent); color:#fff } }
.hl-colors { display:inline-flex; gap:3px; align-items:center; padding:0 4px; }
.hl-dot { width:16px; height:16px; border-radius:50%; border:2px solid transparent; cursor:pointer; padding:0; &:hover { border-color:var(--text); } &.active { border-color:var(--accent); box-shadow:0 0 0 1px var(--accent); } }
.hl-dot-sm { display:inline-block; width:10px; height:10px; border-radius:50%; flex-shrink:0; margin-right:4px; }
.hl-action-bar { position:absolute; z-index:30; display:flex; gap:2px; align-items:center; background:var(--bg-elev); border:1px solid var(--border); border-radius:6px; padding:4px 6px; box-shadow:var(--shadow); }
.hl-action-bar button { border:none; background:transparent; color:var(--text); padding:3px 7px; border-radius:4px; cursor:pointer; font-size:12px; &:hover { background:var(--accent); color:#fff } &.danger { color:#ff5c5c; &:hover { background:#c53030; color:#fff } } }

/* PDF.js text layer - enables text selection like browser PDF viewer */
:deep(.textLayer) { position:absolute; text-align:initial; inset:0; overflow:hidden; opacity:1; line-height:1; text-size-adjust:none; forced-color-adjust:none; transform-origin:0 0; }
:deep(.textLayer) :is(span, br) { color:transparent; position:absolute; white-space:pre; cursor:text; transform-origin:0% 0%; }
:deep(.textLayer) span.markedContent { top:0; height:0; }
:deep(.textLayer) ::selection { background:rgba(0,100,255,0.3); }
:deep(.textLayer) br::selection { background:transparent; }
</style>
