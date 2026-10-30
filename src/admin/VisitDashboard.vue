<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { adminClient } from './client'
interface Summary { since: string; views: number; sessions: number; today: number; daily: { date: string; views: number }[]; sources: { host: string; views: number }[] }
interface Visit { id: number; created_at: string; page_path: string; referrer_host: string; device_type: string }
const days = ref(7)
const page = ref(0)
const summary = ref<Summary | null>(null)
const visits = ref<Visit[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref('')
const max = computed(() => Math.max(1, ...(summary.value?.daily.map(day => day.views) ?? [])))
const deviceNames: Record<string, string> = { mobile: '手机', tablet: '平板', desktop: '电脑' }
async function load(reset = false) {
  if (!adminClient || loading.value) return
  if (reset) page.value = 0
  loading.value = true; error.value = ''
  try {
    const stats = await adminClient.rpc('admin_visit_summary', { days: days.value })
    if (stats.error) throw stats.error
    const data = stats.data as Summary
    const records = await adminClient.from('page_views').select('id,created_at,page_path,referrer_host,device_type', { count: 'exact' }).gte('created_at', data.since).order('created_at', { ascending: false }).order('id', { ascending: false }).range(page.value * 20, page.value * 20 + 19)
    if (records.error) throw records.error
    summary.value = data; visits.value = records.data ?? []; total.value = records.count ?? 0
  } catch { error.value = '无法读取访问统计，请检查网络、管理员权限及统计数据库配置。' }
  finally { loading.value = false }
}
async function move(direction: number) { page.value += direction; await load() }
onMounted(() => void load())
</script>

<template>
  <section class="admin-section">
    <div class="admin-section-heading"><div><p class="admin-kicker">AUDIENCE</p><h1>了解每一次到访</h1><p>从访问趋势和来源，了解简历被发现的方式。</p></div><label class="admin-period">统计范围<select v-model.number="days" :disabled="loading" @change="load(true)"><option :value="7">最近 7 天</option><option :value="30">最近 30 天</option></select></label></div>
    <p v-if="error" class="admin-error" role="alert">{{ error }}</p>
    <div class="admin-stats"><div><span>页面访问次数</span><strong>{{ summary?.views ?? '—' }}</strong></div><div><span>访问会话数</span><strong>{{ summary?.sessions ?? '—' }}</strong></div><div><span>今日访问次数</span><strong>{{ summary?.today ?? '—' }}</strong></div></div>
    <p class="admin-help">按北京时间统计，从启用统计后开始记录。会话指当前浏览器标签页，不等于真实人数；隐私设置、拦截工具和自动化访问会影响数据。</p>
    <div v-if="summary" class="admin-chart-grid">
      <section class="admin-card"><h2>每日访问</h2><div class="admin-chart" role="img" aria-label="最近每日访问次数"><div v-for="day in summary.daily" :key="day.date" class="admin-chart-day"><span>{{ day.views }}</span><div :style="{ height: Math.max(2, day.views / max * 120) + 'px' }" :title="day.date + '：' + day.views + ' 次'"></div><small>{{ day.date.slice(5) }}</small></div></div></section>
      <section class="admin-card"><h2>来源网站</h2><p v-if="!summary.sources.length" class="admin-empty">还没有访问记录。</p><div v-for="source in summary.sources" :key="source.host" class="admin-source"><span>{{ source.host || '直接访问 / 来源未提供' }}</span><strong>{{ source.views }}</strong></div></section>
    </div>
    <div class="admin-table-heading"><h2>访问记录</h2><button :disabled="loading" @click="load()">{{ loading ? '读取中…' : '刷新统计' }}</button></div>
    <div class="admin-table-wrap"><table><thead><tr><th>时间</th><th>页面</th><th>来源</th><th>设备</th></tr></thead><tbody><tr v-for="visit in visits" :key="visit.id"><td>{{ new Date(visit.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) }}</td><td>{{ visit.page_path }}</td><td>{{ visit.referrer_host || '直接访问 / 未提供' }}</td><td>{{ deviceNames[visit.device_type] || visit.device_type }}</td></tr></tbody></table><p v-if="!loading && !error && !visits.length" class="admin-empty">暂无访问记录。</p></div>
    <div class="admin-pagination"><button :disabled="loading || page === 0" @click="move(-1)">上一页</button><span>第 {{ page + 1 }} 页</span><button :disabled="loading || (page + 1) * 20 >= total" @click="move(1)">下一页</button></div>
  </section>
</template>
