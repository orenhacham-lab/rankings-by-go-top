/**
 * The weekly summary email, as a pure builder: the week's summary in, subject, HTML, plain
 * text and headers out. It imports no provider and sends nothing (lib/reports/weekly/run.ts
 * does, behind its flag). The words are the dashboard dictionaries' (`weeklySummaryEmail`),
 * in the owner's language.
 *
 * ONLY WHAT WAS READ IS SAID. Every line is built from a section of the summary, and a
 * section that is absent (nothing happened, or it could not be read) prints no line at all:
 * the email never reports a zero it did not measure.
 *
 * LINKS. The button goes to the app's login with an INTERNAL `next` (this project's reports
 * screen) built from a fixed origin and a fixed path. A published article's own URL is
 * printed only when it is an https link to somewhere, never a javascript: or data: one. The
 * unsubscribe link is the same signed one-click link the other emails carry, and it stops
 * every email about this project, this one included.
 */
import { escapeEmailHtml } from '@/lib/notifications/signup-email'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { unsubscribeUrlFor } from '@/lib/reminders/email'
import { toBilingualLocale, type PublicLocale } from '@/lib/i18n/locales'
import type { WeeklySummary } from './aggregate'

export const REPORTS_PATH = '/reports'

export interface WeeklyEmailInput {
  locale: PublicLocale
  firstName: string | null
  domain: string
  projectId: string
  summary: WeeklySummary
  /** The app's origin, e.g. https://app.example.com (no path). */
  origin: string
  /** The signed unsubscribe token. */
  token: string
}

export interface WeeklyEmail {
  subject: string
  html: string
  text: string
  headers: Record<string, string>
  reportsUrl: string
  unsubscribeUrl: string
}

/** An https link, or null: a stored URL never becomes another scheme in an email. */
export function safeLink(raw: string | null): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

export function reportsUrlFor(origin: string, projectId: string, locale: PublicLocale): string {
  const next = `${REPORTS_PATH}?projectId=${encodeURIComponent(projectId)}`
  return `${origin}/login?next=${encodeURIComponent(next)}${locale === 'he' ? '' : '&lang=en'}`
}

const BRAND = '#0070d6'
const INK = '#0a1b3d'

export function buildWeeklyEmail(input: WeeklyEmailInput): WeeklyEmail {
  const t = getDashboardDictionary(input.locale).weeklySummaryEmail
  const s = input.summary
  const rtl = input.locale === 'he'
  const e = escapeEmailHtml
  const reportsUrl = reportsUrlFor(input.origin, input.projectId, input.locale)
  const unsubscribeUrl = unsubscribeUrlFor(input.origin, input.token, toBilingualLocale(input.locale))
  const subject = t.subject(input.domain)
  const greeting = t.greeting(input.firstName)
  const day = (iso: string) => iso.slice(0, 10)

  /** One line per section that was actually measured: [plain text, html]. */
  const lines: Array<[string, string]> = []
  if (s.publishedCount > 0) {
    lines.push([t.published(s.publishedCount), `<strong>${e(t.published(s.publishedCount))}</strong>`])
    for (const a of s.published) {
      const link = safeLink(a.url)
      lines.push([
        link ? `- ${a.title}: ${link}` : `- ${a.title}`,
        link ? `&nbsp;&nbsp;• <a href="${e(link)}" style="color:${BRAND};">${e(a.title)}</a>` : `&nbsp;&nbsp;• ${e(a.title)}`,
      ])
    }
    const more = s.publishedCount - s.published.length
    if (more > 0) lines.push([t.more(more), `&nbsp;&nbsp;${e(t.more(more))}`])
  }
  if (s.waiting !== null) lines.push([t.waiting(s.waiting), `<strong>${e(t.waiting(s.waiting))}</strong>`])
  if (s.rank) {
    const line = t.rank(s.rank.checked, s.rank.improved, s.rank.dropped)
    lines.push([line, e(line)])
  }
  if (s.gsc && s.gsc.change !== null && s.gsc.change !== 0) {
    const line = t.gsc(s.gsc.clicks, s.gsc.change)
    lines.push([line, e(line)])
  }
  if (s.nextScheduled) {
    const line = t.next(day(s.nextScheduled.at), s.nextScheduled.title)
    lines.push([line, e(line)])
  }

  const body = lines.map(([, html]) => `<p style="margin:0 0 8px;font-size:16px;line-height:1.6;">${html}</p>`).join('')
  const html = `<!doctype html>
<html lang="${input.locale}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f7fb;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${e(t.preheader)}</span>
<div dir="${rtl ? 'rtl' : 'ltr'}" style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif;color:${INK};text-align:${rtl ? 'right' : 'left'};">
  <div style="background:#ffffff;border-radius:14px;padding:28px 24px;border:1px solid #e3e9f2;">
    <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">${e(greeting)}</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">${e(t.intro(input.domain))}</p>
    ${body}
    <p style="margin:22px 0 24px;"><a href="${e(reportsUrl)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:12px 24px;border-radius:10px;">${e(t.button)}</a></p>
    <p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#5b6b86;">${e(t.help)}</p>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#5b6b86;">${e(t.team)}</p>
  </div>
  <p style="margin:16px 8px 0;font-size:12px;line-height:1.6;color:#7a8aa6;">${e(t.footer)}<br><a href="${e(unsubscribeUrl)}" style="color:#7a8aa6;text-decoration:underline;">${e(t.unsubscribe)}</a><br>${e(t.company)}</p>
</div>
</body></html>`

  const text = [
    greeting, '', t.intro(input.domain), '',
    ...lines.map(([plain]) => plain),
    '', `${t.button}: ${reportsUrl}`,
    '', t.help, t.team, '',
    `${t.footer} ${t.unsubscribe}: ${unsubscribeUrl}`,
    t.company,
  ].join('\n')

  return {
    subject,
    html,
    text,
    // RFC 8058: a mail client's own "unsubscribe" button POSTs to this address without a login.
    headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    reportsUrl,
    unsubscribeUrl,
  }
}
