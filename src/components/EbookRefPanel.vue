<template>
  <div v-if="visible" class="ref-overlay" @click.self="$emit('close')">
    <div class="ref-panel">
      <div class="ref-header">
        <span>引用内容</span>
        <el-button size="small" text @click="$emit('close')">✕</el-button>
      </div>

      <div class="ref-body">
        <div class="ref-mode">
          <el-radio-group v-model="mode" size="small">
            <el-radio value="page">按页</el-radio>
            <el-radio value="chapter">按章节</el-radio>
          </el-radio-group>
        </div>

        <!-- Page mode -->
        <template v-if="mode === 'page'">
          <div class="row">
            <span class="label">起始页</span>
            <el-input-number v-model="pageFrom" :min="1" :max="totalPages" size="small" style="width:110px" />
          </div>
          <div class="row">
            <span class="label">结束页</span>
            <el-input-number v-model="pageTo" :min="pageFrom" :max="totalPages" size="small" style="width:110px" />
          </div>
        </template>

        <!-- Chapter mode -->
        <template v-if="mode === 'chapter'">
          <div class="chapter-list" v-if="items.length">
            <div
              v-for="(it, i) in items"
              :key="i"
              class="chap-item"
              :class="{ active: selectedChapter === i }"
              :style="{ paddingLeft: it.depth * 14 + 8 + 'px' }"
              @click="selectChapter(i)"
            >
              {{ it.title }}
            </div>
          </div>
          <el-empty v-else description="无目录" :image-size="50" />
          <div class="row" v-if="selectedChapter !== null">
            <span class="label">页范围</span>
            <span class="range">{{ pageFrom }} – {{ pageTo }}</span>
          </div>
        </template>

        <!-- Action -->
        <div class="row" style="margin-top:12px">
          <span class="label">操作</span>
          <el-select v-model="action" size="small" style="width:160px">
            <el-option value="analyze" label="AI 分析"></el-option>
            <el-option value="summary" label="AI 总结"></el-option>
            <el-option value="note" label="做笔记"></el-option>
            <el-option value="card" label="制作闪卡"></el-option>
          </el-select>
        </div>
      </div>

      <div class="ref-footer">
        <el-button size="small" @click="$emit('close')">取消</el-button>
        <el-button size="small" type="primary" @click="confirm" :disabled="pageFrom > pageTo">执行</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

export interface OutlineItem { title: string; dest?: any; depth: number; page?: number }

const props = defineProps<{
  visible: boolean
  items: OutlineItem[]
  totalPages: number
  currentPage: number
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', data: { startPage: number; endPage: number; action: string; chapterTitle?: string }): void
}>()

const mode = ref<'page' | 'chapter'>('page')
const pageFrom = ref(1)
const pageTo = ref(1)
const selectedChapter = ref<number | null>(null)
const action = ref('analyze')

watch(() => props.visible, (v) => {
  if (v) {
    mode.value = 'page'
    pageFrom.value = props.currentPage
    pageTo.value = Math.min(props.currentPage + 4, props.totalPages)
    selectedChapter.value = null
    action.value = 'analyze'
  }
})

function selectChapter(idx: number) {
  selectedChapter.value = idx
  const item = props.items[idx]
  if (item?.page) pageFrom.value = item.page
  // Find next chapter's page to determine end
  let endPage = props.totalPages
  for (let j = idx + 1; j < props.items.length; j++) {
    if (props.items[j]?.page) { endPage = props.items[j].page! - 1; break }
  }
  pageTo.value = Math.max(pageFrom.value, endPage)
}

function confirm() {
  const chapterTitle = selectedChapter.value !== null && props.items[selectedChapter.value] ? props.items[selectedChapter.value].title : undefined
  emit('confirm', { startPage: pageFrom.value, endPage: pageTo.value, action: action.value, chapterTitle })
}
</script>

<style scoped lang="scss">
.ref-overlay {
  position: fixed; inset: 0; z-index: 8000;
  background: rgba(0,0,0,0.3);
  display: flex; align-items: center; justify-content: center;
}
.ref-panel {
  width: 400px; max-width: 90vw;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow);
  display: flex; flex-direction: column;
  max-height: 80vh;
}
.ref-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; border-bottom: 1px solid var(--border);
  font-weight: 600; font-size: 14px;
}
.ref-body { flex: 1; overflow: auto; padding: 12px 14px; }
.ref-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 10px 14px; border-top: 1px solid var(--border);
}
.ref-mode { margin-bottom: 10px; }
.row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.label { flex: 0 0 60px; font-size: 12px; color: var(--text-dim); }
.range { font-size: 13px; font-weight: 600; }
.chapter-list { max-height: 200px; overflow: auto; border: 1px solid var(--border); border-radius: 4px; }
.chap-item {
  padding: 5px 8px; font-size: 12px; cursor: pointer; border-bottom: 1px solid var(--border);
  &:hover { background: var(--bg-hover, rgba(127,127,127,0.08)); }
  &.active { background: var(--accent); color: #fff; }
  &:last-child { border-bottom: none; }
}
</style>
