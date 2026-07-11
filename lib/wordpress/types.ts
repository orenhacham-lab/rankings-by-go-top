/**
 * WordPress REST API types for the content module.
 * Only the fields the app actually consumes are typed.
 */

export interface WordPressCredentials {
  /** Site base URL, https only (e.g. https://example.com). */
  siteUrl: string
  /** WordPress username the Application Password belongs to. */
  username: string
  /** Application Password (plaintext, decrypted server-side at call time). */
  applicationPassword: string
}

export interface WordPressUser {
  id: number
  name: string
  slug: string
}

export interface WordPressCategory {
  id: number
  name: string
  slug: string
  parent: number
  count: number
}

export interface WordPressTag {
  id: number
  name: string
  slug: string
  count: number
}

export interface WordPressTestResult {
  ok: boolean
  /** Authenticated user (present when ok). */
  user?: WordPressUser
  /** Human-readable failure reason (present when not ok). Never contains credentials. */
  error?: string
}

/**
 * A published post/page fetched from the WP REST API (read-only content scan).
 * title/excerpt are tag-stripped for readability; contentHtml is the raw
 * rendered HTML we parse for internal links. Focus keywords are intentionally
 * absent — standard REST does not expose Yoast/RankMath/AIOSEO focus keywords.
 */
export type SeoKeywordSource = 'yoast_focus_keyword' | 'rankmath_focus_keyword' | 'aioseo_focus_keyword'

export interface WordPressContentItem {
  id: number
  type: string
  link: string
  slug: string
  title: string
  excerpt: string
  contentHtml: string
  status: string
  date: string | null
  modified: string | null
  categories: number[]
  tags: number[]
  /**
   * SEO plugin focus keyword IF the site exposes it via REST post meta
   * (Yoast/RankMath/AIOSEO). Null when not exposed — never assumed, never
   * required. AIOSEO usually stores keywords outside post meta, so it is often
   * unavailable even when the plugin is active.
   */
  seoFocusKeyword: string | null
  seoKeywordSource: SeoKeywordSource | null
}

export interface WordPressListOptions {
  page?: number
  perPage?: number
  /** ISO date — only items modified after this (incremental scans). */
  modifiedAfter?: string
}
