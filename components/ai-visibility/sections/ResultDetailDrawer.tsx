'use client'

import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
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

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-end" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-2xl h-full overflow-y-auto shadow-xl animate-in slide-in-from-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">{result.promptText}</h2>
            <p className="text-sm text-muted">{engineMeta?.name || result.engine}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-slate-600 dark:hover:text-slate-300 text-2xl leading-none">
            ×
          </button>
        </div>

        <div className="space-y-6 p-6">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">{t('scan_activity')}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-600 dark:text-slate-300">{t('mentioned_in_answer')}</div>
                <div className={`text-lg font-bold ${reMentioned ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted'}`}>
                  {reMentioned ? '✓' : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-blue-600 dark:text-blue-400">{t('appeared_as_source')}</div>
                <div className={`text-lg font-bold ${reCited ? 'text-blue-700 dark:text-blue-400' : 'text-muted'}`}>
                  {reCited ? '✓' : '—'}
                </div>
              </div>
            </div>
            {(brandLabels.length > 0 || reDomainInSource) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3">
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

          <GeoInsightsCollapsible insights={result.geoInsights} t={t} />

          {result.citations.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('sources')} ({result.citations.length})
              </h3>
              <div className="space-y-2">
                {result.citations.map((c, i) => {
                  // Fall back to client-side www-tolerant match when backend
                  // is_target_domain wasn't set on legacy rows.
                  const isTarget = c.is_target_domain || isTargetCitation(c.domain, targetDomain)
                  const displayDomain = cleanDisplayDomain(c.domain) || c.domain
                  return (
                    <a
                      key={i}
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm transition"
                    >
                      <div className="flex items-center gap-2 text-sm">
                        <span className={`font-medium ${isTarget ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'}`}>
                          {displayDomain}
                        </span>
                        {isTarget && (
                          <Badge variant="success" className="!text-xs">{t('your_domain')}</Badge>
                        )}
                      </div>
                    </a>
                  )
                })}
              </div>
            </div>
          )}

          {result.responseText && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('ai_answer')}</h3>
              <div className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded-lg p-4 space-y-2 max-h-96 overflow-y-auto">
                {cleanResponseText(result.responseText)
                  .split('\n')
                  .map((line, i) => (
                    <p key={i} className="leading-relaxed">
                      {line ? highlightMatches(line, brandVariants, targetDomain) : <br />}
                    </p>
                  ))}
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
          <Button variant="outline" onClick={onClose} className="w-full">
            {t('close')}
          </Button>
        </div>
      </div>
    </div>
  )
}
