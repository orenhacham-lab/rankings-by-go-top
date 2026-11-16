/**
 * The automatic internal links as the article stores them, in its existing
 * internal_links_json column (no migration): one entry per link,
 *   { source: 'auto', anchor, url, title, at, removed?, synced?, checkedAt? }
 * next to the entries the older flows write ('planned', 'manual'), which keep
 * their meaning. An 'auto' entry is an OUTGOING link of this article, so the
 * inbound anchor bank (internal-link-candidates.ts readAnchorBank) skips it.
 *
 * The article view lists the ones still in the body (autoLinksShown); the
 * customer removes one with a click, which takes the <a> out of the body
 * (words stay) and marks the entry removed, so it is never listed or added
 * again. Pure: safe in the browser and on the server.
 *
 * TWO MARKS THE HEALING PASS KEEPS (./heal.ts), both optional, both absent on
 * every entry written before it existed:
 *   checkedAt  when the target was last asked and answered. A link already
 *              published is asked again from time to time, because a page can
 *              be taken down months after the article went live.
 *   synced     the article was sent to the site AFTER this link was removed,
 *              so the live post no longer carries it. A removed entry without
 *              it means our copy is clean and the published post is not yet:
 *              that is what the pass looks for.
 */
import { linkPresent } from '@/lib/link-network/anchor'

export const AUTO_SOURCE = 'auto' as const

export interface AutoLinkEntry {
  source: typeof AUTO_SOURCE
  anchor: string
  url: string
  title: string
  at: string
  removed?: boolean
  /** The published post was updated after this link was removed from the body. */
  synced?: boolean
  /** ISO time the target was last asked and did not answer "gone". */
  checkedAt?: string
}

export function isAutoEntry(e: unknown): e is AutoLinkEntry {
  if (!e || typeof e !== 'object') return false
  const v = e as Record<string, unknown>
  return v.source === AUTO_SOURCE && typeof v.url === 'string' && /^https:\/\//i.test(v.url) && typeof v.anchor === 'string'
}

/** Every automatic entry (removed or not). */
export function autoEntries(json: unknown): AutoLinkEntry[] {
  return Array.isArray(json) ? json.filter(isAutoEntry) : []
}

/** Did the automatic step add links to this article (so the older link panels are not needed for it)? */
export function hasAutoLinks(json: unknown): boolean {
  return autoEntries(json).length > 0
}

/** The automatic links to list: not removed, and still in the body as a link. */
export function autoLinksShown(json: unknown, html: string | null | undefined): AutoLinkEntry[] {
  const seen = new Set<string>()
  return autoEntries(json).filter((e) => {
    if (e.removed || seen.has(e.url) || !linkPresent(html, e.url)) return false
    seen.add(e.url)
    return true
  })
}

/** The stored list after the customer removed one link: the entry stays, marked removed. */
export function markAutoRemoved(json: unknown, url: string): unknown[] {
  const list = Array.isArray(json) ? json : []
  return list.map((e) => (isAutoEntry(e) && e.url === url ? { ...e, removed: true } : e))
}

/**
 * The stored list after the healing pass asked the targets: every URL in `gone`
 * is marked removed (its `synced` is deliberately NOT set — the published post
 * still has it until the article is sent again), and every other live entry it
 * asked carries the time it answered.
 */
export function markAutoChecked(json: unknown, gone: Iterable<string>, at: string): unknown[] {
  const dead = new Set(gone)
  const list = Array.isArray(json) ? json : []
  return list.map((e) => {
    if (!isAutoEntry(e) || e.removed) return e
    return dead.has(e.url) ? { ...e, removed: true, checkedAt: at } : { ...e, checkedAt: at }
  })
}

/** The stored list after the published post was updated: every removed entry is in step with the site. */
export function markAutoSynced(json: unknown): unknown[] {
  const list = Array.isArray(json) ? json : []
  return list.map((e) => (isAutoEntry(e) && e.removed ? { ...e, synced: true } : e))
}

/** A removed link our copy no longer has and the published post still does. */
export function autoNeedsSync(json: unknown): boolean {
  return autoEntries(json).some((e) => e.removed && !e.synced)
}

/**
 * The oldest time any still-live automatic link of this article was asked, or 0
 * when one was never asked. A smaller number is the article to re-check first.
 */
export function autoOldestCheck(json: unknown): number {
  const live = autoEntries(json).filter((e) => !e.removed)
  if (!live.length) return Number.POSITIVE_INFINITY
  let oldest = Number.POSITIVE_INFINITY
  for (const e of live) {
    const t = e.checkedAt ? Date.parse(e.checkedAt) : NaN
    oldest = Math.min(oldest, Number.isFinite(t) ? t : 0)
  }
  return oldest
}
