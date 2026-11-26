/**
 * Facebook Login for the posting connection, and the Graph API reads that follow
 * it. Native fetch only. Server-only.
 *
 * Codes, tokens and the app secret are never logged and never put into an error.
 * Secrets travel in POST bodies, not in URLs, so they cannot end up in an access
 * log. The state is one-time and stored hashed (store.ts); there is no PKCE
 * because Meta's web flow does not offer it, and the one-time state bound to the
 * signed-in user is what protects the redirect.
 */
import { getMetaOAuthConfig, metaGraphVersion, META_SCOPES, META_REQUIRED_SCOPES } from './config'
import { MetaApiError, classifyGraphError } from './errors'

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

const graph = (path: string) => `https://graph.facebook.com/${metaGraphVersion()}${path}`

export function buildMetaAuthUrl(state: string): string {
  const { appId, redirectUri, configId } = getMetaOAuthConfig()
  const params = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, state, response_type: 'code' })
  // Facebook Login for Business takes a configuration id in place of a scope list.
  if (configId) params.set('config_id', configId)
  else params.set('scope', META_SCOPES.join(','))
  return `https://www.facebook.com/${metaGraphVersion()}/dialog/oauth?${params.toString()}`
}

async function graphCall(
  method: 'GET' | 'POST' | 'DELETE', url: string, form: Record<string, string> | null, fetchImpl: FetchLike,
): Promise<Record<string, unknown>> {
  let res: Response
  try {
    res = await fetchImpl(url, {
      method,
      ...(form ? { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() } : {}),
    })
  } catch {
    throw new MetaApiError('meta_unavailable', true)
  }
  let json: Record<string, unknown>
  try { json = await res.json() as Record<string, unknown> } catch { throw new MetaApiError('unexpected') }
  if (!res.ok || (json && typeof json === 'object' && 'error' in json)) throw classifyGraphError(res.status, json)
  return json
}

export const metaGraphPost = (path: string, form: Record<string, string>, fetchImpl: FetchLike = fetch) =>
  graphCall('POST', graph(path), form, fetchImpl)

/** A GET with the token in the query: Graph's documented shape for reads. The URL is never logged. */
export const metaGraphGet = (path: string, query: Record<string, string>, fetchImpl: FetchLike = fetch) =>
  graphCall('GET', `${graph(path)}?${new URLSearchParams(query).toString()}`, null, fetchImpl)

export interface MetaUserToken { accessToken: string; expiresAt: string | null }

/** The authorization code → a short-lived user token → a long-lived (about 60 days) one. */
export async function exchangeMetaCode(code: string, fetchImpl: FetchLike = fetch): Promise<MetaUserToken> {
  const { appId, appSecret, redirectUri } = getMetaOAuthConfig()
  const short = await metaGraphPost('/oauth/access_token', { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code }, fetchImpl)
  const shortToken = typeof short.access_token === 'string' ? short.access_token : ''
  if (!shortToken) throw new MetaApiError('unexpected')
  const long = await metaGraphPost('/oauth/access_token', {
    grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: shortToken,
  }, fetchImpl)
  const accessToken = typeof long.access_token === 'string' ? long.access_token : ''
  if (!accessToken) throw new MetaApiError('unexpected')
  const expiresIn = typeof long.expires_in === 'number' ? long.expires_in : null
  return { accessToken, expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null }
}

/** The Facebook user id (app-scoped) and the permissions actually granted. */
export async function fetchMetaIdentity(userToken: string, fetchImpl: FetchLike = fetch): Promise<{ userId: string; granted: string[] }> {
  const me = await metaGraphGet('/me', { fields: 'id', access_token: userToken }, fetchImpl)
  const userId = typeof me.id === 'string' && /^[0-9]{1,32}$/.test(me.id) ? me.id : ''
  if (!userId) throw new MetaApiError('unexpected')
  const perms = await metaGraphGet('/me/permissions', { access_token: userToken }, fetchImpl)
  const granted = (Array.isArray(perms.data) ? perms.data : [])
    .filter((p): p is { permission: string; status: string } => !!p && typeof p === 'object' && (p as { status?: unknown }).status === 'granted' && typeof (p as { permission?: unknown }).permission === 'string')
    .map((p) => p.permission)
  return { userId, granted }
}

/** True only when every permission the posting needs was really granted (a person can untick any). */
export function grantsRequiredScopes(granted: readonly string[]): boolean {
  return META_REQUIRED_SCOPES.every((s) => granted.includes(s))
}

export interface MetaPage {
  pageId: string
  name: string
  accessToken: string
  igUserId: string | null
  igUsername: string | null
}

/** The Pages this person manages, each with the Instagram professional account linked to it, if any. */
export async function listMetaPages(userToken: string, fetchImpl: FetchLike = fetch): Promise<MetaPage[]> {
  const out: MetaPage[] = []
  let after: string | null = null
  for (let i = 0; i < 5; i++) {
    const q: Record<string, string> = {
      fields: 'id,name,access_token,instagram_business_account{id,username}', limit: '50', access_token: userToken,
    }
    if (after) q.after = after
    const json = await metaGraphGet('/me/accounts', q, fetchImpl)
    for (const row of Array.isArray(json.data) ? json.data : []) {
      const r = row as { id?: unknown; name?: unknown; access_token?: unknown; instagram_business_account?: { id?: unknown; username?: unknown } }
      if (typeof r.id !== 'string' || !/^[0-9]{1,32}$/.test(r.id) || typeof r.access_token !== 'string' || !r.access_token) continue
      const ig = r.instagram_business_account
      const igId = ig && typeof ig.id === 'string' && /^[0-9]{1,32}$/.test(ig.id) ? ig.id : null
      out.push({
        pageId: r.id,
        name: typeof r.name === 'string' && r.name ? r.name.slice(0, 300) : r.id,
        accessToken: r.access_token,
        igUserId: igId,
        igUsername: igId && typeof ig?.username === 'string' ? ig.username.slice(0, 300) : null,
      })
    }
    const paging = json.paging as { cursors?: { after?: unknown }; next?: unknown } | undefined
    after = paging?.next && typeof paging.cursors?.after === 'string' ? paging.cursors.after : null
    if (!after) break
  }
  return out
}

/** Best effort; never throws. Asks Meta to remove this app's permissions for the person. */
export async function revokeMetaPermissions(fbUserId: string, userToken: string, fetchImpl: FetchLike = fetch): Promise<boolean> {
  if (!/^[0-9]{1,32}$/.test(fbUserId)) return false
  try {
    await graphCall('DELETE', graph(`/${fbUserId}/permissions?${new URLSearchParams({ access_token: userToken }).toString()}`), null, fetchImpl)
    return true
  } catch {
    return false
  }
}
