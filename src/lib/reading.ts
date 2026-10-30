import { cleanResumeHtml, type ResumeDocument } from './resume'

export interface ReadingItem {
  id: string
  title: string
  date: string
  teaser: string
  keywords: string[]
  flow: string[]
  html: string
}
export interface ReadingSection {
  id: string
  title: string
  kind: 'overview' | 'experience' | 'projects' | 'skills' | 'other'
  lead: string
  items: ReadingItem[]
}
export interface ReadingFact { label: string; value: string; context: string; target: string }

const text = (element?: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
const shorten = (value: string, length: number) => Array.from(value).length > length ? Array.from(value).slice(0, length).join('') + '…' : value
const keywordPatterns = [
  /Multi-Agent/i, /LangGraph/i, /LangChain/i, /RAG/i, /MacBERT/i, /Qwen/i,
  /知识图谱/, /OpenAI API/i, /DeepSeek/i, /Python/i, /FastAPI/i, /WebSocket/i,
  /PostgreSQL/i, /ChromaDB/i, /React/i, /TypeScript/i, /Vue3/i, /uni-app/i, /Unity/i,
]

// Derive the reading view from the editor's HTML, so published edits never leave
// a second, hard-coded resume behind. Unknown sections remain accessible in full.
export function buildReadingResume(resume: ResumeDocument) {
  const root = document.createElement('div')
  root.innerHTML = resume.pages.map(page => cleanResumeHtml(page.html, true)).join('')
  const flattened: Element[] = []
  function flatten(parent: Element) {
    for (const child of parent.children) {
      if (child.tagName === 'SECTION') flatten(child)
      else flattened.push(child)
    }
  }
  flatten(root)
  const groups: { heading: string; nodes: Element[] }[] = []
  for (const node of flattened) {
    if (node.tagName === 'H2') groups.push({ heading: text(node), nodes: [] })
    else {
      if (!groups.length) groups.push({ heading: '简历内容', nodes: [] })
      groups.at(-1)!.nodes.push(node)
    }
  }
  const sections: ReadingSection[] = groups.map((group, index) => {
    const id = `resume-section-${index + 1}`
    const kind = group.nodes.some(n => n.matches('.job-heading')) ? 'experience'
      : group.nodes.some(n => n.matches('.project-heading')) ? 'projects'
      : group.nodes.some(n => n.matches('h3')) ? 'skills'
      : index === 0 ? 'overview' : 'other'
    const section: ReadingSection = { id, title: group.heading, kind, lead: '', items: [] }
    const chunks: Element[][] = []
    for (const node of group.nodes) {
      // A company heading stays visible above its projects.
      if (node.matches('.job-heading') && chunks.length === 0) { section.lead += node.outerHTML; continue }
      if (node.matches('.project-heading, .project-label, h3') || !chunks.length) chunks.push([])
      chunks.at(-1)!.push(node)
    }
    section.items = chunks.filter(nodes => nodes.some(node => text(node))).map((nodes, i) => {
      const content = document.createElement('div')
      content.innerHTML = nodes.map(node => node.outerHTML).join('')
      const heading = content.querySelector('.project-heading, .project-label, h3')
      const titleNode = heading?.cloneNode(true) as Element | undefined
      titleNode?.querySelector('time')?.remove()
      const title = text(titleNode).replace(/^参与项目[：:]\s*/, '').replace(/[：:]$/, '') || (kind === 'overview' ? '个人介绍、竞赛与课程' : '补充说明')
      const description = [...content.querySelectorAll('p')].find(p => !p.closest('li') && !p.matches('.project-label, .stack, .github, .responsibilities, .core-label'))
      const labels = [...content.querySelectorAll('li strong')].map(el => text(el)).filter(value => /[：:]$/.test(value)).slice(0, 3).map(value => value.replace(/[：:]$/, ''))
      const teaser = kind === 'skills' ? '' : shorten(description ? text(description).replace(/^项目(?:描述|背景)[：:]\s*/, '') : labels.join(' · ') || text(content.querySelector('li')).split('。')[0] || '', 80)
      const bodyText = text(content)
      const workflow = bodyText.match(/将([^，。；]+)拆分为独立推理节点/)
      const flow = workflow ? workflow[1]!.split(/、|与/).map(part => part.trim())
        : /Observe\s*→\s*Think\s*→\s*Act/.test(bodyText) ? ['观察 Observe', '思考 Think', '行动 Act'] : []
      return {
        id: `${id}-item-${i + 1}`, title,
        date: text(heading?.querySelector('time')), teaser,
        keywords: keywordPatterns.flatMap(pattern => bodyText.match(pattern)?.[0] ?? []).slice(0, 5),
        flow: flow.length >= 2 && flow.length <= 5 ? flow : [],
        html: content.innerHTML,
      }
    })
    return section
  })

  const facts: ReadingFact[] = []
  for (const section of sections) {
    for (const item of section.items) {
      const body = document.createElement('div')
      body.innerHTML = item.html
      const value = text(body)
      // Only show measurements when the exact labelled evidence exists in the
      // current source; a changed or removed statement removes its highlight.
      const linking = value.match(/实体链接率\s*(\d+(?:\.\d+)?%)\s*→\s*(\d+(?:\.\d+)?%)/)
      if (linking) facts.push({ label: '实体链接率', value: `${linking[1]} → ${linking[2]}`, context: item.title, target: item.id })
      else {
        const current = value.match(/实体链接率(?:达到|为)?\s*(\d+(?:\.\d+)?%)/)
        if (current) facts.push({ label: '实体链接率', value: current[1]!, context: item.title, target: item.id })
      }
      const entities = value.match(/([\d,]+)\s*个特征实体/)
      if (entities) facts.push({ label: '知识图谱特征实体', value: entities[1]!, context: item.title, target: item.id })
      const coverage = value.match(/小包覆盖率\s*(\d+(?:\.\d+)?%)/)
      if (coverage) facts.push({ label: '知识图谱小包覆盖率', value: coverage[1]!, context: item.title, target: item.id })
      const award = value.match(/全国大学生数学建模竞赛[（(]([^）)]+)[）)]/)
      if (award) facts.unshift({ label: '全国大学生数学建模竞赛', value: award[1]!, context: '竞赛经历', target: item.id })
    }
  }
  const introduction = text(root.querySelector('.summary > p')).split(/[，；。]/)[0] || resume.profile.jobIntention
  return { sections, facts: facts.slice(0, 3), introduction }
}
