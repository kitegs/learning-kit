<template>
  <Teleport to="body">
    <div v-if="visible" class="sel-toolbar" :style="posStyle" @mousedown.prevent>
      <button @click="fmt('**','**')" title="Bold (Ctrl+B)"><strong>B</strong></button>
      <button @click="fmt('*','*')" title="Italic (Ctrl+I)"><em>I</em></button>
      <button @click="fmt('~~','~~')" title="Strikethrough"><s>S</s></button>
      <span class="tb-sep"></span>
      <button @click="fmt('`','`')" title="Inline Code">&lt;/&gt;</button>
      <button @click="fmt('[','](url)')" title="Link">Link</button>
      <button @click="fmt('==','==')" title="Highlight">HL</button>
      <span class="tb-sep"></span>
      <button @click="doHighlight" title="Save as highlight" class="tb-hl">Save HL</button>
      <button @click="doAI('Analyze')" title="Ask AI">AI</button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const emit = defineEmits<{
  (e: 'highlight', text: string): void
  (e: 'ai', text: string, action: string): void
}>()

const visible = ref(false)
const posX = ref(0)
const posY = ref(0)
let targetTextarea: HTMLTextAreaElement | null = null
let selStart = 0
let selEnd = 0
let selText = ''

const posStyle = computed(() => ({ left: posX.value + 'px', top: posY.value + 'px' }))

function onGlobalMouseUp() {
  setTimeout(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.toString().trim()) { visible.value = false; return }
    // only show if selection is in a textarea we track
    const active = document.activeElement
    if (active && active.tagName === 'TEXTAREA' && active.classList.contains('ta')) {
      targetTextarea = active as HTMLTextAreaElement
      selStart = targetTextarea.selectionStart
      selEnd = targetTextarea.selectionEnd
      selText = targetTextarea.value.slice(selStart, selEnd)
      if (selText.trim().length < 1) { visible.value = false; return }
      // position above the textarea cursor area
      const rect = targetTextarea.getBoundingClientRect()
      // approximate position from character offset
      const lineHeight = 22
      const charsPerLine = Math.floor(rect.width / 8)
      const lineNum = Math.floor(selStart / charsPerLine)
      const colNum = selStart % charsPerLine
      posX.value = Math.min(rect.right - 280, rect.left + colNum * 8)
      posY.value = Math.max(4, rect.top + lineNum * lineHeight - 40)
      visible.value = true
    } else {
      visible.value = false
    }
  }, 10)
}

function onGlobalMouseDown(e: MouseEvent) {
  // hide if clicking outside toolbar
  const tb = document.querySelector('.sel-toolbar')
  if (tb && !tb.contains(e.target as Node)) {
    // delay hide to allow button clicks
    setTimeout(() => { if (!window.getSelection()?.toString().trim()) visible.value = false }, 100)
  }
}

function onGlobalKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') visible.value = false
}

function fmt(pre: string, post: string) {
  if (!targetTextarea) return
  const ta = targetTextarea
  const val = ta.value
  const newVal = val.slice(0, selStart) + pre + selText + post + val.slice(selEnd)
  // dispatch input event so Vue v-model picks it up
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  if (nativeInputValueSetter) nativeInputValueSetter.call(ta, newVal)
  ta.dispatchEvent(new Event('input', { bubbles: true }))
  ta.focus()
  ta.selectionStart = selStart + pre.length
  ta.selectionEnd = selEnd + pre.length
  visible.value = false
}

function doHighlight() {
  if (selText.trim()) emit('highlight', selText.trim())
  visible.value = false
}

function doAI(action: string) {
  if (selText.trim()) emit('ai', selText.trim(), action)
  visible.value = false
}

onMounted(() => {
  document.addEventListener('mouseup', onGlobalMouseUp)
  document.addEventListener('mousedown', onGlobalMouseDown)
  document.addEventListener('keydown', onGlobalKeydown)
})
onUnmounted(() => {
  document.removeEventListener('mouseup', onGlobalMouseUp)
  document.removeEventListener('mousedown', onGlobalMouseDown)
  document.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<style scoped>
.sel-toolbar {
  position: fixed;
  z-index: 9500;
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--bg-elev, #2d2d30);
  border: 1px solid var(--border, #3e3e42);
  border-radius: 8px;
  padding: 4px 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,.35);
  animation: tbIn .12s ease;
}
@keyframes tbIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
.sel-toolbar button {
  border: none;
  background: transparent;
  color: var(--text, #e6e6e6);
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  transition: background .1s;
  white-space: nowrap;
}
.sel-toolbar button:hover { background: var(--accent, #4ea1ff); color: #fff; }
.sel-toolbar .tb-hl { color: #ffd43b; }
.sel-toolbar .tb-hl:hover { background: #ffd43b; color: #000; }
.tb-sep { width: 1px; height: 16px; background: var(--border, #3e3e42); margin: 0 3px; flex-shrink: 0; }
</style>