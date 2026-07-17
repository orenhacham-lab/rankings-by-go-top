/**
 * Title-pattern diversity (pure, domain-neutral).
 *
 * A batch where every title opens with the same template ("המדריך המלא: …" ×8)
 * reads machine-generated even when each topic is individually valid. This
 * module extracts a NORMALIZED OPENING SKELETON per title (punctuation,
 * definite articles and minor grammatical variants folded) and enforces:
 *   - at most ONE title per run opening with a mega-guide template
 *     (המדריך המלא / המדריך השלם / כל מה שצריך לדעת);
 *   - at most TWO titles per run sharing any one opening skeleton
 *     (איך לבחור…, מה חשוב לדעת…, מה ההבדל בין…, המדריך ל…, subject-led
 *     openings included).
 * Diversity is never allowed to be ARTIFICIAL: the only deterministic rewrite
 * offered (dedupeMegaGuideTitle) strips a redundant mega-guide prefix when the
 * remainder is a well-formed standalone title — subject and keyword alignment
 * are preserved, and when no safe strip exists the title is left untouched
 * (the acceptance rule reports it instead).
 */

/** Normalize a title for skeleton comparison: lowercase, punctuation folded to
 *  spaces, leading definite-article ה folded per word (המדריך≈מדריך). */
export function normalizeTitleForSkeleton(title: string): string {
  const words = (title || '')
    .toLowerCase()
    .replace(/[?!.,:;"'“”׳״()\-–—/|]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (/^ה[א-ת]{2,}$/.test(w) ? w.slice(1) : w))
  return words.join(' ')
}

/** Mega-guide openings (rule 1): at most ONE per run. Variants folded: with or
 *  without the definite article, השלם/המלא, "כל מה שצריך/שכדאי/שחשוב לדעת". */
const MEGA_GUIDE_RE = /^(?:מדריך\s+(?:מלא|שלמ|שלם|מקיף)|כל\s+מה\s+ש(?:צריך|כדאי|חשוב)\s+לדעת)(?:\s|$)/

/** Enumerated TEMPLATE skeleton families (normalized input). Minor grammatical
 *  variants (כיצד≈איך, בוחרים≈לבחור, מהו/מהי≈מה זה …) fold into one key. */
const TEMPLATE_SKELETONS: { key: string; re: RegExp }[] = [
  { key: 'mega_guide', re: MEGA_GUIDE_RE },
  { key: 'how_to_choose', re: /^(?:איך|כיצד)\s+(?:לבחור|בוחרים)(?:\s|$)/ },
  { key: 'how_to', re: /^(?:איך|כיצד)\s+/ },
  { key: 'what_to_know', re: /^מה\s+(?:חשוב|כדאי|צריך)\s+לדעת(?:\s|$)/ },
  { key: 'difference_between', re: /^(?:מה\s+)?(?:הבדל(?:ים)?|הבדלימ)\s+בין(?:\s|$)/ },
  { key: 'guide_to', re: /^מדריך\s+ל/ },
  { key: 'what_is', re: /^(?:מה\s+זה|מהו|מהי|מהם|מהן)(?:\s|$)/ },
  { key: 'why', re: /^(?:למה|מדוע)\s+/ },
  { key: 'common_mistakes', re: /^טעויות\s+נפוצות(?:\s|$)/ },
  { key: 'checklist', re: /^(?:צ'קליסט|צקליסט|רשימת\s+בדיקה)(?:\s|$)/ },
]

/** The normalized opening skeleton of one title. Template openings map to their
 *  family key; subject-led titles map to their first two normalized tokens (a
 *  natural signature that differs per subject). */
export function titleSkeleton(title: string): string {
  const n = normalizeTitleForSkeleton(title)
  for (const t of TEMPLATE_SKELETONS) if (t.re.test(n)) return t.key
  const toks = n.split(' ')
  return `open:${toks.slice(0, 2).join(' ')}`
}

/** True when the title opens with a mega-guide template (rule-1 family). */
export function isMegaGuideOpening(title: string): boolean {
  return MEGA_GUIDE_RE.test(normalizeTitleForSkeleton(title))
}

export interface TitleDiversityResult {
  pass: boolean
  violations: string[]
  skeletons: Record<string, number>
}

/** Evaluate a run's accepted titles against both diversity rules. */
export function evaluateTitleDiversity(titles: string[]): TitleDiversityResult {
  const skeletons: Record<string, number> = {}
  let mega = 0
  for (const t of titles) {
    const k = titleSkeleton(t)
    skeletons[k] = (skeletons[k] ?? 0) + 1
    if (isMegaGuideOpening(t)) mega++
  }
  const violations: string[] = []
  if (mega > 1) violations.push(`${mega} titles open with a mega-guide template (המדריך המלא/השלם / כל מה שצריך לדעת) — max 1`)
  for (const [k, n] of Object.entries(skeletons)) {
    if (k !== 'mega_guide' && n > 2) violations.push(`${n} titles share the opening skeleton "${k}" — max 2`)
  }
  return { pass: violations.length === 0, violations, skeletons }
}

/**
 * SAFE deterministic de-templating (engine-side, never artificial): when a run
 * already accepted one mega-guide title, a later "המדריך המלא: X" is reduced to
 * its own standalone core "X" — ONLY when X is a well-formed title of ≥3 words.
 * Anything not safely strippable is returned unchanged (acceptance reports it).
 */
export function dedupeMegaGuideTitle(title: string, acceptedTitles: string[]): string {
  if (!isMegaGuideOpening(title)) return title
  if (!acceptedTitles.some((t) => isMegaGuideOpening(t))) return title
  const m = (title || '').match(/^\s*(?:ה?מדריך\s+(?:ה?מלא|ה?שלם|ה?מקיף)|כל\s+מה\s+ש(?:צריך|כדאי|חשוב)\s+לדעת(?:\s+על)?)\s*[:—–-]?\s*(.+)$/)
  const core = (m?.[1] ?? '').trim()
  if (core && core.split(/\s+/).filter(Boolean).length >= 3) return core
  return title
}
