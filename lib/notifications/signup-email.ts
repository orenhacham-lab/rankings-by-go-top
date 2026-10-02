import type { User } from '@supabase/supabase-js'

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

export function escapeEmailHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function isFreshSignup(user: Pick<User, 'created_at'>, now = Date.now()): boolean {
  const created = Date.parse(user.created_at ?? '')
  return Number.isFinite(created) && now - created >= 0 && now - created < SIGNUP_NOTIFICATION_WINDOW_MS
}

export function buildSignupNotificationHtml(user: Pick<User, 'email' | 'user_metadata'>, when: Date): string {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const field = (v: unknown) => (typeof v === 'string' && v.trim() ? escapeEmailHtml(v.trim().slice(0, 200)) : 'לא הוזן')
  return `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">🎉 חשבון חדש נפתח ב-Go Top SEO!</h2>
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border-right: 4px solid #2563eb;">
            <p><strong>שם מלא:</strong> ${field(meta.full_name ?? meta.name)}</p>
            <p><strong>דוא״ל:</strong> ${field(user.email)}</p>
            <p><strong>שם חברה:</strong> ${field(meta.company_name)}</p>
            <p><strong>טלפון:</strong> ${field(meta.phone)}</p>
            <p><strong>זמן הרשמה:</strong> ${escapeEmailHtml(when.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }))}</p>
          </div>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e2e8f0;">
          <p style="color: #64748b; font-size: 12px;">הודעה אוטומטית מ-Go Top SEO</p>
        </div>
      `
}

export type SignupNotificationResult =
  | { sent: true; messageId?: string }
  | { sent: false; reason: 'not_fresh' | 'not_configured' | 'send_failed' }

export async function sendSignupNotification(user: User): Promise<SignupNotificationResult> {
  if (!isFreshSignup(user)) return { sent: false, reason: 'not_fresh' }
  if (!process.env.RESEND_API_KEY) return { sent: false, reason: 'not_configured' }

  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'Go Top SEO <onboarding@resend.dev>'
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'orenhacham@gmail.com'

  const result = await resend.emails.send({
    from: fromEmail,
    to: adminEmail,
    subject: 'חשבון חדש נפתח - Go Top SEO',
    html: buildSignupNotificationHtml(user, new Date()),
  })
  if (result.error) {
    console.error('[signup-email] Resend error:', result.error.name)
    return { sent: false, reason: 'send_failed' }
  }
  return { sent: true, messageId: result.data?.id }
}
