<template>
  <el-dialog :model-value="modelValue" title="手写便签" width="760px" @update:model-value="emit('update:modelValue', $event)" @opened="setupCanvas">
    <div class="tools">
      <el-select v-model="color" size="small" style="width:110px"><el-option label="铅笔灰" value="#4d4a42" /><el-option label="墨水蓝" value="#315b8a" /><el-option label="批注红" value="#b44b45" /><el-option label="荧光绿" value="#3d8a64" /></el-select>
      <el-slider v-model="width" :min="1" :max="12" :step="1" style="width:160px" />
      <el-button size="small" @click="clear">清空画布</el-button>
      <span>可用鼠标、触控笔或手指书写</span>
    </div>
    <canvas ref="canvas" class="canvas" width="1320" height="700" @pointerdown="start" @pointermove="move" @pointerup="end" @pointerleave="end" />
    <template #footer><el-button @click="emit('update:modelValue', false)">取消</el-button><el-button type="primary" @click="save">插入笔记</el-button></template>
  </el-dialog>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'

defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void; (e: 'save', dataUrl: string): void }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const color = ref('#4d4a42')
const width = ref(3)
let drawing = false

function ctx() { return canvas.value?.getContext('2d') || null }
function setupCanvas() { nextTick(() => { const c = ctx(); if (!c) return; c.fillStyle = '#fffdf5'; c.fillRect(0, 0, 1320, 700); c.strokeStyle = color.value; c.lineCap = 'round'; c.lineJoin = 'round' }) }
function point(e: PointerEvent) { const el = canvas.value!; const rect = el.getBoundingClientRect(); return { x: (e.clientX - rect.left) * el.width / rect.width, y: (e.clientY - rect.top) * el.height / rect.height } }
function start(e: PointerEvent) { const c = ctx(); if (!c) return; drawing = true; canvas.value!.setPointerCapture(e.pointerId); const p = point(e); c.beginPath(); c.moveTo(p.x, p.y) }
function move(e: PointerEvent) { if (!drawing) return; const c = ctx(); if (!c) return; const p = point(e); c.strokeStyle = color.value; c.lineWidth = width.value * 2; c.lineTo(p.x, p.y); c.stroke() }
function end() { drawing = false }
function clear() { const c = ctx(); if (!c) return; c.fillStyle = '#fffdf5'; c.fillRect(0, 0, 1320, 700) }
function save() { if (!canvas.value) return; emit('save', canvas.value.toDataURL('image/png')); emit('update:modelValue', false) }
</script>

<style scoped lang="scss">
.tools { display:flex; align-items:center; gap:12px; margin-bottom:12px; color:var(--text-dim); font-size:12px; }.canvas { width:100%; height:auto; display:block; background:#fffdf5; border:1px solid #d7cdb5; border-radius:10px; cursor:crosshair; touch-action:none; box-shadow:inset 0 0 20px rgba(121,93,50,.07); }
</style>
