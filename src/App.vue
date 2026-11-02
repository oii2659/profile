<script setup lang="ts">
import { defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import Guestbook from './components/Guestbook.vue'
import ResumeView from './components/ResumeView.vue'
import ReadingResume from './components/ReadingResume.vue'
import ResumeIcon from './components/ResumeIcon.vue'
import { publishedResume } from './lib/resume'
import { recordVisit } from './lib/analytics'
const AdminApp = defineAsyncComponent(() => import('./admin/AdminApp.vue'))
const adminPath = '/admin'
const matchesAdminRoute = () => /^\/admin(?:\/|\/index\.html)?$/.test(window.location.pathname) || window.location.hash === '#/admin'
const isAdmin = ref(matchesAdminRoute())
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
      <div class="toolbar-actions"><button class="section-link" type="button" @click="scrollToSection('guestbook')"><ResumeIcon name="message" />留言</button><button type="button" @click="printResume"><ResumeIcon name="download" />打印 / 保存 PDF</button></div>
    </nav>
    <div class="reading-layout">
      <div class="reading-column">
        <ReadingResume ref="readingView" :document="publishedResume" />
        <div class="print-resume"><ResumeView :document="publishedResume" /></div>
        <Guestbook :email="publishedResume.profile.email" />
      </div>
    </div>
    <footer class="site-footer">
      <p v-if="recordVisit.enabled">本站记录匿名访问统计：时间、页面、来源网站和设备类型，不收集姓名或 IP。</p>
      <a :href="adminPath">站长管理</a>
    </footer>
  </div>
</template>
