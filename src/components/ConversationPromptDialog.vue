<template>
  <el-dialog :model-value="modelValue" title="对话 Prompt" width="min(700px, calc(100vw - 32px))" :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving" @update:model-value="emit('update:modelValue', $event)">
    <p class="intro">当前对话：<strong>{{ title || '未命名对话' }}</strong>。设置仅影响这个对话之后的回答，不修改已有内容。</p>
    <el-alert v-if="loadError" :title="loadError + '；可重新填写并保存以修复。'" type="warning" :closable="false" />
    <el-radio-group v-model="draft.mode" :disabled="loading || saving || busy" class="modes">
      <el-radio-button value="inherit">继承全局</el-radio-button>
      <el-radio-button value="custom">本对话专属</el-radio-button>
      <el-radio-button value="none">不追加自定义</el-radio-button>
    </el-radio-group>
    <p v-if="draft.mode === 'inherit'" class="hint">跟随“设置 → 回答偏好”。全局偏好变化后，本对话也会跟随。</p>
    <p v-else-if="draft.mode === 'none'" class="hint">仅使用内置规则，不追加全局或本对话的自定义指令。</p>
    <template v-else>
      <div class="templates"><span>填入场景模板：</span><el-button v-for="item in templates" :key="item.title" size="small" :disabled="saving || loading || busy" @click="fillTemplate(item.text)">{{ item.title }}</el-button></div>
      <div data-testid="conversation-prompt-input"><el-input v-model="draft.text" type="textarea" :rows="9" maxlength="20000" show-word-limit :disabled="loading || saving || busy" placeholder="例如：你是我的编程导师。先分析我的思路，再给提示；除非我要求，否则不要直接给完整答案。" /></div>
    </template>
    <p class="hint">专属 Prompt 替代全局自定义部分，内置安全规则和工具确认规则始终保留。更改 Prompt 不会清空旧对话上下文。</p>
    <template #footer><el-button :disabled="saving" @click="emit('update:modelValue', false)">取消</el-button><el-button type="primary" :loading="saving" :disabled="loading || busy || !conversationId" @click="save">保存到本对话</el-button></template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useChatStore } from '../stores/chat'
import type { ConversationPrompt } from '../../electron/shared/conversation-prompt'
const props = defineProps<{ modelValue: boolean; conversationId: string | null; title: string; busy: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void; (e: 'saved'): void }>()
const chat = useChatStore()
const draft = ref<ConversationPrompt>({ mode: 'inherit', text: '' })
const loading = ref(false), saving = ref(false), loadError = ref('')
let epoch = 0
const templates = [
  { title: '编程导师', text: '你是我的编程导师。先澄清目标和约束，再分析思路；优先给提示和最小示例，解释取舍。未经要求不要直接给完整答案。' },
  { title: '阅读理解', text: '帮助我理解阅读材料：先概括核心论点，再解释关键概念，最后提出三个检验理解的问题。区分原文信息和你的推断；资料不足时明确说明。' },
  { title: '英语陪练', text: '作为英语对话伙伴，用适合我的难度交流。先自然回应，再简要纠正最重要的一两处表达，并给一个更地道的例句。每次只问一个问题。' },
  { title: '写作润色', text: '帮助我润色文字，保留原意和个人语气，不新增未经提供的事实。先给修改版，再简要说明主要修改及原因。' }
]
async function fillTemplate(text: string) {
  const ticket = epoch
  if (draft.value.text.trim()) {
    try { await ElMessageBox.confirm('模板会替换当前草稿，尚未保存到对话。继续吗？', '填入模板', { confirmButtonText: '替换草稿', cancelButtonText: '保留' }) } catch { return }
  }
  if (ticket === epoch && props.modelValue) draft.value.text = text
}
watch(() => props.modelValue, async open => {
  const ticket = ++epoch
  if (!open || !props.conversationId) return
  const id = props.conversationId
  loading.value = true; loadError.value = ''; draft.value = { mode: 'inherit', text: '' }
  try { const config = await chat.loadConversationPrompt(id); if (ticket === epoch) draft.value = config }
  catch (error: unknown) { if (ticket === epoch) loadError.value = error instanceof Error ? error.message : '读取失败' }
  finally { if (ticket === epoch) loading.value = false }
})
watch(() => props.conversationId, () => { ++epoch; emit('update:modelValue', false) })
async function save() {
  if (!props.conversationId || loading.value || saving.value || props.busy) return
  const id = props.conversationId
  saving.value = true
  try {
    await chat.saveConversationPrompt(id, { ...draft.value })
    ElMessage.success('本对话 Prompt 已保存')
    emit('saved'); emit('update:modelValue', false)
  } catch (error: unknown) { ElMessage.error(error instanceof Error ? error.message : '保存失败') }
  finally { saving.value = false }
}
</script>

<style scoped lang="scss">
.intro { margin:0 0 16px; line-height:1.7; color:var(--text-secondary); }
.modes { margin:12px 0; }
.hint { font-size:12px; line-height:1.7; color:var(--text-dim); }
.templates { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:8px 0 14px; }
.templates span { font-size:12px; color:var(--text-dim); }
.templates :deep(.el-button) { margin-left:0; }
</style>
