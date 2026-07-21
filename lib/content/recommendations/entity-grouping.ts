/**
 * Entity grouping (H) — prevent the "N products → N product-name articles" pattern.
 * PURE, domain-neutral: clusters indexed entities by SHARED head/theme tokens (no
 * hardcoded themes or industry words) so several entities that share a theme yield
 * ONE broader opportunity that references them all as targets. It never forces a
 * group when entities have no shared meaningful token.
 */

import { tokens } from './dedupe'
import { normalizePhrase } from './keyword-guard'

export interface IndexedEntity {
  name: string
  url?: string | null
  type?: string | null
}
export interface EntityGroup {
  /** The shared theme tokens that define the group (the broader subject). */
  themeTokens: string[]
  /** Member entities (≥2). */
  members: IndexedEntity[]
}

const STOP = new Set<string>(
  ['the', 'a', 'an', 'of', 'for', 'and', 'or', 'with', 'in', 'to',
   'של', 'עם', 'את', 'על', 'לפי', 'או', 'ל', 'ב', 'ה', 'ו'].map((t) => normalizePhrase(t)).filter(Boolean),
)
const contentTokens = (name: string): string[] =>
  Array.from(tokens(normalizePhrase(name))).filter((t) => t.length > 1 && !STOP.has(t))

/**
 * Group entities that share a meaningful head token (a candidate theme). Greedy:
 * each frequent shared token whose entity-set size >= minGroup forms one group;
 * an entity can seed at most one group (largest first). Entities with a unique
 * theme are left ungrouped (they keep their own distinct informational demand).
 */
export function groupEntitiesByTheme(entities: IndexedEntity[], minGroup = 2): { groups: EntityGroup[]; ungrouped: IndexedEntity[] } {
  const withToks = entities.map((e) => ({ e, toks: contentTokens(e.name) })).filter((x) => x.toks.length > 0)
  // token → member indexes
  const tokenMembers = new Map<string, number[]>()
  withToks.forEach((x, i) => {
    for (const t of new Set(x.toks)) {
      const arr = tokenMembers.get(t) ?? []
      arr.push(i); tokenMembers.set(t, arr)
    }
  })
  // candidate themes: tokens shared by >= minGroup entities, largest first.
  const candidates = Array.from(tokenMembers.entries())
    .filter(([, idxs]) => idxs.length >= minGroup)
    .sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))

  const used = new Set<number>()
  const groups: EntityGroup[] = []
  for (const [token, idxs] of candidates) {
    const free = idxs.filter((i) => !used.has(i))
    if (free.length < minGroup) continue
    free.forEach((i) => used.add(i))
    groups.push({ themeTokens: [token], members: free.map((i) => withToks[i].e) })
  }
  const ungrouped = withToks.filter((_, i) => !used.has(i)).map((x) => x.e)
  return { groups, ungrouped }
}
