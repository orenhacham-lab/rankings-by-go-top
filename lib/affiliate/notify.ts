/**
 * The operator's notices about the partner program.
 *
 * An application nobody reads is an application nobody approves, and a partner
 * waiting a week for an answer goes and promotes something else. Both notices go
 * through deliverOperatorEmail, so they inherit the operator's address, the
 * OPERATOR_ALERTS_DISABLED kill switch and the escaping that stops a submitted
 * field from becoming HTML in the inbox.
 *
 * EVERY VALUE IS ESCAPED. The application form is public and unauthenticated:
 * `name`, `website` and above all `audience` are attacker-supplied text, and an
 * operator notice that interpolated them raw would be an open relay for
 * phishing HTML into our own inbox — the exact bug the signup notice was
 * rewritten to remove.
 */
import { deliverOperatorEmail, type AlertDeps, type DeliverResult } from '@/lib/notifications/operator-alerts'
import { escapeEmailHtml } from '@/lib/notifications/email-escape'

export interface ApplicationNotice {
  name: string
  email: string
  phone?: string | null
  website?: string | null
  audience: string
  country?: string | null
}

const row = (label: string, value: string | null | undefined) =>
  value ? `<tr><td style="padding:4px 12px 4px 0;color:#666">${escapeEmailHtml(label)}</td><td style="padding:4px 0">${escapeEmailHtml(value)}</td></tr>` : ''

export function buildApplicationNoticeHtml(application: ApplicationNotice): string {
  return [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.6">',
    '<h2 style="margin:0 0 12px">בקשה חדשה לתוכנית השותפים</h2>',
    '<table style="border-collapse:collapse">',
    row('שם', application.name),
    row('אימייל', application.email),
    row('טלפון', application.phone),
    row('אתר', application.website),
    row('מדינה', application.country),
    '</table>',
    '<p style="margin:16px 0 4px;color:#666">הקהל שלהם, במילים שלהם:</p>',
    `<blockquote style="margin:0;padding:8px 12px;border-right:3px solid #ddd;white-space:pre-wrap">${escapeEmailHtml(application.audience)}</blockquote>`,
    '<p style="margin:16px 0 0">הבקשה ממתינה לאישור במסך תוכנית השותפים בניהול. עד שמאשרים — אין לשותף קוד ואין קישור.</p>',
    '</div>',
  ].join('')
}

/** Tell the operator an application arrived. Never throws for the caller. */
export async function notifyOperatorOfApplication(application: ApplicationNotice, deps: AlertDeps = {}): Promise<DeliverResult> {
  return deliverOperatorEmail(
    { subject: `בקשה חדשה לתוכנית השותפים: ${application.name} - Go Top SEO`, html: buildApplicationNoticeHtml(application) },
    deps,
  )
}

/**
 * Tell the operator a referral arrived carrying a signal worth a look
 * (the application's email is the new account's email, or the account is on the
 * partner's own domain). The referral is already created: these signals FLAG,
 * they never block, because an agency signing up a real client looks exactly
 * like self-referral and an agency is the best partner we have.
 *
 * It names the PARTNER and the signal, never the referred customer's email or
 * site: the partner's own details are theirs to see in admin, and a notice is
 * not a reason to start copying a customer's identity into an inbox.
 */
export async function notifyOperatorOfFlaggedReferral(
  { affiliateCode, flags }: { affiliateCode: string; flags: string[] },
  deps: AlertDeps = {},
): Promise<DeliverResult> {
  const list = flags.map((flag) => `<li>${escapeEmailHtml(flag)}</li>`).join('')
  return deliverOperatorEmail(
    {
      subject: `הרשמה דרך שותף שדורשת בדיקה: ${affiliateCode} - Go Top SEO`,
      html: [
        '<div style="font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.6">',
        '<h2 style="margin:0 0 12px">הרשמה דרך שותף עם סימן לבדיקה</h2>',
        `<p>הקוד: <strong>${escapeEmailHtml(affiliateCode)}</strong></p>`,
        `<ul>${list}</ul>`,
        '<p>ההרשמה נרשמה על השותף כרגיל. העמלה לא משולמת עד שמאשרים אותה במסך הניהול, ושם אפשר לראות את הסימן ולהחליט.</p>',
        '<p style="color:#666">סוכנות שרושמת לקוח אמיתי נראית בדיוק כך, ולכן זה סימן ולא חסימה.</p>',
        '</div>',
      ].join(''),
    },
    deps,
  )
}
