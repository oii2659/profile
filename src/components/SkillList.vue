<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { ReadingItem } from '../lib/reading'
import proficiency from '../data/skill-proficiency.json'
const props = defineProps<{ items: ReadingItem[]; expanded: Set<string> }>()
const emit = defineEmits<{ select: [id: string] }>()
const root = ref<HTMLElement>()
const rows = computed(() => Array.from(
  { length: Math.ceil(props.items.length / 2) },
  (_, index) => props.items.slice(index * 2, index * 2 + 2),
))
const selected = computed(() => props.items.find(item => props.expanded.has(item.id)))
const score = (title: string) => (proficiency as Record<string, number>)[title]
let pendingReveal: string | undefined
function revealSelected() {
  if (!pendingReveal || selected.value?.id !== pendingReveal) return
  const panel = root.value?.querySelector<HTMLElement>('.skill-panel.is-open')
  if (!panel) return
  const title = panel.querySelector<HTMLElement>('.skill-panel-title')
  if (!title) return
  const bounds = title.getBoundingClientRect()
  const viewport = window.visualViewport?.height ?? window.innerHeight
  const rowTop = panel.closest('.skill-row')?.querySelector('.skill-options')?.getBoundingClientRect().top ?? bounds.top
  // Keep the selected circles with the detail preview when they fit together.
  const previewBottom = bounds.bottom + 120
  const previewTop = previewBottom - rowTop <= viewport - 44 ? rowTop : bounds.top
  const offset = previewTop < 20 ? previewTop - 20 : Math.max(0, previewBottom - viewport + 24)
  if (offset) window.scrollBy({ top: offset, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  pendingReveal = undefined
}
async function select(id: string) {
  pendingReveal = selected.value?.id === id ? undefined : id
  emit('select', id)
  await nextTick()
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) revealSelected()
}
function transitionFinished(event: TransitionEvent) {
  const panel = event.currentTarget as HTMLElement
  if (event.target === panel && panel.id === pendingReveal + '-panel' && event.propertyName === 'grid-template-rows') revealSelected()
}
</script>

<template>
  <div ref="root" class="skill-list">
    <div v-for="row in rows" :key="row[0]!.id" class="skill-row">
      <div class="skill-options">
        <button v-for="item in row" :id="item.id" :key="item.id" class="skill-option" type="button"
          :aria-expanded="selected?.id === item.id" :aria-controls="item.id + '-panel'" @click="select(item.id)">
          <span class="skill-gauge" :style="{ '--proficiency': (score(item.title) ?? 0) + '%' }" aria-hidden="true"><span class="skill-score">{{ score(item.title) ?? '—' }}<small v-if="score(item.title) !== undefined">%</small></span></span>
          <span class="scan-item-title">{{ item.title }}</span>
          <span class="visually-hidden">{{ score(item.title) === undefined ? '' : '自评掌握程度 ' + score(item.title) + '%，' }}{{ selected?.id === item.id ? '收起详情' : '查看详情' }}</span>
        </button>
      </div>
      <div v-for="item in row" :id="item.id + '-panel'" :key="item.id" class="skill-panel" :class="{ 'is-open': selected?.id === item.id }"
        :inert="selected?.id !== item.id" :aria-hidden="selected?.id !== item.id" role="region" :aria-labelledby="item.id" @transitionend="transitionFinished">
        <div class="skill-panel-clip">
          <div class="skill-panel-body">
            <p class="skill-panel-title">{{ item.title }}</p>
            <div class="resume-content scan-detail" v-html="item.html" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
