/**
 * The seeding scan's own words for the business, added to the suggestion
 * business scope (W6d).
 *
 * The scan's b5 step keeps AI questions that fall within the profile's niche
 * and audiences (lib/seed-scan/steps-b.ts). The enrichment route, though,
 * filters with extractBusinessScope(project). A seeded project usually has no
 * ai_business_profile, so that scope is only the business name, and the
 * route hid most of the questions b5 had just prepared ("What are the best
 * running shoes for beginners?" did not name the store).
 *
 * The fix only widens the scope, and only for a project that has a seed
 * profile. It adds the profile's niche, its audience labels and the scan's
 * seed keywords as allowed topics. A project without any of them gets the
 * scope it had before, unchanged. So does a project whose scope was empty,
 * since an empty scope accepts every question and adding topics would
 * narrow it. The filter itself is untouched.
 *
 * The profile description is not used. A topic matches when the question
 * contains it, and a 1500-character description is never inside a question;
 * breaking it into words would loosen the filter far beyond the scan's intent.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { readSummary } from '@/lib/seed-scan/summary'
import type { BusinessScope } from './suggestion-cache'

/** The five audiences b5 reads. readSummary already keeps at most five seed keywords, the ones b5 reads. */
export const SEED_SCOPE_AUDIENCES = 5
/** A topic matches as a substring, so a one- or two-letter term would match almost anything. */
export const SEED_SCOPE_MIN_LENGTH = 3

export type SeedScopeTerms = { niche: string | null; audiences: string[]; keywords: string[] }

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '')

/**
 * The project's seed profile terms, read with the service role and filtered by
 * the owner on every table. Any read error counts as no terms, so the route
 * falls back to exactly the scope it had before.
 */
export async function readSeedScopeTerms(admin: ServiceRoleClient, projectId: string, userId: string): Promise<SeedScopeTerms> {
  const none: SeedScopeTerms = { niche: null, audiences: [], keywords: [] }
  try {
    const [profile, audiences, run] = await Promise.all([
      admin.from('project_profiles').select('niche').eq('project_id', projectId).eq('user_id', userId).maybeSingle(),
      admin
        .from('project_audiences')
        .select('label, position')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .order('position', { ascending: true })
        .limit(SEED_SCOPE_AUDIENCES),
      admin
        .from('project_seed_runs')
        .select('summary')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1),
    ])
    const niche = profile.error ? '' : clean((profile.data as { niche?: unknown } | null)?.niche)
    const labels = audiences.error ? [] : ((audiences.data as { label?: unknown }[] | null) ?? []).map((a) => clean(a.label))
    const summary = run.error ? null : readSummary(((run.data as { summary?: unknown }[] | null) ?? [])[0]?.summary)
    const keywords = (summary?.seedKeywords ?? []).map(clean)
    return { niche: niche || null, audiences: labels.filter(Boolean), keywords: keywords.filter(Boolean) }
  } catch {
    return none
  }
}

/**
 * The base scope plus the seed terms: added after the existing topics,
 * deduplicated without regard to case, excluded terms and category untouched.
 * Returns the base object itself when there is nothing to add or when the
 * base had no topics (no topics means no constraint).
 */
export function widenBusinessScope(base: BusinessScope, terms: SeedScopeTerms): BusinessScope {
  if (base.allowedTopics.length === 0) return base
  const seen = new Set(base.allowedTopics.map((t) => t.toLowerCase()))
  const added: string[] = []
  for (const term of [terms.niche ?? '', ...terms.audiences, ...terms.keywords]) {
    const key = term.toLowerCase()
    if (term.length < SEED_SCOPE_MIN_LENGTH || seen.has(key)) continue
    seen.add(key)
    added.push(term)
  }
  if (added.length === 0) return base
  return { ...base, allowedTopics: [...base.allowedTopics, ...added] }
}
