<script setup lang="ts">
import type { ReadingItem } from '../lib/reading'
import proficiency from '../data/skill-proficiency.json'

defineProps<{ items: ReadingItem[]; expanded: Set<string> }>()
const emit = defineEmits<{ toggle: [id: string, event: Event] }>()
const score = (title: string) => (proficiency as Record<string, number>)[title]
</script>

<template>
  <div class="skill-options">
    <details v-for="item in items" :id="item.id" :key="item.id" class="skill-item"
      :open="expanded.has(item.id)" @toggle="emit('toggle', item.id, $event)">
      <summary class="skill-option" :aria-controls="item.id + '-panel'">
        <span class="skill-gauge" :style="{ '--proficiency': (score(item.title) ?? 0) + '%' }" aria-hidden="true"><span class="skill-score">{{ score(item.title) ?? '—' }}<small v-if="score(item.title) !== undefined">%</small></span></span>
        <span class="scan-item-title">{{ item.title }}</span>
        <span class="visually-hidden">{{ score(item.title) === undefined ? '' : '自评掌握程度 ' + score(item.title) + '%，' }}{{ expanded.has(item.id) ? '收起详情' : '查看详情' }}</span>
      </summary>
      <div :id="item.id + '-panel'" class="resume-content scan-detail" v-html="item.html" />
    </details>
  </div>
</template>
