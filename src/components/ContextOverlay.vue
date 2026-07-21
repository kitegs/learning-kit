<template>
  <template v-if="menu.visible">
    <div class="cx-overlay" @click="menu.close" @contextmenu.prevent="menu.close">
      <ul class="cx-menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }" @click.stop>
        <template v-for="(item, i) in menu.items" :key="i">
          <li v-if="item.separator" class="sep"></li>
          <li
            v-else
            class="item"
            :class="{ danger: item.danger, disabled: item.disabled, 'has-sub': !!item.children?.length }"
            @click="!item.disabled && !item.children?.length && menu.trigger(item)"
            @mouseenter="openSub(i, $event)"
            @mouseleave="scheduleCloseSub"
          >
            <el-icon v-if="item.icon"><component :is="ElIcons[item.icon]" /></el-icon>
            <span class="lbl">{{ item.label }}</span>
            <span class="shortcut" v-if="item.shortcut">{{ item.shortcut }}</span>
            <span class="sub-arrow" v-if="item.children?.length">&#9654;</span>
          </li>
        </template>
      </ul>
      <!-- submenu -->
      <ul v-if="subVisible && subItems.length" class="cx-menu cx-sub" :style="{ left: subX + 'px', top: subY + 'px' }" @click.stop @mouseenter="cancelCloseSub" @mouseleave="scheduleCloseSub">
        <template v-for="(item, i) in subItems" :key="i">
          <li v-if="item.separator" class="sep"></li>
          <li v-else class="item" :class="{ danger: item.danger, disabled: item.disabled }" @click="!item.disabled && triggerSub(item)">
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
import { ref } from 'vue'
import { useContextMenu, type CxItem } from '../stores/context-menu'
const menu = useContextMenu()

const subVisible = ref(false)
const subItems = ref<CxItem[]>([])
const subX = ref(0)
const subY = ref(0)
let subTimer: any = null

function openSub(idx: number, e: MouseEvent) {
  clearTimeout(subTimer)
  const item = menu.items[idx]
  if (!item?.children?.length) { subVisible.value = false; return }
  subItems.value = item.children
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  subX.value = rect.right - 2
  subY.value = rect.top
  // clamp to viewport
  if (subX.value + 180 > window.innerWidth) subX.value = rect.left - 180
  if (subY.value + subItems.value.length * 32 > window.innerHeight) subY.value = window.innerHeight - subItems.value.length * 32 - 8
  subVisible.value = true
}
function scheduleCloseSub() { subTimer = setTimeout(() => { subVisible.value = false }, 200) }
function cancelCloseSub() { clearTimeout(subTimer) }
function triggerSub(item: CxItem) { subVisible.value = false; menu.trigger(item) }
</script>

<style scoped lang="scss">
.cx-overlay { position: fixed; inset: 0; z-index: 9999; }
.cx-menu {
  position: fixed; min-width: 170px; padding: 4px 0;
  background: var(--bg-elev); border: 1px solid var(--border);
  border-radius: 6px; box-shadow: var(--shadow); list-style: none; margin: 0;
}
.cx-menu .item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 36px 6px 12px; cursor: pointer; font-size: 13px; color: var(--text);
  position: relative;
}
.cx-menu .item .shortcut { margin-left: auto; color: var(--text-dim); font-size: 11px; }
.cx-menu .item:hover { background: var(--accent); color: #fff; }
.cx-menu .item:hover .shortcut { color: rgba(255,255,255,0.7); }
.cx-menu .item.disabled { opacity: 0.4; cursor: not-allowed; }
.cx-menu .item.disabled:hover { background: transparent; color: var(--text-dim); }
.cx-menu .item.danger { color: #ff5c5c; }
.cx-menu .item.danger:hover { color: #fff; background: #c53030; }
.cx-menu .sep { height: 1px; background: var(--border); margin: 4px 0; }
.sub-arrow { position: absolute; right: 8px; font-size: 8px; color: var(--text-dim); }
.cx-menu .item:hover .sub-arrow { color: #fff; }
.cx-sub { z-index: 10000; }
</style>