<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../supabase'

defineProps<{ email: string }>()

interface Message {
  id: number | string
  content: string
  created_at: string
}

const PAGE_SIZE = 8
const MAX_LENGTH = 1000
const draft = ref('')
const messages = ref<Message[]>([])
const loading = ref(false)
const sending = ref(false)
const loaded = ref(false)
const hasMore = ref(false)
const loadError = ref('')
const sendError = ref('')
const feedback = ref('')
const cooldown = ref(0)
const live = ref(false)
const updates = ref(false)
const characterCount = computed(() => Array.from(draft.value).length)
const canSend = computed(() => Boolean(supabase) && draft.value.trim().length > 0 && characterCount.value <= MAX_LENGTH && !sending.value && cooldown.value === 0)
let visibleLimit = PAGE_SIZE
let channel: RealtimeChannel | undefined
let timer: ReturnType<typeof setInterval> | undefined
let disposed = false
let updateVersion = 0
const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
const formatDate = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '时间未知' : dateFormat.format(date)
}

async function fetchMessages(more = false) {
  if (!supabase || loading.value || disposed) return
  loading.value = true
  loadError.value = ''
  const requestedLimit = more ? visibleLimit + PAGE_SIZE : visibleLimit
  const version = updateVersion
  try {
    // Re-read the visible window so concurrent inserts/deletes cannot shift page offsets.
    const { data, error } = await supabase.from('message')
      .select('id,content,created_at')
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .limit(requestedLimit + 1)
    if (error) throw error
    if (disposed) return
    messages.value = (data ?? []).slice(0, requestedLimit)
    hasMore.value = (data?.length ?? 0) > requestedLimit
    visibleLimit = requestedLimit
    loaded.value = true
    if (version === updateVersion) updates.value = false
  } catch {
    if (!disposed) loadError.value = '留言暂时加载失败，请稍后重试。'
  } finally {
    loading.value = false
  }
}

async function submitMessage() {
  if (!canSend.value || !supabase) return
  sending.value = true
  sendError.value = ''
  feedback.value = ''
  try {
    const { error } = await supabase.from('message').insert({ content: draft.value.trim() })
    if (error) throw error
    if (disposed) return
    draft.value = ''
    feedback.value = '留言已发布。'
    cooldown.value = 30
    timer = setInterval(() => {
      cooldown.value = Math.max(0, cooldown.value - 1)
      if (cooldown.value === 0) clearInterval(timer)
    }, 1000)
    updateVersion++
    updates.value = true
    await fetchMessages()
  } catch {
    if (!disposed) sendError.value = '未能确认发布成功，内容已保留。请先刷新留言确认，再尝试发送。'
  } finally {
    sending.value = false
  }
}

onMounted(() => {
  if (!supabase) return
  channel = supabase.channel('public-guestbook')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message' }, () => {
      updateVersion++
      updates.value = true
    })
    .subscribe((status) => {
      const wasLive = live.value
      live.value = status === 'SUBSCRIBED'
      // Reconcile messages after reconnecting, including changes missed while offline.
      if (live.value && !wasLive && loaded.value) {
        updateVersion++
        updates.value = true
      }
    })
  void fetchMessages()
})

onBeforeUnmount(() => {
  disposed = true
  clearInterval(timer)
  if (channel && supabase) void supabase.removeChannel(channel)
})
</script>

<template>
  <section id="guestbook" class="guestbook" aria-labelledby="guestbook-title">
    <header class="guestbook-heading"><h2 id="guestbook-title">留言</h2><span>匿名公开</span></header>
    <p v-if="!supabase" class="guestbook-state" role="status">留言暂未开放，可<a :href="'mailto:' + email">通过邮件联系</a>。</p>
    <form v-else class="guestbook-form" @submit.prevent="submitMessage">
      <label for="guestbook-message" class="visually-hidden">你的留言</label>
      <textarea id="guestbook-message" v-model="draft" :disabled="sending" rows="3"
        placeholder="写下你的留言…" aria-describedby="guestbook-privacy guestbook-count"
        :aria-invalid="characterCount > MAX_LENGTH" required />
      <div class="guestbook-compose-footer">
        <p id="guestbook-privacy">公开留言，请勿填写私人信息。</p>
        <span id="guestbook-count" :class="{ 'guestbook-over-limit': characterCount > MAX_LENGTH }">{{ characterCount }} / {{ MAX_LENGTH }}</span>
        <button type="submit" class="guestbook-submit" :disabled="!canSend">
          {{ sending ? '发布中…' : cooldown > 0 ? cooldown + ' 秒后可发布' : '发布留言' }}
        </button>
      </div>
      <p v-if="feedback" class="guestbook-success" role="status">{{ feedback }}</p>
      <p v-if="sendError" class="guestbook-error" role="alert">{{ sendError }}</p>
    </form>
    <div v-if="supabase" class="guestbook-conversation">
      <div class="guestbook-list-heading">
        <h3>全部留言</h3>
        <button type="button" :disabled="loading" @click="fetchMessages()">{{ loading ? '加载中…' : '刷新' }}</button>
      </div>
      <button v-if="updates" type="button" class="guestbook-update" :disabled="loading" @click="fetchMessages()">留言有更新，点击查看</button>
      <div v-if="loadError" class="guestbook-error" role="alert">{{ loadError }} <button type="button" :disabled="loading" @click="fetchMessages()">重试</button></div>
      <p v-if="loading && !loaded" class="guestbook-state" role="status">正在加载留言…</p>
      <p v-else-if="loaded && !messages.length && !loadError" class="guestbook-state">暂无留言</p>
      <ul class="guestbook-list" :aria-busy="loading">
        <li v-for="message in messages" :key="message.id" class="guestbook-message">
          <div class="guestbook-message-meta"><strong>匿名访客</strong><time :datetime="message.created_at">{{ formatDate(message.created_at) }}</time></div>
          <p>{{ message.content }}</p>
        </li>
      </ul>
      <button v-if="hasMore" type="button" class="guestbook-more" :disabled="loading" @click="fetchMessages(true)">{{ loading ? '加载中…' : '查看更多留言' }}</button>
    </div>
  </section>
</template>
