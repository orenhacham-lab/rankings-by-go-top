import type { User } from '@supabase/supabase-js'
import { escapeEmailHtml } from './email-escape'
import { deliverOperatorEmail, safeDomain, subjectWithDomain, type AlertDeps } from './operator-alerts'

/**
 * Admin notification for a new signup.
 *
 * The details come from the VERIFIED Supabase user (email + signup metadata),
 * never from a request body. The previous endpoint accepted
 * `{ fullName, email, companyName, phone }` from anyone, unauthenticated, and
 * interpolated them raw into the email HTML — an open relay for arbitrary HTML
 * (phishing links, fake "new account" notices) into the operator's inbox.
 */

/** Only accounts created this recently trigger a notification. */
export const SIGNUP_NOTIFICATION_WINDOW_MS = 30 * 60 * 1000

export { escapeEmailHtml }

export function isFreshSignup(user: Pick<User, 'created_at'>, now = Date.now()): boolean {
  const created = Date.parse(user.created_at ?? '')
  return Number.isFinite(created) && now - created >= 0 && now - created < SIGNUP_NOTIFICATION_WINDOW_MS
}

/** How the account was opened, from the verified auth record (never from a request). */
export function signupMethod(user: Pick<User, 'app_metadata'>): 'google' | 'email' {
  const meta = (user.app_metadata ?? {}) as { provider?: unknown; providers?: unknown }
  const providers = Array.isArray(meta.providers) ? meta.providers : []
  return meta.provider === 'google' || (meta.provider === undefined && providers.includes('google')) ? 'google' : 'email'
}

export type SignupSite = { domain: string | null; source: 'claim' | 'signup_form' | 'first_project' | null }

const SITE_SOURCE_LABEL: Record<NonNullable<SignupSite['source']>, string> = {
  claim: 'הבדיקה החינמית שביצע/ה לפני ההרשמה',
  signup_form: 'טופס ההרשמה',
  first_project: 'הפרויקט הראשון בחשבון',
}

export function buildSignupNotificationHtml(
  user: Pick<User, 'email' | 'user_metadata'> & Partial<Pick<User, 'app_metadata'>>,
  when: Date,
  site: SignupSite = { domain: null, source: null },
): string {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const field = (v: unknown) => (typeof v === 'string' && v.trim() ? escapeEmailHtml(v.trim().slice(0, 200)) : 'לא הוזן')
  const domain = safeDomain(site.domain)
  const method = signupMethod({ app_metadata: user.app_metadata ?? {} }) === 'google' ? 'Google' : 'דוא״ל וסיסמה'
  const siteRow = domain
    ? `${escapeEmailHtml(domain)}${site.source ? ` <span style="color: #64748b;">(מקור: ${escapeEmailHtml(SITE_SOURCE_LABEL[site.source])})</span>` : ''}`
    : 'לא ידוע עדיין'
  return `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">🎉 חשבון חדש נפתח ב-Go Top SEO!</h2>
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border-right: 4px solid #2563eb;">
            <p><strong>שם מלא:</strong> ${field(meta.full_name ?? meta.name)}</p>
            <p><strong>דוא״ל:</strong> ${field(user.email)}</p>
            <p><strong>שם חברה:</strong> ${field(meta.company_name)}</p>
            <p><strong>טלפון:</strong> ${field(meta.phone)}</p>
            <p><strong>אתר:</strong> ${siteRow}</p>
            <p><strong>הרשמה דרך:</strong> ${method}</p>
            <p><strong>זמן הרשמה:</strong> ${escapeEmailHtml(when.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }))}</p>
          </div>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e2e8f0;">
          <p style="color: #64748b; font-size: 12px;">הודעה אוטומטית מ-Go Top SEO</p>
        </div>
      `
}

export type SignupNotificationResult =
  | { sent: true; messageId?: string }
  | { sent: false; reason: 'not_fresh' | 'not_configured' | 'send_failed' | 'disabled' }

/**
 * `site` is the domain resolved by ./signup-site.ts (claim, signup form, first
 * project). Delivery goes through deliverOperatorEmail: the operator's address
 * only, with the OPERATOR_ALERTS_DISABLED kill switch.
 */
export async function sendSignupNotification(
  user: User,
  site: SignupSite = { domain: null, source: null },
  deps: AlertDeps = {},
): Promise<SignupNotificationResult> {
  if (!isFreshSignup(user, deps.now ? deps.now().getTime() : Date.now())) return { sent: false, reason: 'not_fresh' }
  const out = await deliverOperatorEmail(
    {
      subject: subjectWithDomain('חשבון חדש נפתח', safeDomain(site.domain)) + ' - Go Top SEO',
      html: buildSignupNotificationHtml(user, deps.now ? deps.now() : new Date(), site),
    },
    deps,
  )
  return out.sent ? { sent: true } : { sent: false, reason: out.reason }
}
