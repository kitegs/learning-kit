<template>
  <section class="notebook-shell">
    <div class="notebook-tools">
      <el-button size="small" @click="turn(-1)" :disabled="spread === 0">← 翻页</el-button>
      <span>第 {{ spread * 2 + 1 }}–{{ spread * 2 + 2 }} 页</span>
      <el-button size="small" @click="turn(1)">下一页 →</el-button>
      <span class="tool-sep"></span>
      <el-button size="small" :type="tool === 'hand' ? 'primary' : 'default'" @click="setTool('hand')">移动纸张</el-button>
      <el-button size="small" :type="tool === 'pen' ? 'primary' : 'default'" @click="setTool('pen')">画笔</el-button>
      <el-button size="small" :type="tool === 'highlighter' ? 'primary' : 'default'" @click="setTool('highlighter')">荧光笔</el-button>
      <el-button size="small" :type="tool === 'line' ? 'primary' : 'default'" @click="setTool('line')">直线</el-button>
      <el-button size="small" :type="tool === 'arrow' ? 'primary' : 'default'" @click="setTool('arrow')">箭头</el-button>
      <el-button size="small" :type="tool === 'eraser' ? 'primary' : 'default'" @click="setTool('eraser')">橡皮</el-button>
      <el-select v-model="inkColor" size="small" style="width:98px"><el-option label="铅笔灰" value="#4d4a42" /><el-option label="墨水蓝" value="#315b8a" /><el-option label="批注红" value="#b44b45" /></el-select>
      <el-slider v-model="inkWidth" :min="1" :max="9" style="width:110px" />
      <el-button size="small" @click="clearInk">清除本页笔迹</el-button>
      <span class="tool-sep"></span>
      <el-button size="small" @click="zoomBy(-.1)">−</el-button><span>{{ Math.round(viewScale * 100) }}%</span><el-button size="small" @click="zoomBy(.1)">＋</el-button>
      <el-button size="small" @click="resetView">居中</el-button>
    </div>
    <div class="book-table" :class="{ grabbing: panning }" @wheel.prevent="onWheel" @pointerdown="startPan" @pointermove="movePan" @pointerup="endPan" @pointerleave="endPan" @contextmenu.stop.prevent="onContextMenu">
      <div class="book-spread" :style="{ transform: `translate(${panX}px, ${panY}px) scale(${viewScale})` }">
      <div class="book-cover-shadow"></div>
      <article class="paper left-paper">
        <div class="page-number">{{ spread * 2 + 1 }}</div>
        <div ref="leftText" class="paper-text" contenteditable="true" spellcheck="true" @input="onText('left', $event)" @focus="activeSide = 'left'" data-placeholder="点击纸页直接开始写笔记…"></div>
        <canvas ref="leftCanvas" class="ink" :class="{ active: drawingEnabled }" width="1500" height="1900" @pointerdown.stop="startInk('left', $event)" @pointermove.stop="moveInk($event)" @pointerup.stop="endInk" @pointerleave.stop="endInk" />
      </article>
      <div class="spine"></div>
      <article class="paper right-paper">
        <div class="page-number">{{ spread * 2 + 2 }}</div>
        <div ref="rightText" class="paper-text" contenteditable="true" spellcheck="true" @input="onText('right', $event)" @focus="activeSide = 'right'" data-placeholder="点击纸页直接开始写笔记…"></div>
        <canvas ref="rightCanvas" class="ink" :class="{ active: drawingEnabled }" width="1500" height="1900" @pointerdown.stop="startInk('right', $event)" @pointermove.stop="moveInk($event)" @pointerup.stop="endInk" @pointerleave.stop="endInk" />
      </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { renderMarkdown } from '../helpers/markdown'
import { useContextMenu } from '../stores/context-menu'

type Sheet = { left: string; right: string; leftInk: string; rightInk: string }
const MARKER = '<!-- lk:notebook:v1 -->\n'
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void; (e: 'dirty'): void; (e: 'open-ai', value: { context: string; label: string; action?: string }): void }>()
const menu = useContextMenu()
const leftText = ref<HTMLElement | null>(null)
const rightText = ref<HTMLElement | null>(null)
const leftCanvas = ref<HTMLCanvasElement | null>(null)
const rightCanvas = ref<HTMLCanvasElement | null>(null)
const pages = ref<Sheet[]>([])
const spread = ref(0)
const activeSide = ref<'left' | 'right'>('left')
type Tool = 'select' | 'hand' | 'pen' | 'highlighter' | 'line' | 'arrow' | 'eraser'
const tool = ref<Tool>('select')
const inkColor = ref('#4d4a42')
const inkWidth = ref(3)
const viewScale = ref(1)
const panX = ref(0)
const panY = ref(0)
const drawingEnabled = computed(() => !['select', 'hand'].includes(tool.value))
let drawing = false
let drawingSide: 'left' | 'right' = 'left'
let startPoint: { x: number; y: number } | null = null
let panning = false
let panStart = { x: 0, y: 0, left: 0, top: 0 }
let lastSerialized = ''

function blank(): Sheet { return { left: '', right: '', leftInk: '', rightInk: '' } }
function parse(value: string): Sheet[] {
  if (value.startsWith(MARKER)) {
    try { const data = JSON.parse(value.slice(MARKER.length)); if (Array.isArray(data.pages) && data.pages.length) return data.pages } catch { /* use fallback */ }
  }
  return [{ ...blank(), left: value ? renderMarkdown(value) : '' }]
}
function serialize() { return MARKER + JSON.stringify({ pages: pages.value }) }
function syncPage() {
  const page = pages.value[spread.value] || blank()
  if (leftText.value) leftText.value.innerHTML = page.left
  if (rightText.value) rightText.value.innerHTML = page.right
  paint(leftCanvas.value, page.leftInk)
  paint(rightCanvas.value, page.rightInk)
}
function syncOut() {
  lastSerialized = serialize()
  emit('update:modelValue', lastSerialized)
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
}
function currentCanvas(side: 'left' | 'right') { return side === 'left' ? leftCanvas.value : rightCanvas.value }
function point(canvas: HTMLCanvasElement, event: PointerEvent) { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height } }
function startInk(side: 'left' | 'right', event: PointerEvent) {
  if (!drawingEnabled.value) return
  const canvas = currentCanvas(side); if (!canvas) return
  drawing = true; drawingSide = side; canvas.setPointerCapture(event.pointerId)
  const c = canvas.getContext('2d')!; const p = point(canvas, event); startPoint = p; c.beginPath(); c.moveTo(p.x, p.y)
}
function moveInk(event: PointerEvent) {
  if (!drawing || !drawingEnabled.value) return
  const canvas = currentCanvas(drawingSide); if (!canvas) return
  const c = canvas.getContext('2d')!; const p = point(canvas, event)
  if (tool.value === 'line' || tool.value === 'arrow') return
  c.globalCompositeOperation = tool.value === 'eraser' ? 'destination-out' : 'source-over'
  c.globalAlpha = tool.value === 'highlighter' ? .28 : 1
  c.strokeStyle = inkColor.value; c.lineWidth = (tool.value === 'eraser' ? inkWidth.value * 7 : inkWidth.value * 3) * (event.pressure && event.pressure > 0 ? .7 + event.pressure : 1); c.lineCap = 'round'; c.lineJoin = 'round'; c.lineTo(p.x, p.y); c.stroke()
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'
}
function endInk(event: PointerEvent) {
  if (!drawing) return
  drawing = false
  const canvas = currentCanvas(drawingSide)
  if (!canvas) return
  if ((tool.value === 'line' || tool.value === 'arrow') && startPoint) {
    const c = canvas.getContext('2d')!; const last = point(canvas, event)
    c.strokeStyle = inkColor.value; c.lineWidth = inkWidth.value * 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(startPoint.x, startPoint.y); c.lineTo(last.x, last.y); c.stroke()
    if (tool.value === 'arrow') { const angle = Math.atan2(last.y - startPoint.y, last.x - startPoint.x); const size = 18 + inkWidth.value; c.beginPath(); c.moveTo(last.x, last.y); c.lineTo(last.x - size * Math.cos(angle - .45), last.y - size * Math.sin(angle - .45)); c.moveTo(last.x, last.y); c.lineTo(last.x - size * Math.cos(angle + .45), last.y - size * Math.sin(angle + .45)); c.stroke() }
  }
  const page = pages.value[spread.value]
  if (drawingSide === 'left') page.leftInk = canvas.toDataURL('image/png'); else page.rightInk = canvas.toDataURL('image/png')
  syncOut()
}
function clearInk() { const page = pages.value[spread.value]; if (activeSide.value === 'left') page.leftInk = ''; else page.rightInk = ''; syncPage(); syncOut() }
function paint(canvas: HTMLCanvasElement | null, data: string) {
  if (!canvas) return
  const c = canvas.getContext('2d')!; c.clearRect(0, 0, canvas.width, canvas.height)
  if (!data) return
  const img = new Image(); img.onload = () => c.drawImage(img, 0, 0, canvas.width, canvas.height); img.src = data
}
function setTool(next: Tool) { tool.value = tool.value === next ? 'select' : next }
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
    { label: '画笔', icon: 'EditPen' as any, action: () => setTool('pen') },
    { label: '荧光笔', icon: 'Brush' as any, action: () => setTool('highlighter') },
    { label: '直线', icon: 'Minus' as any, action: () => setTool('line') },
    { label: '箭头', icon: 'Right' as any, action: () => setTool('arrow') },
    { label: '橡皮擦', icon: 'Delete' as any, action: () => setTool('eraser') },
    { label: '移动纸张', icon: 'Rank' as any, action: () => setTool('hand') },
  ]
  menu.open(event, [...common, { separator: true }, { label: '画笔工具', icon: 'Brush' as any, children: draw }, { label: '重置纸张视图', icon: 'Aim' as any, action: resetView }, { label: '清除当前页笔迹', icon: 'Delete' as any, danger: true, action: clearInk }])
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
defineExpose({ insertHtml, insertImage, insertFormula, togglePen, nextSpread: () => turn(1), getText })

watch(() => props.modelValue, (value) => {
  if (value === lastSerialized) return
  pages.value = parse(value || '')
  spread.value = 0
  nextTick(syncPage)
}, { immediate: true })
</script>

<style scoped lang="scss">
.notebook-shell { flex:1; min-height:0; display:flex; flex-direction:column; overflow:hidden; background:linear-gradient(135deg,#91806c,#c4b59d 45%,#74604e); }.notebook-tools { display:flex; align-items:center; gap:8px; padding:8px 14px; color:#f4eee5; background:rgba(45,31,22,.68); font-size:12px; flex-wrap:wrap; }.tool-sep { height:20px; width:1px; margin:0 4px; background:rgba(255,255,255,.3); }.book-table { position:relative; display:flex; flex:1; min-height:0; align-items:center; justify-content:center; padding:22px max(22px, 6vw) 30px; overflow:hidden; }.book-table.grabbing { cursor:grabbing; }.book-spread { position:relative; display:flex; align-items:stretch; transform-origin:center center; transition:transform .12s ease-out; }.book-cover-shadow { position:absolute; left:12%; right:12%; bottom:18px; height:28px; border-radius:50%; background:rgba(37,24,14,.46); filter:blur(13px); }.paper { position:relative; z-index:1; flex:0 1 620px; width:min(43vw,620px); min-width:320px; height:min(72vh,820px); min-height:520px; overflow:hidden; background:repeating-linear-gradient(to bottom, transparent 0, transparent 37px, rgba(87,151,184,.27) 38px, transparent 39px), linear-gradient(90deg, transparent 0, transparent 55px, rgba(216,88,88,.55) 56px, transparent 58px), radial-gradient(circle at 20% 10%, rgba(118,96,58,.11) 0 1px, transparent 1.5px), #fffdf5; background-size:auto,auto,17px 19px,auto; border:1px solid #d7c6a7; box-shadow:inset 0 0 36px rgba(121,92,45,.12), 0 14px 25px rgba(38,26,16,.3); }.left-paper { border-radius:7px 2px 2px 14px; }.right-paper { border-radius:2px 7px 14px 2px; }.spine { z-index:2; width:18px; margin:0 -4px; background:linear-gradient(90deg,rgba(48,31,20,.42),rgba(247,235,205,.85) 42%,rgba(56,38,25,.46)); box-shadow:0 0 12px rgba(25,17,10,.52); }.page-number { position:absolute; right:23px; bottom:18px; z-index:3; color:#84775e; font:12px Georgia,serif; }.paper-text { position:relative; z-index:1; height:100%; padding:28px 38px 44px 76px; box-sizing:border-box; outline:none; color:#3b352a; font:18px/38px 'KaiTi','STKaiti','Microsoft YaHei',serif; overflow:auto; caret-color:#315b8a; }.paper-text:empty::before { content:attr(data-placeholder); color:#aaa08c; pointer-events:none; }.paper-text :deep(p) { margin:0; min-height:38px; }.paper-text :deep(img) { max-width:100%; max-height:280px; vertical-align:middle; }.ink { position:absolute; inset:0; z-index:2; width:100%; height:100%; pointer-events:none; touch-action:none; }.ink.active { pointer-events:auto; cursor:crosshair; }.paper:has(.ink.active) .paper-text { user-select:none; }.paper-text :deep(.lk-formula) { display:inline-block; padding:0 6px; border-bottom:1px dashed #7289a3; color:#315b8a; font-family:Georgia,serif; }
@media (max-width:900px) { .book-table { padding:12px; }.paper { min-width:280px; }.paper-text { padding-left:64px; font-size:16px; }.notebook-tools { flex-wrap:wrap; } }
</style>
