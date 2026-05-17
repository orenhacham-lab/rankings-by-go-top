'use client'

/**
 * ScanHistory — activity timeline of previous AI scan runs.
 * Lightweight metadata only (no full response_text); full result is fetched
 * on demand when a row is opened.
 *
 * Features: localized labels, hover delete with smooth fade-out animation,
 * relative timestamps, status pills, click-to-open.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Badge from '@/components/ui/Badge'
import { ENGINE_META, TrashIcon } from './EngineIcon'
import { createI18n } from '@/lib/ai-visibility/i18n'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'

export type HistoryRun = {
  id: string
  createdAt: string
  completedAt: string | null
  status: string
  provider: string
  totalCreditsUsed: number | string
  errorMessage: string | null
  result: {
    id: string
    engine: string
    promptText: string | null
    mentioned: boolean
    targetCited: boolean
    citationCount: number
    creditsUsed: number | string
    status: string | null
    errorMessage: string | null
    scannedAt: string | null
  } | null
}

function formatRelative(iso: string | null | undefined, justNow: string): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000)
    if (diffSec < 60) return justNow
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`
    if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d`
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

export default function ScanHistory({
  projectId,
  refreshKey,
  selectedRunId,
  onSelectRun,
  onDeleteRun,
  removedRunIds,
}: {
  projectId: string
  refreshKey: number
  selectedRunId: string | null
  onSelectRun: (runId: string) => void
  onDeleteRun?: (runId: string) => void
  removedRunIds?: Set<string>
}) {
  const { language: dashboardLanguage } = useDashboardLanguage()
  const t = useMemo(() => createI18n(dashboardLanguage), [dashboardLanguage])
  const isHebrew = dashboardLanguage === 'he'

  const [runs, setRuns] = useState<HistoryRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [fadingOutIds, setFadingOutIds] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/ai-visibility/runs?projectId=${projectId}&limit=20`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setRuns(data.runs || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  // Sync optimistic removals from parent: trigger fade-out, then drop
  useEffect(() => {
    if (!removedRunIds || removedRunIds.size === 0) return
    setFadingOutIds(new Set(removedRunIds))
    const timer = setTimeout(() => {
      setRuns((prev) => prev.filter((r) => !removedRunIds.has(r.id)))
      setFadingOutIds(new Set())
    }, 240)
    return () => clearTimeout(timer)
  }, [removedRunIds])

  const visibleRuns = runs

  return (
    <div className="rounded-2xl border border-slate-200/70 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden" dir={isHebrew ? 'rtl' : 'ltr'}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50/60 dark:hover:bg-slate-800 transition border-b border-slate-100 dark:border-slate-700"
        type="button"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-700 border border-slate-200/80 dark:border-slate-700 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" className="text-slate-500 dark:text-slate-400" />
              <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="text-slate-500 dark:text-slate-400" />
            </svg>
          </div>
          <div className="text-start">
            <div className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 leading-tight">{t('scan_activity')}</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
              {loading
                ? t('loading')
                : `${visibleRuns.length} ${visibleRuns.length === 1 ? t('event') : t('events')}`}
            </div>
          </div>
        </div>
        <span className="text-slate-400 dark:text-slate-500 text-sm">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div>
          {error && (
            <div className="px-5 py-3 text-sm text-red-700 bg-red-50/60 border-b border-red-100">
              {error}
            </div>
          )}

          {loading ? (
            <ActivityFeedSkeleton />
          ) : visibleRuns.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <div className="mx-auto w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-2.5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" className="text-slate-400 dark:text-slate-500" />
                  <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="text-slate-400 dark:text-slate-500" />
                </svg>
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-300 font-medium">{t('no_scans')}</div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t('no_scans_help')}</div>
            </div>
          ) : (
            <ol className="relative">
              {visibleRuns.map((run, idx) => {
                const r = run.result
                const engineMeta = r ? ENGINE_META[r.engine] : null
                const Icon = engineMeta?.Icon
                const isSelected = selectedRunId === run.id
                const isLast = idx === visibleRuns.length - 1
                const isSuccess = run.status === 'completed'
                const isFailed = run.status === 'failed'
                const isFading = fadingOutIds.has(run.id)

                return (
                  <li
                    key={run.id}
                    className={`relative group cursor-pointer transition-all duration-200 ${
                      isFading
                        ? 'opacity-0 max-h-0 overflow-hidden'
                        : 'opacity-100 max-h-32'
                    } ${
                      isSelected ? 'bg-indigo-50/40 dark:bg-indigo-900/20' : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/60'
                    }`}
                    onClick={() => !isFading && onSelectRun(run.id)}
                  >
                    {!isLast && (
                      <span className="absolute start-[34px] top-12 bottom-0 w-px bg-slate-100 dark:bg-slate-700" />
                    )}

                    <div className="flex items-start gap-3 px-5 py-3.5">
                      <div className="relative shrink-0 mt-0.5">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center border transition ${
                            isSuccess
                              ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-sm'
                              : isFailed
                              ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {engineMeta && Icon ? (
                            <Icon size={16} className={engineMeta.accent} />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                          )}
                        </div>
                        <span
                          className={`absolute -bottom-0.5 -end-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 ${
                            isSuccess ? 'bg-emerald-500' : isFailed ? 'bg-red-500' : 'bg-slate-300 dark:bg-slate-600'
                          }`}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                            {engineMeta?.name || r?.engine || '—'}
                          </span>
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">·</span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {formatRelative(run.completedAt || run.createdAt, t('just_now'))}
                          </span>
                          {isSelected && (
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/40 rounded-full px-1.5 py-0.5">
                              {t('viewing')}
                            </span>
                          )}
                        </div>

                        <div className="text-[13px] text-slate-700 dark:text-slate-200 line-clamp-1 leading-snug mb-1.5">
                          {r?.promptText || <span className="italic text-slate-400 dark:text-slate-500">—</span>}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {r && isSuccess && (
                            <>
                              {r.mentioned && (
                                <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                  {t('mention')}
                                </span>
                              )}
                              {r.targetCited && (
                                <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  {t('cited')}
                                </span>
                              )}
                              {!r.mentioned && !r.targetCited && (
                                <span className="text-[10.5px] text-slate-400 dark:text-slate-500">{t('no_mention')}</span>
                              )}
                              <span className="text-[10.5px] text-slate-400 dark:text-slate-500">·</span>
                              <span className="text-[10.5px] text-slate-500 dark:text-slate-400">
                                <b className="text-slate-700 dark:text-slate-200 font-semibold">{r.citationCount}</b> {t('citations').toLowerCase()}
                              </span>
                            </>
                          )}
                          {isFailed && <Badge variant="danger" className="!text-[10px]">{t('failed')}</Badge>}
                          {!isSuccess && !isFailed && (
                            <Badge variant="neutral" className="!text-[10px]">{run.status}</Badge>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 self-center flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                        <span className="text-[11px] font-medium text-indigo-600">
                          {t('open')} →
                        </span>
                        {onDeleteRun && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onDeleteRun(run.id)
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                            title={t('delete')}
                          >
                            <TrashIcon size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}

function ActivityFeedSkeleton() {
  return (
    <ol className="relative">
      {[0, 1, 2].map((i) => (
        <li key={i} className="relative">
          {i < 2 && <span className="absolute start-[34px] top-12 bottom-0 w-px bg-slate-100 dark:bg-slate-700" />}
          <div className="flex items-start gap-3 px-5 py-3.5 animate-pulse">
            <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-3 w-3/4 bg-slate-100 dark:bg-slate-800 rounded" />
              <div className="flex gap-1.5">
                <div className="h-3.5 w-14 bg-slate-100 dark:bg-slate-800 rounded-full" />
                <div className="h-3.5 w-16 bg-slate-100 dark:bg-slate-800 rounded-full" />
              </div>
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}
