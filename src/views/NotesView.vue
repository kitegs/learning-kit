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
          @node-drop="onDrop"
        >
          <template #default="{ data }">
            <span :class="{ active: currentId === data.id, 'is-folder': data.kind === 'folder' }">
              <span v-if="data.kind === 'folder'" style="margin-right:4px">📁</span>
              <span v-else style="margin-right:4px">📄</span>
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
          <span class="spacer"></span>
          <el-button size="small" :type="useBlockEditor?'primary':'default'" @click="useBlockEditor=!useBlockEditor" title="Toggle block editor">{{ useBlockEditor ? 'MD' : 'Block' }}</el-button>
          <el-button size="small" @click="makeCard">Card</el-button>
          <el-button size="small" @click="exportMd">导出</el-button>
          <el-button size="small" type="primary" @click="saveCurrent" :disabled="!dirty">保存</el-button>
        </div>
        <div class="split" v-if="!useBlockEditor">
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
          <div class="preview markdown-body" v-html="html"></div>
        </div>
        <BlockEditor v-else v-model="current.body" :show-toolbar="true" />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { renderMarkdown } from '../helpers/markdown'
import { useContextMenu } from '../stores/context-menu'
import BlockEditor from '../components/BlockEditor.vue'

const menu = useContextMenu()
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
const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
const MAX_UNDO = 80
const gutterRef = ref<HTMLElement|null>(null)
const cursorLine = ref(1)
const lineCount = computed(() => (current.value?.body || '').split('\n').length)
const useBlockEditor = ref(false)
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
      current.value = n; currentId.value = id; dirty.value = false; tagStr.value = (n.tags || '').trim()
      undoStack.value = []; redoStack.value = []
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
    const id = await window.lk.notesUpsert({ title: 'New note', body: '', parent_id: parentId, sort: Date.now(), kind: 'note' })
    await loadTree(); await open(id)
  } catch (e: any) { ElMessage.error('Failed to create note: ' + (e?.message || e)) }
}
async function newFolder() {
  const v = await ElMessageBox.prompt('Folder name', 'New Folder', { inputValue: 'Folder' })
  if (!v.value) return
  await window.lk.notesUpsert({ title: v.value, body: '', kind: 'folder', parent_id: null, sort: Date.now() })
  await loadTree()
}
function markDirty() { dirty.value = true }
async function saveCurrent() {
  if (!current.value) return
  try {
    await window.lk.notesPatch(current.value.id, { title: current.value.title, body: current.value.body, tags: tagStr.value })
    dirty.value = false; await loadTree(); ElMessage.success('saved')
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
  undoStack.value.push(current.value.body)
  if (undoStack.value.length > MAX_UNDO) undoStack.value.shift()
  redoStack.value = []
}
function doUndo() {
  if (!undoStack.value.length || !current.value) return
  redoStack.value.push(current.value.body)
  current.value.body = undoStack.value.pop()!
  dirty.value = true
}
function doRedo() {
  if (!redoStack.value.length || !current.value) return
  undoStack.value.push(current.value.body)
  current.value.body = redoStack.value.pop()!
  dirty.value = true
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
    { label: 'Duplicate line', icon: 'CopyDocument' as any, action: () => { pushUndo(); lines.splice(line, 0, lineText); current.value.body = lines.join('\n'); markDirty() } },
    { label: 'Delete line', icon: 'Delete' as any, danger: true, action: () => { pushUndo(); lines.splice(line - 1, 1); current.value.body = lines.join('\n'); markDirty() } },
    { label: 'Move up', icon: 'ArrowUp' as any, action: () => { if (line > 1) { pushUndo(); const t2 = lines.splice(line - 1, 1)[0]; lines.splice(line - 2, 0, t2); current.value.body = lines.join('\n'); markDirty() } } },
    { label: 'Move down', icon: 'ArrowDown' as any, action: () => { if (line < lines.length) { pushUndo(); const t2 = lines.splice(line - 1, 1)[0]; lines.splice(line, 0, t2); current.value.body = lines.join('\n'); markDirty() } } },
    { separator: true },
    { label: 'Select line', icon: 'Select' as any, action: () => goToLine(line) },
    { label: 'Make card from line', icon: 'Plus' as any, action: () => { window.lk.srsFromNote('', lineText.slice(0, 200), '', current.value.id).then(() => ElMessage.success('card created')) } },
  ])
}
function insertCmd(pre: string, post: string) {
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
      { label: 'New note here', icon: 'Document' as any, action: () => newNote(data.id) },
      { label: 'New subfolder', icon: 'Folder' as any, action: () => newSubFolder(data.id) },
      { separator: true },
      { label: 'Rename', icon: 'Edit' as any, action: () => renameNode(data) },
    )
  } else {
    items.push(
      { label: 'Open', icon: 'Document' as any, action: () => open(data.id) },
      { label: 'Rename', icon: 'Edit' as any, action: () => renameNode(data) },
      { separator: true },
      { label: 'Make card', icon: 'Plus' as any, action: () => makeCardFromNode(data) },
      { label: 'Export', icon: 'Download' as any, action: () => exportNode(data) },
    )
  }
  items.push(
    { separator: true },
    { label: 'Delete', icon: 'Delete' as any, danger: true, action: () => delNode(data) },
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
    { label: 'Save', icon: 'Check' as any, shortcut: 'Ctrl+S', action: () => { markDirty(); saveCurrent() } },
    { separator: true },
    { label: 'H1', shortcut: '#', action: () => insertCmd('# ', '') },
    { label: 'H2', shortcut: '##', action: () => insertCmd('## ', '') },
    { label: 'Code block', action: () => insertCmd('```\n', '\n```') },
    { label: 'List', action: () => insertCmd('- ', '') },
    { separator: true },
    { label: 'AI', icon: 'ChatDotRound' as any, children: aiChildren },
    { separator: true },
    { label: 'Make card', icon: 'Plus' as any, action: makeCard },
    { label: 'Export', icon: 'Download' as any, action: exportMd },
  ])
}

function buildAiMenuItems(text: string) {
  const builtIn = [
    { label: 'Continue writing', action: () => aiAction(text, 'Continue writing from where this text left off. Match the style and tone.') },
    { label: 'Summarize', action: () => aiAction(text, 'Summarize the key points in 3-5 bullet points.') },
    { label: 'Brainstorm', action: () => aiAction(text, 'Based on this content, brainstorm 5 related ideas or questions for further exploration.') },
    { label: 'Fix grammar', action: () => aiAction(text, 'Fix any grammar, spelling, or style issues. Return the corrected text only.') },
    { label: 'Explain simply', action: () => aiAction(text, 'Explain this in simple terms as if teaching a beginner.') },
    { label: 'Generate flashcards', action: () => aiAction(text, 'Generate 3-5 flashcard Q&A pairs from this content. Format: Q: ...\nA: ...') },
  ]
  // custom actions from localStorage
  let customs: {name:string;prompt:string}[] = []
  try { customs = JSON.parse(localStorage.getItem('lk_ai_actions') || '[]') } catch {}
  const customItems = customs.map(c => ({ label: c.name, action: () => aiAction(text, c.prompt) }))
  return [
    ...builtIn,
    ...(customItems.length ? [{ separator: true } as any, ...customItems] : []),
    { separator: true },
    { label: 'Manage custom actions...', action: manageAiActions },
  ]
}

function aiAction(text: string, prompt: string) {
  // dispatch to chat with the text + prompt
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
async function onDrop() { await loadTree() }
async function makeCard() {
  if (!current.value) return
  const dks = await window.lk.deckList(); let dId = dks[0]?.id
  if (!dId) { await window.lk.deckUpsert({ id: await window.lk.uuid(), title: 'Default', sort: 0 }); dId = (await window.lk.deckList())[0]?.id }
  await window.lk.srsFromNote(dId, current.value.title.slice(0, 200), current.value.body.split('\n\n')[0].slice(0, 600), current.value.id)
  ElMessage.success('card created')
}
async function exportMd() { if (current.value) { await window.lk.notesExport(current.value.id); ElMessage.success('exported') } }
onMounted(async () => {
  window.addEventListener('beforeunload', saveCurrent)
  await loadTree(); if (!rawTree.value.length) await newNote(null); else await open(rawTree.value[0].id)
  // restore expanded state from settings
  const saved = await window.lk.getSetting('notesExpanded')
  if (saved) defaultExpand.value = JSON.parse(saved)
})
onBeforeUnmount(async () => {
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
.editor-wrap { flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.toolbar { display: flex; gap: 4px; align-items: center; padding: 6px 10px; border-bottom: 1px solid var(--border); background: var(--bg-soft); flex-wrap: wrap; flex-shrink: 0; }
.title-in { width: 180px; flex-shrink: 0; } .tag-in { width: 150px; flex-shrink: 0; }
.sep { width: 1px; height: 18px; background: var(--border); margin: 0 4px; flex-shrink: 0; } .spacer { flex: 1; }
.split { flex: 1; display: flex; min-height: 0; overflow: hidden; }
.ta-wrap { flex: 1; position: relative; min-width: 0; overflow: hidden; display: flex; }
.gutter { width: 44px; flex-shrink: 0; background: var(--bg-soft); border-right: 1px solid var(--border); overflow: hidden; user-select: none; padding-top: 16px; }
.gutter-line { height: 22.4px; display: flex; align-items: center; justify-content: flex-end; padding-right: 6px; position: relative; cursor: pointer; transition: background .1s; &:hover { background: var(--bg-hover); } &.active { background: var(--bg-selected); } }
.gutter-num { font-size: 11px; color: var(--text-dim); font-family: var(--font-mono, monospace); min-width: 20px; text-align: right; }
.gutter-handle { position: absolute; left: 2px; font-size: 10px; color: var(--text-dim); opacity: 0; cursor: grab; transition: opacity .1s; }
.gutter-line:hover .gutter-handle { opacity: 1; }
.ta { flex: 1; width: 0; height: 100%; background: var(--bg); border: none; outline: none; color: var(--text); font-family: 'JetBrains Mono', Consolas, 'Microsoft YaHei', monospace; font-size: 14px; line-height: 1.6; resize: none; padding: 16px 20px; border-right: 1px solid var(--border); box-sizing: border-box; }
.preview { flex: 1; min-width: 0; padding: 16px 20px; overflow: auto; background: var(--bg); box-sizing: border-box; word-wrap: break-word; overflow-wrap: break-word; }
.slash-menu { position: absolute; z-index: 20; background: var(--bg-elev); border: 1px solid var(--border); border-radius: 6px; box-shadow: var(--shadow); min-width: 200px; padding: 4px 0; }
.slash-item { display: flex; justify-content: space-between; padding: 5px 14px; font-size: 13px; cursor: pointer; color: var(--text); }
.slash-item:hover { background: var(--accent); color: #fff; }
.slash-item .hint { color: var(--text-dim); font-size: 12px; }
.slash-item:hover .hint { color: rgba(255,255,255,0.7); }
.active { color: var(--accent); font-weight: 600; }
:deep(.el-tree) { background: transparent; color: var(--text); }
</style>