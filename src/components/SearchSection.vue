<template>
  <section>
    <div class="sec-title">{{ title }} ({{ items.length }})</div>
    <ul>
      <li
        v-for="(it, i) in items"
        :key="i"
        :class="{ active: (start + i) === sel }"
        @click="$emit('run', it)"
      >
        <span class="lbl">{{ label(it) }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  items: any[]
  label: (it: any) => string
  sel: number
  start: number
}>()
defineEmits<{ (e: 'run', it: any): void }>()
</script>

<style scoped lang="scss">
section { padding: 6px 0; }
.sec-title {
  font-size: 11px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 4px 18px;
}
ul { list-style: none; margin: 0; padding: 0; }
li {
  padding: 6px 18px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  &:hover { background: rgba(127,127,127,0.12); }
  &.active { background: var(--accent); color: #fff; }
  .lbl {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>