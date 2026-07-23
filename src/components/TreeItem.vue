<template>
  <!-- group node: the whole block (header + children) is one drop zone -->
  <div
    v-if="node.kind === 'group'"
    class="ti-group"
    :class="{ dragover }"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div
      class="ti-row head"
      :style="{ paddingLeft: 8 + depth * 14 + 'px' }"
      draggable="true"
      @dragstart="onDragStart"
      @click="toggle"
      @contextmenu="ctx"
    >
      <span class="chev" :class="{ open: isOpen }"><el-icon><ArrowRight /></el-icon></span>
      <el-icon class="ti-ico"><FolderOpened v-if="isOpen" /><Folder v-else /></el-icon>
      <span class="ti-label">{{ node.title }}</span>
      <span class="ti-meta">{{ meta }}</span>
      <span class="ti-actions">
        <el-icon class="ti-act" title="新建对话" @click.stop="act('newConv')"><Plus /></el-icon>
        <el-icon class="ti-act" title="更多" @click.stop="act('more', $event)"><MoreFilled /></el-icon>
      </span>
    </div>
    <div v-if="isOpen" class="ti-children">
      <TreeItem
        v-for="c in node.children"
        :key="c.id"
        :node="c"
        :depth="depth + 1"
        :active-id="activeId"
      />
      <div v-if="!node.children.length" class="ti-empty" :style="{ paddingLeft: 22 + depth * 14 + 'px' }">空目录</div>
    </div>
  </div>

  <!-- conversation / leaf node -->
  <div
    v-else
    class="ti-row item"
    :class="{ active: activeId === node.id, dragover }"
    :style="{ paddingLeft: 8 + depth * 14 + 'px' }"
    draggable="true"
    @dragstart="onDragStart"
    @dragover="onDragOverItem"
    @dragleave="onDragLeave"
    @drop="onDropItem"
    @click="select"
    @contextmenu="ctx"
  >
    <span class="chev-slot"></span>
    <el-icon class="ti-ico conv"><ChatDotRound /></el-icon>
    <span class="ti-label">{{ node.title }}</span>
    <span class="ti-meta">{{ meta }}</span>
    <span class="ti-actions">
      <el-icon class="ti-act" title="更多" @click.stop="act('more', $event)"><MoreFilled /></el-icon>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { Folder, FolderOpened, ChatDotRound, MoreFilled, Plus, ArrowRight } from '@element-plus/icons-vue'

defineOptions({ name: 'TreeItem' })

const props = defineProps<{ node: any; depth: number; activeId: string | null }>()
const actions = inject<any>('treeActions')!

const isOpen = computed(() => props.node.kind === 'group' && actions.isExpanded(props.node.id))
const meta = computed(() => (props.node.kind === 'conv' ? rel(props.node.updated_at) : ''))
const dragover = ref(false)

function rel(ts: string | undefined): string {
  if (!ts) return ''
  const d = new Date(ts.includes('T') ? ts : ts.replace(' ', 'T'))
  const diff = Date.now() - d.getTime()
  if (isNaN(diff) || diff < 0) return ''
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return m + ' 分钟'
  const h = Math.floor(m / 60)
  if (h < 24) return h + ' 小时'
  const dd = Math.floor(h / 24)
  if (dd < 7) return dd + ' 天'
  if (dd < 30) return Math.floor(dd / 7) + ' 周'
  if (dd < 365) return Math.floor(dd / 30) + ' 月'
  return Math.floor(dd / 365) + ' 年'
}

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData('text/plain', JSON.stringify({ id: props.node.id, kind: props.node.kind, group_id: props.node.group_id ?? props.node.parentId }))
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
// group container is the drop zone: dropping anywhere on the group (header or children) nests into it
function onDragOver(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragover.value = true
}
function onDragOverItem(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragover.value = true
}
function onDragLeave(e: DragEvent) {
  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) dragover.value = false
}
function onDrop(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  dragover.value = false
  actions.drop(props.node, 'group', e)
}
function onDropItem(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  dragover.value = false
  actions.drop(props.node, 'item', e)
}
function toggle() { actions.toggle(props.node.id) }
function select() { actions.select(props.node.id) }
function ctx(e: MouseEvent) { e.preventDefault(); actions.ctx(e, props.node) }
function act(name: string, e?: MouseEvent) { actions.groupAction(props.node, name, e) }
</script>

<style scoped lang="scss">
.ti-group { position: relative; }
.ti-group.dragover > .ti-row.head { outline: 1px dashed var(--accent, #4ea1ff); outline-offset: -1px; background: rgba(78, 161, 255, 0.1); }

.ti-row {
  position: relative;
  display: flex;
  align-items: center;
  height: 26px;
  line-height: 26px;
  padding-right: 6px;
  font-size: 13px;
  color: #c8c8c8;
  cursor: pointer;
  user-select: none;
  border-radius: 4px;
  margin: 1px 6px;
  transition: background 0.12s ease;
}
.ti-row:hover { background: var(--bg-hover, rgba(255, 255, 255, 0.05)); }
.ti-row.item.active {
  background: var(--bg-selected, rgba(78, 161, 255, 0.16));
  color: #fff;
}
.ti-row.item.active::before {
  content: '';
  position: absolute;
  left: 0; top: 4px; bottom: 4px;
  width: 2px;
  background: var(--accent, #4ea1ff);
  border-radius: 2px;
}
.ti-row.item.dragover { outline: 1px dashed var(--accent, #4ea1ff); outline-offset: -1px; background: rgba(78, 161, 255, 0.1); }

.head { font-size: 11px; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase; color: #b8b8b8; }
.head:hover { color: #e0e0e0; }

.chev {
  width: 16px; height: 16px;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: transform 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  color: #9a9a9a;
  .el-icon { font-size: 11px; }
}
.chev.open { transform: rotate(90deg); }
.chev-slot { width: 16px; flex-shrink: 0; }

.ti-ico { font-size: 15px; margin-right: 7px; flex-shrink: 0; color: #9a9a9a; }
.ti-ico.conv { color: var(--accent, #4ea1ff); font-size: 14px; }
.ti-row.item.active .ti-ico.conv { color: #fff; }

.ti-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.ti-meta {
  margin-left: auto;
  padding-left: 6px;
  font-size: 11px;
  color: #7d7d7d;
  flex-shrink: 0;
  transition: opacity 0.12s ease;
}
.ti-actions {
  position: absolute;
  right: 4px; top: 0; bottom: 0;
  display: flex; align-items: center; gap: 2px;
  opacity: 0;
  transition: opacity 0.12s ease;
  background: linear-gradient(90deg, transparent, var(--bg-hover, rgba(40, 40, 40, 0.95)) 30%);
  padding-left: 16px;
}
.ti-row:hover .ti-actions { opacity: 1; }
.ti-row:hover .ti-meta { opacity: 0; }
.ti-row.item.active:hover .ti-actions { background: linear-gradient(90deg, transparent, var(--bg-selected, rgba(78, 161, 255, 0.4)) 30%); }
.ti-act { font-size: 14px; color: #b0b0b0; padding: 2px; border-radius: 3px; }
.ti-act:hover { color: #fff; background: rgba(255, 255, 255, 0.12); }

.ti-children { position: relative; }
.ti-empty { color: #6a6a6a; font-size: 11px; font-style: italic; height: 22px; line-height: 22px; }
</style>