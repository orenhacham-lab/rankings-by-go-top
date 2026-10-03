'use client'

/**
 * The Links screen for one project, as one page, in this order (wave 9, owner's ask):
 *
 *   1. the link network among Go Top SEO customers, ALWAYS first: a hero that says in
 *      words whether it is on for this site, with the switch, what the site gave and
 *      received, what waits, and the network's promises (NetworkPanel); the consent
 *      panel right under it when it is opened. When the network cannot run here (a
 *      Shopify store or a Shopify-billed account, or the read failed) the same place
 *      says so and why (NetworkUnavailable): it never disappears;
 *   2. only while the site is in the network: the placement log (PlacementLog),
 *      where a link given can be taken out before it is published;
 *   3. free directories and business profiles the owner opens himself, the links
 *      between the site's pages, and the links Google already found (SiteLinksView);
 *   4. how the network works and its rules (NetworkHow);
 *   5. Google's rule on paid links (PolicyNote).
 *
 * The network's rules and routes are unchanged (lib/link-network).
 */
import { useCallback, useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/Skeleton'
import HeroPanel from '@/components/ui/HeroPanel'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { UnavailableReason } from '@/lib/link-network/http'
import SiteLinksView from '../SiteLinksView'
import NetworkHow from './NetworkHow'
import NetworkPanel from './NetworkPanel'
import NetworkUnavailable from './NetworkUnavailable'
import PlacementLog from './PlacementLog'
import { networkUrl, type AvailableNetwork } from './shared'

type Load = { kind: 'loading' } | { kind: 'hidden'; reason: UnavailableReason } | { kind: 'ok'; data: AvailableNetwork }

/** The answer, or why there is no network here ('off' for anything unreadable). */
export function readNetwork(body: unknown): { data: AvailableNetwork } | { reason: UnavailableReason } {
  if (!body || typeof body !== 'object') return { reason: 'off' }
  const b = body as Partial<AvailableNetwork> & { reason?: unknown }
  if (b.ok === true && (b as { available?: unknown }).available === false) return { reason: b.reason === 'shopify' ? 'shopify' : 'off' }
  if (b.ok !== true || b.available !== true || !Array.isArray(b.received) || !Array.isArray(b.given) || !b.membership || !b.caps || !b.totals) return { reason: 'off' }
  return { data: b as AvailableNetwork }
}

export default function SiteLinksScreen({ projectId, projectCountry = null, projectLanguage = null }: {
  projectId: string
  /** Which free listings work where the business is (lib/site-links/free-listings.ts). */
  projectCountry?: string | null
  projectLanguage?: string | null
}) {
  const { uiLocale } = useDashboardLanguage()
  const copy = getDashboardDictionary(uiLocale).siteLinks
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch(networkUrl(projectId), { cache: 'no-store' })
      .then(async (res) => (res.ok ? readNetwork(await res.json().catch(() => null)) : readNetwork(null)))
      .catch(() => readNetwork(null))
      .then((r) => { if (!cancelled) setLoad('data' in r ? { kind: 'ok', data: r.data } : { kind: 'hidden', reason: r.reason }) })
    return () => { cancelled = true }
  }, [projectId, attempt])

  const refresh = useCallback(() => setAttempt((n) => n + 1), [])

  if (load.kind === 'loading') {
    return (
      <div role="status" aria-busy="true" data-link-network="loading" className="space-y-6">
        <span className="sr-only">{copy.network.loading}</span>
        <HeroPanel>
          <div aria-hidden="true" className="space-y-4 px-5 pb-6 pt-6 sm:px-8 sm:pb-7 sm:pt-7">
            <Skeleton tone="contrast" className="h-6 w-24 rounded-pill" />
            <Skeleton tone="contrast" className="h-8 w-80 max-w-full" />
            <Skeleton tone="contrast" className="h-4 w-full max-w-lg" />
            <div className="grid grid-cols-1 gap-3 pt-2 min-[420px]:grid-cols-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} tone="contrast" className="h-20 rounded-inset" />)}
            </div>
          </div>
        </HeroPanel>
      </div>
    )
  }
  const where = { projectCountry, projectLanguage }
  if (load.kind === 'hidden') {
    return (
      <div data-link-network="screen" data-member="no">
        <SiteLinksView
          projectId={projectId}
          {...where}
          top={<NetworkUnavailable reason={load.reason} onRetry={() => { setLoad({ kind: 'loading' }); refresh() }} />}
          beforePolicy={load.reason === 'off' ? <NetworkHow member={false} /> : undefined}
        />
      </div>
    )
  }

  const member = load.data.membership.active
  return (
    <div data-link-network="screen" data-member={member ? 'yes' : 'no'}>
      <SiteLinksView
        projectId={projectId}
        top={(
          <div className="space-y-10">
            <NetworkPanel projectId={projectId} data={load.data} onChanged={refresh} />
            {member && <PlacementLog projectId={projectId} data={load.data} onChanged={refresh} />}
          </div>
        )}
        beforePolicy={<NetworkHow member={member} />}
        {...where}
      />
    </div>
  )
}
