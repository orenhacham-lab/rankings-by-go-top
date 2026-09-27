/**
 * The AI-visibility tab's overview, as pure functions over data the tab already
 * reads. Nothing here fetches, and nothing here can spend: the page hands in
 * the answer of GET /api/projects/[id]/seed (the seeding scan) and the runs the
 * tool itself loaded from GET /api/ai-visibility/runs, and gets back what each
 * row of the tab shows.
 *
 *   row 1  status bar       engines checked, the last check, the next one
 *   row 2  opening card     visibility score, mentions, citations, change
 *   row 4  recent activity  the latest checks and what came of each
 *   row 5  AI readiness     the scan's four checks (SeedGeo)
 *
 * THE SAME NUMBERS AS THE TOOL. The score is the tool's own: the share of
 * successful answers, archived ones left out, whose display classification
 * mentions the business (AIVisibilitySection.loadAllResults). A second
 * definition on the same screen would show two different scores.
 *
 * NO SCAN, NO CHANGE. A project without a seed run (the scan's flag off, or a
 * project older than the scan) gets `kind: 'none'`, and the page renders
 * today's tool exactly as it was.
 */
import type { SeedGeo, SeedRunView } from '@/lib/seed-scan/types'

/** The engines the tool checks, in its order (AIVisibilitySection SUPPORTED_ENGINES). */
export const OVERVIEW_ENGINES = ['chatgpt', 'perplexity', 'gemini', 'copilot', 'grok', 'google_ai_mode'] as const

/** The four readiness checks, in the scan's order (lib/free-check buildGeoSignals). */
export const READINESS_CHECK_IDS = ['schema', 'faq', 'robots', 'llms'] as const
export type ReadinessCheckId = (typeof READINESS_CHECK_IDS)[number]

/** How many checks "recent activity" lists. */
export const RECENT_LIMIT = 5

// ── The seeding scan, as the page needs it ──────────────────────────────────

export type SeedPageState =
  | { kind: 'loading' }
  /** No seed run: the flag is off, the project predates the scan, or it could not be read. */
  | { kind: 'none' }
  | {
      /**
       * seeded             the scan finished (done or partial)
       * questions_pending  still running, and its AI questions (b5) are not in yet
       * failed             the run failed
       */
      kind: 'seeded' | 'questions_pending' | 'failed'
      geo: SeedGeo | null
      scannedAt: string | null
      storefrontLocked: boolean
      /** Competitor domains the scan validated against real search results. */
      scanCompetitors: string[]
      /** Questions b5 suggested, when it ran; null when it did not (yet). */
      questionsSuggested: number | null
    }

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * The page's state from the seed GET. `status` is the HTTP status, `body` its
 * JSON (null when unreadable). Anything but a 200 with a run is `none`: a 404
 * is the flag being off, and any other failure must leave the tool as it was
 * rather than show a half-built overview.
 */
export function readSeedState(status: number | null, body: unknown): SeedPageState {
  if (status !== 200 || !isRecord(body) || body.ok !== true || !isRecord(body.run)) return { kind: 'none' }
  const run = body.run as unknown as SeedRunView
  const steps = Array.isArray(run.steps) ? run.steps : []
  const b5 = steps.find((s) => s && s.step === 'b5')
  const summary = isRecord(run.summary) ? run.summary : null

  let kind: 'seeded' | 'questions_pending' | 'failed'
  if (run.status === 'failed') kind = 'failed'
  else if (run.status === 'running') {
    // Stage A still running, or stage B before b5 settled: the questions are coming.
    const b5Settled = !!b5 && (b5.status === 'done' || b5.status === 'skipped' || b5.status === 'failed')
    kind = run.stage === 'b' && b5Settled ? 'seeded' : 'questions_pending'
  } else kind = 'seeded'

  const geo = summary && isRecord(summary.geo) ? (summary.geo as unknown as SeedGeo) : null
  const competitors: unknown[] = summary && Array.isArray(summary.competitors) ? summary.competitors : []
  return {
    kind,
    geo,
    scannedAt: summary && typeof summary.scannedAt === 'string' ? summary.scannedAt : null,
    storefrontLocked: !!summary && summary.storefrontLocked === true,
    scanCompetitors: competitors
      .filter((c): c is { domain: string; validated: boolean } => isRecord(c) && typeof c.domain === 'string' && c.validated === true)
      .map((c) => c.domain),
    questionsSuggested: b5 && b5.status === 'done' && typeof b5.itemCount === 'number' ? b5.itemCount : null,
  }
}

/** Whether the page should read the seed run again, because the questions are still coming. */
export function shouldPollSeed(state: SeedPageState): boolean {
  return state.kind === 'questions_pending'
}

// ── Readiness (row 5) ───────────────────────────────────────────────────────

export type ReadinessRowStatus = 'pass' | 'fail' | 'not_checked' | 'pending'
export type ReadinessView = {
  /**
   * measured  the four checks ran on the site itself
   * locked    a Shopify store behind its password page: not checked, never failed
   * pending   the scan has not reached them yet
   * missing   the run ended without measuring them
   */
  state: 'measured' | 'locked' | 'pending' | 'missing'
  rows: { id: ReadinessCheckId; status: ReadinessRowStatus }[]
  passed: number
  total: number
}

export function readinessView(state: SeedPageState): ReadinessView | null {
  if (state.kind === 'none' || state.kind === 'loading') return null
  const geo = state.geo
  const locked = state.storefrontLocked || (geo?.state === 'unavailable' && geo.unavailableReason === 'storefront_locked')
  const all = (status: ReadinessRowStatus) => READINESS_CHECK_IDS.map((id) => ({ id, status }))
  // A locked storefront shows its password page, not the store: nothing was measured.
  if (locked) return { state: 'locked', rows: all('not_checked'), passed: 0, total: READINESS_CHECK_IDS.length }
  if (geo?.state === 'measured' && Array.isArray(geo.signals)) {
    const rows = READINESS_CHECK_IDS.map((id) => {
      const signal = geo.signals.find((s) => s && s.id === id)
      return { id, status: (signal ? (signal.ok ? 'pass' : 'fail') : 'not_checked') as ReadinessRowStatus }
    })
    return { state: 'measured', rows, passed: rows.filter((r) => r.status === 'pass').length, total: rows.length }
  }
  if (state.kind === 'questions_pending' && (!geo || geo.state === 'pending')) {
    return { state: 'pending', rows: all('pending'), passed: 0, total: READINESS_CHECK_IDS.length }
  }
  return { state: 'missing', rows: all('not_checked'), passed: 0, total: READINESS_CHECK_IDS.length }
}

// ── The checks (rows 1, 2 and 4) ────────────────────────────────────────────

export type OverviewResult = {
  engine: string
  status: string | null
  displayMentioned: boolean
  displayCited: boolean
  excludedFromScore: boolean
  promptText: string | null
}
export type OverviewRun = {
  id: string
  status: string | null
  createdAt: string | null
  completedAt: string | null
  results: OverviewResult[]
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)

/** The runs of GET /api/ai-visibility/runs, read defensively; anything malformed is dropped. */
export function readRuns(raw: unknown): OverviewRun[] {
  if (!Array.isArray(raw)) return []
  const out: OverviewRun[] = []
  for (const r of raw) {
    if (!isRecord(r) || !str(r.id)) continue
    const results = Array.isArray(r.results) ? r.results : []
    out.push({
      id: r.id as string,
      status: str(r.status),
      createdAt: str(r.createdAt),
      completedAt: str(r.completedAt),
      results: results.filter(isRecord).map((x) => ({
        engine: str(x.engine) ?? '',
        status: str(x.status),
        // The display classification, exactly as the tool counts it; the raw DB
        // flag only for an older payload without it.
        displayMentioned: typeof x.displayMentioned === 'boolean' ? x.displayMentioned : x.mentioned === true,
        displayCited: typeof x.displayCited === 'boolean' ? x.displayCited : x.targetCited === true,
        excludedFromScore: x.excludedFromScore === true,
        promptText: str(x.promptText),
      })),
    })
  }
  return out
}

const runTime = (r: OverviewRun) => Date.parse(r.completedAt ?? r.createdAt ?? '') || 0

export type RecentOutcome = 'cited' | 'mentioned' | 'not_mentioned' | 'failed' | 'running'
export type RecentItem = { id: string; at: string | null; engine: string | null; question: string | null; outcome: RecentOutcome }

export type AiOverview = {
  /** Engines with at least one successful answer, in the tool's order. */
  enginesChecked: string[]
  lastCheckAt: string | null
  /** A check was dispatched and has not finished. */
  running: boolean
  /** Successful answers that count toward the score. */
  answers: number
  mentions: number
  citations: number
  /** 0-100; null before the first successful answer. */
  score: number | null
  /** Score points against the score before the latest check; null without an earlier one. */
  change: { points: number; since: string | null } | null
  recent: RecentItem[]
  /**
   * The score as it stood after each check that produced a counted answer,
   * oldest first, the last TREND_POINTS of them. Its last point is `score`.
   */
  trend: { at: string | null; score: number }[]
}

/** How many checks the score trend shows. */
export const TREND_POINTS = 12

type Tally = { answers: number; mentions: number; citations: number }

function tally(runs: OverviewRun[]): Tally {
  const t: Tally = { answers: 0, mentions: 0, citations: 0 }
  for (const run of runs) {
    for (const r of run.results) {
      if (r.status !== 'success' || r.excludedFromScore) continue
      // As the tool counts: every successful answer is in the denominator, and
      // mentions and citations come from the engines it supports.
      t.answers++
      if (!(OVERVIEW_ENGINES as readonly string[]).includes(r.engine)) continue
      if (r.displayMentioned) t.mentions++
      if (r.displayCited) t.citations++
    }
  }
  return t
}

const scoreOf = (t: Tally) => (t.answers > 0 ? Math.round((t.mentions / t.answers) * 100) : null)

function outcomeOf(run: OverviewRun): RecentOutcome {
  if (run.status === 'pending' || run.status === 'running') return 'running'
  const ok = run.results.filter((r) => r.status === 'success')
  if (ok.length === 0) return 'failed'
  if (ok.some((r) => r.displayCited)) return 'cited'
  if (ok.some((r) => r.displayMentioned)) return 'mentioned'
  return 'not_mentioned'
}

export function buildOverview(runs: OverviewRun[]): AiOverview {
  const newest = [...runs].sort((a, b) => runTime(b) - runTime(a))
  const engines = new Set<string>()
  for (const run of runs) for (const r of run.results) if (r.status === 'success') engines.add(r.engine)

  const now = tally(newest)
  const score = scoreOf(now)

  // The previous check: the score without the newest check that produced a
  // counted answer. With nothing before it there is no change to show.
  let change: AiOverview['change'] = null
  const latestCountedIndex = newest.findIndex((run) => tally([run]).answers > 0)
  if (latestCountedIndex >= 0 && score !== null) {
    const before = newest.slice(latestCountedIndex + 1)
    const beforeScore = scoreOf(tally(before))
    if (beforeScore !== null) {
      const previous = before.find((run) => tally([run]).answers > 0) ?? null
      change = { points: score - beforeScore, since: previous ? previous.completedAt ?? previous.createdAt : null }
    }
  }

  const trend: AiOverview['trend'] = []
  const running: Tally = { answers: 0, mentions: 0, citations: 0 }
  for (const run of [...newest].reverse()) {
    const t = tally([run])
    if (t.answers === 0) continue
    running.answers += t.answers
    running.mentions += t.mentions
    running.citations += t.citations
    trend.push({ at: run.completedAt ?? run.createdAt, score: scoreOf(running) ?? 0 })
  }

  const finished = newest.find((r) => r.status !== 'pending' && r.status !== 'running') ?? null
  return {
    trend: trend.slice(-TREND_POINTS),
    enginesChecked: OVERVIEW_ENGINES.filter((e) => engines.has(e)),
    lastCheckAt: finished ? finished.completedAt ?? finished.createdAt : null,
    running: newest.some((r) => r.status === 'pending' || r.status === 'running'),
    answers: now.answers,
    mentions: now.mentions,
    citations: now.citations,
    score,
    change,
    recent: newest.slice(0, RECENT_LIMIT).map((run) => ({
      id: run.id,
      at: run.completedAt ?? run.createdAt,
      engine: run.results[0]?.engine || null,
      question: run.results.find((r) => r.promptText)?.promptText ?? null,
      outcome: outcomeOf(run),
    })),
  }
}

/** Where competitors are added and removed now: the settings screen's section. */
export function competitorsSettingsHref(projectId: string): string {
  return `/settings?projectId=${encodeURIComponent(projectId)}#competitors`
}

/** Settings, where the site is rescanned (which refreshes the readiness checks). */
export function settingsHref(projectId: string): string {
  return `/settings?projectId=${encodeURIComponent(projectId)}`
}
