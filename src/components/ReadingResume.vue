<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { buildReadingResume } from '../lib/reading'
import type { ResumeDocument } from '../lib/resume'

const props = defineProps<{ document: ResumeDocument }>()
const model = computed(() => buildReadingResume(props.document))
const root = ref<HTMLElement>()
const expanded = ref(new Set<string>())
const allExpanded = computed(() => model.value.sections.flatMap(s => s.items).every(item => expanded.value.has(item.id)))
function toggleAll() {
  expanded.value = allExpanded.value ? new Set() : new Set(model.value.sections.flatMap(s => s.items.map(i => i.id)))
}
function toggled(id: string, event: Event) {
  const next = new Set(expanded.value)
  if ((event.target as HTMLDetailsElement).open) next.add(id)
  else next.delete(id)
  expanded.value = next
}
async function reveal(id: string) {
  if (!model.value.sections.some(section => section.items.some(item => item.id === id))) return
  expanded.value = new Set([...expanded.value, id])
  await nextTick()
  root.value?.querySelector(`#${id}`)?.scrollIntoView({ block: 'start' })
}
defineExpose({ reveal })
</script>

<template>
  <main ref="root" class="scan-resume" :aria-label="document.profile.name + '个人简历速览'">
    <header class="scan-header">
      <p class="scan-overline">个人简历</p>
      <h1>{{ document.profile.name }}</h1>
      <p class="scan-role">{{ document.profile.jobIntention }}</p>
      <p class="scan-intro">{{ model.introduction }}</p>
      <div class="scan-education"><span>{{ document.education.school }}</span><span>{{ document.education.degree }}</span><span>{{ document.education.period }}</span></div>
      <div class="scan-contact"><a :href="'mailto:' + document.profile.email">{{ document.profile.email }}</a><a :href="'tel:' + document.profile.phone">{{ document.profile.phone }}</a></div>
    </header>

    <div class="scan-controls"><span>经历概览 · 展开可查看完整内容</span><button type="button" @click="toggleAll">{{ allExpanded ? '收起全部' : '展开全部' }}</button></div>
    <section v-for="section in model.sections" :key="section.id" :class="['scan-section', 'scan-' + section.kind]" :aria-labelledby="section.id">
      <h2 :id="section.id">{{ section.title }}<span v-if="section.kind === 'experience' || section.kind === 'projects'">{{ section.items.length }} 个项目</span></h2>
      <div v-if="section.lead" class="scan-lead" v-html="section.lead" />
      <div class="scan-items">
        <details v-for="item in section.items" :id="item.id" :key="item.id" :open="expanded.has(item.id)" class="scan-item" @toggle="toggled(item.id, $event)">
          <summary>
            <span class="scan-item-heading"><span class="scan-item-title">{{ item.title }}</span><span class="scan-chevron" aria-hidden="true">⌄</span></span>
            <time v-if="item.date">{{ item.date }}</time>
            <span v-if="item.teaser && section.kind !== 'overview'" class="scan-teaser">{{ item.teaser }}</span>
            <span v-if="item.flow.length" class="scan-flow" role="img" :aria-label="'Agent 工作流：' + item.flow.join(' → ')"><span v-for="(step, index) in item.flow" :key="step"><span v-if="index" class="scan-flow-arrow" aria-hidden="true">→</span>{{ step }}</span></span>
            <span v-if="item.keywords.length" class="scan-keywords"><span v-for="keyword in item.keywords" :key="keyword">{{ keyword }}</span></span>
            <span class="scan-disclosure">{{ expanded.has(item.id) ? '收起详情' : '查看详情' }}</span>
          </summary>
          <div class="resume-content scan-detail" v-html="item.html" />
        </details>
      </div>
    </section>
  </main>
</template>
