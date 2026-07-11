/**
 * Google Ads API — shared server-side client helpers.
 *
 * Extracted from app/api/google-ads/keyword-ideas/route.ts so the same OAuth +
 * config logic can be reused by API routes AND background/automation services
 * (no request/session needed — auth is app-level env credentials).
 *
 * Auth model: a single app-level refresh token (GOOGLE_ADS_* env vars), NOT
 * per-user OAuth. Fully headless-safe.
 */

export const GOOGLE_ADS_API_VERSION = 'v22'

export type GoogleAdsErrorCode =
  | 'not_configured'
  | 'reauth_required'
  | 'client_credentials_invalid'
  | 'oauth_token_failed'
  | 'api_auth_failed'
  | 'developer_token_invalid'
  | 'permission_denied'
  | 'rate_limit_exceeded'
  | 'resource_exhausted'
  | 'invalid_request'
  | 'api_failed'

/** Typed error so callers (routes) can map a code to their own HTTP response. */
export class GoogleAdsError extends Error {
  readonly code: GoogleAdsErrorCode
  readonly httpStatus?: number
  readonly apiMessage?: string
  constructor(code: GoogleAdsErrorCode, opts?: { httpStatus?: number; apiMessage?: string }) {
    super(code)
    this.name = 'GoogleAdsError'
    this.code = code
    this.httpStatus = opts?.httpStatus
    this.apiMessage = opts?.apiMessage
  }
}

interface TokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

export interface GoogleAdsConfig {
  customerId: string
  loginCustomerId: string
  developerToken: string
}

const REQUIRED_ENV = [
  'GOOGLE_ADS_CLIENT_ID',
  'GOOGLE_ADS_CLIENT_SECRET',
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'GOOGLE_ADS_REFRESH_TOKEN',
  'GOOGLE_ADS_CUSTOMER_ID',
  'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
] as const

/** Resolve the app-level Google Ads config; throws `not_configured` if any env is missing. */
export function getGoogleAdsConfig(): GoogleAdsConfig {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name])
  if (missing.length > 0) throw new GoogleAdsError('not_configured')
  return {
    customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!.replace(/-/g, ''),
    loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID!.replace(/-/g, ''),
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  }
}

/** Coerce a Google Ads numeric-or-string metric to a finite number, else null. */
export function toNumber(value: number | string | undefined | null): number | null {
  if (value === undefined || value === null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Exchange the app-level refresh token for an access token. Throws a typed
 * GoogleAdsError (`reauth_required` | `client_credentials_invalid` |
 * `oauth_token_failed`) so callers preserve their existing error responses.
 */
export async function getGoogleAdsAccessToken(): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }).toString(),
  })

  const tokenData = (await response.json()) as TokenResponse

  if (!response.ok || !tokenData.access_token) {
    const desc = tokenData.error_description || tokenData.error || ''

    const classification =
      /invalid_grant/i.test(desc) ? 'reauth_required' :
      /invalid_client/i.test(desc) ? 'client_credentials_invalid' :
      /unauthorized_client/i.test(desc) ? 'unauthorized_client' :
      /temporarily_unavailable/i.test(desc) ? 'temporarily_unavailable' :
      /access_denied/i.test(desc) ? 'access_denied' :
      response.status >= 500 ? 'google_server_error' :
      response.status === 0 ? 'network_error' :
      'unknown'

    // Safe diagnostic log — no secrets.
    console.error('[google-ads] OAuth token failure', {
      stage: 'oauth',
      timestamp: new Date().toISOString(),
      httpStatus: response.status,
      httpOk: response.ok,
      hasAccessToken: Boolean(tokenData.access_token),
      oauthError: tokenData.error ?? null,
      oauthErrorDescription: desc ?? null,
      classification,
      hasClientId: Boolean(process.env.GOOGLE_ADS_CLIENT_ID),
      hasClientSecret: Boolean(process.env.GOOGLE_ADS_CLIENT_SECRET),
      hasDeveloperToken: Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN),
      hasCustomerId: Boolean(process.env.GOOGLE_ADS_CUSTOMER_ID),
      hasRefreshToken: Boolean(process.env.GOOGLE_ADS_REFRESH_TOKEN),
    })

    if (classification === 'reauth_required') throw new GoogleAdsError('reauth_required')
    if (/invalid_client/i.test(desc)) throw new GoogleAdsError('client_credentials_invalid')
    throw new GoogleAdsError('oauth_token_failed')
  }

  return tokenData.access_token
}
