/**
 * THE AUTOMATIC MONTHLY AI CHECK (owner approval 2026-09-29, UX review section B).
 *
 * The only automatic caller of runAIVisibilityScan. Everything else that calls a
 * provider is a click. Three entry points share one plan (planMonthlyCheck):
 *
 *   runMonthlyAiChecks     the 06:00 schedule cron (app/api/schedule), in its own
 *                          isolated after() task, bounded by a deadline
 *   runMonthlyCheckNow     "הרצה עכשיו" on the AI tab, when a month was skipped
 *   readMonthlyCheckStatus what the AI tab's hero says (next date, used by it)
 *
 * THE RULES, each one skip reason below:
 *   - once per usage period, due MONTHLY_AI_CHECK.startAfterDays after the
 *     period starts; the cron keeps trying for windowDays (a retry, a batch the
 *     deadline cut short), never after the period ends;
 *   - only an account the EXISTING entitlement logic calls an active
 *     subscription (getUserEntitlement, unchanged): no trial, no past_due, no
 *     lapsed plan, and no admin account (admins are not metered);
 *   - the project's setting is on (projects.ai_auto_check_enabled, default on);
 *   - someone signed in to the account in the last inactiveAfterDays (cron only);
 *   - the project tracks at least one AI question;
 *   - a question on an engine checked in the last recentPairDays is left out;
 *   - the allowance: every check is reserved with reserve_usage('ai_check') for
 *     the SAME period and the SAME limit the manual route uses, less
 *     keepLastChecks, so the ledger itself refuses the check that would take one
 *     of the last two. It runs as many checks as fit, never one more.
 *
 * NEVER TWICE. Each check has its own idempotency key (config.scheduledKey:
 * project, period, question, engine). The plan skips a key that already exists
 * in any state but "released before dispatch", and reserve_usage takes an
 * advisory lock on the key, so a second cron invocation, a retry or "run now"
 * beside the cron gets already_reserved / already_consumed and dispatches
 * nothing. A reservation left `reserved` by a crash is never redone: it may have
 * reached the provider.
 *
 * NEVER A RAW PROVIDER ERROR. Errors are stored the way the manual route stores
 * them (the tab words them); logs carry codes and counts only.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import type { AIProviderInput, AIProviderResult } from '@/lib/ai-visibility/providers/types'
import { getUserEntitlement, type UserEntitlement } from '@/lib/subscription'
import { isEntitlementUnknown } from '@/lib/quota'
import { resolveCurrentUsagePeriod, type UsagePeriod } from '@/lib/billing/usage-period'
import { reserveUsage, finalizeUsageReservation, releaseUsageReservation } from '@/lib/billing/usage-reservations'
import { isPlanCode } from '@/lib/plans/catalog'
import { runAIVisibilityScan } from '@/lib/ai-visibility'
import { isDomainMatch } from '@/lib/ai-visibility/matching/domain-normalize'
import { resolveBusinessIdentity, type ScanBusiness } from '@/lib/ai-visibility/business-identity'
import { scoreQuestion, type WorthContext } from '@/lib/ai-visibility/question-worth'
import type { ManualAIProfile } from '@/lib/ai-visibility/prompt-templates'
import {
  MONTHLY_AI_CHECK, MONTHLY_DAY_MS, SCHEDULED_KEY_PREFIX, cronTickAtOrAfter, monthlyDueAt, monthlyEngines,
  monthlyQuestionCount, parseScheduledKey, scheduledKey,
} from './config'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = ServiceRoleClient | any

/** A release that proves nothing reached the provider: the only state a key may be retried from. */
export const NOT_DISPATCHED_REASON = 'monthly_not_dispatched'
/** One provider call's own limit; a question's engines run side by side inside it. */
export const MONTHLY_CALL_TIMEOUT_MS = 60_000
/** Time kept free before the deadline for the last writes and the log line. */
export const MONTHLY_MARGIN_MS = 15_000
/** Projects looked at per cron invocation; the rest wait for the next day. */
export const MAX_PROJECTS_PER_TICK = 500
/** Reservation lease in reserve_usage: an older `reserved` row holds nothing. */
const LEASE_MS = 30 * 60 * 1000

export type MonthlyDeps = {
  now?: () => Date
  /** The provider call. Default: runAIVisibilityScan. */
  scan?: (input: AIProviderInput) => Promise<AIProviderResult>
  /** The account's last sign-in, or 'unreadable'. Default: auth.admin.getUserById. */
  lastSignInAt?: (admin: Admin, userId: string) => Promise<string | null | 'unreadable'>
}

export type ProjectRow = {
  id: string
  user_id: string
  name?: string | null
  target_domain?: string | null
  business_name?: string | null
  country?: string | null
  is_active?: boolean | null
  ai_business_profile?: unknown
}

export type SkipReason =
  | 'setting_off' | 'admin' | 'no_active_subscription' | 'entitlement_unavailable' | 'no_period'
  | 'not_due' | 'window_closed' | 'inactive' | 'login_unreadable' | 'no_questions'
  | 'nothing_due' | 'allowance_low' | 'error'

export type MonthlyPair = { promptId: string; prompt: string; engine: string; key: string }

type KeyState = { status: string; releaseReason: string | null; consumedAt: string | null; consumed: number }

export type MonthlyPlan =
  | { ok: false; reason: SkipReason }
  | {
      ok: true
      entitlement: UserEntitlement
      period: UsagePeriod
      dueAt: Date
      windowEndAt: Date
      /** When the next period's check is due (this period's end + startAfterDays). */
      nextPeriodDueAt: Date
      engines: string[]
      questionCount: number
      /** The plan's X, as the manual route reads it. */
      limit: number
      used: number
      remaining: number
      /** What the automatic check may still take: remaining − keepLastChecks. */
      budget: number
      /** Checks the automatic check consumed this period (whole account, as `used`). */
      autoUsed: number
      lastAutoAt: string | null
      /** Due checks before the budget cut; `pairs` is what fits. */
      pairsDue: number
      pairs: MonthlyPair[]
    }

const ms = (v: string | null | undefined) => { const n = Date.parse(v ?? ''); return Number.isFinite(n) ? n : NaN }

/** The allowance ledger's own count (reserve_usage and lib/billing/usage-allowance.ts count the same way). */
export function ledgerUsed(rows: Array<{ status?: string | null; reserved_amount?: number | null; consumed_amount?: number | null; reserved_at?: string | null }>, nowMs: number): number {
  let used = 0
  for (const r of rows) {
    if (r.status === 'consumed' || r.status === 'partially_consumed') used += Number(r.consumed_amount ?? 0)
    else if (r.status === 'reserved') {
      const at = ms(r.reserved_at)
      if (Number.isFinite(at) && nowMs - at < LEASE_MS) used += Number(r.reserved_amount ?? 0)
    }
  }
  return used
}

/** The project's setting. A database without the column (migration not applied) reads as ON, the default. */
export async function readAutoCheckSetting(admin: Admin, projectId: string, userId: string): Promise<boolean> {
  try {
    const { data, error } = await admin.from('projects').select('id, ai_auto_check_enabled')
      .eq('id', projectId).eq('user_id', userId).maybeSingle()
    if (error || !data) return true
    return (data as { ai_auto_check_enabled?: boolean | null }).ai_auto_check_enabled !== false
  } catch {
    return true
  }
}

async function defaultLastSignInAt(admin: Admin, userId: string): Promise<string | null | 'unreadable'> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (error || !data?.user) return 'unreadable'
    return (data.user.last_sign_in_at as string | null | undefined) ?? null
  } catch {
    return 'unreadable'
  }
}

/** Whether the account signed in recently enough for the cron to spend on it. */
export function isRecentlyActive(lastSignInAt: string | null, now: Date): boolean {
  const at = ms(lastSignInAt)
  return Number.isFinite(at) && now.getTime() - at < MONTHLY_AI_CHECK.inactiveAfterDays * MONTHLY_DAY_MS
}

/** What question-worth.ts scores against, read on the server (the tab builds the same context in the browser). */
async function readWorthContext(admin: Admin, project: ProjectRow): Promise<WorthContext> {
  const scope = { projectId: project.id, userId: project.user_id }
  const safe = async <T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> => {
    try { const r = await p; return r.error ? null : r.data } catch { return null }
  }
  const [targets, profile, topics] = await Promise.all([
    safe<Array<{ keyword: string | null }>>(admin.from('tracking_targets').select('keyword').eq('project_id', scope.projectId).limit(500)),
    safe<{ niche?: string | null; description?: string | null }>(admin.from('project_profiles').select('niche, description')
      .eq('project_id', scope.projectId).eq('user_id', scope.userId).maybeSingle()),
    safe<Array<{ topic: string | null }>>(admin.from('article_topics').select('topic')
      .eq('project_id', scope.projectId).eq('user_id', scope.userId).limit(300)),
  ])
  const keywords = (targets ?? []).map((t) => (t.keyword ?? '').trim()).filter(Boolean)
  const scan: ScanBusiness | null = profile && (profile.niche || profile.description)
    ? { niche: profile.niche ?? null, description: profile.description ?? null } : null
  const identity = resolveBusinessIdentity({
    manualProfile: (project.ai_business_profile ?? null) as ManualAIProfile | null,
    scan, businessName: project.business_name, domain: project.target_domain, keywords,
  })
  return {
    businessName: project.business_name ?? null,
    identityLabel: identity.label,
    category: identity.category,
    keywords,
    plannedTopics: (topics ?? []).map((t) => (t.topic ?? '').trim()).filter(Boolean),
  }
}

/**
 * THE SAME QUESTIONS EVERY PERIOD. Questions this period already started with
 * come first, then the ones earlier periods checked automatically (newest
 * first), and only the free places are filled by worth (question-worth.ts,
 * consumed as is), then age. A question leaves the set only when it is deleted
 * or paused.
 */
export function selectMonthlyQuestions(
  prompts: Array<{ id: string; prompt: string; created_at?: string | null }>,
  stickyIds: readonly string[],
  count: number,
  worth: (prompt: string) => number,
): Array<{ id: string; prompt: string }> {
  if (count <= 0) return []
  const byId = new Map(prompts.map((p) => [p.id, p]))
  const chosen: Array<{ id: string; prompt: string }> = []
  for (const id of stickyIds) {
    const p = byId.get(id)
    if (p && !chosen.some((c) => c.id === id)) chosen.push({ id: p.id, prompt: p.prompt })
    if (chosen.length >= count) return chosen
  }
  const rest = prompts
    .filter((p) => !chosen.some((c) => c.id === p.id))
    .map((p) => ({ p, score: worth(p.prompt), at: ms(p.created_at) }))
    .sort((a, b) => b.score - a.score || (a.at || 0) - (b.at || 0) || a.p.id.localeCompare(b.p.id))
  for (const { p } of rest) {
    if (chosen.length >= count) break
    chosen.push({ id: p.id, prompt: p.prompt })
  }
  return chosen
}

/** Everything a decision needs, read once. Writes nothing and calls no provider. */
export async function planMonthlyCheck(admin: Admin, project: ProjectRow, opts: { now: Date; cache?: Map<string, unknown> }): Promise<MonthlyPlan> {
  const { now } = opts
  const userId = project.user_id
  if (!(await readAutoCheckSetting(admin, project.id, userId))) return { ok: false, reason: 'setting_off' }

  const nowFn = () => now
  // The existing entitlement logic, unchanged. Cached per account for one cron run.
  const cacheKey = `ent:${userId}`
  const cached = opts.cache?.get(cacheKey) as { entitlement: UserEntitlement; period: UsagePeriod | null } | undefined
  const entitlement = cached?.entitlement ?? await getUserEntitlement(userId, admin, nowFn)
  if (isEntitlementUnknown(entitlement.plan)) return { ok: false, reason: 'entitlement_unavailable' }
  if (entitlement.isAdmin) return { ok: false, reason: 'admin' }
  if (!entitlement.hasActiveSubscription || !isPlanCode(entitlement.plan)) return { ok: false, reason: 'no_active_subscription' }
  // A subscription whose own period start is empty is resolved by the shared
  // resolver's fallbacks (legacy calendar month, PayPal end minus a month); a
  // period it cannot resolve at all is skipped, never guessed.
  const period = cached ? cached.period : await resolveCurrentUsagePeriod(admin, userId, nowFn)
  opts.cache?.set(cacheKey, { entitlement, period })
  if (!period || !Number.isFinite(period.start.getTime()) || !Number.isFinite(period.end.getTime()) || period.end <= period.start) {
    return { ok: false, reason: 'no_period' }
  }

  const { data: promptRows, error: promptError } = await admin.from('ai_prompts')
    .select('id, prompt, created_at').eq('project_id', project.id).eq('is_active', true)
    .order('created_at', { ascending: true }).limit(500)
  if (promptError) return { ok: false, reason: 'error' }
  const prompts = ((promptRows ?? []) as Array<{ id: string; prompt: string | null; created_at?: string | null }>)
    .filter((p) => typeof p.prompt === 'string' && p.prompt.trim())
    .map((p) => ({ id: p.id, prompt: p.prompt as string, created_at: p.created_at ?? null }))
  if (prompts.length === 0) return { ok: false, reason: 'no_questions' }

  const limit = entitlement.limits.maxAIScansPerPeriodPerProject
  const engines = monthlyEngines(project.country)
  const questionCount = monthlyQuestionCount(entitlement.plan, limit, engines.length)
  const dueAt = monthlyDueAt(period.start)
  const windowEndAt = new Date(Math.min(dueAt.getTime() + MONTHLY_AI_CHECK.windowDays * MONTHLY_DAY_MS, period.end.getTime()))
  const nextPeriodDueAt = monthlyDueAt(period.end)

  // The ledger for this period: what the allowance counts, and every automatic key.
  const { data: ledgerRows, error: ledgerError } = await admin.from('usage_reservations')
    .select('status, reserved_amount, consumed_amount, reserved_at, consumed_at, release_reason, idempotency_key, project_id, created_at')
    .eq('user_id', userId).eq('usage_type', 'ai_check').eq('period_start', period.start.toISOString())
  if (ledgerError) return { ok: false, reason: 'error' }
  const rows = (ledgerRows ?? []) as Array<Record<string, unknown>>
  const used = ledgerUsed(rows as never, now.getTime())
  const remaining = Math.max(0, limit - used)
  const budget = Math.max(0, remaining - MONTHLY_AI_CHECK.keepLastChecks)
  let autoUsed = 0
  let lastAutoAt: string | null = null
  const thisPeriodKeys = new Map<string, KeyState>()
  const startedThisPeriod: string[] = []
  for (const r of rows) {
    const key = typeof r.idempotency_key === 'string' ? r.idempotency_key : ''
    if (!key.startsWith(SCHEDULED_KEY_PREFIX)) continue
    const status = String(r.status ?? '')
    if (status === 'consumed' || status === 'partially_consumed') {
      // The meter is the account's ledger (as the allowance counts it), so this is too.
      autoUsed += Number(r.consumed_amount ?? 0)
    }
    const parsed = parseScheduledKey(key)
    if (!parsed || parsed.projectId !== project.id) continue
    // "Ran this period" is this project's own check only.
    if (status === 'consumed' || status === 'partially_consumed') {
      const at = typeof r.consumed_at === 'string' ? r.consumed_at : null
      if (at && (!lastAutoAt || at > lastAutoAt)) lastAutoAt = at
    }
    thisPeriodKeys.set(key, { status, releaseReason: (r.release_reason as string | null) ?? null, consumedAt: (r.consumed_at as string | null) ?? null, consumed: Number(r.consumed_amount ?? 0) })
    if (!startedThisPeriod.includes(parsed.promptId)) startedThisPeriod.push(parsed.promptId)
  }

  // Questions earlier periods checked automatically, newest first (owner and project filtered).
  const { data: pastRows } = await admin.from('usage_reservations')
    .select('idempotency_key, created_at').eq('user_id', userId).eq('project_id', project.id)
    .like('idempotency_key', `${SCHEDULED_KEY_PREFIX}%`).order('created_at', { ascending: false }).limit(300)
  const sticky = [...startedThisPeriod]
  for (const r of (pastRows ?? []) as Array<{ idempotency_key?: string | null }>) {
    const parsed = parseScheduledKey(r.idempotency_key)
    if (parsed && parsed.projectId === project.id && !sticky.includes(parsed.promptId)) sticky.push(parsed.promptId)
  }

  const needsWorth = sticky.filter((id) => prompts.some((p) => p.id === id)).length < questionCount
  const worthCtx = needsWorth ? await readWorthContext(admin, project) : null
  const selected = selectMonthlyQuestions(prompts, sticky, questionCount,
    (text) => (worthCtx ? scoreQuestion(text, 'informational', worthCtx).score : 0))

  // Checked in the last recentPairDays (manually or automatically): not again.
  const recent = new Set<string>()
  if (selected.length > 0) {
    const since = new Date(now.getTime() - MONTHLY_AI_CHECK.recentPairDays * MONTHLY_DAY_MS).toISOString()
    const { data: recentRows, error: recentError } = await admin.from('ai_scan_results')
      .select('prompt_id, engine, status, scanned_at').eq('project_id', project.id)
      .in('prompt_id', selected.map((s) => s.id)).eq('status', 'success').gte('scanned_at', since)
    if (recentError) return { ok: false, reason: 'error' }
    for (const r of (recentRows ?? []) as Array<{ prompt_id: string; engine: string }>) recent.add(`${r.prompt_id}:${r.engine}`)
  }

  const due: MonthlyPair[] = []
  for (const q of selected) {
    for (const engine of engines) {
      if (recent.has(`${q.id}:${engine}`)) continue
      const key = scheduledKey(project.id, period.start, q.id, engine)
      const existing = thisPeriodKeys.get(key)
      // Any state but "released before dispatch" means it ran, runs, or may have reached the provider.
      if (existing && !(existing.status === 'released' && existing.releaseReason === NOT_DISPATCHED_REASON)) continue
      due.push({ promptId: q.id, prompt: q.prompt, engine, key })
    }
  }

  return {
    ok: true, entitlement, period, dueAt, windowEndAt, nextPeriodDueAt, engines, questionCount,
    limit, used, remaining, budget, autoUsed, lastAutoAt, pairsDue: due.length, pairs: due.slice(0, budget),
  }
}

export type DispatchOutcome = 'dispatched' | 'dispatched_error' | 'duplicate' | 'quota' | 'not_dispatched' | 'error'

/**
 * One check: reserve (the manual route's reserve_usage, limit X − keepLastChecks),
 * record the run, call the provider, consume exactly what was dispatched, keep
 * the answer. Never throws.
 */
export async function dispatchMonthlyPair(
  admin: Admin,
  args: { project: ProjectRow; pair: MonthlyPair; period: UsagePeriod; limit: number; scan: NonNullable<MonthlyDeps['scan']>; now: () => Date },
): Promise<DispatchOutcome> {
  const { project, pair, period } = args
  const userId = project.user_id
  const reservation = await reserveUsage(admin, {
    userId, projectId: project.id, usageType: 'ai_check', amount: 1,
    periodStart: period.start, periodEnd: period.end,
    limit: Math.max(0, args.limit - MONTHLY_AI_CHECK.keepLastChecks),
    idempotencyKey: pair.key,
  })
  if (reservation.outcome === 'quota_exceeded') return 'quota'
  if (reservation.outcome === 'already_reserved' || reservation.outcome === 'already_consumed') return 'duplicate'
  if (reservation.outcome !== 'reserved') return 'error'
  const { reservationId, reservationToken } = reservation
  const release = (reason: string) => releaseUsageReservation(admin, { reservationId, userId, reservationToken, reason }).catch(() => null)

  let runId: string | null = null
  try {
    const { data: run, error: runError } = await admin.from('ai_scan_runs').insert({
      project_id: project.id, user_id: userId, provider: 'scrapellm', status: 'running',
      triggered_by: 'scheduled', total_prompts: 1, total_engines: 1, total_tasks: 1,
      completed_tasks: 0, failed_tasks: 0, total_credits_used: 0, started_at: args.now().toISOString(),
    }).select().single()
    if (runError || !run) { await release(NOT_DISPATCHED_REASON); return 'not_dispatched' }
    runId = (run as { id: string }).id
  } catch {
    await release(NOT_DISPATCHED_REASON)
    return 'not_dispatched'
  }

  let result: AIProviderResult
  try {
    result = await args.scan({
      engine: pair.engine, prompt: pair.prompt, country: project.country || undefined,
      targetDomain: project.target_domain ?? null, targetBrandName: project.business_name ?? null,
      timeout: MONTHLY_CALL_TIMEOUT_MS,
    })
  } catch {
    // A throw is not proof the provider ran (the manual route releases too), but
    // it may have: the key is released with a reason that is never retried.
    await release('provider_threw')
    await admin.from('ai_scan_runs').update({ status: 'failed', failed_tasks: 1, completed_at: args.now().toISOString(), error_message: 'provider_threw' }).eq('id', runId)
    return 'error'
  }

  // Dispatched: consumed whatever the outcome, exactly like a manual check.
  await finalizeUsageReservation(admin, { reservationId, userId, reservationToken, consumed: 1, relatedRef: runId, reason: null })

  const scannedAt = args.now().toISOString()
  try {
    if (result.error) {
      await admin.from('ai_scan_results').insert({
        run_id: runId, project_id: project.id, prompt_id: pair.promptId, engine: pair.engine, provider: 'scrapellm',
        mentioned: false, target_cited: false, citation_count: 0, source_count: 0, credits_used: 0,
        status: 'error', error_message: result.error, scanned_at: scannedAt,
      })
      await admin.from('ai_scan_runs').update({ status: 'failed', completed_tasks: 0, failed_tasks: 1, completed_at: scannedAt, error_message: result.error }).eq('id', runId)
      return 'dispatched_error'
    }
    const creditsUsed = typeof result.creditsUsed === 'number' ? result.creditsUsed : 0
    const { data: resultRow } = await admin.from('ai_scan_results').insert({
      run_id: runId, project_id: project.id, prompt_id: pair.promptId, engine: pair.engine, provider: 'scrapellm',
      mentioned: result.mentionedInText, target_cited: result.targetCitedInSources,
      mention_positions: result.mentionedPositions ?? null, citation_count: result.citationCount,
      source_count: result.sourceCount, response_text: result.responseText || null,
      response_summary: result.responseSummary || null, raw_response: (result.rawResponse as Record<string, unknown>) ?? null,
      credits_used: creditsUsed, status: 'success', scanned_at: scannedAt,
    }).select('id').single()
    const resultId = (resultRow as { id?: string } | null)?.id
    if (resultId && result.citations.length > 0) {
      await admin.from('ai_citations').insert(result.citations.map((c) => ({
        result_id: resultId, project_id: project.id, prompt_id: pair.promptId, engine: pair.engine, provider: 'scrapellm',
        url: c.url, domain: c.domain, title: c.title ?? null, snippet: c.snippet ?? null, citation_position: c.position ?? null,
        is_target_domain: project.target_domain ? isDomainMatch(c.url, project.target_domain) : false,
      })))
    }
    await admin.from('ai_scan_runs').update({
      status: resultId ? 'completed' : 'failed', completed_tasks: resultId ? 1 : 0, failed_tasks: resultId ? 0 : 1,
      total_credits_used: creditsUsed, completed_at: args.now().toISOString(),
    }).eq('id', runId)
    return 'dispatched'
  } catch {
    return 'dispatched_error'
  }
}

export type RunCounts = { dispatched: number; failed: number; duplicate: number; stoppedBy: 'deadline' | 'allowance' | null }

/** A project's due checks, one question at a time (its engines side by side), until the deadline. */
export async function executeMonthlyPlan(
  admin: Admin,
  project: ProjectRow,
  plan: Extract<MonthlyPlan, { ok: true }>,
  opts: { deadlineAt: number; nowMs?: () => number; scan: NonNullable<MonthlyDeps['scan']>; now: () => Date },
): Promise<RunCounts> {
  const nowMs = opts.nowMs ?? Date.now
  const counts: RunCounts = { dispatched: 0, failed: 0, duplicate: 0, stoppedBy: null }
  const groups = new Map<string, MonthlyPair[]>()
  for (const pair of plan.pairs) groups.set(pair.promptId, [...(groups.get(pair.promptId) ?? []), pair])
  for (const group of groups.values()) {
    if (nowMs() + MONTHLY_CALL_TIMEOUT_MS + MONTHLY_MARGIN_MS > opts.deadlineAt) { counts.stoppedBy = 'deadline'; break }
    const outcomes = await Promise.all(group.map((pair) => dispatchMonthlyPair(admin, {
      project, pair, period: plan.period, limit: plan.limit, scan: opts.scan, now: opts.now,
    }).catch((): DispatchOutcome => 'error')))
    for (const o of outcomes) {
      if (o === 'dispatched') counts.dispatched++
      else if (o === 'dispatched_error') { counts.dispatched++; counts.failed++ }
      else if (o === 'duplicate') counts.duplicate++
      else if (o === 'quota') counts.stoppedBy = 'allowance'
      else counts.failed++
    }
    if (counts.stoppedBy === 'allowance') break
  }
  return counts
}

async function defaultScan(input: AIProviderInput): Promise<AIProviderResult> {
  return runAIVisibilityScan(input)
}

export type CronSummary = {
  looked: number
  ran: number
  dispatched: number
  failed: number
  duplicate: number
  skipped: Partial<Record<SkipReason, number>>
  stoppedBy: 'deadline' | null
}

/**
 * The cron's part: every active project once, cheapest checks first, until the
 * deadline. Never throws; a failed project is counted and the loop goes on.
 */
export async function runMonthlyAiChecks(admin: Admin, opts: { deadlineAt: number; deps?: MonthlyDeps; maxProjects?: number }): Promise<CronSummary> {
  const now = opts.deps?.now ?? (() => new Date())
  const scan = opts.deps?.scan ?? defaultScan
  const lastSignIn = opts.deps?.lastSignInAt ?? defaultLastSignInAt
  const summary: CronSummary = { looked: 0, ran: 0, dispatched: 0, failed: 0, duplicate: 0, skipped: {}, stoppedBy: null }
  const skip = (r: SkipReason) => { summary.skipped[r] = (summary.skipped[r] ?? 0) + 1 }
  let projects: ProjectRow[] = []
  try {
    const { data, error } = await admin.from('projects')
      .select('id, user_id, name, target_domain, business_name, country, is_active, ai_business_profile')
      .eq('is_active', true).order('created_at', { ascending: true }).limit(opts.maxProjects ?? MAX_PROJECTS_PER_TICK)
    if (error) throw new Error('projects_unreadable')
    projects = (data ?? []) as ProjectRow[]
  } catch {
    console.error('[ai-monthly] projects unreadable')
    return summary
  }
  const cache = new Map<string, unknown>()
  const logins = new Map<string, string | null | 'unreadable'>()
  for (const project of projects) {
    if (Date.now() + MONTHLY_MARGIN_MS > opts.deadlineAt) { summary.stoppedBy = 'deadline'; break }
    summary.looked++
    try {
      if (!project.user_id) { skip('error'); continue }
      const at = now()
      const plan = await planMonthlyCheck(admin, project, { now: at, cache })
      if (!plan.ok) { skip(plan.reason); continue }
      if (at < plan.dueAt) { skip('not_due'); continue }
      if (at >= plan.windowEndAt) { skip('window_closed'); continue }
      if (plan.pairsDue === 0) { skip('nothing_due'); continue }
      if (plan.pairs.length === 0) { skip('allowance_low'); continue }
      if (!logins.has(project.user_id)) logins.set(project.user_id, await lastSignIn(admin, project.user_id))
      const login = logins.get(project.user_id) ?? null
      if (login === 'unreadable') { skip('login_unreadable'); continue }
      if (!isRecentlyActive(login, at)) { skip('inactive'); continue }
      const counts = await executeMonthlyPlan(admin, project, plan, { deadlineAt: opts.deadlineAt, scan, now })
      summary.ran++
      summary.dispatched += counts.dispatched
      summary.failed += counts.failed
      summary.duplicate += counts.duplicate
      if (counts.stoppedBy === 'deadline') { summary.stoppedBy = 'deadline'; break }
    } catch {
      skip('error')
    }
  }
  if (summary.ran > 0 || summary.failed > 0 || summary.stoppedBy) {
    console.log('[ai-monthly] run', { looked: summary.looked, ran: summary.ran, dispatched: summary.dispatched, failed: summary.failed, duplicate: summary.duplicate, stoppedBy: summary.stoppedBy, skipped: summary.skipped })
  }
  return summary
}

/**
 * ISOLATED FROM THE RANK SCHEDULE. Runs `task` with its own deadline (what is
 * left of the cron's maxDuration, less a margin), inside its own try/catch.
 * Resolves whatever happens; never throws or rejects, so the schedule route's
 * rank work, its answer and its logs cannot be changed by it.
 */
export async function startIsolatedMonthlyAiChecks(
  task: (deadlineAt: number) => Promise<unknown>,
  window: { startedAtMs: number; maxDurationMs: number; marginMs?: number; nowMs?: () => number; env?: Record<string, string | undefined> },
): Promise<void> {
  try {
    const env = window.env ?? process.env
    if (env.ENABLE_AI_VISIBILITY !== 'true' || env.DISABLE_AI_MONTHLY_CHECK === 'true') return
    const deadlineAt = window.startedAtMs + window.maxDurationMs - (window.marginMs ?? MONTHLY_MARGIN_MS)
    if ((window.nowMs ?? Date.now)() + MONTHLY_MARGIN_MS >= deadlineAt) return
    await task(deadlineAt)
  } catch {
    console.error('[ai-monthly] run failed')
  }
}

/** "הרצה עכשיו": the owner is here, so no inactivity or window rule; everything else as the cron. */
export async function runMonthlyCheckNow(
  admin: Admin,
  project: ProjectRow,
  opts: { deadlineAt: number; deps?: MonthlyDeps },
): Promise<{ ok: true; counts: RunCounts } | { ok: false; reason: SkipReason }> {
  const now = opts.deps?.now ?? (() => new Date())
  const at = now()
  const plan = await planMonthlyCheck(admin, project, { now: at })
  if (!plan.ok) return plan
  if (at < plan.dueAt) return { ok: false, reason: 'not_due' }
  if (plan.pairsDue === 0) return { ok: false, reason: 'nothing_due' }
  if (plan.pairs.length === 0) return { ok: false, reason: 'allowance_low' }
  const counts = await executeMonthlyPlan(admin, project, plan, { deadlineAt: opts.deadlineAt, scan: opts.deps?.scan ?? defaultScan, now })
  return { ok: true, counts }
}

export type MonthlyStatus =
  | { state: 'not_included' }
  | { state: 'unavailable' }
  | {
      state: 'off' | 'no_questions' | 'scheduled' | 'done' | 'skipped' | 'allowance_low'
      engines: string[]
      /** Checks the next (or this, when skipped) automatic run would take. */
      checks: number
      nextAt: string | null
      lastAt: string | null
      skippedBecause: 'inactive' | 'missed' | null
      limit: number
      used: number
      autoUsed: number
      left: number
    }

/** What the AI tab says about the automatic check. Reads only. */
export async function readMonthlyCheckStatus(admin: Admin, project: ProjectRow, deps?: MonthlyDeps): Promise<MonthlyStatus> {
  const at = (deps?.now ?? (() => new Date()))()
  const plan = await planMonthlyCheck(admin, project, { now: at })
  if (!plan.ok) {
    if (plan.reason === 'admin' || plan.reason === 'no_active_subscription') return { state: 'not_included' }
    if (plan.reason === 'entitlement_unavailable' || plan.reason === 'no_period' || plan.reason === 'error') return { state: 'unavailable' }
    // 'setting_off' and 'no_questions' still show the meter: read it without the plan's early exit.
    const base = await readMeterOnly(admin, project, at)
    if (!base) return { state: 'unavailable' }
    return { state: plan.reason === 'setting_off' ? 'off' : 'no_questions', ...base, checks: 0, lastAt: null, skippedBecause: null }
  }
  const meter = { engines: plan.engines, limit: plan.limit, used: plan.used, autoUsed: plan.autoUsed, left: plan.remaining }
  const tickAfter = (d: Date) => cronTickAtOrAfter(d).toISOString()
  const ranThisPeriod = plan.lastAutoAt !== null
  const checks = plan.pairs.length
  if (plan.pairsDue > 0 && checks === 0) return { state: 'allowance_low', ...meter, checks: 0, nextAt: tickAfter(plan.nextPeriodDueAt), lastAt: plan.lastAutoAt, skippedBecause: null }
  if (at < plan.dueAt) return { state: 'scheduled', ...meter, checks: plan.questionCount * plan.engines.length, nextAt: tickAfter(plan.dueAt), lastAt: plan.lastAutoAt, skippedBecause: null }
  if (checks === 0) return { state: 'done', ...meter, checks: 0, nextAt: tickAfter(plan.nextPeriodDueAt), lastAt: plan.lastAutoAt, skippedBecause: null }
  // Due checks remain. Before the window closes and with a recent sign-in, the next cron run takes them.
  const login = await (deps?.lastSignInAt ?? defaultLastSignInAt)(admin, project.user_id)
  const active = login !== 'unreadable' && isRecentlyActive(login, at)
  if (at < plan.windowEndAt && (active || login === 'unreadable')) {
    return { state: 'scheduled', ...meter, checks, nextAt: tickAfter(at), lastAt: plan.lastAutoAt, skippedBecause: null }
  }
  return {
    state: 'skipped', ...meter, checks, nextAt: tickAfter(plan.nextPeriodDueAt), lastAt: plan.lastAutoAt,
    skippedBecause: !active && !ranThisPeriod ? 'inactive' : 'missed',
  }
}

async function readMeterOnly(admin: Admin, project: ProjectRow, at: Date) {
  try {
    const entitlement = await getUserEntitlement(project.user_id, admin, () => at)
    const period = await resolveCurrentUsagePeriod(admin, project.user_id, () => at)
    if (!period) return null
    const { data, error } = await admin.from('usage_reservations')
      .select('status, reserved_amount, consumed_amount, reserved_at, idempotency_key')
      .eq('user_id', project.user_id).eq('usage_type', 'ai_check').eq('period_start', period.start.toISOString())
    if (error) return null
    const rows = (data ?? []) as Array<Record<string, unknown>>
    const limit = entitlement.limits.maxAIScansPerPeriodPerProject
    const used = ledgerUsed(rows as never, at.getTime())
    const autoUsed = rows.filter((r) => String(r.idempotency_key ?? '').startsWith(SCHEDULED_KEY_PREFIX)
      && (r.status === 'consumed' || r.status === 'partially_consumed')).reduce((s, r) => s + Number(r.consumed_amount ?? 0), 0)
    return { engines: monthlyEngines(project.country), limit, used, autoUsed, left: Math.max(0, limit - used), nextAt: cronTickAtOrAfter(monthlyDueAt(period.end)).toISOString() }
  } catch {
    return null
  }
}
