<template>
  <section class="notebook-shell" @keydown.capture="onKeydown" @keyup.capture="onKeyup" @beforeinput.capture="onBeforeInput" @copy.capture="onNotebookCopy" @cut.capture="onNotebookCut" @pointerdown.capture="onPointerDownCapture">
    <div class="notebook-tools">
      <div class="page-nav"><el-button size="small" text aria-label="上一双页" @click="turn(-1)" :disabled="spread === 0">←</el-button><span class="page-indicator">第 {{ spread * 2 + 1 }}–{{ spread * 2 + 2 }} 页</span><el-button size="small" text aria-label="下一双页" @click="turn(1)">→</el-button></div>
      <el-button size="small" text data-testid="notebook-outline-toggle" :type="outlineOpen ? 'primary' : 'default'" @click="toggleOutline">目录</el-button>
      <span class="tool-sep"></span>
      <el-popover v-model:visible="inkSettingsOpen" placement="bottom-start" :width="380" trigger="click">
        <template #reference><el-button size="small" data-testid="notebook-ink-settings" :type="drawingEnabled ? 'primary' : 'default'">批注参数</el-button></template>
        <div class="tool-popover pen-popover">
          <div><b>工具</b><el-button size="small" :type="tool === 'select' ? 'primary' : 'default'" @click="setTool('select')">选择</el-button><el-button size="small" :type="tool === 'pen' ? 'primary' : 'default'" @click="setTool('pen')">画笔</el-button><el-button size="small" :type="tool === 'highlighter' ? 'primary' : 'default'" @click="setTool('highlighter')">荧光笔</el-button><el-button size="small" :type="tool === 'eraser' ? 'primary' : 'default'" @click="setTool('eraser')">橡皮</el-button></div>
          <div><b>图形</b><el-button size="small" @click="setTool('line')">直线</el-button><el-button size="small" @click="setTool('arrow')">箭头</el-button><el-button size="small" @click="setTool('rectangle')">方框</el-button><el-button size="small" @click="setTool('ellipse')">圆形</el-button></div>
          <div><b>画笔色</b><el-color-picker v-model="inkColor" show-alpha @change="saveInkSettings" /><div class="ink-presets"><button v-for="color in inkPresets" :key="color" :style="{ background: color }" :title="color" @click="inkColor=color; saveInkSettings()"></button></div></div>
          <div><b>画笔粗细</b><el-slider v-model="inkWidth" :min="1" :max="16" :step="1" show-input size="small" @change="saveInkSettings" /></div>
          <div><b>荧光色</b><el-color-picker v-model="highlighterColor" @change="saveInkSettings" /><div class="ink-presets"><button v-for="color in highlighterPresets" :key="color" :style="{ background: color }" :title="color" @click="highlighterColor=color; saveInkSettings()"></button></div></div>
          <div><b>荧光宽度</b><el-slider v-model="highlighterWidth" :min="4" :max="30" :step="1" show-input size="small" @change="saveInkSettings" /></div>
          <div><b>透明度</b><el-slider v-model="highlighterOpacity" :min="0.08" :max="0.55" :step="0.01" :format-tooltip="opacityLabel" show-input size="small" @change="saveInkSettings" /></div>
          <small>画笔设置也用于直线、箭头和图形；荧光笔使用独立颜色、宽度与透明度。</small>
        </div>
      </el-popover>
      <el-popover placement="bottom-start" :width="350" trigger="click"><template #reference><el-button size="small">版式</el-button></template><div class="tool-popover"><div class="global-layout-row"><b>应用范围</b><el-switch v-model="globalLayoutEnabled" data-testid="notebook-global-layout" @change="onGlobalLayoutToggle" /><span>所有笔记共用此版式</span></div><small>{{ globalLayoutEnabled ? '已开启：现有笔记和新笔记都会使用这里的版式。' : '已关闭：当前笔记单独保存版式。' }}</small><div><b>纸张</b><el-button size="small" @click="setTool('hand')">移动纸张</el-button><el-button size="small" @click="resetView">居中</el-button></div><div class="layout-grid"><span>字体</span><el-select v-model="layout.fontFamily" size="small" data-testid="notebook-font-family" @change="onLayoutChange"><el-option v-for="font in fontOptions" :key="font.value" :label="font.label" :value="font.value" /></el-select><span>字号</span><el-select v-model="layout.fontSize" size="small" data-testid="notebook-font-size" @change="onLayoutChange"><el-option v-for="size in [12, 14, 16, 18, 20, 22, 24, 28, 32]" :key="size" :label="`${size}px`" :value="size" /></el-select><span>每页行</span><el-input-number v-model="layout.linesPerPage" :min="12" :max="48" size="small" @change="onLayoutChange" /><span>纸张宽</span><el-input-number v-model="layout.pageWidth" :min="420" :max="860" :step="20" size="small" @change="onLayoutChange" /><span>每行字</span><el-input-number v-model="layout.charsPerLine" :min="12" :max="80" size="small" @change="onLayoutChange" /></div></div></el-popover>
      <el-button size="small" text @click="undo" :disabled="!undoHistory.length">撤销</el-button><el-button size="small" text @click="redo" :disabled="!redoHistory.length">重做</el-button>
      <span class="tool-sep"></span><span class="zoom-hint">Ctrl + 滚轮 · {{ Math.round(viewScale * 100) }}%</span>
      <span v-if="wholeNotebookSelected" class="whole-selection-hint" aria-live="polite">已全选整本 · {{ selectedPaperCount }} 页</span>
      <el-dropdown class="notebook-more" @command="handleMore"><el-button size="small" text>···</el-button><template #dropdown><el-dropdown-menu><el-dropdown-item command="selectAll">全选整本笔记</el-dropdown-item><el-dropdown-item command="clear">清除本页笔迹</el-dropdown-item><el-dropdown-item command="copy" :disabled="!selectedObject">复制选中对象</el-dropdown-item><el-dropdown-item command="smaller" :disabled="!selectedObject">缩小选中对象</el-dropdown-item><el-dropdown-item command="larger" :disabled="!selectedObject">放大选中对象</el-dropdown-item><el-dropdown-item command="delete" :disabled="!selectedObject" divided>删除选中对象</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
    </div>
    <aside v-if="outlineOpen" class="notebook-outline" data-testid="notebook-outline">
      <header><strong>笔记目录</strong><button title="关闭目录" @click="outlineOpen=false">×</button></header>
      <button v-for="item in outlineItems" :key="item.id" class="outline-entry" :style="{ paddingLeft: `${10 + (item.level - 1) * 16}px` }" @click="goToHeading(item)"><span>{{ item.text }}</span><small>{{ item.spread * 2 + (item.side === 'left' ? 1 : 2) }}</small></button>
      <p v-if="!outlineItems.length">还没有标题。选中文字后使用 H1/H2/H3 即可生成目录。</p>
    </aside>
    <div class="book-table" :class="{ grabbing: panning, 'hand-tool': tool === 'hand', 'whole-selected': wholeNotebookSelected }" tabindex="0" @wheel="onWheel" @pointerdown="startPan" @pointermove="movePan" @pointerup="endPan" @pointercancel="endPan" @contextmenu.stop.prevent="onContextMenu">
      <div class="book-spread" :style="{ transform: `translate(${panX}px, ${panY}px) scale(${viewScale})` }">
      <div class="book-cover-shadow"></div>
      <article class="paper left-paper" :style="paperStyle">
        <div class="page-number">{{ spread * 2 + 1 }}</div>
        <div ref="leftText" class="paper-text" data-testid="notebook-page-left" :style="paperTextStyle" contenteditable="true" spellcheck="true" @input="onText('left', $event)" @paste="onPaste('left', $event)" @click="onPaperClick" @focus="activeSide = 'left'" @mouseup="rememberTextSelection('left')" @keyup="rememberTextSelection('left')" data-placeholder="点击纸页直接开始写笔记…"></div>
        <canvas ref="leftCanvas" class="ink" :class="{ active: inkInteractive }" width="1500" height="1900" @pointerdown.stop="startInk('left', $event)" @pointermove.stop="moveInk($event)" @pointerup.stop="endInk" @pointerleave.stop="endInk" />
      </article>
      <div class="spine"></div>
      <article class="paper right-paper" :style="paperStyle">
        <div class="page-number">{{ spread * 2 + 2 }}</div>
        <div ref="rightText" class="paper-text" data-testid="notebook-page-right" :style="paperTextStyle" contenteditable="true" spellcheck="true" @input="onText('right', $event)" @paste="onPaste('right', $event)" @click="onPaperClick" @focus="activeSide = 'right'" @mouseup="rememberTextSelection('right')" @keyup="rememberTextSelection('right')" data-placeholder="点击纸页直接开始写笔记…"></div>
        <canvas ref="rightCanvas" class="ink" :class="{ active: inkInteractive }" width="1500" height="1900" @pointerdown.stop="startInk('right', $event)" @pointermove.stop="moveInk($event)" @pointerup.stop="endInk" @pointerleave.stop="endInk" />
      </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { getStroke } from 'perfect-freehand'
import { renderMarkdown } from '../helpers/markdown'
import { useContextMenu } from '../stores/context-menu'
import DOMPurify from 'dompurify'
import katex from 'katex'
import { ElMessage } from 'element-plus'

type Point = [number, number, number]
type InkObject = { id: string; kind: 'stroke' | 'line' | 'arrow' | 'rectangle' | 'ellipse'; color: string; width: number; opacity?: number; blendMode?: 'source-over' | 'multiply'; points?: Point[]; start?: Point; end?: Point }
type Sheet = { left: string; right: string; leftInk: string; rightInk: string; leftObjects: InkObject[]; rightObjects: InkObject[] }
type FontFamily = 'kaiti' | 'songti' | 'sans' | 'serif' | 'mono'
type NotebookLayout = { fontSize: number; fontFamily: FontFamily; linesPerPage: number; charsPerLine: number; pageWidth: number }
type InkSettings = { color: string; width: number; highlighterColor: string; highlighterWidth: number; highlighterOpacity: number }
type NotebookData = { pages: Sheet[]; layout: NotebookLayout; ink: InkSettings }
const MARKER = '<!-- lk:notebook:v1 -->\n'
const DEFAULT_LAYOUT: NotebookLayout = { fontSize: 18, fontFamily: 'kaiti', linesPerPage: 18, charsPerLine: 28, pageWidth: 560 }
const GLOBAL_LAYOUT_ENABLED_KEY = 'lk_notebook_global_layout_enabled_v1'
const GLOBAL_LAYOUT_KEY = 'lk_notebook_global_layout_v1'
const fontOptions: Array<{ value: FontFamily; label: string }> = [
  { value: 'kaiti', label: '楷体（手写感）' }, { value: 'songti', label: '宋体（书页）' },
  { value: 'sans', label: '微软雅黑' }, { value: 'serif', label: '衬线体' }, { value: 'mono', label: '等宽字体' }
]
const DEFAULT_INK: InkSettings = { color: '#4d4a42', width: 3, highlighterColor: '#ffe066', highlighterWidth: 12, highlighterOpacity: .22 }
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'dirty'): void
  (e: 'open-ai', value: { context: string; label: string; action?: string }): void
  (e: 'create-location-link', value: { spread: number; anchorId: string; quote: string }): void
  (e: 'link-selection', value: { label: string }): void
  (e: 'outline-change', value: OutlineItem[]): void
}>()
const menu = useContextMenu()
const leftText = ref<HTMLElement | null>(null)
const rightText = ref<HTMLElement | null>(null)
const leftCanvas = ref<HTMLCanvasElement | null>(null)
const rightCanvas = ref<HTMLCanvasElement | null>(null)
const pages = ref<Sheet[]>([])
const layout = ref<NotebookLayout>({ ...DEFAULT_LAYOUT })
const globalLayoutEnabled = ref(localStorage.getItem(GLOBAL_LAYOUT_ENABLED_KEY) === 'true')
const spread = ref(0)
const activeSide = ref<'left' | 'right'>('left')
const wholeNotebookSelected = ref(false)
const selectedPaperCount = computed(() => Math.max(1, pages.value.length * 2))
const outlineOpen = ref(false)
type OutlineItem = { id: string; text: string; level: number; spread: number; side: 'left' | 'right'; page: number }
const outlineItems = ref<OutlineItem[]>([])
type RevealTarget = { id: string; spread: number; side?: 'left' | 'right'; className: 'heading-revealed' | 'revealed' }
let pendingReveal: RevealTarget | null = null
let revealRequest = 0
let savedTextRange: Range | null = null
type Tool = 'text' | 'select' | 'hand' | 'pen' | 'highlighter' | 'line' | 'arrow' | 'rectangle' | 'ellipse' | 'eraser'
const tool = ref<Tool>('text')
const inkSettingsOpen = ref(false)
const inkColor = ref(DEFAULT_INK.color)
const inkWidth = ref(DEFAULT_INK.width)
const highlighterColor = ref(DEFAULT_INK.highlighterColor)
const highlighterWidth = ref(DEFAULT_INK.highlighterWidth)
const highlighterOpacity = ref(DEFAULT_INK.highlighterOpacity)
const inkPresets = ['#4d4a42', '#315b8a', '#b44b45', '#3d8a64', '#d58b22', '#7049a6']
const highlighterPresets = ['#ffe066', '#ffb3c1', '#a7f3d0', '#a5d8ff', '#d8b4fe', '#ffd8a8']
const viewScale = ref(1)
const panX = ref(0)
const panY = ref(0)
const drawingEnabled = computed(() => !['text', 'select', 'hand'].includes(tool.value))
const inkInteractive = computed(() => !['text', 'hand'].includes(tool.value))
let drawing = false
let drawingSide: 'left' | 'right' = 'left'
let startPoint: Point | null = null
let currentObject: InkObject | null = null
let dragLast: Point | null = null
const selectedObject = ref<{ side: 'left' | 'right'; id: string } | null>(null)
const panning = ref(false)
let spacePanHeld = false
let panStart = { x: 0, y: 0, left: 0, top: 0 }
let lastSerialized = ''
const undoHistory = ref<string[]>([])
const redoHistory = ref<string[]>([])
const MAX_HISTORY = 80

function blank(): Sheet { return { left: '', right: '', leftInk: '', rightInk: '', leftObjects: [], rightObjects: [] } }
function looksLikeFormulaSource(value: string) {
  return /\\(?:frac|left|right|lim|int|iint|sum|prod|begin|end|mathrm|text|cdot|partial|quad)|[_^]\s*(?:\{|[A-Za-z0-9])/m.test(value)
}
function restoreBracketMathDelimiters(value: string) {
  const lines = value.replace(/\r\n?/g, '\n').split('\n')
  let changed = false
  for (let start = 0; start < lines.length; start += 1) {
    if (lines[start].trim() !== '[') continue
    const endOffset = lines.slice(start + 1).findIndex((line) => line.trim() === ']')
    if (endOffset < 0) continue
    const end = start + endOffset + 1
    const source = lines.slice(start + 1, end).join('\n')
    if (!looksLikeFormulaSource(source)) continue
    lines[start] = '\\['
    lines[end] = '\\]'
    changed = true
    start = end
  }
  return changed ? lines.join('\n') : value
}
function repairLegacyFormulaBlocks(html: string) {
  if (!html || !html.includes('[') || !html.includes(']')) return html
  const holder = document.createElement('div')
  holder.innerHTML = html
  let changed = false
  for (let guard = 0; guard < 100; guard += 1) {
    const blocks = Array.from(holder.children)
    const start = blocks.findIndex((block) => block.textContent?.trim() === '[' && !block.hasAttribute('data-lk-bracket-scanned'))
    if (start < 0) break
    const endOffset = blocks.slice(start + 1).findIndex((block) => block.textContent?.trim() === ']')
    if (endOffset < 0) break
    const end = start + endOffset + 1
    const source = blocks.slice(start + 1, end).map((block) => block.textContent || '').join('\n').trim()
    if (!looksLikeFormulaSource(source)) {
      blocks[start].setAttribute('data-lk-bracket-scanned', 'true')
      continue
    }
    const replacement = document.createElement('div')
    replacement.innerHTML = formulaMarkup(source, true)
    const formula = replacement.firstElementChild
    if (!formula) break
    blocks[start].replaceWith(formula)
    for (const block of blocks.slice(start + 1, end + 1)) block.remove()
    changed = true
  }
  holder.querySelectorAll('[data-lk-bracket-scanned]').forEach((block) => block.removeAttribute('data-lk-bracket-scanned'))
  return changed ? holder.innerHTML : html
}
function normaliseSheet(value: Partial<Sheet>): Sheet {
  return { ...blank(), ...value, left: repairLegacyFormulaBlocks(value.left || ''), right: repairLegacyFormulaBlocks(value.right || ''), leftObjects: Array.isArray(value.leftObjects) ? value.leftObjects : [], rightObjects: Array.isArray(value.rightObjects) ? value.rightObjects : [] }
}
function validPages(value: unknown): Sheet[] {
  return Array.isArray(value) && value.length ? value.map((page) => normaliseSheet(page || {})) : [blank()]
}
function normaliseLayout(value: Partial<NotebookLayout> | null | undefined): NotebookLayout {
  const fontFamily = fontOptions.some((font) => font.value === value?.fontFamily) ? value!.fontFamily! : DEFAULT_LAYOUT.fontFamily
  return {
    fontFamily,
    fontSize: Math.max(12, Math.min(32, Number(value?.fontSize) || DEFAULT_LAYOUT.fontSize)),
    linesPerPage: Math.max(12, Math.min(48, Number(value?.linesPerPage) || DEFAULT_LAYOUT.linesPerPage)),
    charsPerLine: Math.max(12, Math.min(80, Number(value?.charsPerLine) || DEFAULT_LAYOUT.charsPerLine)),
    pageWidth: Math.max(420, Math.min(860, Number(value?.pageWidth) || DEFAULT_LAYOUT.pageWidth))
  }
}
function readGlobalLayout() {
  try {
    const value = JSON.parse(localStorage.getItem(GLOBAL_LAYOUT_KEY) || 'null')
    return value && typeof value === 'object' ? normaliseLayout(value) : null
  } catch { return null }
}
function saveGlobalLayout() {
  localStorage.setItem(GLOBAL_LAYOUT_KEY, JSON.stringify(normaliseLayout(layout.value)))
}
function parse(value: string): NotebookData {
  if (value.startsWith(MARKER)) {
    try {
      const data = JSON.parse(value.slice(MARKER.length))
      if (Array.isArray(data.pages) && data.pages.length) {
        return {
          pages: validPages(data.pages),
          layout: normaliseLayout(data.layout),
          ink: { ...DEFAULT_INK, ...(data.ink || {}) }
        }
      }
    } catch { /* use fallback */ }
  }
  return { pages: [{ ...blank(), left: value ? renderMarkdown(value) : '' }], layout: { ...DEFAULT_LAYOUT }, ink: { ...DEFAULT_INK } }
}
function serialize() {
  if (!pages.value.length) pages.value = [blank()]
  return MARKER + JSON.stringify({ pages: validPages(pages.value), layout: layout.value, ink: { color: inkColor.value, width: inkWidth.value, highlighterColor: highlighterColor.value, highlighterWidth: highlighterWidth.value, highlighterOpacity: highlighterOpacity.value } })
}
const lineHeight = computed(() => Math.max(30, Math.round(layout.value.fontSize * 1.85)))
const paperStyle = computed(() => ({ '--notebook-line-height': `${lineHeight.value}px`, '--notebook-paper-height': `${Math.max(520, lineHeight.value * layout.value.linesPerPage + 88)}px`, '--notebook-page-width': `${Math.max(420, Math.min(860, layout.value.pageWidth))}px` }))
function fontStack(font: FontFamily) {
  return ({ kaiti: "'KaiTi','STKaiti','Microsoft YaHei',serif", songti: "'SimSun','STSong',serif", sans: "'Microsoft YaHei','Segoe UI',sans-serif", serif: "Georgia,'Noto Serif SC','SimSun',serif", mono: "'Cascadia Code','JetBrains Mono',Consolas,monospace" } as Record<FontFamily, string>)[font]
}
const paperTextStyle = computed(() => ({ fontSize: `${layout.value.fontSize}px`, lineHeight: 'var(--notebook-line-height)', fontFamily: fontStack(layout.value.fontFamily) }))
function syncPage() {
  const page = pages.value[spread.value] || blank()
  if (leftText.value) leftText.value.innerHTML = page.left
  if (rightText.value) rightText.value.innerHTML = page.right
  paint(leftCanvas.value, page.leftInk, page.leftObjects, selectedObject.value?.side === 'left' ? selectedObject.value.id : null)
  paint(rightCanvas.value, page.rightInk, page.rightObjects, selectedObject.value?.side === 'right' ? selectedObject.value.id : null)
  if (pendingReveal?.spread === spread.value) window.requestAnimationFrame(applyPendingReveal)
}
function syncOut(recordHistory = true) {
  const next = serialize()
  if (next === lastSerialized) return
  if (recordHistory && lastSerialized) {
    undoHistory.value.push(lastSerialized)
    if (undoHistory.value.length > MAX_HISTORY) undoHistory.value.shift()
    redoHistory.value = []
  }
  lastSerialized = next
  emit('update:modelValue', next)
  emit('dirty')
}
function turn(direction: number) {
  clearReveal()
  wholeNotebookSelected.value = false
  const next = spread.value + direction
  if (next < 0) return
  if (next >= pages.value.length) pages.value.push(blank())
  spread.value = next
  nextTick(syncPage)
}
function onText(side: 'left' | 'right', event: Event) {
  clearReveal()
  wholeNotebookSelected.value = false
  while (pages.value.length <= spread.value) pages.value.push(blank())
  const page = pages.value[spread.value]
  page[side] = (event.currentTarget as HTMLElement).innerHTML
  syncOut()
  nextTick(() => {
    reflowFrom(spread.value, side)
    refreshOutline()
  })
}

function refreshOutline() {
  const items: OutlineItem[] = []
  const seen = new Set<string>()
  let changed = false
  pages.value.forEach((page, pageIndex) => {
    for (const side of ['left', 'right'] as const) {
      const holder = document.createElement('div')
      holder.innerHTML = page[side]
      holder.querySelectorAll<HTMLElement>('h1,h2,h3').forEach((heading) => {
        let id = heading.id
        if (!id || seen.has(id)) {
          id = `lk-heading-${newObjectId()}`
          heading.id = id
          changed = true
        }
        seen.add(id)
        const text = (heading.textContent || '').trim() || '未命名标题'
        items.push({ id, text, level: Number(heading.tagName.slice(1)), spread: pageIndex, side, page: pageIndex * 2 + (side === 'left' ? 1 : 2) })
      })
      if (changed && page[side] !== holder.innerHTML) page[side] = holder.innerHTML
    }
  })
  outlineItems.value = items
  emit('outline-change', items.map((item) => ({ ...item })))
  if (changed) {
    syncOut()
    nextTick(syncPage)
  }
}
function toggleOutline() {
  outlineOpen.value = !outlineOpen.value
  if (outlineOpen.value) refreshOutline()
}
function goToHeading(item: OutlineItem) {
  revealOnPage({ id: item.id, spread: item.spread, side: item.side, className: 'heading-revealed' })
}
function goToHeadingId(id: string) {
  const item = outlineItems.value.find((heading) => heading.id === id)
  if (item) goToHeading(item)
}
function applyHeading(level: 1 | 2 | 3) {
  const element = anchorElement()
  if (!element) return
  element.focus()
  const selection = window.getSelection()
  if (savedTextRange && element.contains(savedTextRange.commonAncestorContainer)) {
    selection?.removeAllRanges()
    selection?.addRange(savedTextRange)
  }
  document.execCommand('formatBlock', false, `h${level}`)
  savedTextRange = null
  onText(activeSide.value, { currentTarget: element } as unknown as Event)
  nextTick(refreshOutline)
}
function rememberTextSelection(side: 'left' | 'right') {
  activeSide.value = side
  const element = side === 'left' ? leftText.value : rightText.value
  const selection = window.getSelection()
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null
  savedTextRange = range && element?.contains(range.commonAncestorContainer) ? range.cloneRange() : null
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char] || char))
}
function formulaMarkup(source: string, display = false) {
  try {
    return `<span class="lk-formula${display ? ' lk-formula-block' : ''}" contenteditable="false">${katex.renderToString(source.trim(), { displayMode: display, throwOnError: false, strict: 'ignore' })}</span>`
  } catch {
    return `<code class="lk-formula">${escapeHtml(source)}</code>`
  }
}
function readableEquation(value: string) {
  return value.replace(/[A-Za-z][A-Za-z0-9_]*/g, (word) => `\\mathrm{${word}}`)
}
function getFormula(line: string): { source: string; display: boolean } | null {
  const trimmed = line.trim()
  const display = trimmed.match(/^\$\$([\s\S]+)\$\$$/) || trimmed.match(/^\\\[([\s\S]+)\\\]$/)
  if (display) return { source: display[1], display: true }
  const inline = trimmed.match(/^\$([^$]+)\$$/) || trimmed.match(/^\\\((.+)\\\)$/)
  if (inline) return { source: inline[1], display: false }
  const simpleEquation = /^[A-Za-z][A-Za-z0-9_]*(?:\s*[=≠≤≥<>]\s*)[A-Za-z0-9_().,\s+*/^%-]+$/.test(trimmed)
  if (simpleEquation) return { source: readableEquation(trimmed), display: false }
  return null
}
function tableFromText(rows: string[]) {
  const body = rows.map((row) => `<tr>${row.split('\t').map((cell) => `<td>${escapeHtml(cell.trim())}</td>`).join('')}</tr>`).join('')
  return `<table class="lk-paste-table"><tbody>${body}</tbody></table>`
}
const appLinkPattern = /app:\/\/(?:note|block|book|conv|kp)\/[A-Za-z0-9._~-]+(?:\?[^\s<>()\[\]]*)?/g
function linkifyAppLinks(value: string) {
  let output = ''
  let cursor = 0
  for (const match of value.matchAll(appLinkPattern)) {
    const index = match.index ?? 0
    const href = match[0]
    output += escapeHtml(value.slice(cursor, index))
    output += `<a class="lk-app-link" href="${escapeHtml(href)}" title="点击跳转到引用位置">${escapeHtml(href)}</a>`
    cursor = index + href.length
  }
  return output + escapeHtml(value.slice(cursor))
}
function linkifyInlineAppMarkdown(value: string) {
  const pattern = /\[([^\]\n]+)\]\((app:\/\/(?:note|block|book|conv|kp)\/[A-Za-z0-9._~-]+(?:\?[^\s<>()\[\]]*)?)\)/g
  let output = ''
  let cursor = 0
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0
    output += linkifyAppLinks(value.slice(cursor, index))
    output += `<a class="lk-app-link" href="${escapeHtml(match[2])}" title="点击跳转到引用位置">${escapeHtml(match[1])}</a>`
    cursor = index + match[0].length
  }
  return output + linkifyAppLinks(value.slice(cursor))
}
function plainPasteMarkup(value: string) {
  const rows = restoreBracketMathDelimiters(value).replace(/\r\n?/g, '\n').split('\n')
  if (rows.length > 1 && rows.every((row) => row.includes('\t'))) return tableFromText(rows)
  return rows.map((line) => {
    const formula = getFormula(line)
    if (formula) return `<p>${formulaMarkup(formula.source, formula.display)}</p>`
    return line ? `<p>${linkifyInlineAppMarkdown(line)}</p>` : '<p><br></p>'
  }).join('')
}
function looksLikeMarkdownPaste(value: string) {
  return restoreBracketMathDelimiters(value) !== value || /(^|\n)\s{0,3}(?:#{1,6}\s+|>\s+|[-*+]\s+|\d+[.)]\s+|```|~~~|\|[^\n]+\|)|\*\*[^\n*]+\*\*|__[^\n_]+__|\$\$[\s\S]+?\$\$|\$[^$\n]+\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)/m.test(value)
}
function markdownPasteMarkup(value: string) {
  const holder = document.createElement('div')
  holder.innerHTML = renderMarkdown(restoreBracketMathDelimiters(value))
  holder.querySelectorAll<HTMLElement>('.katex-block').forEach((element) => {
    element.classList.add('lk-formula-block')
    element.contentEditable = 'false'
  })
  holder.querySelectorAll<HTMLElement>('.katex').forEach((element) => { element.contentEditable = 'false' })
  holder.querySelectorAll('table').forEach((table) => table.classList.add('lk-paste-table'))
  holder.querySelectorAll<HTMLAnchorElement>('a[href^="app://"]').forEach((anchor) => anchor.classList.add('lk-app-link'))
  return holder.innerHTML
}
function structuredPasteMarkup(value: string) {
  const clean = DOMPurify.sanitize(value, {
    ALLOWED_TAGS: ['p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'img', 'a', 'h1', 'h2', 'h3', 'h4'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'target']
  })
  const holder = document.createElement('div')
  holder.innerHTML = clean
  holder.querySelectorAll('table').forEach((table) => table.classList.add('lk-paste-table'))
  return holder.innerHTML
}
function onPaste(side: 'left' | 'right', event: ClipboardEvent) {
  const clipboard = event.clipboardData
  if (!clipboard) return
  const replaceWholeNotebook = wholeNotebookSelected.value
  const imageItem = Array.from(clipboard.items || []).find((item) => item.kind === 'file' && item.type.startsWith('image/'))
  const imageFile = imageItem?.getAsFile() || Array.from(clipboard.files || []).find((file) => file.type.startsWith('image/'))
  if (imageFile) {
    event.preventDefault()
    const target = event.currentTarget as HTMLElement
    const targetSpread = spread.value
    const selection = window.getSelection()
    const savedRange = selection?.rangeCount && target.contains(selection.getRangeAt(0).commonAncestorContainer) ? selection.getRangeAt(0).cloneRange() : null
    const reader = new FileReader()
    reader.onload = () => {
      const src = String(reader.result || '')
      if (replaceWholeNotebook) {
        replaceWholeNotebookWith(`<p><img src="${src}" alt="${escapeHtml(imageFile.name || '剪贴板截图')}" /></p>`)
        ElMessage.success('截图已替换整本笔记内容')
        return
      }
      if (!target.isConnected) { ElMessage.warning('笔记已切换，已取消粘贴截图'); return }
      target.focus()
      if (savedRange) {
        const currentSelection = window.getSelection()
        currentSelection?.removeAllRanges()
        currentSelection?.addRange(savedRange)
      }
      document.execCommand('insertHTML', false, `<img src="${src}" alt="${escapeHtml(imageFile.name || '剪贴板截图')}" />`)
      while (pages.value.length <= targetSpread) pages.value.push(blank())
      pages.value[targetSpread][side] = target.innerHTML
      syncOut()
      nextTick(() => reflowFrom(targetSpread, side))
      ElMessage.success('截图已粘贴到笔记')
    }
    reader.onerror = () => ElMessage.error('截图读取失败，请重试')
    reader.readAsDataURL(imageFile)
    return
  }
  event.preventDefault()
  const html = clipboard.getData('text/html')
  const text = clipboard.getData('text/plain')
  const structured = /<(?:table|ul|ol|img|pre|a|h[1-4])\b/i.test(html)
  // Clipboard HTML from AI/web pages is often a rendered companion of the
  // original Markdown. Prefer the plain Markdown source so multiline math,
  // headings, lists, blockquotes and tables go through one complete parser.
  const markup = text && looksLikeMarkdownPaste(text)
    ? markdownPasteMarkup(text)
    : structured ? structuredPasteMarkup(html) : plainPasteMarkup(text || html.replace(/<[^>]*>/g, ' '))
  if (replaceWholeNotebook) {
    replaceWholeNotebookWith(markup)
    return
  }
  const target = event.currentTarget as HTMLElement
  target.focus()
  document.execCommand('insertHTML', false, markup)
  onText(side, { currentTarget: target } as unknown as Event)
}
function htmlTextLength(html: string) {
  const holder = document.createElement('div')
  holder.innerHTML = html
  return (holder.textContent || '').length
}
function splitHtmlAt(html: string, offset: number): [string, string] {
  const holder = document.createElement('div')
  holder.innerHTML = html
  const walker = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT)
  let node: Text | null = walker.nextNode() as Text | null
  let used = 0
  while (node) {
    const length = node.data.length
    if (used + length >= offset) {
      let local = Math.max(1, offset - used)
      const before = node.data.slice(0, local)
      const breakAt = Math.max(before.lastIndexOf(' '), before.lastIndexOf('\n'))
      if (breakAt > Math.max(3, local - 36)) local = breakAt + 1
      const range = document.createRange()
      range.setStart(node, local)
      range.setEnd(holder, holder.childNodes.length)
      const tail = range.extractContents()
      const tailHolder = document.createElement('div')
      tailHolder.append(tail)
      return [holder.innerHTML, tailHolder.innerHTML]
    }
    used += length
    node = walker.nextNode() as Text | null
  }
  return [html, '']
}
function nextSlot(index: number, side: 'left' | 'right') {
  if (side === 'left') return { index, side: 'right' as const }
  return { index: index + 1, side: 'left' as const }
}
function makePaginationProbe(side: 'left' | 'right') {
  const source = side === 'left' ? leftText.value : rightText.value
  if (!source) return null
  const probe = source.cloneNode(false) as HTMLElement
  const computed = window.getComputedStyle(source)
  probe.contentEditable = 'false'
  // The clone is mounted outside `.paper`, so copy inherited values that affect line and table height.
  probe.style.setProperty('--notebook-line-height', computed.getPropertyValue('--notebook-line-height'))
  // client dimensions are layout dimensions. getBoundingClientRect would include the visual Ctrl+wheel scale.
  probe.style.cssText += `;position:fixed;visibility:hidden;pointer-events:none;left:-10000px;top:0;width:${source.clientWidth}px;height:${source.clientHeight}px;min-height:0;overflow:hidden;font-family:${computed.fontFamily};font-size:${computed.fontSize};line-height:${computed.lineHeight};padding:${computed.padding};box-sizing:${computed.boxSizing};`
  document.body.appendChild(probe)
  return probe
}
function hasVisualOverflow(element: HTMLElement) { return element.scrollHeight > element.clientHeight + 1 }
function splitRenderedHtml(html: string, probe: HTMLElement): [string, string] {
  probe.innerHTML = html
  if (!hasVisualOverflow(probe)) return [html, '']
  const holder = document.createElement('div')
  holder.innerHTML = html
  const blocks = Array.from(holder.childNodes)
  if (blocks.length > 1) {
    const head = document.createElement('div')
    for (let index = 0; index < blocks.length; index += 1) {
      head.appendChild(blocks[index].cloneNode(true))
      probe.innerHTML = head.innerHTML
      if (!hasVisualOverflow(probe)) continue
      head.removeChild(head.lastChild!)
      if (head.childNodes.length) {
        const tail = document.createElement('div')
        for (const node of blocks.slice(index)) tail.appendChild(node.cloneNode(true))
        return [head.innerHTML, tail.innerHTML]
      }
      break
    }
  }
  // A list/blockquote can be the only top-level block and still exceed one
  // page. Split it at child boundaries before falling back to character-level
  // Range extraction, which can otherwise leave empty list markers behind.
  if (holder.childElementCount === 1) {
    const container = holder.firstElementChild as HTMLElement
    if (['OL', 'UL', 'BLOCKQUOTE'].includes(container.tagName) && container.children.length > 1) {
      const head = container.cloneNode(false) as HTMLElement
      const tail = container.cloneNode(false) as HTMLElement
      const children = Array.from(container.children)
      for (let index = 0; index < children.length; index += 1) {
        head.appendChild(children[index].cloneNode(true))
        probe.innerHTML = head.outerHTML
        if (!hasVisualOverflow(probe)) continue
        head.lastElementChild?.remove()
        if (head.children.length) {
          for (const child of children.slice(index)) tail.appendChild(child.cloneNode(true))
          if (container.tagName === 'OL') {
            const start = Number(container.getAttribute('start') || 1)
            tail.setAttribute('start', String(start + head.children.length))
          }
          return [head.outerHTML, tail.outerHTML]
        }
        break
      }
    }
  }
  const length = htmlTextLength(html)
  let low = 1, high = Math.max(1, length - 1), best: [string, string] | null = null
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const candidate = splitHtmlAt(html, middle)
    if (!candidate[1] || candidate[0] === html) { high = middle - 1; continue }
    probe.innerHTML = candidate[0]
    if (hasVisualOverflow(probe)) high = middle - 1
    else { best = candidate; low = middle + 1 }
  }
  probe.innerHTML = html
  return best || [html, '']
}
function paginateOverflow(startIndex: number, startSide: 'left' | 'right') {
  let index = startIndex
  let side = startSide
  let moved = false
  const probe = makePaginationProbe(startSide)
  if (!probe) return false
  for (let guard = 0; guard < 400; guard += 1) {
    const sheet = pages.value[index]
    if (!sheet) break
    const [head, tail] = splitRenderedHtml(sheet[side], probe)
    if (!tail || head === sheet[side]) break
    sheet[side] = head
    const next = nextSlot(index, side)
    while (pages.value.length <= next.index) pages.value.push(blank())
    pages.value[next.index][next.side] = tail + pages.value[next.index][next.side]
    index = next.index; side = next.side; moved = true
  }
  probe.remove()
  return moved
}
function serialiseNode(node: Node) {
  const holder = document.createElement('div')
  holder.appendChild(node.cloneNode(true))
  return holder.innerHTML
}
function takeFirstBlock(html: string): [string, string] {
  const holder = document.createElement('div')
  holder.innerHTML = html
  const node = Array.from(holder.childNodes).find((item) => item.nodeType !== Node.TEXT_NODE || Boolean(item.textContent?.trim()))
  if (!node) return ['', html]
  const first = serialiseNode(node)
  node.remove()
  return [first, holder.innerHTML]
}
function findFollowingContent(index: number, side: 'left' | 'right') {
  let cursor = nextSlot(index, side)
  for (let guard = 0; guard < 400; guard += 1) {
    const sheet = pages.value[cursor.index]
    if (!sheet) return null
    if (sheet[cursor.side].trim()) return cursor
    cursor = nextSlot(cursor.index, cursor.side)
  }
  return null
}
function refillAvailableSpace(startIndex: number, startSide: 'left' | 'right') {
  const probe = makePaginationProbe(startSide)
  if (!probe) return false
  let index = startIndex
  let side = startSide
  let moved = false
  for (let guard = 0; guard < 400; guard += 1) {
    const current = pages.value[index]
    if (!current) break
    for (let fillGuard = 0; fillGuard < 400; fillGuard += 1) {
      const following = findFollowingContent(index, side)
      if (!following) break
      const source = pages.value[following.index]
      const [block, remainder] = takeFirstBlock(source[following.side])
      if (!block) break
      probe.innerHTML = current[side] + block
      if (hasVisualOverflow(probe)) break
      current[side] += block
      source[following.side] = remainder
      moved = true
    }
    const next = nextSlot(index, side)
    if (!pages.value[next.index]) break
    index = next.index
    side = next.side
  }
  probe.remove()
  return moved
}
function reflowFrom(startIndex: number, startSide: 'left' | 'right') {
  const flowedForward = paginateOverflow(startIndex, startSide)
  const flowedBackward = refillAvailableSpace(startIndex, startSide)
  if (!flowedForward && !flowedBackward) return
  // Reflow is the layout result of the preceding edit, not a separate user action.
  // Keep Ctrl+Z at one press per edit instead of first restoring an overflowing page.
  syncOut(false)
  nextTick(syncPage)
}
function paginateAll() {
  let changed = false
  for (let index = 0; index < pages.value.length; index += 1) {
    changed = paginateOverflow(index, 'left') || changed
    changed = paginateOverflow(index, 'right') || changed
  }
  changed = refillAvailableSpace(0, 'left') || changed
  if (changed) syncOut(false)
  nextTick(syncPage)
}
function onLayoutChange() {
  layout.value.fontSize = Number(layout.value.fontSize)
  if (!fontOptions.some((font) => font.value === layout.value.fontFamily)) layout.value.fontFamily = DEFAULT_LAYOUT.fontFamily
  layout.value.linesPerPage = Number(layout.value.linesPerPage)
  layout.value.charsPerLine = Number(layout.value.charsPerLine)
  layout.value.pageWidth = Math.max(420, Math.min(860, Number(layout.value.pageWidth) || DEFAULT_LAYOUT.pageWidth))
  if (globalLayoutEnabled.value) saveGlobalLayout()
  syncOut()
  nextTick(paginateAll)
}
function onGlobalLayoutToggle(enabled: boolean | string | number) {
  globalLayoutEnabled.value = Boolean(enabled)
  localStorage.setItem(GLOBAL_LAYOUT_ENABLED_KEY, String(globalLayoutEnabled.value))
  if (globalLayoutEnabled.value) {
    saveGlobalLayout()
    syncOut()
    ElMessage.success('已将当前版式设为所有笔记的共用版式')
  } else {
    ElMessage.info('已关闭共用版式；之后每篇笔记可单独调整')
  }
}
function currentCanvas(side: 'left' | 'right') { return side === 'left' ? leftCanvas.value : rightCanvas.value }
function point(canvas: HTMLCanvasElement, event: PointerEvent): Point { const rect = canvas.getBoundingClientRect(); return [(event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height, Math.max(.1, event.pressure || .5)] }
function objectKey(side: 'left' | 'right') { return side === 'left' ? 'leftObjects' : 'rightObjects' }
function newObjectId() { return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `ink-${Date.now()}-${Math.random().toString(36).slice(2)}` }
function bounds(object: InkObject): { x: number; y: number; w: number; h: number } {
  const points = object.points?.length ? object.points : [object.start, object.end].filter(Boolean) as Point[]
  if (!points.length) return { x: 0, y: 0, w: 0, h: 0 }
  const xs = points.map((point) => point[0]), ys = points.map((point) => point[1])
  const padding = object.width * 5
  const minX = Math.min(...xs) - padding, minY = Math.min(...ys) - padding
  return { x: minX, y: minY, w: Math.max(1, Math.max(...xs) - Math.min(...xs) + padding * 2), h: Math.max(1, Math.max(...ys) - Math.min(...ys) + padding * 2) }
}
function findObject(side: 'left' | 'right', at: Point): InkObject | null {
  const page = pages.value[spread.value]
  for (const object of [...page[objectKey(side)]].reverse()) {
    const box = bounds(object)
    if (at[0] >= box.x && at[0] <= box.x + box.w && at[1] >= box.y && at[1] <= box.y + box.h) return object
  }
  return null
}
function offsetObject(object: InkObject, dx: number, dy: number) {
  if (object.points) object.points = object.points.map(([x, y, pressure]) => [x + dx, y + dy, pressure])
  if (object.start) object.start = [object.start[0] + dx, object.start[1] + dy, object.start[2]]
  if (object.end) object.end = [object.end[0] + dx, object.end[1] + dy, object.end[2]]
}
function startInk(side: 'left' | 'right', event: PointerEvent) {
  const canvas = currentCanvas(side); if (!canvas) return
  canvas.closest<HTMLElement>('.book-table')?.focus({ preventScroll: true })
  const p = point(canvas, event)
  if (tool.value === 'select') {
    const hit = findObject(side, p)
    selectedObject.value = hit ? { side, id: hit.id } : null
    currentObject = hit; drawingSide = side; dragLast = p; drawing = Boolean(hit)
    canvas.setPointerCapture(event.pointerId); syncPage(); return
  }
  if (tool.value === 'eraser') {
    const hit = findObject(side, p)
    if (hit) {
      const objects = pages.value[spread.value][objectKey(side)]
      const index = objects.findIndex((object) => object.id === hit.id)
      if (index >= 0) objects.splice(index, 1)
      selectedObject.value = null; syncPage(); syncOut()
    }
    return
  }
  if (!drawingEnabled.value) return
  drawing = true; drawingSide = side; canvas.setPointerCapture(event.pointerId); startPoint = p
  currentObject = (tool.value === 'pen' || tool.value === 'highlighter')
    ? {
        id: newObjectId(), kind: 'stroke',
        color: tool.value === 'highlighter' ? highlighterColor.value : inkColor.value,
        width: (tool.value === 'highlighter' ? highlighterWidth.value : inkWidth.value) * 3,
        opacity: tool.value === 'highlighter' ? highlighterOpacity.value : 1,
        blendMode: tool.value === 'highlighter' ? 'multiply' : 'source-over',
        points: [p]
      }
    : null
  if (currentObject) pages.value[spread.value][objectKey(side)].push(currentObject)
}
function moveInk(event: PointerEvent) {
  if (!drawing) return
  const canvas = currentCanvas(drawingSide); if (!canvas) return
  const p = point(canvas, event)
  if (tool.value === 'select' && currentObject && dragLast) {
    offsetObject(currentObject, p[0] - dragLast[0], p[1] - dragLast[1]); dragLast = p; syncPage(); return
  }
  if (currentObject?.kind === 'stroke') { currentObject.points?.push(p); paint(canvas, drawingSide === 'left' ? pages.value[spread.value].leftInk : pages.value[spread.value].rightInk, pages.value[spread.value][objectKey(drawingSide)], selectedObject.value?.side === drawingSide ? selectedObject.value.id : null) }
}
function endInk(event: PointerEvent) {
  if (!drawing) return
  drawing = false
  const canvas = currentCanvas(drawingSide)
  if (!canvas) return
  if ((tool.value === 'line' || tool.value === 'arrow' || tool.value === 'rectangle' || tool.value === 'ellipse') && startPoint) {
    const kind = tool.value
    pages.value[spread.value][objectKey(drawingSide)].push({ id: newObjectId(), kind, color: inkColor.value, width: inkWidth.value * 3, start: startPoint, end: point(canvas, event) })
  }
  currentObject = null; dragLast = null; startPoint = null; syncPage(); syncOut()
}
function clearInk() { const page = pages.value[spread.value]; if (activeSide.value === 'left') { page.leftInk = ''; page.leftObjects = [] } else { page.rightInk = ''; page.rightObjects = [] }; selectedObject.value = null; syncPage(); syncOut() }
function restore(serialized: string) {
  wholeNotebookSelected.value = false
  const currentSpread = spread.value
  const data = parse(serialized); pages.value = data.pages; layout.value = data.layout; inkColor.value = data.ink.color; inkWidth.value = data.ink.width; highlighterColor.value = data.ink.highlighterColor; highlighterWidth.value = data.ink.highlighterWidth; highlighterOpacity.value = data.ink.highlighterOpacity; spread.value = Math.min(currentSpread, Math.max(0, pages.value.length - 1)); lastSerialized = serialized
  nextTick(syncPage)
  emit('update:modelValue', serialized); emit('dirty')
}
function undo() {
  const previous = undoHistory.value.pop(); if (!previous) return
  redoHistory.value.push(lastSerialized); restore(previous)
}
function redo() {
  const next = redoHistory.value.pop(); if (!next) return
  undoHistory.value.push(lastSerialized); restore(next)
}
function notebookPages() {
  return pages.value.flatMap((sheet, index) => [
    { page: index * 2 + 1, html: sheet.left },
    { page: index * 2 + 2, html: sheet.right }
  ])
}
function pagePlainText(html: string) {
  const holder = document.createElement('div')
  holder.innerHTML = html
  holder.querySelectorAll('br').forEach((breakElement) => breakElement.replaceWith('\n'))
  holder.querySelectorAll('th,td').forEach((cell) => cell.append('\t'))
  holder.querySelectorAll('p,div,li,blockquote,h1,h2,h3,h4,tr,pre').forEach((block) => block.append('\n'))
  return (holder.textContent || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}
function notebookClipboardPayload() {
  const entries = notebookPages()
  return {
    plain: entries.map(({ page, html }) => `—— 第 ${page} 页 ——\n${pagePlainText(html)}`).join('\n\n').trim(),
    html: `<div data-lk-notebook-selection="true">${entries.map(({ page, html }) => `<div data-lk-page="${page}"><p><strong>第 ${page} 页</strong></p>${html}</div>`).join('')}</div>`
  }
}
function selectWholeNotebook() {
  wholeNotebookSelected.value = true
  savedTextRange = null
  selectedObject.value = null
  window.getSelection()?.removeAllRanges()
}
function replaceWholeNotebookWith(markup: string) {
  pages.value = [{ ...blank(), left: markup }]
  spread.value = 0
  wholeNotebookSelected.value = false
  savedTextRange = null
  selectedObject.value = null
  window.getSelection()?.removeAllRanges()
  syncOut()
  nextTick(() => {
    syncPage()
    leftText.value?.focus()
    reflowFrom(0, 'left')
  })
}
function clearWholeNotebook() {
  replaceWholeNotebookWith('')
  ElMessage.success('已清空整本笔记，可用 Ctrl+Z 撤销')
}
function writeNotebookClipboard(event: ClipboardEvent) {
  const payload = notebookClipboardPayload()
  event.preventDefault()
  event.stopPropagation()
  event.clipboardData?.setData('text/plain', payload.plain)
  event.clipboardData?.setData('text/html', payload.html)
}
function onNotebookCopy(event: ClipboardEvent) {
  if (!wholeNotebookSelected.value) return
  writeNotebookClipboard(event)
  ElMessage.success(`已复制整本笔记（${selectedPaperCount.value} 页）`)
}
function onNotebookCut(event: ClipboardEvent) {
  if (!wholeNotebookSelected.value) return
  writeNotebookClipboard(event)
  clearWholeNotebook()
}
function onBeforeInput(event: InputEvent) {
  if (!wholeNotebookSelected.value) return
  if (event.inputType.startsWith('delete')) {
    event.preventDefault()
    clearWholeNotebook()
    return
  }
  if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
    event.preventDefault()
    replaceWholeNotebookWith('<p><br></p>')
    return
  }
  if (event.inputType.startsWith('insert') && event.data != null) {
    event.preventDefault()
    replaceWholeNotebookWith(`<p>${escapeHtml(event.data)}</p>`)
  }
}
function onPointerDownCapture(event: PointerEvent) {
  if (event.button === 0 && wholeNotebookSelected.value) wholeNotebookSelected.value = false
}
function onKeydown(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  if (event.code === 'Space' && !(event.target as HTMLElement).closest('input,textarea,[contenteditable="true"]')) {
    spacePanHeld = true
    event.preventDefault()
    return
  }
  if (wholeNotebookSelected.value && (key === 'escape' || key === 'esc')) {
    event.preventDefault()
    event.stopPropagation()
    wholeNotebookSelected.value = false
    return
  }
  if (wholeNotebookSelected.value && (key === 'delete' || key === 'backspace')) {
    event.preventDefault()
    event.stopPropagation()
    clearWholeNotebook()
    return
  }
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return
  if (key === 'a') {
    event.preventDefault()
    event.stopPropagation()
    selectWholeNotebook()
    return
  }
  if (key !== 'z' && key !== 'y') return
  event.preventDefault()
  event.stopPropagation()
  if (key === 'y' || event.shiftKey) redo(); else undo()
}
function onKeyup(event: KeyboardEvent) {
  if (event.code === 'Space') spacePanHeld = false
}
function drawObject(context: CanvasRenderingContext2D, object: InkObject) {
  context.save(); context.strokeStyle = object.color; context.fillStyle = object.color; context.lineWidth = object.width; context.globalAlpha = object.opacity ?? 1; context.globalCompositeOperation = object.blendMode || ((object.opacity ?? 1) < 1 ? 'multiply' : 'source-over'); context.lineCap = 'round'; context.lineJoin = 'round'
  if (object.kind === 'stroke' && object.points?.length) {
    const outline = getStroke(object.points, { size: object.width, thinning: .55, smoothing: .55, streamline: .45, simulatePressure: false })
    if (outline.length) { context.beginPath(); context.moveTo(outline[0][0], outline[0][1]); for (const point of outline.slice(1)) context.lineTo(point[0], point[1]); context.closePath(); context.fill() }
  } else if (object.start && object.end) {
    const [sx, sy] = object.start, [ex, ey] = object.end
    context.beginPath()
    if (object.kind === 'rectangle') context.strokeRect(sx, sy, ex - sx, ey - sy)
    else if (object.kind === 'ellipse') context.ellipse((sx + ex) / 2, (sy + ey) / 2, Math.abs(ex - sx) / 2, Math.abs(ey - sy) / 2, 0, 0, Math.PI * 2)
    else { context.moveTo(sx, sy); context.lineTo(ex, ey); if (object.kind === 'arrow') { const angle = Math.atan2(ey - sy, ex - sx), size = 18 + object.width; context.moveTo(ex, ey); context.lineTo(ex - size * Math.cos(angle - .45), ey - size * Math.sin(angle - .45)); context.moveTo(ex, ey); context.lineTo(ex - size * Math.cos(angle + .45), ey - size * Math.sin(angle + .45)) } }
    context.stroke()
  }
  context.restore()
}
function drawSelection(context: CanvasRenderingContext2D, object: InkObject) {
  const box = bounds(object); context.save(); context.setLineDash([10, 7]); context.strokeStyle = '#4f83c4'; context.lineWidth = 3; context.strokeRect(box.x, box.y, box.w, box.h); context.restore()
}
function paint(canvas: HTMLCanvasElement | null, data: string, objects: InkObject[], selectedId: string | null) {
  if (!canvas) return
  const c = canvas.getContext('2d')!; c.clearRect(0, 0, canvas.width, canvas.height)
  const renderObjects = () => { for (const object of objects) drawObject(c, object); const selected = selectedId ? objects.find((object) => object.id === selectedId) : null; if (selected) drawSelection(c, selected) }
  if (!data) { renderObjects(); return }
  const img = new Image(); img.onload = () => { c.clearRect(0, 0, canvas.width, canvas.height); c.drawImage(img, 0, 0, canvas.width, canvas.height); renderObjects() }; img.src = data
}
function selectedCollection() {
  if (!selectedObject.value) return null
  return pages.value[spread.value][objectKey(selectedObject.value.side)]
}
function deleteSelected() {
  const objects = selectedCollection(); const selection = selectedObject.value
  if (!objects || !selection) return
  const index = objects.findIndex((object) => object.id === selection.id)
  if (index >= 0) objects.splice(index, 1)
  selectedObject.value = null; syncPage(); syncOut()
}
function duplicateSelected() {
  const objects = selectedCollection(); const selection = selectedObject.value
  if (!objects || !selection) return
  const original = objects.find((object) => object.id === selection.id)
  if (!original) return
  const copy = JSON.parse(JSON.stringify(original)) as InkObject
  copy.id = newObjectId(); offsetObject(copy, 28, 28); objects.push(copy)
  selectedObject.value = { side: selection.side, id: copy.id }; syncPage(); syncOut()
}
function scaleSelected(factor: number) {
  const objects = selectedCollection(); const selection = selectedObject.value
  if (!objects || !selection) return
  const object = objects.find((item) => item.id === selection.id)
  if (!object) return
  const box = bounds(object)
  const scalePoint = (point: Point): Point => [box.x + (point[0] - box.x) * factor, box.y + (point[1] - box.y) * factor, point[2]]
  if (object.points) object.points = object.points.map(scalePoint)
  if (object.start) object.start = scalePoint(object.start)
  if (object.end) object.end = scalePoint(object.end)
  object.width = Math.max(1, object.width * factor)
  syncPage(); syncOut()
}
function setTool(next: Tool) { wholeNotebookSelected.value = false; tool.value = tool.value === next ? 'text' : next }
function handleMore(command: string) { if (command === 'selectAll') selectWholeNotebook(); if (command === 'clear') clearInk(); if (command === 'copy') duplicateSelected(); if (command === 'smaller') scaleSelected(.85); if (command === 'larger') scaleSelected(1.15); if (command === 'delete') deleteSelected() }
function togglePen() { setTool('pen') }
function openInkSettings() { inkSettingsOpen.value = true }
function saveInkSettings() { syncOut() }
function opacityLabel(value: number) { return `${Math.round(value * 100)}%` }
function zoomBy(delta: number) { viewScale.value = Math.max(.45, Math.min(2.5, Number((viewScale.value + delta).toFixed(2)))) }
function resetView() { viewScale.value = 1; panX.value = 0; panY.value = 0 }
function onWheel(event: WheelEvent) {
  if (!(event.ctrlKey || event.metaKey)) return
  event.preventDefault()
  zoomBy(event.deltaY > 0 ? -.08 : .08)
}
function startPan(event: PointerEvent) {
  if (event.button !== 0 && event.button !== 1) return
  const target = event.target as HTMLElement
  const container = event.currentTarget as HTMLElement
  const blankWorkspace = target === container || target.classList.contains('book-spread') || Boolean(target.closest('.book-cover-shadow,.spine'))
  if (tool.value !== 'hand' && !blankWorkspace && event.button !== 1 && !spacePanHeld) return
  event.preventDefault()
  panning.value = true
  panStart = { x: event.clientX, y: event.clientY, left: panX.value, top: panY.value }
  container.setPointerCapture(event.pointerId)
}
function movePan(event: PointerEvent) {
  if (!panning.value) return
  event.preventDefault()
  panX.value = panStart.left + event.clientX - panStart.x
  panY.value = panStart.top + event.clientY - panStart.y
}
function endPan() { panning.value = false }
function onContextMenu(event: MouseEvent) {
  const clickedText = (event.target as HTMLElement).closest('.paper-text')
  if (clickedText === leftText.value) activeSide.value = 'left'
  else if (clickedText === rightText.value) activeSide.value = 'right'
  const element = anchorElement()
  const selection = window.getSelection()
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null
  savedTextRange = range && element?.contains(range.commonAncestorContainer) ? range.cloneRange() : null
  const selected = savedTextRange?.toString().trim() || ''
  const context = selected || getText()
  const common = [
    { label: '全选整本笔记', icon: 'Select' as any, action: selectWholeNotebook },
    { label: '在笔记内打开 AI 小窗口', icon: 'ChatDotRound' as any, action: () => emit('open-ai', { context, label: selected ? '已选文字' : '当前双页' }) },
    { label: 'AI 解释', icon: 'Reading' as any, action: () => emit('open-ai', { context, label: selected ? '已选文字 · 解释' : '当前双页 · 解释', action: '请解释这段笔记。' }) },
    { label: 'AI 润色', icon: 'EditPen' as any, action: () => emit('open-ai', { context, label: selected ? '已选文字 · 润色' : '当前双页 · 润色', action: '请润色这段笔记。' }) },
    { label: 'AI 生成复习题', icon: 'QuestionFilled' as any, action: () => emit('open-ai', { context, label: '当前双页 · 复习题', action: '请生成 3 道复习问答题。' }) },
  ]
  const links = [
    { label: '复制当前位置链接', icon: 'Link' as any, action: () => emit('create-location-link', createAnchor()) },
    { label: '链接到笔记位置…', icon: 'Connection' as any, action: () => emit('link-selection', { label: selected }) },
  ]
  const draw = [
    { label: '批注参数…', icon: 'Setting' as any, action: openInkSettings },
    { label: '选择对象', icon: 'Pointer' as any, action: () => setTool('select') },
    { label: '画笔', icon: 'EditPen' as any, action: () => setTool('pen') },
    { label: '荧光笔', icon: 'Brush' as any, action: () => setTool('highlighter') },
    { label: '直线', icon: 'Minus' as any, action: () => setTool('line') },
    { label: '箭头', icon: 'Right' as any, action: () => setTool('arrow') },
    { label: '方框', icon: 'FullScreen' as any, action: () => setTool('rectangle') },
    { label: '圆形', icon: 'CircleCheck' as any, action: () => setTool('ellipse') },
    { label: '橡皮擦', icon: 'Delete' as any, action: () => setTool('eraser') },
    { label: '移动纸张', icon: 'Rank' as any, action: () => setTool('hand') },
  ]
  const objectActions = selectedObject.value ? [{ label: '复制选中对象', icon: 'CopyDocument' as any, action: duplicateSelected }, { label: '缩小选中对象', icon: 'ZoomOut' as any, action: () => scaleSelected(.85) }, { label: '放大选中对象', icon: 'ZoomIn' as any, action: () => scaleSelected(1.15) }, { label: '删除选中对象', icon: 'Delete' as any, danger: true, action: deleteSelected }, { separator: true }] : []
  menu.open(event, [...common, { separator: true }, ...links, { separator: true }, { label: '画笔工具', icon: 'Brush' as any, children: draw }, ...objectActions, { label: '撤销', icon: 'RefreshLeft' as any, action: undo }, { label: '重做', icon: 'RefreshRight' as any, action: redo }, { label: '重置纸张视图', icon: 'Aim' as any, action: resetView }, { label: '清除当前页笔迹', icon: 'Delete' as any, danger: true, action: clearInk }])
}
function onPaperClick(event: MouseEvent) {
  wholeNotebookSelected.value = false
  const anchor = (event.target as HTMLElement).closest('a')
  const href = anchor?.getAttribute('href') || ''
  if (!href.startsWith('app://')) return
  event.preventDefault()
  window.dispatchEvent(new CustomEvent('lk:nav', { detail: { href } }))
}
function anchorElement() {
  return activeSide.value === 'left' ? leftText.value : rightText.value
}
function createAnchor() {
  const element = anchorElement()
  const selection = window.getSelection()
  const anchorId = `lk-anchor-${newObjectId()}`
  const range = savedTextRange || (selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null)
  const quote = range?.toString().trim().slice(0, 240) || ''
  if (element) {
    const marker = document.createElement('span')
    marker.id = anchorId
    marker.className = 'lk-note-anchor'
    marker.contentEditable = 'false'
    if (range && element.contains(range.commonAncestorContainer)) {
      range.collapse(true)
      range.insertNode(marker)
    } else {
      element.appendChild(marker)
    }
    onText(activeSide.value, { currentTarget: element } as unknown as Event)
  }
  savedTextRange = null
  return { spread: spread.value, anchorId, quote }
}
function wrapSelectionWithLink(href: string, fallbackLabel: string) {
  const element = anchorElement()
  if (!element) return
  element.focus()
  const selection = window.getSelection()
  if (savedTextRange && element.contains(savedTextRange.commonAncestorContainer)) {
    selection?.removeAllRanges()
    selection?.addRange(savedTextRange)
  }
  const selected = selection?.toString().trim() || ''
  if (selected && selection?.rangeCount && element.contains(selection.getRangeAt(0).commonAncestorContainer)) {
    document.execCommand('createLink', false, href)
  } else {
    document.execCommand('insertHTML', false, `<a href="${escapeHtml(href)}">${escapeHtml(fallbackLabel || '笔记位置')}</a>`)
  }
  savedTextRange = null
  onText(activeSide.value, { currentTarget: element } as unknown as Event)
}
function insertHtml(html: string) {
  const el = activeSide.value === 'left' ? leftText.value : rightText.value
  if (!el) return
  el.focus(); document.execCommand('insertHTML', false, html)
  onText(activeSide.value, { currentTarget: el } as unknown as Event)
}
function insertImage(dataUrl: string, alt = '图片') { insertHtml(`<p><img src="${dataUrl}" alt="${alt}" /></p>`) }
function insertFormula() { insertHtml('<span class="lk-formula">公式： </span>') }
function getText() { const page = pages.value[spread.value]; return `${page?.left || ''}\n${page?.right || ''}`.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }
function clearReveal() {
  revealRequest += 1
  pendingReveal = null
  leftText.value?.querySelectorAll('.heading-revealed,.revealed').forEach((element) => element.classList.remove('heading-revealed', 'revealed'))
  rightText.value?.querySelectorAll('.heading-revealed,.revealed').forEach((element) => element.classList.remove('heading-revealed', 'revealed'))
}
function applyPendingReveal() {
  const target = pendingReveal
  if (!target || target.spread !== spread.value) return false
  const element = document.getElementById(target.id)
  if (!element || (!leftText.value?.contains(element) && !rightText.value?.contains(element))) return false
  leftText.value?.querySelectorAll('.heading-revealed,.revealed').forEach((item) => item.classList.remove('heading-revealed', 'revealed'))
  rightText.value?.querySelectorAll('.heading-revealed,.revealed').forEach((item) => item.classList.remove('heading-revealed', 'revealed'))
  activeSide.value = target.side || (rightText.value?.contains(element) ? 'right' : 'left')
  element.classList.add(target.className)
  element.scrollIntoView({ block: 'center', inline: 'nearest' })
  return true
}
function revealOnPage(target: RevealTarget) {
  clearReveal()
  pendingReveal = target
  const request = revealRequest
  goToSpread(target.spread, true)
  let attempts = 0
  const locate = () => {
    if (request !== revealRequest || applyPendingReveal()) return
    attempts += 1
    if (attempts < 20) window.requestAnimationFrame(locate)
  }
  nextTick(() => window.requestAnimationFrame(locate))
}
function goToSpread(target: number, preserveReveal = false) {
  if (!Number.isFinite(target) || target < 0) return
  if (!preserveReveal) clearReveal()
  while (pages.value.length <= target) pages.value.push(blank())
  spread.value = target
  nextTick(syncPage)
}
function revealAnchor(target: number, anchorId: string) {
  revealOnPage({ id: anchorId, spread: target, className: 'revealed' })
}
defineExpose({ insertHtml, insertImage, insertFormula, togglePen, openInkSettings, toggleOutline, applyHeading, undo, redo, selectWholeNotebook, nextSpread: () => turn(1), getText, getSpread: () => spread.value, goToSpread, goToHeadingId, wrapSelectionWithLink, revealAnchor })

watch(() => props.modelValue, (value) => {
  if (value === lastSerialized) return
  clearReveal()
  const data = parse(value || '')
  const sharedLayout = globalLayoutEnabled.value ? readGlobalLayout() : null
  pages.value = data.pages
  layout.value = sharedLayout || data.layout
  if (globalLayoutEnabled.value && !sharedLayout) saveGlobalLayout()
  inkColor.value = data.ink.color
  inkWidth.value = data.ink.width
  highlighterColor.value = data.ink.highlighterColor
  highlighterWidth.value = data.ink.highlighterWidth
  highlighterOpacity.value = data.ink.highlighterOpacity
  spread.value = 0
  const normalisedValue = serialize()
  const repairedLegacyFormula = Boolean(value?.startsWith(MARKER) && normalisedValue !== value)
  lastSerialized = value?.startsWith(MARKER) ? value : normalisedValue
  undoHistory.value = []; redoHistory.value = []
  nextTick(() => {
    syncPage()
    paginateAll()
    refreshOutline()
    if (repairedLegacyFormula) syncOut(false)
  })
}, { immediate: true })
</script>

<style scoped lang="scss">
.page-nav { display:flex; align-items:center; gap:1px; flex:none; }
.whole-selection-hint { padding:3px 8px; white-space:nowrap; color:#1f3b2d; background:#d8f3df; border:1px solid rgba(55,121,80,.45); border-radius:999px; font-weight:700; }
.global-layout-row>span { color:var(--text); font-size:12px; }
.notebook-shell { position:relative; flex:1; min-height:0; display:flex; flex-direction:column; overflow:hidden; background:linear-gradient(135deg,#91806c,#c4b59d 45%,#74604e); }.notebook-tools { display:flex; align-items:center; gap:5px; min-height:34px; padding:4px 12px; color:#f4eee5; background:rgba(45,31,22,.68); font-size:12px; flex-wrap:nowrap; overflow-x:auto; }.page-indicator,.zoom-hint { white-space:nowrap; }.zoom-hint { color:#ede3d3; font-size:11px; }.tool-sep { height:18px; width:1px; margin:0 3px; background:rgba(255,255,255,.3); flex:none; }.tool-popover { display:grid; gap:10px; color:var(--text); }.tool-popover>div { display:flex; align-items:center; gap:5px; flex-wrap:wrap; }.tool-popover b { min-width:34px; color:var(--text-dim); font-size:11px; }.tool-popover small { color:var(--text-dim); font-size:11px; }.pen-popover :deep(.el-slider) { flex:1; min-width:180px; }.ink-presets { display:flex; gap:5px; }.ink-presets button { width:19px; height:19px; border:2px solid #fff; outline:1px solid var(--border); border-radius:50%; cursor:pointer; }.layout-grid { display:grid !important; grid-template-columns:42px 1fr; align-items:center; }.notebook-more { margin-left:auto; }.notebook-outline { position:absolute; z-index:8; left:10px; top:48px; bottom:12px; width:240px; overflow:auto; color:var(--text); background:color-mix(in srgb,var(--bg-elev) 94%,transparent); border:1px solid var(--border); border-radius:10px; box-shadow:var(--shadow); backdrop-filter:blur(10px); }.notebook-outline header { position:sticky; top:0; display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:var(--bg-elev); border-bottom:1px solid var(--border); }.notebook-outline header button { border:0; background:transparent; color:var(--text); cursor:pointer; font-size:18px; }.notebook-outline .outline-entry { display:flex; justify-content:space-between; gap:8px; width:100%; padding-block:8px; padding-right:10px; border:0; border-bottom:1px solid color-mix(in srgb,var(--border) 60%,transparent); background:transparent; color:var(--text); text-align:left; cursor:pointer; }.notebook-outline .outline-entry:hover { background:var(--bg-hover); color:var(--accent-text); }.notebook-outline .outline-entry span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.notebook-outline .outline-entry small,.notebook-outline>p { color:var(--text-dim); }.notebook-outline>p { padding:12px; font-size:12px; line-height:1.6; }.book-table { position:relative; display:flex; flex:1; min-height:0; align-items:flex-start; justify-content:center; padding:22px max(22px, 6vw) 30px; overflow:auto; }.book-table.grabbing { cursor:grabbing; }.book-spread { position:relative; display:flex; align-items:stretch; transform-origin:center center; transition:transform .12s ease-out; margin:auto; }.book-cover-shadow { position:absolute; left:12%; right:12%; bottom:18px; height:28px; border-radius:50%; background:rgba(37,24,14,.46); filter:blur(13px); }.paper { position:relative; z-index:1; flex:0 1 620px; width:min(43vw,620px); min-width:320px; height:var(--notebook-paper-height); min-height:520px; overflow:hidden; background:repeating-linear-gradient(to bottom, transparent 0, transparent calc(var(--notebook-line-height) - 2px), rgba(87,151,184,.27) calc(var(--notebook-line-height) - 1px), transparent var(--notebook-line-height)), linear-gradient(90deg, transparent 0, transparent 55px, rgba(216,88,88,.55) 56px, transparent 58px), radial-gradient(circle at 20% 10%, rgba(118,96,58,.11) 0 1px, transparent 1.5px), #fffdf5; background-size:auto var(--notebook-line-height),auto,17px 19px,auto; border:1px solid #d7c6a7; box-shadow:inset 0 0 36px rgba(121,92,45,.12), 0 14px 25px rgba(38,26,16,.3); }.left-paper { border-radius:7px 2px 2px 14px; }.right-paper { border-radius:2px 7px 14px 2px; }.spine { z-index:2; width:18px; margin:0 -4px; background:linear-gradient(90deg,rgba(48,31,20,.42),rgba(247,235,205,.85) 42%,rgba(56,38,25,.46)); box-shadow:0 0 12px rgba(25,17,10,.52); }.page-number { position:absolute; right:23px; bottom:18px; z-index:3; color:#84775e; font:12px Georgia,serif; }.paper-text { position:relative; z-index:1; height:100%; padding:28px 38px 44px 76px; box-sizing:border-box; outline:none; color:#3b352a; overflow:hidden; overflow-wrap:anywhere; caret-color:#315b8a; }.paper-text:empty::before { content:attr(data-placeholder); color:#aaa08c; pointer-events:none; }.paper-text :deep(p) { margin:0; min-height:var(--notebook-line-height); }.paper-text :deep(img) { max-width:100%; max-height:280px; vertical-align:middle; }.paper-text :deep(.lk-formula) { display:inline-block; max-width:100%; padding:0 6px; border-bottom:1px dashed #7289a3; color:#315b8a; font-family:Georgia,serif; vertical-align:middle; }.paper-text :deep(.lk-formula-block) { display:block; margin:8px 0; overflow-x:auto; text-align:center; }.paper-text :deep(table) { width:100%; max-width:100%; margin:7px 0; border-collapse:collapse; table-layout:auto; font-size:.88em; }.paper-text :deep(th),.paper-text :deep(td) { min-width:42px; padding:4px 6px; border:1px solid rgba(108,91,61,.42); vertical-align:top; overflow-wrap:anywhere; }.paper-text :deep(th) { background:rgba(131,109,72,.12); font-weight:700; }.paper-text :deep(.lk-paste-table) { display:table; }.ink { position:absolute; inset:0; z-index:2; width:100%; height:100%; pointer-events:none; touch-action:none; }.ink.active { pointer-events:auto; cursor:crosshair; }.paper:has(.ink.active) .paper-text { user-select:none; }
.layout-grid { grid-template-columns:58px 1fr; }
.book-table { cursor:grab; }
.book-table.hand-tool .paper-text { cursor:grab; user-select:none; }
.book-table.grabbing,.book-table.grabbing .paper-text { cursor:grabbing; }
.book-table.whole-selected { box-shadow:inset 0 0 0 4px rgba(71,142,97,.78),inset 0 0 0 9999px rgba(90,160,112,.08); }
.book-table.whole-selected::after { content:'整本笔记已选中 · Ctrl+C 复制 · Delete 删除 · Esc 取消'; position:sticky; z-index:7; left:50%; top:12px; align-self:flex-start; transform:translateX(-50%); padding:7px 12px; color:#173d28; background:rgba(226,248,232,.96); border:1px solid rgba(57,126,80,.62); border-radius:9px; box-shadow:0 8px 24px rgba(24,65,39,.2); font-size:12px; font-weight:700; pointer-events:none; }
.pen-popover b { min-width:58px; }
.ink { mix-blend-mode:multiply; }
.book-spread { flex:none; max-width:none; }
.paper { flex:0 0 var(--notebook-page-width); width:var(--notebook-page-width); max-width:none; }
.paper-text :deep(table) { table-layout:fixed; }
.paper-text :deep(h1),.paper-text :deep(h2),.paper-text :deep(h3),.paper-text :deep(h4) { margin:8px 0 5px; line-height:1.35; color:#332f27; }
.paper-text :deep(h1) { font-size:1.45em; }.paper-text :deep(h2) { font-size:1.3em; }.paper-text :deep(h3) { font-size:1.16em; }.paper-text :deep(h4) { font-size:1.05em; }
.paper-text :deep(ol),.paper-text :deep(ul) { margin:4px 0 7px; padding-left:1.65em; }.paper-text :deep(li) { min-height:var(--notebook-line-height); padding-left:2px; }.paper-text :deep(li>p) { margin:0; }
.paper-text :deep(blockquote) { margin:6px 0; padding:3px 10px; border-left:3px solid rgba(74,112,148,.55); background:rgba(102,139,172,.08); }.paper-text :deep(blockquote>p) { margin:0; }
.paper-text :deep(hr) { margin:10px 0; border:0; border-top:1px solid rgba(108,91,61,.35); }
.paper-text :deep(.katex-block) { max-width:100%; margin:7px 0; padding:3px 0; overflow-x:auto; overflow-y:hidden; text-align:center; }
.paper-text :deep(a[href^="app://"]) { color:#315b8a; font-weight:600; text-decoration:underline; text-decoration-thickness:1px; text-underline-offset:3px; cursor:pointer; }
.paper-text :deep(th),.paper-text :deep(td) { min-width:0; }
.paper-text :deep(pre) { max-width:100%; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; }
.paper-text :deep(.lk-note-anchor) { display:inline-block; width:2px; height:1.1em; margin-left:-2px; vertical-align:middle; border-radius:2px; }
.paper-text :deep(.lk-note-anchor.revealed) { background:#e59b27; box-shadow:0 0 0 5px rgba(229,155,39,.24); }
.paper-text :deep(.heading-revealed) { background:rgba(229,155,39,.18); box-shadow:0 0 0 5px rgba(229,155,39,.18); border-radius:4px; }
:global(html[data-theme="paper"]) .notebook-shell { background:linear-gradient(135deg,#b9ad95,#e5decf 48%,#9b8d76); }
:global(html[data-theme="sepia"]) .notebook-shell { background:linear-gradient(135deg,#5d4635,#a77e57 48%,#4b3629); }
:global(html[data-theme="sepia"]) .notebook-tools { background:rgba(55,37,27,.78); }
:global(html[data-theme="sepia"]) .paper { background:repeating-linear-gradient(to bottom, transparent 0, transparent 37px, rgba(121,166,179,.25) 38px, transparent 39px), linear-gradient(90deg, transparent 0, transparent 55px, rgba(179,87,75,.5) 56px, transparent 58px), #f5ead7; border-color:#b79772; }
:global(html[data-theme="forest"]) .notebook-shell { background:linear-gradient(135deg,#39564a,#8ba58b 48%,#2f463e); }
:global(html[data-theme="forest"]) .notebook-tools { background:rgba(28,59,50,.78); }
:global(html[data-theme="forest"]) .paper { background:repeating-linear-gradient(to bottom, transparent 0, transparent 37px, rgba(89,148,142,.24) 38px, transparent 39px), linear-gradient(90deg, transparent 0, transparent 55px, rgba(194,104,101,.45) 56px, transparent 58px), #f3f5e9; border-color:#aebba6; }
:global(html[data-theme="dark"]) .notebook-shell { background:linear-gradient(135deg,#293236,#52605e 48%,#252d31); }
:global(html[data-theme="dark"]) .notebook-tools { background:rgba(23,30,33,.82); }
@media (max-width:900px) { .book-table { padding:12px; }.paper { min-width:280px; }.paper-text { padding-left:64px; font-size:16px; }.notebook-tools { flex-wrap:wrap; } }
</style>
