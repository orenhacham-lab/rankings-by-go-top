/**
 * Suggested AI questions that belong to ANOTHER trade are not shown.
 *
 * WHY. Suggestions are built from a broad business category. A plumber is
 * detected as a "home services" business, and that category's seed questions
 * are about renovation ("how much does renovating a flat cost?", "how to pick a
 * reliable contractor?"). A plumber's customers do not ask those, so the owner
 * saw a list that was not about their business.
 *
 * THE RULE. The project's own words (its tracked keywords, the services it
 * offers, its name and domain) say which trades it is in. A suggestion that
 * names a trade from the list below, when none of the trades it names is one
 * of the project's, is dropped. Nothing is dropped when the project's words
 * name no listed trade at all: then we cannot tell, and every suggestion stays.
 * A question naming no trade (a brand or price question) always stays.
 *
 * Pure, shared by the questions tab and the suggestions dialog.
 */

/** Word stems per trade, Hebrew and English; matched as substrings so prefixes (ב, ל, ה) still match. */
export const TRADE_STEMS: Record<string, readonly string[]> = {
  renovation: ['שיפוץ', 'שיפוצ', 'קבלן', 'קבלנ', 'בנייה', 'בניה', 'renovat', 'remodel', 'contractor', 'construction'],
  plumbing: ['אינסטלט', 'אינסטלצ', 'סתימ', 'נזיל', 'צנרת', 'ביוב', 'plumb', 'leak', 'clog', 'drain', 'pipe'],
  electrical: ['חשמלאי', 'electrician', 'wiring'],
  painting: ['צבעי ', 'צביעת', 'צביעה', 'painter', 'house painting'],
  cleaning: ['ניקיון', 'ניקוי', 'cleaning', 'cleaner'],
  locksmith: ['מנעולן', 'פריצת דלת', 'פריצת דלתות', 'locksmith'],
  moving: ['הובלה', 'הובלות', 'מובילים', 'movers', 'moving company'],
  cooling: ['מזגן', 'מזגנ', 'מיזוג', 'air condition', 'hvac'],
  gardening: ['גינון', 'גנן', 'גננ', 'gardener', 'landscap'],
  pest: ['הדברה', 'הדברת', 'מדביר', 'exterminat', 'pest control'],
}

export type ProjectVocabulary = {
  keywords?: readonly (string | null | undefined)[] | null
  offerings?: readonly (string | null | undefined)[] | null
  businessName?: string | null
  projectName?: string | null
  domain?: string | null
}

/** The trades a text names. */
export function tradesIn(text: string | null | undefined): Set<string> {
  const lower = String(text ?? '').toLowerCase()
  const out = new Set<string>()
  if (!lower) return out
  for (const [trade, stems] of Object.entries(TRADE_STEMS)) {
    if (stems.some((stem) => lower.includes(stem))) out.add(trade)
  }
  return out
}

/** The trades the project's own words name. */
export function projectTrades(v: ProjectVocabulary): Set<string> {
  const words = [...(v.keywords ?? []), ...(v.offerings ?? []), v.businessName, v.projectName, v.domain]
  const out = new Set<string>()
  for (const w of words) for (const trade of tradesIn(w)) out.add(trade)
  return out
}

/** Whether a suggested question is about another trade than the project's. */
export function isOffTopicQuestion(question: string, trades: ReadonlySet<string>): boolean {
  if (trades.size === 0) return false
  const named = tradesIn(question)
  if (named.size === 0) return false
  for (const trade of named) if (trades.has(trade)) return false
  return true
}

/** The suggestions without those about another trade. */
export function dropOffTopicSuggestions<T extends { prompt: string }>(list: readonly T[], v: ProjectVocabulary): T[] {
  const trades = projectTrades(v)
  return list.filter((s) => !isOffTopicQuestion(s.prompt, trades))
}
