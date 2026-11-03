<script setup lang="ts">
import { ref } from 'vue'
import ReadingResume from './ReadingResume.vue'
import { publishedResume } from '../lib/resume'
import readingStyles from '../reading.css?inline'
import scanStyles from '../scan.css?inline'
import themeStyles from '../theme.css?inline'
import printStyles from '../design-print.css?inline'
import oswaldUrl from '@fontsource-variable/oswald/files/oswald-latin-wght-normal.woff2?url'

// Reuse the desktop design for print, without applying mobile breakpoints to A4.
// These styles are mounted only on the dedicated design preview route.
const styles = [readingStyles, scanStyles, themeStyles]
  .map(css => css.replace(/@media screen\s*\{/g, '@media print {')).join('\n') + printStyles
const preparing = ref(false)
const exporting = ref(false)
const exportError = ref('')
const imageExport = new URLSearchParams(window.location.search).get('image') === '1'
async function exportImage() {
  exporting.value = true
  exportError.value = ''
  const frame = document.createElement('iframe')
  frame.title = '长图生成画布'
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;left:-12000px;top:0;width:1080px;height:1000px;border:0;pointer-events:none;'
  let timer: ReturnType<typeof setTimeout> | undefined
  let downloadUrl: string | undefined
  try {
    const loaded = new Promise<void>((resolve, reject) => {
      frame.onload = () => resolve()
      frame.onerror = () => reject(new Error('预览加载失败'))
      timer = setTimeout(() => reject(new Error('预览加载超时')), 30000)
    })
    frame.src = '/?print=design&image=1'
    document.body.append(frame)
    await loaded
    clearTimeout(timer)
    const frameDocument = frame.contentDocument!
    // The preview component is loaded asynchronously by Vue.
    const started = Date.now()
    while (!frameDocument.querySelector('.scan-resume')) {
      if (Date.now() - started > 15000) throw new Error('预览准备超时')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    await frameDocument.fonts.ready
    const resume = frameDocument.querySelector<HTMLElement>('.scan-resume')!
    const { toBlob } = await import('html-to-image')
    const fontResponse = await fetch(oswaldUrl)
    if (!fontResponse.ok) throw new Error('字体加载失败')
    const font = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = reject
      void fontResponse.blob().then(blob => reader.readAsDataURL(blob), reject)
    })
    const height = Math.ceil(resume.getBoundingClientRect().height)
    const blob = await toBlob(resume, {
      width: 1080, height,
      pixelRatio: Math.min(2, Math.sqrt(12000000 / (1080 * height))),
      backgroundColor: '#fcfdff',
      fontEmbedCSS: `@font-face { font-family: 'Oswald Variable'; font-style: normal; font-weight: 200 700; src: url(${font}) format('woff2'); }`,
    })
    if (!blob) throw new Error('图片生成失败')
    downloadUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = `${publishedResume.profile.name}-简历-设计版长图.png`
    link.click()
  } catch {
    exportError.value = '长图生成失败，请重试或使用电脑浏览器导出。'
  } finally {
    clearTimeout(timer)
    frame.remove()
    if (downloadUrl) setTimeout(() => URL.revokeObjectURL(downloadUrl!), 60000)
    exporting.value = false
  }
}
async function print() {
  preparing.value = true
  try {
    await document.fonts.ready
    window.print()
  } finally {
    preparing.value = false
  }
}
</script>

<template>
  <component :is="'style'">{{ styles }}</component>
  <div class="public-site design-print" :class="{ 'is-image-export': imageExport }">
    <nav v-if="!imageExport" class="toolbar design-print-toolbar" aria-label="设计版打印操作">
      <div><strong>设计版 · 全部展开</strong><p>长图无分页、日期或页码。打印 PDF 请在“更多设置”中取消“页眉和页脚”，并开启“背景图形”。</p><p v-if="exportError" class="export-error" role="alert">{{ exportError }}</p></div>
      <div class="toolbar-actions"><a href="/">返回简历</a><button type="button" :disabled="exporting" @click="exportImage">{{ exporting ? '正在生成长图…' : '导出长图 PNG' }}</button><button type="button" :disabled="preparing" @click="print">{{ preparing ? '准备打印…' : '打印 / 保存 PDF' }}</button></div>
    </nav>
    <div class="reading-layout"><ReadingResume :document="publishedResume" expand-all /></div>
  </div>
</template>
