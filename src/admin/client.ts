import { createClient, FunctionsHttpError } from '@supabase/supabase-js'
const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
// Separate storage prevents administrator tokens being used for public guestbook requests.
export const adminClient = url && /^https?:\/\//.test(url) && key
  ? createClient(url, key, {
    auth: { storageKey: 'resume-admin-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(20000) }) },
  }) : null

export async function sourceRequest(method: 'GET' | 'POST', body?: unknown) {
  if (!adminClient) throw new Error('尚未配置 Supabase')
  const { data, error } = await adminClient.functions.invoke('resume-source', { method, ...(body ? { body } : {}) })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null)
      if (payload?.error) throw new Error(payload.error)
    }
    throw new Error('无法连接简历保存服务，请检查登录状态和后端配置。草稿仍保留在当前页面。')
  }
  return data
}
