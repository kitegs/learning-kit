<template>
  <aside class="sidebar-ex">
    <div class="explorer-bar">
      <span class="ex-title">对话</span>
      <el-dropdown trigger="click" @command="onBarCommand">
        <el-icon class="ex-more"><MoreFilled /></el-icon>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="newConv">新建对话</el-dropdown-item>
            <el-dropdown-item command="newGroup">新建目录</el-dropdown-item>
            <el-dropdown-item divided command="expandAll">展开全部</el-dropdown-item>
            <el-dropdown-item command="collapseAll">折叠全部</el-dropdown-item>
            <el-dropdown-item divided command="refresh">刷新</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <div class="ex-tree">
      <TreeItem
        v-for="n in mergedTree"
        :key="n.id"
        :node="n"
        :depth="0"
        :active-id="chat.currentConvId"
      />
      <div v-if="!mergedTree.length" class="ex-empty">暂无对话，点击右上 + 新建</div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, provide, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { MoreFilled } from '@element-plus/icons-vue'
import TreeItem from '../components/TreeItem.vue'
import { useChatStore } from '../stores/chat'
import { useContextMenu } from '../stores/context-menu'

const chat = useChatStore()
const menu = useContextMenu()

const expandedSet = ref<Set<string>>(new Set())

const mergedTree = computed(() => buildMergedTree(chat.groups, chat.convs))

function buildMergedTree(groups: any[], convs: any[]) {
  const convByGroup = new Map<string | null, any[]>()
  for (const c of convs) {
    const k = c.group_id ?? null
    if (!convByGroup.has(k)) convByGroup.set(k, [])
    convByGroup.get(k)!.push(c)
  }
  const sortConvs = (arr: any[]) => arr.slice().sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
  const convNodes = (gid: string | null): any[] =>
    sortConvs(convByGroup.get(gid) || []).map((c) => ({ id: c.id, kind: 'conv', title: c.title, group_id: c.group_id, updated_at: c.updated_at }))
  const mapGroup = (g: any): any => ({
    id: g.id, kind: 'group', title: g.title, parentId: g.parent_id ?? g.parentId ?? null, sort: g.sort,
    children: [...g.children.map(mapGroup), ...convNodes(g.id)],
  })
  const topGroups = groups.filter((g) => !g.parent_id && !g.parentId).sort((a: any, b: any) => (a.sort ?? 0) - (b.sort ?? 0))
  return [...topGroups.map(mapGroup), ...convNodes(null)]
}

function allGroupIds(nodes: any[]): string[] {
  const ids: string[] = []
  for (const n of nodes) { if (n.kind === 'group') { ids.push(n.id); ids.push(...allGroupIds(n.children || [])) } }
  return ids
}
function persistExpanded() { window.lk.setSetting('chatTreeExpanded', JSON.stringify([...expandedSet.value])) }

function isExpanded(id: string) { return expandedSet.value.has(id) }
function toggle(id: string) {
  if (expandedSet.value.has(id)) expandedSet.value.delete(id)
  else expandedSet.value.add(id)
  expandedSet.value = new Set(expandedSet.value)
  persistExpanded()
}
function select(id: string) { chat.selectConv(id) }

function ctx(e: MouseEvent, node: any) { openMenu(e, node) }
function openMenu(e: MouseEvent, node: any) {
  if (node.kind === 'group') {
    menu.open(e, [
      { label: '新建对话', icon: 'Plus' as any, action: () => newConvIn(node.id) },
      { label: '新建子目录', icon: 'Folder' as any, action: () => newSubGroup(node.id) },
      { label: '重命名', icon: 'Edit' as any, action: () => renameGroup(node) },
      { separator: true },
      { label: '删除目录', icon: 'Delete' as any, danger: true, action: () => deleteGroup(node) },
    ])
  } else {
    menu.open(e, [
      { label: '重命名', icon: 'Edit' as any, action: () => renameConv(node) },
      { label: '删除对话', icon: 'Delete' as any, danger: true, action: () => deleteConv(node) },
    ])
  }
}

function groupAction(node: any, name: string, e?: MouseEvent) {
  if (name === 'newConv') newConvIn(node.id)
  else if (name === 'newSubGroup') newSubGroup(node.id)
  else if (name === 'more' && e) openMenu(e, node)
}

function drop(target: any, kind: string, e: DragEvent) {
  let data: any
  try { data = JSON.parse(e.dataTransfer?.getData('text/plain') || 'null') } catch { return }
  if (!data) return
  if (kind === 'group') {
    if (data.kind === 'conv' && data.id !== target.id) {
      window.lk.convUpsert({ id: data.id, group_id: target.id, title: data.title || '对话', sort: Date.now() })
    } else if (data.kind === 'group' && data.id !== target.id) {
      window.lk.groupUpsert({ id: data.id, parent_id: target.id, title: data.title, sort: data.sort ?? 0, expanded: expandedSet.value.has(data.id) ? 1 : 0 })
      expandedSet.value.add(target.id); expandedSet.value = new Set(expandedSet.value); persistExpanded()
    }
  } else {
    if (data.kind === 'conv' && data.id !== target.id) {
      window.lk.convUpsert({ id: data.id, group_id: target.group_id ?? null, title: data.title || '对话', sort: Date.now() })
    }
  }
  refresh()
}

async function newConvIn(groupId: string) {
  const c = await chat.newConv(groupId, '新对话')
  expandedSet.value.add(groupId); expandedSet.value = new Set(expandedSet.value); persistExpanded()
  await chat.selectConv(c.id)
}
async function newSubGroup(parentId: string) {
  const v = await ElMessageBox.prompt('子目录名', '新建子目录', { inputValue: '子目录' }).catch(() => null)
  if (!v?.value) return
  const id = await window.lk.uuid()
  await window.lk.groupUpsert({ id, parent_id: parentId, title: v.value, sort: Date.now(), expanded: 1 })
  expandedSet.value.add(parentId); expandedSet.value = new Set(expandedSet.value); persistExpanded()
  await refresh()
}
async function renameGroup(node: any) {
  const v = await ElMessageBox.prompt('目录名', '重命名', { inputValue: node.title }).catch(() => null)
  if (!v?.value) return
  await window.lk.groupUpsert({ id: node.id, parent_id: node.parentId, title: v.value, sort: node.sort ?? 0, expanded: isExpanded(node.id) ? 1 : 0 })
  await refresh()
}
async function renameConv(node: any) {
  const v = await ElMessageBox.prompt('对话名', '重命名', { inputValue: node.title }).catch(() => null)
  if (!v?.value) return
  await window.lk.convRename(node.id, v.value)
  await refresh()
}
async function deleteGroup(node: any) {
  try { await ElMessageBox.confirm('删除该目录？其下对话将移到根级。', '删除', { type: 'warning' }) } catch { return }
  await window.lk.groupDelete(node.id)
  expandedSet.value.delete(node.id); persistExpanded()
  await refresh()
}
async function deleteConv(node: any) {
  try { await ElMessageBox.confirm('删除该对话？', '删除', { type: 'warning' }) } catch { return }
  await chat.deleteConv(node.id)
}

async function refresh() {
  await chat.refreshGroups()
  // load ALL conversations regardless of group_id (refreshConvs(null) only loads root-level ones)
  chat.convs.value = await window.lk.convAll()
}

function onBarCommand(cmd: string) {
  if (cmd === 'newConv') chat.newConv(null, '新对话').then((c) => chat.selectConv(c.id))
  else if (cmd === 'newGroup') newSubGroupRoot()
  else if (cmd === 'expandAll') { expandedSet.value = new Set(allGroupIds(mergedTree.value)); persistExpanded() }
  else if (cmd === 'collapseAll') { expandedSet.value = new Set(); persistExpanded() }
  else if (cmd === 'refresh') refresh()
}
async function newSubGroupRoot() {
  const v = await ElMessageBox.prompt('目录名', '新建目录', { inputValue: '目录' }).catch(() => null)
  if (!v?.value) return
  const id = await window.lk.uuid()
  await window.lk.groupUpsert({ id, parent_id: null, title: v.value, sort: Date.now(), expanded: 1 })
  expandedSet.value.add(id); persistExpanded()
  await refresh()
}

provide('treeActions', { isExpanded, toggle, select, ctx, drop, groupAction })

onMounted(async () => {
  await chat.refreshGroups()
  chat.convs.value = await window.lk.convAll()
  const saved = await window.lk.getSetting('chatTreeExpanded')
  if (saved) {
    try { expandedSet.value = new Set(JSON.parse(saved)) }
    catch { expandedSet.value = new Set(allGroupIds(mergedTree.value)) }
  } else {
    expandedSet.value = new Set(allGroupIds(mergedTree.value))
    persistExpanded()
  }
})
</script>

<style scoped lang="scss">
.sidebar-ex {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-soft);
  overflow: hidden;
}
.explorer-bar {
  height: 35px;
  flex: 0 0 35px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px 0 16px;
}
.ex-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: #b8b8b8;
}
.ex-more {
  font-size: 16px;
  color: #9a9a9a;
  cursor: pointer;
  padding: 3px;
  border-radius: 4px;
  transition: background 0.12s ease, color 0.12s ease;
}
.ex-more:hover { background: var(--bg-hover, rgba(255, 255, 255, 0.08)); color: #fff; }
.ex-tree { flex: 1; overflow: auto; padding: 2px 0 8px; }
.ex-empty { color: #7d7d7d; font-size: 12px; padding: 16px; text-align: center; }
</style>