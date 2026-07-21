<template>
  <aside class="sidebar">
    <div class="header">
      <span class="logo">Learning Kit</span>
      <el-button size="small" text @click="newGroup(null)">+目录</el-button>
    </div>

    <div class="actions">
      <el-button size="small" type="primary" plain @click="newRootConv">+ 新对话</el-button>
      <el-button size="small" text @click="collapseAll">折叠</el-button>
    </div>

    <div class="tree-scroll">
      <el-tree
        ref="treeRef"
        :data="treeData"
        node-key="id"
        :default-expanded-keys="expandedIds"
        :expand-on-click-node="false"
        draggable
        :allow-drop="allowDrop"
        @node-drop="onNodeDrop"
        @node-click="nodeClick"
        @node-contextmenu="onNodeCtx"
        @node-expand="onExpand"
        @node-collapse="onCollapse"
      >
        <template #default="{ data }">
          <div class="node-row" :class="{ active: activeId === data.id }">
            <el-icon
              class="type-icon"
              :class="data.kind === 'conv' ? 'conv' : 'group'"
            >
              <Folder v-if="data.kind === 'group'" />
              <ChatDotRound v-else />
            </el-icon>
            <span class="node-label">{{ data.label }}</span>
            <el-dropdown
              trigger="click"
              size="small"
              @command="(cmd) => onMenu(cmd, data)"
            >
              <el-icon class="menu-btn" @click.stop><MoreFilled /></el-icon>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="rename" :disabled="data.kind !== 'conv' && data.kind !== 'group'">重命名</el-dropdown-item>
                  <el-dropdown-item command="addSub" v-if="data.kind === 'group'">新建子目录</el-dropdown-item>
                  <el-dropdown-item command="addConv" v-if="data.kind === 'group'">在此目录新建对话</el-dropdown-item>
                  <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </template>
      </el-tree>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { useChatStore, GroupNode } from '../stores/chat'
import { useContextMenu } from '../stores/context-menu'

const chat = useChatStore()
const menu = useContextMenu()
const activeId = ref<string | null>(null)
const treeRef = ref()
const expandedIds = ref<string[]>([])

interface TreeNodeData {
  id: string
  label: string
  kind: 'group' | 'conv'
  parentId: string | null
  sort: number
  children?: TreeNodeData[]
}

const treeData = computed<TreeNodeData[]>(() => {
  const convsByGroup = new Map<string | null, any[]>()
  for (const c of chat.convs) {
    const k = c.group_id
    if (!convsByGroup.has(k)) convsByGroup.set(k, [])
    convsByGroup.get(k)!.push(c)
  }
  const convLeaves = (groupId: string | null): TreeNodeData[] => {
    const list = (convsByGroup.get(groupId) || []).slice().sort((a, b) => a.sort - b.sort)
    return list.map((c) => ({ id: c.id, label: c.title, kind: 'conv', parentId: groupId, sort: c.sort }))
  }
  const mapGroup = (g: GroupNode): TreeNodeData => ({
    id: g.id,
    label: g.title,
    kind: 'group',
    parentId: g.parentId,
    sort: g.sort,
    children: [...g.children.map(mapGroup), ...convLeaves(g.id)]
  })
  return [...chat.groups.map(mapGroup), ...convLeaves(null)]
})

watch(
  treeData,
  () => {
    expandedIds.value = chat.groups.filter((g) => g.expanded).map((g) => g.id)
  },
  { immediate: true }
)

function allowDrop(_draggingNode: any, dropNode: any, type: 'prev' | 'inner' | 'next') {
  // disallow dropping a group into a conversation (inner into conv)
  if (type === 'inner' && dropNode.data.kind === 'conv') return false
  return true
}

async function onNodeDrop(_draggingNode: any, _dropNode: any, _position: string) {
  // re-serialize all positions & parents from the el-tree model
  const root = treeRef.value?.getRootNode() as any
  if (!root) return
  const walk = (nodes: any[], parentId: string | null) => {
    nodes.forEach((n: any, idx: number) => {
      const d = n.data as TreeNodeData
      const sort = (idx + 1) * 10
      if (d.kind === 'group') {
        window.lk.groupUpsert({ id: d.id, parent_id: parentId, title: d.label, sort, expanded: expandedIds.value.includes(d.id) ? 1 : 0 })
        if (n.childNodes?.length) walk(n.childNodes, d.id)
      } else if (d.kind === 'conv') {
        window.lk.convUpsert({ id: d.id, group_id: parentId, title: d.label, sort })
      }
    })
  }
  walk(root.childNodes, null)
  await chat.refreshGroups()
  await chat.refreshConvs(null)
}

function nodeClick(data: TreeNodeData) {
  if (data.kind === 'conv') {
    activeId.value = data.id
    chat.selectConv(data.id)
  }
}

function onExpand(_node: any, data: unknown) {
  const d = data as TreeNodeData
  if (d.kind === 'group' && !expandedIds.value.includes(d.id)) {
    expandedIds.value.push(d.id)
    window.lk.groupUpsert({ id: d.id, parent_id: d.parentId, title: d.label, sort: d.sort, expanded: 1 })
  }
}
function onCollapse(_node: any, data: unknown) {
  const d = data as TreeNodeData
  if (d.kind === 'group') {
    expandedIds.value = expandedIds.value.filter((i) => i !== d.id)
    window.lk.groupUpsert({ id: d.id, parent_id: d.parentId, title: d.label, sort: d.sort, expanded: 0 })
  }
}

async function onMenu(cmd: string, data: TreeNodeData) {
  if (cmd === 'rename') {
    const v = await ElMessageBox.prompt('新名称', '重命名', { inputValue: data.label })
    if (!v.value) return
    if (data.kind === 'group') {
      await window.lk.groupUpsert({ id: data.id, parent_id: data.parentId, title: v.value, sort: data.sort, expanded: expandedIds.value.includes(data.id) ? 1 : 0 })
    } else {
      await window.lk.convRename(data.id, v.value)
    }
    await chat.refreshGroups()
    await chat.refreshConvs(null)
  } else if (cmd === 'addSub') {
    await newGroup(data.id)
  } else if (cmd === 'addConv') {
    await newConvIn(data.id)
  } else if (cmd === 'delete') {
    await ElMessageBox.confirm('确认删除？', '删除', { type: 'warning' })
    if (data.kind === 'group') {
      await window.lk.groupDelete(data.id)
      await chat.refreshGroups()
    } else {
      await chat.deleteConv(data.id)
    }
    await chat.refreshConvs(null)
    ElMessage.success('已删除')
  }
}

async function newGroup(parentId: string | null = null) {
  const id = await window.lk.uuid()
  await window.lk.groupUpsert({ id, parent_id: parentId, title: '新目录', sort: Date.now(), expanded: 1 })
  if (parentId) expandedIds.value.push(parentId)
  await chat.refreshGroups()
}

async function newRootConv() {
  const c = await chat.newConv(null, '新对话')
  await chat.selectConv(c.id)
  activeId.value = c.id
}

async function newConvIn(groupId: string) {
  const c = await chat.newConv(groupId, '新对话')
  if (!expandedIds.value.includes(groupId)) expandedIds.value.push(groupId)
  await chat.selectConv(c.id)
  activeId.value = c.id
}

function collapseAll() {
  expandedIds.value = []
  chat.groups.forEach((g) =>
    window.lk.groupUpsert({ id: g.id, parent_id: g.parentId, title: g.title, sort: g.sort, expanded: 0 })
  )
  treeRef.value?.setCurrentKey(null)
}

function onNodeCtx(e: Event, data: TreeNodeData) {
  (e as MouseEvent).preventDefault()
  menu.open(e as MouseEvent, [
    ...(data.kind === 'conv'
      ? [
          { label: '打开', icon: 'Document' as any, action: () => { chat.selectConv(data.id) } },
          { label: '重命名', icon: 'Edit' as any, action: () => onMenu('rename', data) },
        ]
      : [
          { label: '新建子目录', icon: 'Plus' as any, action: () => newGroup(data.id) },
          { label: '在此目录新建对话', icon: 'ChatDotRound' as any, action: () => newConvIn(data.id) },
          { label: '重命名', icon: 'Edit' as any, action: () => onMenu('rename', data) },
        ]),
    { separator: true },
    { label: '删除', icon: 'Delete' as any, danger: true, action: () => onMenu('delete', data) },
  ])
}

watch(() => chat.currentConvId, (id) => { if (id) activeId.value = id })

onMounted(async () => {
  await chat.refreshGroups()
  await chat.refreshConvs(null)
})
</script>

<style scoped lang="scss">
.sidebar {
  height: 100%;
  background: var(--bg-soft);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  .logo { font-weight: 600; letter-spacing: 0.5px; }
}
.actions {
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}
.tree-scroll {
  flex: 1;
  overflow: auto;
  padding: 6px 8px;
}
.node-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 2px 2px;
  border-radius: 4px;
  &:hover .menu-btn { opacity: 1; }
  &.active { background: rgba(78,161,255,0.18); }
}
.type-icon.group { color: #d4b469; }
.type-icon.conv { color: var(--accent); }
.node-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.menu-btn { opacity: 0; color: var(--text-dim); cursor: pointer; }

:deep(.el-tree) { background: transparent; color: var(--text); }
:deep(.el-tree-node__content) { height: 28px; }
:deep(.el-tree-node__content:hover) { background: rgba(255,255,255,0.04); }
:deep(.el-tree--highlight-current .el-tree-node.is-current > .el-tree-node__content) { background: rgba(78,161,255,0.15); }
</style>