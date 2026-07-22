<template>
  <div class="markdown-body" v-html="html" @click="onClick"></div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '../helpers/markdown'

const props = defineProps<{ content: string }>()
const html = computed(() => renderMarkdown(props.content ?? ''))

function onClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  const a = target.closest('a') as HTMLAnchorElement | null
  if (!a) return
  const href = a.getAttribute('href') || ''
  if (href.startsWith('app://')) {
    e.preventDefault()
    // Dispatch custom event for App.vue to handle navigation
    window.dispatchEvent(new CustomEvent('lk:nav', { detail: { href } }))
  }
}
</script>