<template>
  <section class="notebook-shell">
    <div class="notebook-tools">
      <el-button size="small" @click="turn(-1)" :disabled="spread === 0">← 翻页</el-button>
      <span>第 {{ spread * 2 + 1 }}–{{ spread * 2 + 2 }} 页</span>
      <el-button size="small" @click="turn(1)">下一页 →</el-button>
      <span class="tool-sep"></span>
      <span class="layout-label">字号</span>
      <el-select v-model="layout.fontSize" size="small" style="width:76px" @change="onLayoutChange">
        <el-option v-for="size in [14, 16, 18, 20, 22]" :key="size" :label="`${size}px`" :value="size" />
      </el-select>
      <span class="layout-label">每页行</span>
      <el-input-number v-model="layout.linesPerPage" :min="12" :max="32" :step="1" controls-position="right" size="small" style="width:94px" @change="onLayoutChange" />
      <span class="layout-label">每行字</span>
      <el-input-number v-model="layout.charsPerLine" :min="12" :max="56" :step="1" controls-position="right" size="small" style="width:94px" @change="onLayoutChange" />
      <span class="tool-sep"></span>
      <el-button size="small" :type="tool === 'hand' ? 'primary' : 'default'" @click="setTool('hand')">移动纸张</el-button>
      <el-button size="small" :type="tool === 'select' ? 'primary' : 'default'" @click="setTool('select')">选择对象</el-button>
      <el-button size="small" :type="tool === 'pen' ? 'primary' : 'default'" @click="setTool('pen')">画笔</el-button>
      <el-button size="small" :type="tool === 'highlighter' ? 'primary' : 'default'" @click="setTool('highlighter')">荧光笔</el-button>
      <el-button size="small" :type="tool === 'line' ? 'primary' : 'default'" @click="setTool('line')">直线</el-button>
      <el-button size="small" :type="tool === 'arrow' ? 'primary' : 'default'" @click="setTool('arrow')">箭头</el-button>
      <el-button size="small" :type="tool === 'rectangle' ? 'primary' : 'default'" @click="setTool('rectangle')">方框</el-button>
      <el-button size="small" :type="tool === 'ellipse' ? 'primary' : 'default'" @click="setTool('ellipse')">圆形</el-button>
      <el-button size="small" :type="tool === 'eraser' ? 'primary' : 'default'" @click="setTool('eraser')">橡皮</el-button>
      <el-select v-model="inkColor" size="small" style="width:98px"><el-option label="铅笔灰" value="#4d4a42" /><el-option label="墨水蓝" value="#315b8a" /><el-option label="批注红" value="#b44b45" /></el-select>
      <el-slider v-model="inkWidth" :min="1" :max="9" style="width:110px" />
      <el-button size="small" @click="clearInk">清除本页笔迹</el-button>
      <el-button size="small" :disabled="!selectedObject" @click="duplicateSelected">复制对象</el-button>
      <el-button size="small" :disabled="!selectedObject" @click="scaleSelected(.85)">缩小</el-button>
      <el-button size="small" :disabled="!selectedObject" @click="scaleSelected(1.15)">放大</el-button>
      <el-button size="small" type="danger" :disabled="!selectedObject" @click="deleteSelected">删除对象</el-button>
      <el-button size="small" @click="undo" :disabled="!undoHistory.length">撤销</el-button>
      <el-button size="small" @click="redo" :disabled="!redoHistory.length">重做</el-button>
      <span class="tool-sep"></span>
      <el-button size="small" @click="zoomBy(-.1)">−</el-button><span>{{ Math.round(viewScale * 100) }}%</span><el-button size="small" @click="zoomBy(.1)">＋</el-button>
      <el-button size="small" @click="resetView">居中</el-button>
    </div>
    <div class="book-table" :class="{ grabbing: panning }" tabindex="0" @wheel.prevent="onWheel" @keydown="onKeydown" @pointerdown="startPan" @pointermove="movePan" @pointerup="endPan" @pointerleave="endPan" @contextmenu.stop.prevent="onContextMenu">
      <div class="book-spread" :style="{ transform: `translate(${panX}px, ${panY}px) scale(${viewScale})` }">
      <div class="book-cover-shadow"></div>
      <article class="paper left-paper" :style="paperStyle">
        <div class="page-number">{{ spread * 2 + 1 }}</div>
        <div ref="leftText" class="paper-text" :style="paperTextStyle" contenteditable="true" spellcheck="true" @input="onText('left', $event)" @focus="activeSide = 'left'" data-placeholder="点击纸页直接开始写笔记…"></div>
        <canvas ref="leftCanvas" class="ink" :class="{ active: inkInteractive }" width="1500" height="1900" @pointerdown.stop="startInk('left', $event)" @pointermove.stop="moveInk($event)" @pointerup.stop="endInk" @pointerleave.stop="endInk" />
      </article>
      <div class="spine"></div>
      <article class="paper right-paper" :style="paperStyle">
        <div class="page-number">{{ spread * 2 + 2 }}</div>
        <div ref="rightText" class="paper-text" :style="paperTextStyle" contenteditable="true" spellcheck="true" @input="onText('right', $event)" @focus="activeSide = 'right'" data-placeholder="点击纸页直接开始写笔记…"></div>
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

type Point = [number, number, number]
type InkObject = { id: string; kind: 'stroke' | 'line' | 'arrow' | 'rectangle' | 'ellipse'; color: string; width: number; opacity?: number; points?: Point[]; start?: Point; end?: Point }
type Sheet = { left: string; right: string; leftInk: string; rightInk: string; leftObjects: InkObject[]; rightObjects: InkObject[] }
type NotebookLayout = { fontSize: number; linesPerPage: number; charsPerLine: number }
type NotebookData = { pages: Sheet[]; layout: NotebookLayout }
const MARKER = '<!-- lk:notebook:v1 -->\n'
const DEFAULT_LAYOUT: NotebookLayout = { fontSize: 18, linesPerPage: 18, charsPerLine: 28 }
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void; (e: 'dirty'): void; (e: 'open-ai', value: { context: string; label: string; action?: string }): void }>()
const menu = useContextMenu()
const leftText = ref<HTMLElement | null>(null)
const rightText = ref<HTMLElement | null>(null)
const leftCanvas = ref<HTMLCanvasElement | null>(null)
const rightCanvas = ref<HTMLCanvasElement | null>(null)
const pages = ref<Sheet[]>([])
const layout = ref<NotebookLayout>({ ...DEFAULT_LAYOUT })
const spread = ref(0)
const activeSide = ref<'left' | 'right'>('left')
type Tool = 'text' | 'select' | 'hand' | 'pen' | 'highlighter' | 'line' | 'arrow' | 'rectangle' | 'ellipse' | 'eraser'
const tool = ref<Tool>('text')
const inkColor = ref('#4d4a42')
const inkWidth = ref(3)
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
let panning = false
let panStart = { x: 0, y: 0, left: 0, top: 0 }
let lastSerialized = ''
const undoHistory = ref<string[]>([])
const redoHistory = ref<string[]>([])
const MAX_HISTORY = 80

function blank(): Sheet { return { left: '', right: '', leftInk: '', rightInk: '', leftObjects: [], rightObjects: [] } }
function normaliseSheet(value: Partial<Sheet>): Sheet {
  return { ...blank(), ...value, leftObjects: Array.isArray(value.leftObjects) ? value.leftObjects : [], rightObjects: Array.isArray(value.rightObjects) ? value.rightObjects : [] }
}
function parse(value: string): NotebookData {
  if (value.startsWith(MARKER)) {
    try {
      const data = JSON.parse(value.slice(MARKER.length))
      if (Array.isArray(data.pages) && data.pages.length) {
        return {
          pages: data.pages.map((page: Partial<Sheet>) => normaliseSheet(page)),
          layout: { ...DEFAULT_LAYOUT, ...(data.layout || {}) }
        }
      }
    } catch { /* use fallback */ }
  }
  return { pages: [{ ...blank(), left: value ? renderMarkdown(value) : '' }], layout: { ...DEFAULT_LAYOUT } }
}
function serialize() { return MARKER + JSON.stringify({ pages: pages.value, layout: layout.value }) }
const pageCapacity = computed(() => Math.max(120, layout.value.linesPerPage * layout.value.charsPerLine))
const paperStyle = computed(() => ({ '--notebook-line-height': `${Math.max(25, Math.floor(680 / layout.value.linesPerPage))}px` }))
const paperTextStyle = computed(() => ({ fontSize: `${layout.value.fontSize}px`, lineHeight: 'var(--notebook-line-height)' }))
function syncPage() {
  const page = pages.value[spread.value] || blank()
  if (leftText.value) leftText.value.innerHTML = page.left
  if (rightText.value) rightText.value.innerHTML = page.right
  paint(leftCanvas.value, page.leftInk, page.leftObjects, selectedObject.value?.side === 'left' ? selectedObject.value.id : null)
  paint(rightCanvas.value, page.rightInk, page.rightObjects, selectedObject.value?.side === 'right' ? selectedObject.value.id : null)
}
function syncOut() {
  const next = serialize()
  if (next === lastSerialized) return
  if (lastSerialized) {
    undoHistory.value.push(lastSerialized)
    if (undoHistory.value.length > MAX_HISTORY) undoHistory.value.shift()
    redoHistory.value = []
  }
  lastSerialized = next
  emit('update:modelValue', next)
  emit('dirty')
}
function turn(direction: number) {
  const next = spread.value + direction
  if (next < 0) return
  if (next >= pages.value.length) pages.value.push(blank())
  spread.value = next
  nextTick(syncPage)
}
function onText(side: 'left' | 'right', event: Event) {
  const page = pages.value[spread.value]
  page[side] = (event.currentTarget as HTMLElement).innerHTML
  syncOut()
  nextTick(() => paginateOverflow(spread.value, side))
}
function plainText(html: string) {
  const holder = document.createElement('div')
  holder.innerHTML = html
  return (holder.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
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
function focusEnd(index: number, side: 'left' | 'right') {
  if (spread.value !== index) return
  const el = side === 'left' ? leftText.value : rightText.value
  if (!el) return
  el.focus()
  const range = document.createRange(); range.selectNodeContents(el); range.collapse(false)
  const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range)
}
function paginateOverflow(startIndex: number, startSide: 'left' | 'right') {
  let index = startIndex
  let side = startSide
  let moved = false
  for (let guard = 0; guard < 120; guard += 1) {
    const sheet = pages.value[index]
    if (!sheet || plainText(sheet[side]).length <= pageCapacity.value) break
    const [head, tail] = splitHtmlAt(sheet[side], pageCapacity.value)
    if (!tail || head === sheet[side]) break
    sheet[side] = head
    const next = nextSlot(index, side)
    while (pages.value.length <= next.index) pages.value.push(blank())
    pages.value[next.index][next.side] = tail + pages.value[next.index][next.side]
    index = next.index; side = next.side; moved = true
  }
  if (!moved) return
  syncOut()
  if (spread.value === startIndex) nextTick(() => { syncPage(); focusEnd(index, side) })
}
function paginateAll() {
  for (let index = 0; index < pages.value.length; index += 1) {
    paginateOverflow(index, 'left')
    paginateOverflow(index, 'right')
  }
  nextTick(syncPage)
}
function onLayoutChange() {
  layout.value.fontSize = Number(layout.value.fontSize)
  layout.value.linesPerPage = Number(layout.value.linesPerPage)
  layout.value.charsPerLine = Number(layout.value.charsPerLine)
  syncOut()
  nextTick(paginateAll)
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
    ? { id: newObjectId(), kind: 'stroke', color: inkColor.value, width: inkWidth.value * 3, opacity: tool.value === 'highlighter' ? .28 : 1, points: [p] }
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
  const data = parse(serialized); pages.value = data.pages; layout.value = data.layout; spread.value = 0; lastSerialized = serialized
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
function onKeydown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return
  event.preventDefault(); if (event.shiftKey) redo(); else undo()
}
function drawObject(context: CanvasRenderingContext2D, object: InkObject) {
  context.save(); context.strokeStyle = object.color; context.fillStyle = object.color; context.lineWidth = object.width; context.globalAlpha = object.opacity ?? 1; context.lineCap = 'round'; context.lineJoin = 'round'
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
function setTool(next: Tool) { tool.value = tool.value === next ? 'text' : next }
function togglePen() { setTool('pen') }
function zoomBy(delta: number) { viewScale.value = Math.max(.45, Math.min(1.8, Number((viewScale.value + delta).toFixed(2)))) }
function resetView() { viewScale.value = 1; panX.value = 0; panY.value = 0 }
function onWheel(event: WheelEvent) { zoomBy(event.deltaY > 0 ? -.08 : .08) }
function startPan(event: PointerEvent) { if (tool.value !== 'hand') return; panning = true; panStart = { x: event.clientX, y: event.clientY, left: panX.value, top: panY.value }; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId) }
function movePan(event: PointerEvent) { if (!panning) return; panX.value = panStart.left + event.clientX - panStart.x; panY.value = panStart.top + event.clientY - panStart.y }
function endPan() { panning = false }
function onContextMenu(event: MouseEvent) {
  const selected = window.getSelection()?.toString().trim() || ''
  const context = selected || getText()
  const common = [
    { label: '在笔记内打开 AI 小窗口', icon: 'ChatDotRound' as any, action: () => emit('open-ai', { context, label: selected ? '已选文字' : '当前双页' }) },
    { label: 'AI 解释', icon: 'Reading' as any, action: () => emit('open-ai', { context, label: selected ? '已选文字 · 解释' : '当前双页 · 解释', action: '请解释这段笔记。' }) },
    { label: 'AI 润色', icon: 'EditPen' as any, action: () => emit('open-ai', { context, label: selected ? '已选文字 · 润色' : '当前双页 · 润色', action: '请润色这段笔记。' }) },
    { label: 'AI 生成复习题', icon: 'QuestionFilled' as any, action: () => emit('open-ai', { context, label: '当前双页 · 复习题', action: '请生成 3 道复习问答题。' }) },
  ]
  const draw = [
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
  menu.open(event, [...common, { separator: true }, { label: '画笔工具', icon: 'Brush' as any, children: draw }, ...objectActions, { label: '撤销', icon: 'RefreshLeft' as any, action: undo }, { label: '重做', icon: 'RefreshRight' as any, action: redo }, { label: '重置纸张视图', icon: 'Aim' as any, action: resetView }, { label: '清除当前页笔迹', icon: 'Delete' as any, danger: true, action: clearInk }])
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
function goToSpread(target: number) {
  if (!Number.isFinite(target) || target < 0) return
  while (pages.value.length <= target) pages.value.push(blank())
  spread.value = target
  nextTick(syncPage)
}
defineExpose({ insertHtml, insertImage, insertFormula, togglePen, undo, redo, nextSpread: () => turn(1), getText, getSpread: () => spread.value, goToSpread })

watch(() => props.modelValue, (value) => {
  if (value === lastSerialized) return
  const data = parse(value || '')
  pages.value = data.pages
  layout.value = data.layout
  spread.value = 0
  lastSerialized = value?.startsWith(MARKER) ? value : serialize()
  undoHistory.value = []; redoHistory.value = []
  nextTick(syncPage)
}, { immediate: true })
</script>

<style scoped lang="scss">
.notebook-shell { flex:1; min-height:0; display:flex; flex-direction:column; overflow:hidden; background:linear-gradient(135deg,#91806c,#c4b59d 45%,#74604e); }.notebook-tools { display:flex; align-items:center; gap:8px; padding:8px 14px; color:#f4eee5; background:rgba(45,31,22,.68); font-size:12px; flex-wrap:wrap; }.layout-label { color:#f4eee5; white-space:nowrap; }.tool-sep { height:20px; width:1px; margin:0 4px; background:rgba(255,255,255,.3); }.book-table { position:relative; display:flex; flex:1; min-height:0; align-items:center; justify-content:center; padding:22px max(22px, 6vw) 30px; overflow:hidden; }.book-table.grabbing { cursor:grabbing; }.book-spread { position:relative; display:flex; align-items:stretch; transform-origin:center center; transition:transform .12s ease-out; }.book-cover-shadow { position:absolute; left:12%; right:12%; bottom:18px; height:28px; border-radius:50%; background:rgba(37,24,14,.46); filter:blur(13px); }.paper { position:relative; z-index:1; flex:0 1 620px; width:min(43vw,620px); min-width:320px; height:min(72vh,820px); min-height:520px; overflow:hidden; background:repeating-linear-gradient(to bottom, transparent 0, transparent calc(var(--notebook-line-height) - 2px), rgba(87,151,184,.27) calc(var(--notebook-line-height) - 1px), transparent var(--notebook-line-height)), linear-gradient(90deg, transparent 0, transparent 55px, rgba(216,88,88,.55) 56px, transparent 58px), radial-gradient(circle at 20% 10%, rgba(118,96,58,.11) 0 1px, transparent 1.5px), #fffdf5; background-size:auto var(--notebook-line-height),auto,17px 19px,auto; border:1px solid #d7c6a7; box-shadow:inset 0 0 36px rgba(121,92,45,.12), 0 14px 25px rgba(38,26,16,.3); }.left-paper { border-radius:7px 2px 2px 14px; }.right-paper { border-radius:2px 7px 14px 2px; }.spine { z-index:2; width:18px; margin:0 -4px; background:linear-gradient(90deg,rgba(48,31,20,.42),rgba(247,235,205,.85) 42%,rgba(56,38,25,.46)); box-shadow:0 0 12px rgba(25,17,10,.52); }.page-number { position:absolute; right:23px; bottom:18px; z-index:3; color:#84775e; font:12px Georgia,serif; }.paper-text { position:relative; z-index:1; height:100%; padding:28px 38px 44px 76px; box-sizing:border-box; outline:none; color:#3b352a; font-family:'KaiTi','STKaiti','Microsoft YaHei',serif; overflow:hidden; caret-color:#315b8a; }.paper-text:empty::before { content:attr(data-placeholder); color:#aaa08c; pointer-events:none; }.paper-text :deep(p) { margin:0; min-height:var(--notebook-line-height); }.paper-text :deep(img) { max-width:100%; max-height:280px; vertical-align:middle; }.ink { position:absolute; inset:0; z-index:2; width:100%; height:100%; pointer-events:none; touch-action:none; }.ink.active { pointer-events:auto; cursor:crosshair; }.paper:has(.ink.active) .paper-text { user-select:none; }.paper-text :deep(.lk-formula) { display:inline-block; padding:0 6px; border-bottom:1px dashed #7289a3; color:#315b8a; font-family:Georgia,serif; }
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
