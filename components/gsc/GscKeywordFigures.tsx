'use client'

/**
 * Clicks and impressions from Google for each tracked keyword, in the keywords table.
 *
 * A line inside the search-volume cell, not a column of its own: the table already
 * fills a 1440px screen in English, and one more column pushes the status and the
 * actions out of view. Like the competitor line under each position, the box has one
 * size in every state (loading, dash, figures), so a row never changes height and the
 * table never changes width while the data arrives.
 *
 * One line above the table says what the figures are, or, before Search Console is
 * set up, what they will be, with the one step that is missing. Every cell then shows
 * a dash that explains itself, never a 0 that only means "not connected".
 *
 * A keyword is matched to Search Console queries by the opportunity engine's own
 * normalization (lib/gsc/tab-metrics.ts, on the server).
 */
import { useEffect, useRef } from 'react'
import { MousePointerClick } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { isGscSetupState } from '@/lib/gsc/widget-state'
import type { KeywordFigures } from '@/lib/gsc/tab-metrics'
import { useGscMetrics, useGscStatus, type GscData } from './gsc-data'
import GscSetupPrompt, { GscLoadError } from './GscSetupPrompt'
import { formatCompact, formatCount } from './format'

export interface GscKeywordsView {
  data: GscData<Record<string, KeywordFigures>>
  retry: () => void
}

function pickKeywords(body: Record<string, unknown>): Record<string, KeywordFigures> {
  return body.keywords && typeof body.keywords === 'object' ? (body.keywords as Record<string, KeywordFigures>) : {}
}

/**
 * The figures of every keyword of the project. `targetsKey` names the keyword list the
 * table shows; when it changes (a keyword added or removed), the figures are read again.
 */
export function useGscKeywordFigures(projectId: string | null | undefined, targetsKey: string): GscKeywordsView {
  const status = useGscStatus(projectId)
  const figures = useGscMetrics(projectId, status.view, 'keywords', pickKeywords)
  const reloadFigures = figures.reload
  const seenKey = useRef(targetsKey)
  useEffect(() => {
    if (seenKey.current === targetsKey) return
    seenKey.current = targetsKey
    reloadFigures()
  }, [targetsKey, reloadFigures])
  return { data: figures.data, retry: () => { status.reload(); figures.reload() } }
}

/** The line above the keywords table. */
export function GscKeywordsNotice({ projectId, view, className }: { projectId: string | null | undefined; view: GscKeywordsView; className?: string }) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).gscWidgets
  const state = view.data.state
  return (
    <div
      data-gsc-widget="keywords"
      data-gsc-state={state}
      className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-line bg-surface px-4 py-3', className)}
    >
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
        <MousePointerClick size={16} strokeWidth={2} className="shrink-0 text-muted" aria-hidden="true" />
        {t.keywords.title}
      </span>
      {isGscSetupState(state) ? (
        <GscSetupPrompt state={state} about={t.keywords.about} projectId={projectId} layout="inline" className="min-w-0 flex-1" />
      ) : state === 'error' ? (
        <GscLoadError onRetry={view.retry} className="min-w-0 flex-1" />
      ) : state === 'ready' ? (
        <p className="min-w-0 flex-1 text-sm text-muted">{t.keywords.legend}</p>
      ) : (
        <p className="min-w-0 flex-1 text-sm text-muted" aria-busy="true">{t.keywords.loading}</p>
      )}
    </div>
  )
}

const BOX = 'inline-flex h-5 w-24 items-center gap-1 whitespace-nowrap text-caption'

/** The box under a keyword's search volume. */
export function GscKeywordLine({ view, targetId }: { view: GscKeywordsView; targetId: string }) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).gscWidgets.keywords
  const data = view.data
  const mark = <MousePointerClick size={12} strokeWidth={2} className="shrink-0 text-muted" aria-hidden="true" />

  if (data.state === 'loading') {
    return (
      <span className={BOX} data-gsc-keyword="loading" aria-busy="true">
        {mark}
        <span className="h-2.5 w-14 rounded-control bg-sunk" aria-hidden="true" />
        <span className="sr-only">{t.loading}</span>
      </span>
    )
  }
  if (data.state !== 'ready') {
    const why = data.state === 'error' ? t.loadFailed : t.notReady
    return <Dash state={data.state} why={why} mark={mark} />
  }
  const figures = data.data[targetId]
  if (!figures) return <Dash state="none" why={t.none} mark={mark} />

  const full = t.figures(formatCount(figures.clicks, language), formatCount(figures.impressions, language))
  return (
    <span className={BOX} data-gsc-keyword="figures" title={full}>
      {mark}
      <span className="font-semibold text-ink tabular-nums" aria-hidden="true">{formatCompact(figures.clicks, language)}</span>
      <span className="text-muted" aria-hidden="true">·</span>
      <span className="min-w-0 truncate text-muted tabular-nums" aria-hidden="true">{formatCompact(figures.impressions, language)}</span>
      <span className="sr-only">{full}</span>
    </span>
  )
}

function Dash({ state, why, mark }: { state: string; why: string; mark: React.ReactNode }) {
  return (
    <span className={cn(BOX, 'text-muted')} data-gsc-keyword={state} title={why}>
      {mark}
      <span aria-hidden="true">—</span>
      <span className="sr-only">{why}</span>
    </span>
  )
}
