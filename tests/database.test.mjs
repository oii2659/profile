import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('guestbook and administration SQL enforce real PostgreSQL permissions', async t => {
  const db = new PGlite()
  const owner = '00000000-0000-4000-8000-000000000001'
  const stranger = '00000000-0000-4000-8000-000000000002'
  const asRole = (role, id, run) => db.transaction(async tx => {
    await tx.exec(`set local role ${role}`)
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [id || ''])
    return run(tx)
  })
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema auth to anon, authenticated;
      insert into auth.users values ('${owner}'), ('${stranger}');
    `)
    for (const file of ['supabase/guestbook.sql', 'supabase/guestbook.sql', 'supabase/admin.sql', 'supabase/admin.sql']) {
      await db.exec(await fs.readFile(file, 'utf8'))
    }
    await db.query('insert into public.site_admins (user_id) values ($1)', [owner])
    await t.test('anonymous readers can post valid content but cannot edit or delete', async () => {
      await asRole('anon', null, tx => tx.query('insert into public.message (content) values ($1)', ['一条公开留言']))
      await assert.rejects(asRole('anon', null, tx => tx.exec("insert into public.message (content) values ('   ')")))
      await assert.rejects(asRole('anon', null, tx => tx.query('insert into public.message (content) values ($1)', ['字'.repeat(1001)])))
      await assert.rejects(asRole('anon', null, tx => tx.exec("update public.message set content = '修改'")))
      await assert.rejects(asRole('anon', null, tx => tx.exec('delete from public.message')))
      const result = await asRole('anon', null, tx => tx.exec('select id,content,created_at from public.message'))
      assert.equal(result[0].rows.length, 1)
    })
    await t.test('only enrolled administrator can moderate; old permissive policies cannot expose hidden messages', async () => {
      await db.exec('create policy legacy_anon_read on public.message for select to anon using (true); create policy legacy_user_read on public.message for select to authenticated using (true)')
      await asRole('authenticated', owner, tx => tx.exec('update public.message set hidden = true returning id'))
      assert.equal((await asRole('anon', null, tx => tx.exec('select id,content from public.message')))[0].rows.length, 0)
      assert.equal((await asRole('authenticated', stranger, tx => tx.exec('select id,content,hidden from public.message')))[0].rows.length, 0)
      assert.equal((await asRole('authenticated', owner, tx => tx.exec('select id,content,hidden from public.message')))[0].rows.length, 1)
      const noDelete = await asRole('authenticated', stranger, tx => tx.exec('delete from public.message returning id'))
      assert.equal(noDelete[0].rows.length, 0)
      await assert.rejects(asRole('authenticated', stranger, tx => tx.query('insert into public.site_admins (user_id) values ($1)', [stranger])))
      await assert.rejects(asRole('anon', null, tx => tx.exec('select * from public.site_admins')))
      await asRole('authenticated', owner, tx => tx.exec('update public.message set hidden = false'))
    })
    await t.test('visit recording is deduplicated, validated and private', async () => {
      const record = tx => tx.query('select public.record_page_view($1,$2,$3,$4,$5)', ['10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '/profile/', 'github.com', 'desktop'])
      await asRole('anon', null, record)
      await asRole('anon', null, record)
      assert.equal((await db.query('select count(*)::int as count from public.page_views')).rows[0].count, 1)
      await assert.rejects(asRole('anon', null, tx => tx.exec('select * from public.page_views')))
      await assert.rejects(asRole('anon', null, tx => tx.exec('select public.admin_visit_summary(7)')))
      await assert.rejects(asRole('authenticated', stranger, tx => tx.exec('select public.admin_visit_summary(7)')))
      assert.equal((await asRole('authenticated', stranger, tx => tx.exec('select id,page_path from public.page_views')))[0].rows.length, 0)
      await assert.rejects(asRole('anon', null, tx => tx.query('select public.record_page_view($1,$2,$3,$4,$5)', ['10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '/?email=private', '', 'desktop'])))
      const stats = await asRole('authenticated', owner, tx => tx.query('select public.admin_visit_summary(7) as stats'))
      assert.equal(stats.rows[0].stats.views, 1)
      assert.equal(stats.rows[0].stats.sessions, 1)
      assert.equal(stats.rows[0].stats.today, 1)
      assert.equal(stats.rows[0].stats.daily.length, 7)
      assert.equal(stats.rows[0].stats.sources[0].host, 'github.com')
    })
  } finally { await db.close() }
})
