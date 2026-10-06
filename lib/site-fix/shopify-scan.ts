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
import type { Finding, FindingPage } from '@/lib/site-health/types'
import { imagesMissingAlt } from '@/lib/site-health/wordpress-fix'
import { brokenLinkWords } from './content'
import { bodyH1s, findShopItem, type ShopCreds, type ShopifyFixClient, type ShopItem } from './shopify-admin'
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

export async function markShopifyOutsideContent(
  findings: Finding[],
  deps: { admin: Admin; scope: Scope; creds: ShopCreds; client: ShopifyFixClient },
): Promise<void> {
  const todo: { f: Finding; p: FindingPage; src: string }[] = []
  for (const f of findings) {
    if (!f.fixType || !CHECKED.has(f.fixType)) continue
    for (const p of f.pages) {
      const src = sourceOf(f, p)
      if (src && (f.fixType === 'broken_link' || p.kind === 'article' || p.kind === 'page')) todo.push({ f, p, src })
    }
  }
  const urls = [...new Set(todo.map((t) => t.src))].slice(0, MAX_READS)
  if (urls.length === 0) return
  const deadline = Date.now() + TIME_MS
  const items = new Map<string, ShopItem | 'not_ours'>()
  let timer: ReturnType<typeof setTimeout> | undefined
  const outOfTime = new Promise<void>((resolve) => { timer = setTimeout(resolve, TIME_MS) })
  const reads = Promise.all(urls.map(async (url) => {
    try {
      const ref = await findShopItem(deps.admin, deps.scope, url)
      // Not one of the store's articles or pages (a product, a collection, the home page): nothing there is ours to edit.
      if (!ref) { items.set(url, 'not_ours'); return }
      if (Date.now() > deadline) return
      const item = await deps.client.read(deps.creds, ref)
      if (item && Date.now() <= deadline) items.set(url, item)
    } catch { /* unreadable: left as the scan found it */ }
  }))
  // The report never waits on the store for long: what has not answered by then stays as scanned.
  await Promise.race([reads, outOfTime])
  clearTimeout(timer)
  const answered = new Map(items)
  for (const { f, p, src } of todo) {
    const item = answered.get(src)
    if (!item || !f.fixType) continue
    if (item === 'not_ours' || !inEditableContent(f.fixType, item, p)) { p.outside = 'theme'; p.fixable = false }
  }
}
