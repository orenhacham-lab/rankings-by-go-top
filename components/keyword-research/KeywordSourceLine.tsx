'use client'

/**
 * The line under a keyword in the research table: whether it is already tracked,
 * and where it came from when that is NOT the research itself (a competitor,
 * Google's own report). Finding keywords is what the research does, so its mark
 * sat on almost every row and said nothing (final review R18): it is gone, and a
 * keyword the research alone found has no line at all.
 */
import { TrendingUp } from 'lucide-react'
import { CompetitorIcon } from '@/components/competitors/CompetitorIcon'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatCompact, formatCount } from '@/components/gsc/format'
import type { ResearchRow } from '@/lib/keyword-research/rows'

export default function KeywordSourceLine({ row }: { row: ResearchRow }) {
  const { language, uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).keywordResearchScan.source
  const parts: { key: 'competitor' | 'google'; text: string; title?: string }[] = []
  if (row.competitors.length > 0) parts.push({ key: 'competitor', text: t.competitor(row.competitors[0], row.competitors.length - 1) })
  if (row.gsc) {
    parts.push({
      key: 'google',
      text: t.google(formatCompact(row.gsc.clicks, language), formatCompact(row.gsc.impressions, language)),
      title: t.google(formatCount(row.gsc.clicks, language), formatCount(row.gsc.impressions, language)),
    })
  }
  if (!row.tracked && parts.length === 0) return null
  const ICONS = { competitor: CompetitorIcon, google: TrendingUp } as const
  return (
    <span data-keyword-source="" className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-caption text-muted">
      {row.tracked && (
        <span className="inline-flex items-center rounded-pill border border-ok/20 bg-ok-soft px-1.5 text-overline font-semibold text-ok">{t.tracked}</span>
      )}
      {parts.map((p) => {
        const Icon = ICONS[p.key]
        return (
          <span key={p.key} title={p.title} className="inline-flex min-w-0 items-center gap-1">
            <Icon size={12} strokeWidth={2} aria-hidden="true" className="shrink-0" />
            <span className="break-words sm:truncate">{p.text}</span>
          </span>
        )
      })}
    </span>
  )
}
