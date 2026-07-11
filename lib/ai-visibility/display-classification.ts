/**
 * Display-time classification for AI Visibility results.
 *
 * This is the single source of truth that the server (GET /runs) and the client
 * (AIVisibilitySection) both use, so the list, drawer and summary always agree.
 *
 * ── The signal model (strict) ────────────────────────────────────────────────
 * A result is analysed into FOUR independent signals:
 *
 *   brandMentioned    — the brand name / a brand alias appears in the ANSWER text
 *   domainMentioned   — a project domain (or alias) appears in the ANSWER text
 *                       OR in the sources/citations list
 *   mentionedInAnswer — brandMentioned OR (a project domain appears in the answer)
 *   citedAsSource     — a project domain (or alias) appears in the
 *                       sources / citations / references list ONLY
 *
 * IMPORTANT: a domain that appears only inside the answer body is NOT a citation.
 * "Cited as source" requires the domain to be present in the sources list.
 * This is the bug this module fixes — previously a domain mentioned in the
 * answer text was wrongly flagged as "cited".
 *
 * Pure functions — safe to import on the server (no DOM, no React) and on the
 * client (no Node APIs).
 */

import { detectDomainMention } from './matching/mention-detector'
import { isDomainMatch, normalizeDomain } from './matching/domain-normalize'

export interface DisplayCitationInput {
  domain: string | null | undefined
  url?: string | null
  is_target_domain?: boolean | null
}

export interface DisplayMatchesResult {
  // ── Strict 4-signal model ──────────────────────────────────────────────
  mentionedInAnswer: boolean
  citedAsSource: boolean
  domainMentioned: boolean
  brandMentioned: boolean

  // ── Display labels (chips) ─────────────────────────────────────────────
  /** Brand names/aliases found in the answer body. */
  brandLabels: string[]
  /** A project domain found in the answer body (mention, NOT a citation). */
  domainInAnswerLabel: string | null
  /** A project domain found in the sources/citations list. */
  domainInSourceLabel: string | null

  // ── Backward-compatible fields (kept so existing consumers don't break) ─
  /** = mentionedInAnswer */
  displayMentioned: boolean
  /** = citedAsSource (sources list only) */
  displayCited: boolean
  /** Brand + in-answer-domain chips, shown under "what was mentioned". */
  displayBrandLabels: string[]
  /** Domain to show — prefers the cited (source) domain, else the answer one. */
  displayDomainLabel: string | null
}

export function cleanDisplayDomain(s: string | null | undefined): string | null {
  if (!s) return null
  return s
    .replace(/^https?:\/\//i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .replace(/^www\./i, '')
    .trim()
}

/**
 * Normalize a domain-ish string to its bare host form:
 * lowercase, no scheme, no www, no path/query/hash, no trailing slash.
 */
export function normalizeDomainForm(s: string | null | undefined): string {
  if (!s) return ''
  const cleaned = cleanDisplayDomain(s)
  if (!cleaned) return ''
  // normalizeDomain handles markdown links + subdomain hostname extraction
  return normalizeDomain(cleaned)
}

export function isTargetCitation(
  citationDomain: string | null | undefined,
  targetDomain: string | null | undefined
): boolean {
  if (!citationDomain || !targetDomain) return false
  const c = normalizeDomainForm(citationDomain)
  const t = normalizeDomainForm(targetDomain)
  return !!c && !!t && c === t
}

/**
 * A variant is "domain-form" when it looks like a URL/host (scheme, www, or a
 * dotted TLD). Brand tokens like "samsung" are NOT domain-form. This is a
 * classification check only — detection variants are never modified.
 */
function isDomainForm(s: string): boolean {
  const t = s.toLowerCase().trim()
  if (/^https?:\/\//.test(t)) return true
  if (/^www\./.test(t)) return true
  if (/\.[a-z]{2,}(\/|$|\?|#)/.test(t)) return true
  return false
}

/**
 * Build the normalized list of project domains (primary + aliases).
 */
export function buildDomainList(
  targetDomain: string | null | undefined,
  domainAliases?: string[] | null
): string[] {
  const out = new Set<string>()
  const push = (s: string | null | undefined) => {
    const n = normalizeDomainForm(s)
    if (n) out.add(n)
  }
  push(targetDomain)
  for (const a of domainAliases ?? []) push(a)
  return Array.from(out)
}

/**
 * Strict classification of a single result.
 *
 * - brandVariants: brand-form + domain-form strings (e.g. from getBrandVariants).
 *   domain-form variants are treated as domain mentions, never brand mentions.
 * - domainList: normalized project domains (primary + aliases). Used for both
 *   answer-body domain mentions and source-list citations.
 * - citations contribute ONLY to citedAsSource.
 * - When responseText is unavailable, falls back to the stored mentioned/cited
 *   booleans (and any citation rows) so older rows still render sensibly.
 */
export function computeDisplayMatches(args: {
  responseText: string | null
  brandVariants: string[]
  targetDomain: string | null
  /** Project domains incl. aliases. If omitted, derived from targetDomain. */
  domainList?: string[]
  mentioned: boolean
  cited: boolean
  citations?: DisplayCitationInput[] | null
}): DisplayMatchesResult {
  const { responseText, brandVariants, targetDomain, mentioned, cited, citations } = args
  const domainList = args.domainList && args.domainList.length > 0
    ? args.domainList
    : buildDomainList(targetDomain)

  const brandLabels: string[] = []
  let domainInAnswerLabel: string | null = null
  let domainInSourceLabel: string | null = null

  let brandMentioned = false
  let domainInAnswer = false
  let citedAsSource = false

  if (responseText) {
    const lower = responseText.toLowerCase()

    // 1) Brand + domain variants that appear in the answer text.
    const matched: string[] = []
    for (const v of brandVariants) {
      if (lower.includes(v.toLowerCase())) matched.push(v)
    }
    // Drop shorter substrings of longer matches (keep most specific).
    const filtered: string[] = []
    for (const variant of matched) {
      const variantLower = variant.toLowerCase()
      const isShorterSubstring = matched.some(
        (other) =>
          other !== variant &&
          other.toLowerCase().includes(variantLower) &&
          other.length > variant.length
      )
      if (!isShorterSubstring) filtered.push(variant)
    }
    for (const v of filtered) {
      if (isDomainForm(v)) {
        // domain-form variant in the body → domain mention (NOT a citation)
        if (!domainInAnswerLabel || v.length > domainInAnswerLabel.length) {
          domainInAnswerLabel = v
        }
        domainInAnswer = true
      } else {
        brandLabels.push(v)
        brandMentioned = true
      }
    }

    // 2) Explicit project-domain (and alias) detection in the answer body.
    //    Robust to markdown links, www, scheme and paths.
    for (const d of domainList) {
      if (detectDomainMention(responseText, d).mentioned) {
        if (!domainInAnswerLabel) domainInAnswerLabel = d
        domainInAnswer = true
      }
    }
  }

  // 3) Citations / sources — the ONLY thing that makes citedAsSource true.
  if (citations && citations.length > 0) {
    for (const c of citations) {
      const matchesTarget =
        c.is_target_domain === true ||
        domainList.some(
          (d) =>
            isTargetCitation(c.domain, d) ||
            (c.url ? isDomainMatch(c.url, d) : false)
        )
      if (matchesTarget) {
        domainInSourceLabel = cleanDisplayDomain(c.domain) || domainInSourceLabel || targetDomain
        citedAsSource = true
        break
      }
    }
  }

  // Fallback to stored booleans when we couldn't re-evaluate from text/citations.
  if (!responseText && mentioned) {
    brandMentioned = true
  }
  if (!responseText && (!citations || citations.length === 0) && cited) {
    citedAsSource = true
    if (!domainInSourceLabel) domainInSourceLabel = targetDomain
  }

  const mentionedInAnswer = brandMentioned || domainInAnswer
  const domainMentioned = domainInAnswer || citedAsSource

  // Backward-compatible display labels.
  const displayBrandLabels = Array.from(new Set(brandLabels))
  const mentionChips = [...displayBrandLabels]
  const cleanAnswerDomain = cleanDisplayDomain(domainInAnswerLabel)
  if (cleanAnswerDomain && !mentionChips.includes(cleanAnswerDomain)) {
    mentionChips.push(cleanAnswerDomain)
  }

  return {
    mentionedInAnswer,
    citedAsSource,
    domainMentioned,
    brandMentioned,
    brandLabels: displayBrandLabels,
    domainInAnswerLabel: cleanAnswerDomain,
    domainInSourceLabel: cleanDisplayDomain(domainInSourceLabel),
    displayMentioned: mentionedInAnswer,
    displayCited: citedAsSource,
    displayBrandLabels: mentionChips,
    displayDomainLabel:
      cleanDisplayDomain(domainInSourceLabel) || cleanAnswerDomain || null,
  }
}
