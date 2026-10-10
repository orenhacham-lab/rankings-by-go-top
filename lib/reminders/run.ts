/**
 * The reminder run: "articles are waiting for your OK". Called from the content-automation
 * cron (which fires every 15 minutes and authenticates itself with authorizeCronRequest),
 * AFTER that cron's own work and isolated from it.
 *
 * NOTHING SENDS UNLESS ASKED TO. The run does nothing at all (no read, no write, no email)
 * unless REMINDER_EMAILS_ENABLED is exactly "true". Beyond the flag it needs a sending key,
 * an explicit sender address (never the provider's sandbox default), an https app origin and
 * the secret the unsubscribe token is signed with; a missing one is "not configured", and
 * nothing is sent. Outside 09:00 to 09:59 Asia/Jerusalem, Sunday to Thursday, it does nothing.
 *
 * SCOPE. Every read is filtered by the project AND its owner (the service role bypasses RLS);
 * an article counts only when its owner is the project's owner. A bounded number of projects
 * is taken per run, and the wording, the cadence and the link are decided by lib/reminders/*.
 *
 * THE REMOVAL LIST IS THE LAST WORD. Past every other check, the owner's address goes
 * through lib/email-suppression: an address on the list, or a list we cannot read, means
 * nothing is sent and the claim is never taken. This is service email and it stops too,
 * because a removal has to hold across every sender.
 *
 * LOGS. One line when something was sent or a send failed: counts and stable codes only,
 * never an address, a title or a provider's words.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import type { Locale } from '@/lib/i18n/locales'
import { FIRST_AFTER_MS, decideReminder, inSendWindow } from './cadence'
import { buildReminderEmail, safeOrigin, type ReminderEmail } from './email'
import { isSuppressed } from '@/lib/email-suppression'
import { claimSend, readState, releaseClaim } from './state'
import { makeUnsubscribeToken } from './token'

export const REMINDER_FLAG = 'REMINDER_EMAILS_ENABLED'
/** Waiting articles read per run, and projects mailed per run. */
export const ARTICLE_READ_CAP = 600
export const PROJECTS_PER_RUN = 20

export interface OwnerFacts { email: string | null; locale: Locale | null; firstName: string | null; shopify: boolean }
export interface OutgoingReminder { to: string; email: ReminderEmail }

export interface ReminderDeps {
  admin: ServiceRoleClient
  env: Record<string, string | undefined>
  now: () => Date
  /** The owner's address, language and first name (from the account), or null when unreadable. */
  owner: (userId: string) => Promise<OwnerFacts | null>
  /** Hand one email to the provider; only ever called past every check. */
  send: (msg: OutgoingReminder) => Promise<{ ok: boolean }>
}

export type ReminderRun =
  | { status: 'off' | 'outside_window' | 'not_configured' | 'not_installed' | 'failed' }
  | { status: 'done'; considered: number; sent: number; failed: number }

/** Is the run allowed to touch anything at all? Pure, so a guard can pin every gate. */
export function reminderGate(env: Record<string, string | undefined>, now: Date): 'off' | 'outside_window' | 'not_configured' | 'go' {
  if (env[REMINDER_FLAG] !== 'true') return 'off'
  if (!inSendWindow(now)) return 'outside_window'
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL || !env.CRON_SECRET || !safeOrigin(env.NEXT_PUBLIC_APP_URL)) return 'not_configured'
  return 'go'
}

type Row = Record<string, unknown>
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

export async function runArticleReminders(deps: ReminderDeps): Promise<ReminderRun> {
  const now = deps.now()
  const gate = reminderGate(deps.env, now)
  if (gate !== 'go') return { status: gate }
  const origin = safeOrigin(deps.env.NEXT_PUBLIC_APP_URL)!
  const { admin } = deps

  try {
    // Projects whose OLDEST waiting article has been ready for 48 hours (the first email's
    // earliest moment); everything after that is decided per project, from its own rows.
    const cutoff = new Date(now.getTime() - FIRST_AFTER_MS).toISOString()
    const { data, error } = await admin.from('generated_articles')
      .select('id, project_id, user_id, updated_at')
      .eq('status', 'ready').is('scheduled_at', null).lte('updated_at', cutoff)
      .order('updated_at', { ascending: true })
      .limit(ARTICLE_READ_CAP)
    if (error) return { status: 'failed' }

    const oldestOf = new Map<string, Row>()
    for (const r of (data ?? []) as Row[]) {
      const pid = str(r.project_id)
      if (!pid || !str(r.id) || !str(r.user_id) || !str(r.updated_at)) continue
      if (!oldestOf.has(pid)) oldestOf.set(pid, r)
    }

    let considered = 0, sent = 0, failed = 0, suppressed = 0
    for (const [projectId, oldestRow] of oldestOf) {
      if (sent + failed >= PROJECTS_PER_RUN) break
      const ownerId = str(oldestRow.user_id)!
      const batchKey = String(oldestRow.id)
      considered++

      const { data: project } = await admin.from('projects')
        .select('id, user_id, target_domain, business_name, is_active')
        .eq('id', projectId).eq('user_id', ownerId).maybeSingle()
      const p = project as { id: string; user_id: string; target_domain?: string | null; business_name?: string | null; is_active?: boolean } | null
      if (!p || p.user_id !== ownerId || p.is_active === false) continue

      const read = await readState(admin, projectId, ownerId)
      if (read.status === 'unavailable') return { status: 'not_installed' }
      if (read.status === 'failed') { failed++; continue }
      const decision = decideReminder({ now, oldest: { id: batchKey, readyAt: String(oldestRow.updated_at) }, state: read.state })
      if (!decision.send) continue

      // Everything that waits for this owner in this project, oldest first: the email's list.
      const all = await admin.from('generated_articles')
        .select('id, title, updated_at')
        .eq('project_id', projectId).eq('user_id', ownerId)
        .eq('status', 'ready').is('scheduled_at', null)
        .order('updated_at', { ascending: true })
        .limit(200)
      const waiting = (all.error ? [] : (all.data ?? [])) as Row[]
      if (waiting.length === 0) continue

      const facts = await deps.owner(ownerId).catch(() => null)
      if (!facts?.email) continue
      const locale: Locale = facts.locale ?? (facts.shopify ? 'en' : 'he')
      const token = makeUnsubscribeToken(projectId, ownerId, deps.env)
      const domain = str(p.target_domain) ?? str(p.business_name)
      if (!token || !domain) continue

      // The removal list, last and before the claim: a suppressed owner must not have a
      // send recorded against them, and an unreadable list waits for the next run.
      if ((await isSuppressed(admin, facts.email)).suppressed) { suppressed++; continue }

      const at = now.toISOString()
      const won = await claimSend(admin, projectId, ownerId, read.state, { batchKey, sentCount: decision.sentCount, at })
      if (!won) continue
      const email = buildReminderEmail({
        locale, firstName: facts.firstName, domain,
        titles: waiting.map((r) => str(r.title)).filter((t): t is string => !!t),
        total: waiting.length, origin, token,
      })
      let ok = false
      try { ok = (await deps.send({ to: facts.email, email })).ok } catch { ok = false }
      if (ok) sent++
      else { failed++; await releaseClaim(admin, projectId, ownerId, read.state, at).catch(() => undefined) }
    }
    if (sent > 0 || failed > 0 || suppressed > 0) console.log('[reminders] run complete', { considered, sent, failed, suppressed })
    return { status: 'done', considered, sent, failed }
  } catch {
    console.error('[reminders] run failed')
    return { status: 'failed' }
  }
}
