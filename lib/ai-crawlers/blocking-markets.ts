/**
 * The 9 November reading, cut by country suffix.
 *
 * WHY THIS EXISTS. The page already showed a per-market table, but from the
 * 7 November reading and with one figure per market and no n. The 9 November
 * reading keeps one row per domain, so a market's figure can carry the number
 * of files it was computed from — and it has to, because the read rate swings
 * from 49 of 100 on `.jp` to 65 of 100 on `.it`. A percentage of 49 files and
 * a percentage of 65 files are not the same claim, and presenting them in one
 * column without their n is the objection a French SEO editor raised about
 * the headline figures on 9 November. He was right, and it applies per market.
 *
 * The two readings are two datasets and stay in separate tables: a different
 * day, a different sample and a different unit. See blocking-measurement.ts
 * for the 7 November one.
 *
 * WHY THE DELIBERATE COUNT IS BESIDE THE BLOCKED COUNT. A group that names the
 * crawler is a rule somebody wrote about it; the `*` group is a rule aimed at
 * every bot alike. `gptbotDeliberate` is how many of a market's GPTBot blocks
 * were a decision, and `oaiInherited` is how many of its OAI-SearchBot blocks
 * were not. Without that split a blocking rate reads as an error rate.
 *
 * Every number here is recomputed from `data/blocking-sites-2026-11-09.json`
 * by `__qa__/blocking-sites-dataset.qa.ts`, which also checks that the seven
 * markets sum to the dataset's own totals — so a row cannot drift from the
 * rows it summarises, and a market cannot go missing.
 */

export type MarketReading = {
  /** The country suffix the 100 domains were drawn from. */
  market: string
  /** Domains asked for in this market: always 100, stated rather than assumed. */
  requested: number
  /** Files actually read here. Every percentage in the row is of this. */
  read: number
  /** Files in this market whose robots.txt blocks GPTBot. */
  gptbotBlocked: number
  /** Of those, the ones whose rule names GPTBot — a decision, not a default. */
  gptbotDeliberate: number
  /** Files here that block OAI-SearchBot, the crawler behind shown answers. */
  oaiSearchbotBlocked: number
  /** Of those, the ones that inherited the block from the blanket `*` group. */
  oaiSearchbotInherited: number
}

/** Ordered by how many files could be read, most first: the n leads. */
export const BLOCKING_MARKETS_2026_11_09: readonly MarketReading[] = [
  { market: '.it', requested: 100, read: 65, gptbotBlocked: 15, gptbotDeliberate: 15, oaiSearchbotBlocked: 5, oaiSearchbotInherited: 0 },
  { market: '.es', requested: 100, read: 64, gptbotBlocked: 11, gptbotDeliberate: 9, oaiSearchbotBlocked: 5, oaiSearchbotInherited: 2 },
  { market: '.fr', requested: 100, read: 59, gptbotBlocked: 7, gptbotDeliberate: 6, oaiSearchbotBlocked: 4, oaiSearchbotInherited: 1 },
  { market: '.nl', requested: 100, read: 59, gptbotBlocked: 10, gptbotDeliberate: 8, oaiSearchbotBlocked: 4, oaiSearchbotInherited: 2 },
  { market: '.com', requested: 100, read: 56, gptbotBlocked: 17, gptbotDeliberate: 10, oaiSearchbotBlocked: 12, oaiSearchbotInherited: 9 },
  { market: '.de', requested: 100, read: 55, gptbotBlocked: 8, gptbotDeliberate: 7, oaiSearchbotBlocked: 4, oaiSearchbotInherited: 1 },
  { market: '.jp', requested: 100, read: 49, gptbotBlocked: 8, gptbotDeliberate: 6, oaiSearchbotBlocked: 5, oaiSearchbotInherited: 2 },
] as const

/** A share of the files READ in that market, to one decimal. */
export function marketPct(part: number, read: number): number {
  return read === 0 ? 0 : Math.round((part / read) * 1000) / 10
}
