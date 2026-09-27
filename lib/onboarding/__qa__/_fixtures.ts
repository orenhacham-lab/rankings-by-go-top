/**
 * Runs and snapshots for the onboarding suites: the Hebrew plumbing site of the
 * seed-scan fixtures as stage A would report it, and a password-locked Shopify
 * store as W8's stage A records it.
 */
import { HE_WP, HE_WP_INSIGHT, NOW } from '@/lib/seed-scan/__qa__/_fixtures'
import { initialSummary } from '@/lib/seed-scan/summary'
import type { SeedBusiness, SeedRunView, SeedStepStatus, SeedSummary } from '@/lib/seed-scan/types'

export const BUSINESS: SeedBusiness = {
  companyName: HE_WP_INSIGHT.business!.companyName,
  description: HE_WP_INSIGHT.business!.summary,
  commerceType: 'service',
  niche: HE_WP_INSIGHT.business!.niche,
  isLocal: true,
  platform: 'WordPress',
  language: 'he',
  country: 'IL',
}

export function fullSummary(over: Partial<SeedSummary> = {}): SeedSummary {
  return {
    ...initialSummary({ source: 'scan', domain: HE_WP.key, url: HE_WP.home, locale: 'he' }),
    scannedAt: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
    business: { ...BUSINESS },
    audiences: HE_WP_INSIGHT.business!.audiences.slice(),
    seedKeywords: HE_WP_INSIGHT.keywords.slice(),
    topics: HE_WP_INSIGHT.articles.slice(),
    findings: [
      { id: 'images_alt', severity: 'warning', title: 'Alt', detail: 'Alt text', evidence: '1 מתוך 2 תמונות' },
      { id: 'robots_blocks_ai', severity: 'blocker', title: 'AI blocked', detail: 'robots' },
      { id: 'no_canonical', severity: 'info', title: 'Canonical', detail: 'none' },
    ],
    geo: {
      state: 'measured',
      unavailableReason: null,
      passed: 3,
      total: 4,
      signals: [
        { id: 'schema', ok: true, title: 's', detail: 'd' },
        { id: 'faq', ok: true, title: 'f', detail: 'd' },
        { id: 'robots', ok: false, title: 'r', detail: 'd' },
        { id: 'llms', ok: true, title: 'l', detail: 'd' },
      ],
    },
    competitors: [
      { domain: 'never-seen.co.il', validated: false, seenIn: 0, source: 'model' },
      { domain: 'pipes-pro.co.il', validated: true, seenIn: 1, source: 'search' },
      { domain: 'rival-plumber.co.il', validated: true, seenIn: 2, source: 'search' },
    ],
    ...over,
  }
}

/** A password-locked Shopify store: nothing could be read off it, so nothing was measured. */
export function lockedSummary(): SeedSummary {
  return fullSummary({
    domain: 'northwind-candles.myshopify.com',
    url: 'https://northwind-candles.myshopify.com/',
    storefrontLocked: true,
    business: null,
    audiences: [],
    seedKeywords: ['scented candles', 'soy candles'],
    topics: ['How to choose a scented candle'],
    findings: [],
    findingsOmitted: 0,
    geo: { state: 'unavailable', unavailableReason: 'storefront_locked', passed: 0, total: 0, signals: [] },
    competitors: [],
    locale: 'en',
  })
}

type StageA = 'a1' | 'a2' | 'a3' | 'a4'

export function runView(over: Partial<SeedRunView> = {}, steps: Partial<Record<StageA, SeedStepStatus>> = {}): SeedRunView {
  const status: Record<StageA, SeedStepStatus> = { a1: 'done', a2: 'done', a3: 'done', a4: 'done', ...steps }
  return {
    id: 'run-1',
    trigger: 'create',
    stage: 'a',
    status: 'done',
    errorCode: null,
    startedAt: NOW.toISOString(),
    finishedAt: NOW.toISOString(),
    stalled: false,
    steps: (['a1', 'a2', 'a3', 'a4'] as const).map((step) => ({ step, status: status[step], itemCount: null, errorCode: null, startedAt: null, finishedAt: null })),
    summary: fullSummary(),
    ...over,
  }
}
