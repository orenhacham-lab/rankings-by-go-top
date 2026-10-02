/**
 * Who may start a research before sign-up, and what it may cost. Every
 * decision FAILS CLOSED: a count that cannot be read refuses the run, and so
 * does a missing table (Production is not migrated), which the route answers
 * as "not available" and the screen turns into the short free check.
 *
 * One research costs one model call and up to five searches (lib/presignup
 * run.ts counts them), so it is gated harder than the free check:
 *
 *   1. per visitor   research runs by this hashed client in the last hour,
 *                    at most PRESIGNUP_RESEARCH_CLIENT_HOURLY_CAP (default 3);
 *                    replays count too, refused ones do not. At most one of
 *                    theirs in flight at a time.
 *   2. cache         a finished research of this domain in this language from
 *                    the last 24h is replayed from the ledger: no spend.
 *   3. per day       runs that may have spent (running, done, failed) since
 *                    midnight UTC, all visitors together, at most
 *                    PRESIGNUP_RESEARCH_DAILY_CAP (default 50).
 *
 * RESERVE, THEN COUNT. A run's row is inserted first and the caps are counted
 * after, including it, so two requests racing for the last slot both see each
 * other and both refuse; neither can slip past a cap. A refused row is marked
 * so and stops counting.
 *
 * The rows have no owner: the service role reads them, and every query is
 * scoped by the narrow key it is about (this client, this domain, today, this
 * row's id). The client key is the free check's own salted hash
 * (lib/free-check/store.ts hashClient); no address is stored or logged.
 */
import { capFromEnv } from '@/lib/seed-scan/http'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import type { Locale } from '@/lib/i18n/locales'
import type { ResearchSpend } from './run'

export const RESEARCH_RUNS_TABLE = 'free_check_research_runs'
export const RESEARCH_CLIENT_WINDOW_MS = 60 * 60 * 1000
export const DEFAULT_RESEARCH_CLIENT_CAP = 3
export const DEFAULT_RESEARCH_DAILY_CAP = 50
/** A run older than this no longer counts as "in flight" (the route's own limit is far below it). */
export const RESEARCH_IN_FLIGHT_MS = 5 * 60 * 1000
/** A finished research is replayed for this long: the free check's own cache window. */
export const RESEARCH_CACHE_MS = 24 * 60 * 60 * 1000

export type ResearchRunStatus = 'running' | 'done' | 'failed' | 'replayed' | 'refused'
/** The statuses of a run that may have spent money. */
const SPENDING: ResearchRunStatus[] = ['running', 'done', 'failed']

export type Admission =
  | { kind: 'run'; runId: string }
  | { kind: 'replay'; runId: string; checkId: string; seed: unknown }
  | { kind: 'refused'; code: 'rate_limited' | 'daily_cap' | 'unavailable' }

const utcDayStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

async function countClient(admin: ServiceRoleClient, clientHash: string, since: Date): Promise<number | null> {
  const { count, error } = await admin
    .from(RESEARCH_RUNS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('client_hash', clientHash)
    .neq('status', 'refused')
    .gt('created_at', since.toISOString())
  return error ? null : (count ?? 0)
}

async function countInFlight(admin: ServiceRoleClient, clientHash: string, since: Date): Promise<number | null> {
  const { count, error } = await admin
    .from(RESEARCH_RUNS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('client_hash', clientHash)
    .eq('status', 'running')
    .gt('created_at', since.toISOString())
  return error ? null : (count ?? 0)
}

async function countSpendingToday(admin: ServiceRoleClient, now: Date): Promise<number | null> {
  const { count, error } = await admin
    .from(RESEARCH_RUNS_TABLE)
    .select('id', { count: 'exact', head: true })
    .in('status', SPENDING)
    .gt('created_at', utcDayStart(now).toISOString())
  return error ? null : (count ?? 0)
}

/** The newest finished research of this domain in this language inside the cache window, with its ledger row's seed. */
async function findCached(
  admin: ServiceRoleClient,
  domain: string,
  locale: Locale,
  now: Date,
): Promise<{ checkId: string; seed: unknown } | null | 'error'> {
  const runs = await admin
    .from(RESEARCH_RUNS_TABLE)
    .select('check_id, created_at')
    .eq('domain', domain)
    .eq('locale', locale)
    .eq('status', 'done')
    .not('check_id', 'is', null)
    .gt('created_at', new Date(now.getTime() - RESEARCH_CACHE_MS).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
  if (runs.error) return 'error'
  const checkId = (runs.data as { check_id: string | null }[] | null)?.[0]?.check_id
  if (!checkId) return null
  const row = await admin.from('free_site_checks').select('id, domain, seed').eq('id', checkId).eq('domain', domain).limit(1)
  if (row.error) return 'error'
  const found = (row.data as { id: string; seed: unknown }[] | null)?.[0]
  return found ? { checkId: found.id, seed: found.seed } : null
}

async function insertRun(
  admin: ServiceRoleClient,
  row: { clientHash: string; domain: string; locale: Locale; status: 'running' | 'replayed'; checkId?: string; now: Date },
): Promise<string | null> {
  const { data, error } = await admin
    .from(RESEARCH_RUNS_TABLE)
    .insert({
      client_hash: row.clientHash,
      domain: row.domain,
      locale: row.locale,
      status: row.status,
      check_id: row.checkId ?? null,
      created_at: row.now.toISOString(),
      finished_at: row.status === 'replayed' ? row.now.toISOString() : null,
    })
    .select('id')
  if (error) return null
  return (data as { id: string }[] | null)?.[0]?.id ?? null
}

async function markRefused(admin: ServiceRoleClient, runId: string, now: Date): Promise<void> {
  try {
    await admin.from(RESEARCH_RUNS_TABLE).update({ status: 'refused', finished_at: now.toISOString() }).eq('id', runId).eq('status', 'running')
  } catch {
    /* best effort: a row left 'running' only counts against its own visitor, and ages out */
  }
}

export async function admitResearch(args: {
  admin: ServiceRoleClient
  clientHash: string
  domain: string
  locale: Locale
  now: Date
  env: Record<string, string | undefined>
}): Promise<Admission> {
  const { admin, clientHash, now } = args
  const unavailable: Admission = { kind: 'refused', code: 'unavailable' }
  const clientCap = capFromEnv(args.env.PRESIGNUP_RESEARCH_CLIENT_HOURLY_CAP, DEFAULT_RESEARCH_CLIENT_CAP)
  const dailyCap = capFromEnv(args.env.PRESIGNUP_RESEARCH_DAILY_CAP, DEFAULT_RESEARCH_DAILY_CAP)
  const windowStart = new Date(now.getTime() - RESEARCH_CLIENT_WINDOW_MS)

  // 1. The visitor's own allowance, first, so an abuser cannot even warm the cache.
  const before = await countClient(admin, clientHash, windowStart)
  if (before === null) return unavailable
  if (before >= clientCap) return { kind: 'refused', code: 'rate_limited' }

  // 2. A research of this site from the last day: replayed, nothing spent.
  const cached = await findCached(admin, args.domain, args.locale, now)
  if (cached === 'error') return unavailable
  if (cached) {
    const runId = await insertRun(admin, { clientHash, domain: args.domain, locale: args.locale, status: 'replayed', checkId: cached.checkId, now })
    if (!runId) return unavailable
    return { kind: 'replay', runId, checkId: cached.checkId, seed: cached.seed }
  }

  // 3. Reserve, then count with the reservation in: a race cannot pass a cap.
  const runId = await insertRun(admin, { clientHash, domain: args.domain, locale: args.locale, status: 'running', now })
  if (!runId) return unavailable
  const mine = await countClient(admin, clientHash, windowStart)
  const inFlight = await countInFlight(admin, clientHash, new Date(now.getTime() - RESEARCH_IN_FLIGHT_MS))
  if (mine === null || inFlight === null) {
    await markRefused(admin, runId, now)
    return unavailable
  }
  if (mine > clientCap || inFlight > 1) {
    await markRefused(admin, runId, now)
    return { kind: 'refused', code: 'rate_limited' }
  }
  const everyone = await countSpendingToday(admin, now)
  if (everyone === null) {
    await markRefused(admin, runId, now)
    return unavailable
  }
  if (everyone > dailyCap) {
    await markRefused(admin, runId, now)
    return { kind: 'refused', code: 'daily_cap' }
  }
  return { kind: 'run', runId }
}

/** Close a run this request reserved: how it ended, its ledger row, what it spent. Fenced on the row still running. */
export async function finishResearchRun(
  admin: ServiceRoleClient,
  runId: string,
  outcome: { status: 'done' | 'failed'; checkId: string | null; spend: ResearchSpend; errorCode: string | null; now: Date },
): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from(RESEARCH_RUNS_TABLE)
      .update({
        status: outcome.status,
        check_id: outcome.checkId,
        model_calls: outcome.spend.modelCalls,
        searches: outcome.spend.searches,
        error_code: outcome.errorCode && /^[a-z0-9_]{1,64}$/.test(outcome.errorCode) ? outcome.errorCode : null,
        finished_at: outcome.now.toISOString(),
      })
      .eq('id', runId)
      .eq('status', 'running')
      .select('id')
    return !error && ((data as unknown[] | null)?.length ?? 0) === 1
  } catch {
    return false
  }
}
