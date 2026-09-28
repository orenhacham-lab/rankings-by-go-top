/**
 * The browser tab's title for a dashboard screen: the screen's own name, then
 * the brand ("מחקר ביטויים | Go Top"). Every dashboard screen used to carry the
 * marketing site's title, so six open tabs read the same.
 *
 * The screen's name is the one its sidebar entry shows (the same dictionary
 * entry), resolved with the sidebar's own rule: the LONGEST matching href wins,
 * so /content/articles/<id> is "מאמרים" and /keywords/<id>/history is "מילות
 * מפתח". A few screens have no sidebar entry and are named here. A path that
 * matches nothing gets the brand alone, never another screen's name.
 *
 * Pure: no React, no DOM (lib/shell/__qa__/shell-motion.qa.ts).
 */

export const TITLE_BRAND = 'Go Top'

export interface TitledRoute { href: string; label: string }

export function longestMatch(pathname: string, routes: readonly TitledRoute[]): TitledRoute | null {
  let best: TitledRoute | null = null
  for (const r of routes) {
    if (pathname === r.href || pathname.startsWith(`${r.href}/`)) {
      if (!best || r.href.length > best.href.length) best = r
    }
  }
  return best
}

export function pageTitle(pathname: string, routes: readonly TitledRoute[]): string {
  const hit = longestMatch(pathname, routes)
  return hit ? `${hit.label} | ${TITLE_BRAND}` : TITLE_BRAND
}
