<template>
  <div class="block-editor" v-if="editor">
    <div class="be-toolbar" v-if="showToolbar">
      <button @click="editor.chain().focus().toggleBold().run()" :class="{active: editor.isActive('bold')}" title="Bold"><strong>B</strong></button>
      <button @click="editor.chain().focus().toggleItalic().run()" :class="{active: editor.isActive('italic')}" title="Italic"><em>I</em></button>
      <button @click="editor.chain().focus().toggleUnderline().run()" :class="{active: editor.isActive('underline')}" title="Underline"><u>U</u></button>
      <button @click="editor.chain().focus().toggleStrike().run()" :class="{active: editor.isActive('strike')}" title="Strike"><s>S</s></button>
      <button @click="editor.chain().focus().toggleHighlight().run()" :class="{active: editor.isActive('highlight')}" title="Highlight">HL</button>
      <span class="be-sep"></span>
      <button @click="editor.chain().focus().toggleHeading({level:1}).run()" :class="{active: editor.isActive('heading',{level:1})}">H1</button>
      <button @click="editor.chain().focus().toggleHeading({level:2}).run()" :class="{active: editor.isActive('heading',{level:2})}">H2</button>
      <button @click="editor.chain().focus().toggleHeading({level:3}).run()" :class="{active: editor.isActive('heading',{level:3})}">H3</button>
      <span class="be-sep"></span>
      <button @click="editor.chain().focus().toggleBulletList().run()" :class="{active: editor.isActive('bulletList')}">UL</button>
      <button @click="editor.chain().focus().toggleOrderedList().run()" :class="{active: editor.isActive('orderedList')}">OL</button>
      <button @click="editor.chain().focus().toggleTaskList().run()" :class="{active: editor.isActive('taskList')}">Todo</button>
      <button @click="editor.chain().focus().toggleBlockquote().run()" :class="{active: editor.isActive('blockquote')}">Quote</button>
      <button @click="editor.chain().focus().toggleCodeBlock().run()" :class="{active: editor.isActive('codeBlock')}">Code</button>
      <span class="be-sep"></span>
      <button @click="editor.chain().focus().setHorizontalRule().run()">HR</button>
      <button @click="addTable" :class="{active: editor.isActive('table')}">Table</button>
      <button @click="addImage">Img</button>
      <span class="be-sep"></span>
      <button @click="editor.chain().focus().undo().run()" :disabled="!editor.can().undo()">U</button>
      <button @click="editor.chain().focus().redo().run()" :disabled="!editor.can().redo()">R</button>
    </div>
    <editor-content :editor="editor" class="be-content" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import TiptapImage from '@tiptap/extension-image'
import TiptapLink from '@tiptap/extension-link'

const props = defineProps<{ modelValue: string; showToolbar?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const editor = useEditor({
  content: props.modelValue || '',
  extensions: [
    StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
    Placeholder.configure({ placeholder: 'Start writing... Type / for commands' }),
    Underline,
    Highlight.configure({ multicolor: true }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableCell,
    TableHeader,
    TiptapImage.configure({ inline: false, allowBase64: true }),
    TiptapLink.configure({ openOnClick: false }),
  ],
  onUpdate: ({ editor: ed }) => {
    emit('update:modelValue', ed.getHTML())
  },
})

watch(() => props.modelValue, (v) => {
  if (editor.value && v !== editor.value.getHTML()) {
    editor.value.commands.setContent(v || '')
  }
})

function addTable() {
  editor.value?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
}
function addImage() {
  const url = prompt('Image URL:')
  if (url) editor.value?.chain().focus().setImage({ src: url }).run()
}

onBeforeUnmount(() => { editor.value?.destroy() })
</script>

<style scoped lang="scss">
.block-editor { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.be-toolbar { display: flex; align-items: center; gap: 2px; padding: 4px 8px; border-bottom: 1px solid var(--border); background: var(--bg-soft); flex-wrap: wrap; flex-shrink: 0; }
.be-toolbar button { border: none; background: transparent; color: var(--text-dim); padding: 4px 7px; border-radius: 4px; cursor: pointer; font-size: 12px; line-height: 1; transition: all .1s; &:hover { background: var(--bg-hover); color: var(--text); } &.active { background: var(--accent); color: var(--text-on-accent); } &:disabled { opacity: .3; cursor: default; } }
.be-sep { width: 1px; height: 16px; background: var(--border); margin: 0 3px; }
.be-content { flex: 1; overflow: auto; padding: 16px 24px; }
.be-content :deep(.tiptap) { outline: none; min-height: 100%; color: var(--text); font-size: 14px; line-height: 1.7; }
.be-content :deep(.tiptap p.is-editor-empty:first-child::before) { content: attr(data-placeholder); color: var(--text-dim); float: left; height: 0; pointer-events: none; }
.be-content :deep(.tiptap h1) { font-size: 1.8em; margin: .6em 0 .3em; }
.be-content :deep(.tiptap h2) { font-size: 1.4em; margin: .5em 0 .3em; }
.be-content :deep(.tiptap h3) { font-size: 1.2em; margin: .4em 0 .2em; }
.be-content :deep(.tiptap pre) { background: var(--bg-elev); border: 1px solid var(--border); border-radius: 6px; padding: 12px; overflow: auto; }
.be-content :deep(.tiptap code) { font-family: var(--font-mono, monospace); font-size: .9em; }
.be-content :deep(.tiptap blockquote) { border-left: 3px solid var(--accent); padding-left: 12px; margin-left: 0; color: var(--text-secondary); }
.be-content :deep(.tiptap ul[data-type="taskList"]) { list-style: none; padding-left: 0; }
.be-content :deep(.tiptap ul[data-type="taskList"] li) { display: flex; align-items: flex-start; gap: 6px; }
.be-content :deep(.tiptap ul[data-type="taskList"] li label) { margin-top: 3px; }
.be-content :deep(.tiptap mark) { background: var(--hl-yellow); border-radius: 2px; padding: 0 2px; }
.be-content :deep(.tiptap table) { border-collapse: collapse; margin: 8px 0; width: 100%; }
.be-content :deep(.tiptap td), .be-content :deep(.tiptap th) { border: 1px solid var(--border); padding: 6px 10px; min-width: 80px; }
.be-content :deep(.tiptap th) { background: var(--bg-elev); font-weight: 600; }
.be-content :deep(.tiptap img) { max-width: 100%; border-radius: 6px; }
.be-content :deep(.tiptap a) { color: var(--accent-text); text-decoration: underline; }
.be-content :deep(.tiptap hr) { border: none; border-top: 1px solid var(--border); margin: 16px 0; }
</style>