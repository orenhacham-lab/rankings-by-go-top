/**
 * Template-based article-topic suggestions (Phase 2A UX).
 *
 * Produces natural-sounding SEO/GEO topic ideas from a keyword. Intentionally
 * simple and deterministic — NO AI provider. The signature is shaped so a
 * future AI-backed generator can replace the body without changing callers.
 */

export type SuggestionLanguage = 'he' | 'en'
export type SuggestionIntent =
  | 'informational'
  | 'commercial'
  | 'local'
  | 'comparison'
  | 'transactional'
  | 'other'

/** Base templates that read naturally for most keywords. */
const HE_BASE = (kw: string): string[] => [
  `איך לבחור ${kw}?`,
  `${kw}: מה חשוב לבדוק לפני שקונים?`,
  `${kw} מומלץ — איך יודעים מה לבחור?`,
  `כמה עולה ${kw}?`,
  `טעויות נפוצות בבחירת ${kw}`,
  `${kw}: מדריך מלא למתחילים`,
]

const EN_BASE = (kw: string): string[] => [
  `How to choose ${kw}?`,
  `What should you know before choosing ${kw}?`,
  `${kw}: a complete beginner's guide`,
  `How much does ${kw} cost?`,
  `Common mistakes when choosing ${kw}`,
  `Best ${kw}: what should you compare?`,
]

/** A couple of intent-flavoured extras so the list feels tailored. */
const HE_INTENT: Partial<Record<SuggestionIntent, (kw: string) => string[]>> = {
  comparison: (kw) => [`${kw}: השוואה בין האפשרויות הפופולריות`, `מה ההבדל בין סוגי ${kw}?`],
  commercial: (kw) => [`${kw} — איך בוחרים נכון ולא מתחרטים?`, `על מה כדאי לשים דגש כשקונים ${kw}?`],
  local: (kw) => [`${kw}: איך בוחרים ספק מקומי אמין?`],
  transactional: (kw) => [`מתי כדאי להזמין ${kw} — וממי?`],
  informational: (kw) => [`כל מה שחשוב לדעת על ${kw}`],
}

const EN_INTENT: Partial<Record<SuggestionIntent, (kw: string) => string[]>> = {
  comparison: (kw) => [`${kw}: comparing the popular options`, `What's the difference between types of ${kw}?`],
  commercial: (kw) => [`${kw} — how to choose the right one`, `What to look for when buying ${kw}`],
  local: (kw) => [`${kw}: how to pick a trustworthy local provider`],
  transactional: (kw) => [`When (and where) should you order ${kw}?`],
  informational: (kw) => [`Everything you need to know about ${kw}`],
}

/**
 * Return up to `max` distinct, natural topic suggestions for a keyword.
 * Returns [] for an empty keyword.
 */
export function suggestTopics(
  keyword: string,
  language: SuggestionLanguage,
  intent: SuggestionIntent = 'commercial',
  max = 8
): string[] {
  const kw = keyword.trim()
  if (!kw) return []

  const base = language === 'he' ? HE_BASE(kw) : EN_BASE(kw)
  const intentExtra = (language === 'he' ? HE_INTENT : EN_INTENT)[intent]?.(kw) ?? []

  // Intent-flavoured topics first so the list feels tailored, then the base set.
  const seen = new Set<string>()
  const out: string[] = []
  for (const topic of [...intentExtra, ...base]) {
    const key = topic.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(topic)
    if (out.length >= max) break
  }
  return out
}
