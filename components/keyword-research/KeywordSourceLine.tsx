'use client'

/**
 * The line under a keyword in the research table: whether it is already tracked,
 * where the research found it (the site, a competitor), and what Google reports
 * for it. Nothing at all for a keyword with none of these.
 */
import { ScanSearch, Swords, TrendingUp } from 'lucide-react'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatCompact, formatCount } from '@/components/gsc/format'
import { RESEARCH_ORIGINS } from '@/lib/keyword-research/scan-research'
import type { ResearchRow } from '@/lib/keyword-research/rows'

export default function KeywordSourceLine({ row }: { row: ResearchRow }) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).keywordResearchScan.source
  const parts: { key: string; text: string; title?: string }[] = []
  if (row.origins.some((o) => RESEARCH_ORIGINS.includes(o))) parts.push({ key: 'research', text: t.research })
  if (row.competitors.length > 0) parts.push({ key: 'competitor', text: t.competitor(row.competitors[0], row.competitors.length - 1) })
  if (row.gsc) {
    parts.push({
      key: 'google',
      text: t.google(formatCompact(row.gsc.clicks, language), formatCompact(row.gsc.impressions, language)),
      title: t.google(formatCount(row.gsc.clicks, language), formatCount(row.gsc.impressions, language)),
    })
  }
  if (!row.tracked && parts.length === 0) return null
  // One small icon per source, so the line reads at a glance: the research's own mark
  // is the same on almost every row, so it is only an icon (its words stay for screen
  // readers and on hover); a competitor and Google keep their words, which differ per row.
  const ICONS = { research: ScanSearch, competitor: Swords, google: TrendingUp } as const
  return (
    <span data-keyword-source="" className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-caption text-muted">
      {row.tracked && (
        <span className="inline-flex items-center rounded-pill border border-ok/20 bg-ok-soft px-1.5 text-[11px] font-semibold text-ok">{t.tracked}</span>
      )}
      {parts.map((p) => {
        const Icon = ICONS[p.key as keyof typeof ICONS]
        return p.key === 'research' ? (
          <span key={p.key} title={p.text} className="inline-grid size-5 place-items-center rounded-full bg-action-soft text-action">
            <Icon size={11} strokeWidth={2.5} aria-hidden="true" />
            <span className="sr-only">{p.text}</span>
          </span>
        ) : (
          <span key={p.key} title={p.title} className="inline-flex items-center gap-1">
            {Icon && <Icon size={12} strokeWidth={2} aria-hidden="true" className="shrink-0" />}
            {p.text}
          </span>
        )
      })}
    </span>
  )
}
