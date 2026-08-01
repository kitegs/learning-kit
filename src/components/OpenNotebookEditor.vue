<template>
  <section class="notebook-shell">
    <div class="notebook-tools">
      <el-button size="small" @click="turn(-1)" :disabled="spread === 0">← 翻页</el-button>
      <span>第 {{ spread * 2 + 1 }}–{{ spread * 2 + 2 }} 页</span>
      <el-button size="small" @click="turn(1)">下一页 →</el-button>
      <span class="tool-sep"></span>
      <el-button size="small" :type="penMode ? 'primary' : 'default'" @click="togglePen">{{ penMode ? '结束书写' : '画笔' }}</el-button>
      <el-select v-model="inkColor" size="small" style="width:98px"><el-option label="铅笔灰" value="#4d4a42" /><el-option label="墨水蓝" value="#315b8a" /><el-option label="批注红" value="#b44b45" /></el-select>
      <el-slider v-model="inkWidth" :min="1" :max="9" style="width:110px" />
      <el-button size="small" @click="clearInk">清除本页笔迹</el-button>
    </div>
    <div class="book-table">
      <div class="book-cover-shadow"></div>
      <article class="paper left-paper">
        <div class="page-number">{{ spread * 2 + 1 }}</div>
        <div ref="leftText" class="paper-text" contenteditable="true" spellcheck="true" @input="onText('left', $event)" @focus="activeSide = 'left'" data-placeholder="点击纸页直接开始写笔记…"></div>
        <canvas ref="leftCanvas" class="ink" :class="{ active: penMode }" width="1500" height="1900" @pointerdown="startInk('left', $event)" @pointermove="moveInk($event)" @pointerup="endInk" @pointerleave="endInk" />
      </article>
      <div class="spine"></div>
      <article class="paper right-paper">
        <div class="page-number">{{ spread * 2 + 2 }}</div>
        <div ref="rightText" class="paper-text" contenteditable="true" spellcheck="true" @input="onText('right', $event)" @focus="activeSide = 'right'" data-placeholder="点击纸页直接开始写笔记…"></div>
        <canvas ref="rightCanvas" class="ink" :class="{ active: penMode }" width="1500" height="1900" @pointerdown="startInk('right', $event)" @pointermove="moveInk($event)" @pointerup="endInk" @pointerleave="endInk" />
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { renderMarkdown } from '../helpers/markdown'

type Sheet = { left: string; right: string; leftInk: string; rightInk: string }
const MARKER = '<!-- lk:notebook:v1 -->\n'
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void; (e: 'dirty'): void }>()
const leftText = ref<HTMLElement | null>(null)
const rightText = ref<HTMLElement | null>(null)
const leftCanvas = ref<HTMLCanvasElement | null>(null)
const rightCanvas = ref<HTMLCanvasElement | null>(null)
const pages = ref<Sheet[]>([])
const spread = ref(0)
const activeSide = ref<'left' | 'right'>('left')
const penMode = ref(false)
const inkColor = ref('#4d4a42')
const inkWidth = ref(3)
let drawing = false
let drawingSide: 'left' | 'right' = 'left'
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
  if (!penMode.value) return
  const canvas = currentCanvas(side); if (!canvas) return
  drawing = true; drawingSide = side; canvas.setPointerCapture(event.pointerId)
  const c = canvas.getContext('2d')!; const p = point(canvas, event); c.beginPath(); c.moveTo(p.x, p.y)
}
function moveInk(event: PointerEvent) {
  if (!drawing || !penMode.value) return
  const canvas = currentCanvas(drawingSide); if (!canvas) return
  const c = canvas.getContext('2d')!; const p = point(canvas, event)
  c.strokeStyle = inkColor.value; c.lineWidth = inkWidth.value * 3; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineTo(p.x, p.y); c.stroke()
}
function endInk() {
  if (!drawing) return
  drawing = false
  const canvas = currentCanvas(drawingSide)
  if (!canvas) return
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
function togglePen() { penMode.value = !penMode.value }
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
.notebook-shell { flex:1; min-height:0; display:flex; flex-direction:column; overflow:hidden; background:linear-gradient(135deg,#91806c,#c4b59d 45%,#74604e); }.notebook-tools { display:flex; align-items:center; gap:8px; padding:8px 14px; color:#f4eee5; background:rgba(45,31,22,.68); font-size:12px; }.tool-sep { height:20px; width:1px; margin:0 4px; background:rgba(255,255,255,.3); }.book-table { position:relative; display:flex; flex:1; min-height:0; align-items:stretch; justify-content:center; gap:0; padding:22px max(22px, 6vw) 30px; overflow:auto; }.book-cover-shadow { position:absolute; left:12%; right:12%; bottom:18px; height:28px; border-radius:50%; background:rgba(37,24,14,.46); filter:blur(13px); }.paper { position:relative; z-index:1; flex:0 1 620px; min-width:320px; min-height:680px; overflow:hidden; background:repeating-linear-gradient(to bottom, transparent 0, transparent 37px, rgba(87,151,184,.27) 38px, transparent 39px), linear-gradient(90deg, transparent 0, transparent 55px, rgba(216,88,88,.55) 56px, transparent 58px), radial-gradient(circle at 20% 10%, rgba(118,96,58,.11) 0 1px, transparent 1.5px), #fffdf5; background-size:auto,auto,17px 19px,auto; border:1px solid #d7c6a7; box-shadow:inset 0 0 36px rgba(121,92,45,.12), 0 14px 25px rgba(38,26,16,.3); }.left-paper { border-radius:7px 2px 2px 14px; transform:perspective(1700px) rotateY(1.6deg); }.right-paper { border-radius:2px 7px 14px 2px; transform:perspective(1700px) rotateY(-1.6deg); }.spine { z-index:2; width:18px; margin:0 -4px; background:linear-gradient(90deg,rgba(48,31,20,.42),rgba(247,235,205,.85) 42%,rgba(56,38,25,.46)); box-shadow:0 0 12px rgba(25,17,10,.52); }.page-number { position:absolute; right:23px; bottom:18px; z-index:3; color:#84775e; font:12px Georgia,serif; }.paper-text { position:relative; z-index:1; height:100%; padding:28px 38px 44px 76px; box-sizing:border-box; outline:none; color:#3b352a; font:18px/38px 'KaiTi','STKaiti','Microsoft YaHei',serif; overflow:auto; caret-color:#315b8a; }.paper-text:empty::before { content:attr(data-placeholder); color:#aaa08c; pointer-events:none; }.paper-text :deep(p) { margin:0; min-height:38px; }.paper-text :deep(img) { max-width:100%; max-height:280px; vertical-align:middle; }.ink { position:absolute; inset:0; z-index:2; width:100%; height:100%; pointer-events:none; touch-action:none; }.ink.active { pointer-events:auto; cursor:crosshair; }.paper:has(.ink.active) .paper-text { user-select:none; }.paper-text :deep(.lk-formula) { display:inline-block; padding:0 6px; border-bottom:1px dashed #7289a3; color:#315b8a; font-family:Georgia,serif; }
@media (max-width:900px) { .book-table { padding:12px; }.paper { min-width:280px; }.paper-text { padding-left:64px; font-size:16px; }.notebook-tools { flex-wrap:wrap; } }
</style>
