/**
 * The automatic internal links as the article stores them, in its existing
 * internal_links_json column (no migration): one entry per link,
 *   { source: 'auto', anchor, url, title, at, removed? }
 * next to the entries the older flows write ('planned', 'manual'), which keep
 * their meaning. An 'auto' entry is an OUTGOING link of this article, so the
 * inbound anchor bank (internal-link-candidates.ts readAnchorBank) skips it.
 *
 * The article view lists the ones still in the body (autoLinksShown); the
 * customer removes one with a click, which takes the <a> out of the body
 * (words stay) and marks the entry removed, so it is never listed or added
 * again. Pure: safe in the browser and on the server.
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
