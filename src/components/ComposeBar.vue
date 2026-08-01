<template>
  <div class="composer">
    <div v-if="citation" class="citation-preview">
      <div class="citation-body">
        <span class="citation-label">📖 {{ citation.bookTitle }} · 第 {{ citation.page }} 页</span>
        <span class="citation-quote">"{{ citation.quote.slice(0, 100) }}{{ citation.quote.length > 100 ? '...' : '' }}"</span>
      </div>
      <el-button size="small" text class="citation-close" @click="$emit('dismiss-citation')">✕</el-button>
    </div>
    <el-input
      v-model="text"
      type="textarea"
      :rows="citation ? 2 : 3"
      resize="none"
      placeholder="输入问题，Enter 发送 / Shift+Enter 换行"
      @keydown.enter.exact.prevent="send"
      @keydown.shift.enter="() => {}"
    />
    <div class="utility-bar">
      <el-tooltip content="AI 工具管理中心：预览并确认 AI 的数据操作"><el-button text @click="$emit('open-tools')">🪄 工具中心</el-button></el-tooltip>
      <el-tooltip content="总结当前对话"><el-button text @click="$emit('quick', 'summary')">☷ 总结</el-button></el-tooltip>
      <el-tooltip content="生成下一步学习计划"><el-button text @click="$emit('quick', 'study')">💡 学习计划</el-button></el-tooltip>
      <el-tooltip content="从当前对话生成闪卡"><el-button text @click="$emit('quick', 'cards')">▣ 闪卡</el-button></el-tooltip>
      <span class="utility-tip">AI 操作均需确认</span>
    </div>
    <div class="bar">
      <div class="hint">
        <el-tooltip content="粘贴的内容会作为一条用户消息发送" placement="top">
          <span>支持粘贴笔记 / 代码</span>
        </el-tooltip>
      </div>
      <div class="right">
        <el-button v-if="streaming" type="danger" @click="$emit('abort')">停止</el-button>
        <el-button v-else type="primary" :disabled="!text.trim()" @click="send">发送</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

export interface CitationData { bookTitle: string; bookId: string; page: number; quote: string }

const props = defineProps<{ streaming: boolean; citation?: CitationData | null }>()
const emit = defineEmits<{
  (e: 'send', text: string): void
  (e: 'abort'): void
  (e: 'dismiss-citation'): void
  (e: 'open-tools'): void
  (e: 'quick', action: 'summary' | 'study' | 'cards'): void
}>()
const text = ref('')

function send() {
  const t = text.value.trim()
  if (!t || props.streaming) return
  console.log('[ComposeBar] send:', t)
  try {
    emit('send', t)
  } catch (e: any) { console.error('[ComposeBar] send error:', e) }
  text.value = ''
}
</script>

<style scoped lang="scss">
.composer {
  flex: 0 0 auto;
  border-top: 1px solid var(--border);
  background: var(--bg-soft);
  padding: 10px 24px 14px;
  max-width: 920px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}
.citation-preview {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  margin-bottom: 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
}
.citation-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.citation-label { color: var(--accent); font-weight: 600; }
.citation-quote { color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.citation-close { flex: 0 0 auto; font-size: 14px; }
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-dim);
}
.utility-bar { display:flex; align-items:center; gap:3px; margin-top:6px; padding:4px 2px; border-bottom:1px dashed var(--border); }.utility-bar :deep(.el-button) { padding:3px 7px; color:var(--text-dim); }.utility-bar :deep(.el-button:hover) { color:var(--accent); background:var(--accent-dim); }.utility-tip { margin-left:auto; color:var(--text-dim); font-size:11px; }
.right { display: flex; gap: 8px; }
</style>
