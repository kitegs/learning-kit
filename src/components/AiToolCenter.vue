<template>
  <el-drawer :model-value="modelValue" title="AI 工具管理中心" size="420px" @update:model-value="emit('update:modelValue', $event)">
    <p class="intro">AI 只能提出操作建议；写入笔记、对话、图书和复习数据前，必须由你确认。</p>
    <div v-if="!proposals.length" class="empty"><strong>暂无待确认操作</strong><span>对话中的 AI 可提出：笔记、闪卡、思维导图、计划、新对话或电子书书签。</span></div>
    <div v-else class="proposal-list">
      <label v-for="proposal in proposals" :key="proposal.id" class="proposal" :class="{ disabled: !selected.includes(proposal.id) }">
        <el-checkbox :model-value="selected.includes(proposal.id)" @update:model-value="toggle(proposal.id)" />
        <div><strong>{{ toolLabel(proposal.type) }}</strong><p>{{ summary(proposal) }}</p><small>将写入本地学习数据</small></div>
      </label>
    </div>
    <template #footer><el-button @click="rejectAll">全部忽略</el-button><el-button type="primary" :disabled="!selected.length" @click="apply">确认执行 {{ selected.length }} 项</el-button></template>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
export type AiToolProposal = { id: string; type: string; params: string[]; rawBlock: string }
const props = defineProps<{ modelValue: boolean; proposals: AiToolProposal[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void; (e: 'apply', proposals: AiToolProposal[]): void; (e: 'reject'): void }>()
const selected = ref<string[]>([])
watch(() => props.proposals, (items) => { selected.value = items.map((item) => item.id) }, { immediate: true })
function toggle(id: string) { selected.value = selected.value.includes(id) ? selected.value.filter((value) => value !== id) : [...selected.value, id] }
function apply() { emit('apply', props.proposals.filter((item) => selected.value.includes(item.id))) }
function rejectAll() { emit('reject') }
function toolLabel(type: string) { return ({ note: '创建笔记', card: '创建闪卡', mindmap: '创建思维导图', drawio: '创建 Draw.io 图表', plan: '保存学习计划', summary: '保存摘要笔记', kp: '保存知识点', conversation: '新建对话', bookmark: '添加电子书书签' } as Record<string, string>)[type] || `AI 操作：${type}` }
function summary(proposal: AiToolProposal) { const p = proposal.params; if (proposal.type === 'conversation') return p[1] || '新建一个对话'; if (proposal.type === 'bookmark') return `第 ${p[1] || '?'} 页 · ${p[2] || '未命名书签'}`; return (p[0] || p.join(' · ') || 'AI 提出的操作').replace(/\s+/g, ' ').slice(0, 110) }
</script>

<style scoped lang="scss">
.intro { margin:0 0 16px; padding:10px 12px; border-radius:9px; color:var(--text-dim); background:var(--bg-soft); font-size:12px; line-height:1.6; }.proposal-list { display:grid; gap:9px; }.proposal { display:flex; gap:10px; padding:12px; border:1px solid var(--border); border-radius:10px; cursor:pointer; background:var(--bg-elev); transition:.15s; }.proposal:hover { border-color:var(--accent); }.proposal.disabled { opacity:.48; }.proposal div { min-width:0; }.proposal strong { font-size:13px; }.proposal p { margin:5px 0; color:var(--text); font-size:12px; word-break:break-word; }.proposal small { color:var(--text-dim); font-size:11px; }.empty { display:grid; gap:8px; padding:26px 14px; color:var(--text-dim); text-align:center; }.empty span { font-size:12px; line-height:1.7; }
</style>
