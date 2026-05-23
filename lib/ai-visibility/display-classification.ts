/**
 * Display-time classification for AI Visibility results.
 *
 * Mirrors the client's findMatchedLabels so the list/summary and drawer agree
 * on what was "mentioned" vs "cited" without changing any persisted DB values
 * or scan/detection logic.
 *
 * Pure functions — safe to import on the server (no DOM, no React).
 */

export interface DisplayCitationInput {
  domain: string | null | undefined
  url?: string | null
  is_target_domain?: boolean | null
}

export interface DisplayMatchesResult {
  displayMentioned: boolean
  displayCited: boolean
  displayBrandLabels: string[]
  displayDomainLabel: string | null
}

export function cleanDisplayDomain(s: string | null | undefined): string | null {
  if (!s) return null
  return s
    .replace(/^https?:\/\//i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .trim()
}

export function isTargetCitation(
  citationDomain: string | null | undefined,
  targetDomain: string | null | undefined
): boolean {
  if (!citationDomain || !targetDomain) return false
  const c = citationDomain.toLowerCase().replace(/^www\./, '')
  const t = targetDomain.toLowerCase().replace(/^www\./, '')
  return c === t
}

function isDomainForm(s: string): boolean {
  const t = s.toLowerCase().trim()
  if (/^https?:\/\//.test(t)) return true
  if (/^www\./.test(t)) return true
  if (/\.[a-z]{2,}(\/|$|\?|#)/.test(t)) return true
  return false
}

/**
 * Strict classification of how a result should be displayed.
 *
 * - When responseText is available, re-evaluates from text:
 *     domain-form variant match → displayCited only
 *     brand-form variant match  → displayMentioned only
 * - Citations (sources list) contribute only to displayCited.
 * - Without responseText AND without target citations, falls back to the
 *   stored mentioned/cited booleans.
 *
 * Detection variants are NOT modified — this is presentation only.
 */
export function computeDisplayMatches(args: {
  responseText: string | null
  brandVariants: string[]
  targetDomain: string | null
  mentioned: boolean
  cited: boolean
  citations?: DisplayCitationInput[] | null
}): DisplayMatchesResult {
  const { responseText, brandVariants, targetDomain, mentioned, cited, citations } = args

  const brandLabels: string[] = []
  let domainLabel: string | null = null
  let displayMentioned = mentioned
  let displayCited = cited

  if (responseText) {
    displayMentioned = false
    displayCited = false

    const lower = responseText.toLowerCase()

    const matched: string[] = []
    for (const v of brandVariants) {
      if (lower.includes(v.toLowerCase())) matched.push(v)
    }

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
        if (!domainLabel || v.length > domainLabel.length) {
          domainLabel = v
        }
        displayCited = true
      } else {
        brandLabels.push(v)
        displayMentioned = true
      }
    }

    if (targetDomain) {
      const cleaned = targetDomain.toLowerCase()
      if (
        lower.includes(cleaned) ||
        lower.includes(`www.${cleaned}`) ||
        lower.includes(`https://${cleaned}`) ||
        lower.includes(`http://${cleaned}`)
      ) {
        if (!domainLabel) domainLabel = targetDomain
        displayCited = true
      }
    }
  }

  if (citations && citations.length > 0 && targetDomain) {
    for (const c of citations) {
      if (c.is_target_domain || isTargetCitation(c.domain, targetDomain)) {
        if (!domainLabel) domainLabel = c.domain || targetDomain
        displayCited = true
        break
      }
    }
  }

  if (displayCited && targetDomain && !domainLabel) domainLabel = targetDomain

  return {
    displayMentioned,
    displayCited,
    displayBrandLabels: Array.from(new Set(brandLabels)),
    displayDomainLabel: cleanDisplayDomain(domainLabel),
  }
}
