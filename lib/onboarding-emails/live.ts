/**
 * The setup-email run's real dependencies: the service-role client, the account lookup and
 * the provider (Resend, as lib/reminders/live.ts). Nothing here runs unless
 * lib/onboarding-emails/run.ts passed its gate (ONBOARDING_EMAILS_ENABLED, a sending key,
 * an explicit sender, an https origin), so importing this file sends nothing.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/auth/admin-role'
import { loadBillingGovernance } from '@/lib/billing/governance'
import { normalizeDashboardUiLocale } from '@/lib/i18n/dashboard/locale'
import type { OnboardingDeps, OnboardingOwner, OutgoingOnboarding } from './run'

async function send({ to, email }: OutgoingOnboarding): Promise<{ ok: boolean }> {
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
      // Provenance, not an integration record: see lib/reminders/recipient.ts.
      const governance = await loadBillingGovernance(admin, userId)
      const shopifyAppStoreOrigin = governance.status === 'loaded'
        ? governance.governance.signupOrigin === 'shopify_app_store'
        : governance.status === 'missing' ? false : null
      return {
        email: typeof data.user.email === 'string' ? data.user.email : null,
        // All four published languages: the dictionary has them, so the email does too.
        locale: normalizeDashboardUiLocale(meta.locale),
        firstName: first ? first.slice(0, 40) : null,
        shopifyAppStoreOrigin,
        // An administrator's own projects get no customer email at all.
        staff: await isAdminUser(admin, userId),
      }
    },
    send,
  }
}
