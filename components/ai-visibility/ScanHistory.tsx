'use client'

/**
 * ScanHistory — list previous AI scan runs for a project.
 * Click a row to load its full result+citations into the parent viewer.
 */

import { useCallback, useEffect, useState } from 'react'
import Badge from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { ENGINE_META } from './EngineIcon'

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

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
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
}: {
  projectId: string
  refreshKey: number
  selectedRunId: string | null
  onSelectRun: (runId: string) => void
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
    <Card className="!p-0 overflow-hidden border-slate-200/70">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition border-b border-slate-200/70"
        type="button"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Scan history
          </span>
          {!loading && (
            <span className="text-xs text-slate-400">({runs.length})</span>
          )}
        </div>
        <span className="text-slate-400 text-sm">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div>
          {error && (
            <div className="px-5 py-3 text-sm text-red-600 bg-red-50 border-b border-red-100">
              {error}
            </div>
          )}

          {loading ? (
            <div className="px-5 py-6 text-sm text-slate-500">Loading...</div>
          ) : runs.length === 0 ? (
            <div className="px-5 py-6 text-sm text-slate-500 text-center">
              No scans yet. Run a prompt against an engine to see history here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/60 text-xs text-slate-500 font-medium">
                  <tr>
                    <th className="text-start px-5 py-2.5 font-medium">When</th>
                    <th className="text-start px-3 py-2.5 font-medium">Engine</th>
                    <th className="text-start px-3 py-2.5 font-medium">Prompt</th>
                    <th className="text-start px-3 py-2.5 font-medium">Status</th>
                    <th className="text-start px-3 py-2.5 font-medium">Mentions</th>
                    <th className="text-start px-3 py-2.5 font-medium">Citations</th>
                    <th className="text-start px-3 py-2.5 font-medium">Credits</th>
                    <th className="text-start px-3 py-2.5 font-medium">&nbsp;</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => {
                    const r = run.result
                    const engineMeta = r ? ENGINE_META[r.engine] : null
                    const Icon = engineMeta?.Icon
                    const isSelected = selectedRunId === run.id
                    return (
                      <tr
                        key={run.id}
                        className={`border-t border-slate-100 hover:bg-blue-50/30 cursor-pointer transition ${
                          isSelected ? 'bg-blue-50/60' : ''
                        }`}
                        onClick={() => onSelectRun(run.id)}
                      >
                        <td className="px-5 py-2.5 text-slate-700 whitespace-nowrap">
                          {formatTime(run.completedAt || run.createdAt)}
                        </td>
                        <td className="px-3 py-2.5">
                          {engineMeta && Icon ? (
                            <div className="flex items-center gap-1.5">
                              <Icon size={16} className={engineMeta.accent} />
                              <span className="text-slate-700 text-xs">{engineMeta.name}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 max-w-xs truncate">
                          {r?.promptText || '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          {run.status === 'completed' ? (
                            <Badge variant="success">success</Badge>
                          ) : run.status === 'failed' ? (
                            <Badge variant="danger">failed</Badge>
                          ) : (
                            <Badge variant="neutral">{run.status}</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {r ? (
                            <div className="flex gap-1">
                              {r.mentioned && <Badge variant="info">mention</Badge>}
                              {r.targetCited && <Badge variant="success">cited</Badge>}
                              {!r.mentioned && !r.targetCited && (
                                <span className="text-slate-400 text-xs">—</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">{r?.citationCount ?? '—'}</td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {r?.creditsUsed != null ? String(r.creditsUsed) : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-xs text-blue-600 font-medium hover:underline">
                            View →
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
