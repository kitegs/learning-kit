<template>
  <div class="tab-bar" @wheel="store.onTabWheel">
    <div class="tab-list" ref="tabList">
      <div
        v-for="(tab, idx) in store.tabs"
        :key="tab.id"
        class="tab-item"
        :class="{ active: tab.id === store.activeId, pinned: tab.pinned, preview: tab.preview }"
        draggable="true"
        @click="store.activate(tab.id)"
        @mousedown.middle.prevent="store.closeTab(tab.id)"
        @dragstart="onDragStart(idx, $event)"
        @dragover.prevent="onDragOver(idx, $event)"
        @drop="onDrop(idx)"
        @dragend="dragIdx = -1"
        @contextmenu.prevent="onTabCtx($event, tab)"
      >
        <span class="tab-icon">{{ iconFor(tab.type) }}</span>
        <span v-if="!tab.pinned" class="tab-title">{{ tab.title }}</span>
        <button v-if="!tab.pinned" class="tab-close" @click.stop="store.closeTab(tab.id)">&times;</button>
      </div>
    </div>
    <button class="tab-new" @click="newTab" title="New tab (Ctrl+T)">+</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useTabStore, type Tab } from '../stores/tabs'
import { useContextMenu } from '../stores/context-menu'

const store = useTabStore()
const menu = useContextMenu()
const dragIdx = ref(-1)
const tabList = ref<HTMLElement|null>(null)

function iconFor(type: string) {
  const map: Record<string, string> = { chat: '💬', note: '📝', ebook: '📖', mindmap: '🧠', review: '🃏', library: '📚' }
  return map[type] || '📄'
}

function newTab() {
  store.openTab({ type: 'chat', title: 'Chat', data: {} })
}

function onDragStart(idx: number, e: DragEvent) {
  dragIdx.value = idx
  e.dataTransfer?.setData('text/plain', String(idx))
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onDragOver(idx: number, e: DragEvent) {
  if (dragIdx.value < 0 || dragIdx.value === idx) return
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}
function onDrop(idx: number) {
  if (dragIdx.value >= 0 && dragIdx.value !== idx) store.moveTab(dragIdx.value, idx)
  dragIdx.value = -1
}

function onTabCtx(e: MouseEvent, tab: Tab) {
  menu.open(e, [
    { label: 'Close', icon: 'Close' as any, action: () => store.closeTab(tab.id) },
    { label: 'Close Others', icon: 'CloseBold' as any, action: () => store.closeOthers(tab.id) },
    { label: 'Close Right', icon: 'ArrowRight' as any, action: () => store.closeRight(tab.id) },
    { separator: true },
    { label: tab.pinned ? 'Unpin' : 'Pin', icon: 'Paperclip' as any, action: () => store.pinTab(tab.id) },
    { separator: true },
    { label: 'Rename', icon: 'Edit' as any, action: () => {
      const name = prompt('Tab name:', tab.title)
      if (name) store.renameTab(tab.id, name)
    }},
  ])
}
</script>

<style scoped lang="scss">
.tab-bar {
  display: flex;
  align-items: stretch;
  height: 34px;
  background: var(--bg-soft);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  overflow: hidden;
}
.tab-list {
  display: flex;
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
}
.tab-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px;
  min-width: 60px;
  max-width: 180px;
  cursor: pointer;
  border-right: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-dim);
  white-space: nowrap;
  transition: background .1s, color .1s;
  user-select: none;
  position: relative;
  &:hover { background: rgba(127,127,127,.08); color: var(--text); }
  &.active { background: var(--bg); color: var(--text); &::after { content:''; position:absolute; bottom:0; left:0; right:0; height:2px; background:var(--accent); } }
  &.pinned { min-width: auto; max-width: 40px; padding: 0 8px; }
  &.preview .tab-title { font-style: italic; }
}
.tab-icon { font-size: 14px; flex-shrink: 0; }
.tab-title { overflow: hidden; text-overflow: ellipsis; flex: 1; }
.tab-close {
  border: none; background: transparent; color: var(--text-dim);
  font-size: 14px; cursor: pointer; padding: 0 2px; border-radius: 3px;
  opacity: 0; transition: opacity .1s;
  &:hover { background: rgba(255,80,80,.2); color: #ff5c5c; }
}
.tab-item:hover .tab-close, .tab-item.active .tab-close { opacity: 1; }
.tab-new {
  border: none; background: transparent; color: var(--text-dim);
  font-size: 16px; cursor: pointer; padding: 0 10px;
  &:hover { color: var(--accent); }
}
</style>