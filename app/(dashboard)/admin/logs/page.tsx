'use client'

import { useState, useEffect, useCallback } from 'react'

interface LogEntry {
  id: string
  type: string
  level: 'error' | 'warning' | 'info'
  message: string
  detail: string
  timestamp: string
  project: string
}

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'error' | 'warning'>('all')

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/setup/logs?limit=100')
      const data = await res.json()
      if (data.error) setError(data.error)
      setLogs(data.logs || [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const filtered = filter === 'all' ? logs : logs.filter((l) => l.level === filter)

  const levelStyle = (level: LogEntry['level']) => {
    if (level === 'error') return 'bg-red-100 text-red-700'
    if (level === 'warning') return 'bg-amber-100 text-amber-700'
    return 'bg-blue-100 text-blue-700'
  }

  const levelLabel = (level: LogEntry['level']) => {
    if (level === 'error') return 'שגיאה'
    if (level === 'warning') return 'אזהרה'
    return 'מידע'
  }

  const errorCount = logs.filter((l) => l.level === 'error').length
  const warningCount = logs.filter((l) => l.level === 'warning').length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">לוג שגיאות</h1>
          <p className="text-slate-500 text-sm mt-1">
            שגיאות אחרונות מסריקות ומהמערכת
          </p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="text-sm text-blue-600 hover:underline disabled:opacity-50"
        >
          רענן
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'סה"כ', count: logs.length, color: 'bg-slate-50 text-slate-700' },
          { label: 'שגיאות', count: errorCount, color: 'bg-red-50 text-red-700' },
          { label: 'אזהרות', count: warningCount, color: 'bg-amber-50 text-amber-700' },
        ].map(({ label, count, color }) => (
          <div key={label} className={`rounded-xl border border-slate-200 p-4 ${color}`}>
            <div className="text-2xl font-bold">{count}</div>
            <div className="text-xs mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {[
          { value: 'all', label: 'הכל' },
          { value: 'error', label: 'שגיאות בלבד' },
          { value: 'warning', label: 'אזהרות בלבד' },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value as typeof filter)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
              filter === opt.value
                ? 'bg-slate-800 text-white border-slate-800'
                : 'border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && (
        <div className="flex items-center justify-center py-20 gap-3">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-500 text-sm">טוען…</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-700 text-sm">
          <span className="font-medium">שגיאה: </span>{error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          <span className="text-4xl block mb-3">✅</span>
          <p className="font-medium text-slate-600">אין שגיאות</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {filtered.map((log) => (
            <div key={log.id} className="px-5 py-4">
              <div className="flex items-start gap-3">
                <span
                  className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full mt-0.5 ${levelStyle(log.level)}`}
                >
                  {levelLabel(log.level)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{log.message}</p>
                  <p className="text-xs text-slate-500 mt-0.5 break-words">{log.detail}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {log.project} &bull;{' '}
                    {new Date(log.timestamp).toLocaleString('he-IL')}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
