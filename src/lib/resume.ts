import DOMPurify from 'dompurify'
import qrCodeUrl from '../assets/qrcode.png'
import source from '../data/resume.json'
import { resumeClasses, resumeTags, validateResume, type ResumeDocument } from '../../supabase/functions/_shared/resume'
export type { ResumeDocument, ResumeProfile } from '../../supabase/functions/_shared/resume'
export { validateResume } from '../../supabase/functions/_shared/resume'
export const publishedResume = validateResume(source)

// Build navigation from the same editable content that is rendered on the page.
export function readingResume(document: ResumeDocument) {
  const headings: { id: string; title: string }[] = []
  const pages = document.pages.map(page => {
    const container = window.document.createElement('div')
    container.innerHTML = cleanResumeHtml(page.html, true)
    container.querySelectorAll('h2').forEach(heading => {
      const id = `resume-section-${headings.length + 1}`
      heading.id = id
      headings.push({ id, title: heading.textContent?.trim() || '简历内容' })
    })
    return container.innerHTML
  })
  return { pages, headings }
}

export function cleanResumeHtml(html: string, renderAssets = false): string {
  const fragment = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: resumeTags,
    ALLOWED_ATTR: ['class', 'href', 'target', 'rel', 'src', 'alt', 'start'],
    ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false, RETURN_DOM_FRAGMENT: true,
  })
  fragment.querySelectorAll('[class]').forEach(el => {
    const classes = [...el.classList].filter(value => resumeClasses.includes(value))
    if (classes.length) el.setAttribute('class', classes.join(' '))
    else el.removeAttribute('class')
  })
  fragment.querySelectorAll('img').forEach(img => {
    if (img.getAttribute('src') !== 'qrcode') img.remove()
    else if (renderAssets) img.src = qrCodeUrl
  })
  fragment.querySelectorAll('a').forEach(a => {
    a.setAttribute('rel', 'noopener noreferrer')
    if (a.getAttribute('target') !== '_blank') a.removeAttribute('target')
  })
  const container = document.createElement('div')
  container.append(fragment)
  return container.innerHTML
}
