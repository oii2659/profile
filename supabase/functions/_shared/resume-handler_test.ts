import assert from 'node:assert/strict'
import { createResumeHandler } from './resume-handler.ts'

const sha = 'a'.repeat(40)
const nextSha = 'b'.repeat(40)
const config = { origins: ['https://resume.example.com'], repository: 'owner/profile', branch: 'main', token: 'server-only-token' }
const document = { schemaVersion: 1, profile: { name: '中文姓名', age: 22, phone: '123', email: 'me@example.com', jobIntention: 'Agent 开发' }, education: { period: '2023–2027', school: '大学', degree: '计算机科学' }, pages: [{ html: '<p>正文</p>' }, { html: '<p>第二页</p>' }] }
const encoded = (value: unknown) => btoa(Array.from(new TextEncoder().encode(JSON.stringify(value)), c => String.fromCharCode(c)).join(''))
const request = (body?: unknown, token = 'owner', origin = config.origins[0]) => new Request('https://project.supabase.co/functions/v1/resume-source', { method: body ? 'POST' : 'GET', headers: { Origin: origin, ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })

Deno.test('publishing requires both allowed origin and administrator identity', async () => {
  const noFetch = (() => { throw new Error('GitHub must not be called') }) as typeof fetch
  const handler = createResumeHandler(config, async token => token === 'owner', noFetch)
  assert.equal((await handler(request(undefined, ''))).status, 401)
  assert.equal((await handler(request(undefined, 'visitor'))).status, 403)
  assert.equal((await handler(request(undefined, 'owner', 'https://untrusted.example.com'))).status, 403)
})
Deno.test('conflicts preserve remote contents and reject stale saves', async () => {
  let puts = 0
  const git = (async (_url: unknown, init: RequestInit) => {
    if (init.method === 'PUT') puts++
    return Response.json({ sha: nextSha, content: encoded(document) })
  }) as typeof fetch
  const handler = createResumeHandler(config, async () => true, git)
  const response = await handler(request({ expectedSha: sha, document }))
  assert.equal(response.status, 409)
  assert.equal(puts, 0)
})
Deno.test('save writes one fixed file, preserves Unicode, strips executable content and keeps token on server', async () => {
  let committed: Record<string, unknown> | undefined
  const git = (async (url: string | URL | Request, init: RequestInit) => {
    assert(String(url).startsWith('https://api.github.com/repos/owner/profile/contents/src/data/resume.json'))
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer server-only-token')
    if (init.method === 'PUT') {
      committed = JSON.parse(String(init.body))
      return Response.json({ content: { sha: nextSha }, commit: { html_url: 'https://github.com/owner/profile/commit/123' } })
    }
    return Response.json({ sha, content: encoded(document) })
  }) as typeof fetch
  const unsafe = structuredClone(document)
  unsafe.pages[0].html = '<p class="summary admin-app" onclick="alert(1)">中文<script>alert(1)</script><a href="javascript:alert(1)">链接</a><img src="https://tracker.example.com/x"><img src="qrcode" class="qrcode"></p>'
  const response = await createResumeHandler(config, async () => true, git)(request({ expectedSha: sha, document: unsafe, path: '.github/workflows/bad.yml' }))
  assert.equal(response.status, 200)
  assert(committed)
  assert.equal(committed.branch, 'main')
  assert.equal(committed.sha, sha)
  const saved = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(String(committed.content)), c => c.charCodeAt(0))))
  assert.equal(saved.profile.name, '中文姓名')
  assert(saved.pages[0].html.includes('qrcode'))
  assert(!/script|onclick|javascript|tracker|admin-app/.test(saved.pages[0].html))
  const result = await response.text()
  assert(!result.includes(config.token))
})
Deno.test('invalid document and oversized body cannot reach GitHub', async () => {
  const handler = createResumeHandler(config, async () => true, (() => { throw new Error('Unexpected fetch') }) as typeof fetch)
  assert.equal((await handler(request({ expectedSha: sha, document: {} }))).status, 400)
  assert.equal((await handler(request({ expectedSha: sha, document, extra: 'x'.repeat(260000) }))).status, 400)
})
