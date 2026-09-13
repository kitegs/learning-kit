<template>
  <div v-if="graph.nodes.length" class="graph-preview">
    <small>结构预览 · 样式以 Draw.io 编辑器为准</small>
    <svg :viewBox="graph.viewBox" role="img" aria-label="待确认图表结构">
      <line v-for="edge in graph.edges" :key="edge.id" :x1="edge.from.x + edge.from.w / 2" :y1="edge.from.y + edge.from.h / 2" :x2="edge.to.x + edge.to.w / 2" :y2="edge.to.y + edge.to.h / 2" />
      <g v-for="node in graph.nodes" :key="node.id"><title>{{ node.text }}</title><rect :x="node.x" :y="node.y" :width="node.w" :height="node.h" rx="6" /><text :x="node.x + node.w / 2" :y="node.y + node.h / 2" dominant-baseline="middle" text-anchor="middle" :font-size="Math.min(14, node.w / Math.max(node.text.slice(0, 18).length, 1) * 0.85)">{{ node.text.slice(0, 18) }}</text></g>
    </svg>
    <small v-if="graph.limited">图较大，仅预览前 100 个节点；完整内容见源码。</small>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ preview: string }>()
type Node = { id: string; text: string; x: number; y: number; w: number; h: number }
const graph = computed(() => {
  const empty = { nodes: [] as Node[], edges: [] as { id: string; from: Node; to: Node }[], viewBox: '0 0 400 200', limited: false }
  const start = props.preview.search(/<(?:mxfile|mxGraphModel)[\s>]/)
  if (start < 0) return empty
  const doc = new DOMParser().parseFromString(props.preview.slice(start), 'application/xml')
  if (doc.querySelector('parsererror')) return empty
  const cells = [...doc.querySelectorAll('mxCell')]
  const vertices = cells.filter(cell => cell.getAttribute('vertex') === '1')
  const number = (element: Element | null, key: string, fallback: number) => { const value = Number(element?.getAttribute(key) ?? fallback); return Number.isFinite(value) ? value : fallback }
  const nodes = vertices.slice(0, 100).map(cell => {
    const geometry = cell.querySelector('mxGeometry')
    return { id: cell.getAttribute('id') || '', text: cell.getAttribute('value') || '', x: number(geometry, 'x', 0), y: number(geometry, 'y', 0), w: Math.max(1, number(geometry, 'width', 100)), h: Math.max(1, number(geometry, 'height', 60)) }
  })
  if (!nodes.length) return empty
  const byId = new Map(nodes.map(node => [node.id, node]))
  const edges = cells.filter(cell => cell.getAttribute('edge') === '1').flatMap(cell => {
    const from = byId.get(cell.getAttribute('source') || ''), to = byId.get(cell.getAttribute('target') || '')
    return from && to ? [{ id: cell.getAttribute('id') || '', from, to }] : []
  })
  const x = Math.min(...nodes.map(node => node.x)) - 20, y = Math.min(...nodes.map(node => node.y)) - 20
  return { nodes, edges, viewBox: `${x} ${y} ${Math.max(...nodes.map(node => node.x + node.w)) - x + 20} ${Math.max(...nodes.map(node => node.y + node.h)) - y + 20}`, limited: vertices.length > 100 }
})
</script>

<style scoped lang="scss">
.graph-preview { margin-top:8px; border:1px solid var(--border); border-radius:8px; padding:8px; }
svg { display:block; width:100%; height:180px; }
line { stroke:var(--text-dim); stroke-width:2; }
rect { fill:var(--bg-soft); stroke:var(--accent); stroke-width:1.5; }
text { fill:var(--text); }
small { color:var(--text-dim); }
</style>
