<template>
  <div class="notes-root">
    <aside class="side" :style="{ width: sideW + 'px' }">
      <div class="head">
        <el-button size="small" type="primary" plain @click="newFolder">+目录</el-button>
        <el-button size="small" @click="newNote()">+笔记</el-button>
        <el-button size="small" text @click="expandAll">展开</el-button>
        <el-button size="small" text @click="collapseAll">折叠</el-button>
      </div>
      <div class="tree-scroll">
        <el-tree
          ref="treeRef"
          :data="treeData"
          :props="{ label: 'title', children: 'children' }"
          node-key="id"
          :default-expanded-keys="defaultExpand"
          @node-click="(d) => onClick(d)"
          @node-contextmenu="onTreeCtx"
          @node-expand="onExpand"
          @node-collapse="onCollapse"
          draggable
          :allow-drop="allowDrop"
          @node-drop="onDrop"
        >
          <template #default="{ data }">
            <span :class="{ active: currentId === data.id, 'is-folder': data.kind === 'folder' }">
              <span v-if="data.kind === 'folder'" style="margin-right:4px">📁</span>
              <span v-else style="margin-right:4px">{{ data.kind === 'sticky' ? '📌' : '📄' }}</span>
              {{ data.title }}
            </span>
          </template>
        </el-tree>
      </div>
    </aside>
    <div class="resizer" @mousedown="startResize"></div>
    <main class="main" @contextmenu="onEditorCtx">
      <div v-if="!current" class="empty"><p>选择或新建一份笔记。</p></div>
      <div v-else class="editor-wrap">
        <div class="toolbar">
          <el-input v-model="current.title" placeholder="标题" class="title-in" @change="markDirty" size="small" />
          <el-input v-model="tagStr" placeholder="#tags" class="tag-in" @change="updateTags" size="small" />
          <span class="sep"></span>
          <el-button size="small" @click="insertCmd('# ','')">H1</el-button>
          <el-button size="small" @click="insertCmd('## ','')">H2</el-button>
          <el-button size="small" @click="insertCmd('### ','')">H3</el-button>
          <el-button size="small" @click="insertCmd('- ','')">列表</el-button>
          <el-button size="small" @click="insertCmd('> ','')">引用</el-button>
          <el-button size="small" @click="insertCmd('```\n','\n```')">代码</el-button>
          <el-button size="small" @click="insertCmd('**','**')">B</el-button>
          <el-button size="small" @click="insertCmd('*','*')">I</el-button>
          <el-button size="small" @click="insertCmd('~~','~~')">S</el-button>
          <el-button size="small" @click="insertFormula">公式</el-button>
          <el-button size="small" @click="nextNotebookSpread">新双页</el-button>
          <el-button size="small" @click="undoNote">撤销</el-button>
          <el-button size="small" @click="redoNote">重做</el-button>
          <span class="spacer"></span>
          <el-button size="small" @click="imagePicker?.click()">图片/截图</el-button>
          <el-button size="small" @click="toggleNotebookPen">手写</el-button>
          <el-button size="small" @click="citeBook">引用电子书</el-button>
          <el-button size="small" @click="citeConversation">引用对话</el-button>
          <el-button size="small" @click="createContentBlock">创建内容块</el-button>
          <el-button size="small" @click="referenceContentBlock">引用块</el-button>
          <el-button size="small" @click="saveSticky">复用便签</el-button>
          <el-button size="small" @click="openBacklinks">关联 {{ backlinks.length }}</el-button>
          <el-button size="small" @click="openVersions">历史</el-button>
          <el-button size="small" @click="openAttributes">属性</el-button>
          <el-button size="small" :type="paperMode ? 'primary' : 'default'" @click="paperMode=!paperMode">{{ paperMode ? '纸质笔记本' : '打开笔记本' }}</el-button>
          <el-button size="small" :type="useBlockEditor?'primary':'default'" @click="useBlockEditor=!useBlockEditor" title="兼容旧笔记">{{ useBlockEditor ? '纯文本' : '富文本' }}</el-button>
          <el-button size="small" @click="askAiAboutNote">AI 辅助</el-button>
          <el-button size="small" @click="makeCard">闪卡</el-button>
          <el-button size="small" @click="exportMd">导出</el-button>
          <el-button size="small" type="primary" @click="saveCurrent" :disabled="!dirty">保存</el-button>
        </div>
        <div class="split" v-if="!useBlockEditor && !paperMode">
          <div class="ta-wrap" @contextmenu.stop="onEditorCtx">
            <div class="gutter" ref="gutterRef">
              <div v-for="(_ln, i) in lineCount" :key="i" class="gutter-line" :class="{active: cursorLine === i+1}" @click="goToLine(i+1)" @contextmenu.prevent="onGutterCtx($event, i+1)">
                <span class="gutter-num">{{ i + 1 }}</span>
                <span class="gutter-handle" title="Block actions">&#x2630;</span>
              </div>
            </div>
            <textarea ref="ta" v-model="current.body" class="ta" spellcheck="false" @input="markDirty(); onInputCheck(); updateCursorLine()" @click="updateCursorLine" @keyup="updateCursorLine" @keydown.tab.prevent="onTab" @keydown.escape="slashVisible=false" @keydown.ctrl.z.prevent="doUndo" @keydown.ctrl.shift.z.prevent="doRedo" @keydown.ctrl.s.prevent="saveCurrent" placeholder="Markdown ... / slash commands"></textarea>
            <div v-if="slashVisible" class="slash-menu" :style="{ top: slashY+'px', left: slashX+'px' }">
              <div v-for="c in filteredSlash" :key="c.label" class="slash-item" @click="applySlash(c)">
                <span class="lbl">{{ c.label }}</span><span class="hint">{{ c.hint }}</span>
              </div>
              <div v-if="!filteredSlash.length" class="slash-item" style="opacity:.5;cursor:default"><span class="lbl">No match</span></div>
            </div>
          </div>
          <div class="preview markdown-body" v-html="html" @click="onPreviewClick"></div>
        </div>
        <OpenNotebookEditor v-else-if="!useBlockEditor" ref="notebookRef" v-model="current.body" @dirty="markDirty" @open-ai="openNotebookAi" />
        <BlockEditor v-else v-model="current.body" :show-toolbar="true" @update:model-value="markDirty" />
        <NotebookAiPanel v-model="notebookAi.open" :context="notebookAi.context" :context-label="notebookAi.label" :suggested-prompt="notebookAi.action" @insert="insertAiAnswer" @append="appendAiAnswer" />
        <el-dialog v-model="backlinksOpen" title="本笔记的关联与回链" width="520px">
          <div v-if="!backlinks.length" class="backlink-empty">还没有关联内容。引用电子书、对话或由本笔记创建闪卡后，它们会出现在这里。</div>
          <div v-for="link in backlinks" :key="link.id" class="backlink-row" @click="jumpRelated(link)">
            <span class="backlink-type">{{ relatedType(link) }}</span><span>{{ relatedHint(link) }}</span><span class="backlink-arrow">↗</span>
          </div>
        </el-dialog>
        <el-dialog v-model="versionsOpen" title="笔记历史与回滚" width="760px">
          <div class="version-layout">
            <div class="version-list"><button v-for="version in versions" :key="version.id" :class="{active: versionPreview?.id === version.id}" @click="previewVersion(version.id)"><strong>{{ version.reason || '自动快照' }}</strong><small>{{ version.created_at }}</small></button><p v-if="!versions.length">尚无历史版本。保存或自动保存后会出现快照。</p></div>
            <div class="version-preview"><template v-if="versionPreview"><h4>{{ versionPreview.title }}</h4><pre>{{ diffText }}</pre><el-button type="warning" @click="restoreVersion">回滚到此版本</el-button></template><p v-else>选择左侧快照可预览与当前版本的差异。</p></div>
          </div>
        </el-dialog>
        <el-dialog v-model="attributesOpen" title="笔记属性" width="520px" @closed="attributeRows=[]">
          <p class="attrs-hint">属性可用于之后的表格、看板和画廊视图。建议使用“状态、优先级、截止日期、主题”。</p>
          <div v-for="(row, index) in attributeRows" :key="index" class="attr-row"><el-input v-model="row.key" placeholder="属性名" /><el-input v-model="row.value" placeholder="属性值" /><el-button text type="danger" @click="attributeRows.splice(index, 1)">删除</el-button></div>
          <el-button size="small" @click="attributeRows.push({ key: '', value: '' })">+ 属性</el-button>
          <template #footer><el-button @click="attributesOpen=false">取消</el-button><el-button type="primary" @click="saveAttributes">保存属性</el-button></template>
        </el-dialog>
      </div>
    </main>
    <input ref="imagePicker" type="file" accept="image/*" hidden @change="onImagePicked" />
    <NotebookSketchDialog v-model="sketchOpen" @save="insertSketch" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { diffWordsWithSpace } from 'diff'
import { renderMarkdown } from '../helpers/markdown'
import { useContextMenu } from '../stores/context-menu'
import { useSettingsStore } from '../stores/chat'
import BlockEditor from '../components/BlockEditor.vue'
import NotebookSketchDialog from '../components/NotebookSketchDialog.vue'
import OpenNotebookEditor from '../components/OpenNotebookEditor.vue'
import NotebookAiPanel from '../components/NotebookAiPanel.vue'

const props = defineProps<{ jumpNoteId?: string | null; jumpBlockId?: string | null }>()

const menu = useContextMenu()
const settings = useSettingsStore()
const sideW = ref(260)
const current = ref<any>(null)
const currentId = ref<string | null>(null)
const dirty = ref(false)
const tagStr = ref('')
const ta = ref<HTMLTextAreaElement | null>(null)
const treeRef = ref<any>(null)
const rawTree = ref<any[]>([])
const defaultExpand = ref<string[]>([])
const slashVisible = ref(false)
const slashX = ref(0)
const slashY = ref(0)
type EditorState = { body: string; start: number; end: number }
const undoStack = ref<EditorState[]>([])
const redoStack = ref<EditorState[]>([])
const MAX_UNDO = 80
const gutterRef = ref<HTMLElement|null>(null)
const cursorLine = ref(1)
const lineCount = computed(() => (current.value?.body || '').split('\n').length)
const useBlockEditor = ref(false)
const paperMode = ref(true)
const paperIndex = ref(0)
const backlinks = ref<any[]>([])
const backlinksOpen = ref(false)
const versionsOpen = ref(false)
const versions = ref<any[]>([])
const versionPreview = ref<any>(null)
const attributesOpen = ref(false)
const attributeRows = ref<Array<{ key: string; value: string }>>([])
const imagePicker = ref<HTMLInputElement | null>(null)
const sketchOpen = ref(false)
const notebookRef = ref<{ insertHtml: (html: string) => void; insertImage: (dataUrl: string, alt?: string) => void; insertFormula: () => void; togglePen: () => void; undo: () => void; redo: () => void; nextSpread: () => void; getText: () => string; getSpread: () => number; goToSpread: (spread: number) => void } | null>(null)
const notebookAi = ref({ open: false, context: '', label: '当前双页', action: '' })
const PAGE_BREAK = '<!-- lk:page-break -->'
const notePages = computed(() => (current.value?.body || '').split(PAGE_BREAK))
let autosaveTimer: ReturnType<typeof setTimeout> | null = null
const html = computed(() => (current.value ? renderMarkdown(current.value.body) : ''))
const slashCmds = [
  { label: '# H1', hint: 'Heading 1', md: { pre: '# ', post: '' }, tags: ['h1','heading','title','biaoti'] },
  { label: '## H2', hint: 'Heading 2', md: { pre: '## ', post: '' }, tags: ['h2','heading','biaoti'] },
  { label: '### H3', hint: 'Heading 3', md: { pre: '### ', post: '' }, tags: ['h3','heading','biaoti'] },
  { label: '- List', hint: 'Bullet list', md: { pre: '- ', post: '' }, tags: ['list','ul','bullet','liebiao','xd'] },
  { label: '1. Ordered', hint: 'Numbered list', md: { pre: '1. ', post: '' }, tags: ['ol','ordered','number','youxu'] },
  { label: '- [ ] Todo', hint: 'Checkbox', md: { pre: '- [ ] ', post: '' }, tags: ['todo','task','check','dai'] },
  { label: '> Quote', hint: 'Blockquote', md: { pre: '> ', post: '' }, tags: ['quote','blockquote','yinyong'] },
  { label: '``` Code', hint: 'Code block', md: { pre: '```\n', post: '\n```' }, tags: ['code','block','daima'] },
  { label: '```python', hint: 'Python code', md: { pre: '```python\n', post: '\n```' }, tags: ['python','py'] },
  { label: '```js', hint: 'JavaScript code', md: { pre: '```javascript\n', post: '\n```' }, tags: ['js','javascript'] },
  { label: '```java', hint: 'Java code', md: { pre: '```java\n', post: '\n```' }, tags: ['java'] },
  { label: '```sql', hint: 'SQL code', md: { pre: '```sql\n', post: '\n```' }, tags: ['sql','database'] },
  { label: '**Bold**', hint: 'Bold text', md: { pre: '**', post: '**' }, tags: ['bold','strong','jiacu'] },
  { label: '*Italic*', hint: 'Italic text', md: { pre: '*', post: '*' }, tags: ['italic','em','xieti'] },
  { label: '~~Strike~~', hint: 'Strikethrough', md: { pre: '~~', post: '~~' }, tags: ['strike','del','shanchuxian'] },
  { label: '==Mark==', hint: 'Highlight mark', md: { pre: '==', post: '==' }, tags: ['mark','highlight','gaoliang'] },
  { label: '[Link]', hint: 'Hyperlink', md: { pre: '[', post: '](url)' }, tags: ['link','url','lianjie'] },
  { label: '![Image]', hint: 'Image embed', md: { pre: '![alt](', post: ')' }, tags: ['image','img','tupian','tp'] },
  { label: '| Table |', hint: 'Table', md: { pre: '| Col1 | Col2 |\n| --- | --- |\n| ', post: ' |  |' }, tags: ['table','grid','biaoge','bg'] },
  { label: '---', hint: 'Divider line', md: { pre: '\n---\n', post: '' }, tags: ['hr','divider','line','fengexian','fgx'] },
  { label: '> [!NOTE]', hint: 'Callout note', md: { pre: '> [!NOTE]\n> ', post: '' }, tags: ['callout','note','admonition','tishi'] },
  { label: '> [!WARNING]', hint: 'Callout warning', md: { pre: '> [!WARNING]\n> ', post: '' }, tags: ['callout','warning','jinggao','jg'] },
  { label: '> [!TIP]', hint: 'Callout tip', md: { pre: '> [!TIP]\n> ', post: '' }, tags: ['callout','tip','jiqiao','jq'] },
  { label: '$$ Math $$', hint: 'Math block', md: { pre: '$$\n', post: '\n$$' }, tags: ['math','latex','formula','gongshi','gs'] },
  { label: '$ inline $', hint: 'Inline math', md: { pre: '$', post: '$' }, tags: ['math','inline','latex','gongshi'] },
  { label: 'Flashcard', hint: 'Create SRS card from selection', md: { pre: '<!--card-->\nQ: ', post: '\nA: \n<!--/card-->' }, tags: ['flashcard','card','srs','shanka','sk','fuxi'] },
  { label: 'AI Ask', hint: 'Ask AI about this topic', md: { pre: '<!--ai-ask-->\n', post: '\n<!--/ai-ask-->' }, tags: ['ai','ask','wen','tiwen'] },
  { label: 'Mindmap ref', hint: 'Reference a mindmap', md: { pre: '<!--mindmap-ref-->\n', post: '\n<!--/mindmap-ref-->' }, tags: ['mindmap','xweinaotu','swnt'] },
]
const slashFilter = ref('')
const filteredSlash = computed(() => {
  const q = slashFilter.value.toLowerCase().trim()
  if (!q) return slashCmds.slice(0, 12)
  return slashCmds.filter(c => {
    if (c.label.toLowerCase().includes(q)) return true
    if (c.hint.toLowerCase().includes(q)) return true
    if (c.tags.some(t => t.includes(q))) return true
    return false
  }).slice(0, 12)
})
const treeData = computed(() => buildTree(rawTree.value))

function buildTree(rows: any[]) {
  const map = new Map<string, any>()
  rows.forEach((r) => map.set(r.id, { id: r.id, title: r.title, parent_id: r.parent_id, sort: r.sort, kind: r.kind || 'note', children: [] }))
  const roots: any[] = []
  rows.forEach((r) => { const node = map.get(r.id)!; if (r.parent_id && map.has(r.parent_id)) map.get(r.parent_id)!.children.push(node); else roots.push(node) })
  return roots
}

async function loadTree() {
  try { rawTree.value = await window.lk.notesList() }
  catch (e: any) { ElMessage.error('Failed to load notes: ' + (e?.message || e)); rawTree.value = [] }
}
function onClick(d: any) {
  if (!d || !d.id) return
  if (d.kind === 'folder') {
    // toggle expand in tree
    const node = treeRef.value?.getNode(d.id)
    if (node) node.expanded = !node.expanded
  } else {
    open(d.id)
  }
}
async function open(id: string) {
  try {
    if (dirty.value) await saveCurrent()
    const n = await window.lk.notesGet(id)
    if (n) {
      current.value = n; currentId.value = id; dirty.value = false; tagStr.value = (n.tags || '').trim(); await loadBacklinks()
      undoStack.value = []; redoStack.value = []
      if (props.jumpBlockId) nextTick(() => revealBlock(props.jumpBlockId!))
    } else {
      ElMessage.warning('Note not found')
    }
  } catch (e: any) {
    ElMessage.error('Failed to open: ' + (e?.message || e))
  }
}
async function newNote(parentId: string | null = null) {
  try {
    // if no parentId given, check if current selected node is a folder
    if (!parentId && currentId.value) {
      const cur = rawTree.value.find((r: any) => r.id === currentId.value)
      if (cur && cur.kind === 'folder') parentId = cur.id
    }
    const id = await window.lk.notesUpsert({ title: '未命名笔记', body: '', parent_id: parentId, sort: Date.now(), kind: 'note' })
    await loadTree(); await open(id)
  } catch (e: any) { ElMessage.error('Failed to create note: ' + (e?.message || e)) }
}
async function newFolder() {
  const v = await ElMessageBox.prompt('Folder name', 'New Folder', { inputValue: 'Folder' })
  if (!v.value) return
  await window.lk.notesUpsert({ title: v.value, body: '', kind: 'folder', parent_id: null, sort: Date.now() })
  await loadTree()
}
function markDirty() {
  dirty.value = true
  if (autosaveTimer) clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => { if (dirty.value) saveCurrentSilently() }, settings.noteAutosaveMs)
}
function saveCurrent() { return persistCurrent(false) }
function saveCurrentSilently() { return persistCurrent(true) }
async function persistCurrent(silent: boolean) {
  if (!current.value) return
  try {
    // sync textarea value explicitly in case v-model lag
    if (ta.value) current.value.body = ta.value.value
    await window.lk.notesPatch(current.value.id, { title: current.value.title, body: current.value.body, tags: tagStr.value })
    dirty.value = false; await loadTree(); if (!silent) ElMessage.success('已保存')
  } catch (e: any) { ElMessage.error('Failed to save: ' + (e?.message || e)) }
}
function updateTags() { markDirty() }
function startResize(e: MouseEvent) {
  const startX = e.clientX; const startW = sideW.value
  const move = (ev: MouseEvent) => { sideW.value = Math.max(200, Math.min(460, startW + ev.clientX - startX)) }
  const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
}
function pushUndo() {
  if (!current.value) return
  undoStack.value.push({ body: current.value.body, start: ta.value?.selectionStart ?? 0, end: ta.value?.selectionEnd ?? 0 })
  if (undoStack.value.length > MAX_UNDO) undoStack.value.shift()
  redoStack.value = []
}
function restoreEditorState(state: EditorState) {
  if (!current.value) return
  current.value.body = state.body; dirty.value = true
  nextTick(() => { if (ta.value) { ta.value.focus(); ta.value.selectionStart = state.start; ta.value.selectionEnd = state.end } })
}
function doUndo() {
  if (!undoStack.value.length || !current.value) return
  redoStack.value.push({ body: current.value.body, start: ta.value?.selectionStart ?? 0, end: ta.value?.selectionEnd ?? 0 })
  restoreEditorState(undoStack.value.pop()!)
}
function doRedo() {
  if (!redoStack.value.length || !current.value) return
  undoStack.value.push({ body: current.value.body, start: ta.value?.selectionStart ?? 0, end: ta.value?.selectionEnd ?? 0 })
  restoreEditorState(redoStack.value.pop()!)
}
function undoNote() { if (paperMode.value) notebookRef.value?.undo(); else doUndo() }
function redoNote() { if (paperMode.value) notebookRef.value?.redo(); else doRedo() }
async function loadBacklinks() {
  backlinks.value = current.value ? await window.lk.linkAllForEntity('note', current.value.id) : []
}
async function openBacklinks() { await loadBacklinks(); backlinksOpen.value = true }
function relatedEnd(link: any) {
  return link.source_type === 'note' && link.source_id === current.value?.id
    ? { type: link.target_type, id: link.target_id }
    : { type: link.source_type, id: link.source_id }
}
function relatedType(link: any) { return ({ note: '笔记', card: '闪卡', conversation: '对话', book: '电子书', message: '消息', highlight: '划线' } as Record<string, string>)[relatedEnd(link).type] || relatedEnd(link).type }
function relatedHint(link: any) { return link.link_type === 'derived_from' ? '由此笔记生成' : '引用关系' }
function jumpRelated(link: any) {
  const related = relatedEnd(link)
  if (related.type === 'note') window.dispatchEvent(new CustomEvent('lk:nav', { detail: { href: `app://note/${related.id}` } }))
  else if (related.type === 'conversation') window.dispatchEvent(new CustomEvent('lk:nav', { detail: { href: `app://conv/${related.id}` } }))
  else if (related.type === 'book') window.dispatchEvent(new CustomEvent('lk:nav', { detail: { href: `app://book/${related.id}` } }))
  else if (related.type === 'card') window.dispatchEvent(new CustomEvent('lk:nav', { detail: { href: 'app://review/cards' } }))
  else { ElMessage.info('该关联仍保留在本地，暂不支持直接跳转') ; return }
  backlinksOpen.value = false
}
function updateCursorLine() {
  const t = ta.value; if (!t) return
  const pos = t.selectionStart
  cursorLine.value = (current.value.body.slice(0, pos).split('\n').length)
}
function goToLine(n: number) {
  const t = ta.value; if (!t) return
  const lines = current.value.body.split('\n')
  let pos = 0
  for (let i = 0; i < n - 1 && i < lines.length; i++) pos += lines[i].length + 1
  t.focus(); t.selectionStart = t.selectionEnd = pos
  cursorLine.value = n
}
function onGutterCtx(e: MouseEvent, line: number) {
  const lines = current.value.body.split('\n')
  const lineText = lines[line - 1] || ''
  menu.open(e, [
    { label: '复制本行', icon: 'CopyDocument' as any, action: () => { pushUndo(); lines.splice(line, 0, lineText); current.value.body = lines.join('\n'); markDirty() } },
    { label: '删除本行', icon: 'Delete' as any, danger: true, action: () => { pushUndo(); lines.splice(line - 1, 1); current.value.body = lines.join('\n'); markDirty() } },
    { label: '上移一行', icon: 'ArrowUp' as any, action: () => { if (line > 1) { pushUndo(); const t2 = lines.splice(line - 1, 1)[0]; lines.splice(line - 2, 0, t2); current.value.body = lines.join('\n'); markDirty() } } },
    { label: '下移一行', icon: 'ArrowDown' as any, action: () => { if (line < lines.length) { pushUndo(); const t2 = lines.splice(line - 1, 1)[0]; lines.splice(line, 0, t2); current.value.body = lines.join('\n'); markDirty() } } },
    { separator: true },
    { label: '选中本行', icon: 'Select' as any, action: () => goToLine(line) },
    { label: '由本行生成闪卡', icon: 'Plus' as any, action: () => { window.lk.srsFromNote('', lineText.slice(0, 200), '', current.value.id).then(() => ElMessage.success('已创建闪卡')) } },
  ])
}
function insertCmd(pre: string, post: string) {
  if (paperMode.value) {
    const shortcuts: Record<string, string> = {
      '# ': '<h1>标题</h1>', '## ': '<h2>标题</h2>', '### ': '<h3>标题</h3>', '- ': '<ul><li>列表项目</li></ul>', '> ': '<blockquote>引用内容</blockquote>', '**': '<strong>加粗文字</strong>', '*': '<em>斜体文字</em>', '~~': '<s>删除线文字</s>', '```\n': '<pre><code>代码</code></pre>'
    }
    notebookRef.value?.insertHtml(shortcuts[pre] || `<span>${pre}${post}</span>`)
    return
  }
  pushUndo()
  const t = ta.value; if (!t) return
  const s = t.selectionStart; const e = t.selectionEnd; const sel = current.value.body.slice(s, e)
  current.value.body = current.value.body.slice(0, s) + pre + sel + post + current.value.body.slice(e)
  markDirty(); nextTick(() => { t.focus(); t.selectionStart = s + pre.length; t.selectionEnd = s + pre.length + sel.length })
}
function onTab(_e: KeyboardEvent) {
  pushUndo()
  const t = ta.value!; const s = t.selectionStart
  current.value.body = current.value.body.slice(0, s) + '  ' + current.value.body.slice(t.selectionEnd)
  markDirty(); nextTick(() => { t.selectionStart = t.selectionEnd = s + 2 })
}
function onInputCheck() {
  const t = ta.value; if (!t) return
  const pos = t.selectionStart
  const line = current.value.body.slice(0, pos).split('\n').pop() || ''
  const slashIdx = line.lastIndexOf('/')
  if (slashIdx >= 0 && (slashIdx === 0 || line[slashIdx - 1] === ' ' || line[slashIdx - 1] === '\n')) {
    slashFilter.value = line.slice(slashIdx + 1)
    const rect = t.getBoundingClientRect()
    slashX.value = Math.min(rect.width - 240, pos * 8 - 20)
    slashY.value = Math.max(12, Math.min(rect.height - 200, 60))
    slashVisible.value = true
  } else { slashVisible.value = false; slashFilter.value = '' }
}
function applySlash(cmd: typeof slashCmds[number]) {
  pushUndo()
  const t = ta.value!; if (!t) return
  const pos = t.selectionStart; const before = current.value.body.slice(0, pos); const after = current.value.body.slice(pos)
  const idx = before.lastIndexOf('/')
  if (idx >= 0) {
    current.value.body = before.slice(0, idx) + cmd.md.pre + after
    markDirty(); slashVisible.value = false; nextTick(() => { t.focus(); t.selectionStart = t.selectionEnd = idx + cmd.md.pre.length })
  }
}
async function onTreeCtx(e: any, data: any) {
  e.preventDefault?.()
  const items: any[] = []
  if (data.kind === 'folder') {
    items.push(
      { label: '在此新建笔记', icon: 'Document' as any, action: () => newNote(data.id) },
      { label: '新建子文件夹', icon: 'Folder' as any, action: () => newSubFolder(data.id) },
      { separator: true },
      { label: '重命名', icon: 'Edit' as any, action: () => renameNode(data) },
    )
  } else {
    items.push(
      { label: '打开', icon: 'Document' as any, action: () => open(data.id) },
      { label: '重命名', icon: 'Edit' as any, action: () => renameNode(data) },
      { separator: true },
      { label: '生成闪卡', icon: 'Plus' as any, action: () => makeCardFromNode(data) },
      { label: '导出', icon: 'Download' as any, action: () => exportNode(data) },
    )
  }
  items.push(
    { separator: true },
    { label: '删除', icon: 'Delete' as any, danger: true, action: () => delNode(data) },
  )
  menu.open(e, items)
}
async function newSubFolder(parentId: string) {
  const v = await ElMessageBox.prompt('Subfolder name', 'New Subfolder', { inputValue: 'Subfolder' })
  if (!v.value) return
  await window.lk.notesUpsert({ title: v.value, body: '', kind: 'folder', parent_id: parentId, sort: Date.now() })
  await loadTree()
}
async function renameNode(data: any) {
  const v = await ElMessageBox.prompt('New name', 'Rename', { inputValue: data.title })
  if (!v.value) return; await window.lk.notesPatch(data.id, { title: v.value }); loadTree()
}
async function delNode(data: any) {
  await ElMessageBox.confirm('Confirm delete?', 'Delete', { type: 'warning' })
  await window.lk.notesDelete(data.id); if (currentId.value === data.id) { current.value = null; currentId.value = null }; loadTree()
}
async function makeCardFromNode(data: any) {
  const n = await window.lk.notesGet(data.id)
  const decks = await window.lk.deckList(); let dId = decks[0]?.id
  if (!dId) { await window.lk.deckUpsert({ id: await window.lk.uuid(), title: 'Default', sort: 0 }); dId = (await window.lk.deckList())[0]?.id }
  await window.lk.srsFromNote(dId, (n.title || '').slice(0, 200), (n.body || '').slice(0, 600), n.id)
  ElMessage.success('card created')
}
async function exportNode(data: any) { await window.lk.notesExport(data.id) }
function onEditorCtx(e: MouseEvent) {
  if (!current.value) return; e.preventDefault()
  const sel = window.getSelection()?.toString().trim() || ''
  const aiChildren = buildAiMenuItems(sel || current.value.body.slice(0, 500))
  menu.open(e, [
    { label: '保存', icon: 'Check' as any, shortcut: 'Ctrl+S', action: () => { markDirty(); saveCurrent() } },
    { separator: true },
    { label: 'H1', shortcut: '#', action: () => insertCmd('# ', '') },
    { label: 'H2', shortcut: '##', action: () => insertCmd('## ', '') },
    { label: '代码块', action: () => insertCmd('```\n', '\n```') },
    { label: '列表', action: () => insertCmd('- ', '') },
    { separator: true },
    { label: 'AI', icon: 'ChatDotRound' as any, children: aiChildren },
    { separator: true },
    { label: '生成闪卡', icon: 'Plus' as any, action: makeCard },
    { label: '导出', icon: 'Download' as any, action: exportMd },
  ])
}

function buildAiMenuItems(text: string) {
  const builtIn = [
    { label: '续写', action: () => aiAction(text, 'Continue writing from where this text left off. Match the style and tone.') },
    { label: '总结要点', action: () => aiAction(text, 'Summarize the key points in 3-5 bullet points.') },
    { label: '头脑风暴', action: () => aiAction(text, 'Based on this content, brainstorm 5 related ideas or questions for further exploration.') },
    { label: '润色语法', action: () => aiAction(text, 'Fix any grammar, spelling, or style issues. Return the corrected text only.') },
    { label: '通俗解释', action: () => aiAction(text, 'Explain this in simple terms as if teaching a beginner.') },
    { label: '生成闪卡', action: () => aiAction(text, 'Generate 3-5 flashcard Q&A pairs from this content. Format: Q: ...\nA: ...') },
  ]
  // custom actions from localStorage
  let customs: {name:string;prompt:string}[] = []
  try { customs = JSON.parse(localStorage.getItem('lk_ai_actions') || '[]') } catch {}
  const customItems = customs.map(c => ({ label: c.name, action: () => aiAction(text, c.prompt) }))
  return [
    ...builtIn,
    ...(customItems.length ? [{ separator: true } as any, ...customItems] : []),
    { separator: true },
    { label: '管理自定义 AI 操作…', action: manageAiActions },
  ]
}

function aiAction(text: string, prompt: string) {
  if (paperMode.value) { openNotebookAi({ context: text, label: '当前笔记', action: prompt }); return }
  // 旧文本模式保留原有全局对话行为
  window.dispatchEvent(new CustomEvent('lk:ai-action', { detail: { text, prompt } }))
}

function manageAiActions() {
  let customs: {name:string;prompt:string}[] = []
  try { customs = JSON.parse(localStorage.getItem('lk_ai_actions') || '[]') } catch {}
  const input = prompt('Custom AI actions (JSON array):\n[{"name":"...","prompt":"..."}]\n\nCurrent:\n' + JSON.stringify(customs, null, 2))
  if (input === null) return
  try {
    const parsed = JSON.parse(input)
    if (Array.isArray(parsed)) { localStorage.setItem('lk_ai_actions', JSON.stringify(parsed)); ElMessage.success('Custom actions saved') }
    else ElMessage.warning('Must be a JSON array')
  } catch { ElMessage.warning('Invalid JSON') }
}
function allowDrop(_draggingNode: any, dropNode: any, type: string) {
  // notes can only be dropped INTO folders (inner)
  // folders can be dropped into other folders (inner) or beside nodes (before/after)
  if (type === 'inner') {
    return dropNode.data?.kind === 'folder'
  }
  // before/after: allow if dropping beside a note at root level or inside a folder
  return true
}
async function onDrop(draggingNode: any, dropNode: any, dropType: string) {
  // draggingNode.data = the node being dragged
  // dropNode.data = the node being dropped onto
  // dropType = 'before' | 'after' | 'inner'
  const dragId = draggingNode.data?.id
  if (!dragId) return

  let newParentId: string | null = null
  if (dropType === 'inner') {
    // dropped inside a folder → parent = dropNode
    newParentId = dropNode.data?.id || null
  } else {
    // dropped before/after a sibling → same parent as dropNode
    newParentId = dropNode.data?.parent_id || null
  }

  // update parent_id in database
  await window.lk.notesPatch(dragId, { parent_id: newParentId } as any)
  await loadTree()
}
async function makeCard() {
  if (!current.value) return
  const dks = await window.lk.deckList(); let dId = dks[0]?.id
  if (!dId) { await window.lk.deckUpsert({ id: await window.lk.uuid(), title: 'Default', sort: 0 }); dId = (await window.lk.deckList())[0]?.id }
  const sourceText = selectedBlockText().slice(0, 1800)
  const blockId = await window.lk.blockUpsert({ sourceType: 'note', sourceId: current.value.id, blockType: 'flashcard_source', text: sourceText, ...blockAnchor(sourceText) })
  await window.lk.srsFromSource(dId, current.value.title.slice(0, 200), sourceText.slice(0, 600), 'block', blockId)
  await loadBacklinks(); ElMessage.success('已创建并绑定来源内容块的闪卡')
}
function askAiAboutNote() {
  if (!current.value) return
  const selected = ta.value?.value.slice(ta.value.selectionStart, ta.value.selectionEnd).trim()
  const text = selected || (paperMode.value ? notebookRef.value?.getText() : current.value.body.trim()) || ''
  openNotebookAi({ context: text, label: selected ? '已选文字' : '当前双页', action: '请根据这段笔记整理要点、发现薄弱点，并给出下一步学习建议。' })
}
function openNotebookAi(payload: { context: string; label: string; action?: string }) {
  notebookAi.value = { open: true, context: payload.context, label: payload.label, action: payload.action || '' }
}
function insertAiAnswer(text: string) { notebookRef.value?.insertHtml(renderMarkdown(text)) }
function appendAiAnswer(text: string) { notebookRef.value?.insertHtml(`<hr>${renderMarkdown(text)}`) }
function insertFormula() { if (paperMode.value) notebookRef.value?.insertFormula(); else insertCmd('$', '$') }
function nextNotebookSpread() { if (paperMode.value) notebookRef.value?.nextSpread(); else insertPage() }
function toggleNotebookPen() { if (paperMode.value) notebookRef.value?.togglePen(); else sketchOpen.value = true }
function insertPage() {
  insertCmd(`\n\n${PAGE_BREAK}\n\n`, '')
  paperIndex.value = notePages.value.length - 1
}
function insertPlain(text: string) {
  if (!current.value) return
  if (paperMode.value) { notebookRef.value?.insertHtml(renderMarkdown(text)); return }
  pushUndo()
  const t = ta.value
  const pos = t?.selectionStart ?? current.value.body.length
  current.value.body = current.value.body.slice(0, pos) + text + current.value.body.slice(pos)
  markDirty()
  nextTick(() => { if (t) { t.focus(); t.selectionStart = t.selectionEnd = pos + text.length } })
}
function selectedBlockText() {
  const selected = ta.value?.value.slice(ta.value.selectionStart, ta.value.selectionEnd).trim()
  return selected || (paperMode.value ? notebookRef.value?.getText() : current.value?.body || '').trim()
}
function blockAnchor(text: string) {
  if (paperMode.value) {
    const spread = notebookRef.value?.getSpread() || 0
    return { anchor: JSON.stringify({ kind: 'notebook-spread', spread, quote: text.slice(0, 240) }), anchorKey: `notebook:${current.value?.id || ''}:${spread}:${text.slice(0, 80)}` }
  }
  const start = ta.value?.selectionStart ?? 0
  const end = ta.value?.selectionEnd ?? start + text.length
  return { anchor: JSON.stringify({ kind: 'text-selection', start, end, quote: text.slice(0, 240) }), anchorKey: `text:${current.value?.id || ''}:${start}:${end}:${text.slice(0, 80)}` }
}
async function createContentBlock() {
  if (!current.value) return
  const text = selectedBlockText()
  if (!text) { ElMessage.warning('请先写入或选中需要引用的内容'); return }
  const id = await window.lk.blockUpsert({ sourceType: 'note', sourceId: current.value.id, blockType: 'note_text', text: text.slice(0, 6000), ...blockAnchor(text) })
  await window.lk.linkRelate('note', current.value.id, 'block', id, 'contains')
  await loadBacklinks()
  ElMessage.success('已创建内容块，可被搜索、引用和绑定闪卡')
}
async function referenceContentBlock() {
  if (!current.value) return
  const blocks = await window.lk.blockList()
  if (!blocks.length) { ElMessage.warning('还没有内容块；先在任一笔记中创建内容块'); return }
  const choices = blocks.slice(0, 30).map((block: any, index: number) => `${index + 1}. ${String(block.text).replace(/\s+/g, ' ').slice(0, 70)}`).join('\n')
  const result = await ElMessageBox.prompt(`选择要引用的内容块：\n${choices}`, '引用内容块', { inputValue: '1' })
  const block = blocks[Number(result.value) - 1]
  if (!block) { ElMessage.warning('请输入有效编号'); return }
  insertPlain(`\n\n> ↗ [内容块：${String(block.text).replace(/\s+/g, ' ').slice(0, 80)}](app://block/${block.id})\n\n`)
  await window.lk.linkRelate('note', current.value.id, 'block', block.id, 'references')
  await loadBacklinks()
}
async function openVersions() {
  if (!current.value) return
  versions.value = await window.lk.noteVersions(current.value.id)
  versionPreview.value = null; versionsOpen.value = true
}
async function previewVersion(id: string) { versionPreview.value = await window.lk.noteVersionGet(id) }
const diffText = computed(() => {
  if (!versionPreview.value || !current.value) return ''
  const before = String(versionPreview.value.body || '')
  const after = String(current.value.body || '')
  const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' })
  return diffWordsWithSpace(before, after, { intlSegmenter: segmenter }).map((part) => {
    const prefix = part.added ? '＋ ' : part.removed ? '− ' : '  '
    return part.value.split('\n').map((line) => prefix + line).join('\n')
  }).join('').slice(0, 14000)
})
async function restoreVersion() {
  if (!versionPreview.value || !current.value) return
  await ElMessageBox.confirm('当前内容会自动存为一个回滚前快照，确定恢复吗？', '回滚笔记', { type: 'warning' })
  await window.lk.noteVersionRestore(versionPreview.value.id)
  await open(current.value.id); versionsOpen.value = false
  ElMessage.success('已回滚，回滚前内容已保留在历史中')
}
async function openAttributes() {
  if (!current.value) return
  const attrs = await window.lk.attrsGet('note', current.value.id)
  attributeRows.value = attrs.map((attr: any) => ({ key: String(attr.attr_key), value: String(attr.attr_value || '') }))
  if (!attributeRows.value.length) attributeRows.value = [{ key: '状态', value: '进行中' }, { key: '优先级', value: '普通' }]
  attributesOpen.value = true
}
async function saveAttributes() {
  if (!current.value) return
  const attrs = Object.fromEntries(attributeRows.value.filter((row) => row.key.trim() && row.value.trim()).map((row) => [row.key, row.value]))
  await window.lk.attrsSet('note', current.value.id, attrs)
  attributesOpen.value = false; ElMessage.success('属性已保存')
}
async function onImagePicked(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file) })
  if (paperMode.value) notebookRef.value?.insertImage(data, file.name.replace(/[\[\]]/g, ''))
  else insertPlain(`\n\n![${file.name.replace(/[\[\]]/g, '')}](${data})\n\n`)
  ;(e.target as HTMLInputElement).value = ''
}
function insertSketch(data: string) { if (paperMode.value) notebookRef.value?.insertImage(data, '手写便签'); else insertPlain(`\n\n![手写便签](${data})\n\n`) }
async function citeBook() {
  if (!current.value) return
  const books = await window.lk.bookList()
  if (!books.length) { ElMessage.warning('请先在图书馆导入电子书'); return }
  const list = books.map((b: any, i: number) => `${i + 1}. ${b.title}`).join('\n')
  const choice = await ElMessageBox.prompt(`选择电子书：\n${list}`, '引用电子书', { inputPlaceholder: '输入编号', inputValue: '1' })
  const book = books[Number(choice.value) - 1]
  if (!book) { ElMessage.warning('请输入有效编号'); return }
  const highlights = await window.lk.highlightList(book.id)
  const hint = highlights.slice(0, 12).map((h: any, i: number) => `${i + 1}. 第 ${h.page || 1} 页 · ${h.text.slice(0, 42)}`).join('\n') || '暂无划线；可直接写一段引用文字。'
  const quoteResult = await ElMessageBox.prompt(`可选划线：\n${hint}\n\n输入编号，或直接输入引用文字：`, '添加电子书引用', { inputValue: highlights.length ? '1' : '' })
  const selected = highlights[Number(quoteResult.value) - 1]
  const quote = selected?.text || quoteResult.value || '电子书引用'
  const page = selected?.page || book.last_page || 1
  let href = `app://book/${book.id}?page=${page}`
  if (selected?.id) {
    await window.lk.linkRelate('note', current.value.id, 'highlight', selected.id, 'references')
    const blocks = await window.lk.blockForSource('highlight', selected.id)
    if (blocks[0]) { href = `app://block/${blocks[0].id}`; await window.lk.linkRelate('note', current.value.id, 'block', blocks[0].id, 'references') }
  }
  insertPlain(`\n\n> 📖 [${book.title} · 第 ${page} 页](${href})\n>\n> ${quote.replace(/\n/g, '\n> ')}\n\n`)
}
async function citeConversation() {
  if (!current.value) return
  const convs = await window.lk.convAll()
  if (!convs.length) { ElMessage.warning('暂无可引用的对话'); return }
  const list = convs.slice(0, 20).map((c: any, i: number) => `${i + 1}. ${c.title}`).join('\n')
  const chosen = await ElMessageBox.prompt(`选择对话：\n${list}`, '引用 AI 对话', { inputValue: '1' })
  const conv = convs[Number(chosen.value) - 1]
  if (!conv) { ElMessage.warning('请输入有效编号'); return }
  const messages = await window.lk.msgList(conv.id)
  const answer = [...messages].reverse().find((m: any) => m.role === 'assistant') || messages[messages.length - 1]
  if (!answer) { ElMessage.warning('该对话还没有内容'); return }
  const text = String(answer.content || '').slice(0, 1200)
  insertPlain(`\n\n> 💬 [${conv.title}](app://conv/${conv.id})\n>\n> ${text.replace(/\n/g, '\n> ')}\n\n`)
  await window.lk.linkRelate('note', current.value.id, 'message', answer.id, 'references')
}
async function saveSticky() {
  if (!current.value) return
  const selected = ta.value?.value.slice(ta.value.selectionStart, ta.value.selectionEnd).trim() || (paperMode.value ? notebookRef.value?.getText() : current.value.body.slice(0, 800)) || ''
  const result = await ElMessageBox.prompt('便签标题', '保存为可复用便签', { inputValue: current.value.title ? `${current.value.title} · 便签` : '新便签' })
  const id = await window.lk.notesUpsert({ title: result.value || '新便签', body: selected, kind: 'sticky', sort: Date.now() })
  await loadTree()
  insertPlain(`\n\n📌 [${result.value || '新便签'}](app://note/${id})\n\n`)
  ElMessage.success('便签已保存，可在左侧 📌 中反复打开和跳转')
}
function onPreviewClick(e: MouseEvent) {
  const anchor = (e.target as HTMLElement).closest('a')
  const href = anchor?.getAttribute('href') || ''
  if (href.startsWith('app://')) { e.preventDefault(); window.dispatchEvent(new CustomEvent('lk:nav', { detail: { href } })) }
}
async function exportMd() { if (current.value) { await window.lk.notesExport(current.value.id); ElMessage.success('exported') } }
onMounted(async () => {
  window.addEventListener('beforeunload', saveCurrent)
  await loadTree()
  if (!rawTree.value.length) {
    await newNote(null)
  } else {
    // find first NOTE (not folder) to open
    const firstNote = rawTree.value.find((r: any) => r.kind !== 'folder')
    if (firstNote) await open(firstNote.id)
    else await newNote(null)
  }
  // restore expanded state from settings
  const saved = await window.lk.getSetting('notesExpanded')
  if (saved) defaultExpand.value = JSON.parse(saved)
})

watch(() => props.jumpNoteId, (id) => {
  if (id && id !== currentId.value) open(id)
}, { immediate: true })
async function revealBlock(id: string) {
  const block = await window.lk.blockGet(id)
  if (!block || block.source_type !== 'note' || block.source_id !== currentId.value) return
  let anchor: { kind?: string; start?: number; end?: number; spread?: number } = {}
  try { anchor = JSON.parse(block.anchor || '{}') } catch { /* legacy content blocks have no structured anchor */ }
  if (anchor.kind === 'notebook-spread') {
    paperMode.value = true
    nextTick(() => notebookRef.value?.goToSpread(anchor.spread || 0))
    ElMessage.info(block.stale ? '已打开引用所在纸页；原笔记改动后，请核对内容。' : '已打开引用所在纸页')
    return
  }
  if (anchor.kind === 'text-selection') {
    paperMode.value = false
    nextTick(() => {
      const start = Math.max(0, anchor.start || 0); const end = Math.max(start, anchor.end || start)
      if (ta.value) {
        ta.value.focus(); ta.value.selectionStart = start; ta.value.selectionEnd = end
        ta.value.scrollTop = Math.max(0, (current.value?.body.slice(0, start).split('\n').length - 3) * 22)
      }
    })
    ElMessage.info(block.stale ? '已定位原选区；内容可能已变更，请核对。' : '已定位到引用选区')
  }
}
watch(() => props.jumpBlockId, (id) => { if (id) nextTick(() => revealBlock(id)) }, { immediate: true })
watch(notePages, (pages) => { if (paperIndex.value >= pages.length) paperIndex.value = Math.max(0, pages.length - 1) })
onBeforeUnmount(async () => {
  if (autosaveTimer) clearTimeout(autosaveTimer)
  window.removeEventListener('beforeunload', saveCurrent)
  if (dirty.value && current.value) await saveCurrent()
})

function onExpand() {
  setTimeout(() => saveExpandState(), 100)
}
function onCollapse() {
  setTimeout(() => saveExpandState(), 100)
}
function saveExpandState() {
  const keys = treeRef.value?.store?.nodesMap
    ? Array.from(treeRef.value.store.nodesMap.values() as any)
        .filter((n: any) => n.expanded)
        .map((n: any) => n.data.id)
    : []
  defaultExpand.value = keys
  window.lk.setSetting('notesExpanded', JSON.stringify(keys))
}
function expandAll() {
  const allIds = getAllIds(rawTree.value)
  defaultExpand.value = allIds
  for (const id of allIds) treeRef.value?.store?.setExpanded?.(id, true)
  saveExpandState()
}
function collapseAll() {
  for (const id of getAllIds(rawTree.value)) treeRef.value?.store?.setExpanded?.(id, false)
  defaultExpand.value = []
  saveExpandState()
}
function getAllIds(nodes: any[]): string[] {
  const ids: string[] = []
  for (const n of nodes) {
    ids.push(n.id)
    if (n.children) ids.push(...getAllIds(n.children))
  }
  return ids
}
</script>

<style scoped lang="scss">
.notes-root { display: flex; flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
.side { background: var(--bg-soft); border-right: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; overflow: hidden; }
.head { padding: 8px; display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.tree-scroll { flex: 1; overflow: auto; padding: 8px; }
.resizer { width: 4px; cursor: col-resize; background: var(--border); flex-shrink: 0; &:hover { background: var(--accent); } }
.main { flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
.empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-dim); }
.editor-wrap { position:relative; flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.toolbar { display: flex; gap: 4px; align-items: center; padding: 6px 10px; border-bottom: 1px solid var(--border); background: var(--bg-soft); flex-wrap: wrap; flex-shrink: 0; }
.title-in { width: 180px; flex-shrink: 0; } .tag-in { width: 150px; flex-shrink: 0; }
.backlink-empty { color:var(--text-dim); padding:18px 4px; font-size:13px; }.backlink-row { display:flex; align-items:center; gap:9px; padding:10px 4px; border-bottom:1px solid var(--border); cursor:pointer; font-size:13px; }.backlink-row:hover { color:var(--accent-text); background:var(--bg-hover); }.backlink-type { border-radius:10px; padding:2px 7px; background:var(--accent-dim); color:var(--accent-text); font-size:11px; }.backlink-arrow { margin-left:auto; color:var(--text-dim); }
.version-layout { display:grid; grid-template-columns:220px minmax(0,1fr); min-height:360px; border:1px solid var(--border); }.version-list { overflow:auto; border-right:1px solid var(--border); }.version-list button { display:grid; gap:4px; width:100%; padding:10px; text-align:left; color:var(--text); background:transparent; border:0; border-bottom:1px solid var(--border); cursor:pointer; }.version-list button.active,.version-list button:hover { background:var(--accent-dim); }.version-list small,.attrs-hint { color:var(--text-dim); font-size:11px; }.version-list p,.version-preview>p { padding:14px; color:var(--text-dim); font-size:12px; }.version-preview { min-width:0; padding:14px; overflow:auto; }.version-preview h4 { margin:0 0 10px; }.version-preview pre { min-height:230px; max-height:370px; overflow:auto; white-space:pre-wrap; color:var(--text-secondary); background:var(--bg-soft); padding:10px; border-radius:7px; font-size:12px; }.attr-row { display:grid; grid-template-columns:1fr 1fr auto; gap:8px; margin:8px 0; }
.sep { width: 1px; height: 18px; background: var(--border); margin: 0 4px; flex-shrink: 0; } .spacer { flex: 1; }
.split { flex: 1; display: flex; min-height: 0; overflow: hidden; }
.paper-stage { flex:1; min-height:0; overflow:auto; display:flex; flex-direction:column; align-items:center; padding:28px; background:linear-gradient(135deg, #d7d0be, #eee8da 48%, #cfc4ae); }
.paper-page { position:relative; width:min(760px, 100%); min-height:calc(100% - 60px); box-sizing:border-box; padding:58px 70px; color:#3f392e; background:repeating-linear-gradient(to bottom, transparent 0, transparent 31px, rgba(113,143,166,.16) 32px), linear-gradient(90deg, transparent 0, transparent 58px, rgba(202,105,105,.26) 59px, transparent 60px), #fffdf5; border:1px solid #d6c9ad; box-shadow:0 18px 38px rgba(58,48,30,.24), inset 0 0 42px rgba(133,101,56,.07); border-radius:3px; }
.paper-title { font-family:Georgia, 'Microsoft YaHei', serif; font-size:24px; font-weight:700; margin-bottom:24px; padding-bottom:10px; border-bottom:1px solid rgba(117,93,57,.26); }.paper-index { position:absolute; right:28px; bottom:20px; color:#8a806c; font-size:12px; }.paper-controls { display:flex; gap:10px; padding-top:14px; }
.ta-wrap { flex: 1; position: relative; min-width: 0; overflow: hidden; display: flex; }
.gutter { width: 44px; flex-shrink: 0; background: var(--bg-soft); border-right: 1px solid var(--border); overflow: hidden; user-select: none; padding-top: 16px; }
.gutter-line { height: 22.4px; display: flex; align-items: center; justify-content: flex-end; padding-right: 6px; position: relative; cursor: pointer; transition: background .1s; &:hover { background: var(--bg-hover); } &.active { background: var(--bg-selected); } }
.gutter-num { font-size: 11px; color: var(--text-dim); font-family: var(--font-mono, monospace); min-width: 20px; text-align: right; }
.gutter-handle { position: absolute; left: 2px; font-size: 10px; color: var(--text-dim); opacity: 0; cursor: grab; transition: opacity .1s; }
.gutter-line:hover .gutter-handle { opacity: 1; }
.ta { flex: 1; width: 0; height: 100%; background: var(--bg); border: none; outline: none; color: var(--text); font-family: 'JetBrains Mono', Consolas, 'Microsoft YaHei', monospace; font-size: 14px; line-height: 1.6; resize: none; padding: 16px 20px; border-right: 1px solid var(--border); box-sizing: border-box; }
.preview { flex: 1; min-width: 0; padding: 16px 20px; overflow: auto; background: var(--bg); box-sizing: border-box; word-wrap: break-word; overflow-wrap: break-word; }
.preview :deep(a), .paper-page :deep(a) { color:var(--accent); cursor:pointer; text-decoration:underline; }.paper-page :deep(img) { max-width:100%; border-radius:6px; border:1px solid #d8cbb1; }
.slash-menu { position: absolute; z-index: 20; background: var(--bg-elev); border: 1px solid var(--border); border-radius: 6px; box-shadow: var(--shadow); min-width: 200px; padding: 4px 0; }
.slash-item { display: flex; justify-content: space-between; padding: 5px 14px; font-size: 13px; cursor: pointer; color: var(--text); }
.slash-item:hover { background: var(--accent); color: #fff; }
.slash-item .hint { color: var(--text-dim); font-size: 12px; }
.slash-item:hover .hint { color: rgba(255,255,255,0.7); }
.active { color: var(--accent); font-weight: 600; }
:deep(.el-tree) { background: transparent; color: var(--text); }
</style>
