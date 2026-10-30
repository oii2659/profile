// @deno-types="npm:@types/sanitize-html@2.16.0"
import sanitizeHtml from 'npm:sanitize-html@2.17.0'
import { isSafeLink, resumeClasses, resumeTags, validateResume, type ResumeDocument } from './resume.ts'
export interface PublishConfig { origins: string[]; repository: string; branch: string; token: string }
const FILE_PATH = 'src/data/resume.json'
function normalize(value: unknown): ResumeDocument {
  const doc = validateResume(value)
  doc.pages = doc.pages.map(page => ({
    html: sanitizeHtml(page.html, {
      allowedTags: resumeTags,
      allowedAttributes: { '*': ['class'], a: ['href', 'target', 'rel'], img: ['src', 'alt'], ol: ['start'] },
      allowedClasses: { '*': resumeClasses },
      allowedSchemes: ['http', 'https', 'mailto', 'tel'], allowProtocolRelative: false,
      transformTags: { a: (_tag, attrs) => {
        const attribs: Record<string, string> = { rel: 'noopener noreferrer' }
        if (attrs.href && isSafeLink(attrs.href)) attribs.href = attrs.href
        if (attrs.target === '_blank') attribs.target = '_blank'
        return { tagName: 'a', attribs }
      } },
      exclusiveFilter: frame => frame.tag === 'img' && frame.attribs.src !== 'qrcode',
    }).trim(),
  })) as ResumeDocument['pages']
  return validateResume(doc)
}
function encode(value: string) { return btoa(Array.from(new TextEncoder().encode(value), c => String.fromCharCode(c)).join('')) }
function decode(value: string) { return new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g, '')), c => c.charCodeAt(0))) }
async function readBody(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) throw new Error('Empty body')
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 250000) { await reader.cancel(); throw new Error('Too large') }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return JSON.parse(new TextDecoder().decode(bytes))
}
export function createResumeHandler(
  config: PublishConfig,
  authorize: (token: string) => Promise<boolean>,
  githubFetch: typeof fetch = fetch,
) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('Origin') ?? ''
    const allowed = config.origins.includes(origin) && Boolean(origin)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
      ...(allowed ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } : {}),
    }
    const reply = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers })
    if (!allowed) return reply(403, { error: '此网站未被允许访问保存接口，请检查 ALLOWED_ORIGINS。' })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (!['GET', 'POST'].includes(request.method)) return reply(405, { error: '不支持此操作。' })
    const jwt = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1]
    if (!jwt) return reply(401, { error: '请先登录站长账号。' })
    try {
      if (!await authorize(jwt)) return reply(403, { error: '登录已失效或没有站长权限，请重新登录。' })
      if (!config.token || !/^[\w.-]+\/[\w.-]+$/.test(config.repository) || !config.branch) return reply(503, { error: '尚未配置 GitHub 保存服务。' })
      const api = 'https://api.github.com/repos/' + config.repository + '/contents/' + FILE_PATH
      const gitHeaders = { Authorization: 'Bearer ' + config.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
      let input: { document: unknown; expectedSha: string } | undefined
      let next: ResumeDocument | undefined
      if (request.method === 'POST') {
        try {
          input = await readBody(request)
          if (!input || typeof input.expectedSha !== 'string' || !/^[a-f0-9]{40,64}$/.test(input.expectedSha)) throw new Error('Invalid version')
          next = normalize(input.document)
        } catch { return reply(400, { error: '简历内容或版本号无效，请检查必填字段、字数与格式。' }) }
      }
      const current = await githubFetch(api + '?ref=' + encodeURIComponent(config.branch), { headers: gitHeaders, signal: AbortSignal.timeout(12000) })
      if (!current.ok) return reply(502, { error: '无法读取 GitHub 内容文件，请检查仓库、分支、访问凭据和首次部署是否完成。' })
      const file = await current.json()
      if (request.method === 'GET') return reply(200, { document: normalize(JSON.parse(decode(file.content))), sha: file.sha })
      if (file.sha !== input!.expectedSha) return reply(409, { error: '仓库已有更新，已阻止覆盖。请下载当前草稿，重新加载最新简历后合并修改。' })
      const update = await githubFetch(api, {
        method: 'PUT', headers: { ...gitHeaders, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000),
        body: JSON.stringify({ message: 'Update resume from admin editor', branch: config.branch, sha: input!.expectedSha, content: encode(JSON.stringify(next, null, 2) + '\n') }),
      })
      if (update.status === 409 || update.status === 422) return reply(409, { error: '版本已变化或分支限制阻止保存，请下载草稿并检查仓库后重试。' })
      if (!update.ok) return reply(502, { error: 'GitHub 未接受提交，请检查凭据是否拥有该仓库的 Contents 写入权限。' })
      const result = await update.json()
      return reply(200, {
        document: next, sha: result.content.sha,
        commitUrl: result.commit.html_url,
        actionsUrl: 'https://github.com/' + config.repository + '/actions',
      })
    } catch {
      return reply(502, { error: '未能确认保存服务的结果。请先查看 GitHub 是否已有提交，再重新加载；当前草稿可以下载保留。' })
    }
  }
}
