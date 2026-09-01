/**
 * Phase 4F.1 — Shopify OAuth (authorization-code, offline token). Server-side
 * only. The merchant enters only their *.myshopify.com domain and approves the
 * Shopify screen; the client secret never reaches the browser.
 *
 * PURE helpers (authorize-URL build, HMAC verification, return-path build) are
 * split out so they are unit-testable without network or env.
 */

import crypto from 'crypto'
import { SHOPIFY_REQUIRED_SCOPES } from './constants'
import { normalizeShopDomain } from './domain'

/** Which Shopify app a resolved credential pair belongs to. */
export type ShopifyAppEdition = 'public' | 'legacy'

export interface ShopifyOAuthConfig {
  clientId: string
  clientSecret: string
  /** Canonical app base URL, e.g. https://www.gotopseo.com (no trailing slash). */
  appUrl: string
  /** Which app the clientId/clientSecret above belong to. Never a mixed pair. */
  edition: ShopifyAppEdition
}

/**
 * Resolve the OAuth app credentials from server env. Never exposed to client.
 *
 * Production bug this fixes: this app exists TWICE in Shopify — the PUBLIC
 * "Go Top SEO" app (which merchants install, and which signs every app-launch
 * request, OAuth callback and session token) and an older LEGACY custom app.
 * They have entirely different client IDs and secrets. Every embedded/public
 * flow resolves its credentials here, and this function read only the LEGACY
 * pair — so a genuine, correctly-signed public-app launch was verified against
 * the wrong secret and rejected as `invalid_hmac`. Only the compliance
 * webhooks (lib/shopify/webhook-public.ts) were ever wired to the public app.
 *
 * The pair is resolved ATOMICALLY and is never mixed: a public client id is
 * only ever used with the public secret, and a legacy id only with the legacy
 * secret. Mixing them would produce a config that cannot verify anything and
 * would silently fail every flow. The public app wins when BOTH of its values
 * are configured; otherwise this falls back to the legacy pair, so a
 * deployment that has not yet been given public credentials keeps behaving
 * exactly as it does today rather than breaking.
 */
export function getShopifyOAuthConfig(): ShopifyOAuthConfig | null {
  const appUrl = (process.env.SHOPIFY_APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '')
  if (!appUrl || !/^https:\/\//.test(appUrl)) return null

  const publicClientId = (process.env.SHOPIFY_PUBLIC_CLIENT_ID || '').trim()
  const publicClientSecret = (process.env.SHOPIFY_PUBLIC_CLIENT_SECRET || '').trim()
  if (publicClientId && publicClientSecret) {
    return { clientId: publicClientId, clientSecret: publicClientSecret, appUrl, edition: 'public' }
  }

  const clientId = (process.env.SHOPIFY_CLIENT_ID || '').trim()
  const clientSecret = (process.env.SHOPIFY_CLIENT_SECRET || '').trim()
  if (clientId && clientSecret) {
    return { clientId, clientSecret, appUrl, edition: 'legacy' }
  }
  return null
}

/**
 * The client id of whichever app getShopifyOAuthConfig() would resolve —
 * without requiring the app URL to be configured. Used ONLY for the App
 * Bridge `shopify-api-key` meta tag, which is a public API key (never a
 * secret) and must name the SAME app whose secret verifies the resulting
 * session tokens. Applies the identical atomic-pair rule so the meta tag can
 * never name the public app while session-token verification uses the legacy
 * secret. Returns '' when nothing is configured.
 */
export function getShopifyAppClientId(): string {
  const publicClientId = (process.env.SHOPIFY_PUBLIC_CLIENT_ID || '').trim()
  const publicClientSecret = (process.env.SHOPIFY_PUBLIC_CLIENT_SECRET || '').trim()
  if (publicClientId && publicClientSecret) return publicClientId
  return (process.env.SHOPIFY_CLIENT_ID || '').trim()
}

/** True when OAuth is configured (used to gate the flow / show a clear error). */
export function isShopifyOAuthConfigured(): boolean {
  return getShopifyOAuthConfig() !== null
}

/** The single, exact redirect URI (must match the Dev Dashboard allowlist). */
export function oauthRedirectUri(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, '')}/api/shopify/oauth/callback`
}

/** The exact, server-constructed return destination (no open redirect). */
export function projectReturnUrl(appUrl: string, projectId: string, params: Record<string, string>): string {
  const base = `${appUrl.replace(/\/+$/, '')}/projects/${encodeURIComponent(projectId)}`
  const qs = new URLSearchParams(params).toString()
  return qs ? `${base}?${qs}` : base
}

/**
 * K1 — server-built internal Content Hub path for a project. `projectId` comes
 * from the server-validated, ownership-checked one-time OAuth state, so this is
 * never an open redirect. Used on a CLEAN connection success to drop the user
 * straight into the Content Hub for that project.
 */
export function contentHubReturnUrl(appUrl: string, projectId: string): string {
  return `${appUrl.replace(/\/+$/, '')}/content?projectId=${encodeURIComponent(projectId)}`
}

/**
 * Build the Shopify authorize URL for an EXPIRING OFFLINE token (no
 * grant_options[] = per-user). Read-only scopes only. PURE.
 *
 * `expiring=1` is REQUIRED. Shopify no longer accepts non-expiring access
 * tokens on the Admin API — production's own 403 said so verbatim:
 * "[API] Non-expiring access tokens are no longer accepted for the Admin API.
 * Start using expiring offline tokens." Without this parameter the flow still
 * completes and still hands back an access token, but that token is refused by
 * the very first Admin API call and there is no refresh token to recover with.
 */
export const SHOPIFY_EXPIRING_TOKEN_PARAM = 'expiring'
export const SHOPIFY_EXPIRING_TOKEN_VALUE = '1'

export function buildAuthorizeUrl(opts: {
  shop: string
  clientId: string
  redirectUri: string
  state: string
  scopes?: readonly string[]
}): string {
  const scopes = (opts.scopes ?? SHOPIFY_REQUIRED_SCOPES).join(',')
  const params = new URLSearchParams({
    client_id: opts.clientId,
    scope: scopes,
    redirect_uri: opts.redirectUri,
    state: opts.state,
    [SHOPIFY_EXPIRING_TOKEN_PARAM]: SHOPIFY_EXPIRING_TOKEN_VALUE,
  })
  return `https://${opts.shop}/admin/oauth/authorize?${params.toString()}`
}

/**
 * Verify the HMAC Shopify appends to OAuth callbacks. Builds the message from
 * every query param except `hmac` (and the legacy `signature`), sorted, joined
 * as k=v&… , and compares an HMAC-SHA256 with the client secret in constant
 * time. PURE. `params` is the raw query as key→value.
 */
export function verifyShopifyHmac(params: Record<string, string>, clientSecret: string): boolean {
  const provided = params.hmac
  if (!provided || typeof provided !== 'string') return false
  const message = Object.keys(params)
    .filter((k) => k !== 'hmac' && k !== 'signature')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  const digest = crypto.createHmac('sha256', clientSecret).update(message).digest('hex')
  // Constant-time compare (equal length required by timingSafeEqual).
  const a = Buffer.from(digest, 'utf8')
  const b = Buffer.from(provided, 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export interface ShopifyLaunchDetectionResult {
  ok: boolean
  /** The normalized *.myshopify.com host, only when ok === true. */
  shop: string | null
  /** A stable, non-sensitive reason code — never included the raw hmac/shop
   *  values, safe to log. */
  reason: 'missing_params' | 'invalid_hmac' | 'invalid_shop' | 'invalid_timestamp' | 'expired_launch' | null
}

/** Default tolerance for a signed launch's `timestamp` param — Shopify's own
 *  request/redirect chain is near-instant; 5 minutes comfortably covers
 *  normal clock skew and network latency while still rejecting a captured
 *  URL replayed long after the fact. */
export const SHOPIFY_LAUNCH_TIMESTAMP_TOLERANCE_MS = 5 * 60_000

/**
 * Hotfix — detects and validates a genuine, fresh, Shopify-SIGNED app-launch
 * request: the `?shop=...&hmac=...&host=...&timestamp=...` shape Shopify
 * sends to the app's configured Application URL on every install AND every
 * reopen (see app/shopify/app/page.tsx's header comment — this is the SAME
 * request shape, just detected at whatever URL Shopify is ACTUALLY
 * configured to send it to, which this codebase cannot itself change — see
 * app/page.tsx for where this is used).
 *
 * PURE — no I/O, no persistence, no privileged decision made here at all;
 * this ONLY decides whether the caller should redirect into the real
 * embedded entry point (/shopify/app), mirroring that page's own documented
 * stance that an unverified `shop` decides nothing privileged on its own.
 * Missing shop/hmac, an invalid signature, an unparseable/expired
 * timestamp, or a shop that fails to normalize all fail closed (`ok: false`)
 * with a distinct, non-sensitive reason — NEVER guessed, never silently
 * treated as valid.
 */
export function detectSignedShopifyLaunch(
  params: Record<string, string>,
  clientSecret: string,
  nowMs: number = Date.now(),
  toleranceMs: number = SHOPIFY_LAUNCH_TIMESTAMP_TOLERANCE_MS,
): ShopifyLaunchDetectionResult {
  if (!params.shop || !params.hmac) return { ok: false, shop: null, reason: 'missing_params' }
  if (!verifyShopifyHmac(params, clientSecret)) return { ok: false, shop: null, reason: 'invalid_hmac' }
  const shop = normalizeShopDomain(params.shop)
  if (!shop) return { ok: false, shop: null, reason: 'invalid_shop' }
  if (params.timestamp) {
    const ts = Number(params.timestamp)
    if (!Number.isFinite(ts)) return { ok: false, shop: null, reason: 'invalid_timestamp' }
    const ageMs = nowMs - ts * 1000
    if (ageMs > toleranceMs || ageMs < -toleranceMs) return { ok: false, shop: null, reason: 'expired_launch' }
  }
  return { ok: true, shop, reason: null }
}

/** A cryptographically-random opaque state token (also used as the nonce). */
export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString('hex')
}

/** Name + path of the signed browser nonce cookie (scoped to the OAuth routes). */
export const OAUTH_NONCE_COOKIE = 'shopify_oauth_nonce'
export const OAUTH_COOKIE_PATH = '/api/shopify/oauth'

/**
 * Sign the nonce for the browser cookie: `${nonce}.${hmac}`. The HMAC (over the
 * nonce, with the app client secret) lets the callback detect tampering without
 * any server storage of the cookie value. PURE.
 */
export function signNonceCookie(nonce: string, secret: string): string {
  const mac = crypto.createHmac('sha256', secret).update(nonce).digest('hex')
  return `${nonce}.${mac}`
}

/**
 * Verify a signed nonce cookie and return the nonce, or null when the value is
 * missing, malformed, or the signature doesn't match (tampering). Constant-time
 * comparison. PURE.
 */
export function verifyNonceCookie(value: string | undefined | null, secret: string): string | null {
  if (!value || typeof value !== 'string') return null
  const dot = value.lastIndexOf('.')
  if (dot <= 0) return null
  const nonce = value.slice(0, dot)
  const provided = value.slice(dot + 1)
  const expected = crypto.createHmac('sha256', secret).update(nonce).digest('hex')
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return null
  return crypto.timingSafeEqual(a, b) ? nonce : null
}

/* ------------------------------------------------------------------------- *
 * Token exchange (Shopify-managed installation).
 *
 * With `use_legacy_install_flow` absent/false in shopify.app.toml, Shopify
 * MANAGES installation: it grants scopes itself and never calls this app's
 * OAuth callback during install. The documented way for an embedded app to
 * obtain an access token in that model is to exchange the App Bridge session
 * token (id_token) — there is no authorization redirect at all, which is
 * precisely why it cannot put Shopify's authorize screen inside the Admin
 * iframe.
 *
 * Constants and request shape mirror Shopify's own implementation
 * (@shopify/shopify-api, lib/auth/oauth/token-exchange.ts) exactly.
 * ------------------------------------------------------------------------- */

export const TOKEN_EXCHANGE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:token-exchange'
export const TOKEN_EXCHANGE_SUBJECT_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:id_token'
/** OFFLINE, not online: this app stores a long-lived token for background
 *  publishing, so it must request the offline token type. */
export const TOKEN_EXCHANGE_OFFLINE_TOKEN_TYPE = 'urn:shopify:params:oauth:token-type:offline-access-token'

/**
 * Exchange a VERIFIED App Bridge session token for an OFFLINE access token.
 *
 * The caller MUST have already verified the session token
 * (lib/shopify/session-token.ts) and MUST pass the shop domain that
 * verification returned — never a shop taken from a query parameter. Shopify
 * independently rejects a session token that doesn't match the shop, but this
 * function is not the place that decides identity.
 *
 * Returns the offline token + granted scope string. Throws on any failure so
 * the caller fails closed; never logs the token, the session token, or the
 * secret.
 */
/**
 * Non-sensitive shape report for a token-exchange response.
 *
 * Every field here is either a status/identifier Shopify itself publishes, a
 * boolean, a length, or a SCOPE NAME. It deliberately contains no token bytes:
 * `tokenType` is a CLASSIFICATION mapped from the documented Shopify token
 * prefixes to a fixed label, never the token's own characters —
 *   shpat_ -> 'offline'  (Admin API offline access token)
 *   shpca_ -> 'online'   (Admin API online / per-user access token)
 *   shpss_ -> 'app_secret_shaped'  (would mean a secret was returned/echoed)
 *   anything else -> 'unrecognised'
 * so an online/offline mismatch is visible without exposing the credential.
 */
export interface TokenExchangeDiagnostics {
  httpStatus: number
  shopifyRequestId: string | null
  hasAccessToken: boolean
  tokenLength: number
  tokenType: 'offline' | 'online' | 'app_secret_shaped' | 'unrecognised' | 'absent'
  /** Scope NAMES granted by Shopify. Names are public API identifiers. */
  scopes: string[]
  scopeCount: number
  associatedUserScope: string | null
  expiresIn: number | null
  requestedTokenType: string
  /** Whether Shopify returned the refresh token an EXPIRING grant must carry. */
  hasRefreshToken: boolean
  /** Length only — never any part of the refresh token itself. */
  refreshTokenLength: number
  /** Lifetime of the refresh token in seconds, as Shopify reported it. */
  refreshTokenExpiresIn: number | null
  /** True when `expiring=1` was sent on this request. */
  requestedExpiring: boolean
  /** PUBLIC FIELD NAMES Shopify omitted, when the grant was not expiring.
   *  Names only — never a value from the response. */
  missingFields?: string[]
}

/** Classify a token by its documented Shopify prefix. Returns a fixed label —
 *  never any part of the token itself. */
function classifyShopifyToken(token: string | undefined | null): TokenExchangeDiagnostics['tokenType'] {
  if (!token) return 'absent'
  if (token.startsWith('shpat_')) return 'offline'
  if (token.startsWith('shpca_')) return 'online'
  if (token.startsWith('shpss_')) return 'app_secret_shaped'
  return 'unrecognised'
}

/** Thrown on a failed exchange, carrying only non-sensitive shape data. */
export class TokenExchangeError extends Error {
  diagnostics: Partial<TokenExchangeDiagnostics>
  constructor(message: string, diagnostics: Partial<TokenExchangeDiagnostics>) {
    super(message)
    this.name = 'TokenExchangeError'
    this.diagnostics = diagnostics
  }
}

export interface ExpiringOfflineToken {
  accessToken: string
  refreshToken: string
  /** Seconds until the ACCESS token expires, as Shopify reported it. */
  expiresIn: number
  /**
   * Seconds until the REFRESH token expires, when Shopify reports it. NULL when
   * it does not: Shopify documents the refresh-token lifetime as something it
   * MAY return, so its absence is not a malformed grant — the access token and
   * the refresh token are what the lifecycle actually needs. A null here simply
   * means no local refresh-token expiry is recorded; a refresh token Shopify
   * has since invalidated is still detected the only way it ever can be, by the
   * refresh call being refused.
   */
  refreshTokenExpiresIn: number | null
  scope: string
}

/**
 * The response shape an EXPIRING offline grant must have. A response missing
 * any of these is not an expiring grant, and storing it would recreate exactly
 * the production failure this exists to end: an access token the Admin API
 * refuses, with nothing to refresh it with.
 *
 * Returns the parsed grant, or the list of MISSING FIELD NAMES (never values).
 */
export function parseExpiringOfflineToken(json: unknown): { ok: true; token: ExpiringOfflineToken } | { ok: false; missing: string[] } {
  const j = (json ?? {}) as Record<string, unknown>
  const missing: string[] = []
  const accessToken = typeof j.access_token === 'string' ? j.access_token : ''
  const refreshToken = typeof j.refresh_token === 'string' ? j.refresh_token : ''
  const expiresIn = typeof j.expires_in === 'number' && Number.isFinite(j.expires_in) ? j.expires_in : null
  // OPTIONAL by Shopify's contract — see ExpiringOfflineToken.refreshTokenExpiresIn.
  const refreshTokenExpiresIn =
    typeof j.refresh_token_expires_in === 'number' && Number.isFinite(j.refresh_token_expires_in) ? j.refresh_token_expires_in : null
  // REQUIRED. Any of these missing means this is not an expiring offline grant,
  // and an access token with no refresh half is refused outright by today's
  // Admin API.
  if (!accessToken) missing.push('access_token')
  if (!refreshToken) missing.push('refresh_token')
  if (expiresIn === null) missing.push('expires_in')
  if (missing.length > 0) return { ok: false, missing }
  return {
    ok: true,
    token: {
      accessToken, refreshToken,
      expiresIn: expiresIn as number,
      refreshTokenExpiresIn,
      scope: typeof j.scope === 'string' ? j.scope : '',
    },
  }
}

/** Absolute expiry from a relative lifetime. PURE. */
export function expiryFromNow(seconds: number, now: number = Date.now()): string {
  return new Date(now + Math.max(0, seconds) * 1000).toISOString()
}

export async function exchangeSessionTokenForOfflineToken(opts: {
  shop: string
  sessionToken: string
  clientId: string
  clientSecret: string
  fetchImpl?: typeof fetch
}): Promise<ExpiringOfflineToken & { diagnostics: TokenExchangeDiagnostics }> {
  const doFetch = opts.fetchImpl ?? fetch
  const res = await doFetch(`https://${opts.shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
      subject_token: opts.sessionToken,
      subject_token_type: TOKEN_EXCHANGE_SUBJECT_TOKEN_TYPE,
      requested_token_type: TOKEN_EXCHANGE_OFFLINE_TOKEN_TYPE,
      // REQUIRED — see SHOPIFY_EXPIRING_TOKEN_PARAM. Without it Shopify mints a
      // non-expiring offline token, which the Admin API now rejects outright.
      [SHOPIFY_EXPIRING_TOKEN_PARAM]: SHOPIFY_EXPIRING_TOKEN_VALUE,
    }),
    redirect: 'error',
  })
  const shopifyRequestId = res.headers?.get?.('x-request-id') ?? null
  const base = {
    httpStatus: res.status, shopifyRequestId,
    requestedTokenType: TOKEN_EXCHANGE_OFFLINE_TOKEN_TYPE,
    requestedExpiring: true,
  }

  if (!res.ok) {
    throw new TokenExchangeError(`token_exchange_http_${res.status}`, {
      ...base, hasAccessToken: false, tokenType: 'absent', hasRefreshToken: false, refreshTokenLength: 0,
    })
  }

  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
  const rawScope = typeof json?.scope === 'string' ? json.scope : ''
  const scopes = rawScope ? rawScope.split(/[,\s]+/).filter(Boolean) : []
  const rawAccess = typeof json?.access_token === 'string' ? json.access_token : ''
  const rawRefresh = typeof json?.refresh_token === 'string' ? json.refresh_token : ''
  const diagnostics: TokenExchangeDiagnostics = {
    ...base,
    hasAccessToken: !!rawAccess,
    tokenLength: rawAccess.length,
    tokenType: classifyShopifyToken(rawAccess),
    scopes,
    scopeCount: scopes.length,
    associatedUserScope: typeof json?.associated_user_scope === 'string' ? json.associated_user_scope : null,
    expiresIn: typeof json?.expires_in === 'number' ? json.expires_in : null,
    hasRefreshToken: !!rawRefresh,
    refreshTokenLength: rawRefresh.length,
    refreshTokenExpiresIn: typeof json?.refresh_token_expires_in === 'number' ? json.refresh_token_expires_in : null,
  }

  const parsed = parseExpiringOfflineToken(json)
  if (!parsed.ok) {
    // FAIL CLOSED. `missing` is a list of Shopify's own PUBLIC FIELD NAMES —
    // never any value from the response body.
    throw new TokenExchangeError(
      parsed.missing.includes('access_token') ? 'token_exchange_no_token' : 'token_exchange_not_expiring',
      { ...diagnostics, missingFields: parsed.missing },
    )
  }
  return { ...parsed.token, diagnostics }
}

/**
 * Rotate an expiring offline grant with the stored refresh token.
 *
 * Called ONLY by lib/shopify/token-resolver.ts, which holds the per-connection
 * refresh lease — never directly by a route. Returns a complete new grant
 * (Shopify rotates the refresh token too, so both halves must be stored).
 *
 * Distinguishes TERMINAL from TRANSIENT failure, because the two must lead to
 * completely different states: a terminal failure means the merchant has to
 * reconnect, a transient one must never touch the stored credential.
 */
export class TokenRefreshError extends Error {
  /** True when Shopify rejected the grant itself — retrying cannot help. */
  terminal: boolean
  diagnostics: { httpStatus: number | null; shopifyRequestId: string | null; missingFields?: string[] }
  constructor(message: string, terminal: boolean, diagnostics: { httpStatus: number | null; shopifyRequestId: string | null; missingFields?: string[] }) {
    super(message)
    this.name = 'TokenRefreshError'
    this.terminal = terminal
    this.diagnostics = diagnostics
  }
}

export const REFRESH_TOKEN_GRANT_TYPE = 'refresh_token'

export async function refreshOfflineAccessToken(opts: {
  shop: string
  refreshToken: string
  clientId: string
  clientSecret: string
  fetchImpl?: typeof fetch
}): Promise<ExpiringOfflineToken> {
  const doFetch = opts.fetchImpl ?? fetch
  let res: Response
  try {
    res = await doFetch(`https://${opts.shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        grant_type: REFRESH_TOKEN_GRANT_TYPE,
        refresh_token: opts.refreshToken,
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
      }),
      redirect: 'error',
    })
  } catch {
    // Could not reach Shopify at all — transient by definition.
    throw new TokenRefreshError('refresh_unreachable', false, { httpStatus: null, shopifyRequestId: null })
  }
  const shopifyRequestId = res.headers?.get?.('x-request-id') ?? null
  if (!res.ok) {
    // 400/401/403 = Shopify rejected the refresh token itself (revoked,
    // expired, or belonging to a different app). 429/5xx = try again later.
    const terminal = res.status === 400 || res.status === 401 || res.status === 403
    throw new TokenRefreshError(`refresh_http_${res.status}`, terminal, { httpStatus: res.status, shopifyRequestId })
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
  const parsed = parseExpiringOfflineToken(json)
  if (!parsed.ok) {
    // A 200 that is not an expiring grant is terminal: repeating the same call
    // cannot turn it into one, and storing half of it would retire a working
    // refresh token for an unusable pair.
    throw new TokenRefreshError('refresh_not_expiring', true, { httpStatus: res.status, shopifyRequestId, missingFields: parsed.missing })
  }
  return parsed.token
}

/**
 * Exchange the authorization code for an OFFLINE access token. Returns the token
 * + the space/comma-separated granted scope string. Throws on failure (caller
 * maps to a token_exchange_failed redirect). Never logs the token/secret.
 *
 * Still used by the NON-embedded, dashboard-initiated connect flow
 * (/api/shopify/oauth/start → Shopify authorize → callback), which runs
 * top-level in an ordinary browser tab and is unaffected by iframe framing
 * rules. The embedded install path uses token exchange above instead.
 */
export async function exchangeCodeForToken(opts: {
  shop: string
  code: string
  clientId: string
  clientSecret: string
  fetchImpl?: typeof fetch
}): Promise<ExpiringOfflineToken> {
  const doFetch = opts.fetchImpl ?? fetch
  const res = await doFetch(`https://${opts.shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      code: opts.code,
      // Same requirement as the token-exchange path: the authorize URL already
      // asked for an expiring grant (buildAuthorizeUrl), and this repeats it so
      // the code exchange cannot silently fall back to a non-expiring token.
      [SHOPIFY_EXPIRING_TOKEN_PARAM]: SHOPIFY_EXPIRING_TOKEN_VALUE,
    }),
    redirect: 'error',
  })
  if (!res.ok) throw new Error(`token_exchange_http_${res.status}`)
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
  const parsed = parseExpiringOfflineToken(json)
  if (!parsed.ok) {
    // FAIL CLOSED, same rule as the embedded path — an access token with no
    // refresh material is unusable on today's Admin API. The thrown message is
    // a stable code plus Shopify's own PUBLIC field names, never any value.
    throw new Error(
      parsed.missing.includes('access_token')
        ? 'token_exchange_no_token'
        : `token_exchange_not_expiring:${parsed.missing.join(',')}`,
    )
  }
  return parsed.token
}
