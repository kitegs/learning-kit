<template>
  <el-drawer :model-value="modelValue" title="AI 运行记录" size="min(620px, 95vw)" @update:model-value="emit('update:modelValue', $event)">
    <p class="intro">单次模型生成 → 工具预览 → 用户确认 → 执行。不会自动循环调用模型，也不会重放已成功的步骤。</p>
    <el-alert v-if="flow.error" :title="flow.error" type="error" :closable="false" />
    <el-tabs v-model="tab">
      <el-tab-pane label="执行流程" name="runs">
        <p v-if="!flow.runs.length" class="empty">暂无流程。到设置开启 Agent 执行流程后发送一条消息。</p>
        <article v-for="run in flow.runs" :key="run.id" class="run-card" data-agent-run>
          <header><strong>{{ statusLabel(run.status) }}</strong><span>{{ run.usedSteps }} / {{ run.maxSteps }} 步</span></header>
          <small>{{ new Date(run.startedAt).toLocaleString() }} · {{ run.requestId.slice(0, 8) }}</small>
          <p v-if="run.error" class="failure">{{ run.error }}</p>
          <ol>
            <li v-for="step in run.steps" :key="step.id" :data-step-status="step.status">
              <div class="step-title"><strong>{{ step.kind === 'model' ? '模型生成' : toolLabel(step.label) }}</strong><span>{{ statusLabel(step.status) }}</span></div>
              <small v-if="step.attempts > 1">已尝试 {{ step.attempts }} 次</small>
              <details v-if="step.preview"><summary>查看预览</summary><pre>{{ step.preview }}</pre></details>
              <p v-if="step.error" class="failure">{{ step.error }}</p>
              <div v-if="step.status === 'pending_confirmation'" class="actions">
                <el-button size="small" :disabled="flow.busy" @click="decide(run.id, step.id, 'reject')">拒绝</el-button>
                <el-button size="small" type="primary" :disabled="flow.busy" @click="decide(run.id, step.id, 'approve')">确认执行</el-button>
              </div>
              <el-button v-if="step.kind === 'tool' && step.status === 'failed'" size="small" :disabled="flow.busy || run.usedSteps >= run.maxSteps" @click="decide(run.id, step.id, 'retry')">重新预览（消耗 1 步）</el-button>
            </li>
          </ol>
          <p v-if="['failed','interrupted','cancelled'].includes(run.status)" class="hint">模型失败或中断请重新发送问题；工具失败只重试该步骤，且需再次确认。</p>
        </article>
      </el-tab-pane>
      <el-tab-pane label="请求诊断" name="diagnostics">
        <div class="diagnostic-header"><small>仅本地元数据 · 最近 200 条 · 不保存 Key 或对话正文</small><el-button text size="small" @click="clear">清空诊断</el-button></div>
        <p v-if="!flow.diagnostics.length" class="empty">暂无诊断。启用请求诊断后，真实请求结束会显示在这里。</p>
        <article v-for="row in flow.diagnostics" :key="row.id" class="run-card" data-ai-diagnostic>
          <header><strong>{{ row.provider }} · {{ row.model }}</strong><span>{{ statusLabel(row.status) }}</span></header>
          <small>{{ new Date(row.startedAt).toLocaleString() }} · {{ row.requestId.slice(0, 8) }}</small>
          <dl><div><dt>总耗时</dt><dd>{{ duration(row.durationMs) }}</dd></div><div><dt>首次内容</dt><dd>{{ row.firstContentMs === null ? '未收到内容' : duration(row.firstContentMs) }}</dd></div><div><dt>实际 tokens</dt><dd>{{ row.usage ? `${row.usage.total}（输入 ${row.usage.input} / 输出 ${row.usage.output}）` : '服务商未提供' }}</dd></div></dl>
          <p v-if="row.failureCode" class="failure">{{ failureLabel(row.failureCode) }}<template v-if="row.httpStatus"> · HTTP {{ row.httpStatus }}</template></p>
          <small v-if="!row.usage">缺失不是 0，也不代表没有费用；中途停止可能收不到最终用量。</small>
        </article>
      </el-tab-pane>
    </el-tabs>
  </el-drawer>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useAiWorkflowStore } from '../stores/ai-workflow'
import { toolLabel } from '../../electron/shared/tools'
defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void; (e: 'changed'): void }>()
const flow = useAiWorkflowStore()
const tab = ref('runs')
const duration = (ms: number) => `${(ms / 1000).toFixed(2)} 秒`
function statusLabel(value: string): string { return ({ model_running: '模型生成中', awaiting_tools: '准备工具预览', awaiting_confirmation: '等待确认', executing: '工具执行中', completed: '已完成', failed: '失败', cancelled: '已停止', interrupted: '已中断', running: '进行中', pending_confirmation: '等待确认', applied: '已执行', rejected: '已拒绝', undone: '已撤销' } as Record<string, string>)[value] || value }
function failureLabel(value: string): string { return ({ configuration: '配置错误', input: '输入或上下文校验失败', http: '服务商 HTTP 错误', stream: '流式响应错误或被截断', network: '连接失败', timeout: '超过五分钟已停止', cancelled: '用户停止或窗口关闭' } as Record<string, string>)[value] || value }
async function decide(id: string, stepId: string, decision: 'approve' | 'reject' | 'retry') { await flow.decide(id, stepId, decision); emit('changed') }
async function clear() {
  try { await ElMessageBox.confirm('清空全部本地请求诊断？不会删除对话或执行流程。', '清空诊断', { type: 'warning' }); await flow.clearDiagnostics() }
  catch (reason: unknown) { if (reason !== 'cancel' && reason !== 'close') flow.error = reason instanceof Error ? reason.message : '清空失败' }
}
</script>
<style scoped lang="scss">
.intro,.hint,.empty { color:var(--text-dim); font-size:12px; line-height:1.7; }.intro { background:var(--bg-soft); padding:12px; border-radius:10px; }.run-card { border:1px solid var(--border); border-radius:12px; padding:14px; margin:12px 0; background:var(--bg-elev); }.run-card header,.step-title,.diagnostic-header { display:flex; justify-content:space-between; gap:10px; align-items:center; }.run-card header span,.step-title span { color:var(--accent); font-size:12px; }.run-card small { color:var(--text-dim); font-size:11px; word-break:break-word; }.run-card ol { padding-left:20px; }.run-card li { padding:10px 0; border-bottom:1px solid var(--border); }.run-card li:last-child { border-bottom:0; }.step-title strong { font-size:13px; }.actions { margin-top:8px; }details { margin:8px 0; font-size:12px; }summary { cursor:pointer; color:var(--accent); }pre { white-space:pre-wrap; overflow:auto; max-height:240px; word-break:break-word; background:var(--bg-soft); padding:10px; border-radius:8px; }.failure { color:var(--danger); font-size:12px; }dl { display:grid; grid-template-columns:1fr 1fr; gap:10px; }dl div:last-child { grid-column:1 / -1; }dt { color:var(--text-dim); font-size:11px; }dd { margin:4px 0 0; font-size:13px; }
</style>
