<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { buildReadingResume } from '../lib/reading'
import type { ResumeDocument } from '../lib/resume'
import ResumeIcon from './ResumeIcon.vue'
import ReadingSection from './ReadingSection.vue'

const props = defineProps<{ document: ResumeDocument }>()
const model = computed(() => buildReadingResume(props.document))
const mainSections = computed(() => model.value.sections.filter(section => !['overview', 'skills'].includes(section.kind)))
const sideSections = computed(() => model.value.sections.filter(section => ['overview', 'skills'].includes(section.kind)))
const root = ref<HTMLElement>()
const expanded = ref(new Set<string>())
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
      <span class="resume-watermark" aria-hidden="true">Personal resume</span>
      <h1>{{ document.profile.name }}</h1>
      <p class="scan-intro">{{ model.introduction }}</p>
      <div class="mobile-contact" aria-label="快捷联系方式">
        <a :href="'mailto:' + document.profile.email"><ResumeIcon name="mail" />邮件联系</a>
        <a :href="'tel:' + document.profile.phone"><ResumeIcon name="phone" />{{ document.profile.phone }}</a>
      </div>
      <span class="header-caption" aria-hidden="true">个人简历</span>
    </header>
    <div class="resume-columns">
      <div class="resume-main">
        <section class="scan-section resume-intention" aria-labelledby="resume-intention">
          <h2 id="resume-intention"><span>求职意向</span></h2>
          <p><ResumeIcon name="code" />{{ document.profile.jobIntention }}</p>
        </section>
        <section class="scan-section resume-education" aria-labelledby="resume-education">
          <h2 id="resume-education"><span>教育背景</span></h2>
          <div class="education-entry">
            <div class="education-heading"><time>{{ document.education.period }}</time><strong>{{ document.education.school }}</strong></div>
            <p>{{ document.education.degree }}</p>
            <div v-if="model.educationDetails" class="resume-content education-details" v-html="model.educationDetails" />
          </div>
        </section>
        <ReadingSection v-for="section in mainSections" :key="section.id" :section="section" :expanded="expanded" @toggle="toggled" />
      </div>
      <aside class="resume-sidebar" aria-label="个人信息与专业技能">
        <section class="scan-section profile-information" aria-labelledby="profile-information">
          <h2 id="profile-information"><span>基本信息</span></h2>
          <dl class="profile-details">
            <div><dt><ResumeIcon name="user" /><span class="visually-hidden">年龄</span></dt><dd>{{ document.profile.age }} 岁</dd></div>
            <div><dt><ResumeIcon name="phone" /><span class="visually-hidden">电话</span></dt><dd><a :href="'tel:' + document.profile.phone">{{ document.profile.phone }}</a></dd></div>
            <div><dt><ResumeIcon name="mail" /><span class="visually-hidden">邮箱</span></dt><dd><a :href="'mailto:' + document.profile.email">{{ document.profile.email }}</a></dd></div>
          </dl>
        </section>
        <ReadingSection v-for="section in sideSections" :key="section.id" :section="section" :expanded="expanded" :overview-content="model.overviewContent" @toggle="toggled" />
      </aside>
    </div>
  </main>
</template>
