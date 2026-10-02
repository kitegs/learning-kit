<template>
  <section class="graph-root" data-testid="knowledge-graph">
    <header class="graph-header">
      <div><span class="eyebrow">连接 · 理解 · 回溯</span><h2>知识图谱 <small>{{ graph.data.nodes.length }} 个知识点 · {{ graph.data.edges.length }} 条关系</small></h2><p>把知识连起来，每条 AI 提取关系都保留原文证据。关系需要你判断，不代表事实认证。</p></div>
      <div class="actions"><el-button @click="run(refresh)">刷新</el-button><el-button @click="editNode()">新建知识点</el-button><el-button @click="editEdge()" :disabled="graph.data.nodes.length < 2">添加关系</el-button><el-button type="primary" @click="extractOpen = true">从笔记提取</el-button></div>
    </header>
    <el-alert v-if="failure" :title="failure" type="error" show-icon @close="failure = ''" />
    <div class="graph-tools">
      <el-input v-model="query" placeholder="搜索知识点与描述" clearable aria-label="搜索图谱" />
      <el-select v-model="relationFilter" placeholder="所有关系" aria-label="关系筛选"><el-option label="所有关系" value="" /><el-option v-for="(label, key) in graphRelations" :key="key" :label="label" :value="key" /></el-select>
      <el-button @click="zoom = Math.max(0.6, zoom - 0.2)" aria-label="缩小图谱">−</el-button><span>{{ Math.round(zoom * 100) }}%</span><el-button @click="zoom = Math.min(2.4, zoom + 0.2)" aria-label="放大图谱">＋</el-button><el-button @click="zoom = 1; query = ''; relationFilter = ''">重置视图</el-button>
    </div>
    <div class="graph-body">
      <div class="canvas-scroll">
        <div v-if="!visibleNodes.length" class="empty"><h3>{{ graph.data.nodes.length ? '没有匹配知识点' : '从一个知识点开始' }}</h3><p>手动创建知识点，或选一篇笔记让 AI 提取候选关系。</p><el-button @click="editNode()">新建知识点</el-button></div>
        <svg v-else :style="{ width: `${zoom * 100}%`, height: 'auto', display: 'block' }" viewBox="0 0 1000 700" role="img" aria-label="知识图谱关系图">
          <defs><marker id="kg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
          <g v-for="edge in visibleEdges" :key="edge.id" class="graph-edge" :class="{ connected: selectedId === edge.from_id || selectedId === edge.to_id }">
            <line :x1="position(edge.from_id).x" :y1="position(edge.from_id).y" :x2="edgeEnd(edge).x" :y2="edgeEnd(edge).y" marker-end="url(#kg-arrow)" />
            <text :x="(position(edge.from_id).x + position(edge.to_id).x) / 2" :y="(position(edge.from_id).y + position(edge.to_id).y) / 2 - 8">{{ graphRelations[edge.relation] }}</text>
          </g>
          <g v-for="node in visibleNodes" :key="node.id" class="graph-node" :class="{ selected: selectedId === node.id }" :transform="`translate(${position(node.id).x},${position(node.id).y})`" tabindex="0" role="button" :aria-label="node.title" @click="selectedId = node.id" @keydown.enter="selectedId = node.id" @keydown.space.prevent="selectedId = node.id">
            <circle r="34" /><text y="5">{{ node.title.slice(0, 5) }}</text><text class="node-caption" y="53">{{ node.title.length > 16 ? node.title.slice(0, 16) + '…' : node.title }}</text><title>{{ node.title }}</title>
          </g>
        </svg>
        <p class="canvas-hint">箭头表示关系方向 · 滚动查看放大区域 · 当前展示 {{ visibleNodes.length }} 个节点（最多 60 个，可搜索缩小范围）</p>
      </div>
      <aside class="graph-detail">
        <template v-if="selected">
          <span class="eyebrow">知识点详情</span><h3>{{ selected.title }}</h3><p class="description">{{ selected.description || '暂无描述' }}</p><el-button size="small" @click="editNode(selected)">编辑知识点</el-button>
          <h4>来源笔记</h4><p v-if="!selectedSources.length" class="muted">暂无有效来源关联；编辑知识点时可添加来源。</p>
          <div v-for="source in selectedSources" :key="source.note_id" class="source-card"><button class="source-link" @click="openNote(source.note_id)">{{ source.title }}</button><small v-if="source.stale" class="warning">原文已变更，暂不用于检索；请重新提取或关联。</small><blockquote>{{ source.evidence }}</blockquote></div>
          <h4>关联关系</h4><p v-if="!selectedEdges.length" class="muted">还没有关联关系</p>
          <div v-for="edge in selectedEdges" :key="edge.id" class="source-card"><p>{{ titleFor(edge.from_id) }} → {{ graphRelations[edge.relation] }} → {{ titleFor(edge.to_id) }}</p><small>{{ edge.note_id ? '来自笔记提取 / 人工关联' : '人工关系 · 无原文证据' }}</small><blockquote v-if="edge.evidence">{{ edge.evidence }}</blockquote><button v-if="edge.note_id" class="source-link" @click="openNote(edge.note_id)">打开来源</button><div><el-button size="small" @click="editEdge(edge)">编辑</el-button><el-button size="small" type="danger" plain @click="remove(edge)">删除关系</el-button></div></div>
        </template>
        <div v-else class="empty"><h3>选择一个知识点</h3><p>查看描述、原文来源和关系方向。</p></div>
      </aside>
    </div>
    <el-dialog v-model="nodeOpen" title="知识点与来源" width="min(600px, 95vw)" :close-on-click-modal="false" :show-close="!working">
      <el-form label-position="top"><el-form-item label="标题"><el-input v-model="nodeDraft.title" maxlength="120" data-testid="graph-node-title" /></el-form-item><el-form-item label="描述"><el-input v-model="nodeDraft.description" type="textarea" :rows="4" maxlength="2000" /></el-form-item><el-form-item label="添加/更新来源（可选，不移除已有来源）"><el-select v-model="nodeDraft.noteId" clearable filterable><el-option v-for="note in graph.data.notes" :key="note.id" :label="note.title" :value="note.id" /></el-select></el-form-item><el-form-item label="从来源笔记复制一段连续原文"><el-input v-model="nodeDraft.evidence" type="textarea" :rows="2" maxlength="500" /></el-form-item></el-form>
      <template #footer><el-button :disabled="working" @click="nodeOpen = false">取消</el-button><el-button type="primary" :loading="working" @click="run(saveNode)">保存节点</el-button></template>
    </el-dialog>
    <el-dialog v-model="edgeOpen" title="编辑有向关系" width="min(600px, 95vw)" :close-on-click-modal="false" :show-close="!working">
      <el-form label-position="top"><el-form-item label="起点"><el-select v-model="edgeDraft.from" filterable><el-option v-for="node in graph.data.nodes" :key="node.id" :label="node.title" :value="node.id" /></el-select></el-form-item><el-form-item label="关系（按 起点 → 终点 理解）"><el-select v-model="edgeDraft.relation"><el-option v-for="(label, key) in graphRelations" :key="key" :label="label" :value="key" /></el-select></el-form-item><el-form-item label="终点"><el-select v-model="edgeDraft.to" filterable><el-option v-for="node in graph.data.nodes" :key="node.id" :label="node.title" :value="node.id" /></el-select></el-form-item><el-form-item label="来源笔记（可选）"><el-select v-model="edgeDraft.noteId" clearable filterable><el-option v-for="note in graph.data.notes" :key="note.id" :label="note.title" :value="note.id" /></el-select></el-form-item><el-form-item label="连续原文证据"><el-input v-model="edgeDraft.evidence" type="textarea" maxlength="500" :rows="3" /></el-form-item></el-form>
      <template #footer><el-button :disabled="working" @click="edgeOpen = false">取消</el-button><el-button type="primary" :loading="working" @click="run(saveEdge)">保存关系</el-button></template>
    </el-dialog>
    <el-dialog v-model="extractOpen" title="从笔记提取知识图谱" width="min(840px, 95vw)" :close-on-click-modal="false" :close-on-press-escape="!graph.busy" :show-close="!graph.busy" @closed="run(graph.discard)">
      <el-alert title="点击提取会把所选笔记正文发送到已配置的 AI 服务商。仅提取候选，不自动保存；原文存在不代表关系正确，请逐条核对。" type="warning" :closable="false" />
      <div class="extract-actions"><el-select :model-value="graph.source?.id || ''" filterable placeholder="选择来源笔记" :disabled="graph.busy" @change="id => run(() => graph.selectSource(String(id)))"><el-option v-for="note in graph.data.notes" :key="note.id" :label="note.title" :value="note.id" /></el-select><el-button type="primary" :disabled="!graph.source || graph.busy" @click="run(graph.extract)">发送笔记并提取</el-button><el-button v-if="graph.generating" @click="run(graph.stop)">停止提取</el-button></div>
      <details v-if="graph.source"><summary>查看本次来源正文 · {{ graph.source.body.length }} 字符</summary><pre class="source-body">{{ graph.source.body }}</pre></details>
      <template v-if="graph.preview">
        <p>来源：{{ graph.preview.noteTitle }} · {{ graph.preview.draft.nodes.length }} 个知识点 / {{ graph.preview.draft.edges.length }} 条关系。尚未保存。</p><p v-if="graph.preview.reused.length">将复用同名节点（保留原描述）：{{ graph.preview.reused.join('、') }}</p>
        <div class="proposal-list"><div v-for="node in graph.preview.draft.nodes" :key="node.key" class="source-card"><strong>{{ node.title }}</strong><p>{{ node.description }}</p><blockquote>{{ node.evidence }}</blockquote></div><div v-for="(edge, i) in graph.preview.draft.edges" :key="i" class="source-card"><strong>{{ draftTitle(edge.from) }} → {{ graphRelations[edge.relation] }} → {{ draftTitle(edge.to) }}</strong><blockquote>{{ edge.evidence }}</blockquote></div></div>
      </template>
      <template v-else><p class="muted">支持编辑/移除候选 JSON 后再预览。最多 20 个知识点、40 条关系；每项必须附有连续原文证据。</p><div data-testid="graph-json"><el-input v-model="graph.raw" type="textarea" :rows="9" maxlength="60000" :disabled="graph.busy" placeholder='{"nodes":[{"key":"a","title":"概念","description":"说明","evidence":"连续原文"}],"edges":[]}' /></div></template>
      <template #footer><el-button :disabled="graph.busy" @click="extractOpen = false">关闭（不保存）</el-button><el-button v-if="graph.preview" :disabled="graph.busy" @click="run(graph.discard)">返回编辑</el-button><el-button v-if="graph.preview" type="primary" :loading="graph.busy" @click="run(confirmProposal)">确认保存图谱</el-button><el-button v-else type="primary" :disabled="!graph.source || !graph.raw || graph.busy" @click="run(graph.prepare)">校验并预览</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useKnowledgeGraphStore } from '../stores/knowledge-graph'
import { graphRelations } from '../../electron/shared/knowledge-graph'
import type { GraphNode, GraphEdge, GraphRelation } from '../../electron/shared/knowledge-graph'
const graph = useKnowledgeGraphStore()
const query = ref(''), relationFilter = ref(''), selectedId = ref(''), zoom = ref(1), failure = ref(''), working = ref(false)
const nodeOpen = ref(false), edgeOpen = ref(false), extractOpen = ref(false), draftVersion = ref('')
const nodeDraft = ref({ id: '', title: '', description: '', noteId: '', evidence: '' })
const edgeDraft = ref({ id: '', from: '', to: '', relation: 'prerequisite' as GraphRelation, noteId: '', evidence: '' })
const visibleNodes = computed(() => graph.data.nodes.filter(n => `${n.title} ${n.description || ''}`.toLowerCase().includes(query.value.trim().toLowerCase())).slice(0, 60))
const visibleEdges = computed(() => { const ids = new Set(visibleNodes.value.map(n => n.id)); return graph.data.edges.filter(e => ids.has(e.from_id) && ids.has(e.to_id) && (!relationFilter.value || e.relation === relationFilter.value)).slice(0, 150) })
const positions = computed(() => new Map(visibleNodes.value.map((n, i, all) => { const angle = 2 * Math.PI * i / all.length - Math.PI / 2; return [n.id, { x: 500 + (all.length > 1 ? 370 * Math.cos(angle) : 0), y: 335 + (all.length > 1 ? 245 * Math.sin(angle) : 0) }] })))
const position = (id: string) => positions.value.get(id) || { x: 500, y: 350 }
function edgeEnd(edge: GraphEdge) { const a = position(edge.from_id), b = position(edge.to_id), distance = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: b.x - (b.x - a.x) * 38 / distance, y: b.y - (b.y - a.y) * 38 / distance } }
const selected = computed(() => graph.data.nodes.find(n => n.id === selectedId.value))
const selectedSources = computed(() => graph.data.sources.filter(s => s.node_id === selectedId.value))
const selectedEdges = computed(() => graph.data.edges.filter(e => e.from_id === selectedId.value || e.to_id === selectedId.value))
const titleFor = (id: string) => graph.data.nodes.find(n => n.id === id)?.title || '已删除'
const draftTitle = (key: string) => graph.preview?.draft.nodes.find(n => n.key === key)?.title || key
function openNote(id: string) { window.dispatchEvent(new CustomEvent('lk:nav', { detail: { href: `app://note/${id}` } })) }
async function run(work: () => unknown) { failure.value = ''; try { await work() } catch (error: unknown) { failure.value = error instanceof Error ? error.message : '操作失败'; ElMessage.error(failure.value) } }
async function refresh() { await graph.load() }
function editNode(node?: GraphNode) { nodeDraft.value = { id: node?.id || '', title: node?.title || '', description: node?.description || '', noteId: '', evidence: '' }; draftVersion.value = graph.data.version; nodeOpen.value = true }
function editEdge(edge?: GraphEdge) { edgeDraft.value = { id: edge?.id || '', from: edge?.from_id || selectedId.value || '', to: edge?.to_id || '', relation: edge?.relation || 'prerequisite', noteId: edge?.note_id || '', evidence: edge?.evidence || '' }; draftVersion.value = graph.data.version; edgeOpen.value = true }
async function saveNode() { if (working.value) return; working.value = true; try { selectedId.value = await graph.saveNode({ ...nodeDraft.value, id: nodeDraft.value.id || undefined }, draftVersion.value); nodeOpen.value = false } finally { working.value = false } }
async function saveEdge() { if (working.value) return; working.value = true; try { await graph.saveEdge({ ...edgeDraft.value, id: edgeDraft.value.id || undefined }, draftVersion.value); edgeOpen.value = false } finally { working.value = false } }
async function remove(edge: GraphEdge) { const version = graph.data.version; try { await ElMessageBox.confirm('仅删除这条关系，保留知识点与笔记。此操作无法一键撤销。', '删除关系', { type: 'warning', confirmButtonText: '删除关系', cancelButtonText: '取消' }) } catch { return }; await run(() => graph.removeEdge(edge.id, version)) }
async function confirmProposal() { await graph.apply(); extractOpen.value = false; ElMessage.success('图谱已保存，可在设置中开启图谱增强检索') }
onMounted(() => run(refresh))
onBeforeUnmount(() => { void graph.stop().catch(() => {}); void graph.discard().catch(() => {}) })
</script>

<style scoped lang="scss">
.graph-root { flex:1; min-width:0; min-height:0; overflow:hidden; display:flex; flex-direction:column; padding:24px; gap:16px; }
.graph-header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:14px; h2 { margin:8px 0; font-size:24px; } h2 small { font-size:12px; font-weight:400; color:var(--text-dim); } p { margin:0; font-size:12px; color:var(--text-dim); } }
.eyebrow { font-size:11px; letter-spacing:2px; color:var(--accent); }.actions { display:flex; flex-wrap:wrap; gap:8px; }.actions :deep(.el-button) { margin:0; }
.graph-tools { display:flex; align-items:center; flex-wrap:wrap; gap:8px; font-size:12px; > .el-input { width:250px; } > .el-select { width:150px; } }
.graph-body { flex:1; min-height:0; display:grid; grid-template-columns:minmax(0, 1fr) 280px; border:1px solid var(--border); border-radius:16px; overflow:hidden; background:var(--bg-elev); }
.canvas-scroll { overflow:auto; position:relative; background:radial-gradient(circle at center, var(--accent-dim), transparent 65%); }.canvas-hint { position:sticky; bottom:0; margin:0; padding:10px; font-size:11px; background:var(--bg-elev); color:var(--text-dim); }
.graph-edge { color:var(--text-dim); line { stroke:var(--border); stroke-width:1.5; } text { fill:var(--text-dim); font-size:11px; text-anchor:middle; paint-order:stroke; stroke:var(--bg-elev); stroke-width:4px; } &.connected line { stroke:var(--accent); stroke-width:2.5; } }
.graph-node { cursor:pointer; circle { fill:var(--bg-elev); stroke:var(--accent); stroke-width:2; } text { text-anchor:middle; fill:var(--text); font-size:12px; pointer-events:none; } .node-caption { font-size:11px; } &.selected circle, &:focus circle { fill:var(--accent-dim); stroke-width:4; } }
.graph-detail { border-left:1px solid var(--border); padding:18px; overflow:auto; h3 { overflow-wrap:anywhere; } h4 { margin-top:24px; } }
.description, .source-card { font-size:12px; line-height:1.7; overflow-wrap:anywhere; white-space:pre-wrap; }.source-card { border:1px solid var(--border); border-radius:10px; padding:12px; margin:10px 0; background:var(--bg); small { color:var(--text-dim); } }.source-link { border:0; background:transparent; color:var(--accent); cursor:pointer; text-align:left; padding:0; } blockquote { margin:8px 0; padding-left:10px; border-left:2px solid var(--accent); color:var(--text-dim); }.warning { display:block; color:var(--accent) !important; }
.empty { display:flex; min-height:250px; height:100%; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:20px; color:var(--text-dim); font-size:13px; box-sizing:border-box; }.muted { color:var(--text-dim); font-size:12px; }.extract-actions { display:flex; gap:10px; margin:16px 0; .el-select { flex:1; } }.source-body { white-space:pre-wrap; max-height:180px; overflow:auto; font-size:12px; }.proposal-list { max-height:380px; overflow:auto; }
@media (max-width:1100px) { .graph-root { padding:14px; }.graph-body { grid-template-columns:minmax(0,1fr) 230px; } }
</style>
