'use client'

import { useState, useEffect, useCallback } from 'react'

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

function StatusDot({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="inline-block w-3 h-3 rounded-full bg-slate-300 animate-pulse" />
  return (
    <span
      className={`inline-block w-3 h-3 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`}
    />
  )
}

function EnvRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm py-1">
      <StatusDot ok={ok} />
      <span className={ok ? 'text-slate-700' : 'text-red-600'}>{label}</span>
      <span className="mr-auto text-xs text-slate-400">{ok ? 'מוגדר' : 'חסר'}</span>
    </div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

/* ─── Tab: Status ────────────────────────────────────────── */

function StatusTab() {
  const [status, setStatus] = useState<StatusResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/setup/status')
      const data = await res.json()
      setStatus(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 text-sm">בודק חיבורים…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 rounded-xl border border-red-200 text-red-700 text-sm">
        שגיאה בבדיקת הסטטוס: {error}
      </div>
    )
  }

  if (!status) return null

  const connections = [
    { key: 'supabase', data: status.supabase, icon: '🗄️', title: 'Supabase' },
    { key: 'serper', data: status.serper, icon: '🔍', title: 'Serper API' },
  ]

  return (
    <div className="space-y-6">
      {/* Connection cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {connections.map(({ key, data, icon, title }) => (
          <Card key={key} className="p-5">
            <div className="flex items-start gap-3">
              <span className="text-2xl">{icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <StatusDot ok={data.ok} />
                  <span className="font-semibold text-slate-800 text-sm">{title}</span>
                  <span
                    className={`mr-auto text-xs font-medium px-2 py-0.5 rounded-full ${
                      data.ok
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {data.label}
                  </span>
                </div>
                <p className="text-xs text-slate-500 break-words">{data.detail}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Env vars */}
      <Card className="p-5">
        <h3 className="font-semibold text-slate-800 text-sm mb-3">משתני סביבה</h3>
        <div className="divide-y divide-slate-100">
          <EnvRow label="NEXT_PUBLIC_SUPABASE_URL" ok={status.envVars.supabaseUrl} />
          <EnvRow label="NEXT_PUBLIC_SUPABASE_ANON_KEY" ok={status.envVars.supabaseAnonKey} />
          <EnvRow label="SUPABASE_SERVICE_ROLE_KEY" ok={status.envVars.supabaseServiceKey} />
          <EnvRow label="SERPER_API_KEY" ok={status.envVars.serperKey} />
        </div>
      </Card>

      {/* All green */}
      {status.supabase.ok && status.serper.ok &&
        Object.values(status.envVars).every(Boolean) && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-5 py-4 text-green-800 text-sm">
            <span className="text-xl">✅</span>
            <div>
              <p className="font-semibold">כל החיבורים פעילים!</p>
              <p className="text-green-700 text-xs mt-0.5">
                המערכת מוכנה לשימוש.{' '}
                <a href="/login" className="underline font-medium">היכנס למערכת</a>
              </p>
            </div>
          </div>
        )}

      <button
        onClick={fetchStatus}
        className="text-sm text-blue-600 hover:underline"
      >
        רענן בדיקה
      </button>
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
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold mt-0.5">
        {num}
      </div>
      <div>
        <h3 className="font-semibold text-slate-800 text-sm mb-1">{title}</h3>
        <div className="text-sm text-slate-600 space-y-1">{children}</div>
      </div>
    </div>
  )
}

function Code({ children }: { children: string }) {
  return (
    <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-xs font-mono">
      {children}
    </code>
  )
}

function InstructionsTab() {
  return (
    <div className="space-y-8">
      {/* Supabase section */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-5">
          <span className="text-xl">🗄️</span>
          <h2 className="font-bold text-slate-800">הגדרת Supabase</h2>
        </div>
        <div className="space-y-5">
          <Step num={1} title="צור פרויקט חדש ב-Supabase">
            <p>
              גש לאתר{' '}
              <span className="font-medium text-slate-800">supabase.com</span> וצור חשבון חינמי
              (או התחבר לחשבון קיים). לחץ על{' '}
              <span className="font-medium">New Project</span>.
            </p>
          </Step>

          <Step num={2} title="קבל את כתובת ה-URL ומפתחות ה-API">
            <p>בפרויקט שלך לחץ על:</p>
            <p>
              <span className="font-medium">Project Settings → API</span>
            </p>
            <p>שם תמצא:</p>
            <ul className="list-disc list-inside space-y-1 mt-1">
              <li>
                <Code>Project URL</Code> — זה ה-<Code>NEXT_PUBLIC_SUPABASE_URL</Code>
              </li>
              <li>
                <Code>anon public</Code> — זה ה-<Code>NEXT_PUBLIC_SUPABASE_ANON_KEY</Code>
              </li>
              <li>
                <Code>service_role secret</Code> — זה ה-<Code>SUPABASE_SERVICE_ROLE_KEY</Code>
              </li>
            </ul>
          </Step>

          <Step num={3} title="הרץ את סכמת בסיס הנתונים">
            <p>
              לחץ על <span className="font-medium">SQL Editor</span> בתפריט הצד, הדבק את
              תוכן הקובץ <Code>supabase/schema.sql</Code> מהפרויקט ולחץ{' '}
              <span className="font-medium">Run</span>.
            </p>
          </Step>
        </div>
      </Card>

      {/* Serper section */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-5">
          <span className="text-xl">🔍</span>
          <h2 className="font-bold text-slate-800">הגדרת Serper API</h2>
        </div>
        <div className="space-y-5">
          <Step num={4} title="צור חשבון ב-Serper">
            <p>
              גש לאתר{' '}
              <span className="font-medium text-slate-800">serper.dev</span>, צור חשבון חינמי.
              ל-2,500 חיפושים ראשונים אין עלות.
            </p>
          </Step>

          <Step num={5} title="קבל את מפתח ה-API">
            <p>
              לאחר ההרשמה לחץ על <span className="font-medium">API Key</span> בדאשבורד.
              העתק את המפתח — זה ה-<Code>SERPER_API_KEY</Code>.
            </p>
          </Step>
        </div>
      </Card>

      {/* Env file section */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-5">
          <span className="text-xl">⚙️</span>
          <h2 className="font-bold text-slate-800">הוספת משתני הסביבה</h2>
        </div>
        <div className="space-y-5">
          <Step num={6} title="צור קובץ .env.local">
            <p>
              בתיקיית השורש של הפרויקט צור קובץ בשם <Code>.env.local</Code> עם התוכן
              הבא (החלף את הערכים האמיתיים שלך):
            </p>
            <pre
              className="mt-2 bg-slate-900 text-green-400 text-xs rounded-lg p-4 overflow-x-auto"
              dir="ltr"
            >{`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SERPER_API_KEY=abc123...`}</pre>
          </Step>

          <Step num={7} title="הפעל מחדש את השרת">
            <p>
              לאחר שמירת הקובץ, הפעל מחדש את שרת הפיתוח עם{' '}
              <Code>npm run dev</Code> כדי שהמשתנים ייטענו.
            </p>
            <p className="mt-1 text-slate-500 text-xs">
              בסביבת ייצור (Vercel, Railway וכד׳) יש להוסיף את המשתנים בלוח הבקרה
              של הפלטפורמה ולא בקובץ.
            </p>
          </Step>
        </div>
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

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="font-bold text-slate-800 mb-4">בדיקת סריקה חיה</h2>
        <p className="text-sm text-slate-500 mb-5">
          בצע סריקת ניסיון כדי לוודא שמפתח ה-API עובד ולראות תשובה אמיתית מ-Serper.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Engine */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">מנוע חיפוש</label>
            <div className="flex gap-3">
              {[
                { value: 'google_search', label: '🌐 גוגל אורגני' },
                { value: 'google_maps', label: '📍 גוגל מפות' },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer text-sm transition-all ${
                    engine === opt.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    value={opt.value}
                    checked={engine === opt.value}
                    onChange={(e) => setEngine(e.target.value as 'google_search' | 'google_maps')}
                    className="sr-only"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* Keyword */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">מילת מפתח</label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Domain / Business */}
          {engine === 'google_search' ? (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">דומיין יעד</label>
              <input
                type="text"
                value={targetDomain}
                onChange={(e) => setTargetDomain(e.target.value)}
                placeholder="example.co.il"
                dir="ltr"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">שם עסק</label>
              <input
                type="text"
                value={targetBusinessName}
                onChange={(e) => setTargetBusinessName(e.target.value)}
                placeholder="שם העסק בגוגל מפות"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Country */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">מדינה</label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="IL">ישראל (IL)</option>
              <option value="US">ארה&quot;ב (US)</option>
              <option value="GB">בריטניה (GB)</option>
            </select>
          </div>

          {/* Language */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">שפה</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="he">עברית (he)</option>
              <option value="en">אנגלית (en)</option>
            </select>
          </div>
        </div>

        <button
          onClick={runTest}
          disabled={loading}
          className="mt-5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              סורק…
            </>
          ) : (
            <>🚀 הרץ בדיקה</>
          )}
        </button>
      </Card>

      {/* Result */}
      {result && (
        <Card className="p-6">
          {result.error ? (
            <div className="text-red-600 text-sm">
              <span className="font-semibold">שגיאה: </span>{result.error}
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="font-semibold text-slate-800">תוצאה</h3>

              {/* Parsed summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-slate-800">
                    {parsed?.found ? parsed.position ?? '—' : '—'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">מיקום</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <div className={`text-2xl font-bold ${parsed?.found ? 'text-green-600' : 'text-red-500'}`}>
                    {parsed?.found ? 'נמצא' : 'לא נמצא'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">סטטוס</div>
                </div>
                {parsed?.totalResults != null && (
                  <div className="bg-slate-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-slate-800">
                      {parsed.totalResults.toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">תוצאות כולל</div>
                  </div>
                )}
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <div className="text-sm font-bold text-slate-800 truncate">
                    {result.timing.startedAt
                      ? new Date(result.timing.completedAt).getTime() -
                        new Date(result.timing.startedAt).getTime()
                      : '—'}ms
                  </div>
                  <div className="text-xs text-slate-500 mt-1">זמן תגובה</div>
                </div>
              </div>

              {parsed?.error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">
                  <span className="font-medium">שגיאת סריקה: </span>{parsed.error}
                </div>
              )}

              {/* Raw toggle */}
              <div>
                <button
                  onClick={() => setShowRaw(!showRaw)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {showRaw ? 'הסתר תגובה גולמית' : 'הצג תגובה גולמית מ-Serper'}
                </button>
                {showRaw && (
                  <pre className="mt-2 bg-slate-900 text-green-300 text-xs rounded-lg p-4 overflow-x-auto max-h-96" dir="ltr">
                    {JSON.stringify(result.raw, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          )}
        </Card>
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-800">לוג שגיאות אחרונות</h2>
        <button onClick={fetchLogs} className="text-xs text-blue-600 hover:underline">
          רענן
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 gap-3">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-500 text-sm">טוען…</span>
        </div>
      )}

      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-800 text-sm">
          {error.includes('Supabase') || error.includes('מוגדר')
            ? 'Supabase אינו מחובר עדיין — לאחר ההגדרה יופיעו כאן שגיאות מהסריקות.'
            : error}
        </div>
      )}

      {!loading && !error && logs.length === 0 && (
        <Card className="p-10 text-center">
          <span className="text-4xl block mb-3">✅</span>
          <p className="text-slate-600 font-medium">אין שגיאות אחרונות</p>
          <p className="text-slate-400 text-sm mt-1">הכל עובד כצפוי</p>
        </Card>
      )}

      {!loading && logs.length > 0 && (
        <Card>
          <div className="divide-y divide-slate-100">
            {logs.map((log) => (
              <div key={log.id} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <span
                    className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full mt-0.5 ${levelStyle(log.level)}`}
                  >
                    {levelLabel(log.level)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{log.message}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{log.detail}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {log.project} &bull;{' '}
                      {new Date(log.timestamp).toLocaleString('he-IL')}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

/* ─── Main Page ──────────────────────────────────────────── */

const TABS = [
  { id: 'status', label: 'סטטוס חיבורים', icon: '🔌' },
  { id: 'instructions', label: 'הוראות הגדרה', icon: '📖' },
  { id: 'test', label: 'בדיקת סריקה', icon: '🧪' },
  { id: 'logs', label: 'לוג שגיאות', icon: '📋' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function SetupPage() {
  const [activeTab, setActiveTab] = useState<TabId>('status')

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 w-full">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">הגדרת המערכת</h1>
        <p className="text-slate-500 text-sm mt-1">
          בצע את השלבים הבאים כדי לחבר את Supabase ו-Serper ולהפעיל את המערכת.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6 flex-wrap">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'status' && <StatusTab />}
      {activeTab === 'instructions' && <InstructionsTab />}
      {activeTab === 'test' && <TestScanTab />}
      {activeTab === 'logs' && <LogsTab />}
    </div>
  )
}
