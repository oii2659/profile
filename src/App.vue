<script setup lang="ts">
import { defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import Guestbook from './components/Guestbook.vue'
import ResumeView from './components/ResumeView.vue'
import ReadingResume from './components/ReadingResume.vue'
import { publishedResume } from './lib/resume'
import { buildReadingResume } from './lib/reading'
import { recordVisit } from './lib/analytics'
const AdminApp = defineAsyncComponent(() => import('./admin/AdminApp.vue'))
const adminPath = '/admin'
const matchesAdminRoute = () => /^\/admin(?:\/|\/index\.html)?$/.test(window.location.pathname) || window.location.hash === '#/admin'
const isAdmin = ref(matchesAdminRoute())
const resumeNavigation = buildReadingResume(publishedResume).sections
const readingView = ref<InstanceType<typeof ReadingResume>>()
function scrollToSection(id: string) {
  const target = document.getElementById(id)
  target?.scrollIntoView({ block: 'start' })
  if (target) { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }) }
}
async function cleanPublicUrl() {
  const url = new URL(window.location.href)
  const legacyTarget = url.hash.slice(1)
  url.searchParams.delete('v')
  if (isAdmin.value) url.pathname = adminPath
  url.hash = ''
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url)
  if (!isAdmin.value && legacyTarget) {
    await nextTick()
    await readingView.value?.reveal(legacyTarget)
    scrollToSection(legacyTarget)
  }
}
function routeChanged() {
  const wasAdmin = isAdmin.value
  isAdmin.value = matchesAdminRoute()
  void cleanPublicUrl()
  if (wasAdmin && !isAdmin.value) void recordVisit()
}
onMounted(() => {
  window.addEventListener('hashchange', routeChanged)
  window.addEventListener('popstate', routeChanged)
  void cleanPublicUrl()
  if (!isAdmin.value) void recordVisit()
})
onBeforeUnmount(() => {
  window.removeEventListener('hashchange', routeChanged)
  window.removeEventListener('popstate', routeChanged)
})
const printResume = () => window.print()
</script>

<template>
  <AdminApp v-if="isAdmin" />
  <div v-else class="public-site">
    <nav class="toolbar" aria-label="简历操作">
      <span>{{ publishedResume.profile.name }} · 个人简历</span>
      <div class="toolbar-actions"><button class="section-link" type="button" @click="scrollToSection('guestbook')">留言</button><button type="button" @click="printResume">打印 / 保存 PDF</button></div>
    </nav>
    <div class="reading-layout">
      <div class="reading-column">
        <ReadingResume ref="readingView" :document="publishedResume" />
        <div class="print-resume"><ResumeView :document="publishedResume" /></div>
        <Guestbook :email="publishedResume.profile.email" />
      </div>
      <aside class="reading-sidebar" aria-label="简历导航与联系方式">
        <nav class="reading-directory" aria-label="简历目录">
          <h2>目录</h2>
          <button v-for="heading in resumeNavigation" :key="heading.id" type="button" @click="scrollToSection(heading.id)">{{ heading.title }}</button>
          <button type="button" @click="scrollToSection('guestbook')">留言</button>
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
      <a :href="adminPath">站长管理</a>
    </footer>
  </div>
</template>
