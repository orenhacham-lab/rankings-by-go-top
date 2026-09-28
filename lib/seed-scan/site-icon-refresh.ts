/**
 * A second look for the site's icon, for projects whose finished seeding scan
 * stored none (lib/site-icon.ts says where icons come from).
 *
 * WHY. The icon is read off the home page the scan fetched (a1). Runs from
 * before the icon was read at all, and runs whose page named an icon the rules
 * then refused (a platform CDN, an http:// href), carry no `siteIcon`; nothing
 * ever read their page again, so those projects showed their initial forever.
 *
 * WHEN. When the owner's project list loads (GET /api/projects/active), after
 * the response (next/server `after`), for at most MAX_PER_REQUEST projects, and
 * for each project at most once every RETRY_AFTER_MS: the attempt is recorded
 * in the run's summary (`siteIconCheckedAt`) whatever it found. A run still in
 * progress is never touched (the pipeline owns its summary until it ends).
 *
 * HOW. Exactly the way a1 reads the home page, with the same guards
 * (lib/free-check hardening): the project's own address admitted by
 * normalizeCheckUrl, every DNS answer public (assertPublicHost), every hop
 * pinned to the project's own host (hostPinnedFetch: www and the bare domain,
 * nothing else), the engine's own byte and redirect caps, one deadline over the
 * whole read. ONE request for the page and nothing else: the icon URL itself is
 * never fetched here, only the owner's browser loads it.
 *
 * Nothing here spends anything (no model, no provider, no quota), and a failure
 * of any kind is only "no icon this time".
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { assertPublicHost, domainKey, fetchSiteHtml, normalizeCheckUrl, type HostAdmission } from '@/lib/free-check'
import { safeSiteIcon } from '@/lib/site-icon'
import { hostPinnedFetch } from './site-access'
import { siteIconFromHtml } from './site-icon'

/** A project is looked at again at most this often. */
export const RETRY_AFTER_MS = 7 * 24 * 60 * 60 * 1000
/** Projects looked at per project-list load. */
export const MAX_PER_REQUEST = 2
/** The whole read of one home page, redirects and body included. */
export const PAGE_DEADLINE_MS = 8_000

const FINISHED = ['done', 'partial'] as const

export type IconRunRow = {
  id: string
  project_id: string
  status: string | null
  summary: Record<string, unknown> | null
}

/** Whether this run should have its site's icon looked for again now. */
export function needsIconRetry(run: IconRunRow | null | undefined, now: Date): boolean {
  if (!run || !(FINISHED as readonly string[]).includes(run.status ?? '')) return false
  const summary = run.summary
  if (!summary || typeof summary !== 'object') return false
  if (typeof summary.siteIcon === 'string' && summary.siteIcon) return false
  const checked = typeof summary.siteIconCheckedAt === 'string' ? Date.parse(summary.siteIconCheckedAt) : NaN
  return !(Number.isFinite(checked) && now.getTime() - checked < RETRY_AFTER_MS)
}

export type IconRefreshDeps = {
  fetchImpl: typeof fetch
  assertHost: (hostname: string) => Promise<HostAdmission>
  fetchHtml: typeof fetchSiteHtml
  now: () => Date
}

export const realIconRefreshDeps = (): IconRefreshDeps => ({
  fetchImpl: fetch,
  assertHost: (hostname) => assertPublicHost(hostname),
  fetchHtml: fetchSiteHtml,
  now: () => new Date(),
})

/** The icon the project's home page declares now, read under a1's guards; null for anything else. */
export async function readDeclaredIcon(targetDomain: string | null, deps: IconRefreshDeps): Promise<string | null> {
  const admitted = normalizeCheckUrl(targetDomain ?? '')
  if (!admitted.ok) return null
  const start = admitted.url
  try {
    const host = await deps.assertHost(start.hostname)
    if (!host.ok) return null
    const clock = new AbortController()
    const timer = setTimeout(() => clock.abort(), PAGE_DEADLINE_MS)
    try {
      const fetchImpl = hostPinnedFetch({ siteKey: domainKey(start), base: deps.fetchImpl, deadline: clock.signal, trace: [], offHost: { hit: false } })
      const page = await deps.fetchHtml(start, { fetchImpl })
      if (!page.ok) return null
      return safeSiteIcon(siteIconFromHtml(page.html, page.url), targetDomain)
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return null
  }
}

/**
 * Look again for the icon of one project's finished run, and record the attempt
 * in that run's summary. The write is fenced to the same run of the same project
 * and owner, and only while the run is still finished.
 */
export async function refreshRunIcon(
  admin: ServiceRoleClient,
  input: { run: IconRunRow; userId: string; targetDomain: string | null },
  deps: IconRefreshDeps,
): Promise<'found' | 'none' | 'skipped'> {
  const now = deps.now()
  if (!needsIconRetry(input.run, now)) return 'skipped'
  const icon = await readDeclaredIcon(input.targetDomain, deps)
  const summary = { ...(input.run.summary ?? {}), siteIconCheckedAt: now.toISOString(), ...(icon ? { siteIcon: icon } : {}) }
  try {
    await admin
      .from('project_seed_runs')
      .update({ summary })
      .eq('id', input.run.id)
      .eq('project_id', input.run.project_id)
      .eq('user_id', input.userId)
      .in('status', [...FINISHED])
  } catch {
    // Best effort: the next load tries again.
  }
  return icon ? 'found' : 'none'
}
