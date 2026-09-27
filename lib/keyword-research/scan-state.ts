/**
 * What the research tab shows, decided from two answers: the seeding scan's
 * latest run (GET /api/projects/[id]/seed) and its stored research (GET
 * /api/keyword-research/scan).
 *
 *   none     no scan: the flag is off, the project predates the scan, or the run
 *            could not be read. The tab is exactly what it was before the scan.
 *   loading  the run's answer is not in yet. Also today's screen, so a merchant
 *            with no scan never sees anything else, not even for a moment.
 *   pending  there is a run; its research is on its way (a placeholder, in place).
 *   running  the research is still being found (stage A, or b2/b3 not finished)
 *            and nothing is stored yet: the site's seed keywords and a light poll.
 *   seeded   there is research to show. `running` when b2 or b3 are still going,
 *            so the screen says so and keeps polling until both are finished.
 *   empty    the scan ended with no research: a clean empty state with the form,
 *            its reason one of our own codes (never a provider's text).
 *
 * The poll is light and stops by itself: it backs off from 8 to 30 seconds, and a
 * run counts as over once b2 and b3 are terminal, once it is no longer running, or
 * once it has been stalled for a day (the cron gives up on it then).
 *
 * Pure: no React, no I/O.
 */
import type { ScanResearch, TrackedKeyword } from './scan-research'

export type SeedRunStatus = 'running' | 'done' | 'partial' | 'failed'
export type SeedStepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed'
const TERMINAL: readonly string[] = ['done', 'skipped', 'failed']

/** The run, reduced to what the tab uses. */
export interface ScanRun {
  id: string
  stage: 'a' | 'b'
  status: SeedRunStatus
  stalled: boolean
  startedAt: string | null
  steps: { step: string; status: SeedStepStatus; errorCode: string | null }[]
  seedKeywords: string[]
  domain: string | null
  storefrontLocked: boolean
}

export type SeedAnswer = { kind: 'none' } | { kind: 'run'; run: ScanRun }
export type ResearchAnswer = { kind: 'ok'; research: ScanResearch } | { kind: 'error' }

export type EmptyReason = 'not_run' | 'nothing_found' | 'market_unsupported' | 'storefront_locked' | 'unreadable'
export type ProgressStep = { step: 'b1' | 'b2' | 'b3'; state: 'pending' | 'running' | 'done' }

/** What every scan view carries: the site's seed keywords, its domain, and the project's tracked keywords. */
type Seedish = { seedKeywords: string[]; domain: string | null; tracked: TrackedKeyword[] }
export type ScanView =
  | { kind: 'loading' }
  | { kind: 'none' }
  | ({ kind: 'pending' } & Seedish)
  | ({ kind: 'running'; steps: ProgressStep[] } & Seedish)
  | ({ kind: 'seeded'; research: ScanResearch; running: boolean; steps: ProgressStep[] } & Seedish)
  | ({ kind: 'empty'; reason: EmptyReason } & Seedish)

/** The cron resumes a stalled run for a day; after that the tab stops waiting for it. */
export const STALL_GIVE_UP_MS = 24 * 60 * 60 * 1000
export const POLL_FIRST_MS = 8_000
export const POLL_MAX_MS = 30_000

const RUN_STATUSES: readonly string[] = ['running', 'done', 'partial', 'failed']
const STEP_STATUSES: readonly string[] = ['pending', 'running', 'done', 'skipped', 'failed']
const str = (v: unknown, max = 300): string | null => (typeof v === 'string' && v ? v.slice(0, max) : null)

/**
 * GET /api/projects/[id]/seed → a run, or none. Anything but a readable run is
 * "none" (the 404 of the flag or of a project that is not the caller's, a failed
 * read, a network error): the tab then stays what it was before the scan.
 */
export function readSeedAnswer(httpStatus: number, body: unknown): SeedAnswer {
  if (httpStatus !== 200 || !body || typeof body !== 'object') return { kind: 'none' }
  const b = body as { ok?: unknown; run?: unknown }
  if (b.ok !== true || !b.run || typeof b.run !== 'object') return { kind: 'none' }
  const r = b.run as Record<string, unknown>
  const id = str(r.id, 80)
  if (!id || (r.stage !== 'a' && r.stage !== 'b') || !RUN_STATUSES.includes(String(r.status))) return { kind: 'none' }
  const steps = Array.isArray(r.steps)
    ? r.steps.flatMap((s) => {
        if (!s || typeof s !== 'object') return []
        const x = s as Record<string, unknown>
        const step = str(x.step, 4)
        if (!step || !STEP_STATUSES.includes(String(x.status))) return []
        return [{ step, status: x.status as SeedStepStatus, errorCode: str(x.errorCode, 64) }]
      })
    : []
  const summary = r.summary && typeof r.summary === 'object' ? (r.summary as Record<string, unknown>) : null
  const seedKeywords = Array.isArray(summary?.seedKeywords)
    ? (summary.seedKeywords as unknown[]).filter((k): k is string => typeof k === 'string' && !!k.trim()).map((k) => k.trim().slice(0, 160)).slice(0, 5)
    : []
  return {
    kind: 'run',
    run: {
      id,
      stage: r.stage as 'a' | 'b',
      status: r.status as SeedRunStatus,
      stalled: r.stalled === true,
      startedAt: str(r.startedAt, 40),
      steps,
      seedKeywords,
      domain: str(summary?.domain, 253),
      storefrontLocked: summary?.storefrontLocked === true,
    },
  }
}

/** GET /api/keyword-research/scan → the research, or an error (never a provider's text). */
export function readResearchAnswer(httpStatus: number, body: unknown): ResearchAnswer {
  if (httpStatus !== 200 || !body || typeof body !== 'object') return { kind: 'error' }
  const b = body as Partial<ScanResearch> & { ok?: unknown }
  if (b.ok !== true || !Array.isArray(b.keywords) || !Array.isArray(b.tracked)) return { kind: 'error' }
  return {
    kind: 'ok',
    research: {
      market: b.market ?? null,
      fetchedAt: typeof b.fetchedAt === 'string' ? b.fetchedAt : null,
      keywords: b.keywords,
      truncated: b.truncated === true,
      tracked: b.tracked,
    },
  }
}

const stepStatus = (run: ScanRun, step: string): SeedStepStatus => run.steps.find((s) => s.step === step)?.status ?? 'pending'

/** b2 and b3, the steps that find the keywords, are both over. */
export function researchStepsOver(run: ScanRun): boolean {
  return run.stage === 'b' && TERMINAL.includes(stepStatus(run, 'b2')) && TERMINAL.includes(stepStatus(run, 'b3'))
}

/** The research may still change: worth waiting and polling for. */
export function researchRunning(run: ScanRun, now: Date): boolean {
  if (run.status !== 'running') return false
  if (run.stalled) {
    const started = Date.parse(run.startedAt ?? '')
    if (!Number.isFinite(started) || now.getTime() - started > STALL_GIVE_UP_MS) return false
  }
  return !researchStepsOver(run)
}

export function progressSteps(run: ScanRun): ProgressStep[] {
  return (['b1', 'b2', 'b3'] as const).map((step) => {
    const status = run.stage === 'b' ? stepStatus(run, step) : 'pending'
    return { step, state: status === 'running' ? 'running' : TERMINAL.includes(status) ? 'done' : 'pending' }
  })
}

/** Why a finished run left no research, as one of our codes. */
export function emptyReason(run: ScanRun): EmptyReason {
  const b2 = run.steps.find((s) => s.step === 'b2')
  if (run.storefrontLocked || b2?.errorCode === 'storefront_locked') return 'storefront_locked'
  if (b2?.errorCode === 'market_unsupported') return 'market_unsupported'
  if (run.stage === 'a' || !b2 || !TERMINAL.includes(b2.status)) return 'not_run'
  return 'nothing_found'
}

export function scanView(seed: SeedAnswer | null, research: ResearchAnswer | null, now: Date): ScanView {
  if (!seed) return { kind: 'loading' }
  if (seed.kind === 'none') return { kind: 'none' }
  const run = seed.run
  const base: Seedish = { seedKeywords: run.seedKeywords, domain: run.domain, tracked: research?.kind === 'ok' ? research.research.tracked : [] }
  const running = researchRunning(run, now)
  if (research?.kind === 'ok' && research.research.keywords.length > 0) {
    return { kind: 'seeded', research: research.research, running, steps: progressSteps(run), ...base }
  }
  if (running) return { kind: 'running', steps: progressSteps(run), ...base }
  if (!research) return { kind: 'pending', ...base }
  if (research.kind === 'error') return { kind: 'empty', reason: 'unreadable', ...base }
  return { kind: 'empty', reason: emptyReason(run), ...base }
}

/** The wait before the next look at a running scan: 8s, then 1.5x, at most 30s. */
export function pollDelayMs(attempt: number): number {
  return Math.min(POLL_MAX_MS, Math.round(POLL_FIRST_MS * 1.5 ** Math.max(0, attempt)))
}

const terminalCount = (run: ScanRun) => ['b2', 'b3'].filter((s) => TERMINAL.includes(stepStatus(run, s))).length

/** The stored research may have changed between two looks at the run: read it again. */
export function researchChanged(prev: ScanRun | null, next: ScanRun, now: Date): boolean {
  if (!prev || prev.id !== next.id) return true
  if (terminalCount(next) > terminalCount(prev)) return true
  return researchRunning(prev, now) && !researchRunning(next, now)
}
