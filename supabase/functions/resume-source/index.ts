import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { createResumeHandler } from '../_shared/resume-handler.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(10000) }) },
})
Deno.serve(createResumeHandler({
  origins: (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(value => value.trim()).filter(Boolean),
  repository: Deno.env.get('GITHUB_REPOSITORY') ?? '',
  branch: Deno.env.get('GITHUB_BRANCH') ?? 'main',
  token: Deno.env.get('GITHUB_TOKEN') ?? '',
}, async token => {
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return false
  const adminRow = await admin.from('site_admins').select('user_id').eq('user_id', data.user.id).maybeSingle()
  return !adminRow.error && Boolean(adminRow.data)
}))
