/**
 * Image alt text after a scan, counted from what a fix can REACH (the page's own text, and on a store
 * an article's featured image), not from every image a visitor's page carries. Shared by the store's
 * check (./shopify-scan.ts) and the WordPress one (./wordpress-scan.ts), which read the pages' own
 * content first; this part is pure.
 *
 *   - a listed page: `measure` becomes what a fix reaches, `themeMissing` the rest (header, footer,
 *     product cards, widgets). Nothing a fix reaches: the page is `outside: 'theme'`;
 *   - a page the scan read but did not list (more than 80% of its images had alt text, mostly the
 *     theme's) whose own text HAS images without alt: it is listed, with what a fix reaches;
 *   - the theme-only pages are said ONCE for the whole site (`themeAlt`), not as one row per page
 *     with no button: fixing the theme fixes every page at once;
 *   - pages a fix can reach are listed first; every row stays (`pages`, then `morePages`).
 * Read-only: what is reported changes, nothing is written anywhere.
 */
import { allRows, repeatedAltImages, MAX_PAGES_SHOWN, pathOf, SEVERITY, sortFindings } from '@/lib/site-health/rules'
import type { Finding, FindingPage, PageFacts } from '@/lib/site-health/types'

/** What one page's own content holds: how many images without alt a fix reaches, or not ours to edit. */
export type ReachableAlt = number | 'not_ours'

export function refineImageAlt(
  findings: Finding[],
  scanned: readonly Pick<PageFacts, 'url' | 'kind' | 'ok' | 'images' | 'adminUrl'>[],
  reach: ReadonlyMap<string, ReachableAlt>,
  opts: {
    fixable: (page: Pick<PageFacts, 'kind'>) => boolean
    /** WordPress with the application password: images that are Media Library items without alt text (./media-alt.ts). */
    inMedia?: ReadonlySet<string>
  },
): void {
  let f = findings.find((x) => x.id === 'images_alt' || x.fixType === 'image_alt')
  const rows = f ? allRows(f) : []
  const facts = new Map(scanned.map((s) => [s.url, s]))
  const repeated = repeatedAltImages(scanned.filter((s) => s.ok))
  // A page's own images outside its text that the Media Library holds without alt text (not the theme's repeated ones).
  const mediaOf = (url: string) => {
    const inMedia = opts.inMedia
    return inMedia ? [...new Set((facts.get(url)?.images.missing ?? []).filter((s) => s && inMedia.has(s) && !repeated.has(s)))].length : 0
  }
  for (const p of rows) {
    const r = reach.get(p.url)
    if (r === undefined || p.outside) continue
    // `themeMissing` may already hold the theme's repeated images (lib/site-health/rules.ts).
    const seen = p.measure ?? 0
    const before = p.themeMissing ?? 0
    const media = r === 'not_ours' || r === 0 ? mediaOf(p.url) : 0
    if (media > 0) { p.media = true; p.fixable = true; p.measure = media; p.themeMissing = before + Math.max(0, seen - media); continue }
    if (r === 'not_ours') { p.outside = 'theme'; p.fixable = false; continue }
    if (r === 0) { p.outside = 'theme'; p.fixable = false; p.themeMissing = before + seen; continue }
    p.themeMissing = before + Math.max(0, seen - r)
    p.measure = r
  }
  // A page whose own text has images without alt, hidden by the whole page's share of images with it.
  const listed = new Set(rows.map((p) => p.url))
  const added: FindingPage[] = []
  for (const s of scanned) {
    const r = reach.get(s.url)
    // Not listed by the scan (under its threshold, or its images taken for the theme's): the page's own
    // text says otherwise, and the text is what a fix writes.
    if (!s.ok || listed.has(s.url) || typeof r !== 'number' || r <= 0) continue
    added.push({
      url: s.url, path: pathOf(s.url), kind: s.kind, value: null, measure: r, fixable: opts.fixable(s), adminUrl: s.adminUrl,
      themeMissing: Math.max(0, s.images.missingAlt - r),
    })
  }
  // The theme's repeated images that are Media Library items without alt text: one fix for the site.
  const repeatedInMedia = !!opts.inMedia && [...repeated].some((s) => opts.inMedia!.has(s))
  if (!f && added.length === 0 && !repeatedInMedia) return
  if (!f) {
    f = { id: 'images_alt', severity: SEVERITY.images_alt, pages: [], total: 0, field: 'alt', guide: 'alt', fixable: false, fixType: 'image_alt' }
    findings.push(f)
  }
  const all = [...rows, ...added]
  // Theme-only pages: once, for the whole site.
  const themeOnly = all.filter((p) => p.outside === 'theme')
  const rest = all.filter((p) => p.outside !== 'theme')
  if (themeOnly.length > 0) {
    const prev = f.themeAlt ?? { pages: 0, images: 0 }
    f.themeAlt = {
      pages: prev.pages + themeOnly.length,
      images: Math.max(prev.images, ...themeOnly.map((p) => p.themeMissing ?? p.measure ?? 0)),
    }
  }
  if (repeatedInMedia) {
    const showing = scanned.filter((s) => s.ok && (s.images.missing ?? []).some((x) => repeated.has(x)))
    const most = Math.max(0, ...showing.map((s) => (s.images.missing ?? []).filter((x) => repeated.has(x)).length))
    f.themeAlt = { pages: f.themeAlt?.pages || showing.length, images: f.themeAlt?.images || most, media: true }
  }
  setRows(f, rest)
  if (repeatedInMedia) f.fixable = true
  sortFindings(findings)
}

/**
 * A finding's rows, in a new order: the ones a fix can reach first (the screen lists the first ten),
 * then the rest. `total` follows.
 */
export function setRows(f: Finding, rows: readonly FindingPage[]): void {
  const ordered = [...rows.filter((p) => !p.outside), ...rows.filter((p) => !!p.outside)]
  f.pages = ordered.slice(0, MAX_PAGES_SHOWN)
  const more = ordered.slice(MAX_PAGES_SHOWN)
  if (more.length > 0) f.morePages = more
  else delete f.morePages
  f.total = ordered.length
  f.fixable = ordered.some((p) => p.fixable)
}
