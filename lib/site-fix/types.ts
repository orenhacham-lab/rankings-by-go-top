/**
 * Site health auto-fix: the shapes the queue, the channels, the routes, the
 * plugin and the screen share. No merchant-facing words live here; the screen
 * takes them from the `siteHealth.queue` / `siteHealth.plugin` dictionaries.
 *
 * THE WHITELIST. `FIX_TYPES` is the complete list of what may ever be written
 * to a merchant's site. The database CHECK (supabase/migrations/
 * 20260928000300_site_fix_queue.sql), the WordPress plugin's own list
 * (wordpress-plugin/gotop-seo-bridge, gotop_seo_bridge_fix_types()) and
 * `validateFix` (./whitelist.ts) hold the same nine names; a QA guard fails when
 * they drift apart. Nothing here deletes content, touches prices or products,
 * the theme, plugins, settings or users, or publishes/unpublishes a page.
 */

export const FIX_TYPES = [
  'seo_title',
  'meta_description',
  'canonical',
  'focus_keyphrase',
  'image_alt',
  'faq_block',
  'schema_jsonld',
  'broken_link',
  'internal_link',
] as const
export type FixType = (typeof FIX_TYPES)[number]

/** Written into the page's own content (undo refuses when the page changed since). */
export const BODY_FIX_TYPES: readonly FixType[] = ['image_alt', 'faq_block', 'broken_link', 'internal_link']
/** Stored beside the content (SEO plugin fields or the plugin's own meta). */
export const META_FIX_TYPES: readonly FixType[] = ['seo_title', 'meta_description', 'canonical', 'focus_keyphrase', 'schema_jsonld']

/** ממתין · הוחל · נכשל · בוטל · נשלח · לעדכון ידני · הוחזר */
export const JOB_STATUSES = ['pending', 'applied', 'failed', 'cancelled', 'sent', 'manual', 'reverted'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export const CHANNELS = ['plugin', 'app_password', 'webhook', 'manual'] as const
export type FixChannel = (typeof CHANNELS)[number]

export const AUDIT_ACTIONS = [
  'approved', 'applied', 'failed', 'sent', 'marked_manual', 'cancelled', 'retried', 'reverted', 'revert_failed',
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export type FaqItem = { q: string; a: string }
export type AltItem = { src: string; alt: string }

/** The approved new value(s), per type. This is exactly what the approval sentence describes. */
export type FixPayload =
  | { type: 'seo_title'; value: string }
  | { type: 'meta_description'; value: string }
  | { type: 'canonical'; value: string }
  | { type: 'focus_keyphrase'; value: string }
  | { type: 'image_alt'; images: AltItem[] }
  | { type: 'faq_block'; heading: string; items: FaqItem[] }
  | { type: 'schema_jsonld'; schema: Record<string, unknown> }
  /** `href` is the dead link in the page's content; `replacement` null removes the link and keeps its words. */
  | { type: 'broken_link'; href: string; replacement: string | null }
  /** `target` is the page that gets the link; `anchor` is words already in the written page. */
  | { type: 'internal_link'; target: string; anchor: string }

export type FixErrorCode =
  | 'unauthorized'
  | 'not_found'
  | 'invalid_request'
  | 'queue_unavailable'
  | 'not_allowed'
  | 'value_invalid'
  | 'off_site'
  | 'shopify_readonly'
  | 'no_channel'
  | 'needs_plugin'
  | 'plugin_not_connected'
  | 'plugin_unreachable'
  | 'plugin_rejected'
  | 'plugin_outdated'
  | 'not_in_wordpress'
  | 'no_safe_place'
  | 'nothing_to_change'
  | 'nothing_to_fix'
  | 'needs_seo_plugin'
  | 'wordpress_permission'
  | 'changed_since_preview'
  | 'nothing_to_undo'
  | 'wrong_state'
  | 'write_not_confirmed'
  | 'webhook_failed'
  | 'store_failed'

/** One row of `site_fix_jobs`, as the server reads it. */
export interface FixJobRow {
  id: string
  user_id: string
  project_id: string
  fix_type: FixType
  finding_kind: string
  page_url: string
  payload: Record<string, unknown>
  before_value: string | null
  after_summary: string | null
  channel: FixChannel
  status: JobStatus
  error_code: string | null
  undo: Record<string, unknown> | null
  remote_ref: string | null
  approved_by: string
  approved_at: string
  approved_ip: string | null
  applied_at: string | null
  reverted_at: string | null
  created_at: string
  updated_at: string
}

/** What the screen gets for one job: never the undo data, never an IP of someone else. */
export interface FixJobView {
  id: string
  type: FixType
  findingKind: string
  pageUrl: string
  status: JobStatus
  channel: FixChannel
  before: string | null
  after: string | null
  errorCode: string | null
  approvedAt: string
  appliedAt: string | null
  revertedAt: string | null
  canUndo: boolean
  canCancel: boolean
  canRetry: boolean
}

/** The plugin's pairing as the screen sees it. */
export type PluginState =
  | { state: 'none' }
  | { state: 'pending'; hint: string }
  | { state: 'connected'; version: string | null; seoPlugin: 'yoast' | 'rankmath' | 'none' | null; lastSeenAt: string | null }
  | { state: 'disconnected'; lastSeenAt: string | null }

/** Where an approved fix goes for one project, and whether the queue exists at all. */
export interface FixCapabilities {
  /** The tables exist (the migration is applied). When false the screen hides the queue. */
  available: boolean
  /** Shopify: nothing is written; findings keep their instructions. */
  readOnly: boolean
  /** The channel an approval of each type would take right now. */
  channelFor: Partial<Record<FixType, FixChannel | 'needs_plugin'>>
  plugin: PluginState
  /** The site is connected by application password (WordPress REST). */
  appPassword: boolean
  /** A custom site (webhook) connection is live. */
  webhook: boolean
  /** The site is WordPress (connected or detected), so the plugin applies. */
  wordpress: boolean
}
