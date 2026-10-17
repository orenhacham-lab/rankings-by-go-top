import React from 'react'
import { computeDisplayMatches, buildDomainList } from '@/lib/ai-visibility/display-classification'

/**
 * Highlight matched brand variants and domain inside text.
 * Returns React nodes with matched portions wrapped in a styled span.
 * Case-insensitive. Hebrew/RTL safe — only renders the text, doesn't modify raw.
 */
export function highlightMatches(
  text: string,
  brandVariants: string[],
  targetDomain: string | null
): React.ReactNode {
  if (!text) return text

  // Build a unique, sorted-by-length-desc list of search terms
  const terms = new Set<string>()
  for (const v of brandVariants) {
    if (v && v.trim().length >= 2) terms.add(v.trim())
  }
  if (targetDomain && targetDomain.trim().length >= 2) {
    const cleaned = targetDomain.trim().toLowerCase()
    terms.add(cleaned)
    terms.add(`www.${cleaned}`)
    terms.add(`https://${cleaned}`)
    terms.add(`http://${cleaned}`)
    terms.add(`https://www.${cleaned}`)
    terms.add(`http://www.${cleaned}`)
  }
  if (terms.size === 0) return text

  const sortedTerms = Array.from(terms).sort((a, b) => b.length - a.length)
  const escaped = sortedTerms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi')

  const parts = text.split(pattern)
  const lowerTerms = new Set(sortedTerms.map((s) => s.toLowerCase()))

  return parts.map((part, i) => {
    if (!part) return null
    if (lowerTerms.has(part.toLowerCase())) {
      return (
        <span
          key={i}
          className="font-bold text-ok bg-ok-soft px-1 rounded-control"
        >
          {part}
        </span>
      )
    }
    return <React.Fragment key={i}>{part}</React.Fragment>
  })
}

/**
 * Find which brand variant (or domain) actually appears in the response text,
 * for display as a chip on the result row. Falls back to first variant if
 * the response text isn't loaded yet but the row is marked mentioned.
 */
/**
 * Strip protocol, query params, hash, and trailing slashes for clean display.
 * Detection variants are not modified — this is presentation only.
 */
export function cleanDisplayDomain(s: string | null): string | null {
  if (!s) return s
  return s
    .replace(/^https?:\/\//i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .trim()
}

/**
 * Check if a citation's domain matches the target domain (ignoring www prefix).
 * Used for citation-list rendering and for setting reCited from sources.
 */
export function isTargetCitation(citationDomain: string | null | undefined, targetDomain: string | null): boolean {
  if (!citationDomain || !targetDomain) return false
  const c = citationDomain.toLowerCase().replace(/^www\./, '')
  const t = targetDomain.toLowerCase().replace(/^www\./, '')
  return c === t
}

/**
 * Re-evaluate a result's signals for display. Delegates to the shared
 * computeDisplayMatches so the client, server and scripts stay in lock-step.
 *
 * Strict separation:
 *   - A project domain in the ANSWER body → mention (reMentioned), never reCited.
 *   - reCited is true ONLY when a project domain is in the SOURCES list.
 *
 * `domainList` carries the project domain + any domain aliases.
 */
export function findMatchedLabels(
  responseText: string | null,
  brandVariants: string[],
  targetDomain: string | null,
  mentioned: boolean,
  cited: boolean,
  citations?: Array<{ domain: string; is_target_domain: boolean; url: string; title?: string | null }> | null,
  domainList?: string[]
): {
  brandLabels: string[]
  domainLabel: string | null
  reMentioned: boolean
  reCited: boolean
  reBrandMentioned: boolean
  reDomainMentioned: boolean
  domainInAnswerLabel: string | null
  domainInSourceLabel: string | null
} {
  const d = computeDisplayMatches({
    responseText,
    brandVariants,
    targetDomain,
    domainList: domainList ?? buildDomainList(targetDomain),
    mentioned,
    cited,
    citations: citations ?? null,
  })

  return {
    brandLabels: d.displayBrandLabels,
    domainLabel: d.displayDomainLabel,
    reMentioned: d.mentionedInAnswer,
    reCited: d.citedAsSource,
    reBrandMentioned: d.brandMentioned,
    reDomainMentioned: d.domainMentioned,
    domainInAnswerLabel: d.domainInAnswerLabel,
    domainInSourceLabel: d.domainInSourceLabel,
  }
}

export function formatShortDateTime(iso: string, isHebrew: boolean): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString(isHebrew ? 'he-IL' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}
