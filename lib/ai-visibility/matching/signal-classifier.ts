/**
 * High-level AI-answer signal classifier.
 *
 * Given a raw project definition (brand name + aliases, domain + aliases) and a
 * single AI result (answer text + sources/citations), produces the strict
 * four-signal model used across the AI Visibility UI:
 *
 *   mentionedInAnswer — brand name / alias / project domain appears in the answer
 *   citedAsSource     — a project domain (or alias) appears in the SOURCES list
 *   domainMentioned   — a project domain (or alias) appears in the answer OR sources
 *   brandMentioned    — brand name / alias appears in the answer body
 *
 * It is a thin wrapper around getBrandVariants + computeDisplayMatches so the
 * server, the client and any scripts share one implementation. All normalization
 * (lowercase, strip www / scheme / trailing slash, Hebrew + English) lives in the
 * underlying helpers.
 */

import { getBrandVariants } from './mention-detector'
import {
  computeDisplayMatches,
  buildDomainList,
  type DisplayCitationInput,
  type DisplayMatchesResult,
} from '../display-classification'

export interface ProjectBrandConfig {
  brandName: string | null | undefined
  domain: string | null | undefined
  brandAliases?: string[] | null
  domainAliases?: string[] | null
}

export interface ClassifyArgs extends ProjectBrandConfig {
  responseText: string | null
  citations?: DisplayCitationInput[] | null
  /** DB fallbacks used only when responseText/citations are unavailable. */
  storedMentioned?: boolean
  storedCited?: boolean
}

/**
 * Classify one AI result into the four signals (plus display labels).
 */
export function classifyAISignals(args: ClassifyArgs): DisplayMatchesResult {
  const brandVariants = getBrandVariants(
    args.brandName,
    args.domain,
    args.brandAliases,
    args.domainAliases
  )
  const domainList = buildDomainList(args.domain ?? null, args.domainAliases)

  return computeDisplayMatches({
    responseText: args.responseText,
    brandVariants,
    targetDomain: args.domain ?? null,
    domainList,
    citations: args.citations ?? null,
    mentioned: args.storedMentioned ?? false,
    cited: args.storedCited ?? false,
  })
}
