/**
 * Stage E2C — client-facing Search Console RECOMMENDATIONS (types).
 *
 * A small, bounded, plain-language set of page-level content recommendations built deterministically
 * from Stage-E2A opportunities. Categories A–D only (no new-content creation — GSC new content flows
 * exclusively through E3A inside normal topic generation). This layer lives under lib/gsc and NEVER
 * imports the recommendation engine (lib/content/recommendations); E3A remains the only GSC→generation
 * path. All client strings are composed in the UI from these typed fields via i18n — no internal
 * label (score / opportunityType / reason code / signal) is ever carried here.
 */

/** The four client-facing categories (A–D). No new-content category. */
export type ClientRecCategory = 'improve_ctr' | 'improve_page' | 'internal_links' | 'page_overlap'

/** Understandable priority — never a numeric score. */
export type ClientPriority = 'high' | 'good' | 'review'

/** Whitelisted, client-safe reason keys (translated to natural language in the UI). */
export type ClientReasonKey =
  | 'high_search_demand'
  | 'ranks_striking_distance'
  | 'low_ctr_for_position'
  | 'has_relevant_page'
  | 'impressions_split_across_pages'

/** One distinct search need preserved inside a page card (page-owned consolidation keeps these). */
export interface ClientNeedGroup {
  representativeQuery: string
  relatedQueries: string[]
  opportunityIds: string[]
}

/** One involved page for an overlap (D) recommendation (observed per-page split). */
export interface ClientInvolvedPage {
  url: string
  impressions: number
  clicks: number
  isPrimary: boolean
}

export interface ClientRecommendation {
  /** Stable deterministic id: rec_<sha1(project|window|category|pageKey|needSignature)>. */
  id: string
  category: ClientRecCategory
  priority: ClientPriority
  window: 28 | 90
  /** Affected page URL. null ONLY for a page_overlap card with no clear primary page. */
  affectedPage: string | null
  /** Human label derived deterministically from the page slug (never an internal term). null for
   *  the homepage — the UI renders the localized "Homepage" label via isHomepage. */
  pageLabel: string | null
  /** The affected page is the site root ("/") — the UI shows the localized homepage label. */
  isHomepage?: boolean
  metrics: { impressions: number; clicks: number; ctr: number; averagePosition: number }
  /** ≥1 need group; distinct needs on the same page are preserved (not merged away). */
  needGroups: ClientNeedGroup[]
  /** Authoritative union of every underlying E2A opportunity id, ordered score↓ → impressions↓ → id↑.
   *  A grouped handled/hide decision applies to EVERY id here. */
  relatedOpportunityIds: string[]
  /** page_overlap only — the actual involved pages (client caps the initial display). */
  involvedPages?: ClientInvolvedPage[]
  /** page_overlap only — false ⇒ show "no clear primary page". */
  hasClearPrimary?: boolean
  /** Whitelisted reason keys → natural-language "why" in the UI. */
  reasonKeys: ClientReasonKey[]
}

export interface BuildRecommendationsResult {
  recommendations: ClientRecommendation[]
  summary: { actionable: number; affectedPages: number }
}
