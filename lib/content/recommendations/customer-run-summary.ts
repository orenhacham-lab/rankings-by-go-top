/**
 * Customer-safe run summary (Part 3/4). Maps the INTERNAL evidence inventory + Stage-E3A GSC
 * diagnostics into two small, truthful, non-technical objects for the normal (non-diagnostics)
 * response: which sources were actually analyzed, and a single Search Console run status. Pure +
 * deterministic; it never exposes raw counts or internal diagnostics, and changes no engine
 * behavior. Import direction stays reco → the allowed GSC types surface.
 */
import type { GscInputState } from '@/lib/gsc/recommendations/types'

export interface ScanSources {
  projectData: boolean
  websiteScan: boolean
  keywordResearch: boolean
  searchConsole: boolean
}

export type GscRunState =
  | 'supported'
  | 'evaluated_none_accepted'
  | 'eligible_not_consumed'
  | 'no_eligible'
  | 'not_connected'
  | 'no_property'
  | 'never_synced'
  | 'read_failed'
  | 'disabled'

export interface GscRunSummary {
  state: GscRunState
  /** GSC briefs that actually reached the recommendation engine this run (consumedGscBriefCount). */
  evaluatedCount: number
  /** Current-run accepted recommendations that were GSC-backed (the per-card chip set). */
  supportedResultCount: number
}

/** Search Console counts as an ANALYZED source only when it successfully loaded (with or without
 *  eligible opportunities). All unavailable/error states do NOT list it as analyzed. */
const GSC_ANALYZED_STATES: ReadonlySet<GscInputState> = new Set<GscInputState>(['loaded', 'no_eligible_opportunities'])

/** The sources that contributed usable evidence this run (truthful — derived from the inventory). */
export function buildScanSources(p: {
  projectLoaded: boolean
  siteScanEntities: number
  keywordResearchQueries: number
  gscState: GscInputState
}): ScanSources {
  return {
    projectData: p.projectLoaded,
    websiteScan: p.siteScanEntities > 0,
    keywordResearch: p.keywordResearchQueries > 0,
    searchConsole: GSC_ANALYZED_STATES.has(p.gscState),
  }
}

/** The single customer-safe Search Console run status. Maps the E3A state + real counts truthfully. */
export function buildGscRunSummary(p: {
  state: GscInputState
  consumedGscBriefCount: number
  addedAsNewBriefCount: number
  supportedResultCount: number
}): GscRunSummary {
  const evaluatedCount = p.consumedGscBriefCount
  const supportedResultCount = p.supportedResultCount
  let state: GscRunState
  switch (p.state) {
    case 'loaded':
      state = supportedResultCount > 0 ? 'supported'
        : p.consumedGscBriefCount > 0 ? 'evaluated_none_accepted'
          : p.addedAsNewBriefCount > 0 ? 'eligible_not_consumed'
            : 'no_eligible'
      break
    case 'no_eligible_opportunities': state = 'no_eligible'; break
    case 'not_connected': state = 'not_connected'; break
    case 'no_property': state = 'no_property'; break
    case 'never_synced': state = 'never_synced'; break
    case 'read_failed': state = 'read_failed'; break
    case 'disabled':
    default: state = 'disabled'; break
  }
  return { state, evaluatedCount, supportedResultCount }
}
