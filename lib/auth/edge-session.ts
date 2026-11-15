/**
 * WHO IS SIGNED IN, WITHOUT ASKING THE AUTH SERVER ON EVERY PAGE.
 *
 * `proxy.ts` runs at the edge NEAREST THE READER, not in the single region the
 * functions are pinned to (`vercel.json` sets `bom1`, Mumbai). The platform log
 * says so: the same `[route-guard]` line arrives with `region=kix1`, `hnd1` or
 * `iad1`, one per visitor. So every network call made there crosses from that
 * edge to Mumbai and back BEFORE the page's own function has even started.
 *
 * `auth.getUser()` is exactly such a call: it asks the Auth server to verify the
 * token on every single page view. Measured in production on 15.11.2026 from
 * Tokyo, warm, three rounds each: `/api/projects/quota` (which `proxy.ts` does
 * not match at all) 300-380ms, `/he` 613-732ms, `/billing` 671-922ms,
 * `/dashboard` 830-1063ms. Roughly 300ms of that gap is this one verification,
 * paid again on every navigation; from Israel the same hop is about twice as far.
 *
 * This project signs its tokens with an ASYMMETRIC key (the live JWKS offers one
 * ES256 key), so the signature can be checked at the edge, locally, with
 * WebCrypto and no network at all — which is what `getClaims` does when it is
 * handed the keys. The keys are fetched once per warm instance and kept below.
 * A signed-out visitor costs nothing, because there is no token to check, and
 * that is most of the traffic: the public site.
 *
 * WHAT THIS DELIBERATELY DOES NOT CLAIM: a locally verified token proves that WE
 * issued it and that it has not expired — not that the session is still live
 * this second. A session revoked mid-token stays accepted here until the access
 * token expires. That is acceptable because this is a GATE, not the authority:
 * `app/(dashboard)/layout.tsx` and every `/api/*` route still call
 * `auth.getUser()` themselves, in-region where it is cheap, before they read or
 * write anything of the owner's. Nothing is widened — a visitor without a valid
 * token is still sent to /login from here.
 *
 * Anything unexpected falls back to `getUser()`, so an unverifiable token, a
 * rotated key or an unreachable JWKS behaves exactly as it did before this
 * existed.
 */

/**
 * A JSON Web Key Set in the shape `getClaims` takes it. Its own `JWK` type
 * belongs to @supabase/auth-js, which this project does not depend on directly;
 * the fields that type requires are `kty` and `key_ops`.
 */
export type VerifyingKey = { kty: 'RSA' | 'EC' | 'oct'; key_ops: string[]; [field: string]: unknown }
export type Jwks = { keys: VerifyingKey[] }

/** Only what this module uses, so the QA suite can stand in for the client. */
export type EdgeAuthClient = {
  auth: {
    getSession: () => Promise<{ data: { session: { access_token?: string | null } | null } }>
    getClaims: (
      jwt?: string,
      options?: { jwks?: Jwks },
    ) => Promise<{ data: { claims?: { sub?: unknown } | null } | null; error: unknown }>
    getUser: () => Promise<{ data: { user: { id: string } | null } }>
  }
}

/** How long a fetched key set is reused. The endpoint itself says `max-age=600`. */
export const JWKS_TTL_MS = 10 * 60_000

/**
 * The key set lives on `globalThis`, not in this module's scope, for the reason
 * `lib/client/seed-read.ts` gives: one module can be emitted into more than one
 * bundle, and two copies would each fetch their own set. It also survives
 * between invocations of a warm instance, which is the entire point — a set
 * fetched per request would only move the round trip, not remove it.
 */
const JWKS_KEY = '__goTopAuthJwks__'

type JwksHost = typeof globalThis & { [JWKS_KEY]?: { keys: VerifyingKey[]; at: number } }

export type EdgeSessionDeps = { fetch?: typeof fetch; now?: () => number }

/** QA only: forget the held key set. */
export function __clearVerifyingKeys(): void {
  delete (globalThis as JwksHost)[JWKS_KEY]
}

async function verifyingKeys(url: string, refresh: boolean, deps: EdgeSessionDeps): Promise<Jwks | null> {
  const host = globalThis as JwksHost
  const nowMs = deps.now ?? (() => Date.now())
  const held = host[JWKS_KEY]
  if (!refresh && held && nowMs() - held.at < JWKS_TTL_MS) return { keys: held.keys }
  try {
    const doFetch = deps.fetch ?? fetch
    const res = await doFetch(`${url}/auth/v1/.well-known/jwks.json`, { cache: 'no-store' })
    const body = res.ok ? ((await res.json()) as { keys?: VerifyingKey[] }) : null
    if (!body || !Array.isArray(body.keys) || body.keys.length === 0) return held ? { keys: held.keys } : null
    host[JWKS_KEY] = { keys: body.keys, at: nowMs() }
    return { keys: body.keys }
  } catch {
    // What we already hold beats no answer; the caller still has getUser().
    return held ? { keys: held.keys } : null
  }
}

/**
 * The signed-in user's id, or null. Never throws: an unverifiable token ends at
 * `getUser()`, the behaviour this replaced.
 */
export async function verifiedUserId(
  supabase: EdgeAuthClient,
  url: string,
  deps: EdgeSessionDeps = {},
): Promise<string | null> {
  // A cookie read, no network. No token means nobody is signed in, and that
  // must not cost a request.
  let token: string | null | undefined
  try {
    const { data } = await supabase.auth.getSession()
    token = data?.session?.access_token
  } catch {
    token = undefined
  }
  if (!token) return null

  // Twice: a key rotated since the set was cached looks like a verification
  // failure, and is answered by fetching the set again.
  for (const refresh of [false, true]) {
    const keys = await verifyingKeys(url, refresh, deps)
    if (!keys) break
    try {
      const { data, error } = await supabase.auth.getClaims(token, { jwks: keys })
      if (error) continue
      const sub = data?.claims?.sub
      return typeof sub === 'string' && sub.length > 0 ? sub : null
    } catch {
      continue
    }
  }

  try {
    const { data } = await supabase.auth.getUser()
    return data?.user?.id ?? null
  } catch {
    return null
  }
}
