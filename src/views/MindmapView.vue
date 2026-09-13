<template>
  <div class="mm-root">
    <!-- left: diagram tree -->
    <aside class="side" :style="{ width: sideW + 'px' }">
      <div class="side-head">
        <el-button size="small" type="primary" plain @click="newDiagram">新建图表</el-button>
        <el-button size="small" text @click="loadList" title="刷新图表列表">↻</el-button>
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
        <div v-if="!diagrams.length" class="empty-hint">还没有图表，创建一张或让 AI 帮你整理。</div>
      </div>
      <div class="side-foot">
        <el-button size="small" text @click="importXml">导入 XML</el-button>
      </div>
    </aside>
    <div class="resizer" @mousedown="startResize"></div>

    <!-- right: draw.io or markmap -->
    <main class="main">
      <div class="toolbar">
        <span class="title" v-if="currentTitle">{{ currentTitle }}</span>
        <span class="title muted" v-else>选择一张图表开始</span>
        <span class="spacer"></span>
        <el-radio-group v-model="viewMode" size="small">
          <el-radio-button value="edit">编辑</el-radio-button>
          <el-radio-button value="view">预览</el-radio-button>
        </el-radio-group>
        <span class="sep"></span>
        <el-button size="small" @click="saveDiagram" :disabled="!currentId">保存</el-button>
        <el-dropdown v-if="currentId" trigger="click" @command="onDiagramCommand"><el-button size="small">更多</el-button><template #dropdown><el-dropdown-menu><el-dropdown-item command="rename">重命名</el-dropdown-item><el-dropdown-item command="delete" divided>删除图表</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
        <el-button size="small" @click="exportPng" :disabled="!currentId">PNG</el-button>
        <el-button size="small" @click="exportSvg" :disabled="!currentId">SVG</el-button>
        <span class="sep"></span>
        <el-button size="small" @click="aiGenerate" title="描述想法，生成图表提案">AI 生成</el-button>
        <el-button size="small" @click="aiModify" :disabled="!currentId" title="生成修改后的新图表提案">AI 改写</el-button>
        <el-button size="small" @click="aiFromNotes" title="从笔记或电子书内容生成图表">从资料生成</el-button>
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
        <div v-else class="loading-hint">正在加载图表编辑器…</div>
      </div>

      <!-- markmap view (read-only) -->
      <div class="view-wrap" v-show="viewMode === 'view'">
        <div ref="svgHost" class="svg-host"></div>
        <div v-if="!currentXml" class="loading-hint">选择图表后即可预览</div>
      </div>
    </main>

    <!-- AI dialogs -->
    <el-dialog v-model="aiDialog.open" :title="aiDialog.title" width="600px">
      <el-input v-model="aiDialog.prompt" type="textarea" :rows="4" :placeholder="aiDialog.placeholder" />
      <template #footer>
        <el-button @click="aiDialog.open = false">取消</el-button>
        <el-button type="primary" :loading="aiDialog.loading" @click="aiDialog.action">生成提案</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
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
  if (msg.event === 'configure') {
    // Editor asks for config before init. Hide the file-save menus that would otherwise
    // call showSaveFilePicker (forbidden in cross-origin iframes) and the exit/print items,
    // since we own persistence + export via the host toolbar.
    postToIframe({
      action: 'configure',
      config: {
        hideMenuItems: ['save', 'saveAs', 'exit', 'print', 'share'],
        suppressNewWindows: true,
      }
    })
  } else if (msg.event === 'init' || msg.event === 'ready') {
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
    currentXml.value = msg.xml || msg.data || ''
    if (currentId.value) {
      window.lk.diagUpsert({ id: currentId.value, title: currentTitle.value, xml: currentXml.value })
      status.value = 'Saved'
      ElMessage.success('Saved')
    }
    return
  }
  // draw.io returns `data` as a COMPLETE data URI (e.g. data:image/png;base64,... or
  // data:image/svg+xml;...). Use it directly as the download href — do NOT prepend another
  // prefix (that double-prefix broke PNG) and do NOT wrap it in a Blob as text (that put the
  // literal "data:..." string into the file, which broke SVG with "Start tag expected").
  let href = msg.data || ''
  if (!href) return
  // Defensive: if for some reason we got raw XML/SVG text instead of a data URI, wrap it.
  if (msg.format === 'svg' && !href.startsWith('data:')) {
    href = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(href)
  } else if (msg.format === 'png' && !href.startsWith('data:')) {
    href = 'data:image/png;base64,' + href
  }
  const ext = msg.format === 'svg' ? '.svg' : '.png'
  const a = document.createElement('a')
  a.href = href
  a.download = (currentTitle.value || 'diagram') + ext
  document.body.appendChild(a)
  a.click()
  a.remove()
  status.value = 'Exported ' + msg.format.toUpperCase()
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
  const id = await window.lk.diagUpsert({ title: '未命名图表', xml: emptyXml(), format: 'drawio' })
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
  try {
    const result = await ElMessageBox.prompt('粘贴你信任的 Draw.io XML 文件内容。', '导入图表', { inputType: 'textarea', confirmButtonText: '导入', cancelButtonText: '取消', inputValidator: value => {
      if (!value?.trim()) return '请粘贴 XML 内容'
      const doc = new DOMParser().parseFromString(value, 'application/xml')
      return !doc.querySelector('parsererror') && ['mxGraphModel', 'mxfile'].includes(doc.documentElement.tagName) ? true : '需要格式完整的 mxGraphModel 或 mxfile XML'
    } })
    const id = await window.lk.diagUpsert({ title: '导入的图表', xml: result.value, format: 'drawio' })
    await loadList(); await selectDiagram(id)
  } catch (error: unknown) { if (error !== 'cancel' && error !== 'close') ElMessage.error(error instanceof Error ? error.message : '导入失败') }
}

function onTreeCtx(_e: MouseEvent, d: { id: string }) {
  void selectDiagram(d.id)
  ElMessage.info('已选中图表，可在顶部“更多”中重命名或删除。')
}
async function onDiagramCommand(command: string) {
  const diagram = diagrams.value.find(item => item.id === currentId.value)
  if (!diagram) return
  try {
    if (command === 'rename') {
      const result = await ElMessageBox.prompt('为这张图表起一个名字', '重命名图表', { inputValue: diagram.title, inputValidator: value => !!value?.trim() || '标题不能为空', confirmButtonText: '保存', cancelButtonText: '取消' })
      await window.lk.diagUpsert({ ...diagram, title: result.value.trim(), xml: currentXml.value })
      currentTitle.value = result.value.trim()
    } else if (command === 'delete') {
      await ElMessageBox.confirm(`删除“${diagram.title}”？此操作无法从图表列表恢复。`, '删除图表', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '保留' })
      await window.lk.diagDelete(diagram.id)
      currentId.value = ''; currentTitle.value = ''; currentXml.value = ''; pendingXml = null
      if (iframeReady) sendLoad(emptyXml())
    }
    await loadList()
  } catch (error: unknown) { if (error !== 'cancel' && error !== 'close') ElMessage.error(error instanceof Error ? error.message : '图表操作失败') }
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
    open: true, title: '用 AI 生成图表',
    prompt: '', placeholder: '描述你的想法，例如：整理一个博客系统的用户、文章与评论关系。',
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
    open: true, title: '生成图表修改提案',
    prompt: '', placeholder: '描述修改，例如：增加一个数据库节点并连接到用户。确认后会创建新图表，不覆盖原图。',
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
    open: true, title: '从学习资料生成图表',
    prompt: '', placeholder: '粘贴需要整理的笔记或电子书选段，AI 会提出可确认的图表操作。',
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
  iframeSrc.value = `http://127.0.0.1:${port}/?client=1&proto=json&configure=1&lang=zh&splash=0&stealth=1&noDevice=1&browser=0&suppressNewWindows=1`
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
