'use client'

/**
 * The free site check, as the visitor experiences it: one container with three
 * states (form → progress → results), which is what makes it feel like a scan
 * rather than a page load.
 *
 * Two honesty rules shape the progress screen. The steps advance on a timer
 * because the API is one round trip and cannot stream per-step progress, so the
 * timing is presentational — but the screen never claims a step is FINISHED
 * that the request has not returned: the last step stays in progress until the
 * response lands, and if the response is slow the screen waits there instead of
 * completing on its own. And an error takes the visitor back to the form with a
 * merchant-safe message, never to a half-built results screen.
 *
 * Styling is local Tailwind on purpose. The dashboard redesign owns the shared
 * primitives and design tokens; this screen stays self-contained so it can be
 * switched over to them in one pass without touching behaviour.
 */
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { freeCheckCopy } from '@/lib/free-check/copy'
import type { FreeCheckErrorCode, FreeCheckResponse, FreeCheckResult } from '@/lib/free-check/types'
import type { Locale } from '@/lib/i18n/locales'
import { authHref } from '@/lib/i18n/auth-href'

type Phase = 'form' | 'scanning' | 'results'

/** How long each progress step is shown before the next one starts. */
const STEP_MS = 3_500

const SEVERITY_STYLES: Record<string, { dot: string; chip: string; label: { he: string; en: string } }> = {
  blocker: { dot: 'bg-red-500', chip: 'bg-red-50 text-red-700 border-red-100', label: { he: 'קריטי', en: 'Critical' } },
  warning: { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 border-amber-100', label: { he: 'אזהרה', en: 'Warning' } },
  info: { dot: 'bg-slate-400', chip: 'bg-slate-50 text-slate-600 border-slate-200', label: { he: 'המלצה', en: 'Tip' } },
}

export function FreeCheckExperience({ locale, initialUrl = '' }: { locale: Locale; initialUrl?: string }) {
  const copy = freeCheckCopy(locale)
  const dir = locale === 'he' ? 'rtl' : 'ltr'
  const loginHref = authHref('login', locale)
  const signupHref = authHref('signup', locale)

  const [phase, setPhase] = useState<Phase>('form')
  const [url, setUrl] = useState(initialUrl)
  const [error, setError] = useState<FreeCheckErrorCode | null>(null)
  const [step, setStep] = useState(0)
  const [result, setResult] = useState<FreeCheckResult | null>(null)
  // The one-time capability that seeds this visitor's first project from this
  // scan. It rides the signup link and nothing else; it is never stored.
  const [claimToken, setClaimToken] = useState<string | null>(null)
  const inFlight = useRef(false)

  const start = useCallback(async (raw: string) => {
    const candidate = raw.trim()
    if (!candidate || inFlight.current) return
    inFlight.current = true
    setError(null)
    setStep(0)
    setPhase('scanning')
    try {
      const res = await fetch('/api/free-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: candidate, locale }),
      })
      const data = (await res.json()) as FreeCheckResponse
      if (!data.ok) {
        setError(data.code)
        setPhase('form')
        return
      }
      setResult(data.result)
      setClaimToken(data.claimToken ?? null)
      setPhase('results')
    } catch {
      setError('internal')
      setPhase('form')
    } finally {
      inFlight.current = false
    }
  }, [locale])

  // Advance the visible step while the request is in flight, stopping on the
  // last one — it completes only when the response arrives.
  useEffect(() => {
    if (phase !== 'scanning') return
    const timer = setInterval(() => {
      setStep((s) => Math.min(s + 1, copy.loading.steps.length - 1))
    }, STEP_MS)
    return () => clearInterval(timer)
  }, [phase, copy.loading.steps.length])

  // A ?url= on the page starts the scan immediately, so the hero field on the
  // landing page leads straight into the progress screen.
  useEffect(() => {
    if (initialUrl.trim()) void start(initialUrl)
  }, [initialUrl, start])

  useEffect(() => {
    if (phase === 'results' && typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [phase])

  return (
    <div dir={dir} className="min-h-[70vh]">
      {phase === 'form' && (
        <FormState
          copy={copy}
          url={url}
          onUrl={setUrl}
          error={error}
          onSubmit={() => void start(url)}
        />
      )}
      {phase === 'scanning' && <ScanningState copy={copy} step={step} />}
      {phase === 'results' && result && (
        <ResultsState
          copy={copy}
          locale={locale}
          result={result}
          signupHref={claimToken ? `${signupHref}${signupHref.includes('?') ? '&' : '?'}claim=${encodeURIComponent(claimToken)}` : signupHref}
          loginHref={loginHref}
          onRestart={() => {
            setResult(null)
            setClaimToken(null)
            setUrl('')
            setPhase('form')
          }}
        />
      )}
    </div>
  )
}

type Copy = ReturnType<typeof freeCheckCopy>

/** The one-field form. Shared with the research before sign-up (FreeCheckResearch), which passes its own message. */
export function FormState({
  copy,
  url,
  onUrl,
  error,
  errorMessage,
  onSubmit,
}: {
  copy: Copy
  url: string
  onUrl: (v: string) => void
  error: FreeCheckErrorCode | null
  /** A message of the caller's own, shown in place of the free check's for `error`. */
  errorMessage?: string | null
  onSubmit: () => void
}) {
  const message = errorMessage ?? (error ? copy.form.errors[error] : null)
  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 pb-24 text-center">
      <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-xs font-medium mb-6">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        {copy.page.badge}
      </span>
      <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 leading-tight mb-4">
        {copy.page.title}{' '}
        <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
          {copy.page.titleAccent}
        </span>
      </h1>
      <p className="text-base sm:text-lg text-slate-600 leading-relaxed mb-10">{copy.page.subtitle}</p>

      <form
        className="bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/60 p-4 sm:p-5"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
      >
        <label htmlFor="free-check-url" className="sr-only">
          {copy.form.label}
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            id="free-check-url"
            name="url"
            type="text"
            inputMode="url"
            autoComplete="url"
            dir="ltr"
            value={url}
            onChange={(e) => onUrl(e.target.value)}
            placeholder={copy.form.placeholder}
            className="flex-1 px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            type="submit"
            className="px-7 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-600/25 hover:from-blue-700 hover:to-indigo-700 transition-all"
          >
            {copy.form.submit}
          </button>
        </div>
        {message && (
          <p role="alert" className="mt-3 text-sm text-red-600 text-start">
            {message}
          </p>
        )}
        <p className="mt-3 text-xs text-slate-500 text-start">{copy.form.hint}</p>
      </form>
    </section>
  )
}

function ScanningState({ copy, step }: { copy: Copy; step: number }) {
  const total = copy.loading.steps.length
  // The bar stops short of 100% while the last step is still running: the
  // request, not the timer, decides when the scan is done.
  const progress = Math.round(((step + 0.5) / total) * 100)
  return (
    <section className="max-w-2xl mx-auto px-4 sm:px-6 pt-20 pb-28" aria-live="polite" aria-busy="true">
      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden mb-10">
        <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-700" style={{ width: `${progress}%` }} />
      </div>

      <div className="text-center mb-10">
        <div className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
          <span className="w-8 h-8 rounded-full border-[3px] border-blue-600 border-t-transparent animate-spin" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">{copy.loading.steps[step] ?? copy.loading.title}</h2>
        <p className="text-slate-600">{copy.loading.sub}</p>
      </div>

      <ol className="space-y-3">
        {copy.loading.steps.map((label, i) => {
          const done = i < step
          const active = i === step
          return (
            <li
              key={label}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                active ? 'border-blue-200 bg-blue-50/60' : done ? 'border-slate-200 bg-white' : 'border-slate-100 bg-white'
              }`}
            >
              <span
                className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                  done ? 'bg-green-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'
                }`}
              >
                {done ? '✓' : i + 1}
              </span>
              <span className={`text-sm ${done ? 'text-slate-500' : active ? 'text-slate-900 font-medium' : 'text-slate-400'}`}>{label}</span>
            </li>
          )
        })}
      </ol>
      <p className="mt-8 text-center text-sm text-slate-500">{copy.loading.footer}</p>
    </section>
  )
}

function ResultsState({
  copy,
  locale,
  result,
  signupHref,
  loginHref,
  onRestart,
}: {
  copy: Copy
  locale: Locale
  result: FreeCheckResult
  signupHref: string
  loginHref: string
  onRestart: () => void
}) {
  const r = copy.results
  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-12 pb-24">
      <header className="text-center mb-10">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-3">{r.heading}</h1>
        <p className="text-slate-600">
          {r.scanned}{' '}
          <span dir="ltr" className="font-semibold text-slate-900">
            {result.domain}
          </span>
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-12">
        <Counter value={String(result.counters.keywords)} label={r.counters.keywords} />
        <Counter value={String(result.counters.fixes)} label={r.counters.fixes} />
        <Counter value={`${result.counters.geoPassed}/${result.counters.geoTotal}`} label={r.counters.geo} />
        <Counter value={String(result.counters.articles)} label={r.counters.articles} />
      </div>

      {result.business ? (
        <>
          <Block title={r.businessTitle}>
            {result.business.niche && (
              <span className="inline-block mb-3 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-medium">
                {result.business.niche}
                {result.business.platform ? ` · ${result.business.platform}` : ''}
              </span>
            )}
            <p className="text-slate-700 leading-relaxed">{result.business.summary}</p>
          </Block>

          {result.business.audiences.length > 0 && (
            <Block title={r.audienceTitle}>
              <ul className="space-y-2">
                {result.business.audiences.map((a) => (
                  <li key={a} className="flex gap-2 text-slate-700">
                    <span className="mt-2 w-1.5 h-1.5 shrink-0 rounded-full bg-indigo-500" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </Block>
          )}
        </>
      ) : (
        <Block title={r.businessTitle}>
          <p className="text-slate-600">{r.aiUnavailable}</p>
        </Block>
      )}

      {result.competitors.length > 0 && (
        <Block title={r.competitorsTitle}>
          <div className="flex flex-wrap gap-2 mb-3">
            {result.competitors.map((c) => (
              <span key={c} dir="ltr" className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium">
                {c}
              </span>
            ))}
          </div>
          {result.lockedCompetitors > 0 && (
            <p className="text-sm text-slate-500">
              {r.competitorsLocked}
              <span className="mx-1 font-semibold text-slate-700">+{result.lockedCompetitors}</span>
            </p>
          )}
        </Block>
      )}

      <Block title={r.findingsTitle}>
        {result.findings.length === 0 ? (
          <p className="text-slate-700">🎉 {r.findingsEmpty}</p>
        ) : (
          <ul className="space-y-3">
            {result.findings.map((f) => {
              const style = SEVERITY_STYLES[f.severity]
              return (
                <li key={f.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                    <h3 className="font-semibold text-slate-900">{f.title}</h3>
                    <span className={`ms-auto px-2 py-0.5 rounded-md border text-[11px] font-medium ${style.chip}`}>
                      {style.label[locale]}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">{f.detail}</p>
                  {f.evidence && <p className="mt-1.5 text-xs text-slate-500">{f.evidence}</p>}
                </li>
              )
            })}
          </ul>
        )}
        {result.lockedFindings > 0 && (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            🔒 {r.findingsLocked}
            <span className="mx-1 font-semibold text-slate-800">+{result.lockedFindings}</span>
          </div>
        )}
      </Block>

      <Block title={r.geoTitle}>
        <p className="text-slate-600 mb-4">{r.geoIntro}</p>
        <p className="font-semibold text-slate-900 mb-3">
          {result.geo.passed}/{result.geo.total} {r.geoScore}
        </p>
        <ul className="space-y-3">
          {result.geo.signals.map((s) => (
            <li key={s.id} className="flex gap-3">
              <span
                className={`mt-0.5 w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                  s.ok ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}
              >
                {s.ok ? '✓' : '!'}
              </span>
              <span>
                <span className="block font-medium text-slate-900">{s.title}</span>
                <span className="block text-sm text-slate-600">{s.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </Block>

      {result.keywords.length > 0 && (
        <Block title={copy.results.counters.keywords}>
          <div className="flex flex-wrap gap-2">
            {result.keywords.map((k) => (
              <span key={k} className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-100 text-blue-800 text-sm font-medium">
                {k}
              </span>
            ))}
          </div>
        </Block>
      )}

      {result.articles.length > 0 && (
        <Block title={r.articlesTitle}>
          <ol className="space-y-2">
            {result.articles.map((a, i) => (
              <li key={a} className="flex gap-3 text-slate-800">
                <span className="w-6 h-6 shrink-0 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                <span>{a}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-slate-500">{r.articlesNote}</p>
        </Block>
      )}

      <div className="mt-12 rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-6 sm:p-10">
        <h2 className="text-2xl font-bold mb-3">{r.gateTitle}</h2>
        <p className="text-slate-300 mb-6">{r.gateBody}</p>
        <ul className="space-y-2 mb-8">
          {r.gateBullets.map((b) => (
            <li key={b} className="flex gap-2 text-slate-100">
              <span className="text-green-400">✓</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <Link
            href={signupHref}
            className="px-7 py-3.5 rounded-xl bg-white text-slate-900 font-semibold text-center shadow-lg hover:bg-slate-100 transition-colors"
          >
            {r.gateCta}
          </Link>
          <Link href={loginHref} className="px-5 py-3.5 rounded-xl border border-white/20 text-white text-center hover:bg-white/10 transition-colors">
            {r.gateSecondary}
          </Link>
        </div>
        <p className="mt-4 text-xs text-slate-400">{r.gateTerms}</p>
      </div>

      <div className="mt-8 text-center">
        <button type="button" onClick={onRestart} className="text-sm font-medium text-blue-700 hover:text-blue-800 underline">
          {r.again}
        </button>
      </div>
    </section>
  )
}

function Counter({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
      <div className="text-3xl font-extrabold text-slate-900">{value}</div>
      <div className="mt-1 text-xs sm:text-sm text-slate-600 leading-snug">{label}</div>
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-lg font-bold text-slate-900 mb-3">{title}</h2>
      <div className="rounded-2xl border border-slate-200 bg-white p-5">{children}</div>
    </div>
  )
}
