/**
 * Everything the research tab derives from what it has read, in one place: the
 * rows on screen (the scan's research, or the one the merchant just ran), what the
 * chips count and show, the overview's figures, and the easy wins.
 *
 * Pure: no React, no I/O. The page calls it once per render (memoised).
 */
import type { KeywordFigures } from '@/lib/gsc/tab-metrics'
import { chipCounts, rowsForChip, type ResearchChip } from './chips'
import { rankEasyWins, type EasyWin } from './easy-wins'
import { researchRows, type ResearchRow } from './rows'
import { keywordKey, researchTotals, type KeywordIdea, type ResearchTotals, type ScanKeyword, type TrackedKeyword } from './scan-research'

export interface ResearchModel {
  /** Whose research the rows are; null when there is none to show. */
  mode: 'scan' | 'manual' | null
  rows: ResearchRow[]
  /** The rows the active chip shows ("suggested" ranked by the easy-wins score). */
  chipRows: ResearchRow[]
  counts: Record<ResearchChip, number>
  /** The overview's figures: the research's own keywords (not the rows Search Console added). */
  totals: ResearchTotals
  /** Every easy win among them, best first. */
  wins: { row: ResearchRow; win: EasyWin }[]
  /** A row by its keyword key, for the table's per-row line. */
  byKey: Map<string, ResearchRow>
}

export function researchModel(args: {
  scanKeywords: readonly ScanKeyword[]
  tracked: readonly TrackedKeyword[]
  /** The results of a research the merchant ran, when those are the ones on screen. */
  manual: readonly KeywordIdea[] | null
  google: Readonly<Record<string, KeywordFigures>> | null
  chip: ResearchChip
}): ResearchModel {
  const mode = args.manual && args.manual.length > 0 ? 'manual' : args.scanKeywords.length > 0 ? 'scan' : null
  const rows = mode === null
    ? []
    : researchRows({
        keywords: mode === 'manual' ? (args.manual as KeywordIdea[]) : args.scanKeywords,
        scan: args.scanKeywords,
        tracked: args.tracked,
        google: args.google,
        withGoogleOnly: mode === 'scan',
      })
  // The research's own keywords: on the scan's list, the rows Search Console added are not "found".
  const own = mode === 'scan' ? rows.filter((r) => r.origins.length > 0) : rows
  const totals = researchTotals(own)
  const wins = rankEasyWins(own.filter((r) => r.relevant !== false), totals.averageCpc)
  return {
    mode,
    rows,
    chipRows: rowsForChip(rows, args.chip, totals.averageCpc),
    counts: chipCounts(rows),
    totals,
    wins,
    byKey: new Map(rows.map((r) => [keywordKey(r.keyword), r])),
  }
}
