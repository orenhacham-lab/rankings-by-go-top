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

export type PluginAnswer<T> = { ok: true; body: T } | { ok: false; code: FixErrorCode; connectionLost: boolean }

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
}

export async function callPlugin<T>(
  link: PluginLink,
  route: '/status' | '/inspect' | '/search' | '/fix' | '/undo',
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
  if (res.status === 401 || res.status === 403) return { ok: false, code: 'plugin_not_connected', connectionLost: true }
  if (res.status === 404 && (code === 'rest_no_route' || !parsed)) return { ok: false, code: 'plugin_outdated', connectionLost: true }
  if (res.status >= 500 && !PLUGIN_CODES[code]) return { ok: false, code: 'plugin_unreachable', connectionLost: false }
  if (res.status >= 200 && res.status < 300 && parsed && parsed.ok === true) return { ok: true, body: parsed as T }
  return { ok: false, code: PLUGIN_CODES[code] ?? 'plugin_rejected', connectionLost: false }
}

export type PluginStatus = { ok: true; version: string; seo_plugin: 'yoast' | 'rankmath' | 'none'; fix_types: string[] }

export type PluginItem = {
  post_id: number
  post_type: string
  link: string
  title: string
  content: string
  content_sha: string
  seo_plugin: 'yoast' | 'rankmath' | 'none'
  seo: { title: string; description: string; canonical: string; focus: string; schema: string }
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
export const pluginSearch = (link: PluginLink, term: string, post?: PluginPost) =>
  callPlugin<{ ok: true; items: { post_id: number; link: string; title: string }[] }>(link, '/search', { term, limit: 5 }, post)
export const pluginFix = (
  link: PluginLink,
  fix: { jobId: string; type: FixType; url: string; value: Record<string, unknown>; expected: string | null },
  post?: PluginPost,
) => callPlugin<PluginFixAnswer>(link, '/fix', {
  job_id: fix.jobId, type: fix.type, url: fix.url, value: fix.value, ...(fix.expected !== null ? { expected: fix.expected } : {}),
}, post)
export const pluginUndo = (link: PluginLink, undo: { jobId: string; url: string }, post?: PluginPost) =>
  callPlugin<{ ok: true; status: 'reverted' | 'already' }>(link, '/undo', { job_id: undo.jobId, url: undo.url }, post)

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
