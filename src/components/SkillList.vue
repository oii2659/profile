<script setup lang="ts">
import { computed } from 'vue'
import type { ReadingItem } from '../lib/reading'
import proficiency from '../data/skill-proficiency.json'
const props = defineProps<{ items: ReadingItem[]; expanded: Set<string> }>()
defineEmits<{ select: [id: string] }>()
const selected = computed(() => props.items.find(item => props.expanded.has(item.id)))
const score = (title: string) => (proficiency as Record<string, number>)[title]
</script>

<template>
  <div class="skill-options">
    <button v-for="item in items" :id="item.id" :key="item.id" class="skill-option" type="button"
      :aria-expanded="selected?.id === item.id" :aria-controls="item.id + '-panel'" @click="$emit('select', item.id)">
      <span class="skill-gauge" :style="{ '--proficiency': (score(item.title) ?? 0) + '%' }" aria-hidden="true"><span class="skill-score">{{ score(item.title) ?? '—' }}<small v-if="score(item.title) !== undefined">%</small></span></span>
      <span class="scan-item-title">{{ item.title }}</span>
      <span class="visually-hidden">{{ score(item.title) === undefined ? '' : '自评掌握程度 ' + score(item.title) + '%，' }}{{ selected?.id === item.id ? '收起详情' : '查看详情' }}</span>
    </button>
  </div>
  <div v-for="item in items" :id="item.id + '-panel'" :key="item.id" class="skill-panel" :class="{ 'is-open': selected?.id === item.id }"
    :inert="selected?.id !== item.id" :aria-hidden="selected?.id !== item.id" role="region" :aria-labelledby="item.id">
    <div class="skill-panel-clip"><div class="skill-panel-body">
      <p class="skill-panel-title">{{ item.title }}</p>
      <div class="resume-content scan-detail" v-html="item.html" />
    </div></div>
  </div>
</template>
