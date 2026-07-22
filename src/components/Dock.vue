<template>
  <div class="dock-root">
    <!-- left dock bar -->
    <nav class="dock-left">
      <div class="dock-group">
        <button v-for="m in modes" :key="m.key" class="dock-btn" :class="{active: mode===m.key}" @click="$emit('switch', m.key)" :title="m.label">
          <el-icon><component :is="m.icon" /></el-icon>
        </button>
      </div>
      <div class="dock-spacer"></div>
      <div class="dock-group">
        <button class="dock-btn" :class="{active: leftPanel==='outline'}" @click="toggleLeft('outline')" title="Outline">
          <el-icon><List /></el-icon>
        </button>
        <button class="dock-btn" :class="{active: leftPanel==='tags'}" @click="toggleLeft('tags')" title="Tags">
          <el-icon><PriceTag /></el-icon>
        </button>
        <button class="dock-btn" :class="{active: leftPanel==='bookmarks'}" @click="toggleLeft('bookmarks')" title="Bookmarks">
          <el-icon><Star /></el-icon>
        </button>
      </div>
      <div class="dock-spacer"></div>
      <div class="dock-group">
        <button class="dock-btn" @click="toggleTheme" :title="themeTip">
          <el-icon><Sunny v-if="theme==='dark'" /><Moon v-else /></el-icon>
        </button>
      </div>
    </nav>

    <!-- left panel overlay -->
    <div v-if="leftPanel" class="dock-panel-left" :style="{width: leftW+'px'}">
      <div class="panel-header">
        <span>{{ leftPanelTitle }}</span>
        <button @click="leftPanel=null">&times;</button>
      </div>
      <div class="panel-body">
        <div v-if="leftPanel==='outline'">
          <div v-for="(h, i) in outlineItems" :key="i" class="outline-item" :style="{paddingLeft: h.level*12+'px'}" @click="$emit('outline-click', h.line)">{{ h.text }}</div>
          <div v-if="!outlineItems.length" class="panel-empty">No headings</div>
        </div>
        <div v-if="leftPanel==='tags'">
          <span v-for="t in tagItems" :key="t" class="tag-chip">#{{ t }}</span>
          <div v-if="!tagItems.length" class="panel-empty">No tags</div>
        </div>
        <div v-if="leftPanel==='bookmarks'">
          <div v-for="b in bookmarkItems" :key="b.id" class="bm-item" @click="$emit('bookmark-click', b)">{{ b.label || 'Page '+b.page }}</div>
          <div v-if="!bookmarkItems.length" class="panel-empty">No bookmarks</div>
        </div>
      </div>
      <div class="resize-handle-r" @mousedown="startLeftResize"></div>
    </div>

    <!-- center: slot content -->
    <div class="dock-center">
      <slot />
    </div>

    <!-- right dock bar -->
    <nav class="dock-right">
      <div class="dock-group">
        <button class="dock-btn" :class="{active: rightPanel==='ai'}" @click="toggleRight('ai')" title="AI">
          <el-icon><ChatDotRound /></el-icon>
        </button>
        <button class="dock-btn" :class="{active: rightPanel==='backlinks'}" @click="toggleRight('backlinks')" title="Links">
          <el-icon><Link /></el-icon>
        </button>
      </div>
    </nav>

    <!-- right panel overlay -->
    <div v-if="rightPanel" class="dock-panel-right" :style="{width: rightW+'px'}">
      <div class="resize-handle-l" @mousedown="startRightResize"></div>
      <div class="panel-header">
        <span>{{ rightPanel === 'ai' ? 'AI' : 'Links' }}</span>
        <button @click="rightPanel=null">&times;</button>
      </div>
      <div class="panel-body">
        <div class="panel-empty">{{ rightPanel === 'ai' ? 'Use main chat' : 'No backlinks' }}</div>
      </div>
    </div>

    <!-- bottom bar -->
    <div class="dock-bottom">
      <button class="dock-btn-h" :class="{active: bottomPanel==='search'}" @click="toggleBottom('search')">Search</button>
      <button class="dock-btn-h" :class="{active: bottomPanel==='console'}" @click="toggleBottom('console')">Console</button>
      <span class="dock-status">{{ statusText }}</span>
    </div>

    <!-- bottom panel overlay -->
    <div v-if="bottomPanel" class="dock-panel-bottom" :style="{height: bottomH+'px'}">
      <div class="resize-handle-t" @mousedown="startBottomResize"></div>
      <div class="panel-header">
        <span>{{ bottomPanel === 'search' ? 'Search' : 'Console' }}</span>
        <button @click="bottomPanel=null">&times;</button>
      </div>
      <div class="panel-body">
        <div class="panel-empty">{{ bottomPanel === 'search' ? 'Ctrl+K to search' : 'No output' }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChatDotRound, Reading, Edit, Share, DataLine, Sunny, Moon, List, PriceTag, Star, Link } from '@element-plus/icons-vue'
import { useSettingsStore } from '../stores/chat'

type Mode = 'chat' | 'library' | 'notes' | 'mindmap' | 'review'
defineProps<{ mode: Mode; outlineItems: {level:number;text:string;line:number}[]; tagItems: string[]; bookmarkItems: any[] }>()
defineEmits<{ (e:'switch',m:Mode):void; (e:'outline-click',line:number):void; (e:'bookmark-click',b:any):void }>()

const settings = useSettingsStore()
const theme = computed(() => settings.theme)
const themeTip = computed(() => theme.value === 'dark' ? 'Light mode' : 'Dark mode')
function toggleTheme() { settings.setTheme(theme.value === 'dark' ? 'light' : 'dark') }

const modes = [
  { key: 'chat' as Mode, label: 'Chat', icon: ChatDotRound },
  { key: 'library' as Mode, label: 'Library', icon: Reading },
  { key: 'notes' as Mode, label: 'Notes', icon: Edit },
  { key: 'mindmap' as Mode, label: 'Mindmap', icon: Share },
  { key: 'review' as Mode, label: 'Review', icon: DataLine },
]

const leftPanel = ref<string|null>(null)
const rightPanel = ref<string|null>(null)
const bottomPanel = ref<string|null>(null)
const leftW = ref(220)
const rightW = ref(260)
const bottomH = ref(180)
const statusText = ref('Ready')

const leftPanelTitle = computed(() => ({ outline: 'Outline', tags: 'Tags', bookmarks: 'Bookmarks' } as Record<string,string>)[leftPanel.value || ''] || '')

function toggleLeft(p: string) { leftPanel.value = leftPanel.value === p ? null : p }
function toggleRight(p: string) { rightPanel.value = rightPanel.value === p ? null : p }
function toggleBottom(p: string) { bottomPanel.value = bottomPanel.value === p ? null : p }

function startLeftResize(e: MouseEvent) {
  const sx = e.clientX, sw = leftW.value
  const mv = (ev: MouseEvent) => { leftW.value = Math.max(140, Math.min(400, sw + ev.clientX - sx)) }
  const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
  window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
}
function startRightResize(e: MouseEvent) {
  const sx = e.clientX, sw = rightW.value
  const mv = (ev: MouseEvent) => { rightW.value = Math.max(160, Math.min(500, sw - ev.clientX + sx)) }
  const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
  window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
}
function startBottomResize(e: MouseEvent) {
  const sy = e.clientY, sh = bottomH.value
  const mv = (ev: MouseEvent) => { bottomH.value = Math.max(80, Math.min(500, sh - ev.clientY + sy)) }
  const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
  window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
}
</script>

<style scoped lang="scss">
.dock-root {
  display: grid;
  grid-template-columns: 48px 1fr 32px;
  grid-template-rows: 1fr 26px;
  height: 100vh;
  width: 100vw;
  position: relative;
  overflow: hidden;
}

/* left bar */
.dock-left {
  grid-column: 1; grid-row: 1 / 3;
  display: flex; flex-direction: column; align-items: center;
  background: var(--bg-soft); border-right: 1px solid var(--border);
  padding: 6px 0; gap: 2px; z-index: 20;
}

/* center content */
.dock-center {
  grid-column: 2; grid-row: 1;
  display: flex; min-width: 0; min-height: 0; overflow: hidden;
}

/* right bar */
.dock-right {
  grid-column: 3; grid-row: 1 / 3;
  display: flex; flex-direction: column; align-items: center;
  background: var(--bg-soft); border-left: 1px solid var(--border);
  padding: 6px 0; gap: 2px; z-index: 20;
}

/* bottom bar */
.dock-bottom {
  grid-column: 2; grid-row: 2;
  display: flex; align-items: center; gap: 4px;
  background: var(--bg-soft); border-top: 1px solid var(--border);
  padding: 0 8px; z-index: 20;
}

.dock-group { display: flex; flex-direction: column; gap: 2px; }
.dock-spacer { flex: 1; }

.dock-btn {
  width: 36px; height: 36px; border: none; background: transparent;
  color: var(--text-dim); border-radius: 6px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all .12s;
  .el-icon { font-size: 17px; }
  &:hover { background: var(--bg-hover); color: var(--text); }
  &.active { background: var(--accent); color: var(--text-on-accent); }
}
.dock-btn-h {
  border: none; background: transparent; color: var(--text-dim);
  font-size: 11px; padding: 2px 8px; border-radius: 3px; cursor: pointer;
  transition: color .1s;
  &:hover { color: var(--text); }
  &.active { color: var(--accent); font-weight: 600; }
}
.dock-status { margin-left: auto; font-size: 10px; color: var(--text-dim); }

/* panels */
.dock-panel-left {
  position: absolute; left: 48px; top: 0; bottom: 26px;
  background: var(--bg-soft); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; z-index: 15;
  box-shadow: 2px 0 8px rgba(0,0,0,.15);
  animation: slideR .15s var(--ease, ease);
}
.dock-panel-right {
  position: absolute; right: 32px; top: 0; bottom: 26px;
  background: var(--bg-soft); border-left: 1px solid var(--border);
  display: flex; flex-direction: column; z-index: 15;
  box-shadow: -2px 0 8px rgba(0,0,0,.15);
  animation: slideL .15s var(--ease, ease);
}
.dock-panel-bottom {
  position: absolute; left: 48px; right: 32px; bottom: 26px;
  background: var(--bg-soft); border-top: 1px solid var(--border);
  display: flex; flex-direction: column; z-index: 15;
  box-shadow: 0 -2px 8px rgba(0,0,0,.15);
  animation: slideU .15s var(--ease, ease);
}
@keyframes slideR { from { transform: translateX(-12px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes slideL { from { transform: translateX(12px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes slideU { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

.panel-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 10px; border-bottom: 1px solid var(--border);
  font-size: 12px; font-weight: 600; flex-shrink: 0;
  button { border: none; background: none; color: var(--text-dim); cursor: pointer; font-size: 14px; &:hover { color: var(--danger); } }
}
.panel-body { flex: 1; overflow: auto; padding: 6px; font-size: 12px; }
.panel-empty { color: var(--text-dim); text-align: center; padding: 24px 12px; font-size: 12px; }

.resize-handle-r { position: absolute; right: 0; top: 0; bottom: 0; width: 4px; cursor: col-resize; &:hover { background: var(--accent); } }
.resize-handle-l { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; cursor: col-resize; &:hover { background: var(--accent); } }
.resize-handle-t { position: absolute; top: 0; left: 0; right: 0; height: 4px; cursor: row-resize; &:hover { background: var(--accent); } }

.outline-item { padding: 3px 6px; cursor: pointer; border-radius: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: background .1s; &:hover { background: var(--bg-hover); } }
.tag-chip { display: inline-block; padding: 2px 8px; margin: 2px; background: var(--accent-dim); color: var(--accent-text); border-radius: 10px; font-size: 11px; cursor: default; }
.bm-item { padding: 4px 6px; cursor: pointer; border-radius: 3px; transition: background .1s; &:hover { background: var(--bg-hover); } }
</style>