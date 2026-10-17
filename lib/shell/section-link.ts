/**
 * A link to a SECTION of the screen the reader is already on.
 *
 * The notifications' "connect the site" row is `/settings?projectId=…#platform`.
 * Opened from the settings screen itself, the router had nothing to do: the
 * address was the same (or differed only by its `?projectId=`, which the
 * sidebar's `/settings` leaves out), no screen loaded, and the screen's own
 * "open the section in the address" step runs only when it loads. So the click
 * did nothing at all (owner's report of 10 October 2026). Such a link is
 * followed in place instead: the address is updated and the section scrolled to.
 *
 * Pure (lib/shell/__qa__/section-link.qa.ts); the click handler that uses it is
 * components/layout/section-link.ts.
 */

/** The section id a same-screen link points at, or null when the link leaves this screen. */
export function samePageSection(current: { pathname: string }, href: string, origin = 'http://app.local'): string | null {
  let target: URL
  try { target = new URL(href, `${origin}${current.pathname}`) } catch { return null }
  if (target.origin !== origin) return null
  const id = decodeURIComponent(target.hash.replace(/^#/, '')).trim()
  if (!id) return null
  return target.pathname === current.pathname ? id : null
}
