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
    feedback.value = '留言已发布，谢谢你留下的想法。'
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
    <header class="guestbook-heading">
      <div>
        <p class="guestbook-eyebrow">很高兴在这里遇见你</p>
        <h2 id="guestbook-title">留下一点想法</h2>
        <p class="guestbook-intro">关于项目的建议、技术交流，或是一句简单的问候，都很欢迎。</p>
      </div>
      <span class="guestbook-mark" aria-hidden="true">“</span>
    </header>

    <div class="guestbook-contact">
      <div><strong>聊聊工作机会或合作？</strong><p>可以直接发邮件给我，方便进一步沟通。</p></div>
      <a :href="`mailto:${email}`">邮件联系 <span aria-hidden="true">↗</span></a>
    </div>

    <p v-if="!supabase" class="guestbook-state" role="status">留言板暂未开放，欢迎通过邮件联系我。</p>
    <form v-else class="guestbook-form" @submit.prevent="submitMessage">
      <label for="guestbook-message">你的留言 <span>无需登录 · 匿名公开</span></label>
      <textarea id="guestbook-message" v-model="draft" :disabled="sending" rows="4"
        placeholder="看完简历，有什么想对我说的？" aria-describedby="guestbook-privacy guestbook-count"
        :aria-invalid="characterCount > MAX_LENGTH" required />
      <div class="guestbook-compose-footer">
        <p id="guestbook-privacy">留言对所有人可见，请勿填写手机号等私人信息。</p>
        <span id="guestbook-count" :class="{ 'guestbook-over-limit': characterCount > MAX_LENGTH }">{{ characterCount }} / {{ MAX_LENGTH }}</span>
      </div>
      <div class="guestbook-submit-row">
        <p class="guestbook-note">谢谢你的认真阅读与善意交流。</p>
        <button type="submit" class="guestbook-submit" :disabled="!canSend">
          {{ sending ? '正在发布…' : cooldown > 0 ? `${cooldown} 秒后可再次留言` : '发布留言 ↗' }}
        </button>
      </div>
      <p v-if="feedback" class="guestbook-success" role="status">{{ feedback }}</p>
      <p v-if="sendError" class="guestbook-error" role="alert">{{ sendError }}</p>
    </form>

    <div v-if="supabase" class="guestbook-conversation">
      <div class="guestbook-list-heading">
        <h3>访客的声音</h3>
        <div><span class="guestbook-live" :class="{ 'is-live': live }">{{ live ? '已连接' : '可手动刷新' }}</span><button type="button" :disabled="loading" @click="fetchMessages()">{{ loading ? '加载中…' : '刷新' }}</button></div>
      </div>
      <button v-if="updates" type="button" class="guestbook-update" :disabled="loading" @click="fetchMessages()">留言有更新，点击查看</button>
      <div v-if="loadError" class="guestbook-error" role="alert">{{ loadError }} <button type="button" :disabled="loading" @click="fetchMessages()">重试</button></div>
      <p v-if="loading && !loaded" class="guestbook-state" role="status">正在读取大家的留言…</p>
      <div v-else-if="loaded && !messages.length && !loadError" class="guestbook-state">
        <span aria-hidden="true">✳</span><p>这里还很安静，来留下第一声问候吧。</p>
      </div>
      <ul class="guestbook-list" :aria-busy="loading">
        <li v-for="message in messages" :key="message.id" class="guestbook-message">
          <span class="guestbook-avatar" aria-hidden="true">客</span>
          <div class="guestbook-message-body">
            <div class="guestbook-message-meta"><strong>一位访客</strong><time :datetime="message.created_at">{{ formatDate(message.created_at) }}</time></div>
            <p>{{ message.content }}</p>
          </div>
        </li>
      </ul>
      <button v-if="hasMore" type="button" class="guestbook-more" :disabled="loading" @click="fetchMessages(true)">{{ loading ? '加载中…' : '查看更多留言' }}</button>
      <p v-else-if="messages.length" class="guestbook-end">每一条留言，都很珍贵。</p>
    </div>
  </section>
</template>
