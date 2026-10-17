/**
 * Talking to the Go Top WordPress plugin. Server-side only.
 *
 * Every call is one signed POST (./plugin-auth.ts) through the WordPress client's guarded
 * transport (lib/wordpress/client.ts postToGoTopPlugin: https only, no private networks, no
 * redirects, a timeout and a size cap). Answers become our own codes; nothing the site says is
 * passed on as text.
 */
import { postToGoTopPlugin } from '@/lib/wordpress/client'
import type { WordPressCredentials } from '@/lib/wordpress/types'
import { signedHeaders } from './plugin-auth'
import type { FixErrorCode, FixType } from './types'

export interface PluginLink { siteUrl: string; keyId: string; secret: string }

export type PluginPost = typeof postToGoTopPlugin

/**
 * `pluginCode` is the plugin's own refusal code when it sent one we know of (3.0.0 publishing reads
 * it: not_ours, no_author, ...); it is a fixed word from the plugin's list, never shown as text.
 */
export type PluginAnswer<T> = { ok: true; body: T } | { ok: false; code: FixErrorCode; connectionLost: boolean; pluginCode?: PluginRefusal }

/** 3.0.0 publishing refusals (includes/publish.php), on top of the fix codes below; 3.1.0 adds the last four. */
const PUBLISH_REFUSALS = ['not_ours', 'no_author', 'download_failed', 'not_an_image', 'value_invalid', 'invalid_request', 'off_site', 'write_failed',
  'author_invalid', 'date_invalid', 'too_large', 'not_in_wordpress'] as const
export type PluginRefusal = (typeof PUBLISH_REFUSALS)[number]

/** The plugin's own refusal codes we recognise; anything else is `plugin_rejected`. */
const PLUGIN_CODES: Record<string, FixErrorCode> = {
  not_allowed: 'not_allowed',
  value_invalid: 'value_invalid',
  off_site: 'off_site',
  not_in_wordpress: 'not_in_wordpress',
  changed_since_preview: 'changed_since_preview',
  no_safe_place: 'no_safe_place',
  nothing_to_change: 'nothing_to_change',
  nothing_to_undo: 'nothing_to_undo',
  invalid_request: 'invalid_request',
  write_failed: 'write_not_confirmed',
  // 2.1.0
  builder_page: 'h1_not_safe',
  file_exists: 'llms_exists',
}

export async function callPlugin<T>(
  link: PluginLink,
  route: '/status' | '/inspect' | '/search' | '/fix' | '/undo' | '/terms' | '/media' | '/publish'
    | '/content' | '/content-item' | '/authors' | '/media-alt',
  payload: Record<string, unknown>,
  post: PluginPost = postToGoTopPlugin,
  now: () => number = Date.now,
): Promise<PluginAnswer<T>> {
  const body = JSON.stringify(payload)
  let res: { status: number; body: string }
  try {
    res = await post(link.siteUrl, route, body, { headers: signedHeaders(link, `/gotop/v1${route}`, body, now) })
  } catch {
    return { ok: false, code: 'plugin_unreachable', connectionLost: true }
  }
  let parsed: Record<string, unknown> | null = null
  try { parsed = JSON.parse(res.body) as Record<string, unknown> } catch { parsed = null }
  const code = typeof parsed?.code === 'string' ? parsed.code : ''
  const pluginCode = (PUBLISH_REFUSALS as readonly string[]).includes(code) ? { pluginCode: code as PluginRefusal } : {}
  if (res.status === 401 || res.status === 403) return { ok: false, code: 'plugin_not_connected', connectionLost: true }
  if (res.status === 404 && (code === 'rest_no_route' || !parsed)) return { ok: false, code: 'plugin_outdated', connectionLost: true }
  if (res.status >= 500 && !PLUGIN_CODES[code]) return { ok: false, code: 'plugin_unreachable', connectionLost: false, ...pluginCode }
  if (res.status >= 200 && res.status < 300 && parsed && parsed.ok === true) return { ok: true, body: parsed as T }
  return { ok: false, code: PLUGIN_CODES[code] ?? 'plugin_rejected', connectionLost: false, ...pluginCode }
}

export type PluginStatus = {
  ok: true
  version: string
  seo_plugin: 'yoast' | 'rankmath' | 'none'
  fix_types: string[]
  /** 3.1.0: what this copy can do (./plugin-capabilities.ts). Absent before 3.1.0. */
  capabilities?: string[]
}

export type PluginItem = {
  post_id: number
  post_type: string
  link: string
  title: string
  content: string
  content_sha: string
  seo_plugin: 'yoast' | 'rankmath' | 'none'
  seo: { title: string; description: string; canonical: string; focus: string; schema: string }
  /** 2.1.0: the words of each <h1> of the post's own content, in order (null: markup not simple). Absent on 2.0.0. */
  h1?: string[] | null
  /** 2.1.0: a page builder renders this page. */
  builder?: boolean
}

export type PluginFixAnswer = {
  ok: true
  status: 'applied' | 'already'
  fix_id: string
  post_id: number
  previous?: string
  applied?: string
  previous_sha?: string
  content_sha?: string
}

export const pluginStatus = (link: PluginLink, post?: PluginPost) => callPlugin<PluginStatus>(link, '/status', {}, post)
export const pluginInspect = (link: PluginLink, url: string, post?: PluginPost) =>
  callPlugin<{ ok: true; item: PluginItem }>(link, '/inspect', { url }, post)
/** The plugin answers at most 10 (its own cap); posts and pages alike. */
export const pluginSearch = (link: PluginLink, term: string, post?: PluginPost) =>
  callPlugin<{ ok: true; items: { post_id: number; link: string; title: string }[] }>(link, '/search', { term, limit: 10 }, post)
export const pluginFix = (
  link: PluginLink,
  fix: { jobId: string; type: FixType; url: string; value: Record<string, unknown>; expected: string | null },
  post?: PluginPost,
) => callPlugin<PluginFixAnswer>(link, '/fix', {
  job_id: fix.jobId, type: fix.type, url: fix.url, value: fix.value, ...(fix.expected !== null ? { expected: fix.expected } : {}),
}, post)
export const pluginUndo = (link: PluginLink, undo: { jobId: string; url: string }, post?: PluginPost) =>
  callPlugin<{ ok: true; status: 'reverted' | 'already' }>(link, '/undo', { job_id: undo.jobId, url: undo.url }, post)

// ── 3.0.0: publishing (includes/publish.php) ────────────────────────────────

export type PluginTerm = { id: number; name: string; slug: string; parent: number; /** 3.1.0 */ link?: string; /** 3.1.0 */ count?: number }
export type PluginMediaAnswer = { ok: true; status: 'applied' | 'already'; media_id: number; url: string | false }
export type PluginPublishAnswer = { ok: true; status: 'created' | 'updated'; post_id: number; link: string; post_status: string }
export type PluginPublishRequest = {
  /** The GO TOP article's id (a UUID): the plugin ties the post to it and only ever updates that post. */
  article_id: string
  title: string
  content: string
  /** `future` (3.1.0): scheduled for `date_gmt`. */
  status: 'publish' | 'draft' | 'future'
  /** 3.1.0: 'YYYY-MM-DD HH:MM:SS' in UTC, only with status future (between a minute and two years ahead). */
  date_gmt?: string
  /** 3.1.0: a second, separate post for the article (never together with post_id). */
  new_post?: boolean
  /** 3.1.0: publish as this WordPress user; the plugin checks they may publish posts. */
  author_id?: number
  /** 3.1.0: post_id is the post the app recorded for this article; take it over if no article owns it yet. */
  adopt?: boolean
  excerpt?: string
  slug?: string
  categories?: number[]
  tags?: number[]
  featured_media?: number
  /** The post published for this article before; the plugin refuses (not_ours) when it is another one. */
  post_id?: number
}

/** The site's categories or tags (the plugin answers at most 1000); product_cat needs 3.1.0 and WooCommerce. */
export const pluginTerms = (link: PluginLink, taxonomy: 'category' | 'post_tag' | 'product_cat', post?: PluginPost) =>
  callPlugin<{ ok: true; items: PluginTerm[] }>(link, '/terms', { taxonomy }, post)
/** One image into the site's Media Library, from GO TOP's public file storage only; the same address once. */
export const pluginMedia = (link: PluginLink, image: { url: string; alt: string }, post?: PluginPost) =>
  callPlugin<PluginMediaAnswer>(link, '/media', { url: image.url, alt: image.alt }, post)
/** A new post for the article, or an update of the post the plugin made for it. */
export const pluginPublish = (link: PluginLink, req: PluginPublishRequest, post?: PluginPost) =>
  callPlugin<PluginPublishAnswer>(link, '/publish', req as unknown as Record<string, unknown>, post)

// ── 3.1.0: what an application password did before (includes/read.php) ─────

/** One published post or page as the content index reads it (no body: /content-item). */
export type PluginContentItem = {
  id: number
  type: 'post' | 'page'
  link: string
  slug: string
  title: string
  /** GMT, 'YYYY-MM-DD HH:MM:SS'. */
  date: string | null
  modified: string | null
  focus_keyword: string | null
  focus_source: 'yoast_focus_keyword' | 'rankmath_focus_keyword' | null
}
export type PluginMediaItem = { id: number; source_url: string; size_urls: string[]; alt: string; title: string }

/** One page (at most 50) of published, not password-protected posts or pages, newest change first. */
export const pluginContent = (link: PluginLink, q: { type: 'post' | 'page'; page: number; perPage: number; modifiedAfter?: string }, post?: PluginPost) =>
  callPlugin<{ ok: true; items: PluginContentItem[] }>(link, '/content', {
    type: q.type, page: q.page, per_page: q.perPage, ...(q.modifiedAfter ? { modified_after: q.modifiedAfter } : {}),
  }, post)
/** The displayed HTML of one published post or page. */
export const pluginContentItem = (link: PluginLink, type: 'post' | 'page', id: number, post?: PluginPost) =>
  callPlugin<{ ok: true; id: number; content: string }>(link, '/content-item', { type, id }, post)
/** The users who may publish posts (id and display name), and the plugin's default author. */
export const pluginAuthors = (link: PluginLink, post?: PluginPost) =>
  callPlugin<{ ok: true; items: { id: number; name: string }[]; default: number }>(link, '/authors', {}, post)
/** Media Library images by file name (title or slug), at most 20. */
export const pluginMediaSearch = (link: PluginLink, term: string, by: 'title' | 'slug', post?: PluginPost) =>
  callPlugin<{ ok: true; items: PluginMediaItem[] }>(link, '/media-alt', { action: 'search', term, by }, post)
export const pluginMediaGet = (link: PluginLink, id: number, post?: PluginPost) =>
  callPlugin<{ ok: true; item: PluginMediaItem }>(link, '/media-alt', { action: 'get', id }, post)
/** Set one image's alt text ('' removes it: the undo of an image that had none). */
export const pluginMediaSetAlt = (link: PluginLink, id: number, alt: string, post?: PluginPost) =>
  callPlugin<{ ok: true; item: PluginMediaItem }>(link, '/media-alt', { action: 'set', id, alt }, post)

/**
 * Hand the plugin its key over the site's existing application-password connection. WordPress
 * lets only an administrator (manage_options) do this; any other answer is a code.
 */
export async function pairOverAppPassword(
  creds: WordPressCredentials,
  code: string,
  post: PluginPost = postToGoTopPlugin,
): Promise<{ ok: true } | { ok: false; code: 'plugin_outdated' | 'wordpress_permission' | 'plugin_unreachable' | 'plugin_rejected' }> {
  let res: { status: number; body: string }
  try {
    res = await post(creds.siteUrl, '/pair', JSON.stringify({ code }), { creds })
  } catch {
    return { ok: false, code: 'plugin_unreachable' }
  }
  if (res.status === 401 || res.status === 403) return { ok: false, code: 'wordpress_permission' }
  if (res.status === 404) return { ok: false, code: 'plugin_outdated' }
  let parsed: { ok?: unknown } | null = null
  try { parsed = JSON.parse(res.body) as { ok?: unknown } } catch { parsed = null }
  return res.status >= 200 && res.status < 300 && parsed?.ok === true ? { ok: true } : { ok: false, code: 'plugin_rejected' }
}
