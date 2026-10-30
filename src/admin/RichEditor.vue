<script setup lang="ts">
import { watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { Extension, Mark, Node, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { cleanResumeHtml } from '../lib/resume'

const props = defineProps<{ modelValue: string; disabled?: boolean; page: number }>()
const emit = defineEmits<{ 'update:modelValue': [html: string] }>()
const Section = Node.create({
  name: 'resumeSection', group: 'block', content: 'block+',
  parseHTML: () => [{ tag: 'section' }],
  renderHTML: ({ HTMLAttributes }) => ['section', HTMLAttributes, 0],
})
const Line = Node.create({
  name: 'resumeLine', group: 'block', content: 'inline*',
  parseHTML: () => [{ tag: 'div.job-heading' }, { tag: 'div.project-heading' }],
  renderHTML: ({ HTMLAttributes }) => ['div', HTMLAttributes, 0],
})
const Time = Node.create({
  name: 'resumeTime', group: 'inline', inline: true, content: 'text*',
  parseHTML: () => [{ tag: 'time' }],
  renderHTML: () => ['time', {}, 0],
})
const Label = Mark.create({
  name: 'resumeLabel', parseHTML: () => [{ tag: 'span' }],
  renderHTML: () => ['span', {}, 0],
})
const Image = Node.create({
  name: 'resumeImage', group: 'block', atom: true,
  addAttributes: () => ({ src: { default: 'qrcode' }, alt: { default: '项目二维码' } }),
  parseHTML: () => [{ tag: 'img[src="qrcode"]' }],
  renderHTML: ({ HTMLAttributes }) => ['img', mergeAttributes(HTMLAttributes, { src: 'qrcode' })],
})
const Classes = Extension.create({
  name: 'resumeClasses',
  addGlobalAttributes: () => [{
    types: ['paragraph', 'heading', 'resumeSection', 'resumeLine', 'resumeImage', 'bulletList', 'orderedList', 'listItem'],
    attributes: { class: { default: null } },
  }],
})
const editor = useEditor({
  content: cleanResumeHtml(props.modelValue),
  editable: !props.disabled,
  extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false } }), Section, Line, Time, Label, Image, Classes],
  editorProps: { attributes: { 'aria-label': '简历正文编辑器', role: 'textbox', 'aria-multiline': 'true' } },
  onUpdate: ({ editor }) => emit('update:modelValue', editor.getHTML()),
})
watch(() => props.modelValue, value => {
  if (editor.value && value !== editor.value.getHTML()) editor.value.commands.setContent(cleanResumeHtml(value), { emitUpdate: false })
})
watch(() => props.disabled, value => editor.value?.setEditable(!value))
function addLink() {
  const href = window.prompt('输入链接地址（https://…、mailto:… 或 tel:…）', editor.value?.getAttributes('link').href || 'https://')
  if (href === null) return
  if (!href.trim()) { editor.value?.chain().focus().unsetLink().run(); return }
  if (!/^(https?:\/\/|mailto:|tel:)[^\s]+$/i.test(href.trim())) return
  editor.value?.chain().focus().extendMarkRange('link').setLink({ href: href.trim(), target: '_blank', rel: 'noopener noreferrer' }).run()
}
</script>

<template>
  <div v-if="editor" class="rich-editor">
    <div class="editor-tools" role="toolbar" aria-label="文字格式">
      <button :disabled="disabled" :aria-pressed="editor.isActive('bold')" @click="editor.chain().focus().toggleBold().run()"><strong>加粗</strong></button>
      <button :disabled="disabled" :aria-pressed="editor.isActive('italic')" @click="editor.chain().focus().toggleItalic().run()"><em>斜体</em></button>
      <button :disabled="disabled" :aria-pressed="editor.isActive('underline')" @click="editor.chain().focus().toggleUnderline().run()">下划线</button>
      <button :disabled="disabled" @click="editor.chain().focus().setParagraph().run()">正文</button>
      <button :disabled="disabled" :aria-pressed="editor.isActive('heading', { level: 2 })" @click="editor.chain().focus().toggleHeading({ level: 2 }).run()">标题</button>
      <button :disabled="disabled" :aria-pressed="editor.isActive('bulletList')" @click="editor.chain().focus().toggleBulletList().run()">项目符号</button>
      <button :disabled="disabled" @click="addLink">链接</button>
      <button :disabled="disabled || !editor.can().undo()" @click="editor.chain().focus().undo().run()">撤销</button>
      <button :disabled="disabled || !editor.can().redo()" @click="editor.chain().focus().redo().run()">重做</button>
    </div>
    <div class="editor-scroll">
      <div class="page resume-editor-sheet" :class="page === 0 ? 'page-one' : 'page-two'">
        <EditorContent :editor="editor" class="resume-content" />
      </div>
    </div>
  </div>
</template>
