/**
 * The one-line note under a finding's page row, and whether the row links to the store's admin.
 *
 * Pure, so the screen (components/site-health/FindingCard.tsx) and its guard
 * (lib/site-health/__qa__/shopify-row-notes.qa.ts) read the same decision.
 *
 *   inTheme          the site's own check found the problem in the theme, a menu or a widget
 *   inProduct        a store product's own photos (alt text is set on the product, in its media)
 *   inBuilder        a page builder renders the page from its own data
 *   schemaFromTheme  structured data on a Shopify store: it comes from the theme (or a theme app),
 *                    never from an item the store's admin edits, so the row has NO admin link
 *   productPage      a store's product or collection page: the store connection covers articles
 *   collectionPage   and pages, so this one is fixed in Shopify (the row keeps its admin link)
 */
import type { Finding, FindingPage, SitePlatform } from './types'

export type RowNote = 'inTheme' | 'inProduct' | 'inBuilder' | 'schemaFromTheme' | 'productPage' | 'collectionPage'

export function rowGuidance(
  finding: Pick<Finding, 'id'>,
  page: Pick<FindingPage, 'kind' | 'outside' | 'adminUrl'>,
  ctx: { platform: SitePlatform; storeConnected: boolean },
): { note: RowNote | null; adminLink: boolean } {
  const shopify = ctx.platform === 'shopify'
  // Structured data on a store is the theme's: an item's page in the admin has nowhere to add it.
  if (shopify && finding.id === 'schema_missing') return { note: 'schemaFromTheme', adminLink: false }
  const adminLink = !!page.adminUrl
  if (page.outside === 'theme') return { note: 'inTheme', adminLink }
  if (page.outside === 'builder') return { note: 'inBuilder', adminLink }
  if (page.outside === 'product') return { note: page.kind === 'collection' ? 'collectionPage' : 'inProduct', adminLink }
  // A broken link's row is the dead address; where it is fixed is the page it was found on.
  if (shopify && ctx.storeConnected && finding.id !== 'broken_links') {
    if (page.kind === 'product') return { note: 'productPage', adminLink }
    if (page.kind === 'collection') return { note: 'collectionPage', adminLink }
  }
  return { note: null, adminLink }
}
