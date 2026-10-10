/**
 * Site health auto-fix: the shapes the queue, the channels, the routes, the
 * plugin and the screen share. No merchant-facing words live here; the screen
 * takes them from the `siteHealth.queue` / `siteHealth.plugin` dictionaries.
 *
 * THE WHITELIST. `FIX_TYPES` is the complete list of what may ever be written
 * to a merchant's site. The database CHECK (supabase/migrations/
 * 20260928000300_site_fix_queue.sql, widened by 20260929100000_site_fix_h1_llms.sql),
 * the WordPress plugin's own list (wordpress-plugin/gotop-seo-bridge,
 * gotop_seo_bridge_fix_types()) and `validateFix` (./whitelist.ts) hold the same
 * eleven names; a QA guard fails when they drift apart. `h1_demote` and `llms_txt`
 * arrived with plugin 2.1.0: a site on 2.0.0 is never sent them (PLUGIN_MIN_VERSION). Nothing here deletes content, touches prices or products,
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
  'h1_demote',
  'llms_txt',
] as const
export type FixType = (typeof FIX_TYPES)[number]

/** Written into the page's own content (undo refuses when the page changed since). */
export const BODY_FIX_TYPES: readonly FixType[] = ['image_alt', 'faq_block', 'broken_link', 'internal_link', 'h1_demote']
/** Stored beside the content (SEO plugin fields or the plugin's own meta). */
export const META_FIX_TYPES: readonly FixType[] = ['seo_title', 'meta_description', 'canonical', 'focus_keyphrase', 'schema_jsonld']
/** Belongs to the site, not to one page (the plugin's own option, answered at /llms.txt). */
export const SITE_FIX_TYPES: readonly FixType[] = ['llms_txt']

/** The latest plugin this app ships (wordpress-plugin/gotop-seo-bridge; a guard pins it to the PHP). */
export const PLUGIN_LATEST_VERSION = '3.1.0'
/** The first plugin that needs no application password for anything (./plugin-capabilities.ts). */
export const READ_PLUGIN_MIN_VERSION = '3.1.0'
/**
 * The first plugin version that knows a fix type. Anything not listed exists since 2.0.0. An older
 * plugin is never sent a type it does not know: the screen offers "update the plugin" instead.
 */
export const PLUGIN_MIN_VERSION: Partial<Record<FixType, string>> = { h1_demote: '2.1.0', llms_txt: '2.1.0' }
/** Types only the plugin can write (no application-password or webhook path). */
export const PLUGIN_ONLY_TYPES: readonly FixType[] = ['h1_demote', 'llms_txt']

/**
 * "Apply all safe fixes" (one confirmation, plugin sites only; UX decision F) takes ONLY these
 * types, and only with a suggestion that passed its check (./bulk.ts). Why each is safe:
 *   seo_title, meta_description   stored in the SEO plugin's field (or the plugin's own), the text
 *                                 visitors read is untouched, the value is checked (length, never the
 *                                 current one), the previous value is kept, undoable.
 *   image_alt                     only images in the content that have NO alt get one; nothing a
 *                                 visitor sees changes; undoable.
 * Left out on purpose, each needs the merchant's eyes, one by one: canonical (a wrong one can drop a
 * page from Google), schema_jsonld (structured data is a statement about the business), broken_link
 * (chooses where a link goes or removes it), internal_link (picks words to link), faq_block (adds
 * visible text), h1_demote (changes how headings look), llms_txt (a site-wide file to read first),
 * focus_keyphrase (a choice of strategy).
 */
export const BULK_SAFE_TYPES: readonly FixType[] = ['seo_title', 'meta_description', 'image_alt']

/**
 * Automatic fixes (the project's own switch, OFF until the owner turns it on in settings; WordPress
 * with the Go Top plugin only, never Shopify) take ONLY these types. The database CHECK of
 * site_fix_auto_grants (supabase/migrations/20261006140000_site_fix_auto_grants.sql) holds the same
 * three names; a QA guard fails when they drift apart. Why each is safe without anyone looking:
 *   image_alt         only images with NO alt attribute at all (an empty alt is a choice and stays);
 *                     the file name's words, or the page title for at most one image per page
 *   broken_link       only a link that answers 404 or 410 again right before the write; the link is
 *                     removed and its words stay, nothing new is linked
 *   meta_description  only where the page has no description at all, stored or live
 * Every one keeps the value before it and its own undo. Separate from BULK_SAFE_TYPES on purpose:
 * one click with the merchant's eyes on the list is not the same as no click.
 */
export const AUTO_SAFE_TYPES: readonly FixType[] = ['image_alt', 'broken_link', 'meta_description']
/** The in-app summary of automatic fixes counts this far back (the screen; no email). */
export const AUTO_SUMMARY_DAYS = 14
/** Every other type: never applied automatically, each keeps its click. */
export const AUTO_NEVER_TYPES: readonly FixType[] = FIX_TYPES.filter((t) => !AUTO_SAFE_TYPES.includes(t))

/** a.b.c ≥ min.b.c (missing parts are 0; an unknown version is the oldest with signed routes, 2.0.0). */
export function versionAtLeast(version: string | null | undefined, min: string): boolean {
  const parse = (v: string) => v.split('.').map((x) => Number.parseInt(x, 10) || 0)
  const a = parse(version && /^[0-9]{1,3}(\.[0-9]{1,3}){0,3}$/.test(version) ? version : '2.0.0')
  const b = parse(min)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return true
}

/** The installed plugin can write this type. */
export const pluginSupports = (version: string | null | undefined, type: FixType) =>
  versionAtLeast(version, PLUGIN_MIN_VERSION[type] ?? '2.0.0')

/** ממתין · הוחל · נכשל · בוטל · נשלח · לעדכון ידני · הוחזר */
export const JOB_STATUSES = ['pending', 'applied', 'failed', 'cancelled', 'sent', 'manual', 'reverted'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export const CHANNELS = ['plugin', 'app_password', 'webhook', 'manual', 'shopify'] as const
export type FixChannel = (typeof CHANNELS)[number]

export const AUDIT_ACTIONS = [
  'approved', 'applied', 'failed', 'sent', 'marked_manual', 'cancelled', 'retried', 'reverted', 'revert_failed',
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export type FaqItem = { q: string; a: string }
export type H1Ref = { n: number; text: string }
/**
 * `media`: the image's WordPress Media Library item (./media-alt.ts). Set, the words go on that item
 * (every page showing the image gets them), through the application password; never sent to the plugin.
 */
export type AltItem = { src: string; alt: string; media?: number }
/** At most this many Media Library images in one approval (./media-alt.ts). */
export const MAX_MEDIA_ALT = 10

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
  /** The content's own <h1> elements (their place among the content's h1s, and their words) that become <h2>. */
  | { type: 'h1_demote'; headings: H1Ref[] }
  /** The whole llms.txt text (Markdown, plain text). */
  | { type: 'llms_txt'; text: string }

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
  | 'already_fixed'
  | 'write_not_confirmed'
  | 'webhook_failed'
  | 'store_failed'
  /** The installed plugin is older than the fix needs (2.1.0): update it. */
  | 'needs_update'
  /** No suggestion passed its check (length, not the current value, the keyword): nothing automatic is offered. */
  | 'no_valid_suggestion'
  /** The page has too little text of its own to write questions and answers from. */
  | 'thin_content'
  /** The extra main heading is in the theme, a page builder or somewhere we cannot prove is safe. */
  | 'h1_not_safe'
  /**
   * A page builder (Elementor and the like) renders this page from its own data: a change to the
   * page's own text would not show, so no content fix is written there.
   */
  | 'builder_page'
  /** The site already has an llms.txt file: it is never overwritten. */
  | 'llms_exists'
  /** "Apply all" was asked for a type or a value that is not in the safe list. */
  | 'not_bulk_safe'
  /** Shopify: the address is not an article or a page of this store (a product, a collection, unknown). */
  | 'not_in_store'
  /** Shopify: the store's connection does not allow editing articles and pages (reconnect it). */
  | 'store_permission'
  /** Shopify: the store did not answer. */
  | 'store_unreachable'
  /** Shopify: the store refused the change. */
  | 'store_rejected'

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
  /**
   * The address the fix is about when it is not the page itself: the dead link for a broken
   * link, the forgotten page for an internal link. The screen maps a job back to its finding
   * row with it (lib/site-fix/job-match.ts).
   */
  subject: string | null
  canUndo: boolean
  canCancel: boolean
  canRetry: boolean
  /** The "apply all safe fixes" batch this job was approved in, if any (the queue groups by it). */
  batchId?: string | null
  /** Approved by the project's automatic-fix switch, not by a click (the queue labels its batch). */
  auto?: boolean
}

/** The project's automatic-fix switch as the screens see it (`unavailable`: its table is not installed). */
export interface AutoFixView {
  state: 'on' | 'off' | 'unavailable'
  enabledAt: string | null
  lastRunAt: string | null
}

/** The plugin's pairing as the screen sees it. */
export type PluginState =
  | { state: 'none' }
  | { state: 'pending'; hint: string }
  | { state: 'connected'; version: string | null; seoPlugin: 'yoast' | 'rankmath' | 'none' | null; lastSeenAt: string | null }
  /**
   * `rekey`: the pairing is on record but its key can no longer be read, so checking it again
   * cannot help. The one way back is a new pairing code ("connect again").
   */
  | { state: 'disconnected'; lastSeenAt: string | null; rekey?: boolean }

/** Where an approved fix goes for one project, and whether the queue exists at all. */
export interface FixCapabilities {
  /** The tables exist (the migration is applied). When false the screen hides the queue. */
  available: boolean
  /**
   * Nothing is written, findings keep their instructions: a Shopify store whose connection cannot
   * edit articles and pages.
   */
  readOnly: boolean
  /** A Shopify store: only its articles and pages are fixed (products and collections keep their instructions). */
  shopify?: boolean
  /**
   * The channel an approval of each type would take right now. `needs_update`: the plugin is
   * connected but older than the type needs (PLUGIN_MIN_VERSION).
   */
  channelFor: Partial<Record<FixType, FixChannel | 'needs_plugin' | 'needs_update'>>
  /** The plugin this app ships; the screen offers the update when the site's is older. */
  pluginLatest?: string
  plugin: PluginState
  /** The site is connected by application password (WordPress REST). */
  appPassword: boolean
  /**
   * Alt text can be written on Media Library items (lib/site-fix/media-alt.ts): the plugin >= 3.1.0
   * is connected, or an application password. Absent on answers from before 3.1.0: read appPassword.
   */
  mediaAlt?: boolean
  /** A custom site (webhook) connection is live. */
  webhook: boolean
  /** The site is WordPress (connected or detected), so the plugin applies. */
  wordpress: boolean
}
