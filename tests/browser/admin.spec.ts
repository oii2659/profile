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
  await page.goto('/admin')
  await page.getByLabel('管理员邮箱').fill('owner@example.com')
  await page.getByLabel('密码', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: '登录工作台', exact: true }).click()
}

test('public resume preserves content, print layout and minimal anonymous analytics', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/')
  await expect(page.locator('article.page')).toHaveCount(2)
  for (let i=0; i<2; i++) {
    const actual = await page.locator('.print-resume .resume-content').nth(i).textContent()
    const expected = await page.evaluate(html => new DOMParser().parseFromString(html, 'text/html').body.textContent, source.pages[i]!.html)
    expect(actual!.replace(/\s/g, '')).toBe(expected!.replace(/\s/g, ''))
  }
  await expect.poll(() => state.visits.length).toBe(1)
  expect(Object.keys(state.visits[0]!).sort()).toEqual(['device_type', 'event_id', 'page_path', 'referrer_host', 'session_id'])
  await page.goto('/admin')
  await expect(page.getByLabel('管理员邮箱')).toBeVisible()
  expect(state.visits.length).toBe(1)
  await page.goto('/')
  await expect.poll(() => state.visits.length).toBe(2)
  expect(state.visits[0]!.session_id).toBe(state.visits[1]!.session_id)
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.guestbook')).toBeHidden()
  await expect(page.locator('.site-footer')).toBeHidden()
  await fs.mkdir('.artifacts', { recursive: true })
  await page.pdf({ path: '.artifacts/resume-print.pdf', preferCSSPageSize: true })
  const pdf = await fs.readFile('.artifacts/resume-print.pdf')
  expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(2)
  expect(state.exceptions).toEqual([])
})

test('non-administrator login never opens the editor', async ({ page }) => {
  const state = await setup(page, false)
  await login(page)
  await expect(page.getByRole('alert')).toContainText('没有站长权限')
  await expect(page.getByRole('button', { name: '保存并发布' })).toHaveCount(0)
  expect(state.posted).toBeNull()
})

test('print choices preserve the compact version and open a complete design preview', async ({ page, context }) => {
  const state = await setup(page)
  await page.goto('/')
  await expect.poll(() => state.visits.length).toBe(1)
  const firstProject = page.locator('.scan-item').first()
  await firstProject.locator('summary').click()
  await page.evaluate(() => { window.print = () => { document.body.dataset.printed = 'true' } })
  await page.getByRole('button', { name: '打印 / 保存 PDF' }).click()
  const dialog = page.getByRole('dialog', { name: '选择打印样式' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: /简洁版/ }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('body')).toHaveAttribute('data-printed', 'true')
  await page.getByRole('button', { name: '打印 / 保存 PDF' }).click()
  const previewPromise = context.waitForEvent('page')
  await dialog.getByRole('button', { name: /设计版/ }).click()
  const preview = await previewPromise
  await expect(preview.locator('.design-print')).toBeVisible()
  await expect(preview.locator('.scan-item[open]')).toHaveCount(5)
  await expect(preview.locator('.skill-item[open]')).toHaveCount(4)
  await preview.locator('.skill-item summary').first().focus()
  await preview.keyboard.press('Enter')
  await expect(preview.locator('.skill-item[open]')).toHaveCount(4)
  await expect(preview.locator('.guestbook')).toHaveCount(0)
  await expect(preview.locator('.print-resume')).toHaveCount(0)
  await expect(firstProject).toHaveAttribute('open', '')
  expect(state.visits).toHaveLength(1)
  await preview.emulateMedia({ media: 'print' })
  await expect(preview.locator('.toolbar')).toBeHidden()
  await expect(preview.locator('.scan-resume')).toBeVisible()
  for (const detail of await preview.locator('.scan-detail').all()) await expect(detail).toBeVisible()
  await preview.evaluate(() => document.fonts.ready)
  await fs.mkdir('.artifacts', { recursive: true })
  // Exercise the browser's default headers too: the design must suppress them.
  await preview.pdf({ path: '.artifacts/resume-design.pdf', preferCSSPageSize: true, printBackground: true, displayHeaderFooter: true })
  const pdf = await fs.readFile('.artifacts/resume-design.pdf')
  expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(3)
  await preview.close()
})

test('design preview downloads a continuous PNG on desktop and mobile', async ({ page }) => {
  await setup(page)
  await page.goto('/?print=design')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出长图 PNG' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe(source.profile.name + '-简历-设计版长图.png')
    const path = `.artifacts/resume-long-${width}.png`
    await download.saveAs(path)
    const png = await fs.readFile(path)
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    const imageWidth = png.readUInt32BE(16)
    const imageHeight = png.readUInt32BE(20)
    expect(imageWidth).toBeGreaterThanOrEqual(1080)
    expect(imageHeight).toBeGreaterThan(imageWidth * 2)
    await expect(page.getByRole('button', { name: '导出长图 PNG' })).toBeEnabled()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.locator('iframe')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})

test('reading layout navigates without recording extra visits and fits small screens', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/')
  await expect.poll(() => state.visits.length).toBe(1)
  await expect(page.getByRole('navigation', { name: '简历目录' })).toHaveCount(0)
  await expect(page.locator('.scan-controls')).toHaveCount(0)
  await expect(page.locator('.resume-education')).toContainText('竞赛经历：')
  await expect(page.locator('.resume-education')).toContainText('修读课程：')
  await expect(page.locator('.resume-education')).toContainText('全国大学生数学建模竞赛')
  await expect(page.locator('.resume-education')).toContainText('均取得 90+')
  await expect(page.locator('.scan-overview')).not.toContainText('竞赛经历')
  await expect(page.locator('.scan-overview')).not.toContainText('修读课程')
  await expect(page.locator('.scan-overview details')).toHaveCount(0)
  await expect(page.locator('.portrait')).toHaveCount(0)
  await page.getByRole('navigation', { name: '简历操作' }).getByRole('button', { name: '留言' }).click()
  await expect(page.locator('#guestbook')).toBeFocused()
  expect(state.visits).toHaveLength(1)
  await expect(page).toHaveURL('http://127.0.0.1:5180/')
  for (const width of [900, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  expect(state.exceptions).toEqual([])
})

test('old public links become clean URLs while admin routing remains available', async ({ page }) => {
  await setup(page)
  await page.goto('/?v=0c489c3#resume-section-2-item-1')
  await expect(page).toHaveURL('http://127.0.0.1:5180/')
  await expect(page.locator('#resume-section-2-item-1')).toHaveAttribute('open', '')
  await expect(page.locator('.scan-facts')).toHaveCount(0)
  await page.getByRole('navigation', { name: '简历操作' }).getByRole('button', { name: '留言' }).click()
  await expect(page).toHaveURL('http://127.0.0.1:5180/')
  await expect(page.locator('#guestbook')).toBeFocused()
  // The public footer no longer exposes the admin link; direct routing stays available.
  await page.goto('/admin')
  await expect(page.getByLabel('管理员邮箱')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('管理员邮箱')).toBeVisible()
  await expect(page).toHaveURL('http://127.0.0.1:5180/admin')
})

test('mobile first visit stays readable with unavailable fonts and desktop keeps two columns', async ({ page }) => {
  const state = await setup(page)
  await page.route(/\.(?:woff2?|ttf)(?:\?.*)?$/, route => route.abort())
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('.scan-header h1')).toHaveText(source.profile.name)
  await expect(page.locator('.mobile-contact')).toBeVisible()
  await expect(page.locator('.mobile-contact a').first()).toHaveAttribute('href', 'mailto:' + source.profile.email)
  for (const width of [320, 360, 390, 430, 650, 768, 820, 900, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const columns = await page.locator('.resume-columns').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)
    expect(columns).toBe(width <= 820 ? 1 : 2)
    if (width <= 820) {
      await expect(page.locator('.mobile-contact .contact-value').first()).toHaveText(source.profile.email)
      await expect(page.locator('.mobile-contact .contact-value').last()).toHaveText(source.profile.phone)
      for (const value of await page.locator('.mobile-contact .contact-value').all()) {
        expect(await value.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      }
      expect(await page.locator('.scan-teaser').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(15)
      expect((await page.locator('.scan-toggle').first().boundingBox())!.width).toBeGreaterThanOrEqual(44)
      expect(await page.locator('.guestbook textarea').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16)
      const watermark = await page.locator('.resume-watermark').boundingBox()
      const header = await page.locator('.scan-header').boundingBox()
      expect(watermark!.x + watermark!.width).toBeLessThanOrEqual(header!.x + header!.width)
    }
  }
  await page.setViewportSize({ width: 320, height: 844 })
  const project = page.locator('.scan-experience .scan-item').first()
  await project.locator('.scan-toggle').click()
  await expect(project.locator('.scan-detail')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
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

test('admin paths and legacy bookmarks open the login page without counting public visits', async ({ page }) => {
  const state = await setup(page)
  for (const path of ['/admin', '/admin/', '/admin/index.html', '/#/admin']) {
    await page.goto(path)
    await expect(page.getByLabel('管理员邮箱')).toBeVisible()
    await expect(page).toHaveURL('http://127.0.0.1:5180/admin')
    await page.reload()
    await expect(page.getByLabel('管理员邮箱')).toBeVisible()
  }
  expect(state.visits).toHaveLength(0)
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('link', { name: '查看公开网站' }).click()
  const popup = await popupPromise
  await expect(popup).toHaveURL('http://127.0.0.1:5180/')
  await popup.close()
  await page.getByRole('link', { name: 'M / 简历工作台' }).click()
  await expect(page.locator('.scan-resume')).toBeVisible()
  await expect(page).toHaveURL('http://127.0.0.1:5180/')
  await page.goBack()
  await expect(page.getByLabel('管理员邮箱')).toBeVisible()
  await page.goForward()
  await expect(page.locator('.scan-resume')).toBeVisible()
  expect(state.exceptions).toEqual([])
})

test('scan view keeps full content and updates project details from the source', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/')
  await expect(page.locator('.scan-item[open]')).toHaveCount(0)
  const compactLength = await page.locator('.scan-resume').innerText().then(text => text.length)
  await page.locator('.scan-item').filter({ has: page.locator('summary', { hasText: '春晓服装工序生成系统' }) }).locator('summary').click()
  const evidence = page.locator('.scan-item[open]')
  await expect(evidence).toContainText('98.90%')
  await expect(evidence.locator('.scan-detail')).toBeVisible()
  for (const item of await page.locator('.scan-item').all()) {
    if (await item.getAttribute('open') === null) await item.locator('summary').click()
  }
  await expect(page.locator('.scan-item[open]')).toHaveCount(await page.locator('.scan-item').count())
  for (const item of await page.locator('.scan-item').all()) {
    for (const preview of await item.locator('summary > .scan-teaser, summary > .scan-flow, summary > .scan-keywords').all()) {
      await expect(preview).toBeHidden()
    }
  }
  const robot = page.locator('.scan-item').filter({ has: page.locator('summary', { hasText: 'STEMM 智能机器人小程序' }) })
  expect((await robot.innerText()).match(/基于 uni-app 开发的陪伴型机器人配套微信小程序/g)).toHaveLength(1)
  await expect(robot.locator('.scan-detail')).toContainText('约 8 秒降至约 3 秒')
  const fullLength = await page.locator('.scan-resume').innerText().then(text => text.length)
  expect(compactLength).toBeLessThan(fullLength * .5)
  const circuit = page.locator('.scan-item').filter({ has: page.locator('summary', { hasText: 'Circuit Muse' }) })
  await expect(circuit.locator('.scan-detail')).toContainText('WebSerial')
  for (const item of await page.locator('.scan-item').all()) await item.locator('summary').click()
  await expect(page.locator('.scan-item[open]')).toHaveCount(0)
  await expect(robot.locator('.scan-teaser')).toBeVisible()
  // Details can be reopened without changing the public URL.
  await page.locator('.scan-item').filter({ has: page.locator('summary', { hasText: '春晓服装工序生成系统' }) }).locator('summary').click()
  await expect(page.locator('.scan-item[open]')).toHaveCount(1)
  const result = await page.evaluate(async original => {
    const modulePath = '/src/lib/reading.ts'
    const { buildReadingResume } = await import(modulePath)
    const updated = structuredClone(original)
    updated.pages[0].html = updated.pages[0].html.replaceAll('98.90%', '97.50%')
    const model = buildReadingResume(updated)
    const toText = (html: string) => new DOMParser().parseFromString(html, 'text/html').body.textContent!.replace(/\s/g, '')
    const reconstructed = model.sections.map((section: { title: string; lead: string; items: { html: string }[] }) => section.title + section.lead + section.items.map(item => item.html).join('')).join('')
    return { content: reconstructed, preserved: toText(reconstructed) === toText(updated.pages.map(page => page.html).join('')) }
  }, source)
  expect(result.preserved).toBe(true)
  expect(result.content).toContain('97.50%')
  expect(result.content).not.toContain('98.90%')
  await expect(page).toHaveURL('http://127.0.0.1:5180/')
  expect(state.exceptions).toEqual([])
})

test('skill circles show self-assessments and reveal matching details by mouse and keyboard', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/')
  await expect(page.locator('.scan-header img')).toHaveCount(0)
  const skills = page.locator('.skill-item')
  const expected = [
    { title: 'Agent 开发', score: '85%', content: 'LangGraph' },
    { title: 'Agent 系统工程', score: '85%', content: '上下文隔离' },
    { title: '后端开发', score: '80%', content: 'FastAPI' },
    { title: '前端开发', score: '95%', content: 'React' },
  ]
  for (const [index, skill] of expected.entries()) {
    const item = skills.nth(index)
    await expect(item.locator('.skill-score')).toHaveText(skill.score)
    await expect(item.locator('summary')).toContainText(skill.title)
    await item.locator('.skill-gauge').click()
    await expect(item.locator('.scan-detail')).toBeVisible()
    await expect(item.locator('.scan-detail')).toContainText(skill.content)
    const positions = await item.evaluate(el => {
      const summary = el.querySelector('summary')!.getBoundingClientRect()
      const detail = el.querySelector('.scan-detail')!.getBoundingClientRect()
      return { gap: detail.top - summary.bottom, width: el.getBoundingClientRect().width, gridWidth: el.parentElement!.getBoundingClientRect().width }
    })
    expect(positions.gap).toBeGreaterThanOrEqual(0)
    expect(positions.gap).toBeLessThanOrEqual(12)
    expect(positions.width).toBe(positions.gridWidth)
    expect(await item.locator('summary').evaluate(el => getComputedStyle(el).webkitTapHighlightColor)).toBe('rgba(0, 0, 0, 0)')
    await item.locator('summary').focus()
    await page.keyboard.press('Enter')
    await expect(item.locator('.scan-detail')).toBeHidden()
  }
  await page.setViewportSize({ width: 320, height: 844 })
  await skills.first().locator('summary').click()
  await expect(skills.first().locator('.scan-detail')).toBeVisible()
  expect(await skills.first().locator('summary').evaluate(el => getComputedStyle(el).outlineStyle)).toBe('none')
  await skills.nth(1).locator('summary').click()
  await expect(skills.nth(1).locator('.scan-detail')).toBeVisible()
  await expect(skills.first().locator('.scan-detail')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(page).toHaveURL('http://127.0.0.1:5180/')
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
