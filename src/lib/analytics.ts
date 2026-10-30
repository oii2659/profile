import { supabase } from '../supabase'
let recorded = false
export async function recordVisit() {
  if (recorded || !recordVisit.enabled || !supabase || navigator.doNotTrack === '1') return
  recorded = true
  try {
    let sessionId: string
    try {
      sessionId = sessionStorage.getItem('resume-visit-session') || crypto.randomUUID()
      sessionStorage.setItem('resume-visit-session', sessionId)
    } catch { sessionId = crypto.randomUUID() }
    let referrer = ''
    try { referrer = document.referrer ? new URL(document.referrer).hostname : '' } catch { /* No referrer. */ }
    await supabase.rpc('record_page_view', {
      event_id: crypto.randomUUID(), session_id: sessionId,
      page_path: window.location.pathname.slice(0, 200),
      referrer_host: referrer.slice(0, 200),
      device_type: window.innerWidth < 768 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop',
    })
  } catch { /* Analytics must never interrupt the resume. */ }
}
recordVisit.enabled = import.meta.env.VITE_ENABLE_ANALYTICS === 'true'
