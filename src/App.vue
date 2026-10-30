<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import Guestbook from './components/Guestbook.vue'
import ResumeView from './components/ResumeView.vue'
import { publishedResume, readingResume } from './lib/resume'
import { recordVisit } from './lib/analytics'
const AdminApp = defineAsyncComponent(() => import('./admin/AdminApp.vue'))
const isAdmin = ref(window.location.hash.startsWith('#/admin'))
const resumeNavigation = readingResume(publishedResume).headings
function routeChanged() {
  const wasAdmin = isAdmin.value
  isAdmin.value = window.location.hash.startsWith('#/admin')
  if (wasAdmin && !isAdmin.value) void recordVisit()
}
onMounted(() => {
  window.addEventListener('hashchange', routeChanged)
  if (!isAdmin.value) void recordVisit()
})
onBeforeUnmount(() => window.removeEventListener('hashchange', routeChanged))
const printResume = () => window.print()
</script>

<template>
  <AdminApp v-if="isAdmin" />
  <div v-else class="public-site">
    <nav class="toolbar" aria-label="简历操作">
      <span>{{ publishedResume.profile.name }} · 个人简历</span>
      <div class="toolbar-actions"><a href="#guestbook">留言</a><button type="button" @click="printResume">打印 / 保存 PDF</button></div>
    </nav>
    <div class="reading-layout">
      <div class="reading-column">
        <ResumeView :document="publishedResume" reading />
        <Guestbook :email="publishedResume.profile.email" />
      </div>
      <aside class="reading-sidebar" aria-label="简历导航与联系方式">
        <nav class="reading-directory" aria-label="简历目录">
          <h2>目录</h2>
          <a v-for="heading in resumeNavigation" :key="heading.id" :href="'#' + heading.id">{{ heading.title }}</a>
          <a href="#guestbook">留言</a>
        </nav>
        <section class="reading-contact">
          <h2>联系方式</h2>
          <a :href="'mailto:' + publishedResume.profile.email">{{ publishedResume.profile.email }}</a>
          <a :href="'tel:' + publishedResume.profile.phone">{{ publishedResume.profile.phone }}</a>
          <p>{{ publishedResume.profile.jobIntention }}</p>
        </section>
      </aside>
    </div>
    <footer class="site-footer">
      <p v-if="recordVisit.enabled">本站记录匿名访问统计：时间、页面、来源网站和设备类型，不收集姓名或 IP。</p>
      <a href="#/admin">站长管理</a>
    </footer>
  </div>
</template>
