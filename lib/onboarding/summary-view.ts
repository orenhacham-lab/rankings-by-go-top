/**
 * What the progress screen and the research summary show, derived from the run
 * as GET /api/projects/[id]/seed returns it. Pure, so every rule is under test
 * (lib/onboarding/__qa__/summary-view.qa.ts) and the components only render.
 *
 * Two rules matter more than the rest:
 *   - A password-locked store is NOT CHECKED, never failing. When stage A could
 *     not measure the site (geo.state 'unavailable' with the reason
 *     'storefront_locked'), the AI-readiness block and its tile read "not
 *     checked: the store is password protected", and the site findings do not
 *     claim the site is clean. No 0/4 anywhere.
 *   - A site whose firewall refused our reader is NOT CHECKED either. Stage A
 *     then built the research from Google's index of the site (siteAccess
 *     'search_index'): the business, keywords and topics are there, but
 *     nothing that needs the site itself was measured, so the findings and
 *     the AI-readiness block read "not checked: the site blocks automated
 *     reads", never "clean" and never 0/4.
 *   - Nothing is invented. A keyword's "why" states a property of the phrase
 *     itself (a question, a local search, the business's own name...), and a
 *     block with nothing in it says so instead of guessing.
 */
import type { FreeCheckFinding, GeoSignal } from '@/lib/free-check/types'
import {
  MAX_CONTINUE_KEYWORDS,
  STAGE_STEPS,
  TERMINAL_STEP_STATUSES,
  type SeedBusiness,
  type SeedCompetitor,
  type SeedRunView,
  type SeedStep,
  type SeedStepStatus,
  type SeedSummary,
} from '@/lib/seed-scan/types'

// ── The run ─────────────────────────────────────────────────────────────────

export type RunPhase = 'none' | 'progress' | 'stalled' | 'failed' | 'summary' | 'started'

export type StageAStep = 'a1' | 'a2' | 'a3' | 'a4'
/** Stage A's four steps, in order, typed as exactly those four. */
export const STAGE_A_STEPS = STAGE_STEPS.a as readonly StageAStep[]

/** Which screen a run calls for. A stage-B run keeps its summary, with "Start" already pressed. */
export function runPhase(run: SeedRunView | null): RunPhase {
  if (!run) return 'none'
  if (run.stage === 'b') return 'started'
  if (run.status === 'running') return run.stalled ? 'stalled' : 'progress'
  if (run.status === 'failed') return 'failed'
  return 'summary'
}

export function stepStatusOf(run: SeedRunView | null, step: SeedStep): SeedStepStatus | null {
  return run?.steps.find((s) => s.step === step)?.status ?? null
}

const isTerminal = (status: SeedStepStatus | null) => !!status && TERMINAL_STEP_STATUSES.includes(status)

/** The stage-A step working now: the running one, else the first not finished; null once all four are. */
export function activeStep(run: SeedRunView | null): StageAStep | null {
  if (!run) return STAGE_A_STEPS[0]
  const running = STAGE_A_STEPS.find((step) => stepStatusOf(run, step) === 'running')
  if (running) return running
  return STAGE_A_STEPS.find((step) => !isTerminal(stepStatusOf(run, step))) ?? null
}

/** How many of stage A's four steps have finished, whatever their outcome. */
export function finishedSteps(run: SeedRunView | null): number {
  return STAGE_A_STEPS.filter((step) => isTerminal(stepStatusOf(run, step))).length
}

/** The code a failed stage A ended with: the run's own, else its first failed step's. */
export function failureCode(run: SeedRunView | null): string | null {
  if (!run) return null
  return run.errorCode ?? run.steps.find((s) => s.status === 'failed')?.errorCode ?? null
}

// ── Blocks ──────────────────────────────────────────────────────────────────

/** A locked storefront, however stage A recorded it. */
export function storefrontLocked(summary: SeedSummary): boolean {
  return (summary.geo.state === 'unavailable' && summary.geo.unavailableReason === 'storefront_locked') || summary.storefrontLocked
}

/** The research was built from Google's index because the site's firewall refused our reader. */
export function siteFirewalled(summary: SeedSummary): boolean {
  return summary.siteAccess === 'search_index' || (summary.geo.state === 'unavailable' && summary.geo.unavailableReason === 'site_firewall')
}

export type GeoView =
  | { kind: 'measured'; passed: number; total: number; signals: GeoSignal[] }
  | { kind: 'locked' }
  | { kind: 'firewall' }
  | { kind: 'notChecked' }
  | { kind: 'pending' }
  | { kind: 'failed' }

export function geoView(summary: SeedSummary, a3: SeedStepStatus | null): GeoView {
  const geo = summary.geo
  if (storefrontLocked(summary) && geo.state !== 'measured') return { kind: 'locked' }
  if (siteFirewalled(summary) && geo.state !== 'measured') return { kind: 'firewall' }
  if (geo.state === 'unavailable') return { kind: 'notChecked' }
  if (geo.state === 'pending') return a3 === 'failed' ? { kind: 'failed' } : { kind: 'pending' }
  if (geo.total <= 0 || geo.signals.length === 0) return { kind: 'notChecked' }
  return { kind: 'measured', passed: Math.min(geo.passed, geo.total), total: geo.total, signals: geo.signals }
}

export type FindingsView =
  | { kind: 'list'; findings: FreeCheckFinding[]; omitted: number }
  | { kind: 'clean' }
  | { kind: 'locked' }
  | { kind: 'firewall' }
  | { kind: 'failed' }
  | { kind: 'pending' }

const SEVERITY_ORDER: Record<string, number> = { blocker: 0, warning: 1, info: 2 }

export function findingsView(summary: SeedSummary, a3: SeedStepStatus | null): FindingsView {
  if (storefrontLocked(summary)) return { kind: 'locked' }
  if (siteFirewalled(summary)) return { kind: 'firewall' }
  if (a3 === 'failed') return { kind: 'failed' }
  if (!isTerminal(a3)) return { kind: 'pending' }
  const findings = summary.findings.slice().sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3))
  if (findings.length === 0 && summary.findingsOmitted === 0) return { kind: 'clean' }
  return { kind: 'list', findings, omitted: summary.findingsOmitted }
}

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral'
export type TileId = 'keywords' | 'fixes' | 'geo' | 'articles'
export type TileView = { id: TileId; value: string | null; state: 'value' | 'notChecked' | 'pending'; tone: Tone }

/** The four tiles of block 2, each with its coloured status dot. */
export function tilesView(summary: SeedSummary, run: SeedRunView | null): TileView[] {
  const a3 = stepStatusOf(run, 'a3')
  const keywords = summary.seedKeywords.length
  const articles = summary.topics.length

  const findings = findingsView(summary, a3)
  let fixes: TileView
  if (findings.kind === 'clean') fixes = { id: 'fixes', value: '0', state: 'value', tone: 'ok' }
  else if (findings.kind === 'list') {
    const blocker = findings.findings.some((f) => f.severity === 'blocker')
    fixes = { id: 'fixes', value: String(findings.findings.length + findings.omitted), state: 'value', tone: blocker ? 'bad' : 'warn' }
  } else fixes = { id: 'fixes', value: null, state: findings.kind === 'pending' ? 'pending' : 'notChecked', tone: 'neutral' }

  const geo = geoView(summary, a3)
  let geoTile: TileView
  if (geo.kind === 'measured') {
    const tone: Tone = geo.passed >= geo.total ? 'ok' : geo.passed === 0 ? 'bad' : 'warn'
    geoTile = { id: 'geo', value: `${geo.passed}/${geo.total}`, state: 'value', tone }
  } else geoTile = { id: 'geo', value: null, state: geo.kind === 'pending' ? 'pending' : 'notChecked', tone: 'neutral' }

  return [
    { id: 'keywords', value: String(keywords), state: 'value', tone: keywords > 0 ? 'ok' : 'neutral' },
    fixes,
    geoTile,
    { id: 'articles', value: String(articles), state: 'value', tone: articles > 0 ? 'ok' : 'neutral' },
  ]
}

/** Competitors seen in real search results first, the most-seen first; the analysis's suggestions after. */
export function orderedCompetitors(summary: SeedSummary): SeedCompetitor[] {
  return summary.competitors
    .slice()
    .sort((a, b) => Number(b.validated) - Number(a.validated) || b.seenIn - a.seenIn)
}

// ── Keywords ────────────────────────────────────────────────────────────────

/** The keywords "Start" tracks unless unchecked: the run's seed keywords, at most what continue accepts. */
export function initialSelection(seedKeywords: readonly string[]): string[] {
  return seedKeywords.slice(0, MAX_CONTINUE_KEYWORDS)
}

export const KEYWORD_REASONS = ['brand', 'question', 'local', 'buying', 'niche', 'specific', 'core'] as const
export type KeywordReason = (typeof KEYWORD_REASONS)[number]

/** Hebrew attaches one-letter prefixes (the, and, in, to, from, that, as) to a word. */
const HEBREW_PREFIX = /^[הובלמשכ](?=[א-ת]{2,})/

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/** A token and, for Hebrew, the same word without its one-letter prefix. */
function forms(token: string): string[] {
  const bare = token.replace(HEBREW_PREFIX, '')
  return bare !== token ? [token, bare] : [token]
}

const QUESTION_WORDS = new Set([
  'how', 'what', 'why', 'which', 'where', 'when', 'who', 'can', 'is', 'are', 'do', 'does', 'should',
  'איך', 'מה', 'למה', 'מדוע', 'מתי', 'איפה', 'היכן', 'האם', 'כמה', 'איזה', 'איזו', 'אילו', 'מי',
])
const LOCAL_WORDS = new Set(['near', 'nearby', 'local', 'ליד', 'באזור', 'קרוב', 'בסביבה', 'בסביבת', 'באיזור'])
const BUYING_WORDS = new Set([
  'buy', 'price', 'prices', 'pricing', 'cost', 'costs', 'cheap', 'deal', 'deals', 'sale', 'order', 'shop', 'store',
  'delivery', 'shipping', 'discount', 'coupon', 'hire', 'book', 'booking', 'quote', 'repair', 'install', 'installation',
  'לקנות', 'קנייה', 'קניית', 'מחיר', 'מחירים', 'מחירון', 'זול', 'זולה', 'זולים', 'מבצע', 'מבצעים', 'הזמנה', 'להזמין',
  'משלוח', 'משלוחים', 'הנחה', 'קופון', 'חנות', 'אונליין', 'תיקון', 'התקנה', 'התקנת', 'שירות', 'שירותי',
])
/** Words too common to say anything about a niche. */
const STOP_WORDS = new Set(['and', 'for', 'the', 'with', 'online', 'של', 'עם', 'על', 'את', 'אונליין'])

/**
 * Why the scan would promote this phrase, from the phrase itself: the first
 * property that holds, in this order. `core` (what the business offers, in
 * the searcher's words) is true of every seed keyword, which is why the
 * pipeline chose it.
 */
export function keywordReason(keyword: string, business: SeedBusiness | null, domain: string): KeywordReason {
  const words = tokens(keyword)
  const all = new Set(words.flatMap(forms))

  const brandNames = [business?.companyName ?? '', domain.replace(/^www\./, '').split('.')[0] ?? '']
    .map((s) => tokens(s).join(' '))
    .filter((s) => s.length >= 4)
  const phrase = words.join(' ')
  if (brandNames.some((b) => phrase.includes(b))) return 'brand'

  if (keyword.trim().endsWith('?') || (words.length > 0 && QUESTION_WORDS.has(words[0]))) return 'question'
  if (words.some((w) => LOCAL_WORDS.has(w))) return 'local'
  if ([...all].some((w) => BUYING_WORDS.has(w))) return 'buying'

  const niche = tokens(business?.niche ?? '').flatMap(forms).filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
  if (niche.some((w) => all.has(w))) return 'niche'
  if (words.length >= 4) return 'specific'
  return 'core'
}

// ── When ────────────────────────────────────────────────────────────────────

export type ScannedAgo = { kind: 'justNow' } | { kind: 'hours'; value: number } | { kind: 'days'; value: number }

/** "Just now" for the first hour, then hours, then days. Null when the site was never read. */
export function scannedAgo(scannedAt: string | null, now: Date): ScannedAgo | null {
  if (!scannedAt) return null
  const at = new Date(scannedAt).getTime()
  if (!Number.isFinite(at)) return null
  const minutes = Math.max(0, (now.getTime() - at) / 60_000)
  if (minutes < 60) return { kind: 'justNow' }
  if (minutes < 24 * 60) return { kind: 'hours', value: Math.max(1, Math.floor(minutes / 60)) }
  return { kind: 'days', value: Math.max(1, Math.floor(minutes / (24 * 60))) }
}

// ── Reading the run again ───────────────────────────────────────────────────

/** How often the progress screen reads the run while stage A works. */
export const POLL_MS = 1_500
/** A stalled run waits for the cron to resume it, so it is read rarely. */
export const STALLED_POLL_MS = 15_000
/** After failed reads the wait doubles, up to this. */
export const MAX_POLL_MS = 15_000
/**
 * While stage B works in the background the summary reads the run rarely, so its
 * bar can say when the full research is ready, or that it did not finish.
 */
export const STAGE_B_POLL_MS = 20_000

/**
 * When to read the run again, or null for not at all: soon while stage A
 * works, rarely while it is stalled, never once it has ended (the summary is
 * final, and stage B shows on the dashboard). `awaiting` is a start the screen
 * has just made, which keeps reading until the new run arrives. Failed reads
 * back off: 3s, 6s, 12s, then every 15s.
 */
export function pollDelay(run: SeedRunView | null, failures: number, awaiting = false): number | null {
  const phase = runPhase(run)
  if (!awaiting && phase === 'started' && run && stageBState(run, new Date()) === 'running') {
    return failures > 0 ? MAX_POLL_MS * 2 : STAGE_B_POLL_MS
  }
  if (!awaiting && phase !== 'progress' && phase !== 'stalled') return null
  if (failures > 0) return Math.min(MAX_POLL_MS, POLL_MS * 2 ** Math.min(failures, 4))
  return phase === 'stalled' && !awaiting ? STALLED_POLL_MS : POLL_MS
}

// ── Stage B, for the summary's bar ──────────────────────────────────────────

/** Stage B's cron gives up on a run whose stage began this long ago (lib/seed-scan/store.ts MAX_RESUME_AGE_MS). */
export const STAGE_B_GIVE_UP_MS = 24 * 60 * 60 * 1000

/**
 * Where stage B really is, for the summary's bottom bar: `running` while it works
 * (or its worker is gone and the cron still has it to resume), `done` once it
 * finished (a partial run too: what it found is saved), `failed` when it failed or
 * stalled past the cron's day. Null before stage B began.
 */
export function stageBState(run: SeedRunView, now: Date): 'running' | 'done' | 'failed' | null {
  if (run.stage !== 'b') return null
  if (run.status === 'failed') return 'failed'
  if (run.status !== 'running') return 'done'
  if (!run.stalled) return 'running'
  const started = Date.parse(run.startedAt)
  return Number.isFinite(started) && now.getTime() - started <= STAGE_B_GIVE_UP_MS ? 'running' : 'failed'
}
