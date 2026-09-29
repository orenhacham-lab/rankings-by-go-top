/**
 * What the business is, for the recommended AI questions.
 *
 * The questions tab used to take the business type from detectCategory(name,
 * domain, keywords): one regex pass over the business name, the domain and
 * EVERY tracked keyword joined into one string, first match wins. One keyword
 * decided the whole business. A Japan travel site that tracks "אוכל רחוב יפן"
 * next to thirty trip keywords matched /אוכל/ and became a restaurant, and every
 * suggested question was about tables and dinner reservations. The site scan
 * had already said what the business is ("מדריך טיולים ליפן לישראלים") in
 * project_profiles.niche, and nothing on the tab read it.
 *
 * The order here, first that answers wins:
 *   1. manual    what the owner typed ("העסק זוהה כ… · שינוי"). A text that maps
 *                to no known category keeps the owner's words as the label and
 *                takes the category from the sources below, never from a lone
 *                keyword.
 *   2. scan      the site scan's niche (project_profiles, editable in settings).
 *                Only the niche, a one-line statement of what the business is.
 *                The description is not classified: it describes the site's
 *                content, and a travel site's content names food.
 *   3. site      the business name and domain on their own.
 *   4. keywords  only a clear majority: one category must hold at least a third
 *                of the tracked keywords and more than any other. One keyword
 *                about street food among thirty about trips is not a majority.
 *   5. unknown   nothing above answered. The tab asks the owner what the
 *                business does instead of guessing (source 'unknown').
 */
import {
  detectCategory,
  resolveManualPrimaryCategory,
  type BusinessCategory,
  type ManualAIProfile,
} from './prompt-templates'

/** What the site scan stored about the business (project_profiles). */
export type ScanBusiness = { niche: string | null; description: string | null }

export type BusinessIdentitySource = 'manual' | 'scan' | 'site' | 'keywords' | 'unknown'

export type BusinessIdentity = {
  /** The category that picks the question templates. */
  category: BusinessCategory
  /** The owner's own words or the scan's niche; null when only a category is known. */
  label: string | null
  source: BusinessIdentitySource
}

/** Share of the tracked keywords one category must hold to speak for the business. */
export const KEYWORD_MAJORITY_SHARE = 1 / 3

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '')

/** The category a scan niche names, or null when it names none we know. */
export function classifyNiche(niche: string | null | undefined): BusinessCategory | null {
  const text = clean(niche)
  return text ? resolveManualPrimaryCategory(text) : null
}

/**
 * The category most tracked keywords agree on, or null without a clear
 * majority. Each keyword is classified on its own, so one keyword is one vote.
 */
export function categoryFromKeywordMajority(keywords: readonly string[] | null | undefined): BusinessCategory | null {
  const list = (keywords ?? []).map(clean).filter(Boolean)
  if (list.length === 0) return null
  const votes = new Map<BusinessCategory, number>()
  for (const kw of list) {
    const c = detectCategory('', '', [kw])
    if (c !== 'generic') votes.set(c, (votes.get(c) ?? 0) + 1)
  }
  const ranked = Array.from(votes.entries()).sort((a, b) => b[1] - a[1])
  if (ranked.length === 0) return null
  const [winner, count] = ranked[0]
  const runnerUp = ranked[1]?.[1] ?? 0
  const needed = Math.max(1, Math.ceil(list.length * KEYWORD_MAJORITY_SHARE))
  return count >= needed && count > runnerUp ? winner : null
}

export function resolveBusinessIdentity(input: {
  manualProfile: ManualAIProfile | null | undefined
  scan: ScanBusiness | null | undefined
  businessName: string | null | undefined
  domain: string | null | undefined
  keywords: readonly string[] | null | undefined
}): BusinessIdentity {
  const manualText = input.manualProfile?.mode === 'manual' ? clean(input.manualProfile.primaryCategory) : ''
  const scanLabel = clean(input.scan?.niche) || null
  const scanCategory = classifyNiche(scanLabel)
  const site = detectCategory(clean(input.businessName), clean(input.domain), [])
  const siteCategory = site === 'generic' ? null : site
  const keywordCategory = categoryFromKeywordMajority(input.keywords)
  const fallback = scanCategory ?? siteCategory ?? keywordCategory

  if (manualText) {
    return { category: resolveManualPrimaryCategory(manualText) ?? fallback ?? 'generic', label: manualText, source: 'manual' }
  }
  if (scanLabel) return { category: fallback ?? 'generic', label: scanLabel, source: 'scan' }
  if (siteCategory) return { category: siteCategory, label: null, source: 'site' }
  if (keywordCategory) return { category: keywordCategory, label: null, source: 'keywords' }
  return { category: 'generic', label: null, source: 'unknown' }
}
