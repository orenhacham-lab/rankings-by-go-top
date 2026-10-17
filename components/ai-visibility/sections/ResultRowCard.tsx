'use client'

import React from 'react'
import { Archive, ArchiveRestore, ChevronRight, RefreshCw } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import RowMenu from '@/components/ui/RowMenu'
import { cn } from '@/lib/utils'
import { ENGINE_META } from '../EngineIcon'
import { findMatchedLabels, formatShortDateTime } from './result-helpers'
import type { ResultRow, T } from './types'

/**
 * One AI answer in the results list. The whole card is a real <button>, so Tab
 * reaches it and Enter or Space opens the answer, exactly as a click does. The
 * one secondary action (archive / restore) sits in the row's menu at the
 * card's inline end, outside the button, so the two never nest.
 */
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
  const archived = result.excludedFromScore

  const toggleArchive = async () => {
    if (isTogglingArchive) return
    setIsTogglingArchive(true)
    await onArchiveToggle(result.id, !archived)
    setIsTogglingArchive(false)
  }

  const handleRetry = async () => {
    setIsRetrying(true)
    await onRetry()
    setIsRetrying(false)
  }

  const engineLine = (
    <span className="inline-flex items-center gap-1.5">
      {meta && <meta.Icon size={16} />}
      <span className="text-caption font-medium text-body">{meta?.name || result.engine}</span>
    </span>
  )

  // A check that failed or timed out: says so once, with one way forward.
  if (result.status === 'error') {
    return (
      <div
        data-ai-result-error=""
        className={cn(
          'rounded-inset border border-line bg-surface p-4',
          highlighted && 'ring-4 ring-action/20'
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-copy font-medium text-ink">{result.promptText}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {engineLine}
              <Badge variant="danger">{t('scan_failed')}</Badge>
            </div>
            <p className="mt-2 text-caption text-muted">{t('scan_failed_body')}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={handleRetry} loading={isRetrying} className="shrink-0">
            {!isRetrying && <RefreshCw aria-hidden="true" className="size-4" />}
            {t('retry_check')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="group relative">
      <button
        type="button"
        data-ai-result-row=""
        onClick={() => onRowClick(result)}
        className={cn(
          'block w-full rounded-inset border bg-surface p-4 pe-14 text-start',
          'transition-colors duration-150 ease-snappy hover:border-line-strong',
          'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20',
          highlighted ? 'border-action ring-4 ring-action/20' : 'border-line'
        )}
      >
        <p className={cn('line-clamp-2 text-copy font-medium', archived ? 'text-muted' : 'text-ink')}>
          {result.promptText}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {engineLine}

          {archived ? (
            <Badge variant="neutral">{t('not_in_score')}</Badge>
          ) : reMentioned && reCited ? (
            // Strict separation: a mention in the answer is NOT a source citation.
            <Badge variant="success">{t('mentioned_and_source')}</Badge>
          ) : (
            <>
              {reMentioned ? (
                <Badge variant="success">{t('mentioned_in_answer')}</Badge>
              ) : (
                <Badge variant="neutral">{t('not_mentioned_in_answer')}</Badge>
              )}
              {reCited ? (
                <Badge variant="info">{t('appeared_as_source')}</Badge>
              ) : (
                <Badge variant="neutral">{t('not_appeared_as_source')}</Badge>
              )}
            </>
          )}

          {!archived && result.citationCount > 0 && (
            <span className="text-caption tabular-nums text-muted">
              {result.citationCount} {t('citations')}
            </span>
          )}
          {scannedAtStr && (
            <span className="text-caption text-muted">
              {t('scanned_at')} {scannedAtStr}
            </span>
          )}
        </div>

        {/* What matched: brand names found in the answer, and the site in the sources. */}
        {!archived && (brandLabels.length > 0 || reDomainInSource) && (
          <dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption">
            {brandLabels.length > 0 && (
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <dt className="text-muted">{t('what_was_mentioned')}:</dt>
                <dd className="font-medium text-ink">{brandLabels.join(', ')}</dd>
              </div>
            )}
            {reDomainInSource && (
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <dt className="text-muted">{t('what_appeared_as_source')}:</dt>
                <dd className="font-medium text-ink" dir="ltr">{reDomainInSource}</dd>
              </div>
            )}
          </dl>
        )}

        <ChevronRight
          aria-hidden="true"
          className="absolute bottom-4 end-4 size-4 text-muted transition-colors duration-150 ease-snappy group-hover:text-ink rtl:-scale-x-100"
        />
      </button>

      <RowMenu
        label={t('result_more_actions')}
        className="absolute end-3 top-3"
        items={[
          archived
            ? { key: 'restore', label: t('restore_result'), icon: <ArchiveRestore aria-hidden="true" className="size-4" />, onSelect: toggleArchive, disabled: isTogglingArchive }
            : { key: 'archive', label: t('archive_result'), icon: <Archive aria-hidden="true" className="size-4" />, onSelect: toggleArchive, disabled: isTogglingArchive },
        ]}
      />
    </div>
  )
}
