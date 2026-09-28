'use client'

/**
 * A project's research screen, at /projects/[id]/summary: whichever of the
 * progress, the summary or a stop its latest run calls for.
 *
 * The run comes from the server (first on the server render, then from
 * useSeedRun), so leaving and coming back, refreshing, or opening the address
 * from another screen shows the same state. The address is stable for every
 * run however it began (created here, claimed from the free check, or started
 * at a Shopify install): it names the project, and ?projectId= keeps the
 * workspace switcher on it. Choosing another project in the switcher opens
 * that project's research.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Globe, MessageCircle, Plug, Search, SquarePen } from 'lucide-react'
import Button from '@/components/ui/Button'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { HANDOFF_NOTICE_PARAM, HANDOFF_WAIT_PARAM } from '@/lib/onboarding/handoff'
import { platformSetupHref } from '@/lib/content/content-hub-setup'
import { FAILURES_WITH_WAYS_AROUND, settingsHref, summaryHref, SUPPORT_WHATSAPP_HREF } from '@/lib/onboarding/links'
import { OFFLINE_NOTICE, stageFailureNotice, startNotice, type Notice } from '@/lib/onboarding/notices'
import { failureCode, runPhase } from '@/lib/onboarding/summary-view'
import type { SummarySurface } from '@/lib/onboarding/surfaces'
import { ActionLink, Eyebrow, isolate } from './parts'
import ResearchSummary from './ResearchSummary'
import SeedNotice, { noticeCopy } from './SeedNotice'
import SeedProgress from './SeedProgress'
import { useSeedRun } from './useSeedRun'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function SeedRunScreen({
  projectId,
  domain,
  projectName,
  contentEnabled,
  initialRun,
  serverNow,
  initialNotice,
}: SummarySurface & {
  /** Why the start made on the new-project screen did not begin a run, if it did not. */
  initialNotice: Notice | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).seedOnboarding
  const { run, readError, reconnecting, awaitingStart, refresh, expectNewRun } = useSeedRun(projectId, initialRun)
  const [startRefusal, setStartRefusal] = useState<Notice | null>(initialNotice)
  const [starting, setStarting] = useState(false)

  // ── The address and the workspace switcher ──
  const urlProjectId = searchParams.get('projectId')
  const handoffInUrl = searchParams.has(HANDOFF_NOTICE_PARAM) || searchParams.has(HANDOFF_WAIT_PARAM)
  const lastUrlProjectId = useRef(urlProjectId)
  useEffect(() => {
    const previous = lastUrlProjectId.current
    lastUrlProjectId.current = urlProjectId
    // The switcher named another project while this one was shown: open that one's research.
    if (previous === projectId && urlProjectId && urlProjectId !== projectId && UUID.test(urlProjectId)) {
      router.replace(summaryHref(urlProjectId), { scroll: false })
      return
    }
    // Otherwise the address names this project, and a read notice leaves it.
    if (urlProjectId !== projectId || handoffInUrl) router.replace(summaryHref(projectId), { scroll: false })
  }, [urlProjectId, handoffInUrl, projectId, router])

  async function startScan() {
    if (starting) return
    setStarting(true)
    setStartRefusal(null)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/onboarding/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locale: language }),
      })
      const body = await res.json().catch(() => null)
      if (res.status === 202 && body?.ok === true) {
        expectNewRun()
        return
      }
      const refusal = startNotice(res.status, body)
      // A run already under way is not a refusal to show: it is the run to follow.
      if (refusal.key === 'runInProgress') refresh()
      else setStartRefusal(refusal)
    } catch {
      setStartRefusal(OFFLINE_NOTICE)
    } finally {
      setStarting(false)
    }
  }

  const returnPath = summaryHref(projectId)
  const phase = runPhase(run)

  if (readError) {
    return (
      <Frame screen="error">
        <SeedNotice notice={readError} projectId={projectId} returnPath={returnPath} />
      </Frame>
    )
  }

  if (awaitingStart || phase === 'progress' || phase === 'stalled') {
    // Between an accepted start and its first read the previous run is not this one.
    return <SeedProgress run={awaitingStart ? null : run} domain={domain} projectId={projectId} reconnecting={reconnecting} />
  }

  if ((phase === 'summary' || phase === 'started') && run?.summary) {
    return (
      <ResearchSummary
        key={run.id}
        projectId={projectId}
        domain={domain}
        projectName={projectName}
        run={run}
        summary={run.summary}
        started={phase === 'started'}
        contentEnabled={contentEnabled}
        serverNow={serverNow}
        onContinued={refresh}
      />
    )
  }

  // No run yet, or one that stopped: say which, with one way on.
  const failure: Notice | null =
    phase === 'failed' ? stageFailureNotice(failureCode(run)) : phase === 'none' ? null : { key: 'scanStopped', action: 'retry' }
  const heading = failure ? noticeCopy(failure, language) : { title: t.noRun.title, body: t.noRun.body }

  let action: ReactNode
  if (startRefusal) {
    action = (
      <SeedNotice notice={startRefusal} projectId={projectId} returnPath={returnPath} onRetry={() => void startScan()} onRefresh={refresh} busy={starting} />
    )
  } else if (failure && (FAILURES_WITH_WAYS_AROUND as readonly string[]).includes(failure.key)) {
    // P0-6: the site refuses automated reads, so "try again" alone is a dead end. Three
    // ways on instead: connect its platform (the connections section of settings),
    // continue without a scan (the project exists; its details are filled by hand),
    // or talk to us.
    action = (
      <div className="flex flex-wrap items-center gap-3" data-seed-ways-around>
        <ActionLink href={platformSetupHref(projectId)} size="lg">
          <Plug className="h-4 w-4" aria-hidden />
          {t.actions.connectPlatform}
        </ActionLink>
        <ActionLink href={settingsHref(projectId, 'business')} size="lg" variant="secondary">
          <SquarePen className="h-4 w-4" aria-hidden />
          {t.actions.continueWithoutScan}
        </ActionLink>
        <a
          href={SUPPORT_WHATSAPP_HREF}
          target="_blank"
          rel="noopener noreferrer"
          data-way="support"
          className="inline-flex h-12 items-center gap-2 rounded-control px-4 text-base font-semibold text-action transition-colors hover:bg-action-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          {t.actions.talkToUs}
        </a>
      </div>
    )
  } else if (failure?.action === 'settings') {
    action = <ActionLink href={settingsHref(projectId)} size="lg">{t.actions.settings}</ActionLink>
  } else {
    action = (
      <Button size="lg" onClick={() => void startScan()} loading={starting} className="h-12 px-7 text-base" data-seed-scan>
        {!starting && <Search className="h-4 w-4" aria-hidden />}
        {failure ? t.actions.retry : t.noRun.action}
      </Button>
    )
  }

  return (
    <Frame screen={failure ? 'failed' : 'none'}>
      <Eyebrow className="text-action">{t.progress.eyebrow}</Eyebrow>
      <h1 className="mt-3 text-balance text-3xl font-bold leading-tight tracking-tight text-ink md:text-[2.5rem] md:leading-[1.1]">{heading.title}</h1>
      <p className="mt-4 max-w-[55ch] text-base leading-7 text-body">{heading.body}</p>
      <p className="mt-6 inline-flex max-w-full items-center gap-2 rounded-pill border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink">
        <Globe className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <span className="truncate">{isolate(domain)}</span>
      </p>
      <div className="mt-8">{action}</div>
    </Frame>
  )
}

function Frame({ screen, children }: { screen: string; children: ReactNode }) {
  return (
    // Start-aligned with the screen's header, at most 640px wide (P2-4).
    <section className="w-full max-w-[640px] pt-2 md:pt-10" data-seed-screen={screen}>
      {children}
    </section>
  )
}
