/**
 * Content-automation topic recommendations — shared types (source-agnostic).
 *
 * A TopicSuggestion is what the engine returns for ANY source (by-keyword,
 * project-data, keyword-research-by-URL, and — later — Search Console). The
 * scheduler and UI never care which source produced it.
 */

import type { ArticleTopicSource } from '@/lib/supabase/types'

// 'hybrid' (Phase 4C) is an ORCHESTRATOR source: it runs every eligible provider
// below and merges their results. It is never a leaf provider itself.
export type RecommendationSource = 'keyword' | 'project_data' | 'keyword_research_url' | 'site_scan' | 'hybrid'

export interface SuggestedInternalLink {
  url: string
  anchor: string
}

/** P0 canonical role-aware link contract. ONE structure used end-to-end: mapper →
 *  suggestion → API → persistence (link_plan JSONB) → reload → UI → approval. Roles
 *  are NEVER re-inferred downstream and NEVER flattened into an untyped array. */
export type InternalLinkRole = 'primary_commercial_target' | 'secondary_commercial_target' | 'supporting_informational_link' | 'source_reference'
export interface LinkTarget {
  url: string
  title: string
  pageType: string
  role: InternalLinkRole
  score: number
  reason: string
}
export interface LinkPlan {
  primaryCommercialTarget: LinkTarget | null
  secondaryCommercialTargets: LinkTarget[]
  supportingInformationalLinks: LinkTarget[]
  sourceReferences: LinkTarget[]
}

export interface TopicSuggestion {
  /** Stable id derived from source + primary keyword (dedupe/selection in UI). */
  id: string
  title: string
  primaryKeyword: string
  secondaryKeywords: string[]
  searchIntent: string
  recommendedWordCount: number
  angle: string
  suggestedInternalLinks: SuggestedInternalLink[]
  source: RecommendationSource
  /** Plain-language "why we suggested this" for non-SEO users. */
  suggestionReason: string
  /** 0..1 relevance/confidence. */
  suggestionScore: number
  /** Phase 3F.3.4a — when there are no suggested links, WHY (valid_no_match /
   *  low_confidence_only / target_type_gap / stale_index / …). Response-only. */
  linkPreviewReason?: string
  /** Phase 3F.3.6 — URL of the best commercial destination among suggestedInternalLinks
   *  (null when none). The idea card shows it FIRST under "Primary commercial link". */
  moneyTargetUrl?: string | null
  /** Phase 3F.3.6 — money-target match classification (dev/diagnostic + card badge). */
  moneyTargetMatchType?: string
  /** Phase 4C — hybrid provenance: the distinct providers that produced/support
   *  this idea (present only on hybrid runs). Response-only. */
  supportingSources?: RecommendationSource[]
  /** Phase 4C — per-source evidence (source + that source's own reason). */
  sourceEvidence?: { source: RecommendationSource; reason: string }[]
  /** Internal diagnostic — which Gemini model produced this idea (primary or
   *  fallback id). Response/diagnostic-only; NEVER rendered on the idea card. */
  modelUsed?: string
  /** P0 recovery tiers — the confidence band the opportunity was generated in:
   *  'high_confidence' (Tier 1, strong multi-source evidence), 'medium_confidence'
   *  (Tier 2, broadened single-strong-source), 'discovery' (Tier 3, controlled
   *  synthesis from combined evidence). Response-only; additive. */
  confidenceLevel?: 'high_confidence' | 'medium_confidence' | 'discovery'
  /** True when produced by the Tier 3 controlled-discovery step (never claims
   *  fabricated demand). Response-only; additive. */
  discoveryGenerated?: boolean
  /** P0 mapping/validation — recommended destination for this opportunity. Only
   *  'article' is auto-enqueued into the automation queue; other types are shown with
   *  a recommendation but never silently treated as articles. Additive. */
  recommendedPageType?: 'article' | 'commercial_landing_page' | 'category_page' | 'service_page' | 'product_page_improvement' | 'existing_page_improvement'
  /** P0 demand-claim integrity — verified demand evidence (from keyword research);
   *  demandConfidence 'none' means NO verified volume (use neutral language). */
  demandEvidence?: { demandEvidenceAvailable: boolean; demandQuery: string | null; avgMonthlySearches: number | null; demandConfidence: 'high' | 'low' | 'none'; demandMatchType?: 'exact' | 'close_intent' | 'supporting_only' | 'none' }
  /** P0 business relevance — 0..1 coverage of the topic's subject by business
   *  evidence + the related commercial entities that support it. Response-only. */
  businessRelevance?: { score: number; relatedCommercialEntities: string[] }
  /** P0 canonical role-aware internal-link plan (see LinkPlan). Carried end-to-end;
   *  the UI renders sections from THIS and never re-infers roles. */
  linkPlan?: LinkPlan
  /** P0 content-plan — the opportunity family this topic was generated in
   *  (informational / comparison / commercial). Used for diversity allocation. */
  opportunityFamily?: string
  /** Per-link relevance diagnostics (Preview-only; every evaluated link target
   *  with sharedDistinctiveTokens / semanticRelation / rejectionReasons /
   *  acceptedBecause). Never rendered on the customer card. */
  linkDiagnostics?: { targetUrl: string; targetTitle: string; role: string; sharedDistinctiveTokens: string[]; semanticRelation: string; rejectionReasons: string[]; acceptedBecause: string | null; isHomepage: boolean; coverageOwned: boolean }[]
  /** Existing pages/topics that already cover this need (coverage/cannibalization
   *  signal). Preview-only. */
  coverageMatches?: { existingTitle: string; url: string | null; matchType: string; score: number; sharedNeed: string[] }[]
  /** Normalized clean search phrase (the keyword the search-phrase gate approved). */
  normalizedPrimaryKeyword?: string
}

export interface RecommendationMeta {
  source: RecommendationSource
  /** Raw ideas produced by the model(s) across all attempts (before dedupe). */
  generated: number
  /** How many raw ideas were dropped as duplicates / near-duplicates. */
  skippedDuplicates: number
  /** Final new, non-duplicate ideas returned. */
  finalCount: number
  /** How many generation attempts (loop rounds) were spent. */
  attempts: number
  /** Machine reason when finalCount is 0 (e.g. 'all_duplicates', 'model_empty'). */
  reason?: string
  /** Phase 3I.3 — how many candidates the final quality gate removed (count only). */
  qualityFilteredCount?: number
  /** True when the keyword-research (Google Ads) leg failed but we still return. */
  keywordResearchFailed?: boolean
  failureReason?: string
  adsCalls?: number
  /** Phase 4C — per-provider execution status for a hybrid run (partial-failure
   *  transparency): which providers ran, their raw counts, and any failure. */
  providers?: { source: RecommendationSource; ok: boolean; count: number; reason?: string }[]
  /** Non-production diagnostics (Phase 3F.1) — safe counters, no secrets. */
  debug?: Record<string, unknown>
  /** Preview runtime diagnostics (always populated when collectTrace) — proves
   *  whether calls were made, produced raw candidates, and the controller state,
   *  so a zero result is classifiable (ZERO_CALLS vs rejected). Safe counters only. */
  runtimeDiag?: Record<string, unknown>
}

export interface RecommendationResult {
  suggestions: TopicSuggestion[]
  meta: RecommendationMeta
}

/** Map a UI recommendation source to the persisted article_topics.source tag. */
export function toArticleTopicSource(source: RecommendationSource): ArticleTopicSource {
  // 'site_scan' / 'hybrid' have no dedicated article_topics.source value (no
  // schema change); they persist as 'project_data' — provenance is kept in
  // suggestion_reason (Phase 4C hybrid folds a "supported by…" summary there).
  if (source === 'site_scan' || source === 'hybrid') return 'project_data'
  return source // remaining values intentionally align with the widened CHECK
}
