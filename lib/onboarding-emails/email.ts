/**
 * The two setup emails, as a pure builder: data in, subject, HTML, plain text and headers
 * out. It imports no provider and sends nothing (lib/onboarding-emails/run.ts does, behind
 * its flag). The words are the dashboard dictionaries' (`onboardingEmails`), in the owner's
 * language, so the email and the app cannot drift apart.
 *
 * LINKS. The button goes to the app's login with an INTERNAL `next`, built from a fixed
 * origin and a fixed path (the project's connections section, or the content screen) with
 * the project's own id as the only variable: nothing from a domain, a title or a request
 * becomes a host or a path. The unsubscribe link carries the same signed token the approval
 * reminder uses (lib/reminders/token.ts) and is also offered as the RFC 8058 one-click
 * header, so one click stops every email about this project. Every stored text is escaped.
 */
import { escapeEmailHtml } from '@/lib/notifications/signup-email'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { unsubscribeUrlFor } from '@/lib/reminders/email'
import { toBilingualLocale } from '@/lib/i18n/locales'
import { PROJECT_CONNECTION_ANCHOR } from '@/lib/content/content-hub-setup'
import type { PublicLocale } from '@/lib/i18n/locales'
import type { Stage } from './cadence'

export interface OnboardingEmailInput {
  stage: Stage
  /** All four published languages, not just the bilingual pair: the words are the dictionary's. */
  locale: PublicLocale
  /** The first name, or null when the account has none. */
  firstName: string | null
  domain: string
  projectId: string
  /** The app's origin, e.g. https://app.example.com (no path). */
  origin: string
  /** The signed unsubscribe token. */
  token: string
}

export interface OnboardingEmail {
  subject: string
  html: string
  text: string
  headers: Record<string, string>
  actionUrl: string
  unsubscribeUrl: string
}

/** Where each stage's button goes, inside the app, for this project. */
export function actionPathFor(stage: Stage, projectId: string): string {
  const id = encodeURIComponent(projectId)
  return stage === 'connect' ? `/settings?projectId=${id}#${PROJECT_CONNECTION_ANCHOR}` : `/content?projectId=${id}`
}

export function actionUrlFor(origin: string, stage: Stage, projectId: string, locale: PublicLocale): string {
  return `${origin}/login?next=${encodeURIComponent(actionPathFor(stage, projectId))}${locale === 'he' ? '' : '&lang=en'}`
}

const BRAND = '#0070d6'
const INK = '#0a1b3d'

export function buildOnboardingEmail(input: OnboardingEmailInput): OnboardingEmail {
  const dict = getDashboardDictionary(input.locale)
  const t = dict.onboardingEmails
  const s = t[input.stage]
  const rtl = input.locale === 'he'
  const actionUrl = actionUrlFor(input.origin, input.stage, input.projectId, input.locale)
  // The unsubscribe page is bilingual (lib/reminders/http.ts): Spanish and Portuguese
  // readers get its English, which is the same narrowing the rest of the dashboard makes.
  const unsubscribeUrl = unsubscribeUrlFor(input.origin, input.token, toBilingualLocale(input.locale))
  const subject = s.subject(input.domain)
  const greeting = t.greeting(input.firstName)
  const intro = s.intro(input.domain)

  const e = escapeEmailHtml
  const align = rtl ? 'right' : 'left'
  const items = s.bullets.map((line) => `<li style="margin:0 0 6px;">${e(line)}</li>`).join('')
  const html = `<!doctype html>
<html lang="${input.locale}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f7fb;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${e(s.preheader)}</span>
<div dir="${rtl ? 'rtl' : 'ltr'}" style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif;color:${INK};text-align:${align};">
  <div style="background:#ffffff;border-radius:14px;padding:28px 24px;border:1px solid #e3e9f2;">
    <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">${e(greeting)}</p>
    <p style="margin:0 0 12px;font-size:16px;line-height:1.6;">${e(intro)}</p>
    <ul style="margin:0 0 16px;padding-${rtl ? 'right' : 'left'}:22px;font-size:16px;line-height:1.6;">${items}</ul>
    <p style="margin:0 0 22px;font-size:16px;line-height:1.6;">${e(s.outro)}</p>
    <p style="margin:0 0 24px;"><a href="${e(actionUrl)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:12px 24px;border-radius:10px;">${e(s.button)}</a></p>
    <p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#5b6b86;">${e(t.guide)}</p>
    <p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#5b6b86;">${e(t.help)}</p>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#5b6b86;">${e(t.team)}</p>
  </div>
  <p style="margin:16px 8px 0;font-size:12px;line-height:1.6;color:#7a8aa6;">${e(t.footer)}<br><a href="${e(unsubscribeUrl)}" style="color:#7a8aa6;text-decoration:underline;">${e(t.unsubscribe)}</a><br>${e(t.company)}</p>
</div>
</body></html>`

  const text = [
    greeting, '', intro,
    ...s.bullets.map((line) => `- ${line}`),
    '', s.outro, '',
    `${s.button}: ${actionUrl}`,
    '', t.guide, t.help, t.team, '',
    `${t.footer} ${t.unsubscribe}: ${unsubscribeUrl}`,
    t.company,
  ].join('\n')

  return {
    subject,
    html,
    text,
    // RFC 8058: a mail client's own "unsubscribe" button POSTs to this address without a login.
    headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    actionUrl,
    unsubscribeUrl,
  }
}
