/**
 * The weekly summary run: the email behind the switch the settings screen has stored since
 * the monthly report shipped. Called from the content-automation cron (every 15 minutes,
 * authenticated by authorizeCronRequest), after everything else it does.
 *
 * NOTHING SENDS UNLESS ASKED TO. The run does nothing at all (no read, no write, no email)
 * unless WEEKLY_SUMMARY_EMAIL_ENABLED is exactly "true". Beyond the flag it needs a sending
 * key, an explicit sender address, an https app origin and the secret the unsubscribe token
 * is signed with. Outside 09:00 to 09:59 Asia/Jerusalem on SUNDAY it does nothing, and a
 * week already covered for a project is never covered again.
 *
 * OPT-IN ONLY. A project is read at all only because its owner turned the switch on; a
 * project with no preferences row is never mailed.
 *
 * AN EMPTY WEEK IS NOT SENT (lib/reports/weekly/aggregate.ts), and neither is a week whose
 * sources could not be read: the email reports only what it actually measured.
 *
 * NEVER TWO EMAILS IN ONE MORNING. The approval reminder and the setup emails write
 * project_reminder_state.last_sent_at; a project mailed in the last QUIET_HOURS is left for
 * next week rather than mailed twice in a day. This run does not write that date itself: an
 * opt-in summary must not silence the reminder that asks the owner to do something.
 *
 * THE REMOVAL LIST IS THE LAST WORD. Past every other check, the owner's address goes
 * through lib/email-suppression: an address on the list, or a list we cannot read, means
 * nothing is sent and the week is never marked as covered.
 *
 * LOGS. One line when something was sent or a send failed: counts only, never an address, a
 * domain or a provider's words.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import type { PublicLocale } from '@/lib/i18n/locales'
import { safeOrigin } from '@/lib/reminders/email'
import { makeUnsubscribeToken } from '@/lib/reminders/token'
import { readState } from '@/lib/reminders/state'
import { isSuppressed } from '@/lib/email-suppression'
import { aggregateWeek } from './aggregate'
import { buildWeeklyEmail, type WeeklyEmail } from './email'
import { inWeeklyWindow, weekKeyOf, weekWindow } from './period'
import { claimWeeklySend, loadWeekInputs, readWeeklyPrefs, releaseWeeklyClaim, PREFS_TABLE } from './store'

export const WEEKLY_FLAG = 'WEEKLY_SUMMARY_EMAIL_ENABLED'
/** Projects with the switch on read per run, and emails sent per run. */
export const PROJECT_READ_CAP = 100
export const PROJECTS_PER_RUN = 20
/** A project mailed this recently about anything is left for next week. */
export const QUIET_HOURS = 20

export interface OutgoingWeekly { to: string; email: WeeklyEmail }

export interface WeeklyOwner {
  email: string | null
  locale: PublicLocale | null
  firstName: string | null
  shopify: boolean
}

export interface WeeklyDeps {
  admin: ServiceRoleClient
  env: Record<string, string | undefined>
  now: () => Date
  owner: (userId: string) => Promise<WeeklyOwner | null>
  send: (msg: OutgoingWeekly) => Promise<{ ok: boolean }>
}

export type WeeklyRun =
  | { status: 'off' | 'outside_window' | 'not_configured' | 'not_installed' | 'failed' }
  | { status: 'done'; considered: number; sent: number; skipped: number; failed: number }

/** Is the run allowed to touch anything at all? Pure, so a guard can pin every gate. */
export function weeklyGate(env: Record<string, string | undefined>, now: Date): 'off' | 'outside_window' | 'not_configured' | 'go' {
  if (env[WEEKLY_FLAG] !== 'true') return 'off'
  if (!inWeeklyWindow(now)) return 'outside_window'
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL || !env.CRON_SECRET || !safeOrigin(env.NEXT_PUBLIC_APP_URL)) return 'not_configured'
  return 'go'
}

type Row = Record<string, unknown>
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

export async function runWeeklySummaries(deps: WeeklyDeps): Promise<WeeklyRun> {
  const now = deps.now()
  const gate = weeklyGate(deps.env, now)
  if (gate !== 'go') return { status: gate }
  const origin = safeOrigin(deps.env.NEXT_PUBLIC_APP_URL)!
  const { admin } = deps
  const week = weekKeyOf(now)
  const { start, end } = weekWindow(now)

  try {
    // Only projects whose owner turned the switch on, and only those not yet covered.
    const { data, error } = await admin.from(PREFS_TABLE)
      .select('project_id, user_id, weekly_last_week')
      .eq('weekly_email_summary', true)
      .limit(PROJECT_READ_CAP)
    if (error) {
      const c = String((error as { code?: unknown }).code ?? '')
      return c === '42P01' || c === '42703' || c === 'PGRST205' || c === 'PGRST204' ? { status: 'not_installed' } : { status: 'failed' }
    }

    let considered = 0, sent = 0, skipped = 0, failed = 0
    for (const row of (data ?? []) as Row[]) {
      if (sent + failed >= PROJECTS_PER_RUN) break
      const projectId = str(row.project_id)
      const ownerId = str(row.user_id)
      if (!projectId || !ownerId || row.weekly_last_week === week) continue

      const project = await admin.from('projects')
        .select('id, user_id, target_domain, business_name, is_active')
        .eq('id', projectId).eq('user_id', ownerId).maybeSingle()
      const p = project.data as { user_id?: string; target_domain?: string | null; business_name?: string | null; is_active?: boolean } | null
      if (project.error || !p || p.user_id !== ownerId || p.is_active === false) continue
      const domain = str(p.target_domain) ?? str(p.business_name)
      if (!domain) continue
      considered++

      // Another email about this project this morning: next week rather than two in a day.
      const other = await readState(admin, projectId, ownerId)
      if (other.status === 'ok' && other.state?.lastSentAt) {
        const last = Date.parse(other.state.lastSentAt)
        if (Number.isFinite(last) && now.getTime() - last < QUIET_HOURS * 3_600_000) { skipped++; continue }
      }

      const prefs = await readWeeklyPrefs(admin, projectId, ownerId)
      if (prefs.status === 'unavailable') return { status: 'not_installed' }
      if (prefs.status === 'failed') { failed++; continue }
      if (!prefs.prefs?.on || prefs.prefs.lastWeek === week) continue

      const summary = aggregateWeek(await loadWeekInputs(admin, { id: projectId, user_id: ownerId }, start, end))
      if (!summary.worthSending) { skipped++; continue }

      const who = await deps.owner(ownerId).catch(() => null)
      if (!who?.email) continue
      const locale: PublicLocale = who.locale ?? (who.shopify ? 'en' : 'he')
      const token = makeUnsubscribeToken(projectId, ownerId, deps.env)
      if (!token) continue

      // The removal list, last and before the claim: a suppressed owner must not have the
      // week marked as covered, and an unreadable list waits for next week's run.
      if ((await isSuppressed(admin, who.email)).suppressed) { skipped++; continue }

      const at = now.toISOString()
      const won = await claimWeeklySend(admin, projectId, ownerId, prefs.prefs, { week, at })
      if (!won) continue
      const email = buildWeeklyEmail({ locale, firstName: who.firstName, domain, projectId, summary, origin, token })
      let ok = false
      try { ok = (await deps.send({ to: who.email, email })).ok } catch { ok = false }
      if (ok) sent++
      else { failed++; await releaseWeeklyClaim(admin, projectId, ownerId, prefs.prefs, at).catch(() => undefined) }
    }
    if (sent > 0 || failed > 0) console.log('[weekly-summary] run complete', { considered, sent, skipped, failed })
    return { status: 'done', considered, sent, skipped, failed }
  } catch {
    console.error('[weekly-summary] run failed')
    return { status: 'failed' }
  }
}
