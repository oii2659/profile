<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import Guestbook from './components/Guestbook.vue'
import ResumeView from './components/ResumeView.vue'
import { publishedResume } from './lib/resume'
import { recordVisit } from './lib/analytics'
const AdminApp = defineAsyncComponent(() => import('./admin/AdminApp.vue'))
const isAdmin = ref(window.location.hash.startsWith('#/admin'))
function routeChanged() {
  isAdmin.value = window.location.hash.startsWith('#/admin')
  if (!isAdmin.value) void recordVisit()
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
  <template v-else>
    <nav class="toolbar" aria-label="简历操作">
      <span>{{ publishedResume.profile.name }} · 个人简历</span>
      <div class="toolbar-actions"><a href="#guestbook">留言</a><button type="button" @click="printResume">打印 / 保存 PDF</button></div>
    </nav>
    <ResumeView :document="publishedResume" />
    <Guestbook :email="publishedResume.profile.email" />
    <footer class="site-footer">
      <p v-if="recordVisit.enabled">本站记录匿名访问统计：时间、页面、来源网站和设备类型，不收集姓名或 IP。</p>
      <a href="#/admin">站长管理</a>
    </footer>
  </template>
</template>
