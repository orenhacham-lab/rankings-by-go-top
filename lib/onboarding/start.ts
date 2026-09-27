/**
 * POST /api/projects/[id]/onboarding/start: start the first research of a
 * project, seeded from the merchant's free check when that is their site.
 *
 * Why a route of its own: the claim token lives in an httpOnly cookie
 * (lib/onboarding/claim-cookie.ts) that the browser's script cannot read, so
 * the decision "claim or scan" is made here, on the server. The run itself is
 * started by the seed route's own POST, called in-process with this request's
 * session, so every check it makes (signed in, ownership, the flag,
 * entitlement, caps, the claim's single use) applies unchanged, and its answer
 * is passed back as it is: { ok, runId, trigger } or { ok: false, code,
 * retryAfterSeconds? } with Retry-After on a 429.
 *
 * ORDER (proxy.ts does not cover /api/*, so this checks for itself first):
 *   1. signed in                                     401 unauthorized
 *   2. the project is theirs, read through their     404 not_found
 *      own RLS-scoped client AND filtered by owner
 *   3. the seeding scan is on for them               404 not_found
 *      (ENABLE_SEED_SCAN=true, or an administrator)
 *   4. a well-formed body                            400 invalid_request
 *      { locale?: 'he' | 'en' }
 *   5. the claim cookie, when there is one, is looked up WITHOUT being spent:
 *        usable and this project's site  → seed POST { action: 'claim' }
 *          202          → the cookie is cleared (the token is spent)
 *          claim_invalid → the cookie is cleared, and a plain scan starts
 *          anything else → passed back; the cookie is kept for a retry
 *        another site                    → a plain scan; the cookie is kept
 *        spent, expired, unknown, malformed → cleared; a plain scan
 *        unreadable (database)           → a plain scan; the cookie is kept
 *      no cookie                         → seed POST { action: 'start' }
 *
 * The token is never logged, never part of a response, and never sent back to
 * the browser except as the Set-Cookie that deletes it.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeLocale } from '@/lib/i18n/dashboard/locale'
import type { Locale } from '@/lib/i18n/locales'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { claimMatchesProject, projectSiteKey } from '@/lib/seed-scan/claim'
import type { SeedApiErrorCode, SeedScope } from '@/lib/seed-scan/types'
import { seedScanAvailable } from './availability'
import { claimCookieFromHeader, clearedClaimCookie, requestIsHttps } from './claim-cookie'
import type { ClaimPeek } from './claim-peek'

export type OnboardingStartDeps = {
  session: () => Promise<{ userId: string | null; db: SupabaseClient }>
  admin: () => ServiceRoleClient
  isAdmin: (admin: ServiceRoleClient, userId: string) => Promise<boolean>
  /** Which site a token scanned, without spending it (lib/onboarding/claim-peek.ts). */
  peekClaim: (admin: ServiceRoleClient, token: string, now: Date) => Promise<ClaimPeek>
  /** The seed route's POST for this project, called in-process with this request's session. */
  seed: (body: Record<string, unknown>) => Promise<Response>
  now: () => Date
  env: Record<string, string | undefined>
}

const NO_STORE = { 'Cache-Control': 'no-store' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BODY_CHARS = 1_024

function refuse(status: number, code: SeedApiErrorCode, extraHeaders: Record<string, string> = {}): Response {
  return Response.json({ ok: false, code }, { status, headers: { ...NO_STORE, ...extraHeaders } })
}

type StartBody = { locale: Locale | null }

async function readBody(request: Request): Promise<StartBody | null> {
  let text: string
  try {
    text = await request.text()
  } catch {
    return null
  }
  if (text.length > MAX_BODY_CHARS) return null
  if (text.trim() === '') return { locale: null }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const locale = r.locale === undefined ? null : normalizeLocale(r.locale)
  if (r.locale !== undefined && !locale) return null
  return { locale }
}

type OwnProject = {
  id: string
  user_id: string
  target_domain: string
  business_name: string | null
  country: string | null
  language: string | null
  city: string | null
}

/** The seed route's answer, passed back as it is, plus the Set-Cookie that clears a spent claim. */
async function relay(seeded: Response, clearCookie: string | null): Promise<Response> {
  const headers = new Headers(NO_STORE)
  const retryAfter = seeded.headers.get('Retry-After')
  if (retryAfter) headers.set('Retry-After', retryAfter)
  headers.set('Content-Type', 'application/json')
  if (clearCookie) headers.append('Set-Cookie', clearCookie)
  return new Response(await seeded.text(), { status: seeded.status, headers })
}

async function codeOf(res: Response): Promise<string | null> {
  try {
    const body = (await res.clone().json()) as { code?: unknown }
    return typeof body?.code === 'string' ? body.code : null
  } catch {
    return null
  }
}

type ClaimNote = 'none' | 'used' | 'spent_elsewhere' | 'gone' | 'other_site' | 'unreadable' | 'malformed'

export async function handleOnboardingStart(request: Request, projectId: string, deps: OnboardingStartDeps): Promise<Response> {
  try {
    let session: { userId: string | null; db: SupabaseClient }
    try {
      session = await deps.session()
    } catch {
      return refuse(503, 'unavailable')
    }
    const userId = session.userId
    if (!userId) return refuse(401, 'unauthorized')
    if (!UUID.test(projectId)) return refuse(404, 'not_found')

    const read = await session.db
      .from('projects')
      .select('id, user_id, target_domain, business_name, country, language, city')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle()
    if (read.error) return refuse(500, 'internal')
    const project = read.data as OwnProject | null
    if (!project || project.user_id !== userId) return refuse(404, 'not_found')

    let adminClient: ServiceRoleClient | null = null
    const admin = () => (adminClient ??= deps.admin())
    const available = await seedScanAvailable({ env: deps.env, isAdmin: () => deps.isAdmin(admin(), userId) })
    // Off means off: this route does not exist for anyone else.
    if (!available) return refuse(404, 'not_found')

    const body = await readBody(request)
    if (!body) return refuse(400, 'invalid_request')
    const locale = body.locale ? { locale: body.locale } : {}
    const scope: SeedScope = { projectId: project.id, userId }
    const now = deps.now()

    const secure = requestIsHttps(request.headers, request.url)
    const cookie = claimCookieFromHeader(request.headers.get('cookie'))
    let note: ClaimNote = cookie.present ? 'malformed' : 'none'
    let clearCookie: string | null = cookie.present && !cookie.token ? clearedClaimCookie(secure) : null

    if (cookie.token) {
      const peek = await deps.peekClaim(admin(), cookie.token, now)
      const siteKey = projectSiteKey(project.target_domain)
      if (peek.state === 'usable' && siteKey && claimMatchesProject({ url: peek.url, domain: peek.domain }, siteKey)) {
        const claimed = await deps.seed({ action: 'claim', token: cookie.token, ...locale })
        if (claimed.status === 202) {
          console.log('[onboarding] start', { projectId: scope.projectId, claim: 'used' })
          return relay(claimed, clearedClaimCookie(secure))
        }
        if ((await codeOf(claimed)) !== 'claim_invalid') {
          console.log('[onboarding] start refused', { projectId: scope.projectId, claim: 'kept', status: claimed.status })
          return relay(claimed, null)
        }
        // Spent, expired between the look and the use, or refused: a plain scan instead.
        note = 'spent_elsewhere'
        clearCookie = clearedClaimCookie(secure)
      } else if (peek.state === 'usable') {
        note = 'other_site'
      } else if (peek.state === 'gone') {
        note = 'gone'
        clearCookie = clearedClaimCookie(secure)
      } else {
        note = 'unreadable'
      }
    }

    const started = await deps.seed({ action: 'start', ...locale })
    console.log('[onboarding] start', { projectId: scope.projectId, claim: note, status: started.status })
    return relay(started, clearCookie)
  } catch (err) {
    console.error('[onboarding] start failed', { projectId, error: err instanceof Error ? err.name : typeof err })
    return refuse(500, 'internal')
  }
}
