/**
 * Site health: the shapes the scan, the rules, the routes and the screen share.
 * Nothing here holds text for the merchant: every word comes from the dashboard
 * dictionaries (`siteHealth` in lib/i18n/dashboard/he.ts and en.ts), keyed by the
 * ids below.
 */

/** In words on the screen, never as a colour alone: "urgent", "important", "small improvement". */
export type Severity = 'urgent' | 'important' | 'minor'

export type FindingKind =
  | 'home_unreachable'
  | 'robots_blocks_all'
  | 'noindex'
  | 'broken_links'
  | 'title_missing'
  | 'title_long'
  | 'title_duplicate'
  | 'description_missing'
  | 'images_alt'
  | 'h1_missing'
  | 'robots_blocks_ai'
  | 'sitemap_missing'
  | 'title_short'
  | 'description_length'
  | 'description_duplicate'
  | 'h1_multiple'
  | 'orphan_page'
  | 'no_viewport'
  | 'canonical_missing'
  | 'schema_missing'
  | 'faq_missing'

/** What the platform is, as far as we know it; decides the step-by-step card. */
export type SitePlatform = 'wordpress' | 'shopify' | 'wix' | 'other'

export type PageKind = 'home' | 'article' | 'page' | 'product' | 'collection' | 'other'

/** What a one-click fix changes. Only WordPress, only through its existing connection. */
export type FixField = 'title' | 'description' | 'alt' | 'link'

/** The topic of a step-by-step card; the card itself is `guides[topic][platform]`. */
export type GuideTopic =
  | 'title' | 'description' | 'alt' | 'h1' | 'noindex' | 'robots' | 'robots_ai'
  | 'broken' | 'sitemap' | 'orphan' | 'viewport' | 'unreachable' | 'canonical' | 'schema' | 'faq'

/** One page as the scan read it. */
export interface PageFacts {
  url: string
  kind: PageKind
  /** The page could be read at all. */
  ok: boolean
  status: number | null
  title: string | null
  description: string | null
  h1: string[]
  images: { total: number; missingAlt: number }
  noindex: boolean
  viewport: boolean
  /** Same-site links on the page (for the broken-link check). */
  links: string[]
  /** The page's rel=canonical, when it has one (absent in reports cached before it was read). */
  canonical?: string | null
  /** Distinct JSON-LD @type values on the page. */
  schemaTypes?: string[]
  /** A visible questions-and-answers block (FAQ schema, or several question headings). */
  faq?: boolean
  /** A direct link to this item in the store's admin, when we know it (Shopify). */
  adminUrl: string | null
}

export interface SiteFacts {
  /** The address the scan started from. */
  siteUrl: string
  homeReachable: boolean
  robots: { blocksAll: boolean; blocksAi: boolean; blockedBots: string[]; readable: boolean }
  /** null = not checked (robots.txt forbade it, or the check ran out of time). */
  sitemapFound: boolean | null
  /** Same-site links that answered 404/410, with a page that links to each. */
  brokenLinks: { url: string; from: string }[]
  /** Pages no other page links to (WordPress index only; the crawl is too small to tell). */
  orphanPages: { url: string; title: string; keyword: string }[]
}

export interface FindingPage {
  url: string
  path: string
  kind: PageKind
  /** The value the check measured (a title, a description), when there is one. */
  value: string | null
  /** A number the check measured: a length, a count of images, a count of headings. */
  measure: number | null
  /** A one-click fix is offered for this page. */
  fixable: boolean
  adminUrl: string | null
  /** For a broken link: the page it was found on. */
  from?: string | null
}

export interface Finding {
  id: FindingKind
  severity: Severity
  /** The first pages (up to MAX_PAGES_SHOWN); `total` counts all of them. */
  pages: FindingPage[]
  total: number
  field: FixField | null
  guide: GuideTopic
  /** At least one page offers "fix it for me". */
  fixable: boolean
  /** The approved-fix type (lib/site-fix) this finding is fixed with, where one exists. */
  fixType?: import('@/lib/site-fix/types').FixType | null
}

export interface ConnectionState {
  wordpress: boolean
  shopify: boolean
  wix: boolean
}

export interface SiteHealthReport {
  siteUrl: string
  scannedAt: string
  platform: SitePlatform
  connections: ConnectionState
  pagesChecked: number
  /** Fewer pages could be read than were planned (time ran out, pages refused). */
  partial: boolean
  score: number
  findings: Finding[]
}

/** One line of the scan's NDJSON stream. */
export type ScanStreamLine =
  | { type: 'progress'; done: number; total: number; stage: 'pages' | 'links' | 'site' }
  | { type: 'report'; report: SiteHealthReport }
  | { type: 'error'; code: SiteHealthErrorCode }

export type SiteHealthErrorCode =
  | 'unauthorized'
  | 'not_found'
  | 'invalid_request'
  | 'site_unreachable'
  | 'site_blocked'
  | 'scan_failed'
  | 'no_connection'
  | 'not_in_wordpress'
  | 'needs_seo_plugin'
  | 'needs_bridge'
  | 'nothing_to_fix'
  | 'no_safe_place'
  | 'changed_since_preview'
  | 'approval_required'
  /** The fix queue is live: every write goes through it (approved, audited, undoable). */
  | 'use_fix_queue'
  | 'wordpress_permission'
  | 'wordpress_unreachable'
  | 'write_not_confirmed'
  | 'value_invalid'
  | 'off_site'
