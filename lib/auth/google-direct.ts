/**
 * "Continue with Google" through the site's OWN Google OAuth client, so
 * Google's consent screen names gotopseo.com instead of the Supabase project.
 *
 * Used only when NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID and
 * GOOGLE_OAUTH_CLIENT_SECRET are both set; otherwise the button keeps the
 * Supabase-hosted flow (lib/auth/google-signin.ts), exactly as before.
 *
 * THE FLOW (authorization code + PKCE, OpenID Connect):
 *   1. app/api/auth/google/route.ts makes a random `state`, a PKCE verifier
 *      (sent to Google as its S256 challenge) and a random nonce, keeps them
 *      with the sanitized `next` and the form's language in ONE short-lived,
 *      httpOnly, Secure, SameSite=Lax cookie on /api/auth (HMAC-signed with a
 *      key derived from the client secret, so a cookie planted from elsewhere
 *      is refused), and sends the browser to Google.
 *   2. Google returns to the EXISTING callback (/api/auth/callback, the URI
 *      registered on the Google client). Only when the request carries both a
 *      `state` parameter and this cookie does the callback take this branch;
 *      the state must equal the cookie's (constant time), and the cookie is
 *      cleared whatever the outcome, so a state works once.
 *   3. The code is exchanged at Google's token endpoint, server-side, with the
 *      secret and the verifier. The id_token goes to Supabase
 *      (auth.signInWithIdToken), which checks Google's signature, the audience
 *      and the nonce, creates or links the user, and sets the session cookies.
 *
 * THE NONCE RULE (Supabase, "Sign in with Google"
 * https://supabase.com/docs/guides/auth/social-login/auth-google): "Supabase
 * Auth expects the provider to hash it (SHA-256, hexadecimal representation),
 * you need to provide a hashed version to Google and a non-hashed version to
 * signInWithIdToken." So Google gets sha256hex(nonce); Supabase gets the nonce.
 *
 * NEVER AGAIN: the April version of this flow (247cdda, removed in ed96710)
 * signed people in with a guessable password derived from the Google id,
 * overwrote existing passwords and never checked `state`. Nothing here touches
 * a password, the admin API or the service role.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { Locale } from '@/lib/i18n/locales'
import { sanitizeNextPath } from '@/lib/i18n/request-locale'

export const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

/** The flow's cookie: scoped to the auth routes, gone after ten minutes. */
export const GOOGLE_FLOW_COOKIE = 'gotop-google-flow'
export const GOOGLE_FLOW_COOKIE_PATH = '/api/auth'
export const GOOGLE_FLOW_MAX_AGE_SECONDS = 10 * 60

/** The registered redirect URI on every origin (gotopseo.com, www, localhost:3000). */
export const GOOGLE_CALLBACK_PATH = '/api/auth/callback'

export type GoogleDirectConfig = { clientId: string; clientSecret: string }

/** The custom client when BOTH halves are set; null keeps the Supabase-hosted flow. */
export function googleDirectConfig(env: Record<string, string | undefined> = process.env): GoogleDirectConfig | null {
  const clientId = env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID?.trim()
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

const b64url = (buf: Buffer) => buf.toString('base64url')
const random = () => b64url(randomBytes(32))

/** RFC 7636 S256: BASE64URL(SHA256(ASCII(verifier))). */
export function pkceChallenge(verifier: string): string {
  return b64url(createHash('sha256').update(verifier, 'ascii').digest())
}

/** What Google receives as `nonce`: SHA-256 of the raw nonce, lowercase hex (the Supabase rule above). */
export function hashedNonce(nonce: string): string {
  return createHash('sha256').update(nonce, 'utf8').digest('hex')
}

export type GoogleFlow = { state: string; verifier: string; nonce: string; next: string; lang: Locale }

export function newGoogleFlow(nextPath: string | null | undefined, lang: string | null | undefined): GoogleFlow {
  return { state: random(), verifier: random(), nonce: random(), next: sanitizeNextPath(nextPath, '/dashboard'), lang: lang === 'en' ? 'en' : 'he' }
}

export function googleRedirectUri(origin: string): string {
  return new URL(GOOGLE_CALLBACK_PATH, origin).toString()
}

/** Google's authorization URL for this flow. Neither `next` nor the language rides it. */
export function googleAuthorizeUrl(config: GoogleDirectConfig, flow: GoogleFlow, origin: string): string {
  const url = new URL(GOOGLE_AUTHORIZE_URL)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', googleRedirectUri(origin))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', flow.state)
  url.searchParams.set('code_challenge', pkceChallenge(flow.verifier))
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('nonce', hashedNonce(flow.nonce))
  url.searchParams.set('prompt', 'select_account')
  return url.toString()
}

// ── the cookie ──────────────────────────────────────────────────────────────

function cookieKey(config: GoogleDirectConfig): Buffer {
  // A key of its own, derived from the server-only secret: the secret itself
  // is never used for anything but Google's token endpoint.
  return createHmac('sha256', config.clientSecret).update('gotop-google-flow-cookie/v1').digest()
}

function mac(config: GoogleDirectConfig, payload: string): string {
  return b64url(createHmac('sha256', cookieKey(config)).update(payload).digest())
}

/** Constant-time equality of two strings (false on any length difference). */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8')
  const y = Buffer.from(b, 'utf8')
  return x.length === y.length && timingSafeEqual(x, y)
}

export function sealGoogleFlow(config: GoogleDirectConfig, flow: GoogleFlow): string {
  const payload = b64url(Buffer.from(JSON.stringify({ ...flow, exp: Date.now() + GOOGLE_FLOW_MAX_AGE_SECONDS * 1000 }), 'utf8'))
  return `${payload}.${mac(config, payload)}`
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/

/** The flow the cookie holds, or null when it is missing, forged, expired or malformed. */
export function openGoogleFlow(config: GoogleDirectConfig, value: string | null | undefined, now = Date.now()): GoogleFlow | null {
  if (typeof value !== 'string') return null
  const dot = value.indexOf('.')
  if (dot <= 0) return null
  const payload = value.slice(0, dot)
  if (!safeEqual(value.slice(dot + 1), mac(config, payload))) return null
  try {
    const raw = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof raw?.exp !== 'number' || raw.exp < now) return null
    if (![raw.state, raw.verifier, raw.nonce].every((v) => typeof v === 'string' && TOKEN.test(v))) return null
    return { state: raw.state, verifier: raw.verifier, nonce: raw.nonce, next: sanitizeNextPath(raw.next, '/dashboard'), lang: raw.lang === 'en' ? 'en' : 'he' }
  } catch {
    return null
  }
}

/** The callback's verdict on a returning `state`: the flow when it matches, null otherwise. */
export function matchGoogleState(config: GoogleDirectConfig, cookieValue: string | null | undefined, state: string | null): GoogleFlow | null {
  if (!state) return null
  const flow = openGoogleFlow(config, cookieValue)
  return flow && safeEqual(flow.state, state) ? flow : null
}

export function googleFlowCookieOptions(maxAge: number = GOOGLE_FLOW_MAX_AGE_SECONDS) {
  return { httpOnly: true, secure: true, sameSite: 'lax' as const, path: GOOGLE_FLOW_COOKIE_PATH, maxAge }
}

// ── the token exchange ──────────────────────────────────────────────────────

export type GoogleTokens = { idToken: string; accessToken?: string }

/**
 * The code for Google's tokens, server-side. A failure is a reason code for
 * the log, never Google's own text, and never anything that carries a secret.
 */
export async function exchangeGoogleCode(
  config: GoogleDirectConfig,
  args: { code: string; verifier: string; origin: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; tokens: GoogleTokens } | { ok: false; reason: string }> {
  let res: Response
  try {
    res = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: args.code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: googleRedirectUri(args.origin),
        code_verifier: args.verifier,
      }).toString(),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
  } catch (e) {
    return { ok: false, reason: `network:${e instanceof Error ? e.name : 'unknown'}` }
  }
  let body: Record<string, unknown> = {}
  try { body = (await res.json()) as Record<string, unknown> } catch { /* not JSON */ }
  if (!res.ok) {
    // Google's OAuth error code (invalid_grant, redirect_uri_mismatch, …) only.
    const code = typeof body.error === 'string' && /^[a-z_]{1,40}$/.test(body.error) ? body.error : 'unknown'
    return { ok: false, reason: `token:${res.status}:${code}` }
  }
  if (typeof body.id_token !== 'string' || body.id_token.length === 0) return { ok: false, reason: 'token:no_id_token' }
  return { ok: true, tokens: { idToken: body.id_token, accessToken: typeof body.access_token === 'string' ? body.access_token : undefined } }
}

// ── the sign-in ─────────────────────────────────────────────────────────────

/** All this flow asks of the Supabase server client: one call, no admin API. */
export type GoogleSignInClient = { auth: Pick<SupabaseClient['auth'], 'signInWithIdToken'> }

/**
 * A matched flow's code → a Supabase session (set on the client's cookies).
 * Supabase verifies Google's signature, the audience and the nonce, and
 * creates or links the user. The reason on failure is a code for the log only.
 */
export async function completeGoogleSignIn(
  args: { config: GoogleDirectConfig; flow: GoogleFlow; code: string; origin: string; supabase: GoogleSignInClient },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; user: User | null } | { ok: false; reason: string }> {
  const exchanged = await exchangeGoogleCode(args.config, { code: args.code, verifier: args.flow.verifier, origin: args.origin }, fetchImpl)
  if (!exchanged.ok) return exchanged
  try {
    const { data, error } = await args.supabase.auth.signInWithIdToken({
      provider: 'google',
      token: exchanged.tokens.idToken,
      access_token: exchanged.tokens.accessToken,
      // The RAW nonce: Google was given its SHA-256 (googleAuthorizeUrl).
      nonce: args.flow.nonce,
    })
    if (error || !data?.session) {
      const status = typeof error?.status === 'number' ? error.status : 'no_session'
      const code = typeof error?.code === 'string' && /^[a-z0-9_]{1,40}$/.test(error.code) ? error.code : ''
      return { ok: false, reason: `supabase:${status}:${code}` }
    }
    return { ok: true, user: data.user ?? null }
  } catch (e) {
    return { ok: false, reason: `supabase:${e instanceof Error ? e.name : 'unknown'}` }
  }
}
