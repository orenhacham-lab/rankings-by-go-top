/**
 * The ONE normalization applied to an idea's keyword as it is stored.
 *
 * Deliberately a module with NO imports. `keyword-guard.ts` imports
 * `normalizeText` from `recommendations/topic-idea-store.ts`, so when the store
 * imported `keyword-shape.ts` (and through it the acceptance gate, which imports
 * keyword-guard) the cycle made keyword-guard evaluate while `lib/text/segment`
 * was still initializing: `normalizePhrase` then threw "Cannot read properties of
 * undefined". Measured as three recommendation suites hanging for hours instead
 * of failing. Judging a keyword belongs in `keyword-shape.ts`; tidying the one
 * the model just wrote belongs here.
 */

/**
 * The keyword to STORE on a new idea (`content_topic_ideas.primary_keyword`).
 *
 * ONE normalization, and deliberately only one: a trailing question or
 * exclamation mark is dropped. Measured on 15 November 2026, 14 stored keywords
 * end in one over a phrase that is otherwise fine ("אילו פרחים מתאימים לזר יום
 * הולדת?"), and the mark travels from there into the WordPress focus keyphrase
 * and the internal-link anchor candidates, where it matches nothing.
 *
 * It does NOT run the headline stripper over the model's answer. That was tried
 * and measured first: the stripper rewrote 156 of 2,432 real keywords, and most
 * of the rewrites were damage — "איך לבחור בושם במתנה" (a phrase people really
 * type) became "בושם במתנה", "איך לאחסן בושם" became the broken "לאחסן בושם",
 * and "Guerlain - גרלן מדריך" lost the brand's Hebrew name. The stripper is for
 * a value the engine is about to JUDGE, not for a value it is about to keep.
 */
export function normalizedIdeaKeyword(raw: string | null | undefined): string | null {
  const k = (raw ?? '').trim().replace(/[?!]+$/, '').trim()
  return k || null
}
