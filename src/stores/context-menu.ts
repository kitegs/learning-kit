import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import * as ElIcons from '@element-plus/icons-vue'

export interface CxItem {
  label?: string
  icon?: keyof typeof ElIcons
  danger?: boolean
  disabled?: boolean
  separator?: boolean
  shortcut?: string
  action?: () => void
}

export const useContextMenu = defineStore('cx-menu', () => {
  const visible = ref(false)
  const x = ref(0)
  const y = ref(0)
  const items = shallowRef<CxItem[]>([])

  function open(e: MouseEvent, its: CxItem[]): void {
    x.value = Math.min(e.clientX, Math.max(8, window.innerWidth - 230))
    y.value = Math.min(e.clientY, Math.max(8, window.innerHeight - its.length * 32 - 12))
    items.value = its
    visible.value = true
  }

  function trigger(item: CxItem): void {
    visible.value = false
    item.action?.()
  }

  function close(): void { visible.value = false }

  return { visible, x, y, items, open, trigger, close }
})