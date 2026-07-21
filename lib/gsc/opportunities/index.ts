/**
 * Stage E2A — read-only GSC opportunity intelligence. Pure, deterministic, and fully
 * isolated from the recommendation engine (no imports from lib/content/recommendations,
 * no content mutation). Public surface for the API route.
 */
export { buildOpportunities } from './engine'
export { classifyPage, isUtilityUrl, isActionablePageType, type PageType } from './page-classify'
export { classifyIntent, type QueryIntent } from './query-intent'
export { clusterQueries, clusterKey } from './cluster'
export { matchExistingContent, urlKey } from './content-match'
export { scoreOpportunity, positionBand, median } from './score'
export { normalizeQuery, tokenize, contentTokens, contentTokenSet } from './normalize'
export type {
  Opportunity, OpportunityType, ReasonCode, ScoreComponents,
  ContentMatch, ContentMatchSource, ContentMatchType, ContentEvidence, OpportunityRunMeta,
} from './types'
