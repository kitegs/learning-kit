<template>
  <div class="chat-scroll" ref="scroller">
    <div class="msg-list" v-if="messages.length">
      <MessageItem
        v-for="m in messages"
        :key="m.id"
        :msg="m"
        @edit="(content) => onEdit(m, content)"
        @set-note="(note) => onNote(m, note)"
        @delete="onDelete(m)"
      />
    </div>
    <div v-else class="empty">
      <p>还没有对话。</p>
      <p class="hint">在下方输入框发送消息开始学习。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useChatStore, Msg } from '../stores/chat'
import MessageItem from '../components/MessageItem.vue'

const chat = useChatStore()
const messages = computed(() => chat.activeMessages)
const scroller = ref<HTMLElement | null>(null)

function scrollToBottom() {
  nextTick(() => {
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
  })
}

watch(
  () => messages.value.map((m: Msg) => m.id + ':' + m.content.length).join('|'),
  scrollToBottom
)

watch(() => chat.currentConvId, scrollToBottom)

async function onEdit(m: Msg, content: string) {
  m.content = content
  await window.lk.msgPatch(m.id, { content })
}
async function onNote(m: Msg, note: string) {
  m.note = note
  await window.lk.msgPatch(m.id, { note })
}
async function onDelete(m: Msg) {
  await chat.deleteMessage(m.id)
}
</script>

<style scoped lang="scss">
.chat-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px 0;
  background: var(--bg);
}
.msg-list {
  max-width: 920px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.empty {
  text-align: center;
  margin-top: 120px;
  color: var(--text-dim);
  .hint { font-size: 13px; }
}
</style>