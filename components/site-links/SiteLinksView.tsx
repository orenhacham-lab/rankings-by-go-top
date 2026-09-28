'use client'

/**
 * The Links tab for one project: the progress of the owner's outreach, the
 * sites worth getting a link from, the links between the site's own pages, and
 * why the app does not trade links between customers.
 *
 * One read on opening (GET /api/projects/[id]/site-links), which reads only what
 * the project already stored: opening the tab calls no provider and spends
 * nothing. The outreach marks live in this browser (useOpportunityStatus).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookMarked, Landmark, ListOrdered, Newspaper, Telescope, Waypoints } from 'lucide-react'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import SectionHeading from '@/components/ui/SectionHeading'
import { Skeleton } from '@/components/ui/Skeleton'
import { Reveal } from '@/components/ui/motion'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { SiteLinksAnswer } from '@/lib/site-links/http'
import InternalLinksSection from './InternalLinksSection'
import LinkButton from './LinkButton'
import OpportunityList from './OpportunityList'
import PolicyNote from './PolicyNote'
import ProgressCard from './ProgressCard'
import { useOpportunityStatus } from './useOpportunityStatus'

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; data: SiteLinksAnswer }

export function siteLinksUrl(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/site-links`
}

function readAnswer(body: unknown): SiteLinksAnswer | null {
  if (!body || typeof body !== 'object' || (body as { ok?: unknown }).ok !== true) return null
  const b = body as SiteLinksAnswer
  if (!b.opportunities || !b.internal || !b.project) return null
  return b
}

export default function SiteLinksView({ projectId }: { projectId: string }) {
  const { language } = useDashboardLanguage()
  const copy = getDashboardDictionary(language).siteLinks
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const { statusOf, setStatus } = useOpportunityStatus(projectId)

  useEffect(() => {
    let cancelled = false
    fetch(siteLinksUrl(projectId), { cache: 'no-store' })
      .then(async (res) => (res.ok ? readAnswer(await res.json().catch(() => null)) : null))
      .catch(() => null)
      .then((data) => { if (!cancelled) setLoad(data ? { kind: 'ok', data } : { kind: 'error' }) })
    return () => { cancelled = true }
  }, [projectId, attempt])

  const retry = useCallback(() => { setLoad({ kind: 'loading' }); setAttempt((n) => n + 1) }, [])

  const items = useMemo(() => (load.kind === 'ok' && load.data.opportunities.state === 'ok' ? load.data.opportunities.data : []), [load])
  const counts = useMemo(() => {
    let contacted = 0, received = 0
    for (const o of items) {
      if (o.isCompetitor) continue
      const s = statusOf(o.domain)
      if (s === 'contacted') contacted += 1
      else if (s === 'got_link') received += 1
    }
    return { total: items.filter((o) => !o.isCompetitor).length, contacted, received }
  }, [items, statusOf])

  if (load.kind === 'loading') return <LoadingState label={copy.loading} />
  if (load.kind === 'error') {
    return (
      <div className="rounded-card border border-line bg-surface shadow-card" data-site-links="error">
        <EmptyState icon={<Waypoints />} title={copy.loadError} action={<Button variant="secondary" onClick={retry}>{copy.retry}</Button>} />
      </div>
    )
  }

  const { data } = load
  const internal = data.internal
  const hasInternal = internal.state === 'ok' && (internal.data.totals.articles > 0 || internal.data.totals.indexedPages > 0)
  const noKeywords = data.keywordsCount === 0 && data.sources.searches === 0 && data.sources.citations === 0
  const newTab = copy.opportunities.opensNewTab
  const aiOn = process.env.NEXT_PUBLIC_ENABLE_AI_VISIBILITY === 'true'

  // Nothing to show at all yet: one designed starting point, not three empty boxes.
  if (data.opportunities.state === 'ok' && items.length === 0 && noKeywords && !hasInternal) {
    return (
      <div className="space-y-6" data-site-links="empty">
        <Reveal>
          <StartCard copy={copy} />
        </Reveal>
        <Reveal index={1}>
          <PolicyNote copy={copy.policy} newTabLabel={newTab} />
        </Reveal>
      </div>
    )
  }

  const o = copy.opportunities
  return (
    <div className="space-y-10" data-site-links="ready">
      {items.length > 0 && (
        <Reveal>
          <ProgressCard copy={copy.progress} total={counts.total} contacted={counts.contacted} received={counts.received} />
        </Reveal>
      )}

      <section aria-label={o.title} data-site-links="opportunities">
        <SectionHeading title={o.title} description={o.description} />
        {data.opportunities.state === 'error' ? (
          <div className="rounded-card border border-line bg-surface shadow-card">
            <EmptyState icon={<Waypoints />} title={o.error} action={<Button variant="secondary" onClick={retry}>{copy.retry}</Button>} />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-card border border-line bg-surface shadow-card" data-site-links-empty={noKeywords ? 'no-keywords' : 'nothing-found'}>
            {noKeywords ? (
              <EmptyState icon={<Telescope />} title={o.emptyNoKeywords.title} body={o.emptyNoKeywords.body}
                action={<LinkButton href="/keyword-research">{o.emptyNoKeywords.cta}</LinkButton>} />
            ) : (
              <EmptyState icon={<Waypoints />} title={o.emptyNothingFound.title} body={o.emptyNothingFound.body}
                action={aiOn
                  ? <LinkButton href="/ai-visibility">{o.emptyNothingFound.cta}</LinkButton>
                  : <LinkButton href="/keyword-research">{o.emptyNothingFound.ctaResearch}</LinkButton>} />
            )}
          </div>
        ) : (
          <>
            <OpportunityList copy={o} items={items} statusOf={statusOf} setStatus={setStatus} />
            <p className="mt-3 text-caption text-muted">{o.sources(data.sources.searches, data.sources.citations)}</p>
          </>
        )}
      </section>

      {internal.state !== 'disabled' && (
        <section aria-label={copy.internal.title} data-site-links="internal">
          <SectionHeading title={copy.internal.title} description={copy.internal.description} />
          {internal.state === 'ok' ? (
            <InternalLinksSection copy={copy.internal} view={internal.data} domain={data.project.domain} newTabLabel={newTab} />
          ) : (
            <div className="rounded-card border border-line bg-surface shadow-card">
              <EmptyState icon={<Waypoints />} title={copy.internal.error} action={<Button variant="secondary" onClick={retry}>{copy.retry}</Button>} />
            </div>
          )}
        </section>
      )}

      <PolicyNote copy={copy.policy} newTabLabel={newTab} />
    </div>
  )
}

type Copy = ReturnType<typeof getDashboardDictionary>['siteLinks']

/** The first visit, before there are keywords: what this tab will find, and the one step that starts it. */
function StartCard({ copy }: { copy: Copy }) {
  const o = copy.opportunities
  const kinds = [
    { key: 'directory', icon: BookMarked, label: o.categories.directory },
    { key: 'listicle', icon: ListOrdered, label: o.categories.listicle },
    { key: 'association', icon: Landmark, label: o.categories.association },
    { key: 'media', icon: Newspaper, label: o.categories.media },
  ] as const
  return (
    <section data-site-links-empty="no-keywords" className="relative overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div aria-hidden="true" className="pointer-events-none absolute -top-32 start-1/2 size-80 -translate-x-1/2 rounded-full bg-action-soft blur-3xl rtl:translate-x-1/2" />
      <div className="relative">
        <EmptyState
          className="pt-14 pb-8"
          icon={<Telescope />}
          title={o.emptyNoKeywords.title}
          body={o.emptyNoKeywords.body}
          action={<LinkButton href="/keyword-research">{o.emptyNoKeywords.cta}</LinkButton>}
        />
        <ul className="mx-auto grid max-w-2xl grid-cols-2 gap-2.5 px-6 pb-10 sm:grid-cols-4">
          {kinds.map((k) => (
            <li key={k.key} className="flex flex-col items-center gap-2 rounded-inset bg-sunk/70 px-3 py-4 text-center">
              <k.icon size={18} strokeWidth={1.75} aria-hidden="true" className="text-action" />
              <span className="text-caption font-medium text-body">{k.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function LoadingState({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" data-site-links="loading" className="space-y-10">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="grid gap-8 rounded-card border border-line bg-surface p-6 shadow-card lg:grid-cols-[1.15fr_1fr] lg:p-8">
        <div className="space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="mt-6 h-2.5 w-full rounded-pill" />
        </div>
        <Skeleton className="h-24 rounded-inset" />
      </div>
      <div aria-hidden="true" className="space-y-4">
        <Skeleton className="h-6 w-64" />
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3.5 border-b border-line p-5 last:border-b-0">
              <Skeleton className="size-9 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-3/5" />
              </div>
              <Skeleton className="hidden h-9 w-64 rounded-pill sm:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
