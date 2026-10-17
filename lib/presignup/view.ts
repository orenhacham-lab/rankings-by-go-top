/**
 * What of an anonymous research is shown, what is stored, and in which column.
 *
 * GATING IS BY CONSTRUCTION. researchView builds the visitor's payload from
 * the snapshot with the locked lists already cut to their preview; the rest is
 * a count. So a locked competitor or keyword is not in the JSON at all — not
 * hidden by the screen, absent from the answer (lib/presignup/__qa__ reads
 * the JSON to prove it).
 *
 * STORAGE REUSES THE FREE CHECK'S LEDGER (free_site_checks):
 *   result  the PUBLIC teaser, in the free check's own shape and with its own
 *           gating (findings split, two competitors), and the research's
 *           keyword preview (three). It is what the free
 *           check's 24h cache replays for this domain, so it must be exactly
 *           as safe to show as a free check's own result.
 *   seed    the ungated set: the free check's three lists (every finding,
 *           every competitor, the home page's links), so an older reader of
 *           `seed` still works, plus `research`: the whole stage-A snapshot,
 *           how each step ended and each step's detail. A redeemed claim hands
 *           it to the seed route, which replays it into the new project
 *           (lib/seed-scan/claim.ts readResearchSeed).
 */
import { PUBLIC_COMPETITORS, splitFindings, type FreeCheckResult, type FreeCheckSeed } from '@/lib/free-check'
import { readStoredSignals } from '@/lib/seed-scan/steps'
import { readSummary, withCounters } from '@/lib/seed-scan/summary'
import type { SeedSummary } from '@/lib/seed-scan/types'
import type { ResearchMarker } from '@/lib/seed-scan/claim'
import type { AnonymousResearch, ResearchSpend } from './run'
import type { ResearchStep, ResearchStepView, ResearchView } from './types'

/** Competitors shown before sign-up: the free check's own public number. */
export const PREVIEW_COMPETITORS = PUBLIC_COMPETITORS
/** Keywords shown before sign-up, of the (at most five) the research found. */
export const PREVIEW_KEYWORDS = 3

/** The visitor's payload: the snapshot with the locked lists cut to their preview. */
export function researchView(summary: SeedSummary, steps: ResearchStepView[]): ResearchView {
  const competitors = summary.competitors.slice(0, PREVIEW_COMPETITORS)
  const seedKeywords = summary.seedKeywords.slice(0, PREVIEW_KEYWORDS)
  return {
    summary: withCounters({ ...summary, competitors, seedKeywords }),
    steps: steps.map((s) => ({ step: s.step, status: s.status, errorCode: s.errorCode, itemCount: s.itemCount })),
    locked: {
      competitors: summary.competitors.length - competitors.length,
      keywords: summary.seedKeywords.length - seedKeywords.length,
    },
  }
}

/** The free check's public result, from the research: what the free check's cache may replay. */
export function publicResult(summary: SeedSummary, spend: ResearchSpend, now: Date): FreeCheckResult {
  const { shown, locked } = splitFindings(summary.findings)
  const b = summary.business
  const competitors = summary.competitors.map((c) => c.domain)
  return {
    url: summary.url,
    domain: summary.domain,
    scannedAt: summary.scannedAt ?? now.toISOString(),
    locale: summary.locale,
    business: b
      ? {
          summary: b.description,
          audiences: summary.audiences,
          niche: b.niche,
          platform: b.platform,
          companyName: b.companyName,
          commerceType: b.commerceType,
          isLocal: b.isLocal,
          country: b.country,
          language: b.language,
          address: null,
          phone: null,
        }
      : null,
    // The same preview as the research's own answer: the free check's cache replays this.
    keywords: summary.seedKeywords.slice(0, PREVIEW_KEYWORDS),
    articles: summary.topics,
    competitors: competitors.slice(0, PUBLIC_COMPETITORS),
    lockedCompetitors: Math.max(0, competitors.length - PUBLIC_COMPETITORS),
    findings: shown,
    lockedFindings: locked + summary.findingsOmitted,
    geo: { passed: summary.geo.passed, total: summary.geo.total, signals: summary.geo.signals },
    counters: {
      keywords: summary.seedKeywords.length,
      fixes: summary.findings.length + summary.findingsOmitted,
      geoPassed: summary.geo.passed,
      geoTotal: summary.geo.total,
      articles: summary.topics.length,
    },
    aiUsed: spend.modelCalls > 0,
    cached: false,
  }
}

/** The marker a claimed run keeps on a1: the site, how it was read, how each step ended. */
function researchMarker(run: AnonymousResearch): ResearchMarker {
  const steps: ResearchMarker['steps'] = {}
  for (const s of run.steps) {
    if (s.status === 'done' || s.status === 'skipped' || s.status === 'failed') {
      steps[s.step as ResearchStep] = { status: s.status, errorCode: s.errorCode, itemCount: s.itemCount }
    }
  }
  const x = run.summary
  return {
    domain: x.domain,
    url: x.url,
    locale: x.locale,
    scannedAt: x.scannedAt,
    storefrontLocked: x.storefrontLocked,
    siteAccess: x.siteAccess,
    sitemapUrlCount: x.sitemapUrlCount,
    sitemapTruncated: x.sitemapTruncated,
    steps,
  }
}

export type ResearchLedgerSeed = FreeCheckSeed & {
  research: {
    version: 1
    summary: SeedSummary
    marker: ResearchMarker
    details: { a1: Record<string, unknown>; a2: Record<string, unknown>; a4: Record<string, unknown> }
  }
}

/** The ledger row's `seed`: the free check's three lists, and the whole research. */
export function researchSeed(run: AnonymousResearch): ResearchLedgerSeed {
  const signals = readStoredSignals(run.details.a1.signals)
  return {
    findings: run.summary.findings,
    competitors: run.summary.competitors.map((c) => c.domain),
    internalLinkUrls: signals?.internalLinkUrls ?? [],
    research: {
      version: 1,
      summary: run.summary,
      marker: researchMarker(run),
      details: { a1: run.details.a1, a2: run.details.a2, a4: run.details.a4 },
    },
  }
}

/** The steps of a stored research, as the view shows them. */
function storedSteps(marker: unknown): ResearchStepView[] {
  const m = (marker && typeof marker === 'object' ? (marker as { steps?: unknown }).steps : null) as Record<string, unknown> | null
  return (['a1', 'a2', 'a3', 'a4'] as const).map((step) => {
    const r = (m?.[step] ?? null) as { status?: unknown; errorCode?: unknown; itemCount?: unknown } | null
    const status = r?.status === 'done' || r?.status === 'skipped' || r?.status === 'failed' ? r.status : 'done'
    return {
      step,
      status,
      errorCode: typeof r?.errorCode === 'string' && /^[a-z0-9_]{1,64}$/.test(r.errorCode) ? r.errorCode : null,
      itemCount: typeof r?.itemCount === 'number' && Number.isFinite(r.itemCount) ? r.itemCount : null,
    }
  })
}

/** The view of a research the ledger already holds (a replay), or null when the row carries none. */
export function storedResearchView(seed: unknown): ResearchView | null {
  const research = seed && typeof seed === 'object' ? (seed as { research?: unknown }).research : null
  if (!research || typeof research !== 'object' || (research as { version?: unknown }).version !== 1) return null
  const summary = readSummary((research as { summary?: unknown }).summary)
  if (!summary) return null
  return researchView(summary, storedSteps((research as { marker?: unknown }).marker))
}
