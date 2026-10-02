/**
 * What the dashboard makes of the project's seeding scan (GET
 * /api/projects/[id]/seed): whether there is one at all, "what's holding you
 * back" (widget 13) and the scan's lines in the activity feed (widget 10).
 *
 * Pure. The answer's findings are our own copy, stored in the language the scan
 * ran in; they are re-read here BY ID in the language the merchant is looking
 * at, so an English dashboard never shows a Hebrew finding. Nothing a provider
 * said ever reaches this module: the run carries stable codes only, and none of
 * them is shown as text.
 */
import { freeCheckCopy } from '@/lib/free-check/copy'
import type { Locale } from '@/lib/i18n/locales'
import type { SeedRunView, SeedStep, SeedStepView, SeedSummary } from '@/lib/seed-scan/types'

/**
 * No scan at all: the feature is off (the route answers 404), the project is
 * older than the scan, or the read failed. The dashboard then shows no scan
 * widget, and never an error about a scan that never existed.
 */
export type SeedState =
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'run'; run: SeedRunView; phase: SeedPhase }

/** stage_a: the summary is still being built. ready: stage A finished and stage B has not begun. */
export type SeedPhase = 'stage_a' | 'ready' | 'stage_b' | 'done' | 'failed'

export function seedPhase(run: SeedRunView): SeedPhase {
  if (run.status === 'failed') return 'failed'
  if (run.status === 'running') return run.stage === 'b' ? 'stage_b' : 'stage_a'
  return run.stage === 'b' ? 'done' : 'ready'
}

/** The seed route's answer → the state. 404 (off, or not theirs) and any failure are "none". */
export function seedStateFrom(httpStatus: number, body: unknown): SeedState {
  if (httpStatus !== 200 || !body || typeof body !== 'object') return { kind: 'none' }
  const b = body as { ok?: unknown; run?: unknown }
  if (b.ok !== true || !b.run || typeof b.run !== 'object') return { kind: 'none' }
  const run = b.run as SeedRunView
  if (!Array.isArray(run.steps)) return { kind: 'none' }
  return { kind: 'run', run, phase: seedPhase(run) }
}

/** Stage B still working: the dashboard asks again until it is not. */
export function seedStillRunning(state: SeedState): boolean {
  return state.kind === 'run' && (state.phase === 'stage_a' || state.phase === 'stage_b')
}

// ── What's holding you back ─────────────────────────────────────────────────

export const GEO_CHECK_IDS = ['schema', 'faq', 'robots', 'llms'] as const
export type GeoCheckId = (typeof GEO_CHECK_IDS)[number]

export interface HoldingFinding { id: string; severity: 'blocker' | 'warning' | 'info'; title: string; why: string }
/** ok: passed; null: not checked (a locked store, or not measurable) — never a failure. */
export interface GeoCheck { id: GeoCheckId; ok: boolean | null }

export type HoldingBack =
  | { state: 'pending' }
  /** Stage A could not measure the site. */
  | { state: 'failed' }
  /** A password-locked store: nothing was checked, and nothing is reported as failing. */
  | { state: 'locked'; checks: GeoCheck[] }
  | { state: 'ready'; findings: HoldingFinding[]; hidden: number; checks: GeoCheck[]; passed: number; total: number; scannedAt: string | null }

export const FINDINGS_SHOWN = 5

const step = (run: SeedRunView, id: SeedStep): SeedStepView | undefined => run.steps.find((s) => s.step === id)

function isLocked(summary: SeedSummary | null, a3: SeedStepView | undefined): boolean {
  const lockedSummary = !!summary && (summary.storefrontLocked || summary.geo.unavailableReason === 'storefront_locked')
  return lockedSummary || a3?.errorCode === 'storefront_locked'
}

export function holdingBack(run: SeedRunView, locale: Locale): HoldingBack {
  const summary = run.summary
  const a3 = step(run, 'a3')
  const notChecked = GEO_CHECK_IDS.map((id) => ({ id, ok: null }))
  if (isLocked(summary, a3)) return { state: 'locked', checks: notChecked }
  if (a3?.status === 'done' && summary) {
    const copy = freeCheckCopy(locale)
    const findings: HoldingFinding[] = []
    let dropped = 0
    for (const f of summary.findings) {
      const text = copy.findings[f.id]
      // Our own copy, by id, in the merchant's language. A finding we have no copy
      // for is only shown in the language it was written in; otherwise it is counted.
      if (text) findings.push({ id: f.id, severity: f.severity, title: text.title, why: text.detail })
      else if (summary.locale === locale && f.title) findings.push({ id: f.id, severity: f.severity, title: f.title, why: f.detail })
      else dropped++
    }
    const measured = summary.geo.state === 'measured'
    const checks: GeoCheck[] = GEO_CHECK_IDS.map((id) => {
      const signal = measured ? summary.geo.signals.find((s) => s.id === id) : undefined
      return { id, ok: signal ? signal.ok : null }
    })
    const counted = checks.filter((c) => c.ok !== null)
    return {
      state: 'ready',
      findings: findings.slice(0, FINDINGS_SHOWN),
      hidden: Math.max(0, findings.length - FINDINGS_SHOWN) + dropped + summary.findingsOmitted,
      checks,
      passed: counted.filter((c) => c.ok).length,
      total: counted.length,
      scannedAt: summary.scannedAt,
    }
  }
  const stillRunning = run.status === 'running' && (!a3 || a3.status === 'pending' || a3.status === 'running')
  return stillRunning ? { state: 'pending' } : { state: 'failed' }
}

// ── The scan's lines in the activity feed ───────────────────────────────────

export interface SeedFeedLine {
  step: SeedStep
  status: 'done' | 'running' | 'failed'
  count: number | null
  /** finishedAt for a finished step, startedAt for one still running. */
  at: string | null
}

/**
 * Every step that has something to say: each finished step with its count, the
 * step running now, and a step that did not complete. Skipped steps (a stage the
 * site did not need) and steps not reached yet say nothing; the number still
 * waiting is `pending`.
 */
export function seedFeed(run: SeedRunView): { lines: SeedFeedLine[]; pending: number } {
  const lines: SeedFeedLine[] = []
  let pending = 0
  for (const s of run.steps) {
    if (s.status === 'done') lines.push({ step: s.step, status: 'done', count: s.itemCount, at: s.finishedAt ?? s.startedAt })
    else if (s.status === 'running') lines.push({ step: s.step, status: 'running', count: null, at: s.startedAt })
    else if (s.status === 'failed') lines.push({ step: s.step, status: 'failed', count: null, at: s.finishedAt ?? s.startedAt })
    else if (s.status === 'pending' && run.status === 'running') pending++
  }
  return { lines, pending }
}
