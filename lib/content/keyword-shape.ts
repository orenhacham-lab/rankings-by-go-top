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
 * `topic-topup.ts` was one source — it stored the idea's title whenever the idea
 * had no keyword of its own. This module is the single place that decides, so
 * the write side and the read side can never drift apart.
 */

import { stripHeadlineFraming, isSearchPhraseQuality } from '@/lib/content/recommendations/search-phrase'

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
 * The target keyword to STORE for a topic made from an idea.
 *
 * Order: the idea's own keyword when it is a usable phrase; else the idea's
 * title with its headline framing stripped, when THAT is a usable phrase
 * ("מדריך לבחירת חנות פרחים ברמת השרון" → "בחירת חנות פרחים ברמת השרון"); else
 * null. Null is the honest answer: the column is nullable and every consumer
 * handles an absent keyword, whereas a sentence stored in it is silently used as
 * a keyword by all of them.
 */
export function topicKeywordFrom(keyword: string | null | undefined, title: string): string | null {
  const own = usableTargetKeyword(keyword)
  if (own) return own
  return usableTargetKeyword(stripHeadlineFraming(title ?? ''))
}
