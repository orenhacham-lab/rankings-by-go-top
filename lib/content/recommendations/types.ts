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
  /** Grounding — canonical entity identity carried internally for entity-correct
   *  supporting links + evidence. Response-only; raw ids are NEVER rendered. */
  primaryEntityId?: string
  primaryEntityType?: 'product' | 'category' | 'brand' | 'article' | 'page'
  canonicalEntityName?: string
  supportingEntityIds?: string[]
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
