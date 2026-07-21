/**
 * Stage E2A — read-only GSC opportunity types. Diagnostic/observability only: these records
 * never create, update, approve, reject, queue, publish, or otherwise mutate any content
 * item, and never feed the recommendation engine.
 */
import type { PageType } from './page-classify'
import type { QueryIntent } from './query-intent'

export type { PageType } from './page-classify'
export type { QueryIntent } from './query-intent'

export type OpportunityType =
  | 'improve_existing_page'
  | 'improve_title_meta_ctr'
  | 'supporting_content_candidate'
  | 'internal_link_support_candidate'
  | 'multi_page_signal'

/** A single explainable reason with its underlying component value (never a guarantee). */
export interface ReasonCode { code: string; detail: string; value?: number }

/** Explainable 0..1 score components (surfaced with the final 0–100 score). */
export interface ScoreComponents {
  demandStrength: number
  positionOpportunity: number
  ctrGap: number
  contentMatchConfidence: number
  distinctPageSignal: number
}

export type ContentMatchSource = 'article_topic' | 'generated_article' | 'indexed_url'
export type ContentMatchType = 'url' | 'keyword' | 'title'

/** Read-only reference to already-owned project content that appears to match. Never mutated. */
export interface ContentMatch {
  source: ContentMatchSource
  matchType: ContentMatchType
  confidence: number
  reference: string
  matchedUrl: string | null
}

export interface Opportunity {
  id: string
  primaryQuery: string
  relatedQueries: string[]
  page: string
  pageType: PageType
  queryIntent: QueryIntent
  clicks: number
  impressions: number
  ctr: number
  averagePosition: number
  distinctPageCount: number
  opportunityType: OpportunityType
  opportunityScore: number
  scoreComponents: ScoreComponents
  reasons: ReasonCode[]
  existingContentMatch: ContentMatch | null
  windowDays: number
  syncRunId: string
  dateStart: string | null
  dateEnd: string | null
}

/** Read-only project content evidence passed into the engine (never modified). */
export interface ContentEvidence {
  topics: { topic: string; primaryKeyword: string | null; secondaryKeywords: string[] }[]
  articles: { title: string; slug: string; url: string | null }[]
  indexedUrls: string[]
}

export interface OpportunityRunMeta {
  projectId: string
  windowDays: number
  syncRunId: string
  dateStart: string | null
  dateEnd: string | null
}
