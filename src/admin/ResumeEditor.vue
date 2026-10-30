<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ResumeView from '../components/ResumeView.vue'
import { publishedResume, validateResume, type ResumeDocument } from '../lib/resume'
import RichEditor from './RichEditor.vue'
import { sourceRequest } from './client'

const props = defineProps<{ userId: string }>()
const doc = ref<ResumeDocument>(structuredClone(publishedResume))
const baseline = ref('')
const sha = ref('')
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const commitUrl = ref('')
const actionsUrl = ref('')
const preview = ref(false)
const page = ref(0)
const showInfo = ref(false)
const recovery = ref<{ document: ResumeDocument; sha: string } | null>(null)
const storageKey = 'resume-draft:' + props.userId
const dirty = computed(() => Boolean(sha.value) && JSON.stringify(doc.value) !== baseline.value)
const blocked = computed(() => loading.value || saving.value || !sha.value)
let active = true
watch(doc, value => {
  if (!sha.value || !dirty.value) return
  try { localStorage.setItem(storageKey, JSON.stringify({ document: value, sha: sha.value })) }
  catch { notice.value = '浏览器无法保存本机草稿，请及时发布或下载备份。' }
}, { deep: true })
function leave(event: BeforeUnloadEvent) {
  if (dirty.value) { event.preventDefault(); event.returnValue = '' }
}
onMounted(() => { window.addEventListener('beforeunload', leave); void loadSource() })
onBeforeUnmount(() => { active = false; window.removeEventListener('beforeunload', leave) })

async function loadSource() {
  if (dirty.value && !window.confirm('重新加载会替换当前修改，请先下载需要保留的草稿。继续吗？')) return
  loading.value = true
  error.value = ''
  try {
    const data = await sourceRequest('GET')
    const next = validateResume(data.document)
    if (!/^[a-f0-9]{40,64}$/.test(data.sha)) throw new Error('服务器返回的版本号无效')
    if (!active) return
    baseline.value = JSON.stringify(next)
    doc.value = next
    sha.value = data.sha
    recovery.value = null
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
      if (saved && JSON.stringify(saved.document) !== baseline.value) recovery.value = { document: validateResume(saved.document), sha: saved.sha }
    } catch { /* Invalid drafts do not block the remote source. */ }
  } catch (cause) { if (active) error.value = cause instanceof Error ? cause.message : '读取简历失败' }
  finally { if (active) loading.value = false }
}
function restoreDraft() {
  if (!recovery.value || recovery.value.sha !== sha.value) return
  doc.value = validateResume(recovery.value.document)
  recovery.value = null
}
function download(document = doc.value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2) + '\n'], { type: 'application/json' }))
  const link = window.document.createElement('a')
  link.href = url; link.download = 'resume-draft.json'; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function publish() {
  if (blocked.value || !dirty.value) return
  saving.value = true
  error.value = ''
  notice.value = ''
  commitUrl.value = ''
  actionsUrl.value = ''
  try {
    const document = validateResume(doc.value)
    const result = await sourceRequest('POST', { document, expectedSha: sha.value })
    if (!active) return
    const saved = validateResume(result.document)
    if (!/^[a-f0-9]{40,64}$/.test(result.sha)) throw new Error('提交结果无法确认，请检查 GitHub 发布记录后重新加载。')
    baseline.value = JSON.stringify(saved)
    doc.value = saved
    sha.value = result.sha
    recovery.value = null
    if (typeof result.commitUrl === 'string' && result.commitUrl.startsWith('https://github.com/')) commitUrl.value = result.commitUrl
    if (typeof result.actionsUrl === 'string' && result.actionsUrl.startsWith('https://github.com/')) actionsUrl.value = result.actionsUrl
    notice.value = '内容已提交到 GitHub，网站正在等待自动部署。请在发布进度中确认上线结果。'
    try { localStorage.removeItem(storageKey) } catch { /* The server save already succeeded. */ }
  } catch (cause) {
    if (active) error.value = cause instanceof Error ? cause.message : '保存失败，修改仍保留在当前页面。'
  } finally { if (active) saving.value = false }
}
</script>

<template>
  <section class="admin-section">
    <div class="admin-section-heading">
      <div><p class="admin-kicker">WRITE · PREVIEW · PUBLISH</p><h1>让简历保持最新</h1><p>直接修改文字与格式，发布后自动更新网站。</p></div>
      <span class="admin-status">{{ loading ? '读取中' : dirty ? '有未发布修改' : sha ? '已与仓库同步' : '尚未连接仓库' }}</span>
    </div>
    <div class="admin-actionbar">
      <div><button :disabled="blocked" @click="preview = !preview">{{ preview ? '返回编辑' : '预览简历' }}</button><button :disabled="loading || saving" @click="loadSource">重新加载</button><button :disabled="loading" @click="download()">下载草稿</button></div>
      <button class="admin-primary" :disabled="blocked || !dirty" @click="publish">{{ saving ? '正在提交…' : '保存并发布' }}</button>
    </div>
    <p v-if="error" class="admin-error" role="alert">{{ error }}</p>
    <div v-if="notice" class="admin-notice" role="status">{{ notice }} <a v-if="commitUrl" :href="commitUrl" target="_blank" rel="noopener">查看修改</a> <a v-if="actionsUrl" :href="actionsUrl" target="_blank" rel="noopener">发布进度 ↗</a></div>
    <div v-if="recovery" class="admin-notice">
      {{ recovery.sha === sha ? '发现尚未发布的本机草稿。' : '发现基于旧版本的草稿。请下载后与最新简历比对，避免覆盖其他修改。' }}
      <button v-if="recovery.sha === sha" @click="restoreDraft">恢复草稿</button>
      <button @click="download(recovery.document)">下载此草稿</button>
    </div>
    <p class="admin-help">输入会暂存在当前浏览器。只有“保存并发布”会修改仓库；上线需要等待部署完成。</p>
    <div v-if="preview" class="admin-preview"><ResumeView :document="doc" /></div>
    <template v-else>
      <div class="editor-tabs" role="group" aria-label="编辑区域">
        <button :aria-pressed="showInfo" @click="showInfo = true">基本信息</button>
        <button :aria-pressed="!showInfo && page === 0" @click="showInfo = false; page = 0">第 1 页</button>
        <button :aria-pressed="!showInfo && page === 1" @click="showInfo = false; page = 1">第 2 页</button>
      </div>
      <fieldset v-if="showInfo" class="admin-fields" :disabled="blocked">
        <legend>个人与教育信息</legend>
        <label>姓名<input v-model="doc.profile.name" maxlength="50" /></label>
        <label>年龄<input v-model.number="doc.profile.age" type="number" min="16" max="100" /></label>
        <label>手机<input v-model="doc.profile.phone" maxlength="50" /></label>
        <label>联系邮箱<input v-model="doc.profile.email" type="email" maxlength="200" /></label>
        <label class="wide">求职意向<input v-model="doc.profile.jobIntention" maxlength="200" /></label>
        <label>教育时间<input v-model="doc.education.period" maxlength="100" /></label>
        <label>学校<input v-model="doc.education.school" maxlength="200" /></label>
        <label class="wide">专业与学历<input v-model="doc.education.degree" maxlength="200" /></label>
      </fieldset>
      <RichEditor v-else :key="page + ':' + sha" v-model="doc.pages[page]!.html" :disabled="blocked" :page="page" />
    </template>
    <p class="admin-help">正文支持加粗、斜体、下划线、标题、列表和链接。增加内容后，请预览并检查两页 A4 的排版。</p>
  </section>
</template>
