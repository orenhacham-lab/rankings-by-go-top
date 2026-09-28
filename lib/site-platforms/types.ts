/**
 * Site platforms beyond WordPress and Shopify: Wix and a custom site reached by
 * a signed webhook. One row per project in `site_platform_connections`
 * (supabase/migrations/20260928000100_site_platform_connections.sql).
 *
 * The secret (a Wix API key, or the webhook signing secret) is stored
 * AES-256-GCM encrypted and NEVER leaves the server: `sanitizeSiteConnection`
 * is the only shape a route may return, and it has no field that could carry it.
 */

export type SitePlatform = 'wix' | 'webhook'
export const SITE_PLATFORMS: readonly SitePlatform[] = ['wix', 'webhook']
export function isSitePlatform(v: unknown): v is SitePlatform {
  return v === 'wix' || v === 'webhook'
}

/** Every platform a web project can choose from the "change platform" modal. */
export type ChoosablePlatform = 'wordpress' | 'shopify' | SitePlatform
export const CHOOSABLE_PLATFORMS: readonly ChoosablePlatform[] = ['wordpress', 'shopify', 'wix', 'webhook']

export type SiteConnectionStatus = 'untested' | 'connected' | 'failed'

export type SiteConnectionRow = {
  id: string
  user_id: string
  project_id: string
  platform: SitePlatform
  wix_site_id: string | null
  wix_member_id: string | null
  site_url: string | null
  endpoint_url: string | null
  secret_encrypted: string
  secret_hint: string
  connection_status: SiteConnectionStatus
  last_error_code: string | null
  last_tested_at: string | null
  created_at: string
  updated_at: string
}

/** The columns a browser role is granted by the migration (no secret, no internal author id). */
export const SAFE_SITE_COLUMNS =
  'id, project_id, platform, wix_site_id, site_url, endpoint_url, secret_hint, connection_status, last_error_code, last_tested_at, created_at, updated_at'

export type SanitizedSiteConnection = {
  id: string
  project_id: string
  platform: SitePlatform
  wix_site_id: string | null
  site_url: string | null
  endpoint_url: string | null
  /** A masked form ("••••a1b2"), never the secret. */
  secret_hint: string
  connection_status: SiteConnectionStatus
  last_error_code: string | null
  last_tested_at: string | null
  created_at: string
  updated_at: string
}

/**
 * The ONLY shape of a site connection a route may send to a browser. Built by
 * listing allowed fields (never by deleting secret ones), so a column added
 * later is private until someone lists it here.
 */
export function sanitizeSiteConnection(row: Pick<SiteConnectionRow, keyof SanitizedSiteConnection>): SanitizedSiteConnection {
  return {
    id: row.id,
    project_id: row.project_id,
    platform: row.platform,
    wix_site_id: row.wix_site_id ?? null,
    site_url: row.site_url ?? null,
    endpoint_url: row.endpoint_url ?? null,
    secret_hint: row.secret_hint,
    connection_status: row.connection_status,
    last_error_code: row.last_error_code ?? null,
    last_tested_at: row.last_tested_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/** The article fields a site adapter publishes. */
export type SitePublishArticle = {
  id: string
  title: string | null
  slug: string | null
  excerpt: string | null
  meta_title: string | null
  meta_description: string | null
  content_html: string | null
  featured_image_url: string | null
  site_post_platform?: string | null
  site_post_id?: string | null
  site_post_url?: string | null
  /** FAQ pairs and dates, for the webhook payload's structured_data (JSON-LD). */
  faq_json?: { question: string; answer: string }[] | null
  published_at?: string | null
  updated_at?: string | null
  /** Publisher facts and language for structured_data; loaded by the orchestrator for a webhook. */
  schema_context?: { publisherName: string | null; publisherUrl: string | null; language: 'he' | 'en' } | null
}

export const SITE_ARTICLE_SELECT =
  'id, project_id, topic_id, title, slug, excerpt, meta_title, meta_description, content_html, status, featured_image_url, site_post_platform, site_post_id, site_post_url, faq_json, published_at, updated_at'

/** What an adapter returns. `code` is a stable, merchant-safe reason (see errors.ts). */
export type SitePublishResult =
  | { ok: true; postId: string; url: string | null }
  | { ok: false; code: SiteErrorCode; retryable: boolean }

/**
 * Every failure a merchant can be shown. The screen localizes these; no
 * provider text (a Wix message, a receiver's HTML error page) is ever shown or
 * stored — only one of these codes.
 */
export type SiteErrorCode =
  | 'invalid_site_id'
  | 'invalid_api_key'
  | 'invalid_url'
  | 'url_not_https'
  | 'url_not_public'
  | 'url_unresolvable'
  | 'wix_auth_failed'
  | 'wix_blog_missing'
  | 'wix_no_author'
  | 'wix_rejected'
  | 'wix_unavailable'
  | 'webhook_redirect_refused'
  | 'webhook_rejected'
  | 'webhook_unreachable'
  | 'webhook_timeout'
  | 'webhook_too_large'
  | 'no_site_connection'
  | 'site_connection_inactive'
  | 'credentials_unreadable'
  | 'encryption_unavailable'
  | 'platform_already_connected'
  | 'platform_switch_locked'
  | 'article_missing'
  | 'article_empty'
  | 'save_failed'
  | 'unexpected'

export const SITE_ERROR_CODES: readonly SiteErrorCode[] = [
  'invalid_site_id', 'invalid_api_key', 'invalid_url', 'url_not_https', 'url_not_public', 'url_unresolvable',
  'wix_auth_failed', 'wix_blog_missing', 'wix_no_author', 'wix_rejected', 'wix_unavailable',
  'webhook_redirect_refused', 'webhook_rejected', 'webhook_unreachable', 'webhook_timeout', 'webhook_too_large',
  'no_site_connection', 'site_connection_inactive', 'credentials_unreadable', 'encryption_unavailable',
  'platform_already_connected', 'platform_switch_locked', 'article_missing', 'article_empty', 'save_failed', 'unexpected',
]

export function isSiteErrorCode(v: unknown): v is SiteErrorCode {
  return typeof v === 'string' && (SITE_ERROR_CODES as readonly string[]).includes(v)
}
