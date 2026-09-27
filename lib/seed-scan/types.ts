/**
 * Shapes shared by the seeding scan's pipeline, its run store and its API.
 *
 * A new project starts from one field, the site URL. Stage A (a1-a4) reads the
 * site, understands the business with one model call, measures what holds the
 * site back, and validates competitors against real search results, all while
 * the merchant watches the progress screen. Stage B (b1-b6) runs later in the
 * background. Every step saves its own result, so a failure midway keeps what
 * was already found, and a resumed run starts at the first step that is not
 * finished.
 *
 * Everything that crosses the API is a stable code or a value we produced
 * ourselves. Provider text (a model error, a search API body, a fetch
 * exception) never reaches a response, a stored row or a log line.
 */
import type { CommerceType, FreeCheckFinding, GeoSignal } from '@/lib/free-check'
import type { Locale } from '@/lib/i18n/locales'
import type { SeedRunStage, SeedRunStatus, SeedRunTrigger, SeedStep, SeedStepStatus } from '@/lib/supabase/types'

export type { SeedRunStage, SeedRunStatus, SeedRunTrigger, SeedStep, SeedStepStatus }

/** The owner a query is about. Every service-role query filters by both. */
export type SeedScope = { projectId: string; userId: string }

/** The steps of each stage, in execution order. Stage B adds its six here. */
export const STAGE_STEPS: Record<SeedRunStage, readonly SeedStep[]> = {
  a: ['a1', 'a2', 'a3', 'a4'],
  b: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'],
}

/** A step in one of these states will not run again inside the same run. */
export const TERMINAL_STEP_STATUSES: readonly SeedStepStatus[] = ['done', 'skipped', 'failed']

/** What a2 understood about the business. */
export type SeedBusiness = {
  companyName: string | null
  /** The model's 2-3 sentence summary, grounded in the page text. */
  description: string
  commerceType: CommerceType
  niche: string | null
  isLocal: boolean
  /** Read off the markup when the page gives it away; the model is only a fallback. */
  platform: string | null
  /** The page's own `lang`, never a guess. */
  language: string | null
  /** ISO-3166-1 alpha-2, or null when the page gives no evidence. */
  country: string | null
}

/**
 * The four AI-readiness checks. `pending` until a3 has run; `unavailable` when
 * the site could not be measured honestly (a password-locked storefront shows
 * its password page, not the store), which is NOT the same as failing all four.
 */
export type SeedGeo = {
  state: 'pending' | 'measured' | 'unavailable'
  unavailableReason: 'storefront_locked' | null
  passed: number
  total: number
  signals: GeoSignal[]
}

export type SeedCompetitor = {
  domain: string
  /** True once the domain was seen in a real search result for this site's keywords. */
  validated: boolean
  /** In how many of the (at most 3) searches it appeared. */
  seenIn: number
  /** 'model' when a2 suggested it, 'search' when a4 found it in the results. */
  source: 'model' | 'search'
}

export type SeedCounters = {
  keywords: number
  fixes: number
  geoPassed: number
  geoTotal: number
  articles: number
  competitors: number
}

/**
 * The stage-A snapshot. The summary screen, the dashboard's "what's holding
 * you back" card and the AI-visibility readiness card read this and nothing
 * else, so it is self-contained and versioned.
 */
export type SeedSummary = {
  version: 1
  /** 'claim' when a1-a3 were seeded from the visitor's anonymous free check. */
  source: 'scan' | 'claim'
  domain: string
  url: string
  /** When the site itself was read; null until a1 has finished. */
  scannedAt: string | null
  /** The language of every piece of copy in this snapshot. */
  locale: Locale
  /** A Shopify development store behind its password page. */
  storefrontLocked: boolean
  business: SeedBusiness | null
  audiences: string[]
  seedKeywords: string[]
  /** Article titles worth writing. */
  topics: string[]
  /** ALL findings of a live scan, blockers first; not the free check's signup-gated split. */
  findings: FreeCheckFinding[]
  /**
   * Findings known to exist but not listed. Always 0 for a live scan. A claimed
   * free check only stored its public teaser, so its remainder is counted here.
   */
  findingsOmitted: number
  geo: SeedGeo
  competitors: SeedCompetitor[]
  counters: SeedCounters
  /** URLs listed in the site's sitemaps; null when not measured (a claim, a locked store). */
  sitemapUrlCount: number | null
  /** True when the count stopped at the discovery limit, i.e. "at least". */
  sitemapTruncated: boolean
}

/** Stable codes a step or a run may end with. The UI maps each to copy. */
export const SEED_STEP_ERROR_CODES = [
  // a1: reading the site
  'invalid_site_url',
  'site_blocked',
  'site_unreachable',
  'site_not_html',
  'site_offsite_redirect',
  'claim_payload_missing',
  // a2: understanding the business
  'storefront_locked',
  'claim_without_insight',
  'model_unavailable',
  'model_failed',
  'model_timeout',
  'model_interrupted',
  'settings_write_failed',
  // a4: competitors
  'no_seed_keywords',
  'search_unavailable',
  'search_failed',
  'search_timeout',
  'search_interrupted',
  'competitors_write_failed',
  // any step, or the run itself
  'site_unreadable',
  'project_missing',
  'superseded',
  'internal_error',
] as const
export type SeedErrorCode = (typeof SEED_STEP_ERROR_CODES)[number]

/** Stable codes the API answers with. The UI maps each to copy. */
export const SEED_API_ERROR_CODES = [
  'invalid_request',
  'unauthorized',
  'not_found',
  'entitlement_required',
  'entitlement_unavailable',
  'run_in_progress',
  'rescan_too_soon',
  'user_daily_cap',
  'global_daily_cap',
  'claim_invalid',
  'unavailable',
  'internal',
] as const
export type SeedApiErrorCode = (typeof SEED_API_ERROR_CODES)[number]

/** One step as the API shows it. */
export type SeedStepView = {
  step: SeedStep
  status: SeedStepStatus
  itemCount: number | null
  errorCode: string | null
  startedAt: string | null
  finishedAt: string | null
}

/** The latest run as GET /api/projects/[id]/seed shows it. */
export type SeedRunView = {
  id: string
  trigger: SeedRunTrigger
  stage: SeedRunStage
  status: SeedRunStatus
  errorCode: string | null
  startedAt: string
  finishedAt: string | null
  /** Still marked running, but its worker's lease has lapsed; the cron resumes it. */
  stalled: boolean
  steps: SeedStepView[]
  summary: SeedSummary | null
}

export type SeedGetResponse = { ok: true; run: SeedRunView | null } | { ok: false; code: SeedApiErrorCode }
export type SeedPostResponse =
  | { ok: true; runId: string; trigger: SeedRunTrigger }
  | { ok: false; code: SeedApiErrorCode; retryAfterSeconds?: number }
