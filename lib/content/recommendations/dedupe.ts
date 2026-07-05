/**
 * Deterministic dedupe + clustering helpers for the recommendation engine.
 * No AI. Token-set Jaccard over normalized Hebrew/English text.
 */

/** Word tokens (len>1), lowercased, punctuation-stripped. */
export function tokens(s: string): Set<string> {
  return new Set(
    (s || '')
      .toLowerCase()
      .replace(/[?!.,:;"'“”׳״()\-–—/|]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1),
  )
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

/** URL-safe-ish stable slug for suggestion ids (keeps Hebrew as-is, lowercased). */
export function slugKey(s: string): string {
  return (s || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '').slice(0, 80)
}

/**
 * A corpus of already-covered phrases (existing topics + generated articles),
 * used to skip near-duplicate suggestions.
 */
export class ExistingCorpus {
  private phrases: { text: string; set: Set<string> }[] = []
  private exact = new Set<string>()

  add(text: string | null | undefined): void {
    const t = (text || '').trim()
    if (!t) return
    this.exact.add(t.toLowerCase())
    this.phrases.push({ text: t, set: tokens(t) })
  }

  /** True when `candidate` closely matches something already covered. */
  isDuplicate(candidate: string, threshold = 0.6): boolean {
    const c = (candidate || '').trim().toLowerCase()
    if (!c) return true
    if (this.exact.has(c)) return true
    const cset = tokens(candidate)
    if (cset.size === 0) return true
    for (const p of this.phrases) {
      if (jaccard(cset, p.set) >= threshold) return true
      // Whole-phrase containment either direction (short titles vs long ones).
      if (c.length >= 6 && (p.text.toLowerCase().includes(c) || c.includes(p.text.toLowerCase()))) return true
    }
    return false
  }
}

/**
 * Cluster strings by token-set similarity. Returns groups (order preserved by
 * first-seen). Each new string joins the first existing cluster it is similar to.
 */
export function clusterByTokens(items: string[], threshold = 0.5): string[][] {
  const clusters: { seed: Set<string>; members: string[] }[] = []
  for (const raw of items) {
    const text = (raw || '').trim()
    if (!text) continue
    const set = tokens(text)
    if (set.size === 0) continue
    let placed = false
    for (const c of clusters) {
      if (jaccard(set, c.seed) >= threshold) {
        c.members.push(text)
        for (const tk of set) c.seed.add(tk) // widen the cluster seed
        placed = true
        break
      }
    }
    if (!placed) clusters.push({ seed: new Set(set), members: [text] })
  }
  return clusters.map((c) => c.members)
}
