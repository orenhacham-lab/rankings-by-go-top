/**
 * Diversity allocation (G) — PURE, domain-neutral. Rank globally, then select with
 * diversity constraints so a plan is not 50 variations of one subject: cap repeated
 * primary subject / entity / seasonal, balance opportunity types + intents, and drop
 * topics answering the same user need. Highest-scoring safe topics are preserved first.
 */

export interface DiversityItem {
  key: string
  score: number
  /** Distinctive subject tokens (first = the dominant subject). */
  subjectTokens: string[]
  /** Primary commercial target / entity url or null. */
  entityKey: string | null
  intent: string
  opportunityType: string
  isSeasonal: boolean
}

export interface DiversityCaps {
  maxPerSubject: number
  maxPerEntity: number
  maxSeasonal: number
  /** Max fraction of the selection any single intent may occupy (soft balance). */
  maxIntentFraction: number
  maxPerType: number
}

export const DEFAULT_CAPS: DiversityCaps = { maxPerSubject: 3, maxPerEntity: 2, maxSeasonal: 8, maxIntentFraction: 0.6, maxPerType: 20 }

export interface DiversityResult {
  selected: DiversityItem[]
  duplicate_clusters_removed: number
  distribution_by_intent: Record<string, number>
  distribution_by_opportunity_type: Record<string, number>
}

const needKeyOf = (it: DiversityItem) => `${it.intent}|${it.subjectTokens.slice().sort().join(',')}`
const subjectOf = (it: DiversityItem) => it.subjectTokens[0] ?? ''

/**
 * Select up to `targetCount` diverse items. Two passes: (1) strict caps for maximum
 * spread; (2) if still short of target AND items remain, relax the per-subject/type/
 * intent caps (never the dedup) so we still return the best available rather than pad.
 */
export function selectDiverse(items: DiversityItem[], targetCount: number, caps: DiversityCaps = DEFAULT_CAPS): DiversityResult {
  const ranked = items.slice().sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : 1))
  const selected: DiversityItem[] = []
  const seenNeed = new Set<string>()
  const bySubject = new Map<string, number>()
  const byEntity = new Map<string, number>()
  const byIntent = new Map<string, number>()
  const byType = new Map<string, number>()
  let seasonal = 0
  let duplicate_clusters_removed = 0
  const dupCounted = new Set<string>()

  const tryAdd = (it: DiversityItem, relax: boolean): boolean => {
    const need = needKeyOf(it)
    if (seenNeed.has(need)) { if (!dupCounted.has(it.key)) { dupCounted.add(it.key); duplicate_clusters_removed++ } return false } // dedup NEVER relaxes; count each item once
    const subj = subjectOf(it)
    const intentFracCap = Math.max(1, Math.ceil(targetCount * caps.maxIntentFraction))
    if (!relax) {
      if (subj && (bySubject.get(subj) ?? 0) >= caps.maxPerSubject) return false
      if (it.entityKey && (byEntity.get(it.entityKey) ?? 0) >= caps.maxPerEntity) return false
      if (it.isSeasonal && seasonal >= caps.maxSeasonal) return false
      if ((byIntent.get(it.intent) ?? 0) >= intentFracCap) return false
      if ((byType.get(it.opportunityType) ?? 0) >= caps.maxPerType) return false
    }
    selected.push(it)
    seenNeed.add(need)
    if (subj) bySubject.set(subj, (bySubject.get(subj) ?? 0) + 1)
    if (it.entityKey) byEntity.set(it.entityKey, (byEntity.get(it.entityKey) ?? 0) + 1)
    byIntent.set(it.intent, (byIntent.get(it.intent) ?? 0) + 1)
    byType.set(it.opportunityType, (byType.get(it.opportunityType) ?? 0) + 1)
    if (it.isSeasonal) seasonal++
    return true
  }

  for (const it of ranked) { if (selected.length >= targetCount) break; tryAdd(it, false) }
  if (selected.length < targetCount) {
    const chosen = new Set(selected.map((s) => s.key))
    for (const it of ranked) { if (selected.length >= targetCount) break; if (!chosen.has(it.key)) tryAdd(it, true) }
  }

  const distribution_by_intent: Record<string, number> = {}
  const distribution_by_opportunity_type: Record<string, number> = {}
  for (const s of selected) {
    distribution_by_intent[s.intent] = (distribution_by_intent[s.intent] ?? 0) + 1
    distribution_by_opportunity_type[s.opportunityType] = (distribution_by_opportunity_type[s.opportunityType] ?? 0) + 1
  }
  return { selected, duplicate_clusters_removed, distribution_by_intent, distribution_by_opportunity_type }
}
