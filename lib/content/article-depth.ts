/**
 * Phase 3D — smart article depth / length by topic type.
 *
 * Pure, deterministic. Given a topic (title/keyword/secondary/search-intent/brief)
 * and an optional manual override, resolves an article DEPTH and a target word
 * range that varies by topic type — so articles aren't all the same length —
 * WITHOUT blindly forcing 2,000+ words. No I/O, no schema dependency.
 */

export type ArticleDepth = 'support' | 'standard' | 'deep' | 'commercial' | 'auto'
/** The concrete depths (never 'auto'). */
export type ResolvedDepth = Exclude<ArticleDepth, 'auto'>

export const ARTICLE_DEPTHS: ArticleDepth[] = ['auto', 'support', 'standard', 'deep', 'commercial']

/** Hebrew-first word ranges per depth. */
export const DEPTH_RANGES: Record<ResolvedDepth, { min: number; max: number }> = {
  support: { min: 1000, max: 1400 },
  standard: { min: 1500, max: 1800 },
  deep: { min: 1900, max: 2300 },
  commercial: { min: 1700, max: 2200 },
}

// --- classifier term lists (normalized lowercase; Hebrew has no case) ---------
const STRONG_BUY = ['לקנות', 'קנייה', 'קניה', 'למכירה', 'מבצע']
const GUIDE = ['מדריך', 'איך לבחור', 'איך ', 'כיצד', 'השוואה', 'לעומת', 'מסלול', 'טיפים', 'כל מה שצריך לדעת', 'לפני שקונים', 'לפני שקונה', 'לפני שרוכשים']
const SOFT_COMMERCIAL = ['מחיר', 'עלות', 'מומלץ', 'מומלצים', 'הכי טוב', 'לבית', 'ביתי', 'לבית ']
const SUPPORT = ['יתרונות', 'חסרונות', 'מה זה', 'מהו', 'מהי', 'סוגי', 'הבדל בין', 'למה כדאי']

export interface DepthInput {
  title: string
  primaryKeyword?: string | null
  secondaryKeywords?: string[] | null
  searchIntent?: string | null
  briefNotes?: string | null
}

const has = (hay: string, terms: string[]) => terms.some((t) => hay.includes(t))

/**
 * Auto-classify a topic into a concrete depth (never 'auto'). Ordered rules:
 *  1. search intent commercial/transactional → commercial
 *  2. strong buy terms → commercial
 *  3. guide/how-to/comparison terms → deep
 *  4. search intent comparison → deep
 *  5. soft commercial (price / recommended / for-home) → commercial
 *  6. narrow informational (benefits / what-is / types) → support
 *  7. default → standard
 */
export function classifyDepth(input: DepthInput): ResolvedDepth {
  const hay = [input.title, input.primaryKeyword ?? '', ...(input.secondaryKeywords ?? []), input.briefNotes ?? '']
    .join(' ').toLowerCase()
  const intent = (input.searchIntent ?? '').toLowerCase()

  if (intent === 'commercial' || intent === 'transactional') return 'commercial'
  if (has(hay, STRONG_BUY)) return 'commercial'
  if (has(hay, GUIDE)) return 'deep'
  if (intent === 'comparison') return 'deep'
  if (has(hay, SOFT_COMMERCIAL)) return 'commercial'
  if (has(hay, SUPPORT)) return 'support'
  return 'standard'
}

export interface ResolvedArticleDepth {
  depth: ResolvedDepth
  minWords: number
  maxWords: number
  auto: boolean // true when auto-classified (no explicit override)
}

/**
 * Resolve the effective depth + word range: an explicit override (support /
 * standard / deep / commercial) wins; 'auto' or absent → auto-classify.
 */
export function resolveArticleDepth(input: DepthInput, override?: ArticleDepth | null): ResolvedArticleDepth {
  const isOverride = override != null && override !== 'auto' && override in DEPTH_RANGES
  const depth: ResolvedDepth = isOverride ? (override as ResolvedDepth) : classifyDepth(input)
  const { min, max } = DEPTH_RANGES[depth]
  return { depth, minWords: min, maxWords: max, auto: !isOverride }
}

/** Human-readable depth label for the generation prompt. */
export const DEPTH_PROMPT_LABEL: Record<ResolvedDepth, string> = {
  support: 'a concise SUPPORTING article',
  standard: 'a STANDARD article',
  deep: 'a DEEP, comprehensive guide-style article',
  commercial: 'a COMMERCIAL / purchase-intent article',
}
