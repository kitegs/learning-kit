<template>
  <div class="drawio-root">
    <div class="drawio-toolbar">
      <el-select v-model="currentId" placeholder="Select diagram" @change="loadDiagram" style="width:200px" size="small">
        <el-option v-for="d in diagrams" :key="d.id" :label="d.title" :value="d.id" />
      </el-select>
      <el-input v-if="currentId" v-model="currentTitle" style="width:160px" size="small" @change="saveTitle" />
      <el-button size="small" type="primary" plain @click="newDiagram">+ New</el-button>
      <el-button size="small" @click="saveDiagram" :disabled="!currentId">Save</el-button>
      <el-button size="small" @click="exportPng" :disabled="!currentId">PNG</el-button>
      <el-button size="small" @click="exportSvg" :disabled="!currentId">SVG</el-button>
      <el-button size="small" type="danger" plain @click="deleteDiagram" :disabled="!currentId">Del</el-button>
      <span class="sep"></span>
      <el-button size="small" @click="aiGenerate" :disabled="!currentId" title="AI: describe → diagram">AI Gen</el-button>
      <el-button size="small" @click="aiModify" :disabled="!currentId" title="AI: modify current diagram">AI Edit</el-button>
      <el-button size="small" @click="aiExplain" :disabled="!currentId" title="AI: explain diagram">AI Read</el-button>
      <span class="sep"></span>
      <el-button size="small" @click="loadMindmapTemplate" title="Load mindmap template">Mindmap</el-button>
      <span class="status" v-if="status">{{ status }}</span>
    </div>
    <div class="drawio-frame-wrap">
      <iframe
        v-if="iframeSrc"
        ref="iframeRef"
        :src="iframeSrc"
        class="drawio-iframe"
        @load="onIframeLoad"
      ></iframe>
      <div v-else class="drawio-loading">Loading draw.io...</div>
    </div>

    <!-- AI dialog -->
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
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const emit = defineEmits<{ (e: 'saved', id: string): void }>()

const diagrams = ref<any[]>([])
const currentId = ref('')
const currentTitle = ref('')
const currentXml = ref('')
const iframeSrc = ref('')
const iframeRef = ref<HTMLIFrameElement | null>(null)
const status = ref('')
let drawioPort = 0
let iframeReady = false
let pendingXml: string | null = null

const aiDialog = ref({
  open: false, title: '', prompt: '', placeholder: '', loading: false,
  action: () => {}
})

// ── draw.io embed protocol ──
function postToIframe(msg: any) {
  if (iframeRef.value?.contentWindow) {
    iframeRef.value.contentWindow.postMessage(JSON.stringify(msg), '*')
  }
}

function onMessage(e: MessageEvent) {
  if (!e.data || typeof e.data !== 'string') return
  let msg: any
  try { msg = JSON.parse(e.data) } catch { return }

  if (msg.event === 'init') {
    iframeReady = true
    status.value = 'Ready'
    if (pendingXml) {
      postToIframe({ action: 'load', xml: pendingXml, autosave: 1 })
      pendingXml = null
    } else if (currentXml.value) {
      postToIframe({ action: 'load', xml: currentXml.value, autosave: 1 })
    } else {
      postToIframe({ action: 'load', xml: emptyXml(), autosave: 1 })
    }
  } else if (msg.event === 'save') {
    currentXml.value = msg.xml
    status.value = 'Unsaved changes'
  } else if (msg.event === 'autosave') {
    currentXml.value = msg.xml
  } else if (msg.event === 'export') {
    handleExportResult(msg)
  } else if (msg.event === 'exit') {
    status.value = ''
  }
}

function onIframeLoad() {
  // draw.io sends 'init' event via postMessage after load
}

function emptyXml(): string {
  return `<mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="1" shadow="0">
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
  </root>
</mxGraphModel>`
}

function mindmapTemplateXml(): string {
  return `<mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="1" shadow="0">
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <mxCell id="2" value="Central Topic" style="ellipse;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=16;fontStyle=1;" vertex="1" parent="1">
      <mxGeometry x="440" y="320" width="160" height="80" as="geometry"/>
    </mxCell>
    <mxCell id="3" value="Branch A" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
      <mxGeometry x="200" y="200" width="120" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="4" value="Branch B" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
      <mxGeometry x="680" y="200" width="120" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="5" value="Branch C" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
      <mxGeometry x="200" y="460" width="120" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="6" value="Branch D" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
      <mxGeometry x="680" y="460" width="120" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="2" target="3" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e2" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="2" target="4" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e3" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="2" target="5" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="e4" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="2" target="6" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
  </root>
</mxGraphModel>`
}

// ── CRUD ──
async function loadList() { diagrams.value = await window.lk.diagList() }

async function loadDiagram(id: string) {
  if (!id) return
  const list = diagrams.value
  const d = list.find((x: any) => x.id === id)
  if (d) {
    currentTitle.value = d.title
    currentXml.value = d.xml || ''
    if (iframeReady) {
      postToIframe({ action: 'load', xml: currentXml.value || emptyXml(), autosave: 1 })
    } else {
      pendingXml = currentXml.value || emptyXml()
    }
    status.value = 'Loaded'
  }
}

async function newDiagram() {
  const id = await window.lk.diagUpsert({ title: 'New Diagram', xml: emptyXml(), format: 'drawio' })
  await loadList()
  currentId.value = id
  await loadDiagram(id)
}

async function saveDiagram() {
  if (!currentId.value) return
  if (!currentXml.value && iframeReady) {
    // request current XML from iframe
    postToIframe({ action: 'export', format: 'xml' })
    return
  }
  await window.lk.diagUpsert({ id: currentId.value, title: currentTitle.value, xml: currentXml.value })
  status.value = 'Saved'
  emit('saved', currentId.value)
  ElMessage.success('Saved')
}

async function saveTitle() {
  if (!currentId.value) return
  await window.lk.diagUpsert({ id: currentId.value, title: currentTitle.value, xml: currentXml.value })
}

async function deleteDiagram() {
  if (!currentId.value) return
  await ElMessageBox.confirm('Delete this diagram?', 'Delete', { type: 'warning' })
  await window.lk.diagDelete(currentId.value)
  currentId.value = ''; currentXml.value = ''; currentTitle.value = ''
  await loadList()
  if (diagrams.value.length) { currentId.value = diagrams.value[0].id; await loadDiagram(currentId.value) }
  else { postToIframe({ action: 'load', xml: emptyXml(), autosave: 1 }) }
}

// ── Export ──
let exportResolve: ((data: string) => void) | null = null
function handleExportResult(msg: any) {
  if (msg.format === 'xml') {
    currentXml.value = msg.data || msg.xml || ''
    // auto-save after getting XML
    if (currentId.value) {
      window.lk.diagUpsert({ id: currentId.value, title: currentTitle.value, xml: currentXml.value })
      status.value = 'Saved'
      ElMessage.success('Saved')
    }
  } else if (exportResolve) {
    exportResolve(msg.data)
    exportResolve = null
  }
}

function requestExport(format: string): Promise<string> {
  return new Promise((resolve) => {
    exportResolve = resolve
    postToIframe({ action: 'export', format })
  })
}

async function exportPng() {
  status.value = 'Exporting PNG...'
  const data = await requestExport('png')
  if (data) {
    const a = document.createElement('a')
    a.href = 'data:image/png;base64,' + data
    a.download = (currentTitle.value || 'diagram') + '.png'
    a.click()
    status.value = 'Exported PNG'
  }
}

async function exportSvg() {
  status.value = 'Exporting SVG...'
  const data = await requestExport('svg')
  if (data) {
    const blob = new Blob([data], { type: 'image/svg+xml' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = (currentTitle.value || 'diagram') + '.svg'
    a.click()
    status.value = 'Exported SVG'
  }
}

function loadMindmapTemplate() {
  currentXml.value = mindmapTemplateXml()
  if (iframeReady) postToIframe({ action: 'load', xml: currentXml.value, autosave: 1 })
  else pendingXml = currentXml.value
  status.value = 'Mindmap template loaded'
}

// ── AI operations ──
function aiGenerate() {
  aiDialog.value = {
    open: true, title: 'AI Generate Diagram',
    prompt: '', placeholder: 'Describe the diagram you want, e.g. "UML class diagram for a blog system with User, Post, Comment entities"',
    loading: false,
    action: async () => {
      aiDialog.value.loading = true
      try {
        const xml = await aiGenerateXml(aiDialog.value.prompt)
        if (xml) {
          currentXml.value = xml
          if (iframeReady) postToIframe({ action: 'load', xml, autosave: 1 })
          else pendingXml = xml
          aiDialog.value.open = false
          status.value = 'AI generated'
          await saveDiagram()
        }
      } catch (e: any) { ElMessage.error('AI failed: ' + (e?.message || e)) }
      aiDialog.value.loading = false
    }
  }
}

function aiModify() {
  aiDialog.value = {
    open: true, title: 'AI Modify Diagram',
    prompt: '', placeholder: 'Describe the changes, e.g. "Add a Database node connected to User, change Post color to red"',
    loading: false,
    action: async () => {
      aiDialog.value.loading = true
      try {
        const xml = await aiModifyXml(currentXml.value, aiDialog.value.prompt)
        if (xml) {
          currentXml.value = xml
          if (iframeReady) postToIframe({ action: 'load', xml, autosave: 1 })
          aiDialog.value.open = false
          status.value = 'AI modified'
          await saveDiagram()
        }
      } catch (e: any) { ElMessage.error('AI failed: ' + (e?.message || e)) }
      aiDialog.value.loading = false
    }
  }
}

function aiExplain() {
  aiDialog.value = {
    open: true, title: 'AI Explain Diagram',
    prompt: 'Please explain this diagram in detail.', placeholder: '',
    loading: false,
    action: async () => {
      aiDialog.value.loading = true
      try {
        // Dispatch to chat
        window.dispatchEvent(new CustomEvent('lk:ai-action', {
          detail: { text: currentXml.value, prompt: 'Explain this draw.io diagram in detail. Describe each node, edge, and the overall structure.' }
        }))
        aiDialog.value.open = false
      } catch (e: any) { ElMessage.error('Failed: ' + (e?.message || e)) }
      aiDialog.value.loading = false
    }
  }
}

// ── AI XML helpers (dispatch to chat with special prompts) ──
async function aiGenerateXml(description: string): Promise<string | null> {
  // We send this to the AI chat and expect XML back
  // The AI system prompt already handles <mindmap> tags, but for draw.io we need mxGraphModel XML
  // We'll dispatch to chat and parse the response
  return new Promise((resolve) => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.xml) {
        window.removeEventListener('lk:ai-xml-result', handler)
        resolve(detail.xml)
      }
    }
    window.addEventListener('lk:ai-xml-result', handler)
    // Dispatch AI action requesting XML generation
    window.dispatchEvent(new CustomEvent('lk:ai-action', {
      detail: {
        text: description,
        prompt: `Generate a draw.io mxGraphModel XML diagram for the following description. Output ONLY the XML inside a <drawio> tag. The XML must be valid mxGraphModel format with proper mxCell elements, mxGeometry, and styles. Do not include any explanation outside the <drawio> tag.\n\nDescription: ${description}`,
        expectXml: true
      }
    }))
    // Timeout fallback
    setTimeout(() => { window.removeEventListener('lk:ai-xml-result', handler); resolve(null) }, 60000)
  })
}

async function aiModifyXml(currentXml: string, instruction: string): Promise<string | null> {
  return new Promise((resolve) => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.xml) {
        window.removeEventListener('lk:ai-xml-result', handler)
        resolve(detail.xml)
      }
    }
    window.addEventListener('lk:ai-xml-result', handler)
    window.dispatchEvent(new CustomEvent('lk:ai-action', {
      detail: {
        text: currentXml,
        prompt: `Modify the following draw.io mxGraphModel XML according to this instruction. Output ONLY the modified XML inside a <drawio> tag. Preserve all existing elements not mentioned in the instruction.\n\nInstruction: ${instruction}\n\nCurrent XML:\n${currentXml}`,
        expectXml: true
      }
    }))
    setTimeout(() => { window.removeEventListener('lk:ai-xml-result', handler); resolve(null) }, 60000)
  })
}

// ── lifecycle ─
onMounted(async () => {
  window.addEventListener('message', onMessage)
  drawioPort = await window.lk.drawioPort()
  iframeSrc.value = `http://127.0.0.1:${drawioPort}/?embed=1&proto=json&spin=1&modified=unsavedChanges&noSaveBtn=1&noExitBtn=1&lang=zh&ui=min`
  await loadList()
  if (diagrams.value.length) {
    currentId.value = diagrams.value[0].id
    await loadDiagram(currentId.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
})
</script>

<style scoped lang="scss">
.drawio-root { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.drawio-toolbar { display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: var(--bg-soft); border-bottom: 1px solid var(--border); flex-wrap: wrap; flex-shrink: 0; }
.sep { width: 1px; height: 20px; background: var(--border); margin: 0 4px; }
.status { font-size: 11px; color: var(--text-dim); margin-left: auto; }
.drawio-frame-wrap { flex: 1; min-height: 0; position: relative; }
.drawio-iframe { width: 100%; height: 100%; border: none; }
.drawio-loading { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-dim); font-size: 14px; }
</style>