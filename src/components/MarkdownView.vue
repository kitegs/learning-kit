<template>
  <div class="markdown-body" v-html="html"></div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '../helpers/markdown'

const props = defineProps<{ content: string }>()
const html = computed(() => renderMarkdown(props.content ?? ''))
</script>