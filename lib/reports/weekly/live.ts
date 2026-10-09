/**
 * The weekly summary's real dependencies: the service-role client, the account lookup and
 * the provider (Resend, as lib/reminders/live.ts). Nothing here runs unless
 * lib/reports/weekly/run.ts passed its gate, so importing this file sends nothing.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeDashboardUiLocale } from '@/lib/i18n/dashboard/locale'
import type { OutgoingWeekly, WeeklyDeps, WeeklyOwner } from './run'

async function send({ to, email }: OutgoingWeekly): Promise<{ ok: boolean }> {
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL as string,
    // A customer who hits reply must reach a person. The sending subdomain has no inbox,
    // so the answer goes wherever RESEND_REPLY_TO points; without it the email simply
    // carries no Reply-To, exactly as before.
    ...(process.env.RESEND_REPLY_TO ? { replyTo: process.env.RESEND_REPLY_TO } : {}),
    to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    headers: email.headers,
  })
  if (result.error) {
    console.error('[weekly-summary] provider refused', { name: result.error.name })
    return { ok: false }
  }
  return { ok: true }
}

export function liveWeeklyDeps(): WeeklyDeps {
  const admin = createAdminClient()
  return {
    admin,
    env: process.env,
    now: () => new Date(),
    owner: async (userId): Promise<WeeklyOwner | null> => {
      const { data, error } = await admin.auth.admin.getUserById(userId)
      if (error || !data?.user) return null
      const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>
      const full = typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : ''
      const first = full.trim().split(/\s+/)[0] ?? ''
      const { data: shop } = await admin.from('shopify_connections').select('id').eq('user_id', userId).is('archived_at', null).limit(1)
      return {
        email: typeof data.user.email === 'string' ? data.user.email : null,
        locale: normalizeDashboardUiLocale(meta.locale),
        firstName: first ? first.slice(0, 40) : null,
        shopify: Array.isArray(shop) && shop.length > 0,
      }
    },
    send,
  }
}
