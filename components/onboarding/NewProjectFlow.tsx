'use client'

/**
 * A new project, from one field: the site's address.
 *
 * Submitting creates the project through the existing create route (the plan's
 * project limit and entitlement checks apply unchanged), then starts its first
 * research through the start route, which seeds it from the merchant's free
 * check when this is the site they checked. Either way the merchant lands on
 * the project's research screen, where the progress is read from the server.
 *
 * Every answer is one notice with at most one action; the create route's own
 * message text is never shown. Once the project exists it is not created
 * again: a failed start is shown on the project's own screen.
 *
 * FROM THE CLAIM, BY ITSELF. Sign-up with a free-check claim ends here with
 * ?start=claim (lib/onboarding/claim-start.ts). Then, when the kept claim is
 * usable, the screen submits the checked site on its own as soon as it mounts
 * and shows only "setting up your project" until the project's research screen
 * opens: the merchant never sees the form. If they already own a project for
 * that site, that one is seeded instead of creating a second. Any refusal
 * before the project exists (a plan limit, no client, offline) shows the usual
 * screen with its notice, the address already filled in.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowRight, Clock, Loader2, Sparkles, Unplug } from 'lucide-react'
import Button from '@/components/ui/Button'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { isClaimStart } from '@/lib/onboarding/claim-start'
import { summaryAfterStartHref } from '@/lib/onboarding/handoff'
import { NEW_PROJECT_HREF } from '@/lib/onboarding/links'
import { createNotice, OFFLINE_NOTICE, startNotice, type Notice } from '@/lib/onboarding/notices'
import { readSiteInput } from '@/lib/onboarding/site-input'
import type { ClientChoice } from '@/lib/onboarding/surfaces'
import { STAGE_A_STEPS } from '@/lib/onboarding/summary-view'
import { cn } from '@/lib/utils'
import { Eyebrow } from './parts'
import SeedNotice from './SeedNotice'

type Phase = 'idle' | 'creating' | 'starting'

/** The client a new project belongs to: the one the URL names if it is theirs, else their default, else their first. */
export function chooseClient(clients: ClientChoice[] | null, requested: string | null): string | null {
  if (!clients || clients.length === 0) return null
  if (requested && clients.some((c) => c.id === requested)) return requested
  return (clients.find((c) => c.isDefault) ?? clients[0]).id
}

export default function NewProjectFlow({
  clients,
  claimedDomain,
  claimedProjectId = null,
}: {
  clients: ClientChoice[] | null
  claimedDomain: string | null
  claimedProjectId?: string | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).seedOnboarding
  const Arrow = language === 'he' ? ArrowLeft : ArrowRight

  const [value, setValue] = useState(claimedDomain ?? '')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [createdId, setCreatedId] = useState<string | null>(null)
  const busy = useRef(false)
  /** Sign-up with a usable claim: submit the checked site without being asked. */
  const autoStart = isClaimStart(searchParams) && !!claimedDomain
  const autoFired = useRef(false)
  /**
   * The project this screen already created, so a retry never creates a second
   * one; when starting from the claim, the merchant's own project for that site.
   */
  const created = useRef<{ id: string; domain: string } | null>(
    autoStart && claimedProjectId && claimedDomain ? { id: claimedProjectId, domain: claimedDomain } : null,
  )

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (busy.current) return
    const site = readSiteInput(value)
    if (!site.ok) {
      setFieldError(site.reason === 'empty' ? t.newProject.errorEmpty : t.newProject.errorInvalid)
      return
    }
    setFieldError(null)
    setNotice(null)

    let projectId = created.current?.domain === site.domain ? created.current.id : null
    if (!projectId) {
      const clientId = chooseClient(clients, searchParams.get('client_id'))
      if (!clientId) {
        setNotice(clients === null ? { key: 'failed', action: 'retry' } : { key: 'noClient', action: 'clients' })
        return
      }
      busy.current = true
      setPhase('creating')
      try {
        const form = new FormData()
        form.set('name', site.name)
        form.set('target_domain', site.domain)
        form.set('client_id', clientId)
        const res = await fetch('/api/projects/create', { method: 'POST', body: form })
        const body = (await res.json().catch(() => null)) as { data?: { id?: unknown } } | null
        const id = res.status === 201 && typeof body?.data?.id === 'string' ? body.data.id : null
        if (!id) {
          setNotice(createNotice(res.status, body))
          return
        }
        projectId = id
        created.current = { id, domain: site.domain }
        setCreatedId(id)
      } catch {
        setNotice(OFFLINE_NOTICE)
        return
      } finally {
        if (!projectId) {
          busy.current = false
          setPhase('idle')
        }
      }
    }

    busy.current = true
    setPhase('starting')
    let refusal: Notice | null = null
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/onboarding/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locale: language }),
      })
      const body = await res.json().catch(() => null)
      if (!(res.status === 202 && body?.ok === true)) refusal = startNotice(res.status, body)
    } catch {
      refusal = OFFLINE_NOTICE
    }
    // Started or refused, the project exists, and its own screen shows which.
    router.push(summaryAfterStartHref(projectId, refusal))
  }

  useEffect(() => {
    if (!autoStart || autoFired.current) return
    autoFired.current = true
    void submit()
    // Once, on mount: submit reads the address the claim filled in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart])

  const working = phase !== 'idle'
  const buttonLabel = phase === 'creating' ? t.newProject.creating : phase === 'starting' ? t.newProject.starting : t.newProject.submit

  // Starting from the claim: nothing to fill in, so no form, until an answer
  // needs the merchant (a notice), and then the usual screen with that notice.
  if (autoStart && claimedDomain && !notice) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl items-center" data-claim-start>
        <section role="status" aria-live="polite" aria-busy="true" className="w-full rounded-card border border-line bg-surface p-8 shadow-card md:p-10">
          <Eyebrow className="text-action">{t.newProject.eyebrow}</Eyebrow>
          <h1 className="mt-3 flex items-center gap-3 text-balance text-title font-bold tracking-tight text-ink">
            <Loader2 className="h-6 w-6 shrink-0 animate-spin text-action" aria-hidden />
            <span className="min-w-0">{t.newProject.fromScanTitle(claimedDomain)}</span>
          </h1>
          <p className="mt-4 max-w-[52ch] text-copy text-body">{t.newProject.fromScanBody}</p>
          <p className="mt-6 inline-flex max-w-full items-center gap-2 rounded-pill border border-action/20 bg-action-soft px-3 py-1.5 text-copy font-medium text-action">
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{t.newProject.fromFreeCheck(claimedDomain)}</span>
          </p>
          <p className="mt-6 text-copy text-muted">{phase === 'starting' ? t.newProject.starting : t.newProject.creating}</p>
        </section>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="grid gap-10 pt-2 md:pt-6 lg:grid-cols-12 lg:gap-14">
        <section className="min-w-0 lg:col-span-7">
          <Eyebrow className="text-action">{t.newProject.eyebrow}</Eyebrow>
          <h1 className="mt-3 text-balance text-title font-bold tracking-tight text-ink md:text-display">
            {t.newProject.title}
          </h1>
          <p className="mt-4 max-w-[52ch] text-copy text-body">{t.newProject.subtitle}</p>

          {claimedDomain && (
            <p className="mt-6 inline-flex max-w-full items-center gap-2 rounded-pill border border-action/20 bg-action-soft px-3 py-1.5 text-copy font-medium text-action">
              <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{t.newProject.fromFreeCheck(claimedDomain)}</span>
            </p>
          )}

          <form onSubmit={submit} noValidate className="mt-8" aria-busy={working}>
            <label htmlFor="seed-site-address" className="text-copy font-medium text-ink">
              {t.newProject.urlLabel}
            </label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <div className="relative min-w-0 flex-1" dir="ltr">
                <span aria-hidden className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-copy text-muted">
                  https://
                </span>
                <input
                  id="seed-site-address"
                  name="site"
                  type="text"
                  inputMode="url"
                  autoComplete="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  dir="ltr"
                  value={value}
                  disabled={working}
                  placeholder={t.newProject.urlPlaceholder}
                  aria-invalid={fieldError ? true : undefined}
                  aria-describedby={fieldError ? 'seed-site-address-error' : 'seed-site-address-facts'}
                  onChange={(e) => {
                    // A pasted address keeps its host and path; the scheme is already shown.
                    setValue(e.target.value.replace(/^\s*https?:\/\//i, ''))
                    if (fieldError) setFieldError(null)
                  }}
                  className={cn(
                    'h-14 w-full rounded-control border bg-surface pl-[5.25rem] pr-4 text-left text-section text-ink shadow-card transition-[border-color,box-shadow] placeholder:text-muted/70',
                    'focus:border-transparent focus:outline-none focus:ring-2 focus:ring-action disabled:opacity-60',
                    fieldError ? 'border-bad focus:ring-bad' : 'border-line-strong',
                  )}
                />
              </div>
              <Button type="submit" size="lg" loading={working} className="h-14 px-7 sm:min-w-[11rem]">
                {buttonLabel}
                {!working && <Arrow className="h-4 w-4" aria-hidden />}
              </Button>
            </div>
            {fieldError && (
              <p id="seed-site-address-error" role="alert" className="mt-2 text-copy text-bad">
                {fieldError}
              </p>
            )}
            <ul id="seed-site-address-facts" className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-copy text-muted">
              <li className="inline-flex items-center gap-2">
                <Clock className="h-4 w-4" aria-hidden />
                {t.newProject.promise}
              </li>
              <li className="inline-flex items-center gap-2">
                <Unplug className="h-4 w-4" aria-hidden />
                {t.newProject.noConnection}
              </li>
            </ul>
          </form>

          {notice && (
            <SeedNotice
              notice={notice}
              projectId={createdId}
              returnPath={NEW_PROJECT_HREF}
              onRetry={() => void submit()}
              busy={working}
              className="mt-8"
            />
          )}
        </section>

        <aside className="min-w-0 lg:col-span-5">
          <div className="rounded-card border border-line bg-sunk p-6 md:p-7">
            <Eyebrow className="text-muted">{t.newProject.planTitle}</Eyebrow>
            <ol className="mt-5 space-y-4">
              {STAGE_A_STEPS.map((step, i) => (
                <li key={step} className="flex items-start gap-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-pill border border-line-strong bg-surface text-caption tabular-nums text-ink">
                    {i + 1}
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-copy font-semibold text-ink">{t.progress.steps[step].title}</p>
                    <p className="mt-0.5 text-copy text-muted">{t.progress.steps[step].lines[0]}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-6 border-t border-line pt-5">
              <p className="text-copy font-semibold text-ink">{t.newProject.afterTitle}</p>
              <p className="mt-1 text-copy text-muted">{t.newProject.afterBody}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
