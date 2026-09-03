<template>
  <div class="reader-root" data-testid="pdf-reader">
    <aside class="side" :class="{ open: sideOpen }">
      <div class="side-tabs">
        <button :class="{active: tab==='toc'}" @click="tab='toc'">目录</button>
        <button :class="{active: tab==='marks'}" @click="tab='marks'">书签/划线</button>
        <button :class="{active: tab==='notes'}" @click="tab='notes';refreshLinkedNotes()">关联笔记</button>
      </div>
      <div class="side-body">
        <div v-if="tab==='toc'">
          <el-empty v-if="!outline.length" description="暂无目录" :image-size="60" />
          <div v-for="(it, i) in outline" :key="i" class="toc-item" :style="{ paddingLeft: it.depth*12+'px' }" title="点击跳转；右键编辑目录" @click="goOutline(it)" @contextmenu.prevent.stop="openTocItemMenu($event, i)">
            <span>{{ it.title }}</span><em v-if="Number.isFinite(it.page)">{{ it.page }}</em>
          </div>
          <div v-if="outline.length" class="toc-edit-hint">右键目录项可修改、增删和调整层级</div>
          <el-button class="toc-build" size="small" plain :loading="ocrBusy" @click="buildOutlineFromPages">OCR / 目录页识别</el-button>
          <el-button class="toc-build" size="small" plain @click="openTextOutlineImport">从文本导入目录</el-button>
        </div>
        <div v-else-if="tab==='marks'">
          <el-button size="small" plain @click="addBookmark" style="margin-bottom:6px">+ 添加书签</el-button>
          <el-empty v-if="!bookmarks.length" description="暂无书签" :image-size="60" />
          <div v-for="b in bookmarks" :key="b.id" class="mark" @click="goPage(b.page)">第 {{ b.page }} 页 <el-button text size="small" type="danger" @click.stop="delBookmark(b.id)">删</el-button></div>
          <el-divider content-position="left">划线 ({{ highlights.length }})</el-divider>
          <div v-for="h in highlights" :key="h.id" class="hl" @click="goPage(h.page)">
            <span class="hl-dot-sm" :style="{ background: HL_COLORS[h.color] || HL_COLORS.yellow }"></span>
            <div class="hl-text">{{ h.text }}</div>
            <el-button text size="small" @click.stop="openHighlightBlock(h)">块</el-button>
            <el-button text size="small" @click.stop="askHl(h)">AI</el-button>
            <el-button text size="small" type="danger" @click.stop="delHl(h.id)">x</el-button>
          </div>
        </div>
        <div v-else>
          <el-button size="small" plain @click="createLinkedNote()" style="margin-bottom:8px">+ 新建本页笔记</el-button>
          <el-empty v-if="!linkedNotes.length" description="暂无关联笔记" :image-size="60" />
          <div v-for="note in linkedNotes" :key="note.id" class="linked-note" @click="openLinkedNote(note.id)">
            <strong>{{ note.title }}</strong>
            <span>{{ note.updated_at || note.created_at || '' }}</span>
          </div>
        </div>
      </div>
    </aside>
    <div class="main">
      <div class="ctrl">
        <el-button size="small" text @click="$emit('back')">← 图书馆</el-button>
        <el-button size="small" text @click="sideOpen=!sideOpen">目录</el-button>
        <span class="title">{{ book?.title }}</span>
        <span class="spacer"></span>
        <span class="current-page-label" data-testid="pdf-current-page">第 {{ page }} / {{ totalPages || '—' }} 页</span>
        <el-button size="small" @click="prevPage" :disabled="page<=1">&lt;</el-button>
        <el-input-number v-model="pageInput" class="page-input" size="small" :min="1" :max="Math.max(1, totalPages)" :controls="false" aria-label="跳转页码" @change="jumpToPage" @keydown.enter.stop.prevent="jumpToPage(pageInput)" />
        <span class="pg-total">/ {{ totalPages }}</span>
        <el-button size="small" @click="nextPage" :disabled="!totalPages||page>=totalPages">&gt;</el-button>
        <el-slider v-model="zoom" :min="80" :max="300" :step="10" style="width:100px;margin:0 6px" @change="() => renderPage()" />
        <span class="zoom-lbl">{{ zoom }}%</span>
        <el-button size="small" @click="fitZoom">适应宽度</el-button>
        <el-button size="small" @click="resetView">回到首页</el-button>
        <el-button v-if="panX!==0||panY!==0" size="small" type="warning" @click="recenterPage">页面居中</el-button>
        <el-button size="small" :type="annMode?'primary':'default'" @click="annMode=!annMode;renderPage()">{{ annMode ? '结束手绘' : '手绘批注' }}</el-button>
        <el-button size="small" @click="createLinkedNote()">关联笔记</el-button>
        <el-button size="small" :loading="ocrBusy" @click="buildOutlineFromPages">目录识别</el-button>
        <el-button size="small" @click="openTextOutlineImport">文本目录</el-button>
        <el-button size="small" type="success" @click="refOpen=true">引用</el-button>
      </div>
      <div v-if="annMode" class="ann-toolbar">
        <el-button-group size="small">
          <el-button :type="annTool==='pen'?'primary':'default'" @click="annTool='pen'">画笔</el-button>
          <el-button :type="annTool==='highlighter'?'primary':'default'" @click="annTool='highlighter'">手绘荧光笔</el-button>
          <el-button :type="annTool==='rect'?'primary':'default'" @click="annTool='rect'">矩形</el-button>
          <el-button :type="annTool==='circle'?'primary':'default'" @click="annTool='circle'">圆形</el-button>
          <el-button :type="annTool==='line'?'primary':'default'" @click="annTool='line'">直线</el-button>
          <el-button :type="annTool==='eraser'?'primary':'default'" title="点击要删除的图形" @click="annTool='eraser'">橡皮擦</el-button>
          <el-button :type="annTool==='sticky'?'primary':'default'" @click="annTool='sticky'">便签</el-button>
        </el-button-group>
        <el-color-picker v-model="activeAnnColor" size="small" style="margin-left:6px" />
        <el-slider v-model="activeAnnWidth" :min="1" :max="30" :step="0.5" style="width:80px;margin-left:6px" />
        <el-button size="small" data-testid="pdf-annotation-settings" @click="annSettingsOpen=true">批注参数</el-button>
        <el-button size="small" @click="clearPageAnnotations">清除本页批注</el-button>
        <span class="ann-hint">文本划线请先退出手绘批注模式，再直接拖选正文。</span>
      </div>
      <div class="canvas-wrap" ref="wrap" data-testid="pdf-canvas-wrap"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @contextmenu.prevent="onContextMenu"
        @wheel="onWheel"
        @scroll.passive="scheduleReaderViewState"
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
  <el-dialog v-model="annSettingsOpen" title="手绘批注参数" width="500px" append-to-body>
    <div class="ann-settings">
      <section>
        <header><strong>画笔与图形</strong><span>用于画笔、直线、矩形和圆形</span></header>
        <div class="ann-setting-row"><label>颜色</label><el-color-picker v-model="annColor" show-alpha /></div>
        <div class="ann-setting-row"><label>粗细</label><el-slider v-model="annWidth" :min="1" :max="16" :step="0.5" show-input /></div>
        <div class="ann-setting-row"><label>浓度</label><el-slider v-model="annPenOpacity" :min="0.2" :max="1" :step="0.05" :format-tooltip="opacityLabel" show-input /><small>{{ opacityLabel(annPenOpacity) }}</small></div>
      </section>
      <section class="highlighter-settings">
        <header><strong>手绘荧光笔</strong><span>浓度越低越透明，推荐 18%–28%</span></header>
        <div class="ann-setting-row"><label>颜色</label><el-color-picker v-model="annHighlighterColor" /></div>
        <div class="ann-setting-row"><label>宽度</label><el-slider v-model="annHighlighterWidth" :min="4" :max="40" :step="1" show-input /></div>
        <div class="ann-setting-row"><label>透明浓度</label><el-slider v-model="annHighlighterOpacity" :min="0.08" :max="0.55" :step="0.01" :format-tooltip="opacityLabel" show-input /><small>{{ opacityLabel(annHighlighterOpacity) }}</small></div>
      </section>
    </div>
    <template #footer><el-button @click="resetAnnSettings">恢复默认</el-button><el-button type="primary" @click="annSettingsOpen=false">完成</el-button></template>
  </el-dialog>
  <el-dialog v-model="tocImportOpen" title="从文本导入目录" width="680px" append-to-body>
    <p class="toc-import-tip">支持 <code>**标题**</code>、<code># 一级 / ## 二级</code> 和 <code>条目: 页码</code>。页码偏移用于处理纸面页码与 PDF 页码不一致。</p>
    <el-input v-model="tocImportText" type="textarea" :rows="13" resize="vertical" placeholder="粘贴目录文本，例如：&#10;**基础过关 1 阶**&#10;**高等数学**&#10;填空题: 5&#10;选择题: 43" />
    <div class="toc-import-options">
      <span>PDF 页码偏移</span>
      <el-input-number v-model="tocImportOffset" :min="-999" :max="999" />
      <span class="muted">例如纸面第 5 页是 PDF 第 12 页，填写 +7</span>
    </div>
    <div class="toc-preview-head">预览：{{ tocImportPreview.length }} 条</div>
    <div class="toc-preview">
      <div v-for="(item, index) in tocImportPreview" :key="index" class="toc-preview-row" :style="{ paddingLeft: `${item.depth * 18 + 8}px` }">
        <span>{{ item.title }}</span><b>第 {{ item.page }} 页</b>
      </div>
      <el-empty v-if="!tocImportPreview.length" description="粘贴文本后会在这里预览" :image-size="48" />
    </div>
    <template #footer>
      <el-button @click="tocImportOpen=false">取消</el-button>
      <el-button type="primary" :disabled="!tocImportPreview.length" @click="saveTextOutline">确认写入目录</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, onUnmounted, ref, watch } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useContextMenu } from '../stores/context-menu'
import { useSettingsStore } from '../stores/chat'
import { matchesShortcut } from '../helpers/shortcuts'
import { parseImportedOutline, type OutlineEntry } from '../helpers/outline-import'
import EbookRefPanel from '../components/EbookRefPanel.vue'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const props = defineProps<{ bookIdProp: string | null; jumpPage?: number | null }>()
const emit = defineEmits<{ (e: 'back'): void; (e: 'ask-ai', p: { quote: string; question?: string; bookId: string; page: number }): void }>()
const menu = useContextMenu()
const settings = useSettingsStore()

// ── state ──
const bookId = ref(props.bookIdProp)
const book = ref<any>(null)
const sideOpen = ref(true)
const tab = ref<'toc'|'marks'|'notes'>('toc')
const wrap = ref<HTMLElement|null>(null)
const pageHost = ref<HTMLElement|null>(null)
const loading = ref(false)
const totalPages = ref(0)
const page = ref(1)
const pageInput = ref(1)
const zoom = ref(120)
type ReaderViewState = { page: number; zoom: number; relativeY: number }
const READER_STATE_PREFIX = 'pdfReaderState.'
const outline = ref<any[]>([])
const bookmarks = ref<any[]>([])
const highlights = ref<any[]>([])
const linkedNotes = ref<any[]>([])
const annMode = ref(false)
const annTool = ref<'pen'|'highlighter'|'rect'|'circle'|'line'|'eraser'|'sticky'>('pen')
const ANN_PREFS_KEY = 'lk_pdf_annotation_preferences_v1'
type AnnotationPreferences = { penColor: string; penWidth: number; penOpacity: number; highlighterColor: string; highlighterWidth: number; highlighterOpacity: number }
const DEFAULT_ANN_PREFS: AnnotationPreferences = { penColor: '#315b8a', penWidth: 3, penOpacity: 1, highlighterColor: '#e2ee7a', highlighterWidth: 16, highlighterOpacity: .22 }
function readAnnotationPreferences(): AnnotationPreferences {
  try { return { ...DEFAULT_ANN_PREFS, ...JSON.parse(localStorage.getItem(ANN_PREFS_KEY) || '{}') } }
  catch { return { ...DEFAULT_ANN_PREFS } }
}
const initialAnnPreferences = readAnnotationPreferences()
const annSettingsOpen = ref(false)
const annColor = ref(initialAnnPreferences.penColor)
const annWidth = ref(initialAnnPreferences.penWidth)
const annPenOpacity = ref(initialAnnPreferences.penOpacity)
const annHighlighterColor = ref(initialAnnPreferences.highlighterColor)
const annHighlighterWidth = ref(initialAnnPreferences.highlighterWidth)
const annHighlighterOpacity = ref(initialAnnPreferences.highlighterOpacity)
const activeAnnColor = computed({
  get: () => annTool.value === 'highlighter' ? annHighlighterColor.value : annColor.value,
  set: (value: string) => { if (annTool.value === 'highlighter') annHighlighterColor.value = value; else annColor.value = value }
})
const activeAnnWidth = computed({
  get: () => annTool.value === 'highlighter' ? annHighlighterWidth.value : annWidth.value,
  set: (value: number) => { if (annTool.value === 'highlighter') annHighlighterWidth.value = value; else annWidth.value = value }
})
function opacityLabel(value: number) { return `${Math.round(value * 100)}%` }
function persistAnnSettings() {
  localStorage.setItem(ANN_PREFS_KEY, JSON.stringify({ penColor: annColor.value, penWidth: annWidth.value, penOpacity: annPenOpacity.value, highlighterColor: annHighlighterColor.value, highlighterWidth: annHighlighterWidth.value, highlighterOpacity: annHighlighterOpacity.value }))
}
function resetAnnSettings() {
  annColor.value = DEFAULT_ANN_PREFS.penColor; annWidth.value = DEFAULT_ANN_PREFS.penWidth; annPenOpacity.value = DEFAULT_ANN_PREFS.penOpacity
  annHighlighterColor.value = DEFAULT_ANN_PREFS.highlighterColor; annHighlighterWidth.value = DEFAULT_ANN_PREFS.highlighterWidth; annHighlighterOpacity.value = DEFAULT_ANN_PREFS.highlighterOpacity
  ElMessage.success('已恢复默认批注参数')
}
watch([annColor, annWidth, annPenOpacity, annHighlighterColor, annHighlighterWidth, annHighlighterOpacity], persistAnnSettings)
type HighlightRect = { x: number; y: number; w: number; h: number }
const selPopup = ref({ show: false, x: 0, y: 0, text: '', rectX: null as number|null, rectY: null as number|null, rectW: null as number|null, rectH: null as number|null, rects: [] as HighlightRect[] })
const aiMenuOpen = ref(false)
const refOpen = ref(false)
const ocrBusy = ref(false)
const tocImportOpen = ref(false)
const tocImportText = ref('')
const tocImportOffset = ref(0)
const dragHint = ref<string|null>(null)
const hlColor = ref<'yellow'|'green'|'blue'|'pink'>('yellow')
const hlActionBar = ref({ show: false, x: 0, y: 0, id: '', text: '', color: '' })

const HL_COLORS: Record<string, string> = {
  yellow: 'rgba(255,220,80,0.35)',
  green: 'rgba(120,220,120,0.35)',
  blue: 'rgba(120,180,255,0.35)',
  pink: 'rgba(255,140,180,0.35)',
}

const tocImportPreview = computed(() => parseImportedOutline(tocImportText.value, tocImportOffset.value, totalPages.value))

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
let renderEpoch = 0
let readerUnmounted = false
let readerStateTimer: ReturnType<typeof setTimeout> | null = null
let readerStateWrite = Promise.resolve<unknown>(undefined)
let lastReaderViewState: ReaderViewState | null = null
type PendingStickySave = { timer: ReturnType<typeof setTimeout>; save: () => Promise<unknown> }
const pendingStickySaves = new Map<string, PendingStickySave>()
let drawing = false
let aSX = 0, aSY = 0
let annPts: number[][] = []

// apply pan transform reactively
watch([panX, panY], () => {
  const c = pageHost.value?.querySelector('.page-container') as HTMLElement
  if (c) c.style.transform = `translate(${panX.value}px, ${panY.value}px)`
})
watch(page, (value) => { pageInput.value = value })

// ── lifecycle ──
async function load() {
  if (!bookId.value) return
  loading.value = true
  const list = await window.lk.bookList()
  book.value = list.find((b: any) => b.id === bookId.value) || null
  bookmarks.value = await window.lk.bookmarkList(bookId.value)
  highlights.value = await window.lk.highlightList(bookId.value)
  await refreshLinkedNotes()
  pdfDoc = await pdfjsLib.getDocument({ url: window.lk.bookUrl(bookId.value) } as any).promise
  totalPages.value = pdfDoc.numPages
  if (book.value?.total_pages !== pdfDoc.numPages) await window.lk.bookUpdate(bookId.value, { total_pages: pdfDoc.numPages })
  const savedView = await readReaderViewState(bookId.value)
  if (savedView) { zoom.value = savedView.zoom; lastReaderViewState = savedView }
  if (props.jumpPage) page.value = Math.min(Math.max(1, props.jumpPage), pdfDoc.numPages)
  else if (book.value?.last_page) page.value = Math.min(book.value.last_page, pdfDoc.numPages)
  if (!props.jumpPage && savedView?.page === page.value) pendingViewportAnchor = { page: page.value, relativeY: savedView.relativeY }
  const nativeOutline = flattenOutline(await pdfDoc.getOutline())
  const savedOutline = await window.lk.chapterList(bookId.value)
  const hasGeneratedOutline = savedOutline.some((item: any) => /^(?:toc|manual-toc):/.test(String(item.id)))
  outline.value = hasGeneratedOutline || !nativeOutline.length ? savedChaptersToOutline(savedOutline) : nativeOutline
  loading.value = false
  await renderPage()
}

async function readReaderViewState(id: string): Promise<ReaderViewState | null> {
  try {
    const raw = await window.lk.getSetting(READER_STATE_PREFIX + id)
    if (!raw) return null
    const value = JSON.parse(raw)
    const savedPage = Math.max(1, Math.round(Number(value.page) || 1))
    const savedZoom = Math.max(80, Math.min(300, Math.round(Number(value.zoom) || 120)))
    const relativeY = Math.max(0, Math.min(1, Number(value.relativeY) || 0))
    return { page: savedPage, zoom: savedZoom, relativeY }
  } catch { return null }
}

function flattenOutline(items: any[], depth = 0): any[] {
  const out: any[] = []; if (!items) return out
  for (const it of items) { out.push({ title: it.title, dest: it.dest, depth }); if (it.items) out.push(...flattenOutline(it.items, depth + 1)) }
  return out
}

function savedChaptersToOutline(rows: any[]): OutlineEntry[] {
  const byId = new Map(rows.map((row: any) => [String(row.id), row]))
  const byParent = new Map<string, any[]>()
  for (const row of rows) {
    const parent = row.parent_id && byId.has(String(row.parent_id)) ? String(row.parent_id) : ''
    const siblings = byParent.get(parent) || []
    siblings.push(row); byParent.set(parent, siblings)
  }
  for (const siblings of byParent.values()) siblings.sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0))
  const result: OutlineEntry[] = []
  const visit = (parent: string, depth: number) => {
    for (const row of byParent.get(parent) || []) {
      result.push({ title: String(row.title || '未命名目录'), page: Number(String(row.section_anchor || '').replace(/^page:/, '')) || 1, depth })
      visit(String(row.id), depth + 1)
    }
  }
  visit('', 0)
  return result
}

function rectsForHighlight(highlight: any): HighlightRect[] {
  try {
    const rects = JSON.parse(highlight.rects_json || '[]')
    if (Array.isArray(rects) && rects.length) return rects.filter((rect) => Number.isFinite(rect?.x) && Number.isFinite(rect?.y) && Number.isFinite(rect?.w) && Number.isFinite(rect?.h))
  } catch { /* old or malformed records fall back to the legacy rectangle */ }
  if (highlight.rect_x == null || highlight.rect_y == null || highlight.rect_w == null || highlight.rect_h == null) return []
  return [{ x: Number(highlight.rect_x), y: Number(highlight.rect_y), w: Number(highlight.rect_w), h: Number(highlight.rect_h) }]
}

function selectionRects(selection: Selection | null): HighlightRect[] {
  const container = pageHost.value?.querySelector('.page-container') as HTMLElement | null
  if (!container || !selection?.rangeCount) return []
  try {
    const bounds = container.getBoundingClientRect()
    return Array.from(selection.getRangeAt(0).getClientRects())
      .filter((rect) => rect.width > 1 && rect.height > 1 && rect.right >= bounds.left && rect.left <= bounds.right && rect.bottom >= bounds.top && rect.top <= bounds.bottom)
      .map((rect) => ({ x: (rect.left - bounds.left) / bounds.width, y: (rect.top - bounds.top) / bounds.height, w: rect.width / bounds.width, h: rect.height / bounds.height }))
  } catch { return [] }
}

type ReaderViewportAnchor = { page: number; relativeY: number }
let pendingViewportAnchor: ReaderViewportAnchor | null = null
function captureViewportAnchor(targetPage: number): ReaderViewportAnchor | null {
  const viewport = wrap.value
  const container = pageHost.value?.querySelector('.page-container') as HTMLElement | null
  if (!viewport || !container || container.offsetHeight <= 0) return null
  const viewportRect = viewport.getBoundingClientRect()
  const pageRect = container.getBoundingClientRect()
  const centerY = viewportRect.top + viewport.clientHeight / 2
  return { page: targetPage, relativeY: Math.max(0, Math.min(1, (centerY - pageRect.top) / pageRect.height)) }
}
function restoreViewportAnchor(anchor: ReaderViewportAnchor, container: HTMLElement) {
  const viewport = wrap.value
  if (!viewport || anchor.page !== page.value) return
  const viewportRect = viewport.getBoundingClientRect()
  const pageRect = container.getBoundingClientRect()
  const anchorContentY = pageRect.top - viewportRect.top + viewport.scrollTop + pageRect.height * anchor.relativeY
  viewport.scrollTop = Math.max(0, anchorContentY - viewport.clientHeight / 2)
}

function readerViewSnapshot(anchor = captureViewportAnchor(page.value)): ReaderViewState | null {
  if (!bookId.value) return null
  const snapshot = {
    page: page.value,
    zoom: zoom.value,
    relativeY: anchor?.page === page.value
      ? anchor.relativeY
      : lastReaderViewState?.page === page.value ? lastReaderViewState.relativeY : 0
  }
  lastReaderViewState = snapshot
  return snapshot
}

function writeReaderViewState(snapshot = readerViewSnapshot()): Promise<unknown> {
  const targetBookId = bookId.value
  if (!targetBookId || !snapshot) return readerStateWrite
  lastReaderViewState = snapshot
  readerStateWrite = readerStateWrite.catch(() => undefined).then(async () => {
    await window.lk.bookUpdate(targetBookId, { last_page: snapshot.page })
    await window.lk.setSetting(READER_STATE_PREFIX + targetBookId, JSON.stringify(snapshot))
  })
  return readerStateWrite
}

function scheduleReaderViewState() {
  if (readerStateTimer) clearTimeout(readerStateTimer)
  readerStateTimer = setTimeout(() => {
    readerStateTimer = null
    void writeReaderViewState()
  }, 180)
}

function flushReaderViewState(): Promise<unknown> {
  if (readerStateTimer) { clearTimeout(readerStateTimer); readerStateTimer = null }
  return writeReaderViewState()
}

function queueStickySave(id: string, save: () => Promise<unknown>) {
  const pending = pendingStickySaves.get(id)
  if (pending) clearTimeout(pending.timer)
  const timer = setTimeout(() => {
    pendingStickySaves.delete(id)
    void save()
  }, 350)
  pendingStickySaves.set(id, { timer, save })
}

function flushStickySave(id: string): Promise<unknown> {
  const pending = pendingStickySaves.get(id)
  if (!pending) return Promise.resolve()
  clearTimeout(pending.timer)
  pendingStickySaves.delete(id)
  return pending.save()
}

function discardStickySave(id: string) {
  const pending = pendingStickySaves.get(id)
  if (pending) clearTimeout(pending.timer)
  pendingStickySaves.delete(id)
}

function flushStickySaves(): Promise<unknown> {
  const saves = [...pendingStickySaves.keys()].map(flushStickySave)
  return Promise.allSettled(saves)
}

function renderPage(options: { preserveViewport?: boolean } = {}): Promise<void> {
  return renderPageInternal(options).catch((error: unknown) => {
    if (!readerUnmounted) {
      loading.value = false
      console.error('[pdf-render]', error)
      ElMessage.error('当前书页渲染失败，请重试')
    }
  })
}

async function renderPageInternal(options: { preserveViewport?: boolean } = {}) {
  if (!pdfDoc || !pageHost.value) return
  const epoch = ++renderEpoch
  const targetPage = page.value
  const targetBookId = bookId.value
  if (!targetBookId) return
  if (options.preserveViewport === false) pendingViewportAnchor = null
  else pendingViewportAnchor = captureViewportAnchor(targetPage) || (pendingViewportAnchor?.page === targetPage ? pendingViewportAnchor : null)
  await flushStickySaves()
  if (epoch !== renderEpoch || readerUnmounted) return
  loading.value = true
  const host = pageHost.value; host.innerHTML = ''
  const p = await pdfDoc.getPage(targetPage)
  if (epoch !== renderEpoch) return
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
  if (epoch !== renderEpoch) return

  // Keep text highlights separate from hand-drawn ink. Multiply preserves dark
  // glyphs instead of painting an opaque rectangle over them.
  const textHighlightCanvas = document.createElement('canvas')
  textHighlightCanvas.width = w; textHighlightCanvas.height = h
  textHighlightCanvas.style.cssText = `position:absolute;top:0;left:0;width:${w}px;height:${h}px;z-index:1;pointer-events:none;mix-blend-mode:multiply`
  container.appendChild(textHighlightCanvas)
  const textHighlightCtx = textHighlightCanvas.getContext('2d')!
  for (const highlight of highlights.value.filter((item: any) => item.page === targetPage)) {
    textHighlightCtx.fillStyle = HL_COLORS[highlight.color] || HL_COLORS.yellow
    for (const rect of rectsForHighlight(highlight)) textHighlightCtx.fillRect(rect.x * w, rect.y * h, rect.w * w, rect.h * h)
  }

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
  if (epoch !== renderEpoch) return
  // in annotate mode, text layer should not capture events
  if (annMode.value) textLayerDiv.style.pointerEvents = 'none'

  // annotation overlay
  const nextAnnCanvas = document.createElement('canvas')
  nextAnnCanvas.dataset.testid = 'pdf-annotation-canvas'
  nextAnnCanvas.width = w; nextAnnCanvas.height = h
  nextAnnCanvas.style.cssText = `position:absolute;top:0;left:0;width:${w}px;height:${h}px;z-index:3;mix-blend-mode:multiply`
  container.appendChild(nextAnnCanvas)
  if (annMode.value) {
    nextAnnCanvas.addEventListener('mousedown', onAnnMouseDown)
    nextAnnCanvas.addEventListener('mousemove', onAnnMouseMove)
    nextAnnCanvas.addEventListener('mouseup', onAnnMouseUp)
    nextAnnCanvas.addEventListener('mouseleave', onAnnMouseUp)
    nextAnnCanvas.style.cursor = 'crosshair'
  } else {
    // in reading mode, annotation canvas should not block text selection
    nextAnnCanvas.style.pointerEvents = 'none'
  }

  // annotations from DB
  const rows = await window.lk.annList(targetBookId, targetPage)
  if (epoch !== renderEpoch) return
  host.innerHTML = ''
  host.appendChild(container)
  annCanvas = nextAnnCanvas
  annCtx = nextAnnCanvas.getContext('2d')!
  renderAnnotations(rows)

  // sticky notes as HTML
  for (const sr of rows.filter((r: any) => r.type === 'sticky')) {
    const d = JSON.parse(sr.data || '{}')
    const stickyX = d.coord === 'normalized' ? Number(d.x || 0) * w : Number(d.x || 0)
    const stickyY = d.coord === 'normalized' ? Number(d.y || 0) * h : Number(d.y || 0)
    const div = document.createElement('div')
    div.className = 'sticky-note'
    div.style.cssText = `position:absolute;left:${stickyX}px;top:${stickyY}px;width:${d.w || 130}px;min-height:40px;background:${d.color || '#fff9c4'};border:1px solid #d4b469;border-radius:4px;z-index:10;box-shadow:2px 2px 6px rgba(0,0,0,0.15);font-size:12px`
    div.dataset.annId = sr.id
    div.dataset.page = String(targetPage)
    // drag handle bar
    const bar = document.createElement('div')
    bar.className = 'sticky-bar'
    bar.style.cssText = 'cursor:move;display:flex;justify-content:space-between;align-items:center;padding:1px 4px;background:rgba(0,0,0,0.06);border-radius:4px 4px 0 0'
    const dot = document.createElement('span'); dot.textContent = '⋮⋮'; dot.style.cssText = 'font-size:10px;color:#999;cursor:move'
    const del = document.createElement('button'); del.textContent = '×'; del.style.cssText = 'border:none;background:none;cursor:pointer;font-size:13px;color:#999;line-height:1'
    del.addEventListener('click', (ev) => { ev.stopPropagation(); discardStickySave(sr.id); window.lk.annDelete(sr.id).then(() => { if (page.value === targetPage) renderPage() }) })
    bar.appendChild(dot); bar.appendChild(del)
    const ta = document.createElement('textarea')
    ta.value = d.text || ''
    ta.style.cssText = 'width:100%;border:none;outline:none;background:transparent;font-size:12px;resize:vertical;min-height:28px;padding:2px 4px'
    const saveSticky = () => window.lk.annSave({
      id: sr.id,
      bookId: targetBookId,
      page: targetPage,
      type: 'sticky',
      data: JSON.stringify({ ...d, coord: 'normalized', x: parseFloat(div.style.left) / w, y: parseFloat(div.style.top) / h, text: ta.value })
    })
    // drag via title bar (left button only)
    bar.addEventListener('mousedown', (ev) => {
      if (ev.button !== 0) return
      ev.stopPropagation()
      const sx = ev.clientX, sy = ev.clientY
      const ox = parseFloat(div.style.left), oy = parseFloat(div.style.top)
      const mv = (me: MouseEvent) => {
        div.style.left = Math.max(0, Math.min(w - 40, ox + me.clientX - sx)) + 'px'
        div.style.top = Math.max(0, Math.min(h - 30, oy + me.clientY - sy)) + 'px'
      }
      const up = () => {
        window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up)
        queueStickySave(sr.id, saveSticky)
      }
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
    })
    ta.addEventListener('input', () => queueStickySave(sr.id, saveSticky))
    ta.addEventListener('change', () => { void flushStickySave(sr.id) })
    ta.addEventListener('blur', () => { void flushStickySave(sr.id) })
    ta.addEventListener('mousedown', (ev) => ev.stopPropagation()) // don't drag sticky when editing text
    div.appendChild(bar); div.appendChild(ta)
    container.appendChild(div)
  }

  if (epoch === renderEpoch) {
    const anchor = pendingViewportAnchor
    if (anchor?.page === targetPage) restoreViewportAnchor(anchor, container)
    pendingViewportAnchor = null
    loading.value = false
    scheduleReaderViewState()
  }
}

function renderAnnotations(rows: any[]) {
  if (!annCtx) return
  for (const r of rows) {
    if (r.type === 'sticky') continue
    const d = JSON.parse(r.data || '{}')
    annCtx.save()
    if (r.type === 'pen') {
      annCtx.strokeStyle = d.color || annColor.value; annCtx.globalAlpha = d.opacity ?? 1; annCtx.lineWidth = d.width || annWidth.value; annCtx.lineCap = 'round'; annCtx.lineJoin = 'round'
      annCtx.beginPath(); for (let i = 0; i < (d.points?.length || 0); i++) { const pt = d.points[i]; i === 0 ? annCtx.moveTo(pt[0], pt[1]) : annCtx.lineTo(pt[0], pt[1]) }; annCtx.stroke()
    } else if (r.type === 'highlighter') {
      annCtx.strokeStyle = d.color || DEFAULT_ANN_PREFS.highlighterColor; annCtx.globalAlpha = d.opacity ?? DEFAULT_ANN_PREFS.highlighterOpacity; annCtx.lineWidth = d.version === 2 ? (d.width || DEFAULT_ANN_PREFS.highlighterWidth) : (d.width || 8) * 2; annCtx.lineCap = 'round'; annCtx.lineJoin = 'round'
      annCtx.beginPath(); for (let i = 0; i < (d.points?.length || 0); i++) { const pt = d.points[i]; i === 0 ? annCtx.moveTo(pt[0], pt[1]) : annCtx.lineTo(pt[0], pt[1]) }; annCtx.stroke()
    } else if (r.type === 'rect') { annCtx.strokeStyle = d.color || annColor.value; annCtx.globalAlpha = d.opacity ?? 1; annCtx.lineWidth = d.width || annWidth.value; annCtx.strokeRect(d.x, d.y, d.w, d.h) }
    else if (r.type === 'circle') { annCtx.strokeStyle = d.color || annColor.value; annCtx.globalAlpha = d.opacity ?? 1; annCtx.lineWidth = d.width || annWidth.value; annCtx.beginPath(); annCtx.ellipse(d.x, d.y, d.rx, d.ry, 0, 0, Math.PI * 2); annCtx.stroke() }
    else if (r.type === 'line') { annCtx.strokeStyle = d.color || annColor.value; annCtx.globalAlpha = d.opacity ?? 1; annCtx.lineWidth = d.width || annWidth.value; annCtx.beginPath(); annCtx.moveTo(d.x1, d.y1); annCtx.lineTo(d.x2, d.y2); annCtx.stroke() }
    annCtx.restore()
  }
}

// ── navigation ──
function prevPage() { if (page.value > 1) goPage(page.value - 1) }
function nextPage() { if (page.value < totalPages.value) goPage(page.value + 1) }
function goPage(p: number) {
  const target = Math.min(Math.max(1, Math.round(Number(p) || 1)), Math.max(1, totalPages.value))
  page.value = target; pageInput.value = target; panX.value = 0; panY.value = 0
  wrap.value?.scrollTo({ top: 0, left: 0 })
  void writeReaderViewState({ page: target, zoom: zoom.value, relativeY: 0 })
  renderPage({ preserveViewport: false })
}
function jumpToPage(value: number | undefined) { goPage(value ?? pageInput.value) }
async function goOutline(it: any) {
  if (Number.isFinite(it.page)) { goPage(it.page); return }
  if (!pdfDoc) return; let dest: any = it.dest
  if (typeof dest === 'string') dest = await pdfDoc.getDestination(dest)
  if (!dest?.[0]) return
  goPage((await pdfDoc.getPageIndex(dest[0])) + 1)
}
function fitZoom() { zoom.value = 100; panX.value = 0; panY.value = 0; renderPage() }
function resetView() { page.value = 1; zoom.value = 100; panX.value = 0; panY.value = 0; renderPage({ preserveViewport: false }); wrap.value?.scrollTo({ top: 0 }) }

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
  if (e.button !== 0 || !annMode.value || !annCanvas) return
  const rect = annCanvas.getBoundingClientRect()
  const x = (e.clientX - rect.left) * (annCanvas.width / rect.width)
  const y = (e.clientY - rect.top) * (annCanvas.height / rect.height)
  if (annTool.value === 'sticky') {
    const targetPage = page.value
    window.lk.annSave({ bookId: bookId.value, page: targetPage, type: 'sticky', data: JSON.stringify({ coord: 'normalized', x: x / annCanvas.width, y: y / annCanvas.height, w: 130, h: 60, text: '', color: '#fff9c4' }) }).then(() => { if (page.value === targetPage) renderPage() })
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
    // Draw only the newest segment. Redrawing the full path on every move
    // repeatedly stacks alpha and turns a translucent highlighter opaque.
    const previous = annPts[annPts.length - 1] || [x, y]
    annPts.push([x, y]); annCtx.save()
    annCtx.strokeStyle = annTool.value === 'highlighter' ? annHighlighterColor.value : annColor.value
    annCtx.globalAlpha = annTool.value === 'highlighter' ? annHighlighterOpacity.value : annPenOpacity.value
    annCtx.lineWidth = annTool.value === 'highlighter' ? annHighlighterWidth.value : annWidth.value
    annCtx.lineCap = 'round'; annCtx.lineJoin = 'round'; annCtx.beginPath()
    annCtx.moveTo(previous[0], previous[1]); annCtx.lineTo(x, y)
    annCtx.stroke(); annCtx.restore()
  } else if (annTool.value === 'rect' || annTool.value === 'circle' || annTool.value === 'line') {
    annPts[1] = [x, y]
    window.lk.annList(bookId.value!, page.value).then((rows) => { if (annCtx) { annCtx.clearRect(0, 0, annCtx.canvas.width, annCtx.canvas.height); renderAnnotations(rows) } })
    annCtx.save(); annCtx.strokeStyle = annColor.value; annCtx.globalAlpha = annPenOpacity.value; annCtx.lineWidth = annWidth.value
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
  if (annTool.value === 'pen') {
    window.lk.annSave({ bookId: bookId.value, page: page.value, type: 'pen', data: JSON.stringify({ color: c, width: w, opacity: annPenOpacity.value, points: annPts, version: 2 }) })
  } else if (annTool.value === 'highlighter') {
    window.lk.annSave({ bookId: bookId.value, page: page.value, type: 'highlighter', data: JSON.stringify({ color: annHighlighterColor.value, width: annHighlighterWidth.value, opacity: annHighlighterOpacity.value, points: annPts, version: 2 }) })
  } else if (annTool.value === 'rect') {
    const x = Math.min(aSX, last[0]), y = Math.min(aSY, last[1])
    window.lk.annSave({ bookId: bookId.value, page: page.value, type: 'rect', data: JSON.stringify({ color: c, width: w, opacity: annPenOpacity.value, x, y, w: Math.abs(last[0] - aSX), h: Math.abs(last[1] - aSY) }) }).then(() => window.lk.annList(bookId.value!, page.value).then(renderAnnotations))
  } else if (annTool.value === 'circle') {
    const dx = last[0] - aSX, dy = last[1] - aSY
    window.lk.annSave({ bookId: bookId.value, page: page.value, type: 'circle', data: JSON.stringify({ color: c, width: w, opacity: annPenOpacity.value, x: aSX + dx / 2, y: aSY + dy / 2, rx: Math.abs(dx / 2) || 1, ry: Math.abs(dy / 2) || 1 }) }).then(() => window.lk.annList(bookId.value!, page.value).then(renderAnnotations))
  } else if (annTool.value === 'line') {
    window.lk.annSave({ bookId: bookId.value, page: page.value, type: 'line', data: JSON.stringify({ color: c, width: w, opacity: annPenOpacity.value, x1: aSX, y1: aSY, x2: last[0], y2: last[1] }) }).then(() => window.lk.annList(bookId.value!, page.value).then(renderAnnotations))
  }
  annPts = []
}

async function clearPageAnnotations() {
  try {
    await ElMessageBox.confirm('确定清除本页所有手绘批注和便签吗？', '清除本页批注', { type: 'warning' })
    await window.lk.annClear(bookId.value!, page.value)
    renderPage()
  } catch { /* user cancelled */ }
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

function currentPageHref(targetPage = page.value) {
  return `app://book/${bookId.value}?page=${targetPage}`
}

async function copyPageLink(targetPage = page.value) {
  await navigator.clipboard.writeText(currentPageHref(targetPage))
  ElMessage.success(`已复制第 ${targetPage} 页链接`)
}

async function createLinkedNote(selectedText = '') {
  if (!bookId.value) return
  const targetPage = page.value
  const noteId = await window.lk.uuid()
  const title = `${book.value?.title || '电子书'} · 第 ${targetPage} 页`
  const quote = selectedText.trim() ? `\n\n> ${selectedText.trim().replace(/\n+/g, '\n> ')}` : ''
  const body = `来源：[返回《${book.value?.title || '电子书'}》第 ${targetPage} 页](${currentPageHref(targetPage)})${quote}\n\n`
  await window.lk.notesUpsert({ id: noteId, title, body, kind: 'note', sort: Date.now() })
  await window.lk.linkRelate('book', bookId.value, 'note', noteId, 'source')
  await refreshLinkedNotes()
  ElMessage.success('已创建并关联笔记')
  window.dispatchEvent(new CustomEvent('lk:nav', { detail: { href: `app://note/${noteId}` } }))
}

async function refreshLinkedNotes() {
  if (!bookId.value) { linkedNotes.value = []; return }
  const links = await window.lk.linkAllForEntity('book', bookId.value)
  const noteIds = [...new Set(links.flatMap((link: any) => {
    if (link.source_type === 'note') return [link.source_id]
    if (link.target_type === 'note') return [link.target_id]
    return []
  }))]
  const notes = await Promise.all(noteIds.map((id) => window.lk.notesGet(String(id))))
  linkedNotes.value = notes.filter((note) => note && note.kind !== 'folder')
}

function openLinkedNote(noteId: string) {
  window.dispatchEvent(new CustomEvent('lk:nav', { detail: { href: `app://note/${noteId}` } }))
}

function showLinkedNotes() {
  sideOpen.value = true
  tab.value = 'notes'
  void refreshLinkedNotes()
}

async function extractPageLines(pageNumber: number): Promise<string[]> {
  const pageObject = await pdfDoc.getPage(pageNumber)
  const content = await pageObject.getTextContent()
  const groups = new Map<number, Array<{ x: number; text: string }>>()
  for (const item of content.items as any[]) {
    const text = String(item.str || '').trim()
    if (!text) continue
    const transform = Array.isArray(item.transform) ? item.transform : []
    const y = Math.round(Number(transform[5] || 0) / 3) * 3
    const row = groups.get(y) || []
    row.push({ x: Number(transform[4] || 0), text })
    groups.set(y, row)
  }
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) => normalizeDirectoryLine(row.sort((a, b) => a.x - b.x).map((item) => item.text).join(' ')))
    .filter(Boolean)
}

function normalizeDirectoryLine(value: string) {
  return value
    .replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, '$1')
    .replace(/\s*([：:])\s*/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim()
}

function mergeDetachedPageNumbers(lines: string[]) {
  const merged: string[] = []
  for (const line of lines.map(normalizeDirectoryLine).filter(Boolean)) {
    if (/^\d{1,4}$/.test(line) && merged.length && !/\d\s*$/.test(merged[merged.length - 1])) merged[merged.length - 1] += ` ${line}`
    else merged.push(line)
  }
  return merged
}

function directoryLineScore(lines: string[]) {
  const candidates = lines.filter((line) => parseTocLine(line)).length
  const readable = lines.join('').match(/[\u3400-\u9fffA-Za-z0-9]/g)?.length || 0
  return candidates * 1000 + readable
}

async function recognizePageLines(pageNumber: number): Promise<{ lines: string[]; usedOcr: boolean; confidence: number }> {
  const textLines = mergeDetachedPageNumbers(await extractPageLines(pageNumber))
  if (textLines.filter((line) => parseTocLine(line)).length >= 2) return { lines: textLines, usedOcr: false, confidence: 100 }
  const pageObject = await pdfDoc.getPage(pageNumber)
  const baseViewport = pageObject.getViewport({ scale: 1 })
  const ocrScale = Math.max(2, Math.min(3.2, 3200 / baseViewport.width))
  const viewport = pageObject.getViewport({ scale: ocrScale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建 OCR 页面画布')
  await pageObject.render({ canvasContext: context, viewport } as any).promise
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  for (let index = 0; index < pixels.data.length; index += 4) {
    const gray = pixels.data[index] * 0.299 + pixels.data[index + 1] * 0.587 + pixels.data[index + 2] * 0.114
    const enhanced = gray > 245 ? 255 : Math.max(0, Math.min(255, (gray - 128) * 1.45 + 128))
    pixels.data[index] = enhanced; pixels.data[index + 1] = enhanced; pixels.data[index + 2] = enhanced
  }
  context.putImageData(pixels, 0, 0)
  const result = await window.lk.ocrRecognize(canvas.toDataURL('image/png'))
  const ocrLines = mergeDetachedPageNumbers(result.text.split(/\r?\n/))
  if (directoryLineScore(textLines) > directoryLineScore(ocrLines)) return { lines: textLines, usedOcr: false, confidence: 100 }
  return { lines: ocrLines, usedOcr: true, confidence: result.confidence }
}

function parseTocLine(line: string): { title: string; page: number } | null {
  const normalized = normalizeDirectoryLine(line.replace(/[·•…]+/g, ' ... '))
  const match = normalized.match(/^(.{2,100}?)(?:\s*[：:]\s*|[.。·•…]{2,}|\s+)(\d{1,4})\s*$/)
  if (!match) return null
  const title = match[1].replace(/[：:.。·…\s]+$/g, '').trim()
  const pageNumber = Number(match[2])
  if (!title || !Number.isFinite(pageNumber) || pageNumber < 1) return null
  return { title, page: pageNumber }
}

function openTextOutlineImport() {
  tocImportOpen.value = true
}

function normalizeOutlineDepth(entries: OutlineEntry[]) {
  const normalized: OutlineEntry[] = []
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]
    const requested = Math.max(0, Math.min(6, Math.round(Number(entry.depth) || 0)))
    const depth = index === 0 ? 0 : Math.min(requested, normalized[index - 1].depth + 1)
    normalized.push({ title: entry.title.trim() || '未命名目录', page: Math.min(Math.max(1, Math.round(entry.page || 1)), Math.max(1, totalPages.value)), depth })
  }
  return normalized
}

async function resolveOutlinePage(item: any): Promise<number> {
  if (Number.isFinite(item.page)) return Math.min(Math.max(1, Math.round(item.page)), Math.max(1, totalPages.value))
  if (!pdfDoc || !item.dest) return page.value
  try {
    let destination = item.dest
    if (typeof destination === 'string') destination = await pdfDoc.getDestination(destination)
    if (!destination?.[0]) return page.value
    return (await pdfDoc.getPageIndex(destination[0])) + 1
  } catch { return page.value }
}

async function editableOutlineSnapshot(): Promise<OutlineEntry[]> {
  const entries: OutlineEntry[] = []
  for (const item of outline.value) entries.push({ title: String(item.title || '未命名目录'), page: await resolveOutlinePage(item), depth: Number(item.depth || 0) })
  return normalizeOutlineDepth(entries)
}

async function persistCustomOutline(rawEntries: OutlineEntry[]) {
  if (!bookId.value) return
  const entries = normalizeOutlineDepth(rawEntries)
  const existing = await window.lk.chapterList(bookId.value)
  const ids = entries.map((_, index) => `manual-toc:${bookId.value}:${index}`)
  const parentAtDepth = new Map<number, string>()
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]
    let parentId: string | null = null
    for (let depth = entry.depth - 1; depth >= 0; depth--) {
      const candidate = parentAtDepth.get(depth)
      if (candidate) { parentId = candidate; break }
    }
    await window.lk.chapterUpsert({ id: ids[index], bookId: bookId.value, parent_id: parentId, title: entry.title, sort: index, section_anchor: `page:${entry.page}` })
    parentAtDepth.set(entry.depth, ids[index])
    for (const depth of [...parentAtDepth.keys()]) if (depth > entry.depth) parentAtDepth.delete(depth)
  }
  const nextIds = new Set(ids)
  for (const item of existing.filter((entry: any) => /^(?:toc|manual-toc):/.test(String(entry.id)) && !nextIds.has(String(entry.id)))) await window.lk.chapterDelete(item.id)
  outline.value = entries
  sideOpen.value = true; tab.value = 'toc'
}

async function saveTextOutline() {
  if (!tocImportPreview.value.length) return
  await persistCustomOutline(tocImportPreview.value)
  tocImportOpen.value = false
  ElMessage.success(`已导入 ${tocImportPreview.value.length} 条可跳转目录`)
}

function tocSubtreeEnd(entries: OutlineEntry[], index: number) {
  let end = index + 1
  while (end < entries.length && entries[end].depth > entries[index].depth) end += 1
  return end
}

async function renameTocItem(index: number) {
  try {
    const result = await ElMessageBox.prompt('输入新的目录标题', '重命名目录', { inputValue: String(outline.value[index]?.title || '') })
    if (!result.value.trim()) return
    const entries = await editableOutlineSnapshot(); entries[index].title = result.value.trim()
    await persistCustomOutline(entries); ElMessage.success('目录标题已更新')
  } catch { /* user cancelled */ }
}

async function changeTocPage(index: number) {
  try {
    const current = await resolveOutlinePage(outline.value[index])
    const result = await ElMessageBox.prompt(`输入 1–${totalPages.value} 的 PDF 页码`, '修改跳转页码', { inputValue: String(current), inputPattern: /^\d+$/, inputErrorMessage: '请输入整数页码' })
    const entries = await editableOutlineSnapshot(); entries[index].page = Math.min(Math.max(1, Number(result.value)), totalPages.value)
    await persistCustomOutline(entries); ElMessage.success('跳转页码已更新')
  } catch { /* user cancelled */ }
}

async function addTocItem(index: number, position: 'before'|'after'|'child') {
  try {
    const result = await ElMessageBox.prompt('输入“标题: 页码”，页码可省略并使用当前页', position === 'child' ? '添加子目录' : '添加同级目录', { inputPlaceholder: `例如：例题讲解: ${page.value}` })
    const match = result.value.trim().match(/^(.+?)(?:\s*[：:]\s*(\d+))?$/)
    if (!match?.[1]) return
    const entries = await editableOutlineSnapshot()
    const base = entries[index]
    const entry: OutlineEntry = { title: match[1].trim(), page: Math.min(Math.max(1, Number(match[2] || page.value)), totalPages.value), depth: position === 'child' ? base.depth + 1 : base.depth }
    const insertAt = position === 'before' ? index : position === 'child' ? index + 1 : tocSubtreeEnd(entries, index)
    entries.splice(insertAt, 0, entry)
    await persistCustomOutline(entries); ElMessage.success('目录项已添加')
  } catch { /* user cancelled */ }
}

async function shiftTocLevel(index: number, delta: -1|1) {
  const entries = await editableOutlineSnapshot()
  if (delta < 0 && entries[index].depth === 0) { ElMessage.info('已经是一级目录'); return }
  if (delta > 0 && index === 0) { ElMessage.info('第一项不能降为子目录'); return }
  const previousDepth = entries[index].depth
  const end = tocSubtreeEnd(entries, index)
  for (let cursor = index; cursor < end; cursor++) entries[cursor].depth = Math.max(0, entries[cursor].depth + delta)
  const normalized = normalizeOutlineDepth(entries)
  if (normalized[index].depth === previousDepth) { ElMessage.info('前面没有可作为父级的同级目录'); return }
  await persistCustomOutline(normalized); ElMessage.success(delta < 0 ? '目录已升级' : '目录已降级')
}

async function deleteTocItem(index: number) {
  try {
    const entries = await editableOutlineSnapshot()
    const end = tocSubtreeEnd(entries, index)
    const childCount = end - index - 1
    await ElMessageBox.confirm(childCount ? `“${entries[index].title}”包含 ${childCount} 个子项，将一并删除。` : `确定删除“${entries[index].title}”吗？`, '删除目录项', { type: 'warning' })
    entries.splice(index, end - index)
    await persistCustomOutline(entries); ElMessage.success('目录项已删除')
  } catch { /* user cancelled */ }
}

function openTocItemMenu(event: MouseEvent, index: number) {
  menu.open(event, [
    { label: '重命名', icon: 'EditPen' as any, action: () => renameTocItem(index) },
    { label: '修改跳转页码', icon: 'Position' as any, action: () => changeTocPage(index) },
    { separator: true },
    { label: '在前面添加同级', icon: 'Plus' as any, action: () => addTocItem(index, 'before') },
    { label: '在后面添加同级', icon: 'Plus' as any, action: () => addTocItem(index, 'after') },
    { label: '添加子目录', icon: 'FolderAdd' as any, action: () => addTocItem(index, 'child') },
    { separator: true },
    { label: '升级为上一级', icon: 'Top' as any, action: () => shiftTocLevel(index, -1) },
    { label: '降级为子目录', icon: 'Bottom' as any, action: () => shiftTocLevel(index, 1) },
    { separator: true },
    { label: '删除目录项', icon: 'Delete' as any, danger: true, action: () => deleteTocItem(index) },
  ])
}

async function buildOutlineFromPages() {
  if (!bookId.value || !pdfDoc) return
  try {
    const result = await ElMessageBox.prompt(
      '输入目录所在 PDF 页范围；纸面页码与 PDF 页码不一致时，用分号添加偏移。例如：2-5;+8',
      'OCR / 目录页识别',
      { inputValue: String(page.value), inputPlaceholder: '例如 2-5;+8', confirmButtonText: '开始识别', cancelButtonText: '取消' },
    )
    const match = result.value.trim().match(/^(\d+)(?:\s*-\s*(\d+))?(?:\s*;\s*([+-]?\d+))?$/)
    if (!match) { ElMessage.warning('请输入类似 2-5 或 2-5;+8 的范围'); return }
    const start = Math.min(Math.max(1, Number(match[1])), totalPages.value)
    const end = Math.min(Math.max(start, Number(match[2] || match[1])), totalPages.value)
    const offset = Number(match[3] || 0)
    if (end - start + 1 > 20) { ElMessage.warning('为避免长时间占用电脑，一次最多识别 20 页'); return }
    const entries: Array<{ title: string; page: number }> = []
    let extractedChars = 0
    let ocrPageCount = 0
    const confidences: number[] = []
    ocrBusy.value = true
    for (let current = start; current <= end; current++) {
      const recognized = await recognizePageLines(current)
      const lines = recognized.lines
      if (recognized.usedOcr) { ocrPageCount += 1; confidences.push(recognized.confidence) }
      extractedChars += lines.join('').length
      for (const line of lines) {
        const entry = parseTocLine(line)
        if (!entry) continue
        const targetPage = Math.min(Math.max(1, entry.page + offset), totalPages.value)
        if (!entries.some((item) => item.title === entry.title && item.page === targetPage)) entries.push({ title: entry.title, page: targetPage })
      }
    }
    if (!extractedChars) { ElMessage.warning('未能从所选页面识别出文字，请确认页码与扫描清晰度'); return }
    if (!entries.length) { ElMessage.warning('已读取文字层，但未识别出“标题 + 页码”格式；请缩小到目录页后重试。'); return }
    const preview = entries.slice(0, 12).map((entry) => `${entry.title}  →  第 ${entry.page} 页`).join('\n')
    await ElMessageBox.confirm(`${preview}${entries.length > 12 ? `\n……另有 ${entries.length - 12} 条` : ''}`, `确认写入 ${entries.length} 条目录`, { confirmButtonText: '写入目录', cancelButtonText: '取消' })
    await persistCustomOutline(entries.map((entry) => ({ ...entry, depth: 0 })))
    const confidence = confidences.length ? `，OCR 平均置信度 ${Math.round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length)}%` : ''
    ElMessage.success(`已生成 ${entries.length} 条可跳转目录${ocrPageCount ? `（OCR ${ocrPageCount} 页${confidence}）` : ''}`)
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error('目录识别失败：' + (error?.message || error))
  } finally {
    ocrBusy.value = false
  }
}

async function promptJumpPage() {
  try {
    const result = await ElMessageBox.prompt(`输入 1–${totalPages.value} 之间的 PDF 页码`, '快速跳页', { inputValue: String(page.value), inputPattern: /^\d+$/, inputErrorMessage: '请输入整数页码' })
    goPage(Number(result.value))
  } catch { /* user cancelled */ }
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
    { label: '创建本页关联笔记', icon: 'DocumentAdd' as any, action: () => createLinkedNote() },
    { label: '查看本书关联笔记', icon: 'Notebook' as any, action: showLinkedNotes },
    { label: '复制本页跳转链接', icon: 'Link' as any, action: () => copyPageLink() },
    { label: '跳转到指定页', icon: 'Position' as any, action: promptJumpPage },
    { label: '询问 AI：本页内容', icon: 'ChatDotRound' as any, action: () => emit('ask-ai', { quote: `(第 ${page.value} 页)`, question: '请概述这一页的内容。', bookId: bookId.value!, page: page.value }) },
    { label: '添加书签', icon: 'Star' as any, action: addBookmark },
    { label: 'OCR / 从目录页生成目录', icon: 'Document' as any, action: buildOutlineFromPages },
    { label: '从文本导入目录', icon: 'DocumentCopy' as any, action: openTextOutlineImport },
    { separator: true },
    { label: annMode.value ? '退出批注模式' : '进入批注模式', icon: 'Edit' as any, action: () => { annMode.value = !annMode.value; renderPage() } },
    { label: '批注参数…', icon: 'Setting' as any, action: () => { annSettingsOpen.value = true } },
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
  const sel = window.getSelection()
  const rects = selectionRects(sel)
  const first = rects[0]
  menu.open(e, [
    { label: '复制', icon: 'CopyDocument' as any, action: () => { navigator.clipboard.writeText(text); ElMessage.success('已复制') } },
    { label: '添加划线', icon: 'EditPen' as any, children: [
      { label: '黄色', icon: 'Sunny' as any, action: () => saveSelText(text, first?.x, first?.y, first?.w, first?.h, rects) },
      { label: '绿色', icon: 'Sunny' as any, action: () => { hlColor.value='green'; saveSelText(text, first?.x, first?.y, first?.w, first?.h, rects); hlColor.value='yellow' } },
      { label: '蓝色', icon: 'Sunny' as any, action: () => { hlColor.value='blue'; saveSelText(text, first?.x, first?.y, first?.w, first?.h, rects); hlColor.value='yellow' } },
      { label: '粉色', icon: 'Sunny' as any, action: () => { hlColor.value='pink'; saveSelText(text, first?.x, first?.y, first?.w, first?.h, rects); hlColor.value='yellow' } },
    ]},
    { label: '询问 AI', icon: 'ChatDotRound' as any, action: () => emit('ask-ai', { quote: text, question: '请分析这段内容。', bookId: bookId.value!, page: page.value }) },
    { label: '生成闪卡', icon: 'Plus' as any, action: () => makeCardFromSelection(text) },
    { label: '创建关联笔记', icon: 'DocumentAdd' as any, action: () => createLinkedNote(text) },
    { label: '复制本页跳转链接', icon: 'Link' as any, action: () => copyPageLink() },
    { separator: true },
    { label: '批注参数…', icon: 'Setting' as any, action: () => { annSettingsOpen.value = true } },
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

async function openHighlightBlock(highlight: any) {
  const blocks = await window.lk.blockForSource('highlight', highlight.id)
  if (!blocks.length) { ElMessage.warning('该划线还没有可跳转的内容块'); return }
  window.dispatchEvent(new CustomEvent('lk:nav', { detail: { href: `app://block/${blocks[0].id}` } }))
}

function showMenuC(e: MouseEvent, stickyEl: HTMLElement) {
  const annId = stickyEl.dataset.annId || ''
  const stickyPage = Number(stickyEl.dataset.page || page.value)
  const colors = ['#fff9c4', '#c8e6c9', '#bbdefb', '#f8bbd0']
  const colorLabels = ['黄色', '绿色', '蓝色', '粉色']
  menu.open(e, [
    ...colors.map((c, i) => ({ label: colorLabels[i], icon: 'CircleCheck' as any, action: () => changeStickyColor(annId, stickyPage, c) })),
    { separator: true },
    { label: '复制便签', icon: 'CopyDocument' as any, action: () => duplicateSticky(annId, stickyPage) },
    { label: '转为关联笔记', icon: 'DocumentAdd' as any, action: () => createLinkedNote(stickyEl.querySelector('textarea')?.value || '') },
    { label: '复制本页跳转链接', icon: 'Link' as any, action: () => copyPageLink(stickyPage) },
    { label: '询问 AI：此便签', icon: 'ChatDotRound' as any, action: () => {
      const ta = stickyEl.querySelector('textarea')
      emit('ask-ai', { quote: ta?.value || '', question: '请解释并整理这张便签。', bookId: bookId.value!, page: stickyPage })
    }},
    { separator: true },
    { label: '删除', icon: 'Delete' as any, danger: true, action: () => { window.lk.annDelete(annId).then(() => renderPage()) } },
  ])
}

async function addStickyAt(e: MouseEvent, prefillText?: string) {
  const c = pageHost.value?.querySelector('.page-container') as HTMLElement
  if (!c) return
  const targetPage = page.value
  const cr = c.getBoundingClientRect()
  const x = Math.max(0, Math.min(1, (e.clientX - cr.left) / cr.width))
  const y = Math.max(0, Math.min(1, (e.clientY - cr.top) / cr.height))
  await window.lk.annSave({ bookId: bookId.value, page: targetPage, type: 'sticky', data: JSON.stringify({ coord: 'normalized', x, y, w: 130, h: 60, text: prefillText || '', color: '#fff9c4' }) })
  if (page.value === targetPage) renderPage()
}

async function changeStickyColor(annId: string, stickyPage: number, color: string) {
  const rows = await window.lk.annList(bookId.value!, stickyPage)
  const r = rows.find((x: any) => x.id === annId)
  if (!r) return
  const d = JSON.parse(r.data || '{}')
  await window.lk.annSave({ id: annId, bookId: bookId.value, page: stickyPage, type: 'sticky', data: JSON.stringify({ ...d, color }) })
  if (page.value === stickyPage) renderPage()
}

async function duplicateSticky(annId: string, stickyPage: number) {
  const rows = await window.lk.annList(bookId.value!, stickyPage)
  const r = rows.find((x: any) => x.id === annId)
  if (!r) return
  const d = JSON.parse(r.data || '{}')
  const delta = d.coord === 'normalized' ? 0.02 : 12
  await window.lk.annSave({ bookId: bookId.value, page: stickyPage, type: 'sticky', data: JSON.stringify({ ...d, x: Number(d.x || 0) + delta, y: Number(d.y || 0) + delta }) })
  if (page.value === stickyPage) renderPage()
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
  const rects = selectionRects(sel)
  const first = rects[0]
  const wr = wrap.value!.getBoundingClientRect()
  selPopup.value = { show: true, x: Math.min(e.clientX - wr.left, wr.width - 260), y: Math.max(40, e.clientY - wr.top - 50), text, rectX: first?.x ?? null, rectY: first?.y ?? null, rectW: first?.w ?? null, rectH: first?.h ?? null, rects }
  aiMenuOpen.value = false
}

function checkHighlightClick(e: MouseEvent) {
  const container = pageHost.value?.querySelector('.page-container') as HTMLElement
  if (!container) return
  const cr = container.getBoundingClientRect()
  const nx = (e.clientX - cr.left) / cr.width
  const ny = (e.clientY - cr.top) / cr.height
  const hit = highlights.value.find((h: any) => h.page === page.value && rectsForHighlight(h).some((rect) => nx >= rect.x && nx <= rect.x + rect.w && ny >= rect.y && ny <= rect.y + rect.h))
  if (hit) {
    const wr = wrap.value!.getBoundingClientRect()
    hlActionBar.value = { show: true, x: Math.min(e.clientX - wr.left, wr.width - 240), y: Math.max(10, e.clientY - wr.top - 40), id: hit.id, text: hit.text, color: hit.color || 'yellow' }
  }
}
function copySelection() { navigator.clipboard.writeText(selPopup.value.text); ElMessage.success('Copied'); selPopup.value.show = false }
function askSel(q: string) { emit('ask-ai', { quote: selPopup.value.text, question: q, bookId: bookId.value!, page: page.value }); selPopup.value.show = false; aiMenuOpen.value = false }
async function saveSel() {
  const sp = selPopup.value
  await saveSelText(sp.text, sp.rectX, sp.rectY, sp.rectW, sp.rectH, sp.rects)
  selPopup.value.show = false
}
async function saveSelText(text: string, rx?: number|null, ry?: number|null, rw?: number|null, rh?: number|null, rects: HighlightRect[] = []) {
  await window.lk.highlightAdd({ bookId: bookId.value, page: page.value, text, color: hlColor.value, rectX: rx ?? null, rectY: ry ?? null, rectW: rw ?? null, rectH: rh ?? null, rectsJson: rects.length ? JSON.stringify(rects) : null })
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
  if (matchesShortcut(e, settings.getShortcut('pageLeft')) || (!e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'ArrowUp')) { e.preventDefault(); prevPage() }
  else if (matchesShortcut(e, settings.getShortcut('pageRight')) || (!e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'ArrowDown')) { e.preventDefault(); nextPage() }
  else if (matchesShortcut(e, settings.getShortcut('pageFirst'))) { e.preventDefault(); goPage(1) }
  else if (matchesShortcut(e, settings.getShortcut('pageLast'))) { e.preventDefault(); goPage(totalPages.value) }
  else if (matchesShortcut(e, settings.getShortcut('centerPage'))) { e.preventDefault(); recenterPage() }
  else if (matchesShortcut(e, settings.getShortcut('addBookmark'))) { e.preventDefault(); addBookmark() }
  else if (matchesShortcut(e, settings.getShortcut('cancel'))) { selPopup.value.show = false; aiMenuOpen.value = false; if (annMode.value) { annMode.value = false; renderPage() } }
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
    const sourceLink = `app://book/${bookId.value}?page=${data.startPage}`
    await window.lk.notesUpsert({ id: noteId, title: '引用 · ' + refTitle, body: `来源：[返回电子书原文](${sourceLink})\n\n${quote}`, kind: 'note', sort: Date.now() })
    await window.lk.linkRelate('book', bookId.value || '', 'note', noteId, 'source')
    ElMessage.success('关联笔记已创建')
    window.dispatchEvent(new CustomEvent('lk:nav', { detail: { href: `app://note/${noteId}` } }))
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
  window.addEventListener('lk:before-close', onBeforeAppClose)
})
onBeforeUnmount(() => {
  // Capture the last viewport anchor while the page DOM still exists.
  void Promise.allSettled([flushStickySaves(), flushReaderViewState()])
})
onUnmounted(() => {
  readerUnmounted = true
  renderEpoch++
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('lk:before-close', onBeforeAppClose)
  void Promise.resolve(pdfDoc?.destroy()).catch(() => undefined)
  pdfDoc = null
})

function onBeforeAppClose(event: Event) {
  const detail = (event as CustomEvent<{ waitUntil?: (promise: Promise<unknown>) => void }>).detail
  detail?.waitUntil?.(Promise.allSettled([flushStickySaves(), flushReaderViewState()]))
}
</script>

<style scoped lang="scss">
.reader-root { flex:1; display:flex; min-width:0; min-height:0; overflow:hidden; background:var(--bg); position:relative; }
.side { width:240px; background:var(--bg-soft); border-right:1px solid var(--border); display:flex; flex-direction:column; flex-shrink:0; overflow:hidden; transition:width 0.2s; }
.side:not(.open) { width:0; min-width:0; border:none; }
.side-tabs { display:flex; border-bottom:1px solid var(--border); flex-shrink:0; }
.side-tabs button { flex:1; padding:8px; border:none; background:transparent; color:var(--text-dim); cursor:pointer; &.active { color:var(--accent); border-bottom:2px solid var(--accent) } }
.side-body { flex:1; overflow:auto; padding:8px 10px; font-size:13px; }
.toc-item { padding:4px 6px; cursor:pointer; border-radius:4px; display:flex; align-items:center; gap:8px; min-width:0; &:hover { background:rgba(127,127,127,0.12) } }
.toc-item span { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.toc-item em { color:var(--text-dim); font-size:10px; font-style:normal; }
.toc-edit-hint { margin:6px 4px 0; color:var(--text-dim); font-size:10px; text-align:center; }
.toc-build { width:100%; margin-top:10px; }
.toc-build + .toc-build { margin-left:0; }
.mark { display:flex; gap:4px; align-items:center; padding:4px 0; border-bottom:1px dashed var(--border); cursor:pointer; }
.linked-note { display:flex; flex-direction:column; gap:3px; padding:8px 6px; border-bottom:1px solid var(--border); cursor:pointer; border-radius:5px; }
.linked-note:hover { background:rgba(127,127,127,0.12); }
.linked-note strong { color:var(--text); font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.linked-note span { color:var(--text-dim); font-size:10px; }
.hl { padding:6px 4px; border-left:2px solid #d4b469; margin-bottom:6px; cursor:pointer; }
.hl-text { font-size:12px; max-height:60px; overflow:hidden; }
.main { flex:1; display:flex; flex-direction:column; min-width:0; }
.ctrl { height:38px; flex:0 0 38px; display:flex; align-items:center; gap:6px; padding:0 12px; background:var(--bg-soft); border-bottom:1px solid var(--border); overflow-x:auto; overflow-y:hidden; }
.title { font-weight:600; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.spacer { flex:1; }
.page-input { width:58px; }
:deep(.page-input .el-input__inner) { text-align:center; padding:0 4px; color:var(--text) !important; -webkit-text-fill-color:var(--text) !important; font-weight:700; opacity:1; }
.current-page-label { color:var(--text); font-size:12px; font-weight:700; white-space:nowrap; padding:2px 7px; border-radius:999px; background:var(--bg-elev); border:1px solid var(--border); }
.pg-total { font-size:12px; color:var(--text-dim); white-space:nowrap; }
.zoom-lbl { font-size:11px; color:var(--text-dim); min-width:36px; }
.ann-toolbar { display:flex; align-items:center; gap:4px; padding:4px 12px; background:var(--bg-soft); border-bottom:1px solid var(--border); flex-wrap:wrap; font-size:12px; }.ann-hint { color:var(--text-dim); font-size:11px; }
.ann-settings { display:grid; gap:14px; }.ann-settings section { padding:12px; border:1px solid var(--border); border-radius:10px; background:var(--bg-soft); }.ann-settings section.highlighter-settings { border-color:color-mix(in srgb,#d5c832 55%,var(--border)); background:color-mix(in srgb,#fff6a8 13%,var(--bg-soft)); }.ann-settings header { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:10px; }.ann-settings header strong { color:var(--text); }.ann-settings header span { color:var(--text-dim); font-size:11px; }.ann-setting-row { display:grid; grid-template-columns:74px minmax(0,1fr) 44px; align-items:center; gap:10px; min-height:36px; }.ann-setting-row label { color:var(--text-secondary); font-size:12px; }.ann-setting-row small { color:var(--text-dim); text-align:right; }.ann-setting-row :deep(.el-color-picker) { grid-column:2; }
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
.toc-import-tip { margin:0 0 10px; color:var(--text-secondary); font-size:13px; line-height:1.6; }
.toc-import-tip code { color:var(--accent); background:var(--bg-soft); padding:1px 4px; border-radius:4px; }
.toc-import-options { display:flex; align-items:center; gap:10px; margin:12px 0; }
.toc-import-options .muted { color:var(--text-dim); font-size:12px; }
.toc-preview-head { color:var(--text); font-weight:700; margin-bottom:6px; }
.toc-preview { max-height:220px; overflow:auto; border:1px solid var(--border); border-radius:8px; background:var(--bg-soft); }
.toc-preview-row { min-height:30px; display:flex; align-items:center; justify-content:space-between; gap:12px; padding-right:10px; border-bottom:1px solid var(--border); color:var(--text); font-size:12px; }
.toc-preview-row:last-child { border-bottom:none; }
.toc-preview-row b { color:var(--accent); white-space:nowrap; }

/* PDF.js text layer - enables text selection like browser PDF viewer */
:deep(.textLayer) { position:absolute; text-align:initial; inset:0; overflow:hidden; opacity:1; line-height:1; text-size-adjust:none; forced-color-adjust:none; transform-origin:0 0; }
:deep(.textLayer) :is(span, br) { color:transparent; position:absolute; white-space:pre; cursor:text; transform-origin:0% 0%; }
:deep(.textLayer) span.markedContent { top:0; height:0; }
:deep(.textLayer) ::selection { background:rgba(0,100,255,0.3); }
:deep(.textLayer) br::selection { background:transparent; }
</style>
