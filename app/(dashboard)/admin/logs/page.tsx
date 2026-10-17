'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, CircleCheck, OctagonAlert, RefreshCw, ScrollText } from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import Segmented from '@/components/ui/Segmented'
import StatTile from '@/components/ui/StatTile'
import { NoticeBox } from '@/components/ui/Notice'
import { Skeleton } from '@/components/ui/Skeleton'
import SeoBackfillPanel from '@/components/admin/SeoBackfillPanel'

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
      if (data.error) setError('load')
      setLogs(data.logs || [])
    } catch {
      setError('load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const filtered = filter === 'all' ? logs : logs.filter((l) => l.level === filter)

  const levelVariant = (level: LogEntry['level']) => {
    if (level === 'error') return 'danger' as const
    if (level === 'warning') return 'warning' as const
    return 'info' as const
  }

  const levelLabel = (level: LogEntry['level']) => {
    if (level === 'error') return 'שגיאה'
    if (level === 'warning') return 'אזהרה'
    return 'מידע'
  }

  const errorCount = logs.filter((l) => l.level === 'error').length
  const warningCount = logs.filter((l) => l.level === 'warning').length

  return (
    <div dir="rtl" className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-title font-bold tracking-tight text-ink">לוג שגיאות</h1>
          <p className="mt-1.5 text-copy text-muted">שגיאות אחרונות מסריקות ומהמערכת</p>
        </div>
        <Button variant="secondary" onClick={fetchLogs} loading={loading}>
          {!loading && <RefreshCw aria-hidden className="size-4" />}
          רענון
        </Button>
      </div>

      <SeoBackfillPanel />

      {!loading && logs.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
          <StatTile label="סך הכל" value={logs.length} icon={<ScrollText />} source="100 הרשומות האחרונות" />
          {errorCount > 0 && <StatTile label="שגיאות" value={errorCount} icon={<OctagonAlert />} />}
          {warningCount > 0 && <StatTile label="אזהרות" value={warningCount} icon={<AlertTriangle />} />}
        </div>
      )}

      {!loading && logs.length > 0 && (
        <Segmented
          ariaLabel="סינון לפי רמה"
          value={filter}
          onChange={(v) => setFilter(v)}
          options={[
            { value: 'all', label: 'הכל', count: logs.length },
            { value: 'error', label: 'שגיאות', count: errorCount },
            { value: 'warning', label: 'אזהרות', count: warningCount },
          ]}
        />
      )}

      {loading && (
        <div className="space-y-3" role="status" aria-label="טוען">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {error && (
        <NoticeBox tone="bad" language="he" action={{ label: 'ניסיון נוסף', onClick: fetchLogs }}>
          לא הצלחנו לטעון את הלוג. כדאי לנסות שוב בעוד רגע.
        </NoticeBox>
      )}

      {!loading && !error && filtered.length === 0 && (
        <Card padding={false}>
          <EmptyState
            icon={<CircleCheck />}
            title={logs.length === 0 ? 'המערכת רצה בלי שגיאות' : 'אין רשומות ברמה הזאת'}
            body={logs.length === 0 ? 'כל שגיאה או אזהרה מסריקה תופיע כאן, עם הפרויקט והשעה.' : 'אפשר לחזור לכל הרשומות כדי לראות את השאר.'}
            action={logs.length > 0 ? <Button size="sm" variant="secondary" onClick={() => setFilter('all')}>הצגת הכל</Button> : undefined}
          />
        </Card>
      )}

      {!loading && filtered.length > 0 && (
        <Card padding={false}>
          <ul className="divide-y divide-line">
            {filtered.map((log) => (
              <li key={log.id} className="flex items-start gap-3 px-5 py-4 sm:px-6">
                <Badge variant={levelVariant(log.level)} className="mt-0.5 shrink-0">{levelLabel(log.level)}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-copy font-semibold text-ink">{log.message}</p>
                  {log.detail && <p className="mt-0.5 break-words text-caption text-muted">{log.detail}</p>}
                  <p className="mt-1 text-caption text-muted">
                    <span>{log.project}</span>
                    <span aria-hidden className="mx-1.5">·</span>
                    <span className="tabular-nums">{new Date(log.timestamp).toLocaleString('he-IL')}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
