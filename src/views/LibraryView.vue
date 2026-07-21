<template>
  <div class="library">
    <div class="lib-head">
      <el-button type="primary" @click="importBooks">+ 导入电子书</el-button>
      <span class="hint" v-if="items.length">共 {{ items.length }} 本</span>
    </div>

    <div v-if="!items.length" class="empty">
      <el-icon class="empty-icon"><Reading /></el-icon>
      <p>还没有导入电子书。</p>
      <p class="muted">支持 PDF / EPUB。</p>
    </div>

    <div v-else class="grid">
      <div v-for="b in items" :key="b.id" class="card" @click="$emit('openBook', b.id)" @contextmenu="(e: MouseEvent) => onCtx(e, b)">
        <div class="cover" :class="b.kind">
          <el-icon><Document /></el-icon>
          <span class="ext">{{ b.kind.toUpperCase() }}</span>
        </div>
        <div class="meta">
          <div class="title" :title="b.title">{{ b.title }}</div>
          <div class="sub" v-if="b.author">{{ b.author }}</div>
          <div class="sub" v-if="b.total_pages">{{ b.total_pages }} 页 · 上次第 {{ b.last_page }} 页</div>
          <div class="actions" @click.stop>
            <el-button text size="small" @click="doDel(b.id)">删除</el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { useContextMenu } from '../stores/context-menu'

const emit = defineEmits<{ (e: 'openBook', id: string): void }>()
const items = ref<any[]>([])
const menu = useContextMenu()

async function refresh() { items.value = await window.lk.bookList() }

async function importBooks() {
  const ids = await window.lk.bookImport()
  if (ids && ids.length) {
    ElMessage.success(`已导入 ${ids.length} 本`)
    refresh()
  }
}

function onCtx(e: MouseEvent, b: any) {
  e.preventDefault()
  menu.open(e, [
    { label: '打开', icon: 'Document' as const, action: () => emit('openBook', b.id) },
    { label: '重命名', icon: 'Edit' as const, action: () => renameBook(b) },
    { separator: true },
    { label: '删除', icon: 'Delete' as const, danger: true, action: () => doDel(b.id) },
  ])
}

async function renameBook(b: any) {
  const v = await ElMessageBox.prompt('新书名', '重命名', { inputValue: b.title })
  if (!v.value) return
  await window.lk.bookUpdate(b.id, { title: v.value })
  refresh()
}

async function doDel(id: string) {
  await ElMessageBox.confirm('确认删除这本书及其所有划线与书签？', '删除', { type: 'warning' })
  await window.lk.bookDelete(id)
  refresh()
  ElMessage.success('已删除')
}

onMounted(refresh)
</script>

<style scoped lang="scss">
.library {
  flex: 1;
  overflow: auto;
  padding: 24px 32px;
  background: var(--bg);
}
.lib-head {
  display: flex; gap: 12px; align-items: center;
  margin-bottom: 18px;
  .hint { color: var(--text-dim); font-size: 13px; }
}
.empty {
  text-align: center;
  margin-top: 120px;
  color: var(--text-dim);
  .empty-icon { font-size: 56px; }
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 18px;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 6px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  &:hover { background: var(--bg-soft); }
}
.cover {
  height: 200px;
  background: linear-gradient(135deg, #3a4256, #1e2a3a);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #b9c3d3;
  .el-icon { font-size: 40px; }
  .ext { font-size: 12px; margin-top: 6px; letter-spacing: 1px; }
  &.epub { background: linear-gradient(135deg, #4a3a56, #2a1e3a); }
}
.meta { padding: 0 4px; }
.title { font-size: 13px; font-weight: 600; line-height: 1.3; height: 34px; overflow: hidden; }
.sub { font-size: 12px; color: var(--text-dim); margin-top: 2px; }
.actions { margin-top: 4px; opacity: 0.6; }
.card:hover .actions { opacity: 1; }
.muted { font-size: 12px; }
</style>