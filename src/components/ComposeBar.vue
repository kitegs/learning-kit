<template>
  <div class="composer">
    <el-input
      v-model="text"
      type="textarea"
      :rows="3"
      resize="none"
      placeholder="输入问题，Enter 发送 / Shift+Enter 换行"
      @keydown.enter.exact.prevent="send"
      @keydown.shift.enter="() => {}"
    />
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

const props = defineProps<{ streaming: boolean }>()
const emit = defineEmits<{
  (e: 'send', text: string): void
  (e: 'abort'): void
}>()
const text = ref('')

function send() {
  const t = text.value.trim()
  if (!t || props.streaming) return
  console.log('[ComposeBar] send:', t)
  try {
    console.log('[ComposeBar] about to emit')
    emit('send', t)
    console.log('[ComposeBar] emit done')
  } catch (e: any) { console.error('[ComposeBar] send error:', e) }
  console.log('[ComposeBar] clearing text')
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
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-dim);
}
.right { display: flex; gap: 8px; }
</style>