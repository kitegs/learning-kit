<template>
  <div class="anno-root" @mousedown="onBgDown">
    <!-- text boxes -->
    <div
      v-for="(a, i) in localAnns"
      :key="i"
      v-show="a.type==='text'"
      class="anno-text"
      :style="{ left: a.x+'%', top: a.y+'%', width: (a.w||120)+'px', minHeight: (a.h||32)+'px' }"
      @mousedown.stop="onStartDrag(i, $event)"
      @dblclick.stop="onEditText(i)"
      @contextmenu.prevent.stop="onDelText(i)"
    >
      <div class="anno-text-ctrl">
        <span class="drag-handle">::</span>
        <button class="close-btn" @click="onDelText(i)">x</button>
      </div>
      <div class="anno-text-body" v-if="!a.text">Click to edit</div>
      <div class="anno-text-body" v-else>{{ a.text }}</div>
      <div v-if="editingIdx===i" class="anno-edit-modal" @mousedown.stop>
        <textarea v-model="editDraft" class="anno-edit-ta" rows="3" placeholder="Type your note..." @keydown.escape="finishEdit" @keydown.ctrl.enter="finishEdit"></textarea>
        <div class="anno-edit-btns">
          <el-button size="small" @click="finishEdit">Done</el-button>
        </div>
      </div>
    </div>

    <!-- toolbar floating -->
    <transition name="fade">
      <div v-if="editingIdx===-1 && toolMenu" class="anno-toolbar" :style="{ left: toolX+'px', top: toolY+'px' }" @mousedown.stop>
        <button @click="addText">+ Text</button>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

interface Annotation { type: 'text' | 'drawing'; x: number; y: number; text?: string; w?: number; h?: number }

const props = defineProps<{ annotations: Annotation[] }>()
const emit = defineEmits<{ (e: 'change', v: Annotation[]): void }>()

const localAnns = ref<Annotation[]>([])
const editingIdx = ref<number>(-1)
const editDraft = ref('')
const toolMenu = ref(false)
const toolX = ref(0)
const toolY = ref(0)

watch(() => props.annotations, (v) => { localAnns.value = [...(v || [])] }, { immediate: true })

const dragging = ref(-1)
const dragOffX = ref(0)
const dragOffY = ref(0)

function onBgDown(e: MouseEvent) {
  if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('anno-root')) {
    editingIdx.value = -1
    toolMenu.value = true
    toolX.value = e.offsetX; toolY.value = e.offsetY
    setTimeout(() => { toolMenu.value = false }, 3000)
  }
}

function addText() {
  localAnns.value.push({ type: 'text', x: Math.round(toolX.value / (parentWidth()||800) * 100), y: Math.round(toolY.value / (parentHeight()||600) * 100), w: 140, h: 40, text: '' })
  toolMenu.value = false
  editingIdx.value = localAnns.value.length - 1
  editDraft.value = ''
  emitChange()
}

function onStartDrag(i: number, e: MouseEvent) {
  if (editingIdx.value >= 0) { finishEdit(); return }
  dragging.value = i
  dragOffX.value = e.clientX
  dragOffY.value = e.clientY
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
}

function onDragMove(e: MouseEvent) {
  if (dragging.value < 0) return
  const pw = parentWidth() || 1; const ph = parentHeight() || 1
  const dx = (e.clientX - dragOffX.value) / pw * 100
  const dy = (e.clientY - dragOffY.value) / ph * 100
  localAnns.value[dragging.value].x = Math.max(0, Math.min(90, localAnns.value[dragging.value].x + dx))
  localAnns.value[dragging.value].y = Math.max(0, Math.min(90, localAnns.value[dragging.value].y + dy))
  dragOffX.value = e.clientX; dragOffY.value = e.clientY
  emitChange()
}

function onDragEnd() {
  dragging.value = -1
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
}

function onEditText(i: number) {
  editingIdx.value = i
  editDraft.value = localAnns.value[i].text || ''
}

function finishEdit() {
  if (editingIdx.value >= 0) {
    localAnns.value[editingIdx.value].text = editDraft.value
    emitChange()
  }
  editingIdx.value = -1
}

function onDelText(i: number) {
  localAnns.value.splice(i, 1)
  editingIdx.value = -1
  emitChange()
}

function emitChange() { emit('change', [...localAnns.value]) }

function parentWidth() { return (document.querySelector('.mm-panel') as HTMLElement)?.clientWidth || 800 }
function parentHeight() { return (document.querySelector('.mm-panel') as HTMLElement)?.clientHeight || 600 }
</script>

<style scoped lang="scss">
.anno-root {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  z-index: 5; pointer-events: none;
}
.anno-text {
  position: absolute; z-index: 10; pointer-events: all;
  background: rgba(255, 255, 200, 0.88);
  border: 1px solid rgba(200, 180, 40, 0.5);
  border-radius: 4px;
  font-size: 12px; padding: 2px;
  cursor: move;
  transition: box-shadow 0.15s;
  &:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
}
html[data-theme="dark"] .anno-text { background: rgba(60, 60, 40, 0.9); border-color: rgba(200, 180, 40, 0.3); color: #eee; }
.anno-text-ctrl {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0 4px; height: 18px;
  font-size: 10px; color: #999;
}
.drag-handle { cursor: grab; }
.close-btn { border: none; background: none; cursor: pointer; font-size: 12px; color: #999; &:hover { color: #c33; } }
.anno-text-body { padding: 4px 6px; cursor: text; white-space: pre-wrap; word-break: break-word; }
.anno-edit-modal {
  position: absolute; top: 100%; left: 0; z-index: 20;
  background: var(--bg-elev); border: 1px solid var(--border);
  border-radius: 4px; padding: 6px; box-shadow: var(--shadow);
  width: 220px; pointer-events: all;
}
.anno-edit-ta { width: 100%; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 3px; padding: 4px; font-size: 12px; resize: vertical; }
.anno-edit-btns { display: flex; justify-content: flex-end; margin-top: 4px; }
.anno-toolbar {
  position: absolute; z-index: 15; pointer-events: all;
  background: var(--bg-elev); border: 1px solid var(--border);
  border-radius: 6px; box-shadow: var(--shadow); padding: 4px;
  button {
    border: none; background: transparent; color: var(--text);
    padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 13px;
    &:hover { background: var(--accent); color: #fff; }
  }
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>