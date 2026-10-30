import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import source from '../../src/data/resume.json' with { type: 'json' }

const initialSha = 'a'.repeat(40)
const owner = '00000000-0000-4000-8000-000000000001'
const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: owner, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'test-signature'].join('.')

async function setup(page: Page, authorized = true) {
  const state = {
    document: structuredClone(source), sha: initialSha,
    posted: null as null | { document: typeof source; expectedSha: string },
    conflict: false, sourceUnavailable: false, sendFailure: false,
    visits: [] as Record<string, unknown>[],
    messages: [{ id: 1, content: '很喜欢你的项目，祝求职顺利！', created_at: '2026-10-30T01:00:00Z', hidden: false }, { id: 2, content: '一条已隐藏的留言', created_at: '2026-10-29T01:00:00Z', hidden: true }],
    exceptions: [] as string[],
  }
  page.on('pageerror', error => state.exceptions.push(error.message))
  await page.routeWebSocket('wss://test.supabase.co/**', socket => socket.close())
  await page.route('https://test.supabase.co/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204 })
    if (url.pathname === '/auth/v1/token') return route.fulfill({ json: {
      access_token: token, refresh_token: 'test-refresh', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, token_type: 'bearer',
      user: { id: owner, aud: 'authenticated', role: 'authenticated', email: 'owner@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    } })
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 })
    if (url.pathname === '/rest/v1/rpc/is_site_admin') return route.fulfill({ json: authorized })
    if (url.pathname === '/functions/v1/resume-source') {
      if (state.sourceUnavailable) return route.fulfill({ status: 503, json: { error: '尚未配置 GitHub 保存服务。' } })
      if (method === 'GET') return route.fulfill({ json: { document: state.document, sha: state.sha } })
      state.posted = request.postDataJSON()
      if (state.conflict) return route.fulfill({ status: 409, json: { error: '仓库已有更新，已阻止覆盖。请下载当前草稿，重新加载最新简历后合并修改。' } })
      state.document = structuredClone(state.posted!.document)
      state.sha = 'b'.repeat(40)
      return route.fulfill({ json: { document: state.document, sha: state.sha, commitUrl: 'https://github.com/owner/profile/commit/123', actionsUrl: 'https://github.com/owner/profile/actions' } })
    }
    if (url.pathname === '/rest/v1/message') {
      if (method === 'POST') {
        if (state.sendFailure) return route.fulfill({ status: 503, json: { message: 'Unavailable' } })
        state.messages.unshift({ id: state.messages.length + 1, content: request.postDataJSON().content, created_at: new Date().toISOString(), hidden: false })
        return route.fulfill({ status: 201 })
      }
      if (method === 'PATCH') { const row = state.messages.find(row => String(row.id) === url.searchParams.get('id')?.slice(3))!; row.hidden = request.postDataJSON().hidden; return route.fulfill({ json: [{ id: row.id }] }) }
      if (method === 'DELETE') { const id = Number(url.searchParams.get('id')?.slice(3)); state.messages = state.messages.filter(row => row.id !== id); return route.fulfill({ json: [{ id }] }) }
      const hidden = url.searchParams.get('hidden')
      const isOwner = request.headers().authorization === 'Bearer ' + token
      const rows = state.messages.filter(row => (isOwner || !row.hidden) && (!hidden || row.hidden === (hidden === 'eq.true'))).slice(0, Number(url.searchParams.get('limit') || 100))
      return route.fulfill({ json: rows, headers: { 'content-range': '0-' + (rows.length-1) + '/' + rows.length } })
    }
    if (url.pathname === '/rest/v1/rpc/record_page_view') { state.visits.push(request.postDataJSON()); return route.fulfill({ status: 204 }) }
    if (url.pathname === '/rest/v1/rpc/admin_visit_summary') return route.fulfill({ json: { since: '2026-10-24T00:00:00+08:00', views: 126, sessions: 83, today: 24, daily: [8, 12, 21, 16, 18, 27, 24].map((views, i) => ({ date: '2026-10-' + (24+i), views })), sources: [{ host: 'github.com', views: 72 }, { host: '', views: 54 }] } })
    if (url.pathname === '/rest/v1/page_views') return route.fulfill({ json: [{ id: 1, created_at: '2026-10-30T01:00:00Z', page_path: '/profile/', referrer_host: 'github.com', device_type: 'desktop' }], headers: { 'content-range': '0-0/1' } })
    throw new Error('Unhandled test request: ' + method + ' ' + url.pathname)
  })
  return state
}
async function login(page: Page) {
  await page.goto('/#/admin')
  await page.getByLabel('管理员邮箱').fill('owner@example.com')
  await page.getByLabel('密码', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: '登录工作台', exact: true }).click()
}

test('public resume preserves content, print layout and minimal anonymous analytics', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/')
  await expect(page.locator('article.page')).toHaveCount(2)
  for (let i=0; i<2; i++) {
    const actual = await page.locator('.resume-content').nth(i).innerText()
    const expected = await page.evaluate(html => new DOMParser().parseFromString(html, 'text/html').body.textContent, source.pages[i]!.html)
    expect(actual.replace(/\s/g, '')).toBe(expected!.replace(/\s/g, ''))
  }
  await expect.poll(() => state.visits.length).toBe(1)
  expect(Object.keys(state.visits[0]!).sort()).toEqual(['device_type', 'event_id', 'page_path', 'referrer_host', 'session_id'])
  await page.goto('/#/admin')
  await expect(page.getByLabel('管理员邮箱')).toBeVisible()
  expect(state.visits.length).toBe(1)
  await page.goto('/')
  await expect.poll(() => state.visits.length).toBe(2)
  expect(state.visits[0]!.session_id).toBe(state.visits[1]!.session_id)
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.guestbook')).toBeHidden()
  await expect(page.locator('.site-footer')).toBeHidden()
  await page.pdf({ path: '.artifacts/resume-print.pdf', preferCSSPageSize: true })
  expect(state.exceptions).toEqual([])
})

test('non-administrator login never opens the editor', async ({ page }) => {
  const state = await setup(page, false)
  await login(page)
  await expect(page.getByRole('alert')).toContainText('没有站长权限')
  await expect(page.getByRole('button', { name: '保存并发布' })).toHaveCount(0)
  expect(state.posted).toBeNull()
})

test('reading layout navigates without recording extra visits and fits small screens', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/')
  await expect.poll(() => state.visits.length).toBe(1)
  await expect(page.locator('.reading-sidebar')).toBeVisible()
  await expect(page.locator('.portrait')).toHaveCount(0)
  await page.getByRole('navigation', { name: '简历目录' }).getByRole('link', { name: '项目经历' }).click()
  expect(await page.locator('#resume-section-3').evaluate(el => Math.abs(el.getBoundingClientRect().top - 24)) < 2).toBe(true)
  expect(state.visits).toHaveLength(1)
  for (const width of [900, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.locator('.reading-sidebar')).toBeHidden()
  }
  expect(state.exceptions).toEqual([])
})

test('simple guestbook retains failed drafts, publishes and loads additional comments', async ({ page }) => {
  const state = await setup(page)
  state.messages = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, content: '留言 ' + (i + 1), created_at: '2026-10-30T01:00:00Z', hidden: false }))
  await page.goto('/')
  await expect(page.locator('.guestbook-message')).toHaveCount(8)
  await page.getByRole('button', { name: '查看更多留言' }).click()
  await expect(page.locator('.guestbook-message')).toHaveCount(10)
  const draft = page.getByRole('textbox', { name: '你的留言' })
  await draft.fill('希望了解更多项目细节。')
  state.sendFailure = true
  await page.getByRole('button', { name: '发布留言', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('内容已保留')
  await expect(draft).toHaveValue('希望了解更多项目细节。')
  state.sendFailure = false
  await page.getByRole('button', { name: '发布留言', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('留言已发布。')
  await expect(draft).toHaveValue('')
  await expect(page.locator('.guestbook-message').first()).toContainText('希望了解更多项目细节。')
  await expect(page.getByRole('button', { name: /秒后可发布/ })).toBeDisabled()
  expect(state.exceptions).toEqual([])
})

test('editing preserves existing content, posts source version, and distinguishes commit from deployment', async ({ page }) => {
  const state = await setup(page)
  await login(page)
  await expect(page.getByText('已与仓库同步', { exact: true })).toBeVisible()
  const editor = page.getByRole('textbox', { name: '简历正文编辑器' })
  await expect(editor).toBeVisible()
  const before = (await editor.innerText()).replace(/\s/g, '')
  const expected = await page.evaluate(html => new DOMParser().parseFromString(html, 'text/html').body.textContent, source.pages[0]!.html)
  expect(before).toBe(expected!.replace(/\s/g, ''))
  await editor.click()
  await editor.press('Control+End')
  await editor.press('Enter')
  await page.keyboard.insertText('新增的项目说明。')
  await expect(page.getByText('有未发布修改', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '基本信息', exact: true }).click()
  await page.getByLabel('求职意向', { exact: true }).fill('AI 应用开发与 Agent 系统')
  await page.getByRole('button', { name: '保存并发布', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('已提交到 GitHub')
  expect(state.posted?.expectedSha).toBe(initialSha)
  expect(state.posted?.document.profile.jobIntention).toBe('AI 应用开发与 Agent 系统')
  expect(state.posted?.document.pages[0]!.html).toContain('新增的项目说明。')
  expect(state.posted?.document.pages[0]!.html).toContain('Circuit Muse')
  await expect(page.getByRole('button', { name: '保存并发布', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '第 2 页', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '简历正文编辑器' })).toContainText('Story')
  await fs.mkdir('.artifacts', { recursive: true })
  await page.screenshot({ path: '.artifacts/admin-editor.png', fullPage: true })
  expect(state.exceptions).toEqual([])
})

test('version conflicts keep input and recovery restores an unpublished draft', async ({ page }) => {
  const state = await setup(page)
  await login(page)
  await expect(page.getByText('已与仓库同步', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '基本信息', exact: true }).click()
  await page.getByLabel('姓名', { exact: true }).fill('尚未发布的姓名')
  state.conflict = true
  await page.getByRole('button', { name: '保存并发布', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('已阻止覆盖')
  await expect(page.getByLabel('姓名', { exact: true })).toHaveValue('尚未发布的姓名')
  page.on('dialog', dialog => dialog.accept())
  await page.reload()
  await page.getByRole('button', { name: '恢复草稿', exact: true }).click()
  await page.getByRole('button', { name: '基本信息', exact: true }).click()
  await expect(page.getByLabel('姓名', { exact: true })).toHaveValue('尚未发布的姓名')
  expect(state.document.profile.name).toBe(source.profile.name)
})

test('missing source service blocks publishing without blocking the dashboard', async ({ page }) => {
  const state = await setup(page)
  state.sourceUnavailable = true
  await login(page)
  await expect(page.getByRole('alert')).toContainText('尚未配置 GitHub 保存服务')
  await expect(page.getByRole('button', { name: '保存并发布', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '访问统计' }).click()
  await expect(page.getByText('126', { exact: true })).toBeVisible()
})

test('owner can hide/restore/delete messages and inspect visits on desktop and mobile', async ({ page }) => {
  const state = await setup(page)
  await login(page)
  await page.getByRole('button', { name: '留言管理' }).click()
  await page.getByRole('button', { name: '隐藏留言', exact: true }).click()
  await expect.poll(() => state.messages[0]!.hidden).toBe(true)
  await page.locator('.admin-message').filter({ hasText: '很喜欢你的项目' }).getByRole('button', { name: '恢复公开', exact: true }).click()
  await expect.poll(() => state.messages[0]!.hidden).toBe(false)
  page.on('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '删除', exact: true }).last().click()
  await expect.poll(() => state.messages.length).toBe(1)
  await page.getByRole('button', { name: '访问统计' }).click()
  await expect(page.getByText('126', { exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'github.com' })).toBeVisible()
  await page.screenshot({ path: '.artifacts/admin-visits.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: '.artifacts/admin-mobile.png', fullPage: true })
  expect(state.exceptions).toEqual([])
})
