'use client'

import React from 'react'
import Badge from '@/components/ui/Badge'
import { ENGINE_META, ExternalLinkIcon } from '../EngineIcon'
import { findMatchedLabels, formatShortDateTime } from './result-helpers'
import type { ResultRow, T } from './types'

export function ResultRowCard({
  result,
  highlighted,
  brandVariants,
  targetDomain,
  domainList,
  isHebrew,
  onRowClick,
  onArchiveToggle,
  onRetry,
  t,
}: {
  result: ResultRow
  highlighted: boolean
  brandVariants: string[]
  targetDomain: string | null
  domainList?: string[]
  isHebrew: boolean
  onRowClick: (r: ResultRow) => void
  onArchiveToggle: (resultId: string, newExcludedState: boolean) => void
  onRetry: () => void
  t: T
}) {
  const [isTogglingArchive, setIsTogglingArchive] = React.useState(false)
  const [isRetrying, setIsRetrying] = React.useState(false)

  const meta = ENGINE_META[result.engine as keyof typeof ENGINE_META]
  // Prefer the server-computed display fields so the list is correct on first
  // render. If the drawer has loaded responseText, re-evaluate live to pick up
  // any additional labels (and for in-text highlighting parity).
  const live = findMatchedLabels(
    result.responseText,
    brandVariants,
    targetDomain,
    result.mentioned,
    result.targetCited,
    result.citations,
    domainList
  )
  const brandLabels = result.responseText ? live.brandLabels : result.displayBrandLabels
  const reMentioned = result.responseText ? live.reMentioned : result.displayMentioned
  const reCited = result.responseText ? live.reCited : result.displayCited
  const reDomainInSource = result.responseText ? live.domainInSourceLabel : result.domainInSourceLabel

  const scannedAtStr = result.scannedAt ? formatShortDateTime(result.scannedAt, isHebrew) : null

  const handleArchiveClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsTogglingArchive(true)
    await onArchiveToggle(result.id, !result.excludedFromScore)
    setIsTogglingArchive(false)
  }

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsRetrying(true)
    await onRetry()
    setIsRetrying(false)
  }

  // Show error state when scan failed/timed out
  if (result.status === 'error') {
    return (
      <div
        className={`rounded-lg border bg-red-50 dark:bg-red-950/30 p-4 hover:shadow-md transition ${
          highlighted ? 'border-red-300 ring-2 ring-red-200 dark:ring-red-700' : 'border-red-200 dark:border-red-800'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium line-clamp-2 text-red-900 dark:text-red-100">
              {result.promptText}
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {meta && <meta.Icon size={16} className={meta.accent} />}
              <span className="text-xs font-medium text-red-700 dark:text-red-300">
                {meta?.name || result.engine}
              </span>
              <Badge variant="danger" className="!text-xs">
                {isHebrew ? 'סריקה נכשלה' : 'Scan failed'}
              </Badge>
            </div>
            <p className="text-xs text-red-600 dark:text-red-400 mt-2">
              {isHebrew ? 'הסריקה נכשלה זמנית. אפשר לנסות שוב.' : 'Scan failed temporarily. You can retry.'}
            </p>
          </div>
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            className={`px-3 py-1.5 rounded text-xs font-medium transition whitespace-nowrap ${
              isRetrying
                ? 'bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-200 opacity-50 cursor-wait'
                : 'bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-200 hover:bg-red-300 dark:hover:bg-red-700'
            }`}
          >
            {isHebrew ? 'נסה שוב' : 'Retry'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={() => onRowClick(result)}
      className={`rounded-lg border bg-white dark:bg-slate-900 p-4 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition cursor-pointer ${
        highlighted ? 'border-indigo-300 ring-2 ring-indigo-200 dark:ring-indigo-700' : 'border-slate-200 dark:border-slate-700'
      } ${result.excludedFromScore ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Row 1: query text */}
          <p className={`text-sm font-medium line-clamp-2 ${result.excludedFromScore ? 'text-muted' : 'text-slate-900 dark:text-slate-100'}`}>
            {result.promptText}
          </p>

          {/* Row 2: engine + status badges + scan time + archive label */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {meta && <meta.Icon size={16} className={meta.accent} />}
            <span className={`text-xs font-medium ${result.excludedFromScore ? 'text-muted' : 'text-slate-600 dark:text-slate-300'}`}>
              {meta?.name || result.engine}
            </span>

            {result.excludedFromScore && (
              <Badge variant="neutral" className="!text-xs !bg-slate-100 dark:!bg-slate-800">
                {isHebrew ? 'לא נכלל בציון' : 'Not in score'}
              </Badge>
            )}

            {!result.excludedFromScore && (
              <>
                {/* Strict separation: a mention in the answer is NOT a source
                    citation. Only reCited (domain in the sources list) shows
                    "appeared as source". */}
                {reMentioned && reCited ? (
                  <Badge variant="success" className="!text-xs">{t('mentioned_and_source')}</Badge>
                ) : (
                  <>
                    {reMentioned ? (
                      <Badge variant="success" className="!text-xs">{t('mentioned_in_answer')}</Badge>
                    ) : (
                      <Badge variant="neutral" className="!text-xs">{t('not_mentioned_in_answer')}</Badge>
                    )}
                    {reCited ? (
                      <Badge variant="info" className="!text-xs">{t('appeared_as_source')}</Badge>
                    ) : (
                      <Badge variant="neutral" className="!text-xs">{t('not_appeared_as_source')}</Badge>
                    )}
                  </>
                )}
              </>
            )}

            {scannedAtStr && (
              <span className={`text-[11px] ${result.excludedFromScore ? 'text-muted' : 'text-muted'}`}>
                · {t('scanned_at')} {scannedAtStr}
              </span>
            )}
          </div>

          {/* Row 3: matched variants — only when something was matched and not archived.
              "Mentioned" chips = brand aliases + any domain seen in the answer body.
              "Appeared as source" chip = the project domain found in the sources list. */}
          {!result.excludedFromScore && (brandLabels.length > 0 || reDomainInSource) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
              {brandLabels.length > 0 && (
                <div className="inline-flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">{t('what_was_mentioned')}:</span>
                  {brandLabels.map((label) => (
                    <span
                      key={label}
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              )}
              {reDomainInSource && (
                <div className="inline-flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">{t('what_appeared_as_source')}:</span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    {reDomainInSource}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {!result.excludedFromScore && result.citationCount > 0 && (
            <Badge variant="info" className="!text-xs">
              {result.citationCount} {t('citations')}
            </Badge>
          )}
          <button
            onClick={handleArchiveClick}
            disabled={isTogglingArchive}
            title={result.excludedFromScore ? (isHebrew ? 'שחזר לציון הנראות' : 'Restore to scoring') : (isHebrew ? 'העבר לארכיון' : 'Archive')}
            className={`px-2 py-1 rounded text-xs font-medium transition ${
              result.excludedFromScore
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                : 'text-muted hover:text-slate-600 dark:hover:text-slate-300'
            } ${isTogglingArchive ? 'opacity-50 cursor-wait' : ''}`}
          >
            {result.excludedFromScore ? (isHebrew ? 'שחזר' : 'Restore') : (isHebrew ? 'ארכיון' : 'Archive')}
          </button>
          <ExternalLinkIcon size={16} className={`${result.excludedFromScore ? 'text-slate-300 dark:text-slate-600' : 'text-muted'}`} />
        </div>
      </div>
    </div>
  )
}
