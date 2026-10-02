<template>
  <el-drawer :model-value="modelValue" title="AI 工具管理中心" size="min(620px, 100vw)" @update:model-value="emit('update:modelValue', $event)">
    <div class="tool-center" data-tool-center>
      <div class="intro"><span class="intro-icon">✓</span><div><strong>先预览，再写入</strong><p>AI 只提交建议。外部内容不会自动执行，确认后才保存到本机。</p></div></div>
      <div class="tab-strip" role="tablist" aria-label="操作记录类别">
        <button role="tab" :aria-selected="tab === 'pending'" :class="{ active: tab === 'pending' }" @click="tab = 'pending'">待确认 <span>{{ center.snapshot.pending.total }}</span></button>
        <button role="tab" :aria-selected="tab === 'history'" :class="{ active: tab === 'history' }" @click="tab = 'history'">执行历史 <span>{{ center.snapshot.history.total }}</span></button>
      </div>
      <div class="filters">
        <el-select :model-value="center.query.source || ''" placeholder="全部来源" aria-label="操作来源" :disabled="center.busy" @update:model-value="setSource">
          <el-option label="全部来源" value="" /><el-option label="应用内 AI" value="internal-ai" /><el-option label="外部 MCP" value="mcp" /><el-option label="手动操作" value="renderer" />
        </el-select>
        <el-select v-if="tab === 'history'" :model-value="center.query.status || ''" placeholder="全部状态" aria-label="执行状态" :disabled="center.busy" @update:model-value="setStatus">
          <el-option label="全部状态" value="" /><el-option v-for="status in historyStatuses" :key="status" :label="toolStatusLabel(status)" :value="status" />
        </el-select>
        <el-button text :loading="center.loading" :disabled="center.busy" @click="center.refresh">刷新</el-button>
      </div>
      <el-alert v-if="center.loadError" :title="center.loadError + '，请点击刷新重试。'" type="error" :closable="false" show-icon />
      <el-alert v-if="center.actionError" :title="center.actionError" type="error" show-icon @close="center.actionError = ''" />
      <p v-if="center.notice" class="notice" role="status">{{ center.notice }}</p>
      <div class="list-heading"><span>{{ tab === 'pending' ? '请逐项检查内容与影响范围' : '写入记录始终保留，不受待确认数量影响' }}</span><small v-if="center.loading">正在更新…</small></div>
      <div v-if="!currentPage.items.length" class="empty">
        <span class="empty-symbol">{{ tab === 'pending' ? '✓' : '↶' }}</span>
        <strong>{{ center.loading ? '正在加载操作记录' : tab === 'pending' ? '暂无待确认操作' : '暂无匹配的历史记录' }}</strong>
        <span>{{ tab === 'pending' ? '收到新的 AI 提案后，会先在这里等待你的确认。' : '尝试切换来源或状态；执行后的记录可在这里查看和撤销。' }}</span>
      </div>
      <div v-else class="record-list" :aria-busy="center.loading">
        <article v-for="row in currentPage.items" :key="row.id" class="record" :class="{ selected: selected.includes(row.id) }" :data-operation-id="tab === 'pending' ? row.id : undefined" :data-history-id="tab === 'history' ? row.id : undefined">
          <header>
            <el-checkbox v-if="tab === 'pending'" :model-value="selected.includes(row.id)" :disabled="center.busy || center.loading" :aria-label="`选择${toolLabel(row.action)}：${summary(row.preview)}`" @update:model-value="toggle(row.id)" />
            <div class="record-title"><strong>{{ toolLabel(row.action) }}</strong><span class="source" :class="{ external: row.source === 'mcp' }">{{ sourceLabel(row.source) }}</span></div>
            <span v-if="tab === 'history'" class="status" :class="row.status">{{ toolStatusLabel(row.status) }}</span>
          </header>
          <p class="summary">{{ summary(row.preview) }}</p>
          <details :open="tab === 'pending' && selected.includes(row.id)">
            <summary>查看完整预览与影响范围</summary>
            <DiagramProposalPreview v-if="row.action === 'create_diagram'" :preview="row.preview" />
            <pre>{{ row.preview || '无预览摘要' }}</pre><small>影响范围：{{ row.affected.join('、') || '无' }}</small>
          </details>
          <p v-if="row.error" class="failure">{{ row.error }}</p>
          <footer><time>{{ formatTime(row.createdAt) }}</time><el-button v-if="tab === 'history' && row.status === 'applied'" size="small" :disabled="center.busy || center.loading" @click="undo(row)">撤销</el-button></footer>
        </article>
      </div>
      <div v-if="currentPage.total > currentPage.pageSize" class="pagination">
        <el-pagination :current-page="currentPage.page" :page-size="currentPage.pageSize" :total="currentPage.total" :disabled="center.busy || center.loading" layout="prev, pager, next" small @current-change="center.page(tab, $event)" />
        <small>共 {{ currentPage.total }} 项 · 第 {{ currentPage.page }} 页</small>
      </div>
    </div>
    <template #footer>
      <div v-if="tab === 'pending'" class="decision-bar"><span>已选择 {{ selected.length }} 项<small>只处理本页勾选的提案</small></span><div><el-button :disabled="!selected.length || center.busy || center.loading" @click="decide('reject')">拒绝选中</el-button><el-button type="primary" :loading="center.busy" :disabled="!selected.length || center.loading" @click="decide('approve')">确认执行 {{ selected.length }} 项</el-button></div></div>
      <div v-else class="history-hint">撤销前会检查后续修改与引用，不会强行删除已关联的资料。</div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import DiagramProposalPreview from './DiagramProposalPreview.vue'
import { useToolCenterStore } from '../stores/tool-center'
import { toolLabel, toolStatusLabel, type ToolSource, type ToolStatus, type ToolCenterRow } from '../../electron/shared/tools'
defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void; (e: 'changed'): void }>()
const center = useToolCenterStore(), tab = ref<'pending' | 'history'>('pending'), selected = ref<string[]>([])
const historyStatuses: Exclude<ToolStatus, 'pending_confirmation'>[] = ['applied', 'failed', 'undone', 'rejected']
const currentPage = computed(() => center.snapshot[tab.value])
// 不默认勾选任何来源，也不跨页执行隐藏提案；刷新仅保留当前可见且仍待确认的选择。
watch(() => center.snapshot.pending.items, items => { selected.value = selected.value.filter(id => items.some(row => row.id === id)) })
function toggle(id: string) { selected.value = selected.value.includes(id) ? selected.value.filter(value => value !== id) : [...selected.value, id] }
function setSource(value: ToolSource | '') { selected.value = []; void center.filter(value || undefined, center.query.status) }
function setStatus(value: Exclude<ToolStatus, 'pending_confirmation'> | '') { void center.filter(center.query.source, value || undefined) }
function sourceLabel(source: ToolSource): string { return { 'internal-ai': '应用内 AI', mcp: '外部 MCP', renderer: '手动操作' }[source] }
function summary(preview: string): string { return preview.split('\n')[0].slice(0, 160) || '无预览摘要' }
function formatTime(value: string): string { return new Date(value.replace(' ', 'T') + 'Z').toLocaleString('zh-CN', { hour12: false }) }
async function decide(decision: 'approve' | 'reject') { await center.decide([...selected.value], decision); emit('changed') }
async function undo(row: ToolCenterRow) {
  try { await ElMessageBox.confirm(`撤销「${summary(row.preview)}」？如果内容已修改或被图谱、链接引用，会保留数据并提示原因。`, '确认撤销', { type: 'warning', confirmButtonText: '确认撤销', cancelButtonText: '保留' }) }
  catch { return }
  await center.decide([row.id], 'undo'); emit('changed')
}
</script>

<style scoped lang="scss">
.tool-center { display:grid; gap:16px; min-width:0; }
:deep(.el-alert--error) { background:color-mix(in srgb,var(--danger) 10%,var(--bg-elev)); border:1px solid color-mix(in srgb,var(--danger) 25%,var(--border)); color:var(--danger); }
.intro { display:flex; gap:12px; align-items:center; padding:16px; border:1px solid color-mix(in srgb,var(--accent) 20%,var(--border)); border-radius:14px; background:color-mix(in srgb,var(--accent) 6%,var(--bg-elev)); }
.intro-icon { display:grid; place-items:center; flex:none; width:34px; height:34px; border-radius:10px; background:var(--accent); color:white; font-size:19px; }
.intro strong { font-size:14px; }.intro p { margin:4px 0 0; color:var(--text-dim); font-size:12px; line-height:1.7; }
.tab-strip { display:flex; gap:4px; padding:4px; background:var(--bg-soft); border-radius:12px; }
.tab-strip button { flex:1; padding:10px; border:0; border-radius:9px; background:transparent; color:var(--text-dim); cursor:pointer; font:inherit; font-size:13px; }.tab-strip button.active { background:var(--bg-elev); color:var(--accent); box-shadow:0 2px 6px #0000000a; }.tab-strip button span { margin-left:6px; font-size:11px; background:var(--bg-soft); border-radius:8px; padding:2px 6px; }.tab-strip button:focus-visible { outline:2px solid var(--accent); }
.filters { display:flex; gap:8px; align-items:center; }.filters .el-select { flex:1; min-width:0; }
.notice { margin:0; color:var(--success); font-size:12px; }.list-heading { display:flex; justify-content:space-between; gap:8px; font-size:12px; color:var(--text-dim); }
.record-list { display:grid; gap:12px; }.record { min-width:0; padding:16px; border:1px solid var(--border); border-radius:13px; background:var(--bg-elev); }.record.selected { border-color:var(--accent); background:color-mix(in srgb,var(--accent) 4%,var(--bg-elev)); }
.record header { display:flex; align-items:center; gap:10px; }.record-title { display:flex; flex:1; align-items:center; gap:8px; flex-wrap:wrap; min-width:0; }.record-title strong { font-size:13px; }.source,.status { flex:none; font-size:10px; background:var(--bg-soft); color:var(--text-dim); border-radius:7px; padding:3px 6px; }.source.external { color:var(--accent); background:color-mix(in srgb,var(--accent) 10%,transparent); }.status.applied { color:var(--success); }.status.failed { color:var(--danger); }
.summary { margin:9px 0; font-size:13px; line-height:1.6; overflow-wrap:anywhere; }.record details { font-size:12px; }summary { cursor:pointer; color:var(--accent); padding:3px 0; }pre { margin:10px 0; white-space:pre-wrap; overflow-wrap:anywhere; max-height:300px; overflow:auto; padding:12px; border-radius:9px; background:var(--bg-soft); color:var(--text); font-family:inherit; font-size:12px; line-height:1.7; }.record small { color:var(--text-dim); overflow-wrap:anywhere; }.record footer { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:12px; }time { color:var(--text-dim); font-size:11px; }.failure { color:var(--danger); font-size:12px; line-height:1.7; }
.empty { display:grid; gap:10px; padding:35px 20px; text-align:center; color:var(--text-dim); }.empty-symbol { font-size:28px; color:var(--accent); }.empty strong { font-size:14px; color:var(--text); }.empty span:last-child { font-size:12px; line-height:1.7; }
.pagination { display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:space-between; }.pagination small { font-size:11px; color:var(--text-dim); }
.decision-bar { display:flex; align-items:center; justify-content:space-between; gap:12px; }.decision-bar > span { font-size:13px; color:var(--text); }.decision-bar small { display:block; margin-top:3px; font-size:11px; color:var(--text-dim); }.history-hint { font-size:12px; line-height:1.6; color:var(--text-dim); }
@media (max-width:600px) { .decision-bar { align-items:flex-start; flex-direction:column; }.decision-bar > div { display:flex; width:100%; }.decision-bar .el-button { flex:1; }.record { padding:12px; } }
</style>
