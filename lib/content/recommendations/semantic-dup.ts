/**
 * Canonical Hebrew-aware topic identity + PROVEN high-confidence semantic
 * duplicate detection — PURE, domain-neutral.
 *
 * Why this exists (live-proven): every dedupe layer on the default path was
 * exact-string, and the one semantic layer (intra-run ≥3-shared-token rule)
 * structurally cannot fire on 2-3-word Hebrew keywords — so one run accepted
 * multiple magnesium / digestive-enzyme / children-vitamin topics. Its token
 * normalizer also mangled roots ("מגנזיום"→"גנזיום", a root מ stripped as a
 * particle) and never folded final letters ("ויטמין"≠"ויטמינ").
 *
 * Identity model: a topic signature = HEAD (the first distinctive content
 * token — in Hebrew the construct-state subject noun) + MODIFIERS (remaining
 * distinctive tokens) + intent cluster. Two topics are a HIGH-CONFIDENCE
 * duplicate ONLY when their heads match, their modifier sets overlap at ≥ 0.5
 * (Jaccard), and their intent clusters are compatible. A broad topic ("פרחים")
 * never blocks a distinct long-tail ("משלוח פרחים לחתונה") — different head or
 * disjoint modifiers keeps both. Calibrated against the observed defect pairs
 * (see semantic-dup QA).
 */

const HE = /[א-ת]/
const FINAL_FOLD: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' }
const PROCLITICS = new Set(['ו', 'ה', 'ב', 'ל', 'מ', 'ש', 'כ'])

const STOPWORDS = new Set([
  'מדוע', 'איך', 'האם', 'מה', 'מתי', 'איפה', 'למה', 'כיצד', 'מהו', 'מהי', 'הוא', 'היא', 'זה', 'זו', 'זאת',
  'של', 'את', 'עם', 'על', 'אל', 'כי', 'גם', 'או', 'אבל', 'יש', 'אין', 'הכי', 'כל', 'כדי', 'בין', 'ללא', 'לכל',
  'the', 'a', 'an', 'to', 'of', 'for', 'and', 'or', 'is', 'how', 'why', 'what', 'best', 'guide',
])

/** Fold Hebrew final letters so "ויטמין"/"ויטמינים" share a base form. */
export function foldFinals(s: string): string {
  return s.replace(/[ךםןףץ]/g, (c) => FINAL_FOLD[c] ?? c)
}

/**
 * ONE canonical token form: lowercase, finals folded, then a SAFE plural fold
 * (־ים/־ות stripped only when ≥3 letters remain, finals already folded so ־ים
 * surfaces as ־ימ). Proclitic stripping is NEVER applied here (it mangles
 * roots like "מגנזיום"); de-prefixed variants come from canonicalVariants.
 */
export function canonicalToken(raw: string): string {
  let t = foldFinals((raw || '').toLowerCase().trim())
  if (/^[א-ת]+$/.test(t)) {
    t = t.replace(/(ימ|ות)$/, (m) => (t.length - m.length >= 3 ? '' : m))
  }
  return t
}

/** All match variants of one surface token: canonical form + a de-prefixed
 *  variant when a single proclitic strip leaves a real word (≥3 letters). */
export function canonicalVariants(raw: string): string[] {
  const c = canonicalToken(raw)
  const out = [c]
  if (/^[א-ת]+$/.test(c) && c.length >= 4 && PROCLITICS.has(c[0])) {
    const base = c.slice(1)
    if (base.length >= 3) out.push(base)
  }
  return out
}

/** Distinctive content tokens of a phrase (stopwords removed, canonicalized).
 *  Order-preserving (the FIRST token is the construct-state head candidate). */
export function distinctiveTokensOf(s: string): string[] {
  const out: string[] = []
  for (const w of (s || '').toLowerCase().replace(/[?!.,:;"'“”׳״()\-–—/|]/g, ' ').split(/\s+/)) {
    if (w.length <= 1) continue
    const c = canonicalToken(w)
    if (!c || c.length <= 1 || STOPWORDS.has(w) || STOPWORDS.has(c)) continue
    out.push(c)
  }
  return out
}

export type IntentCluster = 'buy' | 'info' | 'local' | 'other'
export function intentClusterOf(intent: string | undefined): IntentCluster {
  const i = (intent || '').toLowerCase()
  if (/transactional|commercial|comparison/.test(i)) return 'buy'
  if (/informational/.test(i)) return 'info'
  if (/local/.test(i)) return 'local'
  return 'other'
}

export interface TopicSignature {
  head: string | null
  modifiers: Set<string>
  intentCluster: IntentCluster
}

/** Signature over primaryKeyword (the search target — NOT the title, whose
 *  phrasing varies freely). Head = first distinctive keyword token. */
export function topicSignature(primaryKeyword: string, intent?: string): TopicSignature {
  const toks = distinctiveTokensOf(primaryKeyword)
  return { head: toks[0] ?? null, modifiers: new Set(toks.slice(1)), intentCluster: intentClusterOf(intent) }
}

function headsMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  if (a === b) return true
  // A single safe proclitic difference is the same head ("הזר" vs "זר").
  const va = new Set([a, ...(a.length >= 4 && PROCLITICS.has(a[0]) ? [a.slice(1)] : [])])
  const vb = new Set([b, ...(b.length >= 4 && PROCLITICS.has(b[0]) ? [b.slice(1)] : [])])
  for (const x of va) if (vb.has(x)) return true
  return false
}

/**
 * PROVEN high-confidence semantic duplicate: same subject HEAD + modifier
 * Jaccard ≥ 0.5 + compatible intent cluster. Empty-modifier cases: two bare
 * heads with the same head ARE duplicates; a bare head vs a modified head is
 * NOT (a broad pending idea must not block a distinct supported long-tail).
 */
export function isHighConfidenceDuplicate(a: TopicSignature, b: TopicSignature): boolean {
  if (a.intentCluster !== b.intentCluster) return false
  if (headsMatch(a.head, b.head)) {
    if (a.modifiers.size === 0 && b.modifiers.size === 0) return true
    if (a.modifiers.size === 0 || b.modifiers.size === 0) return false
    let shared = 0
    for (const m of a.modifiers) {
      if (b.modifiers.has(m)) { shared++; continue }
      // proclitic-tolerant modifier match ("לילדים" vs "ילדים").
      for (const v of canonicalVariants(m)) if (v !== m && b.modifiers.has(v)) { shared++; break }
    }
    const union = a.modifiers.size + b.modifiers.size - shared
    return union > 0 && shared / union >= 0.5
  }
  // SUBSET branch: a keyword that PREPENDS a facet re-orders the head ("מינון
  // מגנזיום לילדים" vs "מגנזיום לילדים") — when the smaller signature's FULL
  // token set (head+modifiers, ≥2 tokens so a bare broad head never matches)
  // is contained in the larger's with at most 2 additions, it is the same core
  // question with one added facet → duplicate.
  const setOf = (s: TopicSignature) => new Set([...(s.head ? [s.head] : []), ...s.modifiers])
  const ta = setOf(a)
  const tb = setOf(b)
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta]
  if (small.size < 2 || large.size - small.size > 2) return false
  for (const t of small) {
    if (large.has(t)) continue
    let matched = false
    for (const v of canonicalVariants(t)) if (v !== t && large.has(v)) { matched = true; break }
    if (!matched) {
      // proclitic-tolerant in the other direction ("לילד" in small, "ילד" in large).
      for (const l of large) { if (canonicalVariants(l).includes(t)) { matched = true; break } }
    }
    if (!matched) return false
  }
  return true
}

/** Convenience: high-confidence duplicate check between two keyword strings. */
export function isSemanticTopicDuplicate(
  a: { primaryKeyword: string; intent?: string },
  b: { primaryKeyword: string; intent?: string },
): boolean {
  return isHighConfidenceDuplicate(topicSignature(a.primaryKeyword, a.intent), topicSignature(b.primaryKeyword, b.intent))
}
