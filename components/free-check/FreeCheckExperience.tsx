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
 * It is drawn with the app's own primitives and tokens (ui/Input, ui/Button,
 * ui/StatTile, ui/Badge, ui/NoticeBox): the first screen a prospective customer
 * sees is the same product they will sign in to.
 */
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, CircleAlert, CircleCheck, Lock, RotateCcw } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import StatTile from '@/components/ui/StatTile'
import { NoticeBox } from '@/components/ui/Notice'
import { buttonClasses, CheckList, Eyebrow } from '@/components/public/marketing'
import { cn } from '@/lib/utils'
import { freeCheckCopy } from '@/lib/free-check/copy'
import type { FreeCheckErrorCode, FreeCheckResponse, FreeCheckResult } from '@/lib/free-check/types'
import type { Locale } from '@/lib/i18n/locales'
import { authHref } from '@/lib/i18n/auth-href'

type Phase = 'form' | 'scanning' | 'results'

/** How long each progress step is shown before the next one starts. */
const STEP_MS = 3_500

/** A finding's tone: the start border and the badge. Never a tinted card. */
const SEVERITY_STYLES: Record<string, { border: string; badge: 'danger' | 'warning' | 'neutral'; label: { he: string; en: string } }> = {
  blocker: { border: 'border-s-bad', badge: 'danger', label: { he: 'קריטי', en: 'Critical' } },
  warning: { border: 'border-s-warn', badge: 'warning', label: { he: 'אזהרה', en: 'Warning' } },
  info: { border: 'border-s-line-strong', badge: 'neutral', label: { he: 'המלצה', en: 'Tip' } },
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
          locale={locale}
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
  locale = 'he',
  url,
  onUrl,
  error,
  errorMessage,
  onSubmit,
}: {
  copy: Copy
  locale?: Locale
  url: string
  onUrl: (v: string) => void
  error: FreeCheckErrorCode | null
  /** A message of the caller's own, shown in place of the free check's for `error`. */
  errorMessage?: string | null
  onSubmit: () => void
}) {
  const message = errorMessage ?? (error ? copy.form.errors[error] : null)
  return (
    <section className="relative mx-auto max-w-3xl px-4 pb-20 pt-12 text-center sm:px-6 sm:pt-16">
      <div className="mb-5">
        <Eyebrow>{copy.page.badge}</Eyebrow>
      </div>
      <h1 className="text-title font-bold tracking-tight text-ink text-balance sm:text-display">
        {copy.page.title}{' '}
        <span className="text-action">{copy.page.titleAccent}</span>
      </h1>
      <p className="mx-auto mt-5 max-w-2xl text-section font-normal text-body text-pretty">{copy.page.subtitle}</p>

      <form
        className="mt-10 space-y-3 rounded-card border border-line bg-surface p-4 text-start shadow-card sm:p-5"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
      >
        <label htmlFor="free-check-url" className="sr-only">
          {copy.form.label}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="min-w-0 flex-1">
            <Input
              id="free-check-url"
              name="url"
              type="text"
              inputMode="url"
              autoComplete="url"
              dir="ltr"
              value={url}
              onChange={(e) => onUrl(e.target.value)}
              placeholder={copy.form.placeholder}
              aria-invalid={message ? true : undefined}
              className="h-11"
            />
          </div>
          <Button type="submit" size="lg" className="shrink-0">
            {copy.form.submit}
          </Button>
        </div>
        {message && (
          <div role="alert">
            <NoticeBox tone="bad" language={locale}>{message}</NoticeBox>
          </div>
        )}
        <p className="text-caption text-muted">{copy.form.hint}</p>
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
    <section className="mx-auto max-w-2xl px-4 pb-24 pt-12 sm:px-6 sm:pt-16" aria-live="polite" aria-busy="true">
      <div className="mb-10 h-1.5 w-full overflow-hidden rounded-pill bg-sunk">
        <div className="h-full rounded-pill bg-action transition-[width] duration-700 ease-snappy" style={{ width: `${progress}%` }} />
      </div>

      <div className="mb-8 text-center">
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-inset bg-action-soft">
          <span className="size-5 animate-spin rounded-pill border-2 border-action border-t-transparent" aria-hidden="true" />
        </div>
        <h2 className="text-title font-bold tracking-tight text-ink">{copy.loading.steps[step] ?? copy.loading.title}</h2>
        <p className="mt-2 text-copy text-body">{copy.loading.sub}</p>
      </div>

      <ol className="space-y-2">
        {copy.loading.steps.map((label, i) => {
          const done = i < step
          const active = i === step
          return (
            <li
              key={label}
              className={cn(
                'flex items-center gap-3 rounded-inset border px-4 py-3 transition-[background-color,border-color] duration-150 ease-snappy',
                active ? 'border-action/30 bg-action-soft' : 'border-line bg-surface',
              )}
            >
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-pill text-caption font-bold tabular-nums',
                  done ? 'bg-ok-soft text-ok' : active ? 'bg-action text-action-ink' : 'bg-sunk text-muted',
                )}
              >
                {done ? <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> : i + 1}
              </span>
              <span className={cn('text-copy', done ? 'text-muted' : active ? 'font-semibold text-ink' : 'text-muted')}>{label}</span>
            </li>
          )
        })}
      </ol>
      <p className="mt-8 text-center text-caption text-muted">{copy.loading.footer}</p>
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
    <section className="mx-auto max-w-4xl space-y-8 px-4 pb-24 pt-10 sm:px-6 sm:pt-12">
      <header className="text-center">
        <h1 className="text-title font-bold tracking-tight text-ink">{r.heading}</h1>
        <p className="mt-2 text-copy text-body">
          {r.scanned}{' '}
          <span dir="ltr" className="font-semibold text-ink">
            {result.domain}
          </span>
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile value={String(result.counters.keywords)} label={r.counters.keywords} />
        <StatTile value={String(result.counters.fixes)} label={r.counters.fixes} />
        <StatTile value={`${result.counters.geoPassed}/${result.counters.geoTotal}`} label={r.counters.geo} />
        <StatTile value={String(result.counters.articles)} label={r.counters.articles} />
      </div>

      {result.business ? (
        <>
          <Block title={r.businessTitle}>
            {result.business.niche && (
              <div className="mb-3">
                <Badge variant="info">
                  {result.business.niche}
                  {result.business.platform ? ` · ${result.business.platform}` : ''}
                </Badge>
              </div>
            )}
            <p className="text-copy text-body">{result.business.summary}</p>
          </Block>

          {result.business.audiences.length > 0 && (
            <Block title={r.audienceTitle}>
              <ul className="space-y-2">
                {result.business.audiences.map((a) => (
                  <li key={a} className="flex gap-2.5 text-copy text-body">
                    <span className="mt-2.5 size-1.5 shrink-0 rounded-pill bg-action" aria-hidden="true" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </Block>
          )}
        </>
      ) : (
        <Block title={r.businessTitle}>
          <p className="text-copy text-body">{r.aiUnavailable}</p>
        </Block>
      )}

      {result.competitors.length > 0 && (
        <Block title={r.competitorsTitle}>
          <div className="mb-3 flex flex-wrap gap-2">
            {result.competitors.map((c) => (
              <span key={c} dir="ltr" className="inline-flex h-8 items-center rounded-control border border-line bg-sunk px-3 text-caption font-semibold text-ink">
                {c}
              </span>
            ))}
          </div>
          {result.lockedCompetitors > 0 && (
            <p className="text-caption text-muted">
              {r.competitorsLocked}
              <span className="mx-1 font-semibold text-ink">+{result.lockedCompetitors}</span>
            </p>
          )}
        </Block>
      )}

      <Block title={r.findingsTitle}>
        {result.findings.length === 0 ? (
          <p className="flex items-center gap-2 text-copy text-body">
            <CircleCheck className="size-4 shrink-0 text-ok" aria-hidden="true" />
            {r.findingsEmpty}
          </p>
        ) : (
          <ul className="space-y-3">
            {result.findings.map((f) => {
              const style = SEVERITY_STYLES[f.severity] ?? SEVERITY_STYLES.info
              return (
                <li key={f.id} className={cn('rounded-inset border border-line border-s-[3px] bg-surface p-4', style.border)}>
                  <div className="mb-1 flex items-start gap-3">
                    <h3 className="min-w-0 flex-1 text-copy font-semibold text-ink">{f.title}</h3>
                    <Badge variant={style.badge}>{style.label[locale]}</Badge>
                  </div>
                  <p className="text-copy text-body">{f.detail}</p>
                  {f.evidence && <p className="mt-1.5 text-caption text-muted">{f.evidence}</p>}
                </li>
              )
            })}
          </ul>
        )}
        {result.lockedFindings > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-inset bg-sunk px-4 py-3 text-copy text-body">
            <Lock className="size-4 shrink-0 text-muted" aria-hidden="true" />
            <span>
              {r.findingsLocked}
              <span className="mx-1 font-semibold text-ink">+{result.lockedFindings}</span>
            </span>
          </div>
        )}
      </Block>

      <Block title={r.geoTitle}>
        <p className="text-copy text-body">{r.geoIntro}</p>
        <p className="mb-3 mt-4 text-copy font-semibold text-ink">
          <span className="tabular-nums">{result.geo.passed}/{result.geo.total}</span> {r.geoScore}
        </p>
        <ul className="space-y-3">
          {result.geo.signals.map((s) => (
            <li key={s.id} className="flex gap-3">
              {s.ok
                ? <CircleCheck className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden="true" />
                : <CircleAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden="true" />}
              <span>
                <span className="block text-copy font-semibold text-ink">{s.title}</span>
                <span className="block text-caption text-muted">{s.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </Block>

      {result.keywords.length > 0 && (
        <Block title={copy.results.counters.keywords}>
          <div className="flex flex-wrap gap-2">
            {result.keywords.map((k) => (
              <span key={k} className="inline-flex h-8 items-center rounded-control border border-line bg-sunk px-3 text-caption font-semibold text-ink">
                {k}
              </span>
            ))}
          </div>
        </Block>
      )}

      {result.articles.length > 0 && (
        <Block title={r.articlesTitle}>
          <ol className="space-y-2.5">
            {result.articles.map((a, i) => (
              <li key={a} className="flex items-start gap-3 text-copy text-ink">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-control bg-action-soft text-caption font-bold tabular-nums text-action">{i + 1}</span>
                <span className="pt-0.5">{a}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-caption text-muted">{r.articlesNote}</p>
        </Block>
      )}

      <div className="relative overflow-hidden rounded-card bg-contrast p-6 text-contrast-ink shadow-card sm:p-10 bg-[radial-gradient(90%_120%_at_100%_0%,rgb(0_134_245/0.22),transparent_60%)] rtl:bg-[radial-gradient(90%_120%_at_0%_0%,rgb(0_134_245/0.22),transparent_60%)]">
        <h2 className="text-title font-bold tracking-tight text-contrast-ink">{r.gateTitle}</h2>
        <p className="mt-2 text-copy text-contrast-ink/75">{r.gateBody}</p>
        <CheckList items={r.gateBullets} inverse className="mb-8 mt-6" />
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <Link href={signupHref} className={buttonClasses('primary', 'lg')}>
            {r.gateCta}
          </Link>
          <Link href={loginHref} className={buttonClasses('inverse', 'lg')}>
            {r.gateSecondary}
          </Link>
        </div>
        <p className="mt-4 text-caption text-contrast-ink/60">{r.gateTerms}</p>
      </div>

      <div className="text-center">
        <Button type="button" variant="ghost" onClick={onRestart}>
          <RotateCcw className="size-4" aria-hidden="true" />
          {r.again}
        </Button>
      </div>
    </section>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 text-section font-semibold text-ink">{title}</h2>
      <div className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">{children}</div>
    </div>
  )
}
