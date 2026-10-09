/**
 * The two routes of the reminder emails.
 *
 *   GET|PUT /api/reminders/preferences        the settings switch (a signed-in owner)
 *   GET|POST /api/reminders/unsubscribe?t=…   the link in every email (PUBLIC: its own token)
 *
 * proxy.ts does not cover /api/*, so each handler authenticates itself.
 *
 * PREFERENCES: signed in, a well-formed project id, and the caller OWNS the project (read
 * with id AND user_id); anyone else gets 404, never 403, so a project id cannot be probed.
 *
 * UNSUBSCRIBE has no session, so the token IS the credential (lib/reminders/token.ts): the
 * project it names is looked up, its CURRENT owner read from the database, and the signature
 * must match that owner, or nothing changes. It only ever turns emails OFF, for that one
 * project, and turning off twice is the same as once. One click stops EVERY email about that
 * project, which is what the emails promise: the approval reminder and the setup emails
 * (project_reminder_state) and the weekly summary (project_report_preferences). The weekly
 * switch is also a settings control, so failing to reach it does not fail the unsubscribe:
 * the reminder switch is what the answer reports. GET (the link) shows a small page in
 * the language the email was in; POST is RFC 8058 one-click from a mail client. There is no
 * redirect anywhere, so there is no `next` and no way off the site.
 *
 * No database or provider text reaches an answer or a log line.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { escapeEmailHtml } from '@/lib/notifications/signup-email'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { normalizeLocale } from '@/lib/i18n/dashboard/locale'
import type { Locale } from '@/lib/i18n/locales'
import { readState, writeEnabled } from './state'
import { writeWeeklyOff } from '@/lib/reports/weekly/store'
import { tokenProjectId, verifyUnsubscribeToken } from './token'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_STORE = { 'cache-control': 'no-store' }

export interface ReminderRouteDeps {
  userId: () => Promise<string | null>
  admin: () => ServiceRoleClient
  now: () => Date
  env: Record<string, string | undefined>
}

const json = (status: number, body: unknown) => Response.json(body, { status, headers: NO_STORE })

async function ownedProject(admin: ServiceRoleClient, projectId: string, userId: string): Promise<boolean> {
  const { data, error } = await admin.from('projects').select('id, user_id').eq('id', projectId).eq('user_id', userId).maybeSingle()
  const row = data as { user_id?: string } | null
  return !error && !!row && row.user_id === userId
}

export async function handlePreferencesGet(request: Request, deps: ReminderRouteDeps): Promise<Response> {
  const userId = await deps.userId().catch(() => null)
  if (!userId) return json(401, { ok: false, code: 'unauthorized' })
  const projectId = new URL(request.url).searchParams.get('projectId') ?? ''
  if (!UUID.test(projectId)) return json(404, { ok: false, code: 'not_found' })
  try {
    const admin = deps.admin()
    if (!(await ownedProject(admin, projectId, userId))) return json(404, { ok: false, code: 'not_found' })
    const read = await readState(admin, projectId, userId)
    if (read.status === 'unavailable') return json(200, { ok: true, available: false })
    if (read.status === 'failed') return json(500, { ok: false, code: 'internal' })
    return json(200, { ok: true, available: true, enabled: read.state ? read.state.enabled : true })
  } catch {
    return json(500, { ok: false, code: 'internal' })
  }
}

export async function handlePreferencesPut(request: Request, deps: ReminderRouteDeps): Promise<Response> {
  const userId = await deps.userId().catch(() => null)
  if (!userId) return json(401, { ok: false, code: 'unauthorized' })
  const body = await request.json().catch(() => null) as { projectId?: unknown; enabled?: unknown } | null
  if (!body || typeof body.projectId !== 'string' || !UUID.test(body.projectId) || typeof body.enabled !== 'boolean') {
    return json(400, { ok: false, code: 'invalid_request' })
  }
  try {
    const admin = deps.admin()
    if (!(await ownedProject(admin, body.projectId, userId))) return json(404, { ok: false, code: 'not_found' })
    const result = await writeEnabled(admin, body.projectId, userId, body.enabled, deps.now().toISOString())
    if (result === 'unavailable') return json(503, { ok: false, code: 'unavailable' })
    if (result === 'failed') return json(500, { ok: false, code: 'internal' })
    return json(200, { ok: true, enabled: body.enabled })
  } catch {
    return json(500, { ok: false, code: 'internal' })
  }
}

// ── Unsubscribe ─────────────────────────────────────────────────────────────

export type UnsubscribeOutcome = 'done' | 'invalid' | 'unavailable'

/** Verify the token against the project's current owner, then turn that project's reminders off. */
export async function unsubscribeByToken(token: unknown, deps: Pick<ReminderRouteDeps, 'admin' | 'now' | 'env'>): Promise<UnsubscribeOutcome> {
  const projectId = tokenProjectId(token)
  if (!projectId) return 'invalid'
  try {
    const admin = deps.admin()
    const { data, error } = await admin.from('projects').select('id, user_id').eq('id', projectId).maybeSingle()
    const row = data as { id?: string; user_id?: string } | null
    if (error || !row || row.id !== projectId || typeof row.user_id !== 'string') return 'invalid'
    if (!verifyUnsubscribeToken(token, projectId, row.user_id, deps.env)) return 'invalid'
    const at = deps.now().toISOString()
    const result = await writeEnabled(admin, projectId, row.user_id, false, at)
    await writeWeeklyOff(admin, projectId, row.user_id, at).catch(() => undefined)
    return result === 'ok' ? 'done' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

const HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, nofollow',
}

export function unsubscribePage(locale: Locale, ok: boolean): string {
  const t = getDashboardDictionary(locale).reminders.unsubscribePage
  const e = escapeEmailHtml
  const rtl = locale === 'he'
  return `<!doctype html>
<html lang="${locale}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${e(ok ? t.title : t.invalidTitle)}</title></head>
<body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#0a1b3d;">
<main style="max-width:480px;margin:12vh auto 0;padding:0 16px;">
<div style="background:#fff;border:1px solid #e3e9f2;border-radius:14px;padding:28px 24px;">
<h1 style="margin:0 0 12px;font-size:22px;">${e(ok ? t.title : t.invalidTitle)}</h1>
<p style="margin:0 0 20px;font-size:16px;line-height:1.6;">${e(ok ? t.body : t.invalidBody)}</p>
<a href="/" style="display:inline-block;background:#0070d6;color:#fff;text-decoration:none;font-weight:700;padding:10px 20px;border-radius:10px;">${e(t.back)}</a>
</div></main></body></html>`
}

export async function handleUnsubscribe(request: Request, deps: Pick<ReminderRouteDeps, 'admin' | 'now' | 'env'>): Promise<Response> {
  const url = new URL(request.url)
  const post = request.method === 'POST'
  const locale: Locale = normalizeLocale(url.searchParams.get('lang')) ?? 'he'
  const outcome = await unsubscribeByToken(url.searchParams.get('t'), deps)
  if (post) {
    // RFC 8058: a mail client posts here, and reads only the status.
    return json(outcome === 'done' ? 200 : outcome === 'invalid' ? 400 : 503, { ok: outcome === 'done' })
  }
  return new Response(unsubscribePage(locale, outcome === 'done'), { status: outcome === 'done' ? 200 : outcome === 'invalid' ? 400 : 503, headers: HEADERS })
}
