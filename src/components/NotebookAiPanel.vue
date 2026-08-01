<template>
  <aside v-if="modelValue" class="ai-panel">
    <header><strong>笔记 AI</strong><span>{{ contextLabel }}</span><button @click="emit('update:modelValue', false)">×</button></header>
    <div class="quick"><button v-for="item in quickActions" :key="item.label" @click="ask(item.prompt)">{{ item.label }}</button></div>
    <div class="context">{{ context.slice(0, 280) || '当前页为空：AI 会在光标处追加内容。' }}</div>
    <el-input v-model="question" type="textarea" :rows="2" placeholder="继续追问、要求改写或生成内容…" @keydown.ctrl.enter.prevent="ask(question)" />
    <div class="send-row"><small>Ctrl + Enter 发送</small><el-button size="small" type="primary" :loading="loading" @click="ask(question)">发送</el-button></div>
    <div v-if="answer" class="answer markdown-body" v-html="answerHtml"></div>
    <div v-if="answer" class="apply"><el-button size="small" @click="emit('insert', answer)">插入光标处</el-button><el-button size="small" type="primary" @click="emit('append', answer)">追加到当前页</el-button></div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useSettingsStore } from '../stores/chat'
import { renderMarkdown } from '../helpers/markdown'

const props = defineProps<{ modelValue: boolean; context: string; contextLabel: string; suggestedPrompt?: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void; (e: 'insert', text: string): void; (e: 'append', text: string): void }>()
const settings = useSettingsStore()
const question = ref('')
const answer = ref('')
const loading = ref(false)
const answerHtml = computed(() => renderMarkdown(answer.value))
const quickActions = [
  { label: '解释', prompt: '请用通俗中文解释这段笔记。' },
  { label: '润色', prompt: '请润色这段笔记，保持原意，直接给出修改后的内容。' },
  { label: '要点', prompt: '请整理为简洁的重点列表。' },
  { label: '复习题', prompt: '请生成 3 道用于复习的问答题。' },
  { label: '补充', prompt: '请找出遗漏并补充必要内容。' },
]
watch(() => [props.modelValue, props.suggestedPrompt] as const, ([open, suggested]) => { if (open && suggested) question.value = suggested })
async function ask(prompt: string) {
  if (!prompt.trim()) { ElMessage.warning('请输入想让 AI 完成的事情'); return }
  if (!settings.currentApiKey()) { ElMessage.warning('请先在设置中填写 API Key'); return }
  loading.value = true; answer.value = ''
  const requestId = await window.lk.uuid()
  const off = window.lk.onAiChunk(requestId, (payload: { delta?: string; error?: string; done?: boolean }) => {
    if (payload.delta) answer.value += payload.delta
    if (payload.error) answer.value += `\n\n> ${payload.error}`
    if (payload.done) { loading.value = false; off() }
  })
  try {
    await window.lk.aiChatStart({ requestId, provider: settings.provider, model: settings.model, apiKey: settings.currentApiKey(), temperature: settings.temperature, baseUrl: settings.provider === 'custom' ? settings.customBaseUrl : undefined, messages: [{ role: 'user', content: `${prompt}\n\n--- 笔记上下文 ---\n${props.context || '（空白页）'}` }] })
    question.value = ''
  } catch (err: unknown) { loading.value = false; off(); ElMessage.error(err instanceof Error ? err.message : 'AI 请求失败') }
}
</script>

<style scoped lang="scss">
.ai-panel { position:absolute; z-index:30; right:18px; bottom:18px; width:min(360px, calc(100% - 36px)); max-height:calc(100% - 36px); display:flex; flex-direction:column; gap:9px; padding:12px; border:1px solid color-mix(in srgb,var(--accent) 42%,var(--border)); border-radius:14px; color:var(--text); background:color-mix(in srgb,var(--bg-elev) 94%,transparent); box-shadow:0 18px 46px rgba(0,0,0,.26); backdrop-filter:blur(16px); }.ai-panel header { display:flex; align-items:center; gap:8px; }.ai-panel header span { flex:1; color:var(--text-dim); font-size:11px; }.ai-panel header button { border:0; background:transparent; color:var(--text-dim); cursor:pointer; font-size:20px; }.quick { display:flex; flex-wrap:wrap; gap:5px; }.quick button { border:1px solid var(--border); border-radius:12px; background:var(--bg-soft); color:var(--text); padding:3px 8px; cursor:pointer; font-size:11px; }.context { max-height:74px; overflow:auto; padding:7px; border-radius:8px; color:var(--text-dim); background:var(--bg-soft); font-size:12px; white-space:pre-wrap; }.send-row,.apply { display:flex; justify-content:space-between; align-items:center; gap:8px; }.send-row small { color:var(--text-dim); }.answer { max-height:200px; overflow:auto; padding:8px; border-radius:8px; background:var(--bg-soft); font-size:13px; }
</style>
