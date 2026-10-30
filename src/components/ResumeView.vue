<script setup lang="ts">
import { computed } from 'vue'
import { cleanResumeHtml, type ResumeDocument } from '../lib/resume'
const props = defineProps<{ document: ResumeDocument }>()
const pages = computed(() => props.document.pages.map(page => cleanResumeHtml(page.html, true)))
</script>

<template>
  <main class="resume-paper" :aria-label="document.profile.name + '个人简历'">
    <article class="page page-one" aria-label="简历第 1 页">
      <header>
        <div class="identity">
          <div class="identity-text">
            <div class="identity-line"><span>姓名：{{ document.profile.name }}</span><span>年龄：{{ document.profile.age }} 岁</span></div>
            <div class="identity-line contact-line"><span>手机：<a :href="'tel:' + document.profile.phone">{{ document.profile.phone }}</a></span><span>邮箱：<a :href="'mailto:' + document.profile.email">{{ document.profile.email }}</a></span></div>
            <p>求职意向：{{ document.profile.jobIntention }}</p>
          </div>
        </div>
        <div class="education"><span>{{ document.education.period }}</span><span>{{ document.education.school }}</span><span>{{ document.education.degree }}</span></div>
      </header>
      <div class="resume-content" v-html="pages[0]" />
    </article>
    <article class="page page-two" aria-label="简历第 2 页">
      <div class="resume-content" v-html="pages[1]" />
    </article>
  </main>
</template>
