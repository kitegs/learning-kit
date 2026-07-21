<template>
  <div class="mm-root">
    <div class="head">
      <el-select v-model="currentId" placeholder="Mindmap" @change="onChangeSelect" style="width:200px">
        <el-option v-for="m in list" :key="m.id" :label="m.title" :value="m.id" />
      </el-select>
      <el-input v-if="current" v-model="current.title" style="width:180px;margin-left:8px" @change="save" />
      <el-button @click="newMap" type="primary" plain>+ New</el-button>
      <el-button @click="save" :disabled="!current">Save</el-button>
      <el-button @click="del" :disabled="!current" type="danger" plain>Delete</el-button>
      <el-radio-group v-model="viewMode" size="small" style="margin-left:8px">
        <el-radio-button value="md">Markdown</el-radio-button>
        <el-radio-button value="both">Both</el-radio-button>
        <el-radio-button value="draw">Draw</el-radio-button>
      </el-radio-group>
    </div>

    <!-- markdown + mindmap side by side -->
    <div class="split" v-if="viewMode==='both'">
      <textarea v-model="bodyDraft" class="ta" spellcheck="false" @input="scheduleRender"
        placeholder="# Mindmap (nested list)&#10;- Topic&#10;  - Branch&#10;    - Leaf"
        @contextmenu="onCtx"></textarea>
      <div class="mm-panel" ref="mmPanel">
        <div ref="svgHost" class="svg-host" @contextmenu="onCtx"></div>
        <AnnotationLayer ref="annoLayer" :annotations="annotations" @change="onAnnotationsChange" />
      </div>
    </div>

    <!-- markdown only -->
    <div class="split" v-if="viewMode==='md'">
      <textarea v-model="bodyDraft" class="ta" spellcheck="false" @input="scheduleRender"
        placeholder="# Mindmap&#10;- Topic&#10;  - Branch"
        @contextmenu="onCtx"></textarea>
      <div ref="svgHost2" class="svg-host" @contextmenu="onCtx"></div>
    </div>

    <!-- draw only -->
    <div class="draw-panel" v-if="viewMode==='draw'">
      <div class="draw-toolbar">
        <el-button-group size="small">
          <el-button :type="tool==='pen'?'primary':'default'" @click="tool='pen'">Pen</el-button>
          <el-button :type="tool==='eraser'?'primary':'default'" @click="tool='eraser'">Eraser</el-button>
        </el-button-group>
        <el-color-picker v-model="penColor" size="small" style="margin-left:8px" />
        <el-slider v-model="penSize" :min="1" :max="8" :step="0.5" style="width:100px;margin-left:8px" />
        <el-button size="small" @click="clearCanvas" style="margin-left:8px">Clear</el-button>
        <el-button size="small" type="primary" @click="saveDrawing" :disabled="!current">Save Drawing</el-button>
      </div>
      <canvas ref="drawCanvas" class="draw-canvas"
        @mousedown="startDraw" @mousemove="doDraw" @mouseup="endDraw" @mouseleave="endDraw"></canvas>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'
import { Transformer } from 'markmap-lib'
import { Markmap } from 'markmap-view'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useContextMenu } from '../stores/context-menu'
import AnnotationLayer from '../components/AnnotationLayer.vue'

interface Annotation { type: 'text' | 'drawing'; x: number; y: number; text?: string; w?: number; h?: number }

const transformer = new Transformer()
const list = ref<any[]>([])
const current = ref<any>(null)
const currentId = ref<string>('')
const bodyDraft = ref('')
const svgHost = ref<HTMLElement | null>(null)
const svgHost2 = ref<HTMLElement | null>(null)
const mmPanel = ref<HTMLElement | null>(null)
const drawCanvas = ref<HTMLCanvasElement | null>(null)
const annoLayer = ref<InstanceType<typeof AnnotationLayer> | null>(null)
const viewMode = ref<'md' | 'both' | 'draw'>('both')
const annotations = ref<Annotation[]>([])
const menu = useContextMenu()
let mm: Markmap | null = null
let renderTimer: any = null

const tool = ref<'pen' | 'eraser'>('pen')
const penColor = ref('#4ea1ff')
const penSize = ref(3)
let drawing = false
let ctx: CanvasRenderingContext2D | null = null

async function loadList() { list.value = await window.lk.mindmapList() }

async function onChangeSelect(id: string) {
  if (!id) return
  current.value = await window.lk.mindmapGet(id)
  bodyDraft.value = current.value.body || ''
  annotations.value = parseAnnotations(current.value.annotations)
  await nextTickRender()
  await nextTick()
  loadCanvasFromData(current.value.drawing)
}

function parseAnnotations(raw: string | undefined): Annotation[] {
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

function onAnnotationsChange(anns: Annotation[]) {
  annotations.value = anns
}

async function newMap() {
  const id = await window.lk.mindmapUpsert({ title: 'New', body: '# Mindmap\n- Topic\n  - Branch' })
  await loadList(); currentId.value = id; await onChangeSelect(id)
}

function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer)
  renderTimer = setTimeout(render, 200)
  if (current.value) current.value.body = bodyDraft.value
}

function render() {
  const host = viewMode.value === 'md' ? svgHost2.value : svgHost.value
  if (!host) return
  if (!mm) { host.innerHTML = '<svg style="width:100%;height:100%"></svg>'; mm = Markmap.create(host.querySelector('svg') as any, {}) }
  const { root } = transformer.transform(bodyDraft.value || '# \n')
  mm.setData(root); mm.fit()
}

async function nextTickRender() { await new Promise((r) => requestAnimationFrame(() => r(null))); render() }

async function save() {
  if (!current.value) return
  const drawing = await getCanvasData()
  await window.lk.mindmapUpsert({
    id: current.value.id, title: current.value.title, body: bodyDraft.value,
    drawing, annotations: JSON.stringify(annotations.value)
  })
  ElMessage.success('saved'); loadList()
}

async function del() {
  if (!current.value) return
  await ElMessageBox.confirm('Delete?', 'Delete', { type: 'warning' })
  await window.lk.mindmapDelete(current.value.id)
  current.value = null; currentId.value = ''; bodyDraft.value = ''; loadList()
}

function onCtx(e: MouseEvent) {
  e.preventDefault()
  menu.open(e, [
    { label: 'Save', icon: 'Check' as any, disabled: !current.value, action: save },
    { label: 'New', icon: 'Plus' as any, action: newMap },
    { separator: true },
    { label: 'Delete', icon: 'Delete' as any, danger: true, disabled: !current.value, action: del },
  ])
}

// Canvas drawing
function setupCanvas() {
  if (!drawCanvas.value) return
  const c = drawCanvas.value
  c.width = c.parentElement!.clientWidth || 800
  c.height = (window.innerHeight - 130) || 500
  ctx = c.getContext('2d'); if (ctx) { ctx.lineCap = 'round'; ctx.lineJoin = 'round' }
  loadCanvasFromData(current.value?.drawing)
}

function loadCanvasFromData(dataUrl: string | undefined) {
  if (!dataUrl || !drawCanvas.value) return
  const img = new Image()
  img.onload = () => {
    if (!drawCanvas.value) return
    const c = drawCanvas.value; const cctx = c.getContext('2d'); if (!cctx) return
    cctx.clearRect(0, 0, c.width, c.height); cctx.drawImage(img, 0, 0, c.width, c.height)
  }
  img.src = dataUrl
}

async function getCanvasData(): Promise<string> { return drawCanvas.value?.toDataURL('image/png') || '' }

async function saveDrawing() {
  if (!current.value) return
  const dataUrl = await getCanvasData()
  await window.lk.mindmapUpsert({ id: current.value.id, title: current.value.title, body: bodyDraft.value, drawing: dataUrl, annotations: JSON.stringify(annotations.value) })
  ElMessage.success('Drawing saved')
}

function clearCanvas() { if (drawCanvas.value && ctx) ctx.clearRect(0, 0, drawCanvas.value.width, drawCanvas.value.height) }
function startDraw(e: MouseEvent) {
  drawing = true; const rect = drawCanvas.value!.getBoundingClientRect()
  if (ctx) { ctx.beginPath(); ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top) }
}
function doDraw(e: MouseEvent) {
  if (!drawing || !ctx) return
  const rect = drawCanvas.value!.getBoundingClientRect()
  const x = e.clientX - rect.left; const y = e.clientY - rect.top
  if (tool.value === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = penSize.value * 3; ctx.strokeStyle = 'rgba(0,0,0,1)' }
  else { ctx.globalCompositeOperation = 'source-over'; ctx.lineWidth = penSize.value; ctx.strokeStyle = penColor.value }
  ctx.lineTo(x, y); ctx.stroke()
}
function endDraw() { drawing = false; if (ctx) ctx.globalCompositeOperation = 'source-over' }

watch(viewMode, () => { nextTick(() => { if (viewMode.value === 'draw') setupCanvas(); else render() }) })
watch(currentId, () => {})

onMounted(async () => {
  await loadList()
  if (!list.value.length) await newMap()
  else { currentId.value = list.value[0].id; await onChangeSelect(currentId.value) }
  window.addEventListener('resize', handleResize)
})

function handleResize() { mm?.fit(); if (viewMode.value === 'draw') setupCanvas() }
onBeforeUnmount(() => { mm = null; window.removeEventListener('resize', handleResize) })
</script>

<style scoped lang="scss">
.mm-root { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.head { display: flex; align-items: center; gap: 6px; padding: 8px 12px; background: var(--bg-soft); border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.split { flex: 1; display: flex; min-height: 0; }
.ta { flex: 1; border: none; outline: none; background: var(--bg); color: var(--text); font-family: 'JetBrains Mono', Consolas, monospace; font-size: 14px; padding: 16px 20px; resize: none; border-right: 1px solid var(--border); min-width: 0; }
.mm-panel { flex: 1; position: relative; background: #fafafa; min-width: 0; }
html[data-theme="dark"] .mm-panel { background: #252525; }
.svg-host { width: 100%; height: 100%; position: absolute; top: 0; left: 0; }
.svg-host :deep(svg) { width: 100%; height: 100%; }
.draw-panel { flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.draw-toolbar { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-top: 1px solid var(--border); background: var(--bg-soft); }
.draw-canvas { flex: 1; background: #fff; cursor: crosshair; border: none; }
html[data-theme="dark"] .draw-canvas { background: #2a2a2a; }
</style>