/**
 * The "articles waiting for your OK" reminder, as a pure builder: data in, subject, HTML,
 * plain text and headers out. It imports no provider and sends nothing (lib/reminders/run.ts
 * does, behind its flag). The words are the dashboard dictionaries' (`reminders.email`), in
 * the owner's language, so the email and the app cannot drift apart.
 *
 * LINKS. The button goes to the app's login with an INTERNAL `next` (the articles screen
 * filtered on what waits), built from a fixed path and a fixed origin: nothing from a
 * project, a title or a request becomes a host or a path. The unsubscribe link carries the
 * signed token (lib/reminders/token.ts) and is also offered as the RFC 8058 one-click header.
 * Every stored text (a title, a domain, a name) is HTML-escaped.
 */
import { escapeEmailHtml } from '@/lib/notifications/signup-email'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { Locale } from '@/lib/i18n/locales'

/** How many titles the email lists before "(and k more)". */
export const TITLES_SHOWN = 3
export const REVIEW_PATH = '/content?status=ready'
export const UNSUBSCRIBE_PATH = '/api/reminders/unsubscribe'

export interface ReminderEmailInput {
  locale: Locale
  /** The first name, or null when the account has none. */
  firstName: string | null
  domain: string
  /** Titles of the waiting articles, oldest first; `total` counts all of them. */
  titles: string[]
  total: number
  /** The app's origin, e.g. https://app.example.com (no path). */
  origin: string
  /** The signed unsubscribe token. */
  token: string
}

export interface ReminderEmail {
  subject: string
  html: string
  text: string
  headers: Record<string, string>
  reviewUrl: string
  unsubscribeUrl: string
}

/** An https origin (http only for localhost), or null: never a path, a query or another scheme. */
export function safeOrigin(raw: string | undefined): string | null {
  try {
    const u = new URL((raw ?? '').trim())
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return null
    if (u.username || u.password) return null
    return u.origin
  } catch {
    return null
  }
}

export function reviewUrlFor(origin: string, locale: Locale): string {
  return `${origin}/login?next=${encodeURIComponent(REVIEW_PATH)}${locale === 'en' ? '&lang=en' : ''}`
}
export function unsubscribeUrlFor(origin: string, token: string, locale: Locale): string {
  return `${origin}${UNSUBSCRIBE_PATH}?t=${encodeURIComponent(token)}&lang=${locale}`
}

const BRAND = '#0070d6'
const INK = '#0a1b3d'

export function buildReminderEmail(input: ReminderEmailInput): ReminderEmail {
  const t = getDashboardDictionary(input.locale).reminders.email
  const rtl = input.locale === 'he'
  const shown = input.titles.slice(0, TITLES_SHOWN)
  const more = Math.max(0, input.total - shown.length)
  const reviewUrl = reviewUrlFor(input.origin, input.locale)
  const unsubscribeUrl = unsubscribeUrlFor(input.origin, input.token, input.locale)
  const subject = t.subject(input.total, input.domain)
  const greeting = t.greeting(input.firstName)
  const intro = t.intro(input.total, input.domain)
  const outro = input.total === 1 ? t.outroOne : t.outro
  const moreLine = more > 0 ? t.more(more) : ''

  const e = escapeEmailHtml
  const align = rtl ? 'right' : 'left'
  const items = shown.map((title) => `<li style="margin:0 0 6px;">${e(title)}</li>`).join('')
  const html = `<!doctype html>
<html lang="${input.locale}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f7fb;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${e(t.preheader)}</span>
<div dir="${rtl ? 'rtl' : 'ltr'}" style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif;color:${INK};text-align:${align};">
  <div style="background:#ffffff;border-radius:14px;padding:28px 24px;border:1px solid #e3e9f2;">
    <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">${e(greeting)}</p>
    <p style="margin:0 0 12px;font-size:16px;line-height:1.6;">${e(intro)}</p>
    <ul style="margin:0 0 ${more > 0 ? 6 : 16}px;padding-${rtl ? 'right' : 'left'}:22px;font-size:16px;line-height:1.6;">${items}</ul>
    ${more > 0 ? `<p style="margin:0 0 16px;font-size:14px;color:#5b6b86;">${e(moreLine)}</p>` : ''}
    <p style="margin:0 0 22px;font-size:16px;line-height:1.6;">${e(outro)}</p>
    <p style="margin:0 0 24px;"><a href="${e(reviewUrl)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:12px 24px;border-radius:10px;">${e(t.button)}</a></p>
    <p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#5b6b86;">${e(t.help)}</p>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#5b6b86;">${e(t.team)}</p>
  </div>
  <p style="margin:16px 8px 0;font-size:12px;line-height:1.6;color:#7a8aa6;">${e(t.footer)}<br><a href="${e(unsubscribeUrl)}" style="color:#7a8aa6;text-decoration:underline;">${e(t.unsubscribe)}</a><br>${e(t.company)}</p>
</div>
</body></html>`

  const text = [
    greeting,
    '',
    intro,
    ...shown.map((title) => `- ${title}`),
    ...(more > 0 ? [moreLine] : []),
    '',
    outro,
    '',
    `${t.button}: ${reviewUrl}`,
    '',
    t.help,
    t.team,
    '',
    `${t.footer} ${t.unsubscribe}: ${unsubscribeUrl}`,
    t.company,
  ].join('\n')

  return {
    subject,
    html,
    text,
    // RFC 8058: a mail client's own "unsubscribe" button POSTs to this address without a login.
    headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    reviewUrl,
    unsubscribeUrl,
  }
}
