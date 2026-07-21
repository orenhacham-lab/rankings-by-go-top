/**
 * Stage E2A — conservative, deterministic query clustering (pure).
 *
 * Two queries cluster ONLY when their meaningful-token SETS are identical (after
 * normalization: case, niqqud, punctuation, spacing, and trivial connector stopwords are
 * folded away, order and duplicates ignored). Consequences, by design:
 *   - a single shared head token can NEVER merge two queries;
 *   - any distinguishing modifier (audience, location, product, service, occasion,
 *     commercial need) yields a different token → the queries stay separate;
 *   - grouping is order-independent (queries are bucketed by a canonical set key).
 * This is intentionally strict — "group strongly related queries only".
 */
import { contentTokenSet, normalizeQuery } from './normalize'

export interface ClusterInput { query: string; impressions: number }
export interface QueryCluster {
  key: string
  primaryQuery: string
  relatedQueries: string[]
  members: string[]
}

/** Canonical cluster key: sorted, de-duplicated meaningful tokens joined by space. */
export function clusterKey(query: string): string {
  return contentTokenSet(query).join(' ')
}

/**
 * Bucket queries by their canonical token-set key. Within a cluster the primaryQuery is the
 * highest-impression member (ties broken by the lexicographically smallest NORMALIZED query,
 * then the raw string — fully deterministic). Order of the input never affects the result.
 */
export function clusterQueries(items: ClusterInput[]): QueryCluster[] {
  const buckets = new Map<string, { query: string; impressions: number }[]>()
  for (const it of items) {
    const key = clusterKey(it.query)
    if (!key) continue // skip empty/whitespace-only queries
    const arr = buckets.get(key) ?? []
    arr.push({ query: it.query, impressions: it.impressions })
    buckets.set(key, arr)
  }

  const clusters: QueryCluster[] = []
  for (const [key, members] of buckets) {
    // De-duplicate identical raw query strings (a query can appear on many pages).
    const uniq = Array.from(new Set(members.map((m) => m.query)))
    const imprOf = (q: string) => members.filter((m) => m.query === q).reduce((s, m) => s + m.impressions, 0)
    const ordered = uniq.slice().sort((a, b) => {
      const d = imprOf(b) - imprOf(a)
      if (d !== 0) return d
      const na = normalizeQuery(a), nb = normalizeQuery(b)
      if (na !== nb) return na < nb ? -1 : 1
      return a < b ? -1 : a > b ? 1 : 0
    })
    const primaryQuery = ordered[0]
    clusters.push({ key, primaryQuery, relatedQueries: ordered.slice(1), members: ordered })
  }
  // Deterministic cluster order (by key); the engine re-sorts by score anyway.
  return clusters.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}
