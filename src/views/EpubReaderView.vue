<template>
  <div class="epub-root">
    <aside class="side" :class="{ open: sideOpen }">
      <div class="side-tabs">
        <button :class="{active: tab==='toc'}" @click="tab='toc'">目录</button>
        <button :class="{active: tab==='marks'}" @click="tab='marks'">书签/划线</button>
      </div>
      <div class="side-body">
        <div v-if="tab==='toc'">
          <el-empty v-if="!outline.length" description="无目录" :image-size="60" />
          <div v-for="(it, i) in outline" :key="i" class="toc-item" :style="{ paddingLeft: 8 + it.depth * 12 + 'px' }" @click="goToc(it)">
            {{ it.label }}
          </div>
        </div>
        <div v-else>
          <el-button size="small" type="primary" plain @click="addBookmark" style="margin-bottom: 8px;">+ 当前页书签</el-button>
          <el-empty v-if="!bookmarks.length" description="无书签" :image-size="60" />
          <div v-for="b in bookmarks" :key="b.id" class="mark" @click="goBookmark(b)">
            <span><span v-if="b.page">第 {{ b.page }} 页</span>{{ b.label }}</span>
            <el-button text size="small" type="danger" @click.stop="delBookmark(b.id)">删</el-button>
          </div>
          <el-divider content-position="left">划线 ({{ highlights.length }})</el-divider>
          <div v-for="h in highlights" :key="h.id" class="hl" @click="goHighlight(h)">
            <div class="hl-text">{{ h.text }}</div>
            <div class="hl-meta">第 {{ h.page }} 页</div>
            <div class="hl-actions">
              <el-button text size="small" @click.stop="askHl(h)">问AI</el-button>
              <el-button text size="small" @click.stop="delHl(h.id)">删</el-button>
            </div>
          </div>
        </div>
      </div>
    </aside>

    <div class="main">
      <div class="ctrl">
        <el-button size="small" text @click="$emit('back')">← 返回</el-button>
        <el-button size="small" text @click="sideOpen=!sideOpen">☰</el-button>
        <span class="title">{{ book?.title }}</span>
        <span class="spacer"></span>
        <el-button size="small" :type="flowLayout==='scrolled-doc'?'primary':'default'" @click="toggleFlow">{{ flowLayout==='scrolled-doc'?'Scroll':'Page' }}</el-button>
        <el-button-group v-if="flowLayout==='paginated'">
          <el-button size="small" @click="rendition?.prev()">-</el-button>
          <span class="loc">{{ locText }}</span>
          <el-button size="small" @click="rendition?.next()">+</el-button>
        </el-button-group>
        <el-slider v-model="epubZoom" :min="70" :max="200" :step="10" style="width:100px;margin:0 6px" @change="onEpubZoomChange" />
        <span class="loc" v-if="flowLayout==='scrolled-doc'">{{ locText }}</span>
        <button class="fab" @click="onAskFloating">AI</button>
      </div>
      <div ref="viewer" class="viewer" @mouseup="onSelectionEnd"></div>
    </div>

    <div v-if="selPopup.show" class="sel-popup" :style="{ top: selPopup.y + 'px', left: selPopup.x + 'px' }">
      <button @click="askSel('请解析这段内容。')">解析</button>
      <button @click="askSel('请帮我整理要点。')">要点</button>
      <button @click="saveSel">加入划线</button>
    </div>

    <el-dialog v-model="askDialog.open" title="对当前位置向 AI 提问" width="600px">
      <el-input v-model="askDialog.question" type="textarea" :rows="4" placeholder="如：这一章讲的什么？" />
      <template #footer>
        <el-button @click="askDialog.open=false">取消</el-button>
        <el-button type="primary" @click="confirmAsk">发送到对话</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, nextTick } from 'vue'
import ePub, { type Book } from 'epubjs'
import { ElMessage } from 'element-plus'

const props = defineProps<{ bookIdProp: string | null }>()
const emit = defineEmits<{
  (e: 'back'): void
  (e: 'ask-ai', p: { quote: string; question?: string; bookId: string; page: number }): void
}>()

const bookId = ref<string | null>(props.bookIdProp)
const book = ref<any>(null)
const sideOpen = ref(true)
const tab = ref<'toc' | 'marks'>('toc')
const outline = ref<{ label: string; href: string; depth: number }[]>([])
const bookmarks = ref<any[]>([])
const highlights = ref<any[]>([])
const viewer = ref<HTMLElement | null>(null)
let epubBook: Book | null = null
let rendition: any = null
const selPopup = ref({ show: false, x: 0, y: 0, text: '' })
const askDialog = ref({ open: false, question: '' })
const currentCfi = ref('')

const locText = ref('')
const epubZoom = ref(100)
const flowLayout = ref<'paginated' | 'scrolled-doc'>('paginated')

function flattenToc(items: any[], depth = 0): any[] {
  const out: any[] = []
  if (!items) return out
  for (const it of items) {
    out.push({ label: it.label, href: it.href, depth })
    if (it.subitems) out.push(...flattenToc(it.subitems, depth + 1))
  }
  return out
}

async function load() {
  if (!bookId.value) return
  const list = await window.lk.bookList()
  book.value = list.find((b: any) => b.id === bookId.value) || null
  bookmarks.value = await window.lk.bookmarkList(bookId.value)
  highlights.value = await window.lk.highlightList(bookId.value)

  const url = window.lk.bookUrl(bookId.value)
  epubBook = ePub(url, { openAs: 'epub' } as any)

  epubBook.ready.then(() => {
    epubBook!.loaded.navigation.then((nav: any) => {
      outline.value = flattenToc(nav.toc)
    })
  })

  await nextTick()
  if (viewer.value) {
    rendition = epubBook!.renderTo(viewer.value, {
      width: '100%',
      height: (viewer.value?.clientHeight || 700) + 'px',
      flow: 'paginated'
    } as any)
    rendition.display()
    rendition.on('relocated', (loc: any) => {
      currentCfi.value = loc.start.cfi
      locText.value = `章节 ${loc.start.index + 1} / ${(epubBook!.spine as any).items.length}`
    })
  }
}

async function goToc(it: any) {
  if (!rendition || !it.href) return
  rendition.display(it.href)
}

async function goBookmark(b: any) {
  if (b.href && rendition) rendition.display(b.href)
}

async function goHighlight(h: any) {
  if (h.href && rendition) rendition.display(h.href)
}

function onSelectionEnd(e: MouseEvent) {
  const sel = window.getSelection()
  if (!sel) return
  const text = sel.toString().trim()
  if (!text || text.length < 2) { selPopup.value.show = false; return }
  const rect = viewer.value!.getBoundingClientRect()
  selPopup.value = {
    show: true,
    x: Math.min(e.clientX - rect.left, rect.width - 200),
    y: Math.max(40, e.clientY - rect.top - 50),
    text
  }
}

function askSel(prefix: string) {
  emit('ask-ai', { quote: selPopup.value.text, question: prefix, bookId: bookId.value!, page: 0 })
  selPopup.value.show = false
}

async function saveSel() {
  await window.lk.highlightAdd({
    bookId: bookId.value,
    page: 0,
    text: selPopup.value.text,
    color: 'yellow',
    note: null,
    linkConvId: null,
    linkMsgId: null
  })
  highlights.value = await window.lk.highlightList(bookId.value!)
  selPopup.value.show = false
  ElMessage.success('已加入划线')
}

async function addBookmark() {
  await window.lk.bookmarkAdd({
    bookId: bookId.value,
    page: 0,
    label: '当前位置',
    href: currentCfi.value || undefined
  })
  bookmarks.value = await window.lk.bookmarkList(bookId.value!)
  ElMessage.success('已添加书签')
}

async function delBookmark(id: string) {
  await window.lk.bookmarkDelete(id)
  bookmarks.value = await window.lk.bookmarkList(bookId.value!)
}

function askHl(h: any) {
  emit('ask-ai', { quote: h.text, bookId: bookId.value!, page: 0 })
}
async function delHl(id: string) {
  await window.lk.highlightDelete(id)
  highlights.value = await window.lk.highlightList(bookId.value!)
}

function onAskFloating() {
  askDialog.value = { open: true, question: '' }
}
function confirmAsk() {
  emit('ask-ai', { quote: '', question: askDialog.value.question, bookId: bookId.value!, page: 0 })
  askDialog.value.open = false
}

function handleResize() {
  if (rendition) rendition.resize((viewer.value?.clientWidth || 700), (viewer.value?.clientHeight || 700))
}

function toggleFlow() {
  flowLayout.value = flowLayout.value === 'paginated' ? 'scrolled-doc' : 'paginated'
  if (!rendition) return
  rendition.destroy()
  rendition = epubBook!.renderTo(viewer.value!, {
    width: '100%',
    height: (viewer.value?.clientHeight || 700) + 'px',
    flow: flowLayout.value
  } as any)
  rendition.display()
  rendition.on('relocated', (loc: any) => {
    currentCfi.value = loc.start.cfi
    locText.value = flowLayout.value === 'paginated'
      ? `Chapter ${loc.start.index + 1} / ${(epubBook!.spine as any).items.length}`
      : `Chapter ${loc.start.index + 1}`
  })
}

function onEpubZoomChange() {
  if (!rendition) return
  rendition.themes.fontSize(`${epubZoom.value}%`)
}

onMounted(() => {
  load()
  window.addEventListener('keydown', onKey)
  if (viewer.value) viewer.value.addEventListener('wheel', onEpubWheel, { passive: false })
  window.addEventListener('resize', handleResize)
})

function onKey(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
  if (e.key === 'ArrowLeft') { e.preventDefault(); rendition?.prev() }
  else if (e.key === 'ArrowRight') { e.preventDefault(); rendition?.next() }
}

function onEpubWheel(e: WheelEvent) {
  if (e.ctrlKey) {
    e.preventDefault()
    epubZoom.value = Math.max(50, Math.min(200, epubZoom.value - Math.sign(e.deltaY) * 10))
    onEpubZoomChange()
  }
}
</script>

<style scoped lang="scss">
.epub-root { flex: 1; display: flex; min-width: 0; background: var(--bg); }
.side { width: 260px; background: var(--bg-soft); border-right: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; }
.side-tabs { display: flex; border-bottom: 1px solid var(--border); }
.side-tabs button { flex: 1; padding: 8px 4px; border: none; background: transparent; color: var(--text-dim); cursor: pointer; font-size: 13px; }
.side-tabs button.active { color: var(--accent); border-bottom: 2px solid var(--accent); }
.side-body { flex: 1; overflow: auto; padding: 8px 10px; font-size: 13px; }
.toc-item { padding: 4px 6px; cursor: pointer; border-radius: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.toc-item:hover { background: rgba(127,127,127,0.12); }
.mark { display: flex; gap: 4px; align-items: center; padding: 4px 0; border-bottom: 1px dashed var(--border); cursor: pointer; }
.mark:hover { background: rgba(127,127,127,0.06); }
.hl { padding: 6px 4px; border-left: 2px solid #d4b469; margin-bottom: 8px; cursor: pointer; }
.hl:hover { background: rgba(212,180,105,0.05); }
.hl-text { font-size: 12px; max-height: 60px; overflow: hidden; }
.hl-meta { font-size: 11px; color: var(--text-dim); }
.hl-actions { display: flex; gap: 2px; margin-top: 2px; }
.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.ctrl { height: 38px; flex: 0 0 38px; display: flex; align-items: center; gap: 6px; padding: 0 12px; background: var(--bg-soft); border-bottom: 1px solid var(--border); }
.title { font-weight: 600; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.spacer { flex: 1; }
.loc { color: var(--text-dim); font-size: 12px; min-width: 80px; text-align: center; }
.fab { width: 36px; height: 26px; background: var(--accent); color: #fff; border: none; border-radius: 14px; cursor: pointer; font-weight: 700; }
.viewer { flex: 1; overflow: auto; }
.viewer::-webkit-scrollbar { width: 10px; }
.viewer::-webkit-scrollbar-thumb { background: var(--accent); border-radius: 5px; }
.viewer::-webkit-scrollbar-track { background: var(--bg); }
.viewer :deep(iframe) { border: none; width: 100%; min-height: 100%; }
.sel-popup { position: absolute; z-index: 30; display: flex; gap: 4px; background: var(--bg-elev); border: 1px solid var(--border); border-radius: 6px; padding: 4px; box-shadow: var(--shadow); }
.sel-popup button { border: none; background: transparent; color: var(--text); padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 13px; }
.sel-popup button:hover { background: var(--accent); color: #fff; }
</style>
