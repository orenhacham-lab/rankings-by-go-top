/**
 * After a scan of a Shopify store: is each problem on an article or a page really in the part the
 * store's connection can edit? The scan reads the page as visitors see it, theme included; a fix
 * writes only the article's or page's own content (lib/site-fix/shopify-admin.ts). An image without
 * alt text in the sidebar, a broken link in the menu or a second main heading the theme adds are
 * not in that content, and a "fix it for me" button there could only end in "nothing to change".
 * The same goes for a broken link found on a product or a collection.
 *
 * So, for each such page, the item is read through the store (at most MAX_READS, in a few seconds)
 * and the page is marked `outside: 'theme'` when the problem is not in what we may edit: the screen
 * then shows where the problem is and the instructions, not a fix button. Anything that cannot be
 * read is left as the scan found it. Read-only: nothing is written here.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { allRows } from '@/lib/site-health/rules'
import type { Finding, FindingPage, PageFacts } from '@/lib/site-health/types'
import { imagesMissingAlt } from '@/lib/site-health/wordpress-fix'
import { brokenLinkWords } from './content'
import { bodyH1s, findShopItem, type ShopCreds, type ShopifyFixClient, type ShopItem } from './shopify-admin'
import { refineImageAlt, type ReachableAlt } from './scan-refine'
import type { Scope } from './store'

type Admin = ReturnType<typeof createAdminClient>

const MAX_READS = 12
const TIME_MS = 8_000
const CHECKED: ReadonlySet<string> = new Set(['image_alt', 'broken_link', 'h1_demote'])

/** The problem is in the item's own content (or, for alt text, its featured image). */
export function inEditableContent(fixType: string, item: Pick<ShopItem, 'body' | 'image'>, page: Pick<FindingPage, 'url'>): boolean {
  if (fixType === 'image_alt') {
    if (item.image && !String(item.image.alt ?? '').trim()) return true
    return imagesMissingAlt(item.body).length > 0
  }
  if (fixType === 'broken_link') {
    try { return brokenLinkWords(item.body, page.url, new URL(page.url).hostname).length > 0 } catch { return false }
  }
  if (fixType === 'h1_demote') return (bodyH1s(item.body) ?? []).length > 0
  return true
}

/** The page whose content holds the problem: the page itself, or, for a broken link, the page it was found on. */
const sourceOf = (f: Finding, p: FindingPage) => (f.fixType === 'broken_link' ? p.from ?? null : p.url)

/** Images without alt text a fix reaches in one article or page: its text's, and an article's featured image. */
export function reachableAlt(item: Pick<ShopItem, 'body' | 'image'>): number {
  const body = imagesMissingAlt(item.body).map((i) => i.src)
  const featured = item.image && !String(item.image.alt ?? '').trim() && !body.includes(item.image.url) ? 1 : 0
  return body.length + featured
}

/**
 * `scanned`: every page the scan read. Each scanned article and page is read through the store (not
 * only the ones a finding lists), so an image without alt text in an article's own text is found even
 * where the theme's images (which have alt) kept the page under the scan's threshold, and the count on
 * each row is what a fix reaches (./scan-refine.ts). At most MAX_READS reads, inside TIME_MS.
 */
export async function markShopifyOutsideContent(
  findings: Finding[],
  deps: { admin: Admin; scope: Scope; creds: ShopCreds; client: ShopifyFixClient },
  scanned: readonly PageFacts[] = [],
): Promise<void> {
  const todo: { f: Finding; p: FindingPage; src: string }[] = []
  for (const f of findings) {
    if (!f.fixType || !CHECKED.has(f.fixType)) continue
    // A product's or a collection's own photos: set on the product, which is never ours to change.
    if (f.fixType === 'image_alt') for (const p of allRows(f)) if (p.kind === 'product' || p.kind === 'collection') { p.outside = 'product'; p.fixable = false }
    for (const p of allRows(f)) {
      if (p.outside) continue
      const src = sourceOf(f, p)
      if (src && (f.fixType === 'broken_link' || p.kind === 'article' || p.kind === 'page')) todo.push({ f, p, src })
    }
  }
  // The listed rows first, then every other article and page the scan read (for alt text it hid).
  const others = scanned.filter((s) => s.ok && (s.kind === 'article' || s.kind === 'page')).map((s) => s.url)
  const urls = [...new Set([...todo.map((t) => t.src), ...others])]
  if (urls.length === 0) return
  const deadline = Date.now() + TIME_MS
  const items = new Map<string, ShopItem | 'not_ours'>()
  let timer: ReturnType<typeof setTimeout> | undefined
  const outOfTime = new Promise<void>((resolve) => { timer = setTimeout(resolve, TIME_MS) })
  const work = (async () => {
    // Which addresses are the store's articles and pages: the store sync, no call to the store.
    const refs = await Promise.all(urls.map((url) => findShopItem(deps.admin, deps.scope, url).catch(() => undefined)))
    const toRead: { url: string; ref: NonNullable<Awaited<ReturnType<typeof findShopItem>>> }[] = []
    refs.forEach((ref, i) => {
      // Not one of the store's articles or pages (a product, a collection, the home page): nothing there is ours to edit.
      if (ref === null) items.set(urls[i], 'not_ours')
      else if (ref) toRead.push({ url: urls[i], ref })
    })
    // At most MAX_READS reads of the store, the listed rows first.
    await Promise.all(toRead.slice(0, MAX_READS).map(async ({ url, ref }) => {
      if (Date.now() > deadline) return
      try {
        const item = await deps.client.read(deps.creds, ref)
        if (item && Date.now() <= deadline) items.set(url, item)
      } catch { /* unreadable: left as the scan found it */ }
    }))
  })()
  // The report never waits on the store for long: what has not answered by then stays as scanned.
  await Promise.race([work.catch(() => undefined), outOfTime])
  clearTimeout(timer)
  const answered = new Map(items)
  for (const { f, p, src } of todo) {
    const item = answered.get(src)
    // Alt text is counted below, from what a fix reaches.
    if (!item || !f.fixType || f.fixType === 'image_alt') continue
    if (item === 'not_ours' || !inEditableContent(f.fixType, item, p)) { p.outside = 'theme'; p.fixable = false }
  }
  const reach = new Map<string, ReachableAlt>()
  for (const [url, item] of answered) reach.set(url, item === 'not_ours' ? 'not_ours' : reachableAlt(item))
  // On a store the scan's own rows carry no WordPress fix; the screen decides the button per row.
  refineImageAlt(findings, scanned, reach, { fixable: () => false })
}
