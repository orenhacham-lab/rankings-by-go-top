/**
 * Small formatting helpers of the existing-content screen. Kept apart from the
 * components so the presentation can move onto new primitives without them.
 */

/** Every page is on the same site, so the path is what tells two rows apart. */
export function displayPath(url: string): string {
  try {
    const u = new URL(url)
    const path = decodeURIComponent(u.pathname)
    return path === '/' ? u.host : path
  } catch {
    return url
  }
}

/**
 * A row's name. A page known only from Search Console has no title: the list names it from its address
 * ("Solar heater not heating"), which on a Hebrew screen reads as an English name nobody chose. There the row
 * shows the keyword it ranks for when it is in Hebrew, else its address ("/blog/wall-damp"). A real title,
 * or a name made from a Hebrew address, is shown as it is.
 */
export function rowTitle(
  it: { title: string; titleFromUrl: boolean; isHome: boolean; url: string; metrics: { topQuery: string | null } | null },
  homePage: string,
  hebrew: boolean,
): { text: string; isPath: boolean } {
  if (it.isHome) return { text: homePage, isPath: false }
  if (!hebrew || !it.titleFromUrl || /[\u0590-\u05FF]/.test(it.title)) return { text: it.title, isPath: false }
  const q = it.metrics?.topQuery?.trim()
  if (q && /[\u0590-\u05FF]/.test(q)) return { text: q, isPath: false }
  return { text: displayPath(it.url), isPath: true }
}

export const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s)

/** "a, b and c" with the dictionary's own joiners. */
export function joinList(parts: readonly string[], join: string, last: string): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(join)}${last}${parts[parts.length - 1]}`
}

/** The four kinds' colours on the composition bar and the legend (design contract §1: categories). */
export const KIND_TONE = {
  product: 'bg-action',
  article: 'bg-action/60',
  page: 'bg-action/35',
  category: 'bg-line-strong',
} as const
