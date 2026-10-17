/**
 * Google OAuth 2.0 web-server flow for business.manage, with a one-time state
 * (lib/gbp/store.ts) AND PKCE (S256). Native fetch only, the same shape as
 * lib/gsc/oauth.ts. Server-only.
 *
 * Codes, tokens and the PKCE verifier are never logged and never put into an
 * error. The verifier lives encrypted in the state row and is read back once,
 * when the state is consumed.
 */
import crypto from 'crypto'
import { GBP_SCOPE, getGbpOAuthConfig } from './config'
import { GbpApiError } from './errors'

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'

const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** RFC 7636: 32 random bytes → a 43-character verifier; challenge = BASE64URL(SHA256(verifier)). */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = b64url(crypto.randomBytes(32))
  return { verifier, challenge: pkceChallenge(verifier) }
}

export function pkceChallenge(verifier: string): string {
  return b64url(crypto.createHash('sha256').update(verifier).digest())
}

/**
 * The consent URL. offline + prompt=consent so the first grant returns a
 * refresh token; include_granted_scopes so a merchant who already granted
 * Search Console sees one incremental screen, not a second full consent.
 */
export function buildGbpAuthUrl(state: string, codeChallenge: string): string {
  const { clientId, redirectUri } = getGbpOAuthConfig()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GBP_SCOPE,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

export interface GbpTokenResult {
  accessToken: string
  refreshToken?: string
  scope: string
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

async function postToken(form: Record<string, string>, fetchImpl: FetchLike): Promise<GbpTokenResult> {
  let res: Response
  try {
    res = await fetchImpl(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    })
  } catch {
    throw new GbpApiError('google_unavailable', true)
  }
  let json: Record<string, unknown>
  try { json = await res.json() as Record<string, unknown> } catch { throw new GbpApiError('unexpected') }
  if (!res.ok) {
    const e = String(json.error ?? '')
    if (e === 'invalid_grant') throw new GbpApiError('reauth_required')
    if (e === 'access_denied') throw new GbpApiError('permission_denied')
    throw new GbpApiError(res.status >= 500 ? 'google_unavailable' : 'unexpected', res.status >= 500)
  }
  const accessToken = typeof json.access_token === 'string' ? json.access_token : ''
  if (!accessToken) throw new GbpApiError('unexpected')
  return {
    accessToken,
    refreshToken: typeof json.refresh_token === 'string' && json.refresh_token ? json.refresh_token : undefined,
    scope: typeof json.scope === 'string' ? json.scope : '',
  }
}

export function exchangeGbpCode(code: string, codeVerifier: string, fetchImpl: FetchLike = fetch): Promise<GbpTokenResult> {
  const { clientId, clientSecret, redirectUri } = getGbpOAuthConfig()
  return postToken({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: codeVerifier }, fetchImpl)
}

export function refreshGbpAccessToken(refreshToken: string, fetchImpl: FetchLike = fetch): Promise<GbpTokenResult> {
  const { clientId, clientSecret } = getGbpOAuthConfig()
  return postToken({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }, fetchImpl)
}

/** True only when the grant really includes business.manage (a user can untick it). */
export function grantIncludesGbpScope(scope: string): boolean {
  return scope.split(/\s+/).includes(GBP_SCOPE)
}

/** Best effort; never throws. */
export async function revokeGbpToken(token: string, fetchImpl: FetchLike = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
    })
    return res.ok
  } catch {
    return false
  }
}
