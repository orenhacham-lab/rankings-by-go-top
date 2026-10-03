/**
 * One fix, one place: which approved fix (a `site_fix_jobs` row) already covers which finding
 * row, so the screen never offers "fix it for me" twice and the server never writes the same
 * fix twice. Pure; used by the screen (components/site-health) and by the approve route
 * (lib/site-fix/api.ts) alike.
 *
 * What "the same place" means, per type:
 *   broken_link    the page the dead link is on AND the dead link itself
 *   internal_link  the forgotten page that gets a link (from whichever page gives it)
 *   everything     the page itself
 * The fix type is always part of it: a new title does not answer a missing description.
 */
import type { FixType, JobStatus } from './types'

/** Statuses that mean "this fix is done or on its way": approving it again would double it. */
export const HOLDING_STATUSES: readonly JobStatus[] = ['pending', 'applied', 'sent', 'manual']

export type FixRowState = 'applied' | 'queued' | null

/** The fix target of one job or one approval request. */
export interface FixTarget {
  type: FixType
  /** The page that is written to. */
  pageUrl: string
  /** broken_link: the dead href; internal_link: the page that gets the link; otherwise null. */
  subject: string | null
}

/** Compare addresses the way a merchant would: no scheme, no "www.", no hash, no trailing slash. */
export function urlKey(raw: string | null | undefined): string {
  const t = String(raw ?? '').trim()
  if (!t) return ''
  try {
    const u = new URL(t)
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    let path = u.pathname
    try { path = decodeURI(path) } catch { /* keep it encoded */ }
    path = path.replace(/\/+$/, '') || '/'
    return `${host}${path}${u.search}`
  } catch {
    return t.replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase()
  }
}

/** The subject of a stored payload (see FixTarget.subject). */
export function subjectOf(type: FixType, payload: Record<string, unknown> | null | undefined): string | null {
  const p = payload ?? {}
  if (type === 'broken_link') return typeof p.href === 'string' ? p.href : null
  if (type === 'internal_link') return typeof p.target === 'string' ? p.target : null
  return null
}

/** Two targets are the same place (see the header). */
export function sameTarget(a: FixTarget, b: FixTarget): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'internal_link') return !!a.subject && urlKey(a.subject) === urlKey(b.subject)
  if (urlKey(a.pageUrl) !== urlKey(b.pageUrl)) return false
  if (a.type === 'broken_link') return urlKey(a.subject) === urlKey(b.subject)
  return true
}

/**
 * The target a finding row would fix. Finding rows name the dead link by its address and the page
 * it was found on by `from`; an orphan row names the forgotten page.
 */
export function rowTarget(type: FixType, page: { url: string; from?: string | null }): FixTarget {
  if (type === 'broken_link') return { type, pageUrl: page.from ?? '', subject: page.url }
  if (type === 'internal_link') return { type, pageUrl: '', subject: page.url }
  return { type, pageUrl: page.url, subject: null }
}

/**
 * Where a finding row stands against the jobs (newest first, as the queue lists them): the newest
 * job for the same place decides. Applied or sent reads "fixed"; pending or waiting for a manual
 * update reads "in the queue"; failed, cancelled or undone offers the fix again.
 */
export function rowStateFrom(
  jobs: readonly { type: FixType; pageUrl: string; subject?: string | null; status: JobStatus }[],
  target: FixTarget,
): FixRowState {
  for (const j of jobs) {
    if (!sameTarget({ type: j.type, pageUrl: j.pageUrl, subject: j.subject ?? null }, target)) continue
    if (j.status === 'applied' || j.status === 'sent') return 'applied'
    if (j.status === 'pending' || j.status === 'manual') return 'queued'
    return null
  }
  return null
}
