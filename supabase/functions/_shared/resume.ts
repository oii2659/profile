export interface ResumeProfile {
  name: string
  age: number
  phone: string
  email: string
  jobIntention: string
}
export interface ResumeDocument {
  schemaVersion: 1
  profile: ResumeProfile
  education: { period: string; school: string; degree: string }
  pages: [{ html: string }, { html: string }]
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('简历结构不正确')
  return value as Record<string, unknown>
}
function field(value: unknown, label: string, max: number, required = true): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(label + '为空或超过长度限制')
  return value.trim()
}
export function validateResume(value: unknown): ResumeDocument {
  const doc = object(value)
  const p = object(doc.profile)
  const e = object(doc.education)
  if (doc.schemaVersion !== 1 || !Array.isArray(doc.pages) || doc.pages.length !== 2) throw new Error('需要版本 1 的两页简历')
  if (!Number.isInteger(p.age) || Number(p.age) < 16 || Number(p.age) > 100) throw new Error('年龄应在 16–100 之间')
  const email = field(p.email, '邮箱', 200)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('邮箱格式不正确')
  const pages = doc.pages.map(page => ({ html: field(object(page).html, '正文', 80000) }))
  return {
    schemaVersion: 1,
    profile: {
      name: field(p.name, '姓名', 50), age: Number(p.age),
      phone: field(p.phone, '电话', 50, false), email,
      jobIntention: field(p.jobIntention, '求职意向', 200),
    },
    education: {
      period: field(e.period, '教育时间', 100),
      school: field(e.school, '学校', 200),
      degree: field(e.degree, '专业学历', 200),
    },
    pages: [pages[0]!, pages[1]!],
  }
}
export const resumeTags = ['section', 'div', 'p', 'h2', 'h3', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li', 'time', 'br', 'img']
export const resumeClasses = ['summary', 'intern-project', 'job-heading', 'project-heading', 'circuit-heading', 'story-heading', 'project-label', 'project-description', 'responsibilities', 'projects-title', 'stack', 'core-label', 'story', 'github', 'skills', 'skills-title', 'qrcode']
export function isSafeLink(value: string): boolean {
  return /^(https?:\/\/|mailto:|tel:)/i.test(value.trim()) && !/[\u0000-\u0020]/.test(value.trim())
}
