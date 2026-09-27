/**
 * "Detect again with AI": POST /api/projects/[id]/redetect { section, locale? }.
 *
 * The settings screen offers it beside the business details, the business
 * description (row 2) and the niche and audiences (row 3). It asks the model
 * the SAME question the scan's a2 step asks (fetchBusinessInsight), about the
 * SAME page the scan already read: the latest run's stored a1 signals. It never
 * fetches the site again. Its answer goes through a2's own cleaners
 * (lib/seed-scan/steps.ts insightFromModel, lib/seed-scan/settings.ts
 * projectValues/profileValues), so a suggestion is exactly what a2 would have
 * written, and it is only a SUGGESTION: this route writes nothing to the
 * settings. The owner confirms on the screen and the card's own save stores it
 * as their value ('user').
 *
 * Competitors are not offered: they come from real search results (a4), not
 * from the model, so the competitors card points at "scan the site again".
 *
 * ORDER OF CHECKS. proxy.ts does not cover /api/*, so this does it all:
 *   1. signed in                                     401 unauthorized
 *   2. the project is theirs: read through their     404 not_found
 *      own RLS-scoped client AND filtered by owner
 *   3. the feature is on: ENABLE_SEED_SCAN=true, or  404 not_found
 *      the user is an administrator (as the seed route)
 *   4. a well-formed request                         400 invalid_request
 *   5. entitled: explainAccess, unchanged (admin     403 entitlement_required
 *      first, then Shopify, then trial/subscription) 503 entitlement_unavailable
 *   6. no scan of the project is running: it is      409 run_in_progress
 *      about to write these very fields
 *   7. the latest run stored what it read (a1)       409 scan_required
 *   8. this user's allowance for today               429 redetect_daily_cap
 *      (SETTINGS_AI_USER_DAILY_CAP, default 10)          + Retry-After
 *   9. one at a time per project (single flight)     409 redetect_in_progress
 *  10. a slot of today's allowance is taken, and ONE model call is made
 *                                                    503 model_unavailable
 *                                                    502 model_failed
 *  11. 200 { ok, section, suggestions }
 *
 * THE CAP AND THE SINGLE FLIGHT, WITHOUT A MIGRATION. Both are rows of
 * operation_claims (supabase/migrations/20260909000000_operation_claims.sql),
 * taken through lib/ops/single-flight.ts. Its CHECK allows two operation names,
 * so these use 'ranking_scan', as app/api/ai-visibility/runs/route.ts does, in
 * scopes no ranking scan uses (a scan's are `project:X:all` and
 * `project:X:target:Y`): a shared namespace, not a shared lock.
 *   - The single flight is `project:<id>:settings-ai`, released when the call
 *     ends (and expiring after REDETECT_FLIGHT_TTL_SECONDS if it never does).
 *   - Each use of the day's allowance is one slot, `settings-ai:day:<UTC day>:<n>`,
 *     n = 1…cap, claimed and never released: counting today's slot rows IS
 *     the day's usage. A slot is taken only once every check above has passed,
 *     right before the call, so a refusal never spends one. Earlier days' slot
 *     rows are removed as they are found.
 * The claim mechanism unreadable or not deployed fails CLOSED: without it
 * neither the cap nor the single flight can be kept, so no call is made.
 *
 * Every refusal is { ok: false, code } with a stable code (REDETECT_ERROR_CODES)
 * and a 429 also carries Retry-After. Nothing the model, the database or the
 * site said is ever part of a response or a log line.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { fetchBusinessInsight, SiteSignals } from '@/lib/free-check'
import { normalizeLocale } from '@/lib/i18n/dashboard/locale'
import type { Locale } from '@/lib/i18n/locales'
import { claimOperation, releaseOperationClaim, type OperationName } from '@/lib/ops/single-flight'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { projectSiteKey } from '@/lib/seed-scan/claim'
import { capFromEnv } from '@/lib/seed-scan/http'
import { profileValues, projectValues } from '@/lib/seed-scan/settings'
import { insightFromModel, readStoredSignals, settleWithin, STAGE_A_BUDGETS, type StoredInsight } from '@/lib/seed-scan/steps'
import { findSeedRunInProgress, getLatestSeedRun } from '@/lib/seed-scan/store'
import { readSummary } from '@/lib/seed-scan/summary'
import {
  REDETECT_SECTIONS,
  type AudienceSuggestion,
  type BusinessSuggestion,
  type CommerceType,
  type ProfileSuggestion,
  type RedetectErrorCode,
  type RedetectResponse,
  type RedetectSection,
} from './types'

// ── Limits ──────────────────────────────────────────────────────────────────

/** Model calls one user may make from the settings screen per UTC day. SETTINGS_AI_USER_DAILY_CAP. */
export const DEFAULT_REDETECT_DAILY_CAP = 10
/** The single flight outlives the model's budget (18s) with room to spare. */
export const REDETECT_FLIGHT_TTL_SECONDS = 60
/** A slot row only has to stay live longer than any one request; its row is what counts. */
const SLOT_TTL_SECONDS = 900
const OPERATION: OperationName = 'ranking_scan'
const SLOT_PREFIX = 'settings-ai:day:'
const MAX_BODY_CHARS = 1_024

export const redetectFlightScope = (projectId: string) => `project:${projectId}:settings-ai`
export const redetectSlotScope = (day: string, n: number) => `${SLOT_PREFIX}${day}:${n}`
/** The UTC day a slot belongs to, as YYYY-MM-DD. */
export const utcDay = (now: Date) => now.toISOString().slice(0, 10)

// ── Dependencies ────────────────────────────────────────────────────────────

export type RedetectDeps = {
  /** The signed-in user and their own RLS-scoped client. */
  session: () => Promise<{ userId: string | null; db: SupabaseClient }>
  admin: () => ServiceRoleClient
  isAdmin: (admin: ServiceRoleClient, userId: string) => Promise<boolean>
  /** The existing entitlement decision (lib/subscription.ts explainAccess). */
  access: (admin: ServiceRoleClient, userId: string) => Promise<{ allowed: boolean; authority: string }>
  /** The model call, the one a2 makes. */
  insight: typeof fetchBusinessInsight
  /** A fresh id for this request: the holder of its claims. */
  requestId: () => string
  now: () => Date
  env: Record<string, string | undefined>
  /** The model's budget; a2's by default. */
  modelMs?: number
}

// ── Responses ───────────────────────────────────────────────────────────────

const NO_STORE = { 'Cache-Control': 'no-store' }

function refuse(status: number, code: RedetectErrorCode, retryAfterSeconds?: number): Response {
  const body: RedetectResponse = retryAfterSeconds ? { ok: false, code, retryAfterSeconds } : { ok: false, code }
  const headers: Record<string, string> = { ...NO_STORE }
  if (retryAfterSeconds) headers['Retry-After'] = String(retryAfterSeconds)
  return Response.json(body, { status, headers })
}

const errorName = (err: unknown) => (err instanceof Error ? err.name : typeof err)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MODEL_UNAVAILABLE_REASONS = new Set(['missing_gemini_api_key', 'gemini_init_failed'])

/** Seconds until the next UTC midnight, when a new day's allowance starts. */
export function secondsUntilTomorrow(now: Date): number {
  const tomorrow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  return Math.max(1, Math.ceil((tomorrow - now.getTime()) / 1000))
}

// ── Reads ───────────────────────────────────────────────────────────────────

type OwnProject = { id: string; user_id: string; target_domain: string | null }

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

/** What a1 stored for the run, read as the owner; null when it stored no page (a claim, a locked store, a failure). */
async function readRunSignals(db: SupabaseClient, scope: { projectId: string; userId: string }, runId: string): Promise<SiteSignals | null | 'error'> {
  const { data, error } = await db
    .from('project_seed_steps')
    .select('detail')
    .eq('run_id', runId)
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .eq('step', 'a1')
    .maybeSingle()
  if (error) return 'error'
  const detail = (data as { detail?: unknown } | null)?.detail
  if (!detail || typeof detail !== 'object') return null
  if ((detail as { storefrontLocked?: unknown }).storefrontLocked === true) return null
  return readStoredSignals((detail as { signals?: unknown }).signals)
}

type Body = { section: RedetectSection; locale: Locale | null }

async function readBody(request: Request): Promise<Body | null> {
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
  if (Object.keys(r).some((k) => k !== 'section' && k !== 'locale')) return null
  if (!(REDETECT_SECTIONS as readonly unknown[]).includes(r.section)) return null
  const locale = r.locale === undefined ? null : normalizeLocale(r.locale)
  if (r.locale !== undefined && !locale) return null
  return { section: r.section as RedetectSection, locale }
}

// ── The allowance ───────────────────────────────────────────────────────────

/** Today's slot rows of this user, and the keys of earlier days' ones. Filtered by the owner. */
async function readSlots(admin: ServiceRoleClient, userId: string, day: string): Promise<{ today: number; stale: string[] } | 'error'> {
  const { data, error } = await admin
    .from('operation_claims')
    .select('claim_key, scope')
    .eq('user_id', userId)
    .eq('operation', OPERATION)
  if (error) return 'error'
  let today = 0
  const stale: string[] = []
  for (const row of (data as { claim_key: string; scope: string }[] | null) ?? []) {
    if (typeof row.scope !== 'string' || !row.scope.startsWith(SLOT_PREFIX)) continue
    if (row.scope.startsWith(`${SLOT_PREFIX}${day}:`)) today++
    else stale.push(row.claim_key)
  }
  return { today, stale }
}

/**
 * Take the first free slot from `from` to `cap`. A slot another request holds
 * right now is `in_progress`: that request took it, so the next one is tried.
 */
async function takeSlot(
  admin: ServiceRoleClient,
  args: { userId: string; day: string; from: number; cap: number; requestId: string },
): Promise<'taken' | 'full' | 'unavailable'> {
  for (let n = Math.max(1, args.from); n <= args.cap; n++) {
    const claim = await claimOperation(admin, {
      userId: args.userId,
      operation: OPERATION,
      scope: redetectSlotScope(args.day, n),
      requestId: args.requestId,
      ttlSeconds: SLOT_TTL_SECONDS,
    })
    if (claim.outcome === 'claimed') return 'taken'
    if (claim.outcome !== 'in_progress') return 'unavailable'
  }
  return 'full'
}

// ── Suggestions ─────────────────────────────────────────────────────────────

const present = <T extends Record<string, unknown>>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '')) as Partial<T>

/** One section's suggestions, as a2 would have stored them. */
export function suggestionsFor(section: RedetectSection, insight: StoredInsight): BusinessSuggestion | ProfileSuggestion | AudienceSuggestion {
  if (section === 'business') {
    const p = projectValues(insight.business)
    return present({ business_name: p.business_name, country: p.country, language: p.language }) as BusinessSuggestion
  }
  const p = profileValues(insight.business)
  if (section === 'profile') {
    return present({ description: p.description as string | null, commerce_type: p.commerce_type as CommerceType | null }) as ProfileSuggestion
  }
  return {
    ...(present({ niche: p.niche as string | null }) as { niche?: string }),
    is_local: p.is_local === true,
    audiences: insight.audiences,
  }
}

// ── The handler ─────────────────────────────────────────────────────────────

export async function handleRedetect(request: Request, projectId: string, deps: RedetectDeps): Promise<Response> {
  try {
    // 1. Signed in.
    let session: { userId: string | null; db: SupabaseClient }
    try {
      session = await deps.session()
    } catch {
      return refuse(503, 'unavailable')
    }
    const userId = session.userId
    if (!userId) return refuse(401, 'unauthorized')

    // 2. Their project.
    if (!UUID.test(projectId)) return refuse(404, 'not_found')
    const project = await readOwnProject(session.db, projectId, userId)
    if (project === 'error') return refuse(500, 'internal')
    if (!project) return refuse(404, 'not_found')
    const scope = { projectId: project.id, userId }

    // 3. The feature, on for them.
    let admin: ServiceRoleClient
    try {
      admin = deps.admin()
    } catch {
      return refuse(503, 'unavailable')
    }
    if (deps.env.ENABLE_SEED_SCAN !== 'true') {
      let isAdmin = false
      try {
        isAdmin = await deps.isAdmin(admin, userId)
      } catch {
        isAdmin = false
      }
      if (!isAdmin) return refuse(404, 'not_found')
    }

    // 4. A well-formed request.
    const body = await readBody(request)
    if (!body) return refuse(400, 'invalid_request')

    // 5. Entitled.
    const access = await deps.access(admin, userId)
    if (access.authority === 'unreadable') return refuse(503, 'entitlement_unavailable')
    if (!access.allowed) return refuse(403, 'entitlement_required')

    // 6. No scan running.
    const now = deps.now()
    const live = await findSeedRunInProgress(admin, scope, now)
    if (live === 'error') return refuse(500, 'internal')
    if (live) return refuse(409, 'run_in_progress')

    // 7. What the scan read, as the owner reads it.
    const run = await getLatestSeedRun(session.db, scope)
    if (run === 'error') return refuse(500, 'internal')
    const signals = run ? await readRunSignals(session.db, scope, run.id) : null
    if (signals === 'error') return refuse(500, 'internal')
    if (!run || !signals) return refuse(409, 'scan_required')

    // 8. Today's allowance.
    const cap = capFromEnv(deps.env.SETTINGS_AI_USER_DAILY_CAP, DEFAULT_REDETECT_DAILY_CAP)
    const day = utcDay(now)
    const slots = await readSlots(admin, userId, day)
    if (slots === 'error') return refuse(503, 'unavailable')
    if (slots.today >= cap) return refuse(429, 'redetect_daily_cap', secondsUntilTomorrow(now))
    if (slots.stale.length > 0) {
      // Housekeeping only: a failure here changes nothing about today.
      const { error } = await admin.from('operation_claims').delete().eq('user_id', userId).in('claim_key', slots.stale.slice(0, 100))
      if (error) console.warn('[settings-ai] earlier slots not removed', { projectId: scope.projectId })
    }

    // 9. One at a time per project.
    const requestId = deps.requestId()
    const flight = await claimOperation(admin, {
      userId,
      operation: OPERATION,
      scope: redetectFlightScope(scope.projectId),
      requestId,
      ttlSeconds: REDETECT_FLIGHT_TTL_SECONDS,
    })
    if (flight.outcome === 'in_progress') return refuse(409, 'redetect_in_progress')
    if (flight.outcome !== 'claimed') return refuse(503, 'unavailable')

    try {
      // 10. The slot, then the one call.
      const slot = await takeSlot(admin, { userId, day, from: slots.today + 1, cap, requestId })
      if (slot === 'full') return refuse(429, 'redetect_daily_cap', secondsUntilTomorrow(now))
      if (slot === 'unavailable') return refuse(503, 'unavailable')

      const summary = readSummary(run.summary)
      const locale: Locale = body.locale ?? summary?.locale ?? 'he'
      const selfDomain = summary?.domain ?? projectSiteKey(project.target_domain) ?? ''
      const answer = await settleWithin(() => deps.insight(signals, locale, selfDomain), deps.modelMs ?? STAGE_A_BUDGETS.modelMs)
      if (answer.kind !== 'value' || !answer.value || typeof answer.value !== 'object') {
        console.error('[settings-ai] model call failed', { projectId: scope.projectId, section: body.section, outcome: answer.kind })
        return refuse(502, 'model_failed')
      }
      if (!answer.value.ok) {
        const unavailable = MODEL_UNAVAILABLE_REASONS.has(answer.value.reason)
        console.error('[settings-ai] model call failed', { projectId: scope.projectId, section: body.section, outcome: unavailable ? 'unavailable' : 'refused' })
        return unavailable ? refuse(503, 'model_unavailable') : refuse(502, 'model_failed')
      }
      const insight = insightFromModel(answer.value.insight)
      if (!insight) {
        console.error('[settings-ai] model call failed', { projectId: scope.projectId, section: body.section, outcome: 'unusable' })
        return refuse(502, 'model_failed')
      }

      console.log('[settings-ai] suggested', { projectId: scope.projectId, section: body.section })
      const suggestions = suggestionsFor(body.section, insight)
      return Response.json({ ok: true, section: body.section, suggestions } as RedetectResponse, { status: 200, headers: NO_STORE })
    } finally {
      await releaseOperationClaim(admin, { userId, operation: OPERATION, scope: redetectFlightScope(scope.projectId), requestId })
    }
  } catch (err) {
    console.error('[settings-ai] failed', { projectId, error: errorName(err) })
    return refuse(500, 'internal')
  }
}
