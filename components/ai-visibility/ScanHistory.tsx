'use client'

/**
 * ScanHistory — activity feed of previous AI scan runs for a project.
 * Click a row to load its full result+citations into the parent viewer.
 *
 * Visual style: AI observability / event timeline (Linear-like), not a database table.
 */

import { useCallback, useEffect, useState } from 'react'
import Badge from '@/components/ui/Badge'
import { ENGINE_META, TrashIcon } from './EngineIcon'

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

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000)
    if (diffSec < 60) return 'just now'
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
    if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`
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
}: {
  projectId: string
  refreshKey: number
  selectedRunId: string | null
  onSelectRun: (runId: string) => void
  onDeleteRun?: (runId: string) => void
}) {
  const [runs, setRuns] = useState<HistoryRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)

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

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50/60 transition border-b border-slate-100"
        type="button"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200/80 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" className="text-slate-500" />
              <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="text-slate-500" />
            </svg>
          </div>
          <div className="text-start">
            <div className="text-[13px] font-semibold text-slate-800 leading-tight">Scan activity</div>
            <div className="text-[11px] text-slate-500 leading-tight">
              {loading ? 'Loading…' : `${runs.length} ${runs.length === 1 ? 'event' : 'events'}`}
            </div>
          </div>
        </div>
        <span className="text-slate-400 text-sm">{expanded ? '−' : '+'}</span>
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
          ) : runs.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <div className="mx-auto w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-2.5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" className="text-slate-400" />
                  <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="text-slate-400" />
                </svg>
              </div>
              <div className="text-sm text-slate-600 font-medium">No scans yet</div>
              <div className="text-xs text-slate-400 mt-1">
                Run a prompt against an engine to start tracking activity.
              </div>
            </div>
          ) : (
            <ol className="relative">
              {runs.map((run, idx) => {
                const r = run.result
                const engineMeta = r ? ENGINE_META[r.engine] : null
                const Icon = engineMeta?.Icon
                const isSelected = selectedRunId === run.id
                const isLast = idx === runs.length - 1
                const isSuccess = run.status === 'completed'
                const isFailed = run.status === 'failed'

                return (
                  <li
                    key={run.id}
                    className={`relative group cursor-pointer transition-colors ${
                      isSelected ? 'bg-indigo-50/40' : 'hover:bg-slate-50/60'
                    }`}
                    onClick={() => onSelectRun(run.id)}
                  >
                    {/* vertical timeline line */}
                    {!isLast && (
                      <span className="absolute start-[34px] top-12 bottom-0 w-px bg-slate-100" />
                    )}

                    <div className="flex items-start gap-3 px-5 py-3.5">
                      {/* Engine bullet (timeline node) */}
                      <div className="relative shrink-0 mt-0.5">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center border transition ${
                            isSuccess
                              ? 'bg-white border-slate-200 shadow-sm'
                              : isFailed
                              ? 'bg-red-50 border-red-200'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          {engineMeta && Icon ? (
                            <Icon size={16} className={engineMeta.accent} />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-slate-300" />
                          )}
                        </div>
                        {/* status dot at corner */}
                        <span
                          className={`absolute -bottom-0.5 -end-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                            isSuccess
                              ? 'bg-emerald-500'
                              : isFailed
                              ? 'bg-red-500'
                              : 'bg-slate-300'
                          }`}
                        />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-[13px] font-semibold text-slate-800">
                            {engineMeta?.name || r?.engine || '—'}
                          </span>
                          <span className="text-[11px] text-slate-400">·</span>
                          <span className="text-[11px] text-slate-500">
                            {formatRelative(run.completedAt || run.createdAt)}
                          </span>
                          {isSelected && (
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-indigo-700 bg-indigo-100 rounded-full px-1.5 py-0.5">
                              Viewing
                            </span>
                          )}
                        </div>

                        {/* Prompt text */}
                        <div className="text-[13px] text-slate-700 line-clamp-1 leading-snug mb-1.5">
                          {r?.promptText || (
                            <span className="italic text-slate-400">No prompt text</span>
                          )}
                        </div>

                        {/* Metrics row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {r && isSuccess && (
                            <>
                              {r.mentioned && (
                                <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                  mention
                                </span>
                              )}
                              {r.targetCited && (
                                <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  cited
                                </span>
                              )}
                              {!r.mentioned && !r.targetCited && (
                                <span className="text-[10.5px] text-slate-400">no mention</span>
                              )}
                              <span className="text-[10.5px] text-slate-400">·</span>
                              <span className="text-[10.5px] text-slate-500">
                                <b className="text-slate-700 font-semibold">{r.citationCount}</b> citations
                              </span>
                              {r.creditsUsed != null && (
                                <>
                                  <span className="text-[10.5px] text-slate-400">·</span>
                                  <span className="text-[10.5px] text-slate-500">
                                    {String(r.creditsUsed)} credits
                                  </span>
                                </>
                              )}
                            </>
                          )}
                          {isFailed && (
                            <Badge variant="danger" className="!text-[10px]">Failed</Badge>
                          )}
                          {!isSuccess && !isFailed && (
                            <Badge variant="neutral" className="!text-[10px]">{run.status}</Badge>
                          )}
                        </div>
                      </div>

                      {/* Actions: open + delete */}
                      <div className="shrink-0 self-center flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                        <span className="text-[11px] font-medium text-indigo-600">
                          Open →
                        </span>
                        {onDeleteRun && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onDeleteRun(run.id)
                            }}
                            className="p-1 text-slate-400 hover:text-red-600 transition"
                            title="Delete scan"
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
          {i < 2 && <span className="absolute start-[34px] top-12 bottom-0 w-px bg-slate-100" />}
          <div className="flex items-start gap-3 px-5 py-3.5 animate-pulse">
            <div className="w-8 h-8 rounded-xl bg-slate-100 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-32 bg-slate-200 rounded" />
              <div className="h-3 w-3/4 bg-slate-100 rounded" />
              <div className="flex gap-1.5">
                <div className="h-3.5 w-14 bg-slate-100 rounded-full" />
                <div className="h-3.5 w-16 bg-slate-100 rounded-full" />
              </div>
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}
