/**
 * How related each keyword of the research is to the site's own content
 * (w8-relevance).
 *
 * WHY. The research's relevance filter (researchKeywordIssue) asks whether a
 * keyword's words appear somewhere on the site. For japan4u, a Japan travel
 * site, "טיולים בדרום" (trips in Israel's south) passed: every page says "טיול",
 * and one page compares Japan with South Korea ("דרום קוריאה"). It was the third
 * easy win. That filter is shared with the scan and the content engine and
 * stays as it is; the owner did not want heavier filtering.
 *
 * THE SCORE. What the site is about comes from its page titles, the scan's
 * niche and seed keywords, the tracked keywords and the business name
 * (lib/ai-visibility/site-topics.ts). Each keyword gets 0-100: the site's
 * subject ("יפן") 100, one of its pages' subjects ("טוקיו") 90, another name
 * the site uses 70, a name only a subtitle mentions 60, the field's everyday
 * words only ("טיולים", "מסלול") 20, nothing 0. At RELATED_MIN (50) and above a
 * keyword is related; below it, it is listed apart ("פחות קשורים לאתר שלכם"),
 * collapsed, never deleted. The lists rank by the score first.
 *
 * With too few titled pages there is no profile: every keyword counts as
 * related, and every list stays exactly as it was.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { classifyNiche } from '@/lib/ai-visibility/business-identity'
import { buildSiteTopics, decodeTitle, RELATED_MIN, SITE_TOPICS_MIN_PAGES, topicMatch, type SiteTopics, type TopicMatch } from '@/lib/ai-visibility/site-topics'

export { RELATED_MIN }
export type { SiteTopics }

/** The most page titles a profile is built from. */
export const MAX_SITE_TITLES = 600

export type SiteRelevance = Pick<TopicMatch, 'tier' | 'score' | 'term'> & { related: boolean }

/** The site's profile for the research, or null when the site's pages say too little. */
export function researchSiteTopics(input: {
  titles: readonly string[]
  niche: string | null
  businessName: string | null
  domain: string | null
  /** The scan's seed keywords and the tracked keywords. */
  terms: readonly string[]
}): SiteTopics | null {
  return buildSiteTopics({
    pages: input.titles.slice(0, MAX_SITE_TITLES).map((title) => ({ title })),
    niche: input.niche,
    businessName: input.businessName,
    domain: input.domain,
    category: classifyNiche(input.niche),
    terms: input.terms,
  })
}

export function siteRelevance(keyword: string, topics: SiteTopics | null | undefined): SiteRelevance | null {
  if (!topics) return null
  const m = topicMatch(keyword, topics)
  return { tier: m.tier, score: m.score, term: m.term, related: m.score >= RELATED_MIN }
}

/**
 * The site's page titles, for the profile: the full-site mapping, else the
 * content index the vocabulary reads. Both reads are filtered by the project
 * AND its owner. Any failure reads as no titles (no profile, lists unchanged).
 */
export async function readSiteTitles(db: SupabaseClient, scope: { projectId: string; userId: string }): Promise<string[]> {
  const titles: string[] = []
  const seen = new Set<string>()
  const add = (t: unknown) => {
    const title = decodeTitle(typeof t === 'string' ? t : '').replace(/\s+/g, ' ').trim()
    if (!title || seen.has(title) || titles.length >= MAX_SITE_TITLES) return
    seen.add(title)
    titles.push(title)
  }
  try {
    const { data, error } = await db
      .from('site_page_map')
      .select('entries')
      .eq('project_id', scope.projectId)
      .eq('user_id', scope.userId)
      .maybeSingle()
    if (!error) for (const e of ((data as { entries?: unknown } | null)?.entries as Array<{ t?: unknown }> | null) ?? []) add(e?.t)
  } catch { /* no mapping */ }
  if (titles.length >= SITE_TOPICS_MIN_PAGES) return titles
  try {
    const { data, error } = await db
      .from('wordpress_content_index')
      .select('targets')
      .eq('project_id', scope.projectId)
      .eq('user_id', scope.userId)
      .maybeSingle()
    if (!error) for (const t of ((data as { targets?: unknown } | null)?.targets as Array<{ targetTitle?: unknown }> | null) ?? []) add(t?.targetTitle)
  } catch { /* no index */ }
  return titles
}
