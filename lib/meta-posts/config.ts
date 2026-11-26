/**
 * Posts on Facebook and Instagram: the server-authoritative feature flag, the
 * app's exact name and the OAuth configuration. Server-only (the name constant
 * is safe anywhere).
 *
 * OFF everywhere by default. Two flags, the same convention as lib/gbp/config.ts:
 *   META_POSTS_ENABLED             (server) every /api/meta/* route (except the
 *                                  two callbacks Meta itself calls, which must
 *                                  keep answering so a removal request is never
 *                                  lost) and the page answer 404 unless it is
 *                                  exactly 'true'.
 *   NEXT_PUBLIC_META_POSTS_ENABLED (build) only shows the sidebar entry.
 *
 * The app id, the app secret and the redirect URI are server env vars and are
 * never derived from a request. The Graph API version is pinned here and can be
 * overridden with META_GRAPH_VERSION; it was checked against Meta's changelog on 2026-11-25
 * (latest: v27.0, introduced 2026-11-04); re-check it before each App Review.
 */

/**
 * The app's name exactly as it is registered with Meta. The data-deletion page
 * and the privacy text print it, and legal asked that it match character for
 * character (legal review 2026-11-25, condition 5). Never abbreviate it, and
 * never write it in a way that suggests Meta makes or endorses the service.
 */
export const META_APP_NAME = 'Go Top SEO Publisher'

/** The permissions this flow asks for, and nothing else (no business_management, no ads_read). */
export const META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish',
] as const

/** The permissions without which the connection is of no use. */
export const META_REQUIRED_SCOPES = ['pages_show_list', 'pages_manage_posts'] as const

export const META_DEFAULT_GRAPH_VERSION = 'v27.0'

export function metaGraphVersion(): string {
  const v = process.env.META_GRAPH_VERSION?.trim()
  return v && /^v\d{1,2}\.\d$/.test(v) ? v : META_DEFAULT_GRAPH_VERSION
}

export function isMetaPostsEnabled(): boolean {
  return process.env.META_POSTS_ENABLED === 'true'
}

export interface MetaOAuthConfig {
  appId: string
  appSecret: string
  redirectUri: string
  /** Facebook Login for Business configuration id; when set it replaces the classic scope list. */
  configId: string | null
}

export class MetaConfigError extends Error {
  constructor(message: string) { super(message); this.name = 'MetaConfigError' }
}

export function getMetaAppSecret(): string {
  const s = process.env.META_APP_SECRET?.trim()
  if (!s) throw new MetaConfigError('META_APP_SECRET is not set.')
  return s
}

export function getMetaOAuthConfig(): MetaOAuthConfig {
  const appId = process.env.META_APP_ID?.trim()
  const redirectUri = process.env.META_REDIRECT_URI?.trim()
  if (!appId || !/^[0-9]{5,32}$/.test(appId)) throw new MetaConfigError('META_APP_ID is not set.')
  const appSecret = getMetaAppSecret()
  if (!redirectUri || !/^https:\/\/|^http:\/\/localhost[:/]/.test(redirectUri)) throw new MetaConfigError('META_REDIRECT_URI is not set.')
  const configId = process.env.META_LOGIN_CONFIG_ID?.trim()
  return { appId, appSecret, redirectUri, configId: configId && /^[0-9]{5,32}$/.test(configId) ? configId : null }
}

export function isMetaOAuthConfigured(): boolean {
  try { getMetaOAuthConfig(); return true } catch { return false }
}
