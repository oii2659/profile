<script setup lang="ts">
import down from '../assets/icons/down.svg?raw'
import expand from '../assets/icons/plus-square.svg?raw'
import collapse from '../assets/icons/minus-square.svg?raw'
import download from '../assets/icons/download.svg?raw'
import message from '../assets/icons/message.svg?raw'
import user from '../assets/icons/user.svg?raw'
import phone from '../assets/icons/phone.svg?raw'
import mail from '../assets/icons/mail.svg?raw'
import code from '../assets/icons/code.svg?raw'

defineProps<{ name: 'down' | 'expand' | 'collapse' | 'download' | 'message' | 'user' | 'phone' | 'mail' | 'code' }>()

// Trusted local SVGs from Ant Design Icons; see assets/icons/LICENSE.
const icons = Object.fromEntries(
  Object.entries({ down, expand, collapse, download, message, user, phone, mail, code })
    .map(([name, svg]) => [name, svg.replace(/<\?xml[^>]*\?>\s*/, '')]),
)
</script>

<template>
  <span class="resume-icon" aria-hidden="true" v-html="icons[name]" />
</template>

<style scoped>
.resume-icon { display: inline-flex; width: 1em; height: 1em; flex: 0 0 auto; vertical-align: -.125em; line-height: 1; }
.resume-icon :deep(svg) { display: block; width: 100%; height: 100%; fill: currentColor; }
</style>
