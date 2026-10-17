/**
 * After a scan of a WordPress site: is each content problem really in the post's or page's own
 * content, which is all a fix writes? The scan reads the page as visitors see it, theme included. An
 * image without alt text in the header, a broken link in the menu, or any change on a page a page
 * builder renders from its own data (Elementor and the like, ./builder.ts) is not in that content,
 * and a "fix it for me" button there could only end in "nothing to change", or in a change nobody
 * sees.
 *
 * So the pages are read the way the fix would read them, with what the existing connection already
 * answers and nothing new: the Go Top plugin's signed /inspect (the post's content and, from 2.1.0,
 * whether a builder renders it), or, without the plugin, the WordPress REST API through the
 * application password. Every page the scan read, a few at a time inside one time budget
 * (./read-pool.ts): what has not answered by then stays as the scan found it. Then:
 *   image alt   counted from the content (./scan-refine.ts): a theme-only page is said once for the
 *               whole site, a page whose own text has images without alt is listed even where the
 *               theme's images kept it under the scan's threshold;
 *   broken link a dead link that is not in the content of the page it was found on (a menu, a
 *               footer) is marked `outside: 'theme'`;
 *   a builder   image alt, broken link and FAQ rows on such a page are marked `outside: 'builder'`;
 *   media       with the application password, an image outside the page's text that is a Media
 *               Library item without alt text keeps its button: the fix writes on the item
 *               (./media-alt.ts). The theme's repeated ones are offered once, on the site-wide line.
 * Read-only: nothing is written here, and nothing in the plugin changes.
 */
import { allRows, canFix, repeatedAltImages } from '@/lib/site-health/rules'
import type { ConnectionState, Finding, FindingPage, PageFacts, SitePlatform } from '@/lib/site-health/types'
import { imagesMissingAlt } from '@/lib/site-health/wordpress-fix'
import { rendersFromBuilderData } from './builder'
import { brokenLinkWords } from './content'
import { MAX_MEDIA_LOOKUPS, MEDIA_CONCURRENCY, readAll } from './read-pool'
import { refineImageAlt, type ReachableAlt } from './scan-refine'

/** One page's own content as the fix would read it; 'not_ours' when it is no post or page WordPress has. */
export type WpRead = { content: string; builder: boolean | null } | 'not_ours' | null
export type WpReader = (url: string) => Promise<WpRead>

/** The rows checked here: their fix type and which page holds the problem. */
const CHECKED: Record<string, (p: FindingPage) => string | null> = {
  image_alt: (p) => p.url,
  broken_link: (p) => p.from ?? null,
  faq_block: (p) => p.url,
}

export async function markWordPressOutsideContent(
  findings: Finding[],
  scanned: readonly PageFacts[],
  read: WpReader,
  ctx: {
    platform: SitePlatform; connections: ConnectionState; homeHost: string
    /**
     * With the site's application password: the Media Library item an image is (./media-alt.ts), so an
     * image outside the page's text that is such an item, still without alt text, keeps a fix button.
     */
    findMedia?: ((src: string) => Promise<{ alt: string } | null>) | null
  },
): Promise<void> {
  const todo: { f: Finding; p: FindingPage; src: string }[] = []
  // Image rows first (the biggest share of dead buttons), then broken links, then FAQ.
  for (const type of Object.keys(CHECKED)) {
    for (const f of findings) {
      if (f.fixType !== type) continue
      for (const p of allRows(f)) {
        const src = CHECKED[type](p)
        if (src && !p.outside) todo.push({ f, p, src })
      }
    }
  }
  // Then every other post and page the scan read, for alt text the scan's threshold hid.
  const others = scanned.filter((s) => s.ok && (s.kind === 'article' || s.kind === 'page')).map((s) => s.url)
  const urls = [...new Set([...todo.map((t) => t.src), ...others])]
  if (urls.length === 0) return

  // Beside the reads: which images without alt text are Media Library items that have none either.
  // The listed rows' images first, then the theme's repeated ones, then the rest.
  const listed = new Set(findings.filter((f) => f.fixType === 'image_alt').flatMap((f) => allRows(f).map((p) => p.url)))
  const srcs = [...new Set([
    ...scanned.filter((s) => listed.has(s.url)).flatMap((s) => s.images.missing ?? []),
    ...repeatedAltImages(scanned.filter((s) => s.ok)),
    ...scanned.flatMap((s) => s.images.missing ?? []),
  ].filter(Boolean))]
  const got = new Map<string, Exclude<WpRead, null>>()
  const empty = new Set<string>()
  const findMedia = ctx.findMedia
  await Promise.all([
    readAll(urls, async (url, deadline) => {
      const r = await read(url)
      if (r && Date.now() <= deadline) got.set(url, r)
    }),
    findMedia ? readAll(srcs, async (src, deadline) => {
      const m = await findMedia(src)
      if (m && m.alt.trim() === '' && Date.now() <= deadline) empty.add(src)
    }, { max: MAX_MEDIA_LOOKUPS, concurrency: MEDIA_CONCURRENCY }) : null,
  ])
  const answered = new Map(got)
  const inMedia = new Set(empty)

  for (const { f, p, src } of todo) {
    const r = answered.get(src)
    if (!r || r === 'not_ours') continue
    if (rendersFromBuilderData(r)) { p.outside = 'builder'; p.fixable = false; continue }
    if (f.fixType === 'broken_link' && brokenLinkWords(r.content, p.url, ctx.homeHost).length === 0) { p.outside = 'theme'; p.fixable = false }
  }
  // Alt text: counted from the content, except on builder pages (marked above, left as they are).
  const reach = new Map<string, ReachableAlt>()
  for (const [url, r] of answered) {
    if (r === 'not_ours') reach.set(url, 'not_ours')
    else if (!rendersFromBuilderData(r)) reach.set(url, imagesMissingAlt(r.content).length)
  }
  refineImageAlt(findings, scanned, reach, { fixable: (page) => canFix('alt', page, ctx.platform, ctx.connections), inMedia })
}
