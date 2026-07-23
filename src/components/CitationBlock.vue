<template>
  <div class="citation-block" :class="{ compact }">
    <div class="citation-head">
      <span class="citation-icon">📖</span>
      <span class="citation-book">{{ book }}</span>
      <span v-if="page != null" class="citation-page">· 第 {{ page }} 页</span>
      <span class="citation-spacer"></span>
      <el-button v-if="bookId" size="small" text type="warning" @click="goToBook" title="回到电子书">
        <el-icon><Reading /></el-icon>
      </el-button>
      <el-button v-if="bookId" size="small" text type="primary" @click="copyQuote" title="复制原文">
        <el-icon><CopyDocument /></el-icon>
      </el-button>
    </div>
    <blockquote v-if="quote" class="citation-quote">
      <p>{{ quote }}</p>
    </blockquote>
  </div>
</template>

<script setup lang="ts">
import { Reading, CopyDocument } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  book: string
  bookId?: string | null
  page?: number | null
  quote?: string | null
  compact?: boolean
}>()

const emit = defineEmits<{ (e: 'go-to-book', bookId: string): void }>()

function goToBook() {
  if (props.bookId) emit('go-to-book', props.bookId)
}

function copyQuote() {
  if (props.quote) {
    navigator.clipboard.writeText(props.quote)
    ElMessage.success('Content copied')
  }
}
</script>

<style scoped lang="scss">
.citation-block {
  border-left: 3px solid #d4b469;
  background: rgba(212, 180, 105, 0.06);
  border-radius: 0 6px 6px 0;
  padding: 8px 12px;
  margin: 6px 0 10px;
  font-size: 13px;
}
.citation-block.compact { padding: 4px 10px; margin: 4px 0 6px; font-size: 12px; }
.citation-head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-dim);
}
.citation-icon { font-size: 16px; }
.citation-book { font-weight: 600; color: #d4b469; }
.citation-page { font-size: 12px; color: var(--text-dim); }
.citation-spacer { flex: 1; }
.citation-quote {
  margin: 8px 0 0;
  padding: 6px 10px;
  background: rgba(0, 0, 0, 0.12);
  border-radius: 4px;
  color: var(--text-secondary, #b0b0b0);
  font-style: italic;
  border-left: none;
  P { margin: 0; }
}
</style>