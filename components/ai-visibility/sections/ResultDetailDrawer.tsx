'use client'

import { useEffect, useRef } from 'react'
import { ExternalLink, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Notice from '@/components/ui/Notice'
import { ENGINE_META } from '../EngineIcon'
import { cleanDisplayDomain, findMatchedLabels, highlightMatches, isTargetCitation } from './result-helpers'
import { GeoExplanationSection, GeoInsightsCollapsible, GeoRecommendationsSection } from './ResultInsights'
import type { ResultRow, T } from './types'

export function ResultDetailDrawer({
  open,
  result,
  brandVariants,
  targetDomain,
  domainList,
  isHebrew,
  onClose,
  t,
}: {
  open: boolean
  result: ResultRow
  brandVariants: string[]
  targetDomain: string | null
  domainList?: string[]
  isHebrew: boolean
  onClose: () => void
  t: T
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  // A dialog: Escape closes it, and focus moves into it when it opens and
  // back to whatever opened it (the result row) when it closes.
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [open])

  if (!open) return null

  const engineMeta = ENGINE_META[result.engine as keyof typeof ENGINE_META]
  // Same pattern as the list card: use server-computed values until the
  // drawer's responseText load lets us re-evaluate live.
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

  function cleanResponseText(text: string): string {
    if (!text) return ''
    return text
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/^#+\s+/gm, '')
      .replace(/\[\[\d+\]\]/g, '')
      .replace(/\[\d+\]/g, '')
      .replace(/\(\[[^\]]+\]\[[^\]]+\]\)/g, '')
      .replace(/\(\[[^\]]+\]\)/g, '')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .replace(/^[\s]*[-*+]\s+/gm, '• ')
      .trim()
  }

  const summaryTone = reMentioned && reCited ? 'ok' : reMentioned || reCited ? 'info' : 'warn'
  const summaryKey = reMentioned && reCited
    ? 'drawer_summary_both'
    : reMentioned
      ? 'drawer_summary_mentioned'
      : reCited
        ? 'drawer_summary_cited'
        : 'drawer_summary_none'

  return (
    <div className="fixed inset-0 z-50">
      <div aria-hidden="true" className="scrim-in absolute inset-0 bg-scrim" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-result-drawer-title"
        className="absolute inset-y-0 end-0 flex w-full max-w-xl flex-col bg-surface shadow-pop"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-overline font-semibold uppercase tracking-wide text-muted">{engineMeta?.name || result.engine}</p>
            <h2 id="ai-result-drawer-title" className="mt-1 text-section font-semibold text-ink">{result.promptText}</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="grid size-9 shrink-0 place-items-center rounded-control text-muted transition-colors duration-150 ease-snappy hover:bg-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          <Notice tone={summaryTone}>{t(summaryKey)}</Notice>

          {(brandLabels.length > 0 || reDomainInSource) && (
            <dl className="space-y-1.5 text-copy">
              {brandLabels.length > 0 && (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-muted">{t('what_was_mentioned')}:</dt>
                  <dd className="font-medium text-ink">{brandLabels.join(', ')}</dd>
                </div>
              )}
              {reDomainInSource && (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-muted">{t('what_appeared_as_source')}:</dt>
                  <dd className="font-medium text-ink" dir="ltr">{reDomainInSource}</dd>
                </div>
              )}
            </dl>
          )}

          <GeoExplanationSection
            geoInsights={result.geoInsights}
            displayMentioned={result.displayMentioned}
            displayCited={result.displayCited}
            displayBrandLabels={result.displayBrandLabels}
            displayDomainLabel={result.displayDomainLabel}
            isHebrew={isHebrew}
            t={t}
          />

          <GeoRecommendationsSection
            geoInsights={result.geoInsights}
            displayMentioned={result.displayMentioned}
            displayCited={result.displayCited}
            isHebrew={isHebrew}
            t={t}
          />

          {result.citations.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-copy font-semibold text-ink">
                {t('sources')} <span className="font-normal text-muted tabular-nums">({result.citations.length})</span>
              </h3>
              <ul className="divide-y divide-line rounded-inset border border-line">
                {result.citations.map((c, i) => {
                  // Fall back to client-side www-tolerant match when backend
                  // is_target_domain wasn't set on legacy rows.
                  const isTarget = c.is_target_domain || isTargetCitation(c.domain, targetDomain)
                  const displayDomain = cleanDisplayDomain(c.domain) || c.domain
                  return (
                    <li key={i}>
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={t('open_source')}
                        className="flex items-center gap-2 px-3 py-2.5 text-copy transition-colors duration-150 ease-snappy hover:bg-sunk focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
                      >
                        <span className="min-w-0 flex-1 truncate font-medium text-ink" dir="ltr">{displayDomain}</span>
                        {isTarget && <Badge variant="success">{t('your_domain')}</Badge>}
                        <ExternalLink aria-hidden="true" className="size-4 shrink-0 text-muted" />
                      </a>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {result.responseText && (
            <section className="space-y-2">
              <h3 className="text-copy font-semibold text-ink">{t('ai_answer')}</h3>
              <div className="space-y-2 rounded-inset bg-sunk p-4 text-copy text-body">
                {cleanResponseText(result.responseText)
                  .split('\n')
                  .map((line, i) => (
                    <p key={i}>
                      {line ? highlightMatches(line, brandVariants, targetDomain) : <br />}
                    </p>
                  ))}
              </div>
            </section>
          )}

          <GeoInsightsCollapsible insights={result.geoInsights} t={t} />
        </div>

        <footer className="border-t border-line px-5 py-4 sm:px-6">
          <Button variant="secondary" onClick={onClose} className="w-full">
            {t('close')}
          </Button>
        </footer>
      </div>
    </div>
  )
}
