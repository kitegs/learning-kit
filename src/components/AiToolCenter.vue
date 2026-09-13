<template>
  <el-drawer :model-value="modelValue" title="AI 工具管理中心" size="420px" @update:model-value="emit('update:modelValue', $event)">
    <p class="intro">AI 只能提出操作建议；写入笔记、对话、图书和复习数据前，必须由你确认。</p>
    <div v-if="!proposals.length" class="empty"><strong>暂无待确认操作</strong><span>AI 提出的本地写入会先显示预览和影响范围，确认后才会执行。</span></div>
    <div v-else class="proposal-list">
      <label v-for="proposal in proposals" :key="proposal.operationId" class="proposal" :class="{ disabled: !selected.includes(proposal.operationId) }">
        <el-checkbox :model-value="selected.includes(proposal.operationId)" @update:model-value="toggle(proposal.operationId)" />
        <div><strong>{{ toolLabel(proposal.type) }}</strong><DiagramProposalPreview v-if="proposal.type === 'create_diagram'" :preview="proposal.preview" /><p>预览：{{ proposal.preview || '无预览摘要' }}</p><small>影响范围：{{ proposal.affected.join('、') || '待执行时确定' }}</small></div>
      </label>
    </div>
    <el-divider content-position="left">最近执行</el-divider>
    <div v-if="history.length" class="history-list">
      <div v-for="run in history.slice(0, 8)" :key="run.id" class="history-row">
        <div><strong>{{ toolLabel(run.action) }}</strong><p>{{ run.preview || '无预览摘要' }}</p><small>影响范围：{{ affectedSummary(run.affected_json) }}</small></div>
        <div class="history-actions"><span :class="`status ${run.status}`">{{ statusLabel(run.status) }}</span><el-button v-if="run.status === 'applied'" size="small" text @click="emit('undo', run.id)">撤销</el-button></div>
      </div>
    </div>
    <p v-else class="history-empty">确认后的 AI 写入会保留在这里，便于检查。</p>
    <template #footer><el-button :disabled="!selected.length" @click="rejectSelected">拒绝选中</el-button><el-button type="primary" :disabled="!selected.length" @click="apply">确认执行 {{ selected.length }} 项</el-button></template>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import DiagramProposalPreview from './DiagramProposalPreview.vue'
export type AiToolProposal = { id: string; operationId: string; type: string; preview: string; affected: string[]; status: string }
type ToolHistoryRow = { id: string; action: string; preview?: string | null; status: string; affected_json?: string | null }
const props = defineProps<{ modelValue: boolean; proposals: AiToolProposal[]; history: ToolHistoryRow[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void; (e: 'apply', operationIds: string[]): void; (e: 'reject', operationIds: string[]): void; (e: 'undo', operationId: string): void }>()
const selected = ref<string[]>([])
watch(() => props.proposals, (items) => { selected.value = items.map((item) => item.operationId) }, { immediate: true })
function toggle(id: string) { selected.value = selected.value.includes(id) ? selected.value.filter((value) => value !== id) : [...selected.value, id] }
function apply() { emit('apply', selected.value) }
function rejectSelected() { emit('reject', selected.value) }
function toolLabel(type: string) { return ({ create_knowledge_point: '创建知识点', create_diagram: '创建 Draw.io 图表', create_mindmap: '创建思维导图', create_plan: '创建学习计划', create_conversation: '创建对话', create_note: '创建笔记', add_bookmark: '添加电子书书签', create_flashcard: '创建闪卡', create_exercise_set: '创建习题集', create_flashcard_from_error: '从错题创建闪卡' } as Record<string, string>)[type] || `AI 操作：${type}` }
function statusLabel(status: string) { return ({ pending_confirmation: '待确认', applied: '已完成', failed: '失败', rejected: '已拒绝', undone: '已撤销' } as Record<string, string>)[status] || status }
function affectedSummary(raw?: string | null) { try { const items = JSON.parse(raw || '[]') as string[]; return items.join('、') || '无' } catch { return '无' } }
</script>

<style scoped lang="scss">
.proposal p { white-space:pre-wrap; max-height:280px; overflow:auto; }
.intro { margin:0 0 16px; padding:10px 12px; border-radius:9px; color:var(--text-dim); background:var(--bg-soft); font-size:12px; line-height:1.6; }.proposal-list { display:grid; gap:9px; }.proposal { display:flex; gap:10px; padding:12px; border:1px solid var(--border); border-radius:10px; cursor:pointer; background:var(--bg-elev); transition:.15s; }.proposal:hover { border-color:var(--accent); }.proposal.disabled { opacity:.48; }.proposal div { min-width:0; }.proposal strong { font-size:13px; }.proposal p { margin:5px 0; color:var(--text); font-size:12px; word-break:break-word; }.proposal small { color:var(--text-dim); font-size:11px; }.empty { display:grid; gap:8px; padding:26px 14px; color:var(--text-dim); text-align:center; }.empty span { font-size:12px; line-height:1.7; }.history-list { display:grid; gap:7px; }.history-row { display:flex; gap:9px; justify-content:space-between; padding:9px; border:1px solid var(--border); border-radius:8px; }.history-row div { min-width:0; }.history-row strong { font-size:12px; }.history-row p { margin:3px 0 0; color:var(--text-dim); font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:265px; }.status { flex:none; height:max-content; padding:2px 6px; border-radius:9px; background:var(--bg-soft); color:var(--text-dim); font-size:10px; }.status.applied { color:var(--success); background:color-mix(in srgb,var(--success) 12%,transparent); }.status.failed { color:var(--danger); background:color-mix(in srgb,var(--danger) 12%,transparent); }.history-empty { color:var(--text-dim); font-size:12px; }
</style>
