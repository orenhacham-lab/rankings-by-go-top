/**
 * Everything the research tab derives from what it has read, in one place: the
 * rows on screen (the scan's research, or the one the merchant just ran), what the
 * chips count and show, the overview's figures, and the easy wins.
 *
 * Pure: no React, no I/O. The page calls it once per render (memoised).
 */
import type { KeywordFigures } from '@/lib/gsc/tab-metrics'
import { chipCounts, rowsForChip, type ResearchChip } from './chips'
import { compareWins, easyWin, rankEasyWins, type EasyWin } from './easy-wins'
import { researchRows, type ResearchRow } from './rows'
import { keywordKey, researchTotals, type KeywordIdea, type ResearchTotals, type ScanKeyword, type TrackedKeyword } from './scan-research'
import { siteRelevance, type SiteRelevance, type SiteTopics } from './site-relevance'

export interface ResearchModel {
  /** Whose research the rows are; null when there is none to show. */
  mode: 'scan' | 'manual' | null
  rows: ResearchRow[]
  /** The rows the active chip shows ("suggested" ranked by the easy-wins score). */
  chipRows: ResearchRow[]
  counts: Record<ResearchChip, number>
  /** The overview's figures: the research's own keywords (not the rows Search Console added). */
  totals: ResearchTotals
  /**
   * Every easy win among them, best first. With the site's profile: only those
   * related to the site, the most related first (then the best win).
   */
  wins: { row: ResearchRow; win: EasyWin }[]
  /** Easy wins unrelated to the site's content ("פחות קשורים לאתר שלכם"): listed apart, never dropped. Empty without a profile. */
  lessRelatedWins: { row: ResearchRow; win: EasyWin }[]
  /** How related each row is to the site's content, by keyword key; empty without a profile. */
  relevance: Map<string, SiteRelevance>
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
  /** What the site's pages are about (the research route's answer); null or absent: every keyword counts as related. */
  siteTopics?: SiteTopics | null
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
  const allWins = rankEasyWins(own.filter((r) => r.relevant !== false), totals.averageCpc)
  const chipRows = rowsForChip(rows, args.chip, totals.averageCpc)
  const relevance = new Map<string, SiteRelevance>()
  if (!args.siteTopics) {
    return { mode, rows, chipRows, counts: chipCounts(rows), totals, wins: allWins, lessRelatedWins: [], relevance, byKey: new Map(rows.map((r) => [keywordKey(r.keyword), r])) }
  }
  // SITE CONTENT (w8-relevance, site-relevance.ts): the most related to the site first;
  // the unrelated apart, after the rest, never removed.
  for (const r of rows) {
    const rel = siteRelevance(r.keyword, args.siteTopics)
    if (rel) relevance.set(keywordKey(r.keyword), rel)
  }
  const scoreOf = (r: KeywordIdea) => relevance.get(keywordKey(r.keyword))?.score ?? 0
  const related = (r: KeywordIdea) => relevance.get(keywordKey(r.keyword))?.related !== false
  const bySite = (a: { row: ResearchRow; win: EasyWin }, b: { row: ResearchRow; win: EasyWin }) => scoreOf(b.row) - scoreOf(a.row) || compareWins(a, b)
  const wins = allWins.filter((w) => related(w.row)).sort(bySite)
  const lessRelatedWins = allWins.filter((w) => !related(w.row))
  // "Suggested" lists the related first, the most related and best win first; then the rest as before.
  const ranked = args.chip === 'suggested'
    ? [...chipRows.filter(related).map((row, i) => ({ row, i })).sort((a, b) => {
        const wa = easyWin(a.row, totals.averageCpc), wb = easyWin(b.row, totals.averageCpc)
        return scoreOf(b.row) - scoreOf(a.row) || (wa && wb ? compareWins({ row: a.row, win: wa }, { row: b.row, win: wb }) : wa ? -1 : wb ? 1 : a.i - b.i)
      }).map(({ row }) => row), ...chipRows.filter((r) => !related(r))]
    : chipRows
  return {
    mode,
    rows,
    chipRows: ranked,
    counts: chipCounts(rows),
    totals,
    wins,
    lessRelatedWins,
    relevance,
    byKey: new Map(rows.map((r) => [keywordKey(r.keyword), r])),
  }
}
