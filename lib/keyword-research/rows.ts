/**
 * The rows of the research table: what the research found, joined with what the
 * project already tracks and what Google reports for it.
 *
 * The same builder serves the scan's research and a research the merchant runs by
 * hand. A hand-run keyword the scan also found keeps the scan's origins (so "from
 * the research" and "suggested" mean the same thing on both lists). With the scan's
 * research on screen, the tracked keywords Google reports figures for are rows too,
 * even when the research did not find them: that is how Search Console's keywords
 * arrive as a source of their own ("from Google").
 *
 * Pure: no React, no I/O.
 */
import type { KeywordFigures } from '@/lib/gsc/tab-metrics'
import type { ChipRow } from './chips'
import { keywordKey, type KeywordIdea, type ScanKeyword, type ScanOrigin, type TrackedKeyword } from './scan-research'

export interface ResearchRow extends ChipRow {
  competitors: string[]
  /** The tracked keyword it is, when it is one. */
  trackedId: string | null
  /** Google's clicks and impressions (Search Console, 28 days), when reported. */
  gsc: KeywordFigures | null
}

type Input = KeywordIdea & { origins?: readonly ScanOrigin[]; competitors?: readonly string[]; relevant?: boolean }

export function researchRows(args: {
  /** The list on screen: the scan's keywords, or a hand-run research's results. */
  keywords: readonly Input[]
  /** The scan's research, to recognise its keywords in a hand-run list. */
  scan: readonly ScanKeyword[]
  tracked: readonly TrackedKeyword[]
  /** Figures by tracked keyword id; null while Search Console cannot say (not set up, loading, failed). */
  google: Readonly<Record<string, KeywordFigures>> | null
  /** Add the tracked keywords Google reports for that the list lacks (the scan's list only). */
  withGoogleOnly: boolean
}): ResearchRow[] {
  const scanByKey = new Map(args.scan.map((k) => [keywordKey(k.keyword), k]))
  const trackedByKey = new Map<string, TrackedKeyword>()
  for (const t of args.tracked) {
    const key = keywordKey(t.keyword)
    if (key && !trackedByKey.has(key)) trackedByKey.set(key, t)
  }
  const figuresOf = (t: TrackedKeyword | undefined) => (t && args.google ? args.google[t.id] ?? null : null)

  const seen = new Set<string>()
  const rows: ResearchRow[] = []
  for (const k of args.keywords) {
    const key = keywordKey(k.keyword)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const found = k.origins ? null : scanByKey.get(key)
    const t = trackedByKey.get(key)
    const gsc = figuresOf(t)
    rows.push({
      keyword: k.keyword,
      avgMonthlySearches: k.avgMonthlySearches,
      competition: k.competition,
      competitionIndex: k.competitionIndex,
      lowTopOfPageBid: k.lowTopOfPageBid,
      highTopOfPageBid: k.highTopOfPageBid,
      currency: k.currency,
      origins: [...(k.origins ?? found?.origins ?? [])],
      competitors: [...(k.competitors ?? found?.competitors ?? [])],
      relevant: k.relevant ?? found?.relevant ?? null,
      tracked: !!t,
      trackedId: t?.id ?? null,
      google: !!gsc,
      gsc,
    })
  }

  if (args.withGoogleOnly && args.google) {
    for (const [key, t] of trackedByKey) {
      const gsc = figuresOf(t)
      if (!gsc || seen.has(key)) continue
      seen.add(key)
      const m = t.metrics
      rows.push({
        keyword: t.keyword,
        avgMonthlySearches: m?.avgMonthlySearches ?? null,
        competition: m?.competition ?? null,
        competitionIndex: m?.competitionIndex ?? null,
        lowTopOfPageBid: m?.lowTopOfPageBid ?? null,
        highTopOfPageBid: m?.highTopOfPageBid ?? null,
        currency: m?.currency ?? '',
        origins: [],
        competitors: [],
        relevant: null,
        tracked: true,
        trackedId: t.id,
        google: true,
        gsc,
      })
    }
  }
  return rows
}
