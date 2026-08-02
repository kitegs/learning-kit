<template>
  <section class="attr-view">
    <header class="attr-head">
      <div><h3>学习资料属性视图</h3><p>用属性把笔记组织成表格、看板或画廊；更改会直接写回本地资料库。</p></div>
      <div class="attr-actions"><el-button-group><el-button :type="layout === 'table' ? 'primary' : 'default'" @click="layout='table'">表格</el-button><el-button :type="layout === 'board' ? 'primary' : 'default'" @click="layout='board'">看板</el-button><el-button :type="layout === 'gallery' ? 'primary' : 'default'" @click="layout='gallery'">画廊</el-button></el-button-group><el-button @click="load">刷新</el-button></div>
    </header>
    <div v-if="layout === 'table'" class="table-wrap"><el-table :data="rows" stripe @row-click="open"><el-table-column prop="title" label="资料" min-width="220" /><el-table-column prop="tags" label="标签" min-width="140" /><el-table-column label="状态" width="145"><template #default="{ row }"><el-select :model-value="row.attrs.状态 || '收集'" size="small" @change="(value) => updateAttr(row, '状态', String(value))"><el-option v-for="status in statuses" :key="status" :label="status" :value="status" /></el-select></template></el-table-column><el-table-column label="优先级" width="120"><template #default="{ row }"><el-select :model-value="row.attrs.优先级 || '普通'" size="small" @change="(value) => updateAttr(row, '优先级', String(value))"><el-option v-for="level in priorities" :key="level" :label="level" :value="level" /></el-select></template></el-table-column><el-table-column label="截止日期" width="150"><template #default="{ row }"><el-input :model-value="row.attrs.截止日期 || ''" size="small" placeholder="YYYY-MM-DD" @change="(value) => updateAttr(row, '截止日期', String(value))" /></template></el-table-column></el-table></div>
    <div v-else-if="layout === 'board'" class="board"><div v-for="status in statuses" :key="status" class="board-col"><h4>{{ status }} <span>{{ groups[status]?.length || 0 }}</span></h4><button v-for="row in groups[status]" :key="row.id" class="note-card" @click="open(row)"><strong>{{ row.title }}</strong><small>{{ row.tags || '无标签' }}</small><em>{{ row.attrs.优先级 || '普通' }}</em></button><div v-if="!groups[status]?.length" class="drop-empty">暂无资料</div></div></div>
    <div v-else class="gallery"><button v-for="row in rows" :key="row.id" class="gallery-card" @click="open(row)"><div class="cover">{{ row.title.slice(0, 1) || '笔' }}</div><strong>{{ row.title }}</strong><p>{{ row.body.replace(/<[^>]+>|[#>*`]/g, ' ').replace(/\s+/g, ' ').slice(0, 90) || '空白笔记' }}</p><footer><span>{{ row.attrs.状态 || '收集' }}</span><span>{{ row.attrs.优先级 || '普通' }}</span></footer></button></div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

type Row = { id: string; title: string; body: string; tags: string; attrs: Record<string, string> }
const layout = ref<'table' | 'board' | 'gallery'>('table')
const rows = ref<Row[]>([])
const statuses = ['收集', '进行中', '待复习', '完成']
const priorities = ['低', '普通', '高', '紧急']
const groups = computed(() => Object.fromEntries(statuses.map((status) => [status, rows.value.filter((row) => (row.attrs.状态 || '收集') === status)])) as Record<string, Row[]>)

async function load() {
  const notes = (await window.lk.notesList()).filter((note: any) => note.kind !== 'folder')
  rows.value = await Promise.all(notes.map(async (note: any) => {
    const attrs = await window.lk.attrsGet('note', note.id)
    return { id: note.id, title: String(note.title || '未命名笔记'), body: String(note.body || ''), tags: String(note.tags || ''), attrs: Object.fromEntries(attrs.map((attr: any) => [attr.attr_key, attr.attr_value])) }
  }))
}
async function updateAttr(raw: unknown, key: string, value: string) {
  const row = raw as Row
  row.attrs[key] = value
  await window.lk.attrsSet('note', row.id, row.attrs)
}
function open(raw: unknown) { const row = raw as Row; window.dispatchEvent(new CustomEvent('lk:nav', { detail: { href: `app://note/${row.id}` } })) }
onMounted(load)
</script>

<style scoped lang="scss">
.attr-view { flex:1; min-width:0; min-height:0; overflow:auto; padding:24px; background:var(--bg); }.attr-head { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:20px; }.attr-head h3 { margin:0 0 5px; }.attr-head p { margin:0; color:var(--text-dim); font-size:12px; }.attr-actions { display:flex; gap:8px; }.table-wrap { border:1px solid var(--border); border-radius:10px; overflow:hidden; }.board { display:grid; grid-template-columns:repeat(4,minmax(190px,1fr)); gap:14px; align-items:start; }.board-col { min-height:320px; padding:10px; border-radius:10px; background:var(--bg-soft); border:1px solid var(--border); }.board-col h4 { display:flex; justify-content:space-between; margin:0 0 10px; font-size:13px; }.board-col h4 span { color:var(--text-dim); }.note-card { display:grid; gap:6px; width:100%; margin-bottom:8px; padding:10px; border:1px solid var(--border); border-radius:8px; text-align:left; background:var(--bg-elev); color:var(--text); cursor:pointer; }.note-card:hover,.gallery-card:hover { border-color:var(--accent); box-shadow:var(--shadow-sm); }.note-card small,.note-card em { color:var(--text-dim); font-size:11px; font-style:normal; }.drop-empty { padding:20px 4px; text-align:center; color:var(--text-disabled); font-size:12px; }.gallery { display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:14px; }.gallery-card { display:grid; gap:9px; min-height:230px; padding:12px; border:1px solid var(--border); border-radius:10px; background:var(--bg-elev); color:var(--text); text-align:left; cursor:pointer; }.cover { display:flex; align-items:center; justify-content:center; height:90px; border-radius:7px; background:linear-gradient(135deg,var(--accent-dim),var(--bg-soft)); color:var(--accent-text); font-size:34px; font-weight:700; }.gallery-card p { min-height:42px; margin:0; color:var(--text-dim); font-size:12px; line-height:1.5; }.gallery-card footer { display:flex; gap:6px; margin-top:auto; }.gallery-card footer span { padding:2px 7px; border-radius:10px; background:var(--accent-dim); color:var(--accent-text); font-size:10px; } @media(max-width:900px) { .board { grid-template-columns:repeat(2,minmax(180px,1fr)); }.attr-head { align-items:flex-start; flex-direction:column; } }
</style>
