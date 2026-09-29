'use client'

/**
 * The Links tab's open-web part for one project: the sites worth getting a link
 * from (the owner's own outreach, with its progress in the section's header),
 * the links between the site's own pages, and Google's rule on paid links.
 *
 * The link network's state leads the screen when the network exists for this
 * project (SiteLinksScreen passes it as `top`, and its how-it-works cards as
 * `beforePolicy`). When it does not (a Shopify store, or no network), this view
 * leads with its own hero: the outreach list's figures (OutreachHero, UX A2-f).
 *
 * Competitors are never on the list (UX A3): they are counted, and one caption
 * under the list says how many were left out and why.
 *
 * One read on opening (GET /api/projects/[id]/site-links), which reads only what
 * the project already stored: opening the tab calls no provider and spends
 * nothing. The outreach marks live in this browser (useOpportunityStatus).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { BookMarked, Landmark, ListOrdered, Newspaper, Send, Telescope, Waypoints, CheckCircle2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import HeroPanel, { HeroStat } from '@/components/ui/HeroPanel'
import SectionHeading from '@/components/ui/SectionHeading'
import { Skeleton } from '@/components/ui/Skeleton'
import { AnimatedNumber, Reveal } from '@/components/ui/motion'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { SiteLinksAnswer } from '@/lib/site-links/http'
import type { UnavailableReason } from '@/lib/link-network/http'
import InternalLinksSection from './InternalLinksSection'
import LinkButton from './LinkButton'
import OpportunityList from './OpportunityList'
import PolicyNote from './PolicyNote'
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

export default function SiteLinksView({ projectId, top, beforePolicy, outreach = null }: {
  projectId: string
  /** The link network's hero, consent and log, when the network exists for this project. */
  top?: ReactNode
  /** How the network works and its rules, above the policy note. */
  beforePolicy?: ReactNode
  /** No network here: why ('shopify' says so in words; 'off' never mentions it). The outreach hero leads. */
  outreach?: UnavailableReason | null
}) {
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

  const all = useMemo(() => (load.kind === 'ok' && load.data.opportunities.state === 'ok' ? load.data.opportunities.data : []), [load])
  // A competitor is never a site to contact: out of the list, counted for the caption (UX A3).
  const items = useMemo(() => all.filter((o) => !o.isCompetitor), [all])
  const competitorsLeftOut = all.length - items.length
  const counts = useMemo(() => {
    let contacted = 0, received = 0
    for (const o of items) {
      const s = statusOf(o.domain)
      if (s === 'contacted') contacted += 1
      else if (s === 'got_link') received += 1
    }
    return { total: items.length, contacted, received }
  }, [items, statusOf])

  const lead = top ?? (outreach !== null && load.kind === 'ok'
    ? <OutreachHero copy={copy} reason={outreach} total={counts.total} contacted={counts.contacted} received={counts.received} figures={items.length > 0} />
    : null)

  if (load.kind === 'loading') {
    return (
      <div className="space-y-8">
        {top}
        <LoadingState label={copy.loading} hero={!top} />
      </div>
    )
  }
  if (load.kind === 'error') {
    return (
      <div className="space-y-8">
        {top}
        <div className="rounded-card border border-line bg-surface shadow-card" data-site-links="error">
          <EmptyState icon={<Waypoints />} title={copy.loadError} action={<Button variant="secondary" onClick={retry}>{copy.retry}</Button>} />
        </div>
        {beforePolicy}
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
      <div className="space-y-8" data-site-links="empty">
        {lead}
        <Reveal>
          <StartCard copy={copy} />
        </Reveal>
        {beforePolicy}
        <Reveal index={1}>
          <PolicyNote copy={copy.policy} newTabLabel={newTab} />
        </Reveal>
      </div>
    )
  }

  const o = copy.opportunities
  return (
    <div className="space-y-10" data-site-links="ready">
      {lead}

      <section aria-label={o.title} data-site-links="opportunities">
        <SectionHeading title={o.title} description={o.description} className={items.length > 0 ? 'mb-3' : undefined} />
        {items.length > 0 && <OutreachMeter copy={o} total={counts.total} contacted={counts.contacted} received={counts.received} />}
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
        {competitorsLeftOut > 0 && data.opportunities.state === 'ok' && (
          <p className="mt-2 max-w-prose text-caption text-muted text-pretty" data-site-links="competitors-left-out">{o.competitorsHidden(competitorsLeftOut)}</p>
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

      {beforePolicy}

      <PolicyNote copy={copy.policy} newTabLabel={newTab} />
    </div>
  )
}

type Copy = ReturnType<typeof getDashboardDictionary>['siteLinks']

/**
 * The hero when the link network is not on this screen (UX A2-f): how many sites
 * are worth a link, and how far the owner's outreach has come. For a Shopify store
 * it says, in words, why the customer network is not here; with no network at all
 * it never mentions it.
 */
function OutreachHero({ copy, reason, total, contacted, received, figures }: {
  copy: Copy
  reason: UnavailableReason
  total: number
  contacted: number
  received: number
  /** Figures only when there is a list: a row of zeros says nothing (design contract §7). */
  figures: boolean
}) {
  const { language } = useDashboardLanguage()
  const h = copy.outreachHero
  const nf = new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US')
  const count = (n: number) => nf.format(n)
  return (
    <HeroPanel data-site-links="outreach-hero" data-reason={reason}>
      <div className="px-5 pb-6 pt-6 sm:px-8 sm:pb-7 sm:pt-7">
        <h2 className="max-w-[32ch] text-title font-bold tracking-tight text-balance tabular-nums">{h.title(total)}</h2>
        {reason === 'shopify' && <p className="mt-3 max-w-prose text-copy text-contrast-ink/80 text-pretty" data-site-links="shopify-note">{h.shopify}</p>}
        {figures && (
          <div className="stagger-in mt-6 grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
            <HeroStat label={h.found} icon={<Telescope />} value={<AnimatedNumber value={total} format={count} />} />
            <HeroStat label={h.contacted} icon={<Send className="rtl:-scale-x-100" />} value={<AnimatedNumber value={contacted} format={count} />} />
            <HeroStat label={h.received} icon={<CheckCircle2 />} value={<AnimatedNumber value={received} format={count} />} />
          </div>
        )}
      </div>
    </HeroPanel>
  )
}

/**
 * The outreach's progress, as one line under the list's header (UX A4): a thin bar
 * (received in the "done" colour, contacted in the action colour) and the words.
 * The figures are the owner's own marks, saved in this browser only.
 */
function OutreachMeter({ copy, total, contacted, received }: {
  copy: Copy['opportunities']
  total: number
  contacted: number
  received: number
}) {
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0)
  const line = copy.progress(contacted + received, total, received)
  return (
    <div className="mb-4 max-w-xl" data-site-links="progress">
      <div
        role="meter"
        aria-label={line}
        aria-valuemin={0}
        aria-valuemax={Math.max(total, 1)}
        aria-valuenow={contacted + received}
        className="flex h-1.5 w-full overflow-hidden rounded-pill bg-sunk ring-1 ring-inset ring-line"
      >
        <span className="h-full bg-ok motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-snappy" style={{ width: `${pct(received)}%` }} />
        <span className="h-full bg-action motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-snappy" style={{ width: `${pct(contacted)}%` }} />
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted">
        <span className="font-medium text-body tabular-nums">{line}</span>
        <span aria-hidden="true">·</span>
        <span>{copy.savedHere}</span>
      </p>
    </div>
  )
}

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

function LoadingState({ label, hero }: { label: string; hero: boolean }) {
  return (
    <div role="status" aria-busy="true" data-site-links="loading" className="space-y-10">
      <span className="sr-only">{label}</span>
      {hero && (
        <HeroPanel>
          <div aria-hidden="true" className="space-y-4 px-5 pb-6 pt-6 sm:px-8 sm:pb-7 sm:pt-7">
            <Skeleton tone="contrast" className="h-8 w-72 max-w-full" />
            <div className="grid grid-cols-1 gap-3 pt-2 min-[420px]:grid-cols-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} tone="contrast" className="h-20 rounded-inset" />)}
            </div>
          </div>
        </HeroPanel>
      )}
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
