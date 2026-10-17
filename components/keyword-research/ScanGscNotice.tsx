'use client'

/**
 * "Keywords from Google": the research tab's Search Console source, in one line.
 *
 * It follows the rule every Search Console widget follows (lib/gsc/widget-state.ts):
 * it is always there with its real title; before Search Console is set up it says,
 * in one sentence, what will appear and why it is worth it, with exactly one link,
 * to the Search Console section of the project's settings, named for the one step
 * that is missing; a failed read offers a retry and is never "not connected"; with
 * Search Console switched off on the server it renders nothing. Ready, it says how
 * many tracked keywords Google reports for; those keywords fill the "From Google"
 * chip, each with its clicks and impressions.
 */
import { MousePointerClick } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { isGscSetupState } from '@/lib/gsc/widget-state'
import type { KeywordFigures } from '@/lib/gsc/tab-metrics'
import type { GscData } from '@/components/gsc/gsc-data'
import GscSetupPrompt, { GscLoadError } from '@/components/gsc/GscSetupPrompt'
import { formatCount } from '@/components/gsc/format'

export default function ScanGscNotice({
  projectId, data, count, scope = 'tracked', retry, className,
}: {
  projectId: string | null
  data: GscData<Record<string, KeywordFigures>>
  /** Keywords on screen that Google reports figures for. */
  count: number
  /**
   * What `count` counts. 'tracked': the scan's research, which lists every tracked
   * keyword Google reports for, so a 0 means none of the TRACKED keywords had clicks.
   * 'search': a search the merchant ran, whose rows are that search's keywords only,
   * so a 0 says nothing about the tracked ones and must not claim it did (it read
   * "Google reported nothing for your tracked keywords" while the dashboard showed
   * clicks for the same site).
   */
  scope?: 'tracked' | 'search'
  retry: () => void
  className?: string
}) {
  const { language, uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).keywordResearchScan.gsc
  const state = data.state
  if (state === 'disabled') return null
  return (
    <div
      data-gsc-widget="keyword-research"
      data-gsc-state={state}
      className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-line bg-sunk/60 px-3 py-2.5', className)}
    >
      <span className="inline-flex items-center gap-2 text-copy font-semibold text-ink">
        <MousePointerClick size={16} strokeWidth={2} className="shrink-0 text-muted" aria-hidden="true" />
        {t.title}
      </span>
      {isGscSetupState(state) ? (
        <GscSetupPrompt state={state} about={t.about} projectId={projectId} layout="inline" className="min-w-0 flex-1 basis-80 [&>p]:basis-52" />
      ) : state === 'error' ? (
        <GscLoadError onRetry={retry} className="min-w-0 flex-1 basis-80" />
      ) : state === 'ready' ? (
        <p className="min-w-0 flex-1 basis-80 text-copy text-muted">{scope === 'search'
          ? (count > 0 ? t.legendSearch(formatCount(count, language)) : t.noneInSearch)
          : (count > 0 ? t.legend(formatCount(count, language)) : t.noneYet)}</p>
      ) : (
        <p className="min-w-0 flex-1 basis-80 text-copy text-muted" aria-busy="true">{t.loading}</p>
      )}
    </div>
  )
}
