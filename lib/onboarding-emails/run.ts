/**
 * The setup-email run: "your site is not connected yet" and "nothing has been published
 * yet". Called from the content-automation cron (which fires every 15 minutes and
 * authenticates itself with authorizeCronRequest), AFTER that cron's own work and the
 * approval reminders, and isolated from both.
 *
 * NOTHING SENDS UNLESS ASKED TO. The run does nothing at all (no read, no write, no email)
 * unless ONBOARDING_EMAILS_ENABLED is exactly "true". Beyond the flag it needs a sending
 * key, an explicit sender address (never the provider's sandbox default), an https app
 * origin and the secret the unsubscribe token is signed with; a missing one is "not
 * configured", and nothing is sent. Outside 09:00 to 09:59 Asia/Jerusalem, Sunday to
 * Thursday, it does nothing.
 *
 * FAIL CLOSED ON WHAT IT CANNOT SEE. "Not connected" and "nothing published" are claims
 * about an absence, so a read that fails is never treated as an absence: one unreadable
 * source ends the run without sending anything.
 *
 * SCOPE. Every read is filtered by the project AND its owner (the service role bypasses
 * RLS). A bounded number of projects is read per run and a bounded number of emails goes
 * out per run; the wording, the cadence and the links are decided by lib/onboarding-emails/*.
 *
 * LOGS. One line when something was sent or a send failed: counts and stable codes only,
 * never an address, a domain or a provider's words.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import type { PublicLocale } from '@/lib/i18n/locales'
import { inSendWindow } from '@/lib/reminders/cadence'
import { safeOrigin } from '@/lib/reminders/email'
import { makeUnsubscribeToken } from '@/lib/reminders/token'
import { CONNECT_AFTER_MS, PUBLISH_AFTER_MS, decideOnboardingEmail, type Stage } from './cadence'
import { buildOnboardingEmail, type OnboardingEmail } from './email'
import { claimOnboardingSend, readOnboardingState, releaseOnboardingClaim } from './state'

export const ONBOARDING_FLAG = 'ONBOARDING_EMAILS_ENABLED'
/** Projects read per run, and emails sent per run. */
export const PROJECT_READ_CAP = 300
export const PROJECTS_PER_RUN = 20

export interface OutgoingOnboarding { to: string; email: OnboardingEmail }

/** The owner's address, language and first name, from the account and nothing else. */
export interface OnboardingOwner {
  email: string | null
  locale: PublicLocale | null
  firstName: string | null
  shopify: boolean
}

export interface OnboardingDeps {
  admin: ServiceRoleClient
  env: Record<string, string | undefined>
  now: () => Date
  /** The owner's address, language and first name (from the account), or null when unreadable. */
  owner: (userId: string) => Promise<OnboardingOwner | null>
  /** Hand one email to the provider; only ever called past every check. */
  send: (msg: OutgoingOnboarding) => Promise<{ ok: boolean }>
}

export type OnboardingRun =
  | { status: 'off' | 'outside_window' | 'not_configured' | 'not_installed' | 'failed' }
  | { status: 'done'; considered: number; sent: number; failed: number }

/** Is the run allowed to touch anything at all? Pure, so a guard can pin every gate. */
export function onboardingGate(env: Record<string, string | undefined>, now: Date): 'off' | 'outside_window' | 'not_configured' | 'go' {
  if (env[ONBOARDING_FLAG] !== 'true') return 'off'
  if (!inSendWindow(now)) return 'outside_window'
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL || !env.CRON_SECRET || !safeOrigin(env.NEXT_PUBLIC_APP_URL)) return 'not_configured'
  return 'go'
}

type Row = Record<string, unknown>
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

const MISSING_TABLE = new Set(['42P01', 'PGRST202', 'PGRST205'])

/**
 * The project ids in `ids` that have a row in `table`, or null when the table could not be
 * read. A table that is not installed is "no rows", the same thing the app's own nudges do.
 * Only ever used for tables that hold AT MOST ONE row per project, so `ids.length` is the
 * whole answer and a truncated page cannot read as an absence.
 */
async function idsWithRow(
  admin: ServiceRoleClient, table: string, ids: string[], filters: { equals?: [string, string]; isNull?: string } = {},
): Promise<Set<string> | null> {
  try {
    let q = admin.from(table).select('project_id').in('project_id', ids).limit(ids.length)
    if (filters.equals) q = q.eq(filters.equals[0], filters.equals[1])
    if (filters.isNull) q = q.is(filters.isNull, null)
    const { data, error } = await q
    if (error) return MISSING_TABLE.has(String((error as { code?: unknown }).code ?? '')) ? new Set() : null
    const out = new Set<string>()
    for (const r of (data ?? []) as Row[]) {
      const id = str(r.project_id)
      if (id) out.add(id)
    }
    return out
  } catch {
    return null
  }
}

/** Has this project ever published anything? Null when the answer could not be read. */
async function hasPublished(admin: ServiceRoleClient, projectId: string, ownerId: string): Promise<boolean | null> {
  try {
    const { data, error } = await admin.from('generated_articles').select('id')
      .eq('project_id', projectId).eq('user_id', ownerId).eq('status', 'published').limit(1)
    if (error) return MISSING_TABLE.has(String((error as { code?: unknown }).code ?? '')) ? false : null
    return Array.isArray(data) && data.length > 0
  } catch {
    return null
  }
}

export async function runOnboardingEmails(deps: OnboardingDeps): Promise<OnboardingRun> {
  const now = deps.now()
  const gate = onboardingGate(deps.env, now)
  if (gate !== 'go') return { status: gate }
  const origin = safeOrigin(deps.env.NEXT_PUBLIC_APP_URL)!
  const { admin } = deps

  try {
    // Projects old enough for the earliest of the two emails; the rest is decided per project.
    const cutoff = new Date(now.getTime() - CONNECT_AFTER_MS).toISOString()
    const { data, error } = await admin.from('projects')
      .select('id, user_id, created_at, target_domain, business_name, is_active')
      .lte('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(PROJECT_READ_CAP)
    if (error) return { status: 'failed' }

    const projects = ((data ?? []) as Row[]).filter((r) => str(r.id) && str(r.user_id) && str(r.created_at) && r.is_active !== false)
    if (projects.length === 0) return { status: 'done', considered: 0, sent: 0, failed: 0 }
    const ids = projects.map((r) => String(r.id))

    // The app's own definition of "the site is connected" (lib/nudges/waiting.ts), set-based.
    const [wp, platform, shopify, plugin] = await Promise.all([
      idsWithRow(admin, 'wordpress_connections', ids),
      idsWithRow(admin, 'site_platform_connections', ids),
      idsWithRow(admin, 'shopify_connections', ids, { isNull: 'archived_at' }),
      // A WordPress site connected by the GO TOP SEO Bridge plugin alone is connected too.
      idsWithRow(admin, 'site_fix_plugin_links', ids, { equals: ['status', 'connected'] }),
    ])
    // An absence we cannot verify is not an absence: say nothing rather than the wrong thing.
    if (!wp || !platform || !shopify || !plugin) return { status: 'failed' }

    let considered = 0, sent = 0, failed = 0
    let installed = true
    for (const row of projects) {
      if (sent + failed >= PROJECTS_PER_RUN) break
      const projectId = String(row.id)
      const ownerId = String(row.user_id)
      const createdAt = String(row.created_at)
      const connected = wp.has(projectId) || platform.has(projectId) || shopify.has(projectId) || plugin.has(projectId)
      // A connected project can only ever get the `publish` email, so one too young for it
      // is past both stages and is not read again.
      if (connected && now.getTime() - Date.parse(createdAt) < PUBLISH_AFTER_MS) continue
      considered++

      const read = await readOnboardingState(admin, projectId, ownerId)
      if (read.status === 'unavailable') { installed = false; break }
      if (read.status === 'failed') { failed++; continue }

      // "Nothing published" is read per project, not in one page: a project may hold many
      // published articles, and a page cut short would read as an absence.
      let published = false
      if (connected) {
        const seen = await hasPublished(admin, projectId, ownerId)
        if (seen === null) { failed++; continue }
        if (seen) continue
        published = seen
      }
      const decision = decideOnboardingEmail({ now, facts: { createdAt, connected, published }, state: read.state })
      if (!decision.send) continue

      const who = await deps.owner(ownerId).catch(() => null)
      if (!who?.email) continue
      const locale: PublicLocale = who.locale ?? (who.shopify ? 'en' : 'he')
      const token = makeUnsubscribeToken(projectId, ownerId, deps.env)
      const domain = str(row.target_domain) ?? str(row.business_name)
      if (!token || !domain) continue

      const at = now.toISOString()
      const won = await claimOnboardingSend(admin, projectId, ownerId, read.state, { stage: decision.stage, sentCount: decision.sentCount, at })
      if (!won) continue
      const email = buildOnboardingEmail({ stage: decision.stage as Stage, locale, firstName: who.firstName, domain, projectId, origin, token })
      let ok = false
      try { ok = (await deps.send({ to: who.email, email })).ok } catch { ok = false }
      if (ok) sent++
      else { failed++; await releaseOnboardingClaim(admin, projectId, ownerId, read.state, at).catch(() => undefined) }
    }
    if (!installed) return { status: 'not_installed' }
    if (sent > 0 || failed > 0) console.log('[onboarding-emails] run complete', { considered, sent, failed })
    return { status: 'done', considered, sent, failed }
  } catch {
    console.error('[onboarding-emails] run failed')
    return { status: 'failed' }
  }
}
