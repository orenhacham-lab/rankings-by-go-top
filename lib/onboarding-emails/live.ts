/**
 * The setup-email run's real dependencies: the service-role client, the account lookup and
 * the provider (Resend, as lib/reminders/live.ts). Nothing here runs unless
 * lib/onboarding-emails/run.ts passed its gate (ONBOARDING_EMAILS_ENABLED, a sending key,
 * an explicit sender, an https origin), so importing this file sends nothing.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeDashboardUiLocale } from '@/lib/i18n/dashboard/locale'
import type { OnboardingDeps, OnboardingOwner, OutgoingOnboarding } from './run'

async function send({ to, email }: OutgoingOnboarding): Promise<{ ok: boolean }> {
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL as string,
    to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    headers: email.headers,
  })
  if (result.error) {
    console.error('[onboarding-emails] provider refused', { name: result.error.name })
    return { ok: false }
  }
  return { ok: true }
}

export function liveOnboardingDeps(): OnboardingDeps {
  const admin = createAdminClient()
  return {
    admin,
    env: process.env,
    now: () => new Date(),
    owner: async (userId): Promise<OnboardingOwner | null> => {
      const { data, error } = await admin.auth.admin.getUserById(userId)
      if (error || !data?.user) return null
      const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>
      const full = typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : ''
      const first = full.trim().split(/\s+/)[0] ?? ''
      const { data: shop } = await admin.from('shopify_connections').select('id').eq('user_id', userId).is('archived_at', null).limit(1)
      return {
        email: typeof data.user.email === 'string' ? data.user.email : null,
        // All four published languages: the dictionary has them, so the email does too.
        locale: normalizeDashboardUiLocale(meta.locale),
        firstName: first ? first.slice(0, 40) : null,
        shopify: Array.isArray(shop) && shop.length > 0,
      }
    },
    send,
  }
}
