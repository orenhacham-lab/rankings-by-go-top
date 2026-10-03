'use client'

/**
 * The Links tab under the link network (wave 9, owner's ask), in this order:
 *
 *   1. `top`: the link network among Go Top SEO customers (SiteLinksScreen passes
 *      its hero, consent and log, or why it cannot run here);
 *   2. free directories and business profiles the owner adds the business to
 *      himself (FreeListings, lib/site-links/free-listings.ts). The old list of
 *      sites to ASK for a link ("best of" articles, associations, newspapers,
 *      paid directories, with contacted / link received marks) is gone: nobody
 *      gives a link just like that;
 *   3. the links between the site's own pages (InternalLinksSection);
 *   4. with Search Console connected, the links Google already found: the API
 *      has no such report, so one honest line and a button to it (SearchConsoleLinks);
 *   5. `beforePolicy` (how the network works), then Google's rule on paid links.
 *
 * One read on opening (GET /api/projects/[id]/site-links), which reads only what
 * the project already stored: opening the tab calls no provider and spends
 * nothing. From its answer this view uses the internal links, and the domains
 * that showed up in the project's searches (to mark a listing that already does).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Waypoints } from 'lucide-react'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import SectionHeading from '@/components/ui/SectionHeading'
import { Skeleton } from '@/components/ui/Skeleton'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { SiteLinksAnswer } from '@/lib/site-links/http'
import { listingsFor, listingsSeen } from '@/lib/site-links/free-listings'
import FreeListings from './FreeListings'
import InternalLinksSection from './InternalLinksSection'
import PolicyNote from './PolicyNote'
import SearchConsoleLinks from './SearchConsoleLinks'

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

export default function SiteLinksView({ projectId, top, beforePolicy, projectCountry = null, projectLanguage = null }: {
  projectId: string
  /** The link network: its hero, consent and log, or why it cannot run here. */
  top?: ReactNode
  /** How the network works and its rules, above the policy note. */
  beforePolicy?: ReactNode
  /** Where the business is: which free listings work there. */
  projectCountry?: string | null
  projectLanguage?: string | null
}) {
  const { language } = useDashboardLanguage()
  const copy = getDashboardDictionary(language).siteLinks
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch(siteLinksUrl(projectId), { cache: 'no-store' })
      .then(async (res) => (res.ok ? readAnswer(await res.json().catch(() => null)) : null))
      .catch(() => null)
      .then((data) => { if (!cancelled) setLoad(data ? { kind: 'ok', data } : { kind: 'error' }) })
    return () => { cancelled = true }
  }, [projectId, attempt])

  const retry = useCallback(() => { setLoad({ kind: 'loading' }); setAttempt((n) => n + 1) }, [])

  const listings = useMemo(() => listingsFor(projectCountry, projectLanguage), [projectCountry, projectLanguage])
  // A listing that already shows up in the project's own searches or AI answers.
  const seen = useMemo(() => {
    const found = load.kind === 'ok' && load.data.opportunities.state === 'ok' ? load.data.opportunities.data.map((o) => o.domain) : []
    return listingsSeen(listings, found)
  }, [load, listings])

  return (
    <div className="space-y-10" data-site-links={load.kind === 'ok' ? 'ready' : load.kind}>
      {top}

      <FreeListings copy={copy} listings={listings} seen={seen} />

      {load.kind === 'loading' && <InternalLoading label={copy.loading} />}
      {load.kind === 'error' && (
        <div className="rounded-card border border-line bg-surface shadow-card" data-site-links="error">
          <EmptyState icon={<Waypoints />} title={copy.loadError} action={<Button variant="secondary" onClick={retry}>{copy.retry}</Button>} />
        </div>
      )}
      {load.kind === 'ok' && load.data.internal.state !== 'disabled' && (
        <section aria-label={copy.internal.title} data-site-links="internal">
          <SectionHeading title={copy.internal.title} description={copy.internal.description} />
          {load.data.internal.state === 'ok' ? (
            <InternalLinksSection copy={copy.internal} view={load.data.internal.data} domain={load.data.project.domain} newTabLabel={copy.opensNewTab} />
          ) : (
            <div className="rounded-card border border-line bg-surface shadow-card">
              <EmptyState icon={<Waypoints />} title={copy.internal.error} action={<Button variant="secondary" onClick={retry}>{copy.retry}</Button>} />
            </div>
          )}
        </section>
      )}

      <SearchConsoleLinks projectId={projectId} copy={copy} />

      {beforePolicy}

      <PolicyNote copy={copy.policy} newTabLabel={copy.opensNewTab} />
    </div>
  )
}

function InternalLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" data-site-links="loading" className="space-y-4">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="space-y-4">
        <Skeleton className="h-6 w-64" />
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3.5 border-b border-line p-5 last:border-b-0">
              <Skeleton className="size-9 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-3/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
