'use client'

/**
 * The free check with the research before sign-up on (lib/presignup): one
 * field, then the seed scan's own progress screen reading the real steps as
 * the server reports them, then the research summary itself, gated, with
 * "Open the full research, free" as the sign-up.
 *
 * Nothing here is a second design: the progress is components/onboarding/
 * SeedProgress and the summary is components/onboarding/ResearchSummary in its
 * `preview` mode, in the page's own language (FixedDashboardLanguage: /free-check
 * is Hebrew, /en/free-check English, whatever the visitor's dashboard
 * preference).
 *
 * When the research is not available (its tables are not migrated, or it was
 * switched off between the page and the request), the visitor is told so in one
 * line and gets the short free check for the same address instead: never a
 * dead end, never a raw error.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import ResearchSummary from '@/components/onboarding/ResearchSummary'
import SeedProgress from '@/components/onboarding/SeedProgress'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import Input from '@/components/ui/Input'
import { NoticeBox } from '@/components/ui/Notice'
import { freeCheckCopy } from '@/lib/free-check/copy'
import { authHref } from '@/lib/i18n/auth-href'
import { FixedDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import type { Locale } from '@/lib/i18n/locales'
import { readSiteInput } from '@/lib/onboarding/site-input'
import { INITIAL_STEPS, knownResearchCode, readResearchStream, researchRun, withStep } from '@/lib/presignup/client'
import { researchScreenCopy } from '@/lib/presignup/copy'
import type { ReportRequestResponse, ResearchErrorCode, ResearchStepView, ResearchView } from '@/lib/presignup/types'
import { FreeCheckExperience, FormState } from './FreeCheckExperience'

type Phase = 'form' | 'progress' | 'summary' | 'fallback'

export function FreeCheckResearch({ locale, initialUrl = '' }: { locale: Locale; initialUrl?: string }) {
  const copy = freeCheckCopy(locale)
  const screen = researchScreenCopy(locale)
  const dir = locale === 'he' ? 'rtl' : 'ltr'

  const [phase, setPhase] = useState<Phase>('form')
  const [url, setUrl] = useState(initialUrl)
  const [error, setError] = useState<ResearchErrorCode | null>(null)
  const [steps, setSteps] = useState<ResearchStepView[]>(INITIAL_STEPS)
  const [view, setView] = useState<ResearchView | null>(null)
  const [serverNow, setServerNow] = useState('')
  // The one-time capability that seeds the first project from THIS research.
  // It rides the sign-up link and the report request, and is never stored.
  const [claimToken, setClaimToken] = useState<string | null>(null)
  const inFlight = useRef(false)

  const start = useCallback(
    async (raw: string) => {
      const candidate = raw.trim()
      if (!candidate || inFlight.current) return
      inFlight.current = true
      setError(null)
      setSteps(INITIAL_STEPS)
      setPhase('progress')
      const fail = (code: ResearchErrorCode) => {
        // Not available here or now: the short check for the same address instead.
        if (code === 'unavailable' || code === 'not_found') {
          setPhase('fallback')
          return
        }
        setError(code)
        setPhase('form')
      }
      try {
        const res = await fetch('/api/free-check/research', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: candidate, locale }),
        })
        if (!res.ok || !res.body || !(res.headers.get('content-type') ?? '').includes('ndjson')) {
          const body = (await res.json().catch(() => null)) as { code?: unknown } | null
          fail(knownResearchCode(body?.code))
          return
        }
        let ended = false
        await readResearchStream(res.body, (event) => {
          if (event.type === 'step') setSteps((s) => withStep(s, event.step))
          else if (event.type === 'result') {
            ended = true
            setView(event.view)
            setClaimToken(event.claimToken)
            setServerNow(new Date().toISOString())
            setPhase('summary')
          } else {
            ended = true
            fail(knownResearchCode(event.code))
          }
        })
        if (!ended) fail('internal')
      } catch {
        fail('internal')
      } finally {
        inFlight.current = false
      }
    },
    [locale],
  )

  // A ?url= (the landing page's hero field) starts the research straight away.
  useEffect(() => {
    if (initialUrl.trim()) void start(initialUrl)
  }, [initialUrl, start])

  useEffect(() => {
    if ((phase === 'summary' || phase === 'progress') && typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [phase])

  if (phase === 'fallback') {
    return (
      <div dir={dir} data-research-state="fallback">
        <div className="mx-auto mt-8 max-w-3xl px-4 text-start sm:px-6">
          <NoticeBox tone="info" language={locale}>
            <p className="font-semibold">{screen.unavailableTitle}</p>
            <p className="mt-0.5 text-body">{screen.unavailableBody}</p>
          </NoticeBox>
        </div>
        <FreeCheckExperience locale={locale} initialUrl={url} />
      </div>
    )
  }

  const site = readSiteInput(url)
  const domain = site.ok ? site.domain.replace(/^www\./, '') : url.trim()

  return (
    <div dir={dir} className="min-h-[70vh]" data-research-state={phase}>
      {phase === 'form' && (
        <FormState
          copy={copy}
          locale={locale}
          url={url}
          onUrl={setUrl}
          error={null}
          errorMessage={error ? screen.errors[error] : null}
          onSubmit={() => void start(url)}
        />
      )}
      {phase !== 'form' && (
        <FixedDashboardLanguage locale={locale}>
          <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 md:pt-10">
            {phase === 'progress' && <SeedProgress run={researchRun(steps)} domain={domain} projectId={null} reconnecting={false} />}
            {phase === 'summary' && view && (
              <ResearchSummary
                projectId=""
                domain={view.summary.domain}
                projectName=""
                run={researchRun(view.steps)}
                summary={view.summary}
                started={false}
                contentEnabled={false}
                serverNow={serverNow}
                onContinued={() => {}}
                preview={{
                  signupHref: authHref('signup', locale, { claim: claimToken }),
                  loginHref: authHref('login', locale),
                  lockedCompetitors: view.locked.competitors,
                  lockedKeywords: view.locked.keywords,
                  after: claimToken ? <ReportRequest locale={locale} token={claimToken} /> : null,
                }}
              />
            )}
          </div>
        </FixedDashboardLanguage>
      )}
    </div>
  )
}

/**
 * "Email me the report": a small link that opens a form. The consent box
 * starts unticked and the request is refused without it (the server refuses
 * too, and stores its own copy of these words, never the browser's).
 */
function ReportRequest({ locale, token }: { locale: Locale; token: string }) {
  const t = researchScreenCopy(locale).report
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const privacyHref = locale === 'en' ? '/en/privacy' : '/privacy'

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!consent) {
      setError(t.errors.consent_required)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/free-check/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, email, consent: true, locale }),
      })
      const body = (await res.json().catch(() => null)) as ReportRequestResponse | null
      if (body?.ok) {
        setSaved(true)
        return
      }
      const code = body && !body.ok ? body.code : 'internal'
      setError(code in t.errors ? t.errors[code as keyof typeof t.errors] : t.errors.internal)
    } catch {
      setError(t.errors.internal)
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-control text-copy font-medium text-muted underline underline-offset-4 transition-colors duration-150 ease-snappy hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20" data-report-link>
        {t.link}
      </button>
    )
  }
  if (saved) {
    return (
      <div data-report-saved>
        <NoticeBox tone="ok" language={locale}>{t.saved}</NoticeBox>
      </div>
    )
  }
  return (
    <form onSubmit={submit} noValidate className="w-full max-w-md space-y-4 rounded-card border border-line bg-surface p-5 text-start shadow-card sm:p-6" data-report-form>
      <div>
        <p className="text-section font-semibold text-ink">{t.title}</p>
        <p className="mt-1 text-copy text-muted">{t.body}</p>
      </div>
      <Input
        id="report-email"
        label={t.emailLabel}
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t.emailPlaceholder}
        className="h-11"
      />
      <Checkbox
        checked={consent}
        onChange={(next) => setConsent(next)}
        data-report-consent
        label={
          <>
            {t.consent}{' '}
            <a href={privacyHref} className="text-action underline underline-offset-4" target="_blank" rel="noopener">
              {t.privacy}
            </a>
          </>
        }
      />
      {error && (
        <div role="alert">
          <NoticeBox tone="bad" language={locale}>{error}</NoticeBox>
        </div>
      )}
      <Button type="submit" size="lg" loading={busy} className="w-full">
        {busy ? t.sending : t.submit}
      </Button>
    </form>
  )
}
