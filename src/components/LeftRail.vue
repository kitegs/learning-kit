<template>
  <nav class="rail">
    <el-tooltip
      v-for="m in items"
      :key="m.key"
      :content="m.label"
      placement="right"
    >
      <button
        class="rail-btn"
        :class="{ active: mode === m.key }"
        @click="$emit('switch', m.key)"
      >
        <el-icon><component :is="m.icon" /></el-icon>
      </button>
    </el-tooltip>

    <div class="spacer"></div>

    <el-tooltip :content="themeTooltip" placement="right">
      <button class="rail-btn" @click="toggleTheme">
        <el-icon><Sunny v-if="currentTheme==='dark'" /><Moon v-else /></el-icon>
      </button>
    </el-tooltip>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ChatDotRound, Reading, Edit, Share, DataLine, Sunny, Moon } from '@element-plus/icons-vue'
import type { Mode } from '../App.vue'
import { useSettingsStore } from '../stores/chat'

defineProps<{ mode: Mode }>()
defineEmits<{ (e: 'switch', m: Mode): void }>()

const settings = useSettingsStore()
const currentTheme = computed(() => settings.theme)

const themeTooltip = computed(() => (settings.theme === 'dark' ? '当前:暗色 - 切换到亮色' : '当前:亮色 - 切换到暗色'))

async function toggleTheme() {
  await settings.setTheme(settings.theme === 'dark' ? 'light' : 'dark')
}

const items: { key: Mode; label: string; icon: any }[] = [
  { key: 'chat', label: 'AI 对话', icon: ChatDotRound },
  { key: 'library', label: '图书馆', icon: Reading },
  { key: 'notes', label: '笔记', icon: Edit },
  { key: 'mindmap', label: '思维导图', icon: Share },
  { key: 'review', label: '复习', icon: DataLine }
]
</script>

<style scoped lang="scss">
.rail {
  width: 52px;
  background: var(--bg-soft);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 0;
  gap: 6px;
  height: 100vh;
  flex-shrink: 0;
}
.spacer { flex: 1; }
.rail-btn {
  width: 38px; height: 38px;
  border: none;
  background: transparent;
  color: var(--text-dim);
  border-radius: 8px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
  .el-icon { font-size: 18px; }
  &:hover { background: rgba(127,127,127,0.18); color: var(--text); }
  &.active { background: var(--accent); color: #fff; }
}
</style>

<style scoped lang="scss">
.rail {
  width: 52px;
  background: #181818;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 0;
  gap: 6px;
  height: 100vh;
  flex-shrink: 0;
}
.rail-btn {
  width: 38px; height: 38px;
  border: none;
  background: transparent;
  color: var(--text-dim);
  border-radius: 8px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
  .el-icon { font-size: 18px; }
  &:hover { background: rgba(255,255,255,0.06); color: var(--text); }
  &.active { background: var(--accent); color: #fff; }
}
</style>