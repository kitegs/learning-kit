<template>
  <div class="mm-root">
    <!-- left: diagram tree -->
    <aside class="side" :style="{ width: sideW + 'px' }">
      <div class="side-head">
        <el-button size="small" type="primary" plain @click="newDiagram">+ New</el-button>
        <el-button size="small" text @click="loadList">↻</el-button>
      </div>
      <div class="tree-scroll">
        <div
          v-for="d in diagrams"
          :key="d.id"
          class="tree-item"
          :class="{ active: currentId === d.id }"
          @click="selectDiagram(d.id)"
          @contextmenu.prevent="onTreeCtx($event, d)"
        >
          <span class="icon">{{ d.format === 'drawio' ? '📐' : '🧠' }}</span>
          <span class="label">{{ d.title }}</span>
        </div>
        <div v-if="!diagrams.length" class="empty-hint">No diagrams yet</div>
      </div>
      <div class="side-foot">
        <el-button size="small" text @click="importXml">Import XML</el-button>
      </div>
    </aside>
    <div class="resizer" @mousedown="startResize"></div>

    <!-- right: draw.io or markmap -->
    <main class="main">
      <div class="toolbar">
        <span class="title" v-if="currentTitle">{{ currentTitle }}</span>
        <span class="title muted" v-else>Select a diagram</span>
        <span class="spacer"></span>
        <el-radio-group v-model="viewMode" size="small">
          <el-radio-button value="edit">Edit</el-radio-button>
          <el-radio-button value="view">View</el-radio-button>
        </el-radio-group>
        <span class="sep"></span>
        <el-button size="small" @click="saveDiagram" :disabled="!currentId">Save</el-button>
        <el-button size="small" @click="exportPng" :disabled="!currentId">PNG</el-button>
        <el-button size="small" @click="exportSvg" :disabled="!currentId">SVG</el-button>
        <span class="sep"></span>
        <el-button size="small" @click="aiGenerate" title="AI: describe → diagram">AI Gen</el-button>
        <el-button size="small" @click="aiModify" :disabled="!currentId" title="AI: modify current">AI Edit</el-button>
        <el-button size="small" @click="aiFromNotes" title="AI: from selected notes/ebook">AI From Notes</el-button>
        <span class="status" v-if="status">{{ status }}</span>
      </div>

      <!-- draw.io iframe (edit mode) -->
      <div class="frame-wrap" v-show="viewMode === 'edit'">
        <iframe
          v-if="iframeSrc"
          ref="iframeRef"
          :src="iframeSrc"
          class="drawio-iframe"
        ></iframe>
        <div v-else class="loading-hint">Loading draw.io...</div>
      </div>

      <!-- markmap view (read-only) -->
      <div class="view-wrap" v-show="viewMode === 'view'">
        <div ref="svgHost" class="svg-host"></div>
        <div v-if="!currentXml" class="loading-hint">No diagram loaded</div>
      </div>
    </main>

    <!-- AI dialogs -->
    <el-dialog v-model="aiDialog.open" :title="aiDialog.title" width="600px">
      <el-input v-model="aiDialog.prompt" type="textarea" :rows="4" :placeholder="aiDialog.placeholder" />
      <template #footer>
        <el-button @click="aiDialog.open = false">Cancel</el-button>
        <el-button type="primary" :loading="aiDialog.loading" @click="aiDialog.action">Send</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { Transformer } from 'markmap-lib'
import { Markmap } from 'markmap-view'

const transformer = new Transformer()

const diagrams = ref<any[]>([])
const currentId = ref('')
const currentTitle = ref('')
const currentXml = ref('')
const viewMode = ref<'edit' | 'view'>('edit')
const iframeSrc = ref('')
const iframeRef = ref<HTMLIFrameElement | null>(null)
const svgHost = ref<HTMLElement | null>(null)
const status = ref('')
const sideW = ref(200)
let mm: Markmap | null = null
let iframeReady = false
let pendingXml: string | null = null

const aiDialog = ref({ open: false, title: '', prompt: '', placeholder: '', loading: false, action: () => {} })

// ── draw.io postMessage bridge ──
function postToIframe(msg: any) {
  iframeRef.value?.contentWindow?.postMessage(JSON.stringify(msg), '*')
}

// Unified load: hide draw.io's own Save/Exit buttons (we own persistence),
// route UI-triggered exports through the JSON protocol (avoids cross-origin showSaveFilePicker).
function sendLoad(xml: string) {
  postToIframe({ action: 'load', xml, autosave: 1, noSaveBtn: 1, noExitBtn: 1, exportProtocol: true })
}

function onMessage(e: MessageEvent) {
  if (!e.data || typeof e.data !== 'string') return
  let msg: any
  try { msg = JSON.parse(e.data) } catch { return }
  if (msg.event === 'init' || msg.event === 'ready') {
    iframeReady = true
    status.value = 'Ready'
    const xml = pendingXml || currentXml.value || emptyXml()
    pendingXml = null
    sendLoad(xml)
  } else if (msg.event === 'save' || msg.event === 'autosave') {
    currentXml.value = msg.xml || msg.data || ''
    status.value = msg.event === 'save' ? 'Saved in draw.io' : 'Autosaved'
  } else if (msg.event === 'export') {
    handleExportResult(msg)
  } else if (msg.event === 'exit') {
    // draw.io tried to close (e.g. File > Close). We own the editor lifecycle,
    // so ignore it and reload the current diagram to keep the canvas alive.
    sendLoad(currentXml.value || emptyXml())
    status.value = 'Kept open'
  }
}

function handleExportResult(msg: any) {
  if (msg.format === 'xml') {
    currentXml.value = msg.data || msg.xml || ''
    if (currentId.value) {
      window.lk.diagUpsert({ id: currentId.value, title: currentTitle.value, xml: currentXml.value })
      status.value = 'Saved'
      ElMessage.success('Saved')
    }
  } else if (msg.format === 'png' || msg.format === 'svg') {
    const data = msg.data || ''
    if (msg.format === 'png') {
      const a = document.createElement('a'); a.href = 'data:image/png;base64,' + data
      a.download = (currentTitle.value || 'diagram') + '.png'; a.click()
    } else {
      const blob = new Blob([data], { type: 'image/svg+xml' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
      a.download = (currentTitle.value || 'diagram') + '.svg'; a.click()
    }
    status.value = 'Exported ' + msg.format.toUpperCase()
  }
}

// ── CRUD ──
async function loadList() { diagrams.value = await window.lk.diagList() }

async function selectDiagram(id: string) {
  currentId.value = id
  const d = diagrams.value.find((x: any) => x.id === id)
  if (!d) return
  currentTitle.value = d.title
  currentXml.value = d.xml || ''
  if (viewMode.value === 'edit') {
    if (iframeReady) sendLoad(currentXml.value || emptyXml())
    else pendingXml = currentXml.value || emptyXml()
  } else {
    renderMarkmap()
  }
  status.value = 'Loaded'
}

async function newDiagram() {
  const id = await window.lk.diagUpsert({ title: 'New Diagram', xml: emptyXml(), format: 'drawio' })
  await loadList()
  await selectDiagram(id)
}

async function saveDiagram() {
  if (!currentId.value) return
  if (viewMode.value === 'edit' && iframeReady) {
    postToIframe({ action: 'export', format: 'xml' })
  } else {
    await window.lk.diagUpsert({ id: currentId.value, title: currentTitle.value, xml: currentXml.value })
    status.value = 'Saved'; ElMessage.success('Saved')
  }
}

async function exportPng() { if (iframeReady) postToIframe({ action: 'export', format: 'png' }) }
async function exportSvg() { if (iframeReady) postToIframe({ action: 'export', format: 'svg' }) }

async function importXml() {
  const xml = prompt('Paste mxGraphModel XML:')
  if (!xml) return
  const id = await window.lk.diagUpsert({ title: 'Imported', xml, format: 'drawio' })
  await loadList()
  await selectDiagram(id)
}

function onTreeCtx(_e: MouseEvent, d: any) {
  // simple context menu via prompt
  const action = prompt('rename / delete / cancel:', 'rename')
  if (action === 'rename') {
    const name = prompt('New name:', d.title)
    if (name) window.lk.diagUpsert({ id: d.id, title: name, xml: d.xml }).then(() => loadList())
  } else if (action === 'delete') {
    window.lk.diagDelete(d.id).then(() => { if (currentId.value === d.id) { currentId.value = ''; currentXml.value = '' }; loadList() })
  }
}

// ── markmap rendering ──
function renderMarkmap() {
  if (!svgHost.value || !currentXml.value) return
  // Convert mxGraphModel XML to markdown outline for markmap
  const md = xmlToMarkdown(currentXml.value)
  svgHost.value.innerHTML = '<svg style="width:100%;height:100%"></svg>'
  mm = Markmap.create(svgHost.value.querySelector('svg') as any, {})
  const { root } = transformer.transform(md)
  mm.setData(root)
  mm.fit()
}

function xmlToMarkdown(xml: string): string {
  // Simple extraction: find all value="..." attributes
  const values: string[] = []
  const re = /value="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const v = m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    if (v.trim()) values.push(v.trim())
  }
  if (!values.length) return '# Empty Diagram'
  // First value = root, rest = children
  let md = '# ' + values[0] + '\n'
  for (let i = 1; i < values.length; i++) md += '- ' + values[i] + '\n'
  return md
}

function emptyXml(): string {
  return `<mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="1" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>`
}

// ── AI operations ──
function aiGenerate() {
  aiDialog.value = {
    open: true, title: 'AI Generate Diagram',
    prompt: '', placeholder: 'Describe the diagram, e.g. "UML class diagram for a blog system"',
    loading: false,
    action: async () => {
      aiDialog.value.loading = true
      try {
        window.dispatchEvent(new CustomEvent('lk:ai-action', {
          detail: { text: aiDialog.value.prompt, prompt: `Generate a draw.io mxGraphModel XML for: ${aiDialog.value.prompt}\nOutput ONLY valid mxGraphModel XML inside <drawio>...</drawio> tags.` }
        }))
        aiDialog.value.open = false
      } catch (e: any) { ElMessage.error('Failed: ' + (e?.message || e)) }
      aiDialog.value.loading = false
    }
  }
}

function aiModify() {
  aiDialog.value = {
    open: true, title: 'AI Modify Diagram',
    prompt: '', placeholder: 'Describe changes, e.g. "Add a Database node connected to User"',
    loading: false,
    action: async () => {
      aiDialog.value.loading = true
      try {
        window.dispatchEvent(new CustomEvent('lk:ai-action', {
          detail: { text: currentXml.value, prompt: `Modify this draw.io XML per instruction. Output ONLY modified XML in <drawio> tags.\nInstruction: ${aiDialog.value.prompt}` }
        }))
        aiDialog.value.open = false
      } catch (e: any) { ElMessage.error('Failed: ' + (e?.message || e)) }
      aiDialog.value.loading = false
    }
  }
}

function aiFromNotes() {
  aiDialog.value = {
    open: true, title: 'AI: Generate diagram from notes/ebook',
    prompt: '', placeholder: 'Paste or describe the content to visualize, or specify note/ebook range',
    loading: false,
    action: async () => {
      aiDialog.value.loading = true
      try {
        window.dispatchEvent(new CustomEvent('lk:ai-action', {
          detail: { text: aiDialog.value.prompt, prompt: `Create a mind map / diagram from this content. Output markmap markdown in <mindmap> tags AND draw.io XML in <drawio> tags.\n\nContent:\n${aiDialog.value.prompt}` }
        }))
        aiDialog.value.open = false
      } catch (e: any) { ElMessage.error('Failed: ' + (e?.message || e)) }
      aiDialog.value.loading = false
    }
  }
}

// ── resize ──
function startResize(e: MouseEvent) {
  const sx = e.clientX, sw = sideW.value
  const mv = (ev: MouseEvent) => { sideW.value = Math.max(120, Math.min(400, sw + ev.clientX - sx)) }
  const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
  window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
}

// ── view mode switch ──
watch(viewMode, (v) => {
  if (v === 'view') nextTick(() => renderMarkmap())
  else if (v === 'edit' && currentXml.value) {
    if (iframeReady) sendLoad(currentXml.value)
    else pendingXml = currentXml.value
  }
})

// ── lifecycle ──
onMounted(async () => {
  window.addEventListener('message', onMessage)
  const port = await window.lk.drawioPort()
  // client=1 => full normal UI (left shape library + right format panel + full menus, like the standalone editor)
  // proto=json => postMessage JSON protocol so we can load/save XML programmatically
  // stealth=1 + noDevice=1 + browser=0 => no cloud/device storage UI, we own persistence via SQLite
  // suppressNewWindows=1 => link clicks route to host instead of popping windows
  // splash=0 => skip splash screen
  iframeSrc.value = `http://127.0.0.1:${port}/?client=1&proto=json&lang=zh&splash=0&stealth=1&noDevice=1&browser=0&suppressNewWindows=1`
  await loadList()
  if (diagrams.value.length) await selectDiagram(diagrams.value[0].id)
})

onBeforeUnmount(() => { window.removeEventListener('message', onMessage) })
</script>

<style scoped lang="scss">
.mm-root { display: flex; flex: 1; min-width: 0; height: 100%; min-height: 0; overflow: hidden; }
.side { background: var(--bg-soft); border-right: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; overflow: hidden; }
.side-head { padding: 8px; display: flex; gap: 4px; border-bottom: 1px solid var(--border); }
.tree-scroll { flex: 1; overflow: auto; padding: 4px; }
.tree-item { display: flex; align-items: center; gap: 6px; padding: 6px 8px; cursor: pointer; border-radius: 4px; font-size: 13px; &:hover { background: var(--bg-hover); } &.active { background: var(--bg-selected); color: var(--accent); } }
.tree-item .icon { font-size: 14px; flex-shrink: 0; }
.tree-item .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty-hint { color: var(--text-dim); font-size: 12px; padding: 12px; text-align: center; }
.side-foot { padding: 6px 8px; border-top: 1px solid var(--border); }
.resizer { width: 4px; cursor: col-resize; background: var(--border); flex-shrink: 0; &:hover { background: var(--accent); } }
.main { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; }
.toolbar { display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: var(--bg-soft); border-bottom: 1px solid var(--border); flex-shrink: 0; flex-wrap: wrap; }
.title { font-weight: 600; font-size: 13px; &.muted { color: var(--text-dim); font-weight: 400; } }
.spacer { flex: 1; }
.sep { width: 1px; height: 20px; background: var(--border); margin: 0 2px; }
.status { font-size: 11px; color: var(--text-dim); }
.frame-wrap { flex: 1; min-height: 0; position: relative; }
.drawio-iframe { width: 100%; height: 100%; border: none; }
.view-wrap { flex: 1; min-height: 0; overflow: hidden; }
.svg-host { width: 100%; height: 100%; }
.svg-host :deep(svg) { width: 100%; height: 100%; }
.loading-hint { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-dim); font-size: 14px; }
</style>