/**
 * The research before sign-up, as an API: framework-free, so its whole
 * contract runs under test (lib/presignup/__qa__/presignup-research.qa.ts).
 * app/api/free-check/research/route.ts and app/api/free-check/report/route.ts
 * only wire the real dependencies in.
 *
 * POST /api/free-check/research  { url, locale }
 *   Public and unauthenticated, like the free check it extends: a visitor with
 *   no account is exactly the caller. What stands in for authentication:
 *     1. the research is on (ENABLE_SEED_SCAN and ENABLE_PRESIGNUP_RESEARCH);  404 not_found
 *        off, the route does not exist
 *     2. a well-formed body and a public web address                          400 invalid_url / blocked_url
 *     3. the caps, failing closed (gate.ts)                                   429 rate_limited / daily_cap
 *                                                                              503 unavailable
 *   Then 200 with newline-delimited JSON: a line as each step starts and ends,
 *   then ONE `result` (the gated view and a one-time claim token) or `error`.
 *   A replay (the same site researched in the last day) answers its result at
 *   once. The run's row in the free check's ledger (free_site_checks) is the
 *   cache, the spend record and what a claim token redeems; the token is the
 *   free check's own (free_site_check_claims: SHA-256 only, single use, 24h).
 *
 * POST /api/free-check/report  { token, email, consent: true, locale }
 *   "Email me the report": stores the address ONLY with an explicit consent,
 *   with the consent's own words in the visitor's language and when it was
 *   given. Nothing is sent: there is no sender yet. The claim token proves the
 *   visitor watched this research; it is looked up, never spent.
 *
 * Logs carry ids and stable codes only: no address, no site, no provider text.
 */
import { hashClaimToken, isWellFormedClaimToken, normalizeCheckUrl, domainKey, type FreeCheckResult } from '@/lib/free-check'
import { toBilingualLocale, type Locale, type PublicLocale } from '@/lib/i18n/locales'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { admitResearch, finishResearchRun } from './gate'
import type { AnonymousResearch } from './run'
import { reportConsentText } from './copy'
import { publicResult, researchSeed, researchView, storedResearchView, type ResearchLedgerSeed } from './view'
import type { ReportRequestResponse, ResearchErrorCode, ResearchEvent, ResearchRefusal, ResearchStepView } from './types'

export type ResearchDeps = {
  /** ENABLE_SEED_SCAN and ENABLE_PRESIGNUP_RESEARCH (lib/onboarding/availability.ts presignupResearchOn). */
  enabled: () => boolean
  admin: () => ServiceRoleClient
  /** The free check's salted hash of the caller's address. */
  clientHash: (request: Request) => string
  run: (args: { url: URL; locale: Locale; onStep: (step: ResearchStepView) => void }) => Promise<AnonymousResearch>
  /** The free check's ledger write (lib/free-check/store.ts recordRun); null when it failed. */
  record: (
    admin: ServiceRoleClient,
    row: { domain: string; locale: Locale; url: string; result: FreeCheckResult; seed: ResearchLedgerSeed; clientHash: string },
  ) => Promise<string | null>
  /** The free check's claim token for a ledger row (lib/free-check/claim.ts issueClaimToken). */
  issueClaim: (admin: ServiceRoleClient, checkId: string) => Promise<string | null>
  /** Operator alert for a freshly recorded run. Optional, fire-and-forget: it can never change the response. */
  afterRecorded?: (info: { checkId: string; domain: string; locale: Locale; result: FreeCheckResult }) => void
  now: () => Date
  env: Record<string, string | undefined>
}

const NO_STORE = { 'cache-control': 'no-store' }
const MAX_BODY_CHARS = 2_048

function refuse(status: number, code: ResearchErrorCode, retryAfterSeconds?: number): Response {
  const headers: Record<string, string> = { ...NO_STORE }
  if (retryAfterSeconds) headers['retry-after'] = String(retryAfterSeconds)
  return Response.json({ ok: false, code } satisfies ResearchRefusal, { status, headers })
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text()
    if (text.length > MAX_BODY_CHARS) return null
    const raw = JSON.parse(text) as unknown
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * The language of the PAGE the visitor is on.
 *
 * This used to answer `he` to everything that was not the string 'en', which
 * was right while the public site had two languages. Once /es went live a
 * Spanish visitor's free check was researched in HEBREW and their consent was
 * stored as the Hebrew sentence under the Hebrew version id — a record of
 * words they were never shown. Found 3 October 2026, the evening /es was
 * published.
 */
const readPublicLocale = (v: unknown): PublicLocale => (v === 'en' || v === 'es' ? v : 'he')

/**
 * The language the research itself is written in, and the one the ledger row
 * records. It is still bilingual: the research summary is built from the
 * dashboard's own `Locale` copy, and the Spanish screen already renders that
 * preview in ENGLISH (`FixedDashboardLanguage locale={toBilingualLocale(…)}`
 * in FreeCheckResearch), so English is what the Spanish visitor sees around
 * it. Spanish research of its own needs the ledger's `locale` CHECK widened to
 * 'es' on both free_check tables, which is a production database change.
 */
const readLocale = (v: unknown): Locale => toBilingualLocale(readPublicLocale(v))

/** What a failed a1 means to the visitor, in the free check's own words. */
export function researchFailureCode(a1Code: string | null): ResearchErrorCode {
  switch (a1Code) {
    case 'invalid_site_url':
      return 'invalid_url'
    case 'site_blocked':
    case 'site_offsite_redirect':
      return 'blocked_url'
    case 'site_not_html':
      return 'not_html'
    case 'site_forbidden':
      return 'forbidden'
    case 'site_unreachable':
      return 'unreachable'
    default:
      return 'internal'
  }
}

const errorName = (err: unknown) => (err instanceof Error ? err.name : typeof err)

function ndjson(work: (send: (event: ResearchEvent) => void) => Promise<void>): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ResearchEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          /* the visitor left; the run still finishes and is recorded */
        }
      }
      try {
        await work(send)
      } catch (err) {
        console.error('[presignup] research crashed', { error: errorName(err) })
        send({ type: 'error', code: 'internal' })
      } finally {
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }
    },
  })
  return new Response(stream, {
    status: 200,
    headers: { ...NO_STORE, 'content-type': 'application/x-ndjson; charset=utf-8', 'x-accel-buffering': 'no' },
  })
}

export async function handleResearchPost(request: Request, deps: ResearchDeps): Promise<Response> {
  try {
    if (!deps.enabled()) return refuse(404, 'not_found')

    const body = await readJson(request)
    if (!body || typeof body.url !== 'string' || body.url.length > 2_000) return refuse(400, 'invalid_url')
    const locale = readLocale(body.locale)
    const admitted = normalizeCheckUrl(body.url)
    if (!admitted.ok) return refuse(400, admitted.reason === 'host_reserved' || admitted.reason === 'port' ? 'blocked_url' : 'invalid_url')
    const url = admitted.url
    const domain = domainKey(url)

    let admin: ServiceRoleClient
    try {
      admin = deps.admin()
    } catch {
      return refuse(503, 'unavailable')
    }
    const clientHash = deps.clientHash(request)
    const now = deps.now()
    const admission = await admitResearch({ admin, clientHash, domain, locale, now, env: deps.env })
    if (admission.kind === 'refused') {
      if (admission.code === 'unavailable') return refuse(503, 'unavailable')
      return refuse(429, admission.code, admission.code === 'daily_cap' ? 3_600 : 600)
    }

    if (admission.kind === 'replay') {
      const view = storedResearchView(admission.seed)
      if (!view) return refuse(503, 'unavailable')
      // The row is shared, the capability is not: a fresh token for this visitor.
      const claimToken = await deps.issueClaim(admin, admission.checkId).catch(() => null)
      console.log('[presignup] research replayed', { runId: admission.runId, checkId: admission.checkId })
      return ndjson(async (send) => send({ type: 'result', view, claimToken }))
    }

    const runId = admission.runId
    return ndjson(async (send) => {
      const startedAt = Date.now()
      let research: AnonymousResearch
      try {
        research = await deps.run({ url, locale, onStep: (step) => send({ type: 'step', step }) })
      } catch (err) {
        console.error('[presignup] research failed', { runId, error: errorName(err) })
        await finishResearchRun(admin, runId, { status: 'failed', checkId: null, spend: { modelCalls: 0, searches: 0 }, errorCode: 'internal_error', now: deps.now() })
        send({ type: 'error', code: 'internal' })
        return
      }
      if (research.status === 'failed') {
        await finishResearchRun(admin, runId, { status: 'failed', checkId: null, spend: research.spend, errorCode: research.errorCode, now: deps.now() })
        console.log('[presignup] research ended', { runId, status: 'failed', errorCode: research.errorCode, ...research.spend, ms: Date.now() - startedAt })
        send({ type: 'error', code: researchFailureCode(research.errorCode) })
        return
      }
      // The ledger row is the cache, the spend record and what a claim redeems.
      // A failed write never costs the visitor their result: the sign-up link
      // then simply carries no claim.
      const checkId = await deps
        .record(admin, {
          domain,
          locale,
          url: research.summary.url,
          result: publicResult(research.summary, research.spend, deps.now()),
          seed: researchSeed(research),
          clientHash,
        })
        .catch(() => null)
      const claimToken = checkId ? await deps.issueClaim(admin, checkId).catch(() => null) : null
      if (checkId) {
        try {
          deps.afterRecorded?.({ checkId, domain, locale, result: publicResult(research.summary, research.spend, deps.now()) })
        } catch { /* an alert never touches the research */ }
      }
      await finishResearchRun(admin, runId, { status: 'done', checkId, spend: research.spend, errorCode: research.errorCode, now: deps.now() })
      console.log('[presignup] research ended', {
        runId,
        status: research.status,
        errorCode: research.errorCode,
        ...research.spend,
        recorded: checkId !== null,
        ms: Date.now() - startedAt,
      })
      send({ type: 'result', view: researchView(research.summary, research.steps), claimToken })
    })
  } catch (err) {
    console.error('[presignup] research refused', { error: errorName(err) })
    return refuse(500, 'internal')
  }
}

// ── "Email me the report" ──────────────────────────────────────────────────

export const REPORT_REQUESTS_TABLE = 'free_check_report_requests'
/** Requests one visitor may leave per hour. */
export const REPORT_CLIENT_HOURLY_CAP = 5
/** Deliberately plain: a real address has one @, no spaces, and a dot in its domain. */
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,185}\.[^\s@]{2,}$/

export type ReportDeps = Pick<ResearchDeps, 'enabled' | 'admin' | 'clientHash' | 'now'> & {
  /** Operator alert for a newly saved request (not for a repeat of the same one). Optional, fire-and-forget. */
  afterSaved?: (info: { checkId: string; email: string; locale: Locale }) => void
}

function answer(status: number, body: ReportRequestResponse): Response {
  return Response.json(body, { status, headers: NO_STORE })
}

export async function handleReportRequest(request: Request, deps: ReportDeps): Promise<Response> {
  try {
    if (!deps.enabled()) return answer(404, { ok: false, code: 'not_found' })
    const body = await readJson(request)
    if (!body) return answer(400, { ok: false, code: 'invalid_request' })
    // Consent is a box the visitor ticked themselves: exactly `true`, never implied.
    if (body.consent !== true) return answer(400, { ok: false, code: 'consent_required' })
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (email.length > 254 || !EMAIL.test(email)) return answer(400, { ok: false, code: 'invalid_email' })
    const token = typeof body.token === 'string' ? body.token : ''
    if (!isWellFormedClaimToken(token)) return answer(400, { ok: false, code: 'invalid_claim' })
    const publicLocale = readPublicLocale(body.locale)
    const locale = toBilingualLocale(publicLocale)

    let admin: ServiceRoleClient
    try {
      admin = deps.admin()
    } catch {
      return answer(503, { ok: false, code: 'unavailable' })
    }
    const now = deps.now()
    const clientHash = deps.clientHash(request)

    const recent = await admin
      .from(REPORT_REQUESTS_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('client_hash', clientHash)
      .gt('created_at', new Date(now.getTime() - 60 * 60 * 1000).toISOString())
    if (recent.error) return answer(503, { ok: false, code: 'unavailable' })
    if ((recent.count ?? 0) >= REPORT_CLIENT_HOURLY_CAP) return answer(429, { ok: false, code: 'rate_limited' })

    // The research this visitor watched: the row their token names, looked up by its hash only.
    const claim = await admin
      .from('free_site_check_claims')
      .select('check_id, created_at')
      .eq('token_hash', hashClaimToken(token))
      .gt('created_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1)
    if (claim.error) return answer(503, { ok: false, code: 'unavailable' })
    const checkId = (claim.data as { check_id: string }[] | null)?.[0]?.check_id
    if (!checkId) return answer(400, { ok: false, code: 'invalid_claim' })

    const saved = await admin.from(REPORT_REQUESTS_TABLE).insert({
      check_id: checkId,
      email,
      consent: true,
      consented_at: now.toISOString(),
      // The words the visitor agreed to, in their language, from our copy: never from the request.
      // The words the visitor READ, in the page's own language — so a Spanish
      // visitor's record is the Spanish sentence with its own version id, never
      // the Hebrew or English one. `locale` beside it is the bilingual language
      // of the research and of any email we send, which is not the same thing.
      consent_text: reportConsentText(publicLocale),
      locale,
      client_hash: clientHash,
      created_at: now.toISOString(),
    })
    // The same address for the same research twice is the same request.
    if (saved.error && saved.error.code !== '23505') {
      console.error('[presignup] report request not saved', { code: saved.error.code ?? null })
      return answer(503, { ok: false, code: 'unavailable' })
    }
    if (!saved.error) {
      try {
        deps.afterSaved?.({ checkId, email, locale })
      } catch { /* an alert never touches the request */ }
    }
    console.log('[presignup] report requested', { checkId })
    return answer(200, { ok: true, code: 'saved' })
  } catch (err) {
    console.error('[presignup] report request failed', { error: errorName(err) })
    return answer(500, { ok: false, code: 'internal' })
  }
}
