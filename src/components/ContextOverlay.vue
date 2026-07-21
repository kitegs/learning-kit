<template>
  <template v-if="menu.visible">
    <div class="cx-overlay" @click="menu.close" @contextmenu.prevent="menu.close">
      <ul class="cx-menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }" @click.stop>
        <template v-for="(item, i) in menu.items" :key="i">
          <li v-if="item.separator" class="sep"></li>
          <li
            v-else
            class="item"
            :class="{ danger: item.danger, disabled: item.disabled }"
            @click="!item.disabled && menu.trigger(item)"
          >
            <el-icon v-if="item.icon"><component :is="ElIcons[item.icon]" /></el-icon>
            <span class="lbl">{{ item.label }}</span>
            <span class="shortcut" v-if="item.shortcut">{{ item.shortcut }}</span>
          </li>
        </template>
      </ul>
    </div>
  </template>
</template>

<script setup lang="ts">
import * as ElIcons from '@element-plus/icons-vue'
import { useContextMenu } from '../stores/context-menu'
const menu = useContextMenu()
</script>

<style scoped lang="scss">
.cx-overlay { position: fixed; inset: 0; z-index: 9999; }
.cx-menu {
  position: fixed;
  min-width: 170px;
  padding: 4px 0;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: var(--shadow);
  list-style: none;
  margin: 0;
}
.cx-menu .item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 36px 6px 12px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text);
}
.cx-menu .item .shortcut { margin-left: auto; color: var(--text-dim); font-size: 11px; }
.cx-menu .item:hover { background: var(--accent); color: #fff; }
.cx-menu .item:hover .shortcut { color: rgba(255,255,255,0.7); }
.cx-menu .item.disabled { opacity: 0.4; cursor: not-allowed; }
.cx-menu .item.disabled:hover { background: transparent; color: var(--text-dim); }
.cx-menu .item.danger { color: #ff5c5c; }
.cx-menu .item.danger:hover { color: #fff; background: #c53030; }
.cx-menu .sep { height: 1px; background: var(--border); margin: 4px 0; }
</style>