<template>
  <div class="dock-root" :class="{ 'dock-left-open': leftPanel, 'dock-right-open': rightPanel, 'dock-bottom-open': bottomPanel }">
    <!-- left dock icons -->
    <div class="dock dock-left">
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
    </div>

    <!-- left panel content -->
    <div v-if="leftPanel" class="dock-panel dock-panel-left" :style="{width: leftW+'px'}">
      <div class="panel-header">
        <span>{{ leftPanelTitle }}</span>
        <button @click="leftPanel=null">&times;</button>
      </div>
      <div class="panel-body">
        <div v-if="leftPanel==='outline'" class="outline-list">
          <div v-for="(h, i) in outlineItems" :key="i" class="outline-item" :style="{paddingLeft: h.level*12+'px'}" @click="$emit('outline-click', h.line)">{{ h.text }}</div>
          <div v-if="!outlineItems.length" class="panel-empty">No headings found</div>
        </div>
        <div v-if="leftPanel==='tags'" class="tag-list">
          <div v-for="t in tagItems" :key="t" class="tag-item">#{{ t }}</div>
          <div v-if="!tagItems.length" class="panel-empty">No tags</div>
        </div>
        <div v-if="leftPanel==='bookmarks'" class="bm-list">
          <div v-for="b in bookmarkItems" :key="b.id" class="bm-item" @click="$emit('bookmark-click', b)">{{ b.label || 'Page '+b.page }}</div>
          <div v-if="!bookmarkItems.length" class="panel-empty">No bookmarks</div>
        </div>
      </div>
      <div class="panel-resize" @mousedown="startLeftResize"></div>
    </div>

    <!-- right dock -->
    <div class="dock dock-right">
      <div class="dock-group">
        <button class="dock-btn" :class="{active: rightPanel==='ai'}" @click="toggleRight('ai')" title="AI Chat">
          <el-icon><ChatDotRound /></el-icon>
        </button>
        <button class="dock-btn" :class="{active: rightPanel==='backlinks'}" @click="toggleRight('backlinks')" title="Backlinks">
          <el-icon><Link /></el-icon>
        </button>
      </div>
    </div>

    <!-- right panel content -->
    <div v-if="rightPanel" class="dock-panel dock-panel-right" :style="{width: rightW+'px'}">
      <div class="panel-header">
        <span>{{ rightPanel === 'ai' ? 'AI Assistant' : 'Backlinks' }}</span>
        <button @click="rightPanel=null">&times;</button>
      </div>
      <div class="panel-body">
        <div v-if="rightPanel==='ai'" class="panel-empty">AI chat panel (use main chat mode)</div>
        <div v-if="rightPanel==='backlinks'" class="panel-empty">No backlinks yet</div>
      </div>
      <div class="panel-resize panel-resize-left" @mousedown="startRightResize"></div>
    </div>

    <!-- bottom dock -->
    <div v-if="bottomPanel" class="dock-panel dock-panel-bottom" :style="{height: bottomH+'px'}">
      <div class="panel-resize panel-resize-top" @mousedown="startBottomResize"></div>
      <div class="panel-header">
        <span>{{ bottomPanel === 'search' ? 'Search Results' : 'Console' }}</span>
        <button @click="bottomPanel=null">&times;</button>
      </div>
      <div class="panel-body">
        <div class="panel-empty">{{ bottomPanel === 'search' ? 'Use Ctrl+K to search' : 'No output' }}</div>
      </div>
    </div>
    <div class="dock dock-bottom-bar">
      <button class="dock-btn-h" :class="{active: bottomPanel==='search'}" @click="toggleBottom('search')">Search</button>
      <button class="dock-btn-h" :class="{active: bottomPanel==='console'}" @click="toggleBottom('console')">Console</button>
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
const themeTip = computed(() => theme.value === 'dark' ? 'Switch to light' : 'Switch to dark')
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
const bottomH = ref(200)

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
.dock-root { display: flex; flex-direction: column; height: 100vh; position: relative; }
.dock { display: flex; background: var(--bg-soft); flex-shrink: 0; }
.dock-left { width: 48px; flex-direction: column; border-right: 1px solid var(--border); align-items: center; padding: 6px 0; gap: 2px; position: absolute; left: 0; top: 0; bottom: 0; z-index: 10; }
.dock-right { width: 32px; flex-direction: column; border-left: 1px solid var(--border); align-items: center; padding: 6px 0; gap: 2px; position: absolute; right: 0; top: 0; bottom: 0; z-index: 10; }
.dock-bottom-bar { height: 26px; flex-direction: row; border-top: 1px solid var(--border); padding: 0 8px; gap: 4px; align-items: center; position: absolute; left: 48px; right: 32px; bottom: 0; z-index: 10; }
.dock-group { display: flex; flex-direction: column; gap: 2px; }
.dock-spacer { flex: 1; }
.dock-btn { width: 36px; height: 36px; border: none; background: transparent; color: var(--text-dim); border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .12s; .el-icon { font-size: 17px; } &:hover { background: var(--bg-hover); color: var(--text); } &.active { background: var(--accent); color: var(--text-on-accent); } }
.dock-btn-h { border: none; background: transparent; color: var(--text-dim); font-size: 11px; padding: 2px 8px; border-radius: 3px; cursor: pointer; &:hover { color: var(--text); } &.active { color: var(--accent); font-weight: 600; } }

.dock-panel { position: absolute; background: var(--bg-soft); border: 1px solid var(--border); z-index: 9; display: flex; flex-direction: column; overflow: hidden; }
.dock-panel-left { left: 48px; top: 0; bottom: 26px; }
.dock-panel-right { right: 32px; top: 0; bottom: 26px; }
.dock-panel-bottom { left: 48px; right: 32px; bottom: 26px; }
.panel-header { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-bottom: 1px solid var(--border); font-size: 12px; font-weight: 600; flex-shrink: 0; button { border: none; background: none; color: var(--text-dim); cursor: pointer; font-size: 14px; &:hover { color: var(--danger); } } }
.panel-body { flex: 1; overflow: auto; padding: 6px; font-size: 12px; }
.panel-empty { color: var(--text-dim); text-align: center; padding: 20px; }
.panel-resize { position: absolute; right: 0; top: 0; bottom: 0; width: 4px; cursor: col-resize; &:hover { background: var(--accent); } }
.panel-resize-left { left: 0; right: auto; }
.panel-resize-top { top: 0; left: 0; right: 0; bottom: auto; height: 4px; width: auto; cursor: row-resize; }

.outline-item { padding: 3px 6px; cursor: pointer; border-radius: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; &:hover { background: var(--bg-hover); } }
.tag-item { display: inline-block; padding: 2px 8px; margin: 2px; background: var(--accent-dim); color: var(--accent-text); border-radius: 10px; font-size: 11px; }
.bm-item { padding: 4px 6px; cursor: pointer; border-radius: 3px; &:hover { background: var(--bg-hover); } }
</style>