'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BookOpen, CircleCheck, Database, FlaskConical, KeyRound, Play, Plug, RefreshCw, ScrollText, Search, Settings2,
} from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import Input from '@/components/ui/Input'
import { NoticeBox } from '@/components/ui/Notice'
import Segmented from '@/components/ui/Segmented'
import Select from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { isStatusShape, logsErrorCopy, SCAN_ERROR, serviceCopy, testScanErrorCopy, type SetupTone } from './status-copy'

/* ─── Types ─────────────────────────────────────────────── */

interface StatusResult {
  supabase: { ok: boolean; label: string; detail: string }
  serper: { ok: boolean; label: string; detail: string }
  envVars: {
    supabaseUrl: boolean
    supabaseAnonKey: boolean
    supabaseServiceKey: boolean
    serperKey: boolean
  }
}

interface LogEntry {
  id: string
  type: string
  level: 'error' | 'warning' | 'info'
  message: string
  detail: string
  timestamp: string
  project: string
}

/* ─── Small helpers ──────────────────────────────────────── */

const DOT: Record<SetupTone, string> = { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad' }
const BADGE: Record<SetupTone, 'success' | 'warning' | 'danger'> = { ok: 'success', warn: 'warning', bad: 'danger' }

function StatusDot({ tone }: { tone: SetupTone }) {
  return <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-pill', DOT[tone])} />
}

function EnvRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2.5 text-copy">
      <StatusDot tone={ok ? 'ok' : 'bad'} />
      <span dir="ltr" className={cn('min-w-0 truncate', ok ? 'text-ink' : 'text-bad')}>{label}</span>
      <span className={cn('ms-auto shrink-0 text-caption', ok ? 'text-muted' : 'font-semibold text-bad')}>{ok ? 'מוגדר' : 'חסר'}</span>
    </div>
  )
}

function CardTitle({ icon: Icon, children }: { icon: typeof Database; children: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-inset bg-action-soft text-action">
        <Icon className="size-5" />
      </span>
      <h2 className="text-section font-semibold text-ink">{children}</h2>
    </div>
  )
}

/* ─── Tab: Status ────────────────────────────────────────── */

function StatusTab() {
  const [status, setStatus] = useState<StatusResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const res = await fetch('/api/setup/status')
      const data: unknown = await res.json()
      // An error reply (no admin session, a server error) has no services to draw.
      if (isStatusShape(data)) setStatus(data)
      else { setStatus(null); setFailed(true) }
    } catch {
      setStatus(null)
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  if (loading) {
    return (
      <div className="space-y-4" role="status" aria-label="בודק חיבורים">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
          <Skeleton className="h-28 w-full rounded-card" />
          <Skeleton className="h-28 w-full rounded-card" />
        </div>
        <Skeleton className="h-48 w-full rounded-card" />
      </div>
    )
  }

  if (failed || !status) {
    return (
      <NoticeBox tone="bad" language="he" action={{ label: 'ניסיון נוסף', onClick: fetchStatus }}>
        לא הצלחנו לבדוק את החיבורים. כדאי לוודא שנכנסת כמנהל ולנסות שוב.
      </NoticeBox>
    )
  }

  const connections = [
    { key: 'supabase' as const, data: status.supabase, icon: Database, title: 'Supabase' },
    { key: 'serper' as const, data: status.serper, icon: Search, title: 'Serper API' },
  ]
  const allGreen = status.supabase.ok && status.serper.ok && Object.values(status.envVars).every(Boolean)

  return (
    <div className="space-y-8">
      {allGreen && (
        <NoticeBox tone="ok" language="he">
          כל החיבורים פעילים והמערכת מוכנה לשימוש.{' '}
          <a href="/signup" className="font-semibold text-action underline-offset-2 hover:underline">כניסה למערכת</a>
        </NoticeBox>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
        {connections.map(({ key, data, icon: Icon, title }) => {
          const copy = serviceCopy(key, data)
          return (
            <Card key={key} className={cn('p-5 sm:p-6', copy.tone !== 'ok' && 'border-s-[3px]', copy.tone === 'bad' && 'border-s-bad', copy.tone === 'warn' && 'border-s-warn')}>
              <div className="flex items-start gap-3">
                <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-inset bg-action-soft text-action">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-section font-semibold text-ink">{title}</span>
                    <Badge variant={BADGE[copy.tone]} dot className="ms-auto">{copy.label}</Badge>
                  </div>
                  <p data-setup-detail={key} className="mt-1 break-words text-caption text-muted">{copy.detail}</p>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <Card className="p-5 sm:p-6">
        <CardTitle icon={KeyRound}>משתני סביבה</CardTitle>
        <div className="divide-y divide-line">
          <EnvRow label="NEXT_PUBLIC_SUPABASE_URL" ok={status.envVars.supabaseUrl} />
          <EnvRow label="NEXT_PUBLIC_SUPABASE_ANON_KEY" ok={status.envVars.supabaseAnonKey} />
          <EnvRow label="SUPABASE_SERVICE_ROLE_KEY" ok={status.envVars.supabaseServiceKey} />
          <EnvRow label="SERPER_API_KEY" ok={status.envVars.serperKey} />
        </div>
      </Card>

      <Button variant="secondary" onClick={fetchStatus}>
        <RefreshCw aria-hidden className="size-4" />
        בדיקה חוזרת
      </Button>
    </div>
  )
}

/* ─── Tab: Instructions ──────────────────────────────────── */

function Step({
  num,
  title,
  children,
}: {
  num: number
  title: string
  children: React.ReactNode
}) {
  return (
    <li className="flex gap-4">
      <span aria-hidden className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-pill bg-action-soft text-caption font-bold tabular-nums text-action">
        {num}
      </span>
      <div className="min-w-0">
        <h3 className="mb-1 text-copy font-semibold text-ink">{title}</h3>
        <div className="space-y-1 text-copy text-body">{children}</div>
      </div>
    </li>
  )
}

function Code({ children }: { children: string }) {
  return (
    <code dir="ltr" className="rounded-control bg-sunk px-1.5 py-0.5 text-caption text-ink">
      {children}
    </code>
  )
}

function InstructionsTab() {
  return (
    <div className="space-y-8">
      <Card className="p-5 sm:p-6">
        <CardTitle icon={Database}>הגדרת Supabase</CardTitle>
        <ol className="space-y-5">
          <Step num={1} title="יצירת פרויקט חדש ב-Supabase">
            <p>
              באתר <span className="font-semibold text-ink">supabase.com</span> יוצרים חשבון חינמי (או נכנסים לחשבון קיים) ולוחצים על{' '}
              <span className="font-semibold text-ink">New Project</span>.
            </p>
          </Step>

          <Step num={2} title="כתובת הפרויקט ומפתחות ה-API">
            <p>
              בפרויקט נכנסים אל <span className="font-semibold text-ink">Project Settings</span>, ומשם אל <span className="font-semibold text-ink">API</span>. שם נמצאים:
            </p>
            <ul className="mt-1 list-inside list-disc space-y-1">
              <li><Code>Project URL</Code>, שהוא <Code>NEXT_PUBLIC_SUPABASE_URL</Code></li>
              <li><Code>anon public</Code>, שהוא <Code>NEXT_PUBLIC_SUPABASE_ANON_KEY</Code></li>
              <li><Code>service_role secret</Code>, שהוא <Code>SUPABASE_SERVICE_ROLE_KEY</Code></li>
            </ul>
          </Step>

          <Step num={3} title="הרצת סכמת בסיס הנתונים">
            <p>
              בתפריט הצד לוחצים על <span className="font-semibold text-ink">SQL Editor</span>, מדביקים את תוכן הקובץ <Code>supabase/schema.sql</Code> מהפרויקט ולוחצים{' '}
              <span className="font-semibold text-ink">Run</span>.
            </p>
          </Step>
        </ol>
      </Card>

      <Card className="p-5 sm:p-6">
        <CardTitle icon={Search}>הגדרת Serper API</CardTitle>
        <ol className="space-y-5">
          <Step num={4} title="יצירת חשבון ב-Serper">
            <p>
              באתר <span className="font-semibold text-ink">serper.dev</span> יוצרים חשבון חינמי. 2,500 החיפושים הראשונים ללא עלות.
            </p>
          </Step>

          <Step num={5} title="מפתח ה-API">
            <p>
              אחרי ההרשמה לוחצים על <span className="font-semibold text-ink">API Key</span> בלוח הבקרה ומעתיקים את המפתח. זה <Code>SERPER_API_KEY</Code>.
            </p>
          </Step>
        </ol>
      </Card>

      <Card className="p-5 sm:p-6">
        <CardTitle icon={Settings2}>הוספת משתני הסביבה</CardTitle>
        <ol className="space-y-5">
          <Step num={6} title="קובץ .env.local">
            <p>
              בתיקיית השורש של הפרויקט יוצרים קובץ בשם <Code>.env.local</Code> עם התוכן הבא, עם הערכים האמיתיים:
            </p>
            <pre
              className="mt-2 overflow-x-auto rounded-inset bg-contrast p-4 text-caption text-contrast-ink"
              dir="ltr"
            >{`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SERPER_API_KEY=abc123...`}</pre>
          </Step>

          <Step num={7} title="הפעלה מחדש של השרת">
            <p>
              אחרי שמירת הקובץ מפעילים מחדש את שרת הפיתוח עם <Code>npm run dev</Code>, כדי שהמשתנים ייטענו.
            </p>
            <p className="mt-1 text-caption text-muted">
              בסביבת ייצור (Vercel, Railway וכדומה) מוסיפים את המשתנים בלוח הבקרה של הפלטפורמה ולא בקובץ.
            </p>
          </Step>
        </ol>
      </Card>
    </div>
  )
}

/* ─── Tab: Test Scan ─────────────────────────────────────── */

interface TestScanResult {
  input: Record<string, string | undefined>
  parsed: Record<string, unknown>
  raw: unknown
  timing: { startedAt: string; completedAt: string }
  error?: string
}

function ResultFigure({ label, children, tone }: { label: string; children: React.ReactNode; tone?: 'ok' | 'bad' }) {
  return (
    <div className="rounded-inset border border-line bg-sunk/60 p-3 text-center">
      <div className={cn('truncate text-section font-bold tabular-nums', tone === 'ok' ? 'text-ok' : tone === 'bad' ? 'text-bad' : 'text-ink')}>{children}</div>
      <div className="mt-1 text-caption text-muted">{label}</div>
    </div>
  )
}

function TestScanTab() {
  const [keyword, setKeyword] = useState('קידום אתרים תל אביב')
  const [engine, setEngine] = useState<'google_search' | 'google_maps'>('google_search')
  const [targetDomain, setTargetDomain] = useState('')
  const [targetBusinessName, setTargetBusinessName] = useState('')
  const [country, setCountry] = useState('IL')
  const [language, setLanguage] = useState('he')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<TestScanResult | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  async function runTest() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/setup/test-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, engine, targetDomain, targetBusinessName, country, language }),
      })
      const data = await res.json()
      setResult(data)
    } catch (e) {
      setResult({ input: {}, parsed: {}, raw: null, timing: { startedAt: '', completedAt: '' }, error: (e as Error).message })
    } finally {
      setLoading(false)
    }
  }

  const parsed = result?.parsed as { found?: boolean; position?: number | null; totalResults?: number; error?: string } | undefined
  const requestError = testScanErrorCopy(result?.error)

  return (
    <div className="space-y-8">
      <Card className="p-5 sm:p-6">
        <CardTitle icon={FlaskConical}>בדיקת סריקה חיה</CardTitle>
        <p className="-mt-2 mb-5 text-copy text-muted">
          סריקת ניסיון מוודאת שמפתח ה-API עובד ומראה תשובה אמיתית מ-Serper.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <span id="setup-engine-label" className="text-caption font-semibold text-ink">מנוע חיפוש</span>
            <Segmented
              ariaLabel="מנוע חיפוש"
              value={engine}
              onChange={(v) => setEngine(v)}
              className="self-start"
              options={[
                { value: 'google_search', label: 'גוגל אורגני', icon: Search },
                { value: 'google_maps', label: 'גוגל מפות', icon: Database },
              ]}
            />
          </div>

          <Input id="setup-keyword" label="מילת מפתח" value={keyword} onChange={(e) => setKeyword(e.target.value)} />

          {engine === 'google_search' ? (
            <Input id="setup-domain" label="דומיין יעד" value={targetDomain} onChange={(e) => setTargetDomain(e.target.value)} placeholder="example.co.il" dir="ltr" />
          ) : (
            <Input id="setup-business" label="שם עסק" value={targetBusinessName} onChange={(e) => setTargetBusinessName(e.target.value)} placeholder="שם העסק בגוגל מפות" />
          )}

          <Select
            id="setup-country"
            label="מדינה"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            options={[
              { value: 'IL', label: 'ישראל (IL)' },
              { value: 'US', label: 'ארה"ב (US)' },
              { value: 'GB', label: 'בריטניה (GB)' },
            ]}
          />

          <Select
            id="setup-language"
            label="שפה"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            options={[
              { value: 'he', label: 'עברית (he)' },
              { value: 'en', label: 'אנגלית (en)' },
            ]}
          />
        </div>

        <Button onClick={runTest} loading={loading} className="mt-6">
          {!loading && <Play aria-hidden className="size-4" />}
          {loading ? 'סורק…' : 'הרצת הבדיקה'}
        </Button>
      </Card>

      {result && (
        requestError ? (
          <NoticeBox tone="bad" language="he">{requestError}</NoticeBox>
        ) : (
          <Card className="space-y-5 p-5 sm:p-6">
            <h3 className="text-section font-semibold text-ink">תוצאה</h3>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ResultFigure label="מיקום">{parsed?.found ? parsed.position ?? '-' : '-'}</ResultFigure>
              <ResultFigure label="סטטוס" tone={parsed?.found ? 'ok' : 'bad'}>{parsed?.found ? 'נמצא' : 'לא נמצא'}</ResultFigure>
              {parsed?.totalResults != null && (
                <ResultFigure label="תוצאות בסך הכל">{parsed.totalResults.toLocaleString()}</ResultFigure>
              )}
              <ResultFigure label="זמן תגובה">
                {result.timing?.startedAt
                  ? `${new Date(result.timing.completedAt).getTime() - new Date(result.timing.startedAt).getTime()}ms`
                  : '-'}
              </ResultFigure>
            </div>

            {parsed?.error && <NoticeBox tone="warn" language="he">{SCAN_ERROR}</NoticeBox>}

            <div>
              <Button size="sm" variant="ghost" onClick={() => setShowRaw(!showRaw)} aria-expanded={showRaw} className="-ms-3">
                {showRaw ? 'הסתרת התגובה הגולמית' : 'הצגת התגובה הגולמית מ-Serper'}
              </Button>
              {showRaw && (
                <pre className="mt-2 max-h-96 overflow-x-auto rounded-inset bg-contrast p-4 text-caption text-contrast-ink" dir="ltr">
                  {JSON.stringify(result.raw, null, 2)}
                </pre>
              )}
            </div>
          </Card>
        )
      )}
    </div>
  )
}

/* ─── Tab: Logs ──────────────────────────────────────────── */

function LogsTab() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/setup/logs?limit=50')
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

  const errorCopy = logsErrorCopy(error)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-section font-semibold text-ink">לוג שגיאות אחרונות</h2>
        <Button size="sm" variant="secondary" onClick={fetchLogs} loading={loading}>
          {!loading && <RefreshCw aria-hidden className="size-4" />}
          רענון
        </Button>
      </div>

      {loading && (
        <div className="space-y-3" role="status" aria-label="טוען">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {errorCopy && <NoticeBox tone="warn" language="he">{errorCopy}</NoticeBox>}

      {!loading && !error && logs.length === 0 && (
        <Card padding={false}>
          <EmptyState icon={<CircleCheck />} title="המערכת רצה בלי שגיאות" body="כל שגיאה מסריקה תופיע כאן, עם הפרויקט והשעה." />
        </Card>
      )}

      {!loading && logs.length > 0 && (
        <Card padding={false}>
          <ul className="divide-y divide-line">
            {logs.map((log) => (
              <li key={log.id} className="flex items-start gap-3 px-5 py-4 sm:px-6">
                <Badge variant={levelVariant(log.level)} className="mt-0.5 shrink-0">{levelLabel(log.level)}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-copy font-semibold text-ink">{log.message}</p>
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

/* ─── Main Page ──────────────────────────────────────────── */

const TABS = [
  { id: 'status', label: 'סטטוס חיבורים', short: 'חיבורים', icon: Plug },
  { id: 'instructions', label: 'הוראות הגדרה', short: 'הוראות', icon: BookOpen },
  { id: 'test', label: 'בדיקת סריקה', short: 'בדיקה', icon: FlaskConical },
  { id: 'logs', label: 'לוג שגיאות', short: 'לוג', icon: ScrollText },
] as const

type TabId = (typeof TABS)[number]['id']

export default function SetupPage() {
  const [activeTab, setActiveTab] = useState<TabId>('status')

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8 sm:py-10">
      <div>
        <h1 className="text-title font-bold tracking-tight text-ink">הגדרת המערכת</h1>
        <p className="mt-1.5 text-copy text-muted">
          השלבים הבאים מחברים את Supabase ו-Serper ומפעילים את המערכת.
        </p>
      </div>

      <Segmented
        ariaLabel="אזורי ההגדרה"
        value={activeTab}
        onChange={(v) => setActiveTab(v)}
        fill
        options={TABS.map((tab) => ({
          value: tab.id,
          icon: tab.icon,
          label: (
            <>
              <span className="sm:hidden">{tab.short}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </>
          ),
        }))}
      />

      {activeTab === 'status' && <StatusTab />}
      {activeTab === 'instructions' && <InstructionsTab />}
      {activeTab === 'test' && <TestScanTab />}
      {activeTab === 'logs' && <LogsTab />}
    </div>
  )
}
