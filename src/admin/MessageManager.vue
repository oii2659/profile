<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { adminClient } from './client'
interface Message { id: string | number; content: string; created_at: string; hidden: boolean }
const messages = ref<Message[]>([])
const filter = ref('all')
const search = ref('')
const page = ref(0)
const total = ref<number | null>(null)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const PAGE_SIZE = 20
const formatDate = (date: string) => new Date(date).toLocaleString('zh-CN')
async function load(reset = false) {
  if (!adminClient || loading.value) return
  if (reset) page.value = 0
  loading.value = true
  error.value = ''
  try {
    let query = adminClient.from('message').select('id,content,created_at,hidden', { count: 'exact' })
    if (filter.value !== 'all') query = query.eq('hidden', filter.value === 'hidden')
    if (search.value.trim()) query = query.ilike('content', '%' + search.value.trim().replace(/[\\%_]/g, '\\$&') + '%')
    const result = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).range(page.value * PAGE_SIZE, (page.value + 1) * PAGE_SIZE - 1)
    if (result.error) throw result.error
    messages.value = result.data ?? []
    total.value = result.count
  } catch { error.value = '无法读取留言，请检查网络、管理员权限及数据库脚本。' }
  finally { loading.value = false }
}
async function change(message: Message, remove = false) {
  if (!adminClient || busy.value) return
  if (remove && !window.confirm('永久删除这条留言？如果只是不希望公开，可以选择隐藏。')) return
  busy.value = true; error.value = ''
  try {
    const result = remove
      ? await adminClient.from('message').delete().eq('id', message.id).select('id')
      : await adminClient.from('message').update({ hidden: !message.hidden }).eq('id', message.id).select('id')
    if (result.error || !result.data?.length) throw new Error('Not updated')
    if (remove && messages.value.length === 1 && page.value > 0) page.value--
    await load()
  } catch { error.value = '操作未完成，请刷新确认留言状态后再试。' }
  finally { busy.value = false }
}
async function move(direction: number) { page.value += direction; await load() }
onMounted(() => void load())
</script>

<template>
  <section class="admin-section">
    <div class="admin-section-heading"><div><p class="admin-kicker">CONVERSATIONS</p><h1>访客留言</h1><p>保留有价值的交流，隐藏或清理不合适的内容。</p></div><span class="admin-status">{{ total === null ? '—' : total + ' 条匹配留言' }}</span></div>
    <form class="admin-filterbar" @submit.prevent="load(true)">
      <label>显示范围<select v-model="filter" :disabled="loading" @change="load(true)"><option value="all">全部留言</option><option value="visible">公开留言</option><option value="hidden">已隐藏</option></select></label>
      <label class="grow">搜索正文<input v-model="search" placeholder="输入关键词" /></label>
      <button :disabled="loading || busy">{{ loading ? '加载中…' : '查询 / 刷新' }}</button>
    </form>
    <p v-if="error" class="admin-error" role="alert">{{ error }}</p>
    <p v-if="!loading && !error && !messages.length" class="admin-empty">没有符合条件的留言。</p>
    <div class="admin-message-list" :aria-busy="loading">
      <article v-for="message in messages" :key="message.id" class="admin-message">
        <div class="admin-message-top"><span class="admin-status">{{ message.hidden ? '已隐藏' : '公开' }}</span><time>{{ formatDate(message.created_at) }}</time></div>
        <p>{{ message.content }}</p>
        <div class="admin-message-actions"><button :disabled="busy || loading" @click="change(message)">{{ message.hidden ? '恢复公开' : '隐藏留言' }}</button><button class="admin-danger" :disabled="busy || loading" @click="change(message, true)">删除</button></div>
      </article>
    </div>
    <div class="admin-pagination"><button :disabled="loading || busy || page === 0" @click="move(-1)">上一页</button><span>第 {{ page + 1 }} 页</span><button :disabled="loading || busy || total === null || (page + 1) * PAGE_SIZE >= total" @click="move(1)">下一页</button></div>
  </section>
</template>
