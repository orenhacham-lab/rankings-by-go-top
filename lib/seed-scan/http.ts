/**
 * The seed API, framework-free so its whole contract runs under test. The route
 * (app/api/projects/[id]/seed/route.ts) only wires the real dependencies in.
 *
 *   POST  { action: 'start' }          → 202 { ok, runId, trigger }
 *         { action: 'claim', token }   → 202 { ok, runId, trigger: 'claim' }
 *         { action: 'continue',        → 202 { ok, runId, trigger, stage: 'b',
 *           keywords: string[] }               tracking } — stage B of the
 *                                        latest run, see handleSeedContinue
 *   GET                                → 200 { ok, run } — the latest run, its
 *                                        steps (b1-b6 too once stage B began)
 *                                        and its snapshot, or run: null
 *
 * ORDER OF CHECKS (POST). proxy.ts does not cover /api/*, so this does it all:
 *   1. signed in                                   401 unauthorized
 *   2. the project is theirs — read through their  404 not_found
 *      own RLS-scoped client AND filtered by owner
 *   3. the feature is on: ENABLE_SEED_SCAN=true,   404 not_found
 *      or the user is an administrator
 *   4. a well-formed request                       400 invalid_request
 *   5. entitled — explainAccess, unchanged: admin  403 entitlement_required
 *      first, then Shopify governance, then an      503 entitlement_unavailable
 *      active trial or subscription
 *   6. caps: a run of this project in progress —   409 run_in_progress
 *      live, or its worker gone but still the
 *      cron's to resume (MAX_RESUME_AGE_MS);
 *      a finished run less than 24h ago;          429 rescan_too_soon
 *      this user's runs today; everyone's today   429 user_daily_cap / global_daily_cap
 *   7. only now is a claim token redeemed, so no   400 claim_invalid
 *      refusal above can spend it; its site must
 *      be this project's site (never says why not)
 *   8. the run is created with its lease held, answered 202, and worked after
 *      the response (the route passes next/server's `after`). When it cannot
 *      be created (another run won the race: 409; the database: 500), a token
 *      step 7 spent is given back, so the visitor can claim again.
 *
 * `continue` shares steps 1-5 and has checks of its own instead of 6-8 (it
 * starts no new run): see handleSeedContinue at the end of this file.
 *
 * Every refusal is { ok: false, code } with a stable code (SEED_API_ERROR_CODES)
 * and a 429 also carries Retry-After. Nothing a provider or the database said
 * is ever part of a response or a log line.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeCheckUrl, type ClaimOutcome } from '@/lib/free-check'
import { normalizeLocale } from '@/lib/i18n/dashboard/locale'
import type { Locale } from '@/lib/i18n/locales'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { claimMatchesProject, claimSnapshot, projectSiteKey, restoreClaimToken, type ClaimSnapshot } from './claim'
import {
  countAllSeedRunsSince,
  countProjectSeedRuns,
  countUserSeedRunsSince,
  createSeedRun,
  findRecentCompletedSeedRun,
  findSeedRunInProgress,
  getLatestSeedRun,
  listSeedSteps,
  startSeedStageB,
  updateSeedStep,
  type SeedRunRow,
  type SeedStepRow,
} from './store'
import { initialSummary, readSummary } from './summary'
import type { SeedTrackingResult } from './tracking'
import {
  MAX_CONTINUE_KEYWORDS,
  STAGE_STEPS,
  type SeedApiErrorCode,
  type SeedGetResponse,
  type SeedPostResponse,
  type SeedRunTrigger,
  type SeedRunView,
  type SeedScope,
  type SeedTrackingOutcome,
} from './types'

// ── Limits ──────────────────────────────────────────────────────────────────

/** A project is scanned again at most once a day. Failed runs do not count. */
export const RESCAN_COOLDOWN_MS = 24 * 60 * 60 * 1000
/** Runs one user may start per UTC day, across all of their projects. SEED_SCAN_USER_DAILY_CAP. */
export const DEFAULT_USER_DAILY_CAP = 10
/** Runs all users together may start per UTC day. SEED_SCAN_GLOBAL_DAILY_CAP. */
export const DEFAULT_GLOBAL_DAILY_CAP = 300
const MAX_BODY_CHARS = 4_096

/** A non-negative integer from the environment; unset, empty or malformed means the default. */
export function capFromEnv(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : fallback
}

// ── Dependencies ────────────────────────────────────────────────────────────

export type SeedSession = {
  /** The signed-in user, or null. */
  userId: string | null
  /** The user's own RLS-scoped client: what they may read, they read through this. */
  db: SupabaseClient
}

export type SeedRouteDeps = {
  session: () => Promise<SeedSession>
  admin: () => ServiceRoleClient
  isAdmin: (admin: ServiceRoleClient, userId: string) => Promise<boolean>
  /** The existing entitlement decision (lib/subscription.ts explainAccess). */
  access: (admin: ServiceRoleClient, userId: string) => Promise<{ allowed: boolean; authority: string }>
  consumeClaim: (admin: ServiceRoleClient, token: string, now: Date) => Promise<ClaimOutcome>
  /** Run work after the response has been sent (next/server's `after`). */
  schedule: (task: () => Promise<void>) => void
  runStage: (args: { admin: ServiceRoleClient; scope: SeedScope; runId: string; lease: string }) => Promise<unknown>
  /**
   * Track the keywords chosen on `continue` through the keywords tab's own
   * server action (lib/seed-scan/tracking.ts addSeedKeywords), as the signed-in
   * merchant. A refusal is a code in the result, never a throw.
   */
  addKeywords: (args: { admin: ServiceRoleClient; scope: SeedScope; keywords: string[]; targetDomain: string }) => Promise<SeedTrackingResult>
  /** The request's locale when the body names none. */
  locale: () => Promise<Locale>
  now: () => Date
  env: Record<string, string | undefined>
}

// ── Responses ───────────────────────────────────────────────────────────────

const NO_STORE = { 'Cache-Control': 'no-store' }

function refuse(status: number, code: SeedApiErrorCode, retryAfterSeconds?: number): Response {
  const body: SeedPostResponse = retryAfterSeconds ? { ok: false, code, retryAfterSeconds } : { ok: false, code }
  const headers: Record<string, string> = { ...NO_STORE }
  if (retryAfterSeconds) headers['Retry-After'] = String(retryAfterSeconds)
  return Response.json(body, { status, headers })
}

const errorName = (err: unknown) => (err instanceof Error ? err.name : typeof err)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── Shared checks ───────────────────────────────────────────────────────────

type OwnProject = { id: string; user_id: string; target_domain: string }

/** The project, read as its owner: RLS scopes the read and the filter names the owner too. */
async function readOwnProject(db: SupabaseClient, projectId: string, userId: string): Promise<OwnProject | null | 'error'> {
  const { data, error } = await db
    .from('projects')
    .select('id, user_id, target_domain')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return 'error'
  const project = data as OwnProject | null
  return project && project.user_id === userId ? project : null
}

type Gate =
  | { ok: true; userId: string; db: SupabaseClient; project: OwnProject; admin: () => ServiceRoleClient }
  | { ok: false; response: Response }

/** Steps 1-3: signed in, their project, the feature on for them. */
async function gate(projectId: string, deps: SeedRouteDeps): Promise<Gate> {
  let session: SeedSession
  try {
    session = await deps.session()
  } catch {
    return { ok: false, response: refuse(503, 'unavailable') }
  }
  if (!session.userId) return { ok: false, response: refuse(401, 'unauthorized') }
  if (!UUID.test(projectId)) return { ok: false, response: refuse(404, 'not_found') }

  const project = await readOwnProject(session.db, projectId, session.userId)
  if (project === 'error') return { ok: false, response: refuse(500, 'internal') }
  if (!project) return { ok: false, response: refuse(404, 'not_found') }

  let admin: ServiceRoleClient | null = null
  const adminClient = () => (admin ??= deps.admin())
  if (deps.env.ENABLE_SEED_SCAN !== 'true') {
    let isAdmin = false
    try {
      isAdmin = await deps.isAdmin(adminClient(), session.userId)
    } catch {
      isAdmin = false
    }
    // Off means off: the route does not exist for anyone else.
    if (!isAdmin) return { ok: false, response: refuse(404, 'not_found') }
  }
  return { ok: true, userId: session.userId, db: session.db, project, admin: adminClient }
}

type PostBody =
  | { action: 'start'; locale: Locale | null }
  | { action: 'claim'; token: string; locale: Locale | null }
  | { action: 'continue'; keywords: string[]; locale: Locale | null }

/** A seed keyword is short text; anything longer is not one of ours. */
const MAX_KEYWORD_CHARS = 200

/** `keywords` of a continue: an array of at most MAX_CONTINUE_KEYWORDS distinct, non-empty strings; null otherwise. */
function readContinueKeywords(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length > MAX_CONTINUE_KEYWORDS) return null
  const out: string[] = []
  for (const x of v) {
    if (typeof x !== 'string') return null
    const k = x.trim()
    if (!k || k.length > MAX_KEYWORD_CHARS) return null
    if (out.some((o) => o.toLowerCase() === k.toLowerCase())) return null
    out.push(k)
  }
  return out
}

async function readBody(request: Request): Promise<PostBody | null> {
  let raw: unknown
  try {
    const text = await request.text()
    if (text.length > MAX_BODY_CHARS) return null
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const locale = r.locale === undefined ? null : normalizeLocale(r.locale)
  if (r.locale !== undefined && !locale) return null
  if (r.action === 'start') return { action: 'start', locale }
  if (r.action === 'claim' && typeof r.token === 'string' && r.token.length > 0 && r.token.length <= 256) {
    return { action: 'claim', token: r.token, locale }
  }
  if (r.action === 'continue') {
    const keywords = readContinueKeywords(r.keywords)
    return keywords ? { action: 'continue', keywords, locale } : null
  }
  return null
}

const utcDayStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
const secondsUntil = (now: Date, at: number) => Math.max(1, Math.ceil((at - now.getTime()) / 1000))

type Caps =
  | { ok: true; priorRuns: number }
  | { ok: false; status: number; code: SeedApiErrorCode; retryAfterSeconds?: number }

/** Step 6. Every count is the service role's, filtered by the owner (the global cap by nobody: it is a count). */
export async function checkSeedCaps(
  admin: ServiceRoleClient,
  scope: SeedScope,
  now: Date,
  env: Record<string, string | undefined>,
): Promise<Caps> {
  const internal: Caps = { ok: false, status: 500, code: 'internal' }

  const inProgress = await findSeedRunInProgress(admin, scope, now)
  if (inProgress === 'error') return internal
  if (inProgress) return { ok: false, status: 409, code: 'run_in_progress' }

  const recent = await findRecentCompletedSeedRun(admin, scope, new Date(now.getTime() - RESCAN_COOLDOWN_MS))
  if (recent === 'error') return internal
  if (recent) {
    const at = new Date(recent.created_at).getTime() + RESCAN_COOLDOWN_MS
    return { ok: false, status: 429, code: 'rescan_too_soon', retryAfterSeconds: secondsUntil(now, at) }
  }

  const dayStart = utcDayStart(now)
  const tomorrow = dayStart.getTime() + 24 * 60 * 60 * 1000
  const mine = await countUserSeedRunsSince(admin, scope.userId, dayStart)
  if (mine === 'error') return internal
  if (mine >= capFromEnv(env.SEED_SCAN_USER_DAILY_CAP, DEFAULT_USER_DAILY_CAP)) {
    return { ok: false, status: 429, code: 'user_daily_cap', retryAfterSeconds: secondsUntil(now, tomorrow) }
  }
  const everyone = await countAllSeedRunsSince(admin, dayStart)
  if (everyone === 'error') return internal
  if (everyone >= capFromEnv(env.SEED_SCAN_GLOBAL_DAILY_CAP, DEFAULT_GLOBAL_DAILY_CAP)) {
    return { ok: false, status: 429, code: 'global_daily_cap', retryAfterSeconds: secondsUntil(now, tomorrow) }
  }

  const priorRuns = await countProjectSeedRuns(admin, scope)
  if (priorRuns === 'error') return internal
  return { ok: true, priorRuns }
}

// ── POST ────────────────────────────────────────────────────────────────────

export async function handleSeedPost(request: Request, projectId: string, deps: SeedRouteDeps): Promise<Response> {
  try {
    const gated = await gate(projectId, deps)
    if (!gated.ok) return gated.response
    const { userId, project } = gated

    const body = await readBody(request)
    if (!body) return refuse(400, 'invalid_request')

    let admin: ServiceRoleClient
    try {
      admin = gated.admin()
    } catch {
      return refuse(503, 'unavailable')
    }

    const access = await deps.access(admin, userId)
    if (access.authority === 'unreadable') return refuse(503, 'entitlement_unavailable')
    if (!access.allowed) return refuse(403, 'entitlement_required')

    const scope: SeedScope = { projectId: project.id, userId }
    // Stage B of the latest run: it starts no new run, so no caps; its own checks.
    if (body.action === 'continue') return handleSeedContinue(body, { admin, scope, targetDomain: project.target_domain }, deps)
    const now = deps.now()
    const caps = await checkSeedCaps(admin, scope, now, deps.env)
    if (!caps.ok) return refuse(caps.status, caps.code, caps.retryAfterSeconds)

    const siteKey = projectSiteKey(project.target_domain)
    let trigger: SeedRunTrigger = caps.priorRuns === 0 ? 'create' : 'rescan'
    let snapshot: ClaimSnapshot | null = null
    let spentToken: string | null = null
    if (body.action === 'claim') {
      // A project without a usable address cannot match any scan: refused
      // before the token is spent.
      if (!siteKey) return refuse(400, 'claim_invalid')
      const claimed = await deps.consumeClaim(admin, body.token, now)
      // Malformed, unknown, spent, expired or another site's scan: one answer.
      if (!claimed.ok || !claimMatchesProject(claimed.scan, siteKey)) return refuse(400, 'claim_invalid')
      spentToken = body.token
      snapshot = claimSnapshot(claimed.scan)
      trigger = 'claim'
    }

    const locale = snapshot?.locale ?? body.locale ?? (await deps.locale())
    const admitted = normalizeCheckUrl(project.target_domain ?? '')
    const summary = initialSummary({
      source: snapshot ? 'claim' : 'scan',
      domain: siteKey ?? (project.target_domain ?? '').slice(0, 253),
      url: admitted.ok ? admitted.url.toString() : (project.target_domain ?? '').slice(0, 2_000),
      locale,
    })
    const created = await createSeedRun(admin, scope, {
      trigger,
      stage: 'a',
      summary,
      stepDetail: snapshot ? { a1: { claim: snapshot } } : undefined,
      now,
    })
    if (!created.ok) {
      // No run took the claim: give the token back (step 8 in the header).
      if (spentToken && !(await restoreClaimToken(admin, spentToken, now).catch(() => false))) {
        console.warn('[seed-scan] claim not restored', { projectId: scope.projectId })
      }
      return created.reason === 'in_progress' ? refuse(409, 'run_in_progress') : refuse(500, 'internal')
    }

    const runId = created.run.id
    const lease = created.lease
    deps.schedule(async () => {
      try {
        await deps.runStage({ admin, scope, runId, lease })
      } catch (err) {
        console.error('[seed-scan] run crashed', { runId, projectId: scope.projectId, error: errorName(err) })
      }
    })
    console.log('[seed-scan] run started', { runId, projectId: scope.projectId, trigger })
    const answer: SeedPostResponse = { ok: true, runId, trigger }
    return Response.json(answer, { status: 202, headers: NO_STORE })
  } catch (err) {
    console.error('[seed-scan] start failed', { projectId, error: errorName(err) })
    return refuse(500, 'internal')
  }
}

// ── GET ─────────────────────────────────────────────────────────────────────

const stableCode = (code: string | null | undefined): string | null =>
  !code ? null : /^[a-z0-9_]{1,64}$/.test(code) ? code : 'internal_error'

/** A run as the API shows it: no step detail, the snapshot re-read field by field. */
export function seedRunView(run: SeedRunRow, steps: SeedStepRow[], now: Date): SeedRunView {
  const leaseLive = !!run.lease_expires_at && new Date(run.lease_expires_at).getTime() > now.getTime()
  return {
    id: run.id,
    trigger: run.trigger,
    stage: run.stage,
    status: run.status,
    errorCode: stableCode(run.error_code),
    // The current stage's times: moving to stage B restarts them (stage A's stay on a1-a4).
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    stalled: run.status === 'running' && !leaseLive,
    // A stage-B run shows all ten steps: stage A's as they finished, then b1-b6.
    steps: (run.stage === 'b' ? [...STAGE_STEPS.a, ...STAGE_STEPS.b] : (STAGE_STEPS[run.stage] ?? [])).map((step) => {
      const row = steps.find((s) => s.step === step)
      return {
        step,
        status: row?.status ?? 'pending',
        itemCount: row?.item_count ?? null,
        errorCode: stableCode(row?.error_code),
        startedAt: row?.started_at ?? null,
        finishedAt: row?.finished_at ?? null,
      }
    }),
    summary: readSummary(run.summary),
  }
}

export async function handleSeedGet(projectId: string, deps: SeedRouteDeps): Promise<Response> {
  try {
    const gated = await gate(projectId, deps)
    if (!gated.ok) return gated.response
    const scope: SeedScope = { projectId: gated.project.id, userId: gated.userId }

    // Read as the owner: RLS lets them read their own runs, and nothing else.
    const run = await getLatestSeedRun(gated.db, scope)
    if (run === 'error') return refuse(500, 'internal')
    let answer: SeedGetResponse = { ok: true, run: null }
    if (run) {
      const steps = await listSeedSteps(gated.db, scope, run.id)
      if (steps === 'error') return refuse(500, 'internal')
      answer = { ok: true, run: seedRunView(run, steps, deps.now()) }
    }
    return Response.json(answer, { status: 200, headers: NO_STORE })
  } catch (err) {
    console.error('[seed-scan] read failed', { projectId, error: errorName(err) })
    return refuse(500, 'internal')
  }
}

// ── POST { action: 'continue' } ─────────────────────────────────────────────

const keywordKey = (k: string) => k.trim().toLowerCase()

/**
 * Stage B of the project's latest run, once the merchant chose which of its
 * seed keywords to track. Reached only through handleSeedPost, after steps 1-5
 * (signed in, their project read through their own client, the flag, a
 * well-formed body, entitled). Then, in this order:
 *
 *   the latest run is a finished stage A (done or partial)     409 not_continuable
 *   …whose stage B has not begun                               409 stage_b_started
 *   every keyword is one of that run's own seed keywords,      400 invalid_request
 *     MAX_CONTINUE_KEYWORDS at most (readBody)
 *   the run moves to stage B in ONE conditional write, with    409 not_continuable
 *     its lease held — of two requests, one moves it
 *   the keywords are tracked through the keywords tab's own server action; a
 *     refusal (the plan's keyword limit, an entitlement outage) is a code in
 *     the answer and stage B runs anyway
 *   b6 is told which keywords were added — the only ones it will check
 *   202 { ok, runId, trigger, stage: 'b', tracking }; b1-b6 run after it.
 */
async function handleSeedContinue(
  body: Extract<PostBody, { action: 'continue' }>,
  ctx: { admin: ServiceRoleClient; scope: SeedScope; targetDomain: string },
  deps: SeedRouteDeps,
): Promise<Response> {
  const { admin, scope } = ctx
  const run = await getLatestSeedRun(admin, scope)
  if (run === 'error') return refuse(500, 'internal')
  if (!run) return refuse(409, 'not_continuable')
  if (run.stage === 'b') return refuse(409, 'stage_b_started')
  if (run.status !== 'done' && run.status !== 'partial') return refuse(409, 'not_continuable')

  // Only the run's own seed keywords, in the spelling the run found them.
  const seeds = new Map((readSummary(run.summary)?.seedKeywords ?? []).map((k) => [keywordKey(k), k]))
  const keywords: string[] = []
  for (const k of body.keywords) {
    const seed = seeds.get(keywordKey(k))
    if (!seed) return refuse(400, 'invalid_request')
    keywords.push(seed)
  }

  const now = deps.now()
  const started = await startSeedStageB(admin, scope, run, now)
  if (!started.ok) return started.reason === 'not_continuable' ? refuse(409, 'not_continuable') : refuse(500, 'internal')
  const runId = run.id
  const lease = started.lease

  let tracking: SeedTrackingOutcome
  let targets: string[] = []
  try {
    const added = await deps.addKeywords({ admin, scope, keywords, targetDomain: ctx.targetDomain })
    tracking = added.outcome
    targets = added.targetIds
  } catch (err) {
    console.error('[seed-scan] keywords not added', { runId, projectId: scope.projectId, error: errorName(err) })
    tracking = { requested: keywords.length, added: 0, code: 'keywords_add_failed' }
  }
  // What b6 checks: the keywords added just now, and nothing else.
  const noted = await updateSeedStep(admin, scope, runId, 'b6', { status: 'pending', detail: { tracking, targets } })
  if (!noted) console.warn('[seed-scan] b6 targets not saved', { runId, projectId: scope.projectId })

  deps.schedule(async () => {
    try {
      await deps.runStage({ admin, scope, runId, lease })
    } catch (err) {
      console.error('[seed-scan] run crashed', { runId, projectId: scope.projectId, error: errorName(err) })
    }
  })
  console.log('[seed-scan] stage b started', { runId, projectId: scope.projectId, tracking: tracking.code, added: tracking.added })
  const answer: SeedPostResponse = { ok: true, runId, trigger: run.trigger, stage: 'b', tracking }
  return Response.json(answer, { status: 202, headers: NO_STORE })
}
