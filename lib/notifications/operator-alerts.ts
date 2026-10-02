/**
 * Operator alerts: tell the owner who signed up and which site they scanned.
 *
 * Every email here goes to ONE address, the operator's (ADMIN_NOTIFICATION_EMAIL,
 * default orenhacham@gmail.com), through the same Resend setup as the signup
 * notice (./signup-email.ts). Nothing here ever emails a visitor or a customer:
 * `to` is never taken from data, and there is no other recipient argument.
 *
 * They are on by default. One kill switch, OPERATOR_ALERTS_DISABLED=true, turns
 * every one of them off (the signup notice included).
 *
 * Every value in a body is HTML-escaped and truncated, and comes from a
 * server-verified record (the verified auth user, a ledger row, a project row),
 * never from a request-body field that has not been validated. Alerts are
 * best-effort: a failure is logged by name only and never reaches the caller.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { escapeEmailHtml } from './email-escape'

export const DEFAULT_OPERATOR_EMAIL = 'orenhacham@gmail.com'
/** At most one pre-sign-up scan alert per domain in this window. */
export const FREE_CHECK_ALERT_WINDOW_MS = 24 * 60 * 60 * 1000

type Env = Record<string, string | undefined>

export function operatorAlertsDisabled(env: Env = process.env): boolean {
  return (env.OPERATOR_ALERTS_DISABLED ?? '').trim().toLowerCase() === 'true'
}

export function operatorRecipient(env: Env = process.env): string {
  return env.ADMIN_NOTIFICATION_EMAIL || DEFAULT_OPERATOR_EMAIL
}

export type OperatorMessage = { to: string; from: string; subject: string; html: string }
export type OperatorSender = (message: OperatorMessage) => Promise<{ ok: boolean }>

/** The real sender: Resend, exactly as the signup notice used it. */
export const resendSender: OperatorSender = async (message) => {
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const result = await resend.emails.send(message)
  if (result.error) {
    console.error('[operator-alert] Resend error:', result.error.name)
    return { ok: false }
  }
  return { ok: true }
}

export type AlertDeps = { env?: Env; send?: OperatorSender; now?: () => Date }

export type DeliverResult = { sent: true } | { sent: false; reason: 'disabled' | 'not_configured' | 'send_failed' }

/**
 * The one place an operator email leaves the app. The recipient is the
 * operator's address, whatever the caller passes.
 */
export async function deliverOperatorEmail(
  content: { subject: string; html: string },
  deps: AlertDeps = {},
): Promise<DeliverResult> {
  const env = deps.env ?? process.env
  if (operatorAlertsDisabled(env)) return { sent: false, reason: 'disabled' }
  if (!env.RESEND_API_KEY) return { sent: false, reason: 'not_configured' }
  try {
    const out = await (deps.send ?? resendSender)({
      from: env.RESEND_FROM_EMAIL || 'Go Top SEO <onboarding@resend.dev>',
      to: operatorRecipient(env),
      subject: content.subject,
      html: content.html,
    })
    return out.ok ? { sent: true } : { sent: false, reason: 'send_failed' }
  } catch (err) {
    console.error('[operator-alert] send failed:', err instanceof Error ? err.name : 'unknown')
    return { sent: false, reason: 'send_failed' }
  }
}

// ── Formatting helpers ─────────────────────────────────────────────────────

const HOST = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/

/**
 * A bare host (no scheme, path, port or "www.") or null. The only way a
 * domain reaches an email subject or body.
 */
export function safeDomain(value: unknown): string | null {
  if (typeof value !== 'string') return null
  let v = value.trim().toLowerCase()
  if (!v || v.length > 300) return null
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#]/)[0].replace(/^[^@]*@/, '').replace(/:\d+$/, '').replace(/^www\./, '')
  return HOST.test(v) && v.includes('.') ? v : null
}

const text = (v: unknown, max = 200, fallback = 'לא הוזן'): string =>
  typeof v === 'string' && v.trim() ? escapeEmailHtml(v.trim().slice(0, max)) : fallback

const jerusalemTime = (d: Date): string => escapeEmailHtml(d.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }))

/** A subject line: one line, no markup, the domain only when it is a clean host. */
export function subjectWithDomain(prefix: string, domain: string | null): string {
  return domain ? `${prefix}: ${domain}` : prefix
}

function shell(title: string, rows: Array<[string, string]>, accent = '#2563eb'): string {
  const body = rows.map(([k, v]) => `<p><strong>${escapeEmailHtml(k)}:</strong> ${v}</p>`).join('\n            ')
  return `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: ${accent};">${escapeEmailHtml(title)}</h2>
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border-right: 4px solid ${accent};">
            ${body}
          </div>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e2e8f0;">
          <p style="color: #64748b; font-size: 12px;">הודעה אוטומטית מ-Go Top SEO</p>
        </div>
      `
}

// ── 2. A completed pre-sign-up free check ──────────────────────────────────

export type FreeCheckAlertInput = {
  domain: string
  locale: string
  when: Date
  /** The scan's own counters, when present. There is no single overall score; the GEO score is the headline one. */
  geoPassed?: number | null
  geoTotal?: number | null
  findings?: number | null
  /** Only when the visitor left one with consent (free_check_report_requests). */
  reportEmail?: string | null
  consentedMarketing?: boolean
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function buildFreeCheckAlertHtml(i: FreeCheckAlertInput): string {
  const geoPassed = num(i.geoPassed)
  const geoTotal = num(i.geoTotal)
  const rows: Array<[string, string]> = [
    ['אתר שנסרק', text(safeDomain(i.domain))],
    ['זמן', jerusalemTime(i.when)],
    ['שפה', i.locale === 'en' ? 'English' : i.locale === 'he' ? 'עברית' : text(i.locale, 8)],
  ]
  if (geoPassed !== null && geoTotal !== null && geoTotal > 0) rows.push(['ציון (בדיקות GEO)', `${escapeEmailHtml(geoPassed)} מתוך ${escapeEmailHtml(geoTotal)}`])
  const findings = num(i.findings)
  if (findings !== null) rows.push(['ממצאים', escapeEmailHtml(findings)])
  if (i.reportEmail) {
    rows.push(['דוא״ל לשליחת הדוח', text(i.reportEmail, 254)])
    rows.push(['אישר/ה דיוור שיווקי', i.consentedMarketing ? 'כן' : 'לא'])
  }
  return shell('🔎 נסרק אתר בבדיקה החינמית (לפני הרשמה)', rows, '#0d9488')
}

type FreeCheckResultLike = { counters?: { geoPassed?: unknown; geoTotal?: unknown }; geo?: { passed?: unknown; total?: unknown }; findings?: unknown }

/**
 * Tell the operator a visitor finished a free check, at most once per domain
 * per 24 hours. The dedupe reads the free_site_checks rows themselves: if any
 * OTHER row for this domain was written in the last 24h, an alert for that
 * scan already went out. Fails closed (no email) when the ledger is unreadable.
 * Call it after the response is on its way (`after()`); it never throws.
 */
export async function notifyFreeCheckCompleted(
  args: { admin: ServiceRoleClient; checkId: string | null; domain: string; locale: string; result?: FreeCheckResultLike | null },
  deps: AlertDeps = {},
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const env = deps.env ?? process.env
    if (operatorAlertsDisabled(env)) return { sent: false, reason: 'disabled' }
    const domain = safeDomain(args.domain)
    if (!domain || !args.checkId) return { sent: false, reason: 'no_domain' }
    const now = deps.now ? deps.now() : new Date()

    const earlier = await args.admin
      .from('free_site_checks')
      .select('id')
      .eq('domain', args.domain)
      .neq('id', args.checkId)
      .gt('created_at', new Date(now.getTime() - FREE_CHECK_ALERT_WINDOW_MS).toISOString())
      .limit(1)
    if (earlier.error) return { sent: false, reason: 'ledger_unreadable' }
    if (((earlier.data as unknown[] | null) ?? []).length > 0) return { sent: false, reason: 'already_alerted' }

    let reportEmail: string | null = null
    try {
      const rr = await args.admin.from('free_check_report_requests').select('email').eq('check_id', args.checkId).limit(1)
      reportEmail = (rr.data as { email?: string }[] | null)?.[0]?.email ?? null
    } catch { /* optional detail */ }

    const r = args.result ?? null
    const out = await deliverOperatorEmail(
      {
        subject: subjectWithDomain('נסרק אתר בבדיקה החינמית', domain),
        html: buildFreeCheckAlertHtml({
          domain,
          locale: args.locale,
          when: now,
          geoPassed: num(r?.counters?.geoPassed) ?? num(r?.geo?.passed),
          geoTotal: num(r?.counters?.geoTotal) ?? num(r?.geo?.total),
          findings: Array.isArray(r?.findings) ? (r!.findings as unknown[]).length : null,
          reportEmail,
          // A row in free_check_report_requests exists only with explicit consent, which covers marketing.
          consentedMarketing: reportEmail !== null,
        }),
      },
      deps,
    )
    return out.sent ? { sent: true } : { sent: false, reason: out.reason }
  } catch (err) {
    console.error('[operator-alert] free-check alert failed:', err instanceof Error ? err.name : 'unknown')
    return { sent: false, reason: 'error' }
  }
}

/** A visitor asked for the research report by email (consent is a stored precondition of the row). */
export async function notifyReportRequested(
  args: { admin: ServiceRoleClient; checkId: string; email: string; locale: string },
  deps: AlertDeps = {},
): Promise<{ sent: boolean; reason?: string }> {
  try {
    if (operatorAlertsDisabled(deps.env ?? process.env)) return { sent: false, reason: 'disabled' }
    const row = await args.admin.from('free_site_checks').select('domain').eq('id', args.checkId).limit(1)
    const domain = safeDomain((row.data as { domain?: string }[] | null)?.[0]?.domain)
    const now = deps.now ? deps.now() : new Date()
    const out = await deliverOperatorEmail(
      {
        subject: subjectWithDomain('מבקר השאיר דוא״ל לדוח', domain),
        html: shell('✉️ מבקר ביקש את הדוח בדוא״ל', [
          ['אתר', text(domain)],
          ['דוא״ל', text(args.email, 254)],
          ['אישר/ה דיוור שיווקי', 'כן'],
          ['שפה', args.locale === 'en' ? 'English' : 'עברית'],
          ['זמן', jerusalemTime(now)],
        ], '#0d9488'),
      },
      deps,
    )
    return out.sent ? { sent: true } : { sent: false, reason: out.reason }
  } catch (err) {
    console.error('[operator-alert] report alert failed:', err instanceof Error ? err.name : 'unknown')
    return { sent: false, reason: 'error' }
  }
}

// ── 3. An existing user adds a site ────────────────────────────────────────

export type ProjectAlertInput = {
  name: string | null
  email: string | null
  domain: string
  plan: string | null
  trialActive: boolean
  trialEndsAt: string | null
  hasActiveSubscription: boolean
  when: Date
}

function planState(i: Pick<ProjectAlertInput, 'plan' | 'trialActive' | 'trialEndsAt' | 'hasActiveSubscription'>): string {
  const plan = text(i.plan, 40, 'לא ידוע')
  if (i.trialActive) {
    const ends = i.trialEndsAt ? Date.parse(i.trialEndsAt) : NaN
    const until = Number.isFinite(ends) ? ` עד ${escapeEmailHtml(new Date(ends).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }))}` : ''
    return `${plan} (בתקופת ניסיון${until})`
  }
  return i.hasActiveSubscription ? `${plan} (מנוי פעיל)` : `${plan} (ללא מנוי פעיל)`
}

export function buildProjectAddedAlertHtml(i: ProjectAlertInput): string {
  return shell('➕ משתמש הוסיף אתר חדש', [
    ['שם', text(i.name)],
    ['דוא״ל', text(i.email)],
    ['אתר חדש', text(safeDomain(i.domain))],
    ['תוכנית', planState(i)],
    ['זמן', jerusalemTime(i.when)],
  ], '#7c3aed')
}

/**
 * Tell the operator a signed-in, non-admin user added a site. `isAdmin` and the
 * entitlement come from the server (isAdminUser / getUserEntitlement); the
 * domain is the one the server just stored. `claimDomain` is the site the
 * user's own free-check claim scanned: the project made from it is covered by
 * the signup email, so an alert for the same site is skipped.
 */
export async function notifyProjectAdded(
  args: {
    user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null }
    isAdmin: boolean
    domain: string
    claimDomain?: string | null
    entitlement: { plan?: string | null; trialActive?: boolean; trialEndsAt?: string | null; hasActiveSubscription?: boolean }
  },
  deps: AlertDeps = {},
): Promise<{ sent: boolean; reason?: string }> {
  try {
    if (operatorAlertsDisabled(deps.env ?? process.env)) return { sent: false, reason: 'disabled' }
    if (args.isAdmin) return { sent: false, reason: 'admin' }
    const domain = safeDomain(args.domain)
    if (!domain) return { sent: false, reason: 'no_domain' }
    if (args.claimDomain && safeDomain(args.claimDomain) === domain) return { sent: false, reason: 'claim_project' }
    const meta = (args.user.user_metadata ?? {}) as Record<string, unknown>
    const out = await deliverOperatorEmail(
      {
        subject: subjectWithDomain('משתמש הוסיף אתר', domain),
        html: buildProjectAddedAlertHtml({
          name: typeof (meta.full_name ?? meta.name) === 'string' ? ((meta.full_name ?? meta.name) as string) : null,
          email: args.user.email ?? null,
          domain,
          plan: args.entitlement.plan ?? null,
          trialActive: args.entitlement.trialActive === true,
          trialEndsAt: args.entitlement.trialEndsAt ?? null,
          hasActiveSubscription: args.entitlement.hasActiveSubscription === true,
          when: deps.now ? deps.now() : new Date(),
        }),
      },
      deps,
    )
    return out.sent ? { sent: true } : { sent: false, reason: out.reason }
  } catch (err) {
    console.error('[operator-alert] project alert failed:', err instanceof Error ? err.name : 'unknown')
    return { sent: false, reason: 'error' }
  }
}
