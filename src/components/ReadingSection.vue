<script setup lang="ts">
import type { ReadingSection } from '../lib/reading'
import SkillList from './SkillList.vue'

defineProps<{ section: ReadingSection; expanded: Set<string>; overviewContent?: Record<string, string> }>()
const emit = defineEmits<{ toggle: [id: string, event: Event]; selectSkill: [id: string] }>()
</script>

<template>
  <section :class="['scan-section', 'scan-' + section.kind]" :aria-labelledby="section.id">
    <h2 :id="section.id"><span>{{ section.kind === 'overview' ? '个人介绍' : section.title }}</span><small v-if="section.kind === 'experience' || section.kind === 'projects'">{{ section.items.length }} 个项目</small></h2>
    <p v-if="section.kind === 'skills'" class="skill-hint">掌握程度 · 自评<span>点击查看详情</span></p>
    <div v-if="section.lead" class="scan-lead" v-html="section.lead" />
    <template v-if="section.kind === 'overview'">
      <div v-for="item in section.items" :id="item.id" :key="item.id" class="resume-content scan-about" v-html="overviewContent?.[item.id] ?? item.html" />
    </template>
    <SkillList v-else-if="section.kind === 'skills'" :items="section.items" :expanded="expanded" @select="emit('selectSkill', $event)" />
    <div v-else class="scan-items">
      <details v-for="item in section.items" :id="item.id" :key="item.id" :open="expanded.has(item.id)" class="scan-item" @toggle="emit('toggle', item.id, $event)">
        <summary :aria-label="item.title + '，' + (expanded.has(item.id) ? '收起详情' : '展开详情')">
          <time v-if="item.date">{{ item.date }}</time>
          <span class="scan-item-heading"><span class="scan-item-title">{{ item.title }}</span><span class="scan-toggle" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 10h12" /><path class="scan-toggle-vertical" d="M10 4v12" /></svg></span></span>
          <span v-if="item.teaser" class="scan-teaser">{{ item.teaser }}</span>
          <span v-if="item.flow.length" class="scan-flow" role="img" :aria-label="'Agent 工作流：' + item.flow.join(' → ')"><span v-for="(step, index) in item.flow" :key="step"><span v-if="index" class="scan-flow-arrow" aria-hidden="true">→</span>{{ step }}</span></span>
          <span v-if="item.keywords.length" class="scan-keywords"><span v-for="keyword in item.keywords" :key="keyword">{{ keyword }}</span></span>
        </summary>
        <div class="resume-content scan-detail" v-html="item.html" />
      </details>
    </div>
  </section>
</template>
