/**
 * Stage E1 — Google OAuth 2.0 web-server flow for Search Console READ-ONLY.
 * Native fetch only (no SDK). Requests ONLY the webmasters.readonly scope.
 *
 * SECURITY: authorization codes, access tokens and refresh tokens are NEVER logged
 * and never returned in error objects. Errors are typed + sanitized.
 */
import { GSC_READONLY_SCOPE, getGscOAuthConfig } from './config'

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'

/**
 * K4 — short-lived, httpOnly cookie set at /api/gsc/connect ONLY when the flow was
 * started from the Content Hub, read + cleared at /api/gsc/callback to decide the
 * post-connection return path. The value is a fixed enum ('hub'), never a URL — the
 * destination is server-built from the validated state's project id (no open redirect).
 */
export const GSC_RETURN_COOKIE = 'gsc_oauth_return'
export const GSC_RETURN_COOKIE_TTL_S = 600 // matches the one-time state's 10-minute TTL

export type GscOAuthErrorCode =
  | 'reauth_required'          // invalid_grant — refresh token revoked/expired
  | 'client_credentials_invalid'
  | 'access_denied'
  | 'oauth_http_error'
  | 'network_error'
  | 'invalid_response'

export class GscOAuthError extends Error {
  code: GscOAuthErrorCode
  constructor(code: GscOAuthErrorCode, message: string) { super(message); this.name = 'GscOAuthError'; this.code = code }
}

/** Build the consent URL. offline + include_granted_scopes; prompt=consent to force a
 *  refresh_token on first grant. `state` is an opaque single-use CSRF token. */
export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = getGscOAuthConfig()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GSC_READONLY_SCOPE,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
  })
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

export interface GscTokenResult {
  accessToken: string
  /** Present only on the FIRST authorization (or when prompt=consent). May be undefined on reconnect. */
  refreshToken?: string
  scope: string
  expiresInSec: number
}

function classifyTokenError(status: number, errorField: string): GscOAuthError {
  if (errorField === 'invalid_grant') return new GscOAuthError('reauth_required', 'The Google authorization is no longer valid; reconnect is required.')
  if (errorField === 'invalid_client' || errorField === 'unauthorized_client') return new GscOAuthError('client_credentials_invalid', 'GSC OAuth client credentials are invalid.')
  if (errorField === 'access_denied') return new GscOAuthError('access_denied', 'Access was denied.')
  return new GscOAuthError('oauth_http_error', `Google token endpoint returned HTTP ${status}.`)
}

async function postToken(form: Record<string, string>): Promise<GscTokenResult> {
  let res: Response
  try {
    res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    })
  } catch {
    throw new GscOAuthError('network_error', 'Could not reach the Google token endpoint.')
  }
  let json: Record<string, unknown>
  try { json = await res.json() as Record<string, unknown> } catch { throw new GscOAuthError('invalid_response', 'Malformed token response.') }
  if (!res.ok) throw classifyTokenError(res.status, String(json.error ?? ''))
  const accessToken = typeof json.access_token === 'string' ? json.access_token : ''
  if (!accessToken) throw new GscOAuthError('invalid_response', 'Token response missing access_token.')
  return {
    accessToken,
    refreshToken: typeof json.refresh_token === 'string' && json.refresh_token ? json.refresh_token : undefined,
    scope: typeof json.scope === 'string' ? json.scope : '',
    expiresInSec: typeof json.expires_in === 'number' ? json.expires_in : 0,
  }
}

/** Exchange an authorization code for tokens. */
export async function exchangeCodeForTokens(code: string): Promise<GscTokenResult> {
  const { clientId, clientSecret, redirectUri } = getGscOAuthConfig()
  return postToken({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' })
}

/** Obtain a fresh access token from a stored refresh token. Never persisted by callers. */
export async function refreshAccessToken(refreshToken: string): Promise<GscTokenResult> {
  const { clientId, clientSecret } = getGscOAuthConfig()
  return postToken({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' })
}

/** Best-effort Google token revocation. Never throws on network/HTTP failure. */
export async function revokeToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
    })
    return res.ok
  } catch {
    return false
  }
}
