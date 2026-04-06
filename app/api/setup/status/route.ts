/**
 * GET /api/setup/status
 *
 * Public endpoint — no auth required (needed before auth is configured).
 * Tests each integration and returns live status.
 */

import { createAdminClient } from '@/lib/supabase/admin'

interface ServiceStatus {
  ok: boolean
  label: string
  detail: string
}

interface StatusResponse {
  supabase: ServiceStatus
  serper: ServiceStatus
  envVars: {
    supabaseUrl: boolean
    supabaseAnonKey: boolean
    supabaseServiceKey: boolean
    serperKey: boolean
  }
}

export async function GET(): Promise<Response> {
  const envVars = {
    supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your_'),
    supabaseAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.includes('your_'),
    supabaseServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('your_'),
    serperKey: !!process.env.SERPER_API_KEY && !process.env.SERPER_API_KEY.includes('your_'),
  }

  // ── Test Supabase ───────────────────────────────────────────────
  let supabase: ServiceStatus

  if (!envVars.supabaseUrl || !envVars.supabaseServiceKey) {
    supabase = {
      ok: false,
      label: 'לא מוגדר',
      detail: 'משתני הסביבה NEXT_PUBLIC_SUPABASE_URL ו-SUPABASE_SERVICE_ROLE_KEY חסרים.',
    }
  } else {
    try {
      const admin = createAdminClient()
      // Simple health-check: list tables — fails fast if creds are wrong
      const { error } = await admin.from('clients').select('id').limit(1)
      if (error) {
        supabase = { ok: false, label: 'שגיאת חיבור', detail: error.message }
      } else {
        supabase = { ok: true, label: 'מחובר', detail: `חיבור למסד הנתונים תקין. URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/^https?:\/\//, '').split('.')[0]}...` }
      }
    } catch (err) {
      supabase = { ok: false, label: 'שגיאה', detail: (err as Error).message }
    }
  }

  // ── Test Serper ─────────────────────────────────────────────────
  let serper: ServiceStatus

  if (!envVars.serperKey) {
    serper = {
      ok: false,
      label: 'לא מוגדר',
      detail: 'משתנה הסביבה SERPER_API_KEY חסר.',
    }
  } else {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8000)

      let response: Response
      try {
        response = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'X-API-KEY': process.env.SERPER_API_KEY!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ q: 'test', gl: 'il', hl: 'he', num: 1 }),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timer)
      }

      if (response.ok) {
        serper = { ok: true, label: 'מחובר', detail: 'ה-API של Serper פועל ומחזיר תוצאות.' }
      } else {
        const text = await response.text().catch(() => '')
        serper = {
          ok: false,
          label: `שגיאה ${response.status}`,
          detail: text ? text.slice(0, 200) : `HTTP ${response.status}`,
        }
      }
    } catch (err) {
      const msg = (err as Error).message
      serper = {
        ok: false,
        label: (err as Error).name === 'AbortError' ? 'תם הזמן' : 'שגיאה',
        detail: msg,
      }
    }
  }

  const result: StatusResponse = { supabase, serper, envVars }
  return Response.json(result)
}
