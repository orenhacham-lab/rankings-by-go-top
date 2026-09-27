/**
 * "Easy wins": the keywords most worth fighting for first.
 *
 * A keyword is an easy win when enough people search for it (at least
 * EASY_WIN_MIN_VOLUME a month) and its competition is not high. Among those, the
 * score weighs, in this order:
 *
 *   competition  45%  low 1, unknown 0.6, medium 0.5 (Google's level; its 0-100
 *                     index when it gave no level: up to 33 low, up to 66 medium)
 *   volume       35%  log scale, 10,000 searches a month and more count as full
 *   click price  20%  against the list's average in the same currency, twice the
 *                     average and more count as full; no price counts a quarter
 *
 * so a keyword with little competition beats a busier one that is contested, and
 * among equals the one advertisers pay more for (people who buy) comes first. Ties
 * go to the higher volume, then to the keyword in code-unit order: the ranking is
 * the same on every machine and every render.
 *
 * Every easy win carries the three facts its "why" sentence is built from.
 *
 * Pure: no React, no I/O.
 */
import { byText, clickPrice, keywordKey, type AverageClickPrice, type KeywordIdea } from './scan-research'

export const EASY_WIN_MIN_VOLUME = 30
/** How many the "easy battles to win" section lists. */
export const EASY_WINS_SHOWN = 8
/** A click price this many times the average is "above average" in the sentence. */
export const HIGH_CPC_RATIO = 1.25

export const WEIGHTS = { competition: 0.45, volume: 0.35, cpc: 0.2 } as const

export type CompetitionLevel = 'low' | 'medium' | 'high' | 'unknown'

export function competitionLevel(k: Pick<KeywordIdea, 'competition' | 'competitionIndex'>): CompetitionLevel {
  if (k.competition === 'LOW') return 'low'
  if (k.competition === 'MEDIUM') return 'medium'
  if (k.competition === 'HIGH') return 'high'
  const index = k.competitionIndex
  if (typeof index === 'number' && Number.isFinite(index)) return index <= 33 ? 'low' : index <= 66 ? 'medium' : 'high'
  return 'unknown'
}

export interface EasyWin {
  /** 0-100. */
  score: number
  volume: number
  competition: Exclude<CompetitionLevel, 'high'>
  /** The click price the score used; null when there is none in the average's currency. */
  cpc: number | null
  currency: string | null
  cpcAboveAverage: boolean
}

/** The keyword as an easy win, or null when it is not one (too few searches, or contested). */
export function easyWin(k: KeywordIdea, average: AverageClickPrice | null): EasyWin | null {
  const volume = k.avgMonthlySearches
  if (volume === null || !Number.isFinite(volume) || volume < EASY_WIN_MIN_VOLUME) return null
  const level = competitionLevel(k)
  if (level === 'high') return null

  const competition = level === 'low' ? 1 : level === 'unknown' ? 0.6 : 0.5
  const volumeScore = Math.min(1, Math.log10(volume) / 4)
  const price = clickPrice(k)
  const comparable = price !== null && !!average && average.value > 0 && k.currency === average.currency
  const ratio = comparable ? price / average.value : null
  const cpcScore = ratio === null ? 0.25 : Math.min(1, ratio / 2)
  const score = Math.round(100 * (WEIGHTS.competition * competition + WEIGHTS.volume * volumeScore + WEIGHTS.cpc * cpcScore))
  return {
    score,
    volume,
    competition: level,
    cpc: comparable ? price : null,
    currency: comparable ? k.currency : null,
    cpcAboveAverage: ratio !== null && ratio >= HIGH_CPC_RATIO,
  }
}

/** Higher score first, then more searches, then the keyword itself. */
export function compareWins(a: { row: KeywordIdea; win: EasyWin }, b: { row: KeywordIdea; win: EasyWin }): number {
  return b.win.score - a.win.score || b.win.volume - a.win.volume || byText(keywordKey(a.row.keyword), keywordKey(b.row.keyword))
}

/** Every easy win of the list, best first. */
export function rankEasyWins<T extends KeywordIdea>(rows: readonly T[], average: AverageClickPrice | null): { row: T; win: EasyWin }[] {
  const out: { row: T; win: EasyWin }[] = []
  for (const row of rows) {
    const win = easyWin(row, average)
    if (win) out.push({ row, win })
  }
  return out.sort(compareWins)
}
