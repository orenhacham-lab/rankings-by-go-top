/**
 * The filter chips above the research table, and every rule behind them.
 *
 *   all              every keyword of the research on screen
 *   research         found from the site itself: its seed keywords, its home page
 *                    or its whole domain (the scan's b2)
 *   competitors      found in a validated competitor's research (the scan's b3)
 *   google           Google already reports clicks or impressions for it (Search
 *                    Console's keywords view: the project's tracked keywords)
 *   high_volume      at least HIGH_VOLUME_MIN searches a month
 *   low_competition  Google rates its competition low (its index up to 33 when it
 *                    gave no level)
 *   questions        phrased as a question (a question word first, or a "?")
 *   suggested        found by the scan, not tracked yet, and passing the engine's
 *                    relevance filter; listed best easy win first
 *   tracked          already one of this project's keywords
 *
 * Suggesting is all the scan does with its keywords: nothing is tracked until the
 * merchant adds it.
 *
 * Pure: no React, no I/O.
 */
import { compareWins, competitionLevel, easyWin } from './easy-wins'
import { compareByVolume, keywordKey, RESEARCH_ORIGINS, type AverageClickPrice, type KeywordIdea, type ScanOrigin } from './scan-research'

export const RESEARCH_CHIPS = ['all', 'research', 'competitors', 'google', 'high_volume', 'low_competition', 'questions', 'suggested', 'tracked'] as const
export type ResearchChip = (typeof RESEARCH_CHIPS)[number]

export const HIGH_VOLUME_MIN = 1_000

/** A row of the table with what the chips need to know about it. */
export interface ChipRow extends KeywordIdea {
  /** The scan's seeds that found it; empty for a keyword the scan did not find. */
  origins: readonly ScanOrigin[]
  /** Passes the relevance filter; null when unknown (the scan did not find it). */
  relevant: boolean | null
  tracked: boolean
  /** Google reports figures for it. */
  google: boolean
}

// First words that make a search a question. Bare "מי" is left out on purpose: it is
// also "water of" ("מי ורדים", "מי פנים"), which shops sell.
const QUESTION_WORDS = new Set([
  'מה', 'מהו', 'מהי', 'מהם', 'מהן', 'איך', 'כיצד', 'למה', 'מדוע', 'מתי', 'איפה', 'היכן', 'מאיפה', 'לאן',
  'כמה', 'האם', 'איזה', 'איזו', 'אילו', 'ממה',
  'what', 'whats', "what's", 'how', 'why', 'when', 'where', 'which', 'who', 'whom', 'whose',
  'can', 'should', 'does', 'do', 'is', 'are',
])

export function isQuestion(keyword: string): boolean {
  const k = keyword.trim().toLowerCase()
  if (!k) return false
  if (/[?؟]$/.test(k)) return true
  const first = k.split(/\s+/)[0].replace(/^["'׳״(]+|["'׳״),.:;!?]+$/g, '')
  if (QUESTION_WORDS.has(first)) return true
  // Hebrew joins "and" to the word: "ואיך", "ומה".
  return first.length > 2 && first.startsWith('ו') && QUESTION_WORDS.has(first.slice(1))
}

export function chipMatches(chip: ResearchChip, row: ChipRow): boolean {
  switch (chip) {
    case 'all': return true
    case 'research': return row.origins.some((o) => RESEARCH_ORIGINS.includes(o))
    case 'competitors': return row.origins.includes('competitor')
    case 'google': return row.google
    case 'high_volume': return (row.avgMonthlySearches ?? 0) >= HIGH_VOLUME_MIN
    case 'low_competition': return competitionLevel(row) === 'low'
    case 'questions': return isQuestion(row.keyword)
    case 'suggested': return row.origins.length > 0 && !row.tracked && row.relevant === true
    case 'tracked': return row.tracked
  }
}

export function chipCounts(rows: readonly ChipRow[]): Record<ResearchChip, number> {
  const counts = Object.fromEntries(RESEARCH_CHIPS.map((c) => [c, 0])) as Record<ResearchChip, number>
  for (const row of rows) for (const chip of RESEARCH_CHIPS) if (chipMatches(chip, row)) counts[chip]++
  return counts
}

/**
 * The rows a chip shows. "Suggested" is ranked by the easy-wins score (easy wins
 * first, best first; the rest after them, most searched first); every other chip
 * keeps the order it was given (the table sorts by its own columns).
 */
export function rowsForChip<T extends ChipRow>(rows: readonly T[], chip: ResearchChip, average: AverageClickPrice | null): T[] {
  const matching = rows.filter((r) => chipMatches(chip, r))
  if (chip !== 'suggested') return matching
  const wins: { row: T; win: NonNullable<ReturnType<typeof easyWin>> }[] = []
  const rest: T[] = []
  for (const row of matching) {
    const win = easyWin(row, average)
    if (win) wins.push({ row, win })
    else rest.push(row)
  }
  wins.sort(compareWins)
  rest.sort(compareByVolume)
  return [...wins.map((w) => w.row), ...rest]
}

/** The rank of each keyword in the suggested order, for sorting the table by it. */
export function suggestionRanks(rows: readonly ChipRow[], average: AverageClickPrice | null): Map<string, number> {
  const ranked = rowsForChip(rows, 'suggested', average)
  const out = new Map<string, number>()
  ranked.forEach((r, i) => out.set(keywordKey(r.keyword), i))
  return out
}
