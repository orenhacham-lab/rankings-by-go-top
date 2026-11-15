/**
 * Is a stored `article_topics.primary_keyword` usable AS A TARGET PHRASE, and
 * what to store when the idea that became the topic carried no keyword.
 *
 * MEASURED 15 November 2026 in Production: of 934 rows in `article_topics`, 37
 * across 17 projects hold a TITLE or a multi-clause headline instead of a search
 * phrase — 25 byte-identical to the row's own title ("אילו אביזרי יוגה חיוניים
 * למתרגלים מתחילים ומתקדמים?"), the rest headline residue ("חברה לבניית אתרים
 * ומה הצעת המחיר צריכה לכלול"). That value is not cosmetic: it is the article
 * generator's focus keyword, the WordPress/Yoast focus keyword, and the first
 * anchor candidate for every internal link into the article.
 *
 * `topic-topup.ts` stored the idea's TITLE whenever the idea had no keyword of
 * its own; the ideas themselves were written through an acceptance gate that
 * accepted a welded-together headline (search-phrase.ts, EMBEDDED_CLAUSE_RE).
 * This module is the single place that judges a stored value, so the write side
 * and the read side can never drift apart.
 */

import { isSearchPhraseQuality } from '@/lib/content/recommendations/search-phrase'

/**
 * Can this stored value be used as a target search phrase? A headline — two
 * clauses, an appended tail, a dangling connective, or simply too long — cannot.
 * The judgement is the recommendation engine's own acceptance gate, so a keyword
 * written today and a keyword written a year ago are held to one standard.
 */
export function isUsableTargetKeyword(raw: string | null | undefined): boolean {
  const k = (raw ?? '').trim()
  return k.length > 0 && isSearchPhraseQuality(k)
}

/** The usable keyword, or null — for a caller that must not pass a headline on. */
export function usableTargetKeyword(raw: string | null | undefined): string | null {
  const k = (raw ?? '').trim()
  return isUsableTargetKeyword(k) ? k : null
}

/**
 * The target keyword to STORE for a topic made from an idea: the idea's own
 * keyword when that is a usable phrase, else NOTHING.
 *
 * It does NOT fall back to the idea's title. The code it replaces did, and that
 * is the line this change was opened for — but MEASURED on 15 November 2026, all
 * 2,476 ideas in Production carry a keyword of their own, so that branch has
 * never once run and was never the source of the 37 bad rows. A title stripped
 * of its framing is still a title in all but a few cases (measured: of 2,497 real
 * phrases, stripping leaves only 4 that the acceptance gate still refuses), so
 * deriving one would have stored a sentence while looking like a fix.
 *
 * Null is the honest answer. The column is nullable and every consumer handles an
 * absent keyword: generation and the WordPress focus keyword simply omit it, the
 * internal-link planner falls back to its other anchor sources, and the featured
 * image falls back to the topic text.
 */
export function topicKeywordFrom(keyword: string | null | undefined): string | null {
  return usableTargetKeyword(keyword)
}

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
