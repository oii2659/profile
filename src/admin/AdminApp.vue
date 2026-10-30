<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { adminClient } from './client'
import ResumeEditor from './ResumeEditor.vue'
import MessageManager from './MessageManager.vue'
import VisitDashboard from './VisitDashboard.vue'
import './admin.css'

const tab = ref<'resume' | 'messages' | 'visits'>('resume')
const email = ref('')
const password = ref('')
const account = ref('')
const userId = ref('')
const checking = ref(Boolean(adminClient))
const authorized = ref(false)
const loggingIn = ref(false)
const error = ref('')
let disposed = false
let version = 0
let unsubscribe: (() => void) | undefined
async function authorize(session: Session | null) {
  if (disposed || !adminClient) return
  if (session?.user.id === userId.value && authorized.value) return
  const current = ++version
  authorized.value = false
  userId.value = ''
  account.value = session?.user.email ?? ''
  if (!session) { checking.value = false; return }
  checking.value = true
  try {
    const result = await adminClient.rpc('is_site_admin')
    if (disposed || current !== version) return
    if (result.error) throw result.error
    authorized.value = result.data === true
    if (authorized.value) { userId.value = session.user.id; error.value = '' }
    else error.value = '该账号没有站长权限，请将此账号加入管理员名单。'
  } catch {
    if (current === version && !disposed) error.value = '无法验证管理员权限，请检查网络与后台数据库配置。'
  } finally {
    if (current === version && !disposed) checking.value = false
  }
}
onMounted(() => {
  if (!adminClient) return
  const { data } = adminClient.auth.onAuthStateChange((_event, session) => {
    // Run outside the auth callback to avoid holding the Supabase auth lock.
    if (!session) { version++; authorized.value = false; userId.value = ''; account.value = ''; checking.value = false }
    setTimeout(() => void authorize(session), 0)
  })
  unsubscribe = () => data.subscription.unsubscribe()
})
onBeforeUnmount(() => { disposed = true; unsubscribe?.() })
async function login() {
  if (!adminClient || loggingIn.value) return
  loggingIn.value = true
  error.value = ''
  try {
    const { data, error: authError } = await adminClient.auth.signInWithPassword({ email: email.value.trim(), password: password.value })
    if (authError) throw authError
    password.value = ''
    await authorize(data.session)
  } catch { error.value = '登录失败，请检查邮箱、密码或网络连接。' }
  finally { loggingIn.value = false }
}
async function logout() {
  if (!window.confirm('确定退出后台？未发布的修改可在下次登录后恢复本机草稿。')) return
  const result = await adminClient?.auth.signOut({ scope: 'local' })
  if (result?.error) error.value = '退出失败，请稍后重试。'
}
</script>

<template>
  <div class="admin-app">
    <header class="admin-topbar">
      <a href="/" class="admin-brand">M / 简历工作台</a>
      <div class="admin-top-actions"><a href="/" target="_blank" rel="noopener">查看公开网站 ↗</a><span v-if="account">{{ account }}</span><button v-if="account" @click="logout">退出登录</button></div>
    </header>
    <main v-if="!authorized" class="admin-login">
      <p class="admin-kicker">PRIVATE WORKSPACE</p><h1>管理你的个人主页</h1>
      <p>编辑简历、整理留言，了解访客从哪里找到你。</p>
      <p v-if="!adminClient" class="admin-notice">请先配置 Supabase 项目连接，再使用站长后台。</p>
      <p v-else-if="checking" role="status">正在验证登录状态…</p>
      <form v-else @submit.prevent="login">
        <label>管理员邮箱<input v-model="email" type="email" autocomplete="username" required /></label>
        <label>密码<input v-model="password" type="password" autocomplete="current-password" required /></label>
        <button class="admin-primary" :disabled="loggingIn">{{ loggingIn ? '正在登录…' : '登录工作台' }}</button>
      </form>
      <p v-if="error" class="admin-error" role="alert">{{ error }}</p>
      <p class="admin-help">仅站长可进入。账号由你在 Supabase 中创建，此处不开放注册。</p>
    </main>
    <div v-else class="admin-layout">
      <aside class="admin-sidebar">
        <p class="admin-kicker">工作空间</p>
        <nav aria-label="后台管理">
          <button :aria-current="tab === 'resume' ? 'page' : undefined" @click="tab = 'resume'">简历编辑 <span>01</span></button>
          <button :aria-current="tab === 'messages' ? 'page' : undefined" @click="tab = 'messages'">留言管理 <span>02</span></button>
          <button :aria-current="tab === 'visits' ? 'page' : undefined" @click="tab = 'visits'">访问统计 <span>03</span></button>
        </nav>
        <p class="admin-sidebar-note">把精力留给内容。<br>每一次发布，都有版本记录。</p>
      </aside>
      <main class="admin-main">
        <p v-if="error" class="admin-error" role="alert">{{ error }}</p>
        <ResumeEditor v-show="tab === 'resume'" :user-id="userId" />
        <MessageManager v-if="tab === 'messages'" />
        <VisitDashboard v-if="tab === 'visits'" />
      </main>
    </div>
  </div>
</template>
