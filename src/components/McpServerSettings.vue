<template>
  <div class="mcp-settings" data-mcp-settings>
    <el-alert title="外部 AI 只提交导入提案；你在工具中心预览并确认后，才会保存到本机。" type="info" :closable="false" />
    <div class="service"><div><strong>本机 MCP 服务</strong><p>{{ mcp.status.running ? '运行中 · 标准 stdio 桥接' : '未运行' }}</p></div><el-switch :model-value="mcp.status.enabled" :disabled="mcp.busy" aria-label="本机 MCP 服务" @update:model-value="mcp.configure(Boolean($event))" /></div>
    <p>待确认导入：{{ mcp.status.pending }} 项。支持新建笔记和知识点，不开放删除、覆盖或自动确认。</p>
    <div class="actions"><el-button :disabled="!mcp.status.running || mcp.busy" @click="copy">复制客户端配置</el-button><el-button :disabled="mcp.busy" @click="rotate">轮换访问凭据</el-button><el-button :disabled="mcp.busy" @click="mcp.refresh">刷新状态</el-button></div>
    <p class="muted">这些操作立即生效，不依赖底部“保存”。关闭不会删除待确认提案。应用需保持运行，外部客户端需 Node.js 20+；首次开发使用先运行 npm run build:mcp。</p>
    <p class="muted">配置包含访问密钥，只粘贴到你信任的 MCP 客户端，勿公开或提交 Git。轮换后需重新复制配置并重启外部连接。本机桥接不消耗模型 Token。</p>
    <el-alert v-if="mcp.error || mcp.status.error" :title="mcp.error || mcp.status.error || ''" type="error" :closable="false" />
  </div>
</template>
<script setup lang="ts">
import { onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useMcpStore } from '../stores/mcp'
const mcp = useMcpStore()
onMounted(() => mcp.refresh().catch(() => { mcp.error = '无法读取 MCP 状态' }))
async function copy() { if (await mcp.copyConfig()) ElMessage.success('配置已复制，请粘贴到外部 MCP 客户端；请勿公开') }
async function rotate() {
  try { await ElMessageBox.confirm('旧客户端配置将立即失效，确定轮换访问凭据？', '轮换 MCP 凭据', { type: 'warning', confirmButtonText: '轮换', cancelButtonText: '取消' }) }
  catch { return }
  await mcp.configure(mcp.status.enabled, true)
}
</script>
<style scoped lang="scss">
.mcp-settings { display:grid; gap:14px; font-size:13px; line-height:1.7; min-width:0; }
:deep(.el-alert) { background:var(--bg-soft); color:var(--text); }
:deep(.el-alert__title) { color:var(--text); }
.service { display:flex; align-items:center; justify-content:space-between; border:1px solid var(--border); border-radius:12px; padding:18px; background:var(--bg-elev); }
p { margin:0; } .service p,.muted { color:var(--text-dim); font-size:12px; } .actions { display:flex; flex-wrap:wrap; gap:8px; }
</style>
