'use client'

/**
 * The Links screen for one project, as one page (wave 8, UX A1), in this order:
 *
 *   1. the link network's state, always first: a hero that says in words whether
 *      the network is on for this site, with the switch and its state word
 *      (NetworkPanel), and the consent panel right under it when it is opened;
 *   2. only while the site is in the network: the placement log (PlacementLog),
 *      where a link given can be taken out before it is published;
 *   3. the sites worth a link from (the owner's own outreach, not the network),
 *      with its progress in the header, and the links between the site's pages
 *      (SiteLinksView);
 *   4. how the network works and its rules (NetworkHow): open while the site is
 *      out, folded into one line once it is in;
 *   5. Google's rule on paid links (PolicyNote).
 *
 * Where the network does not exist (a Shopify store, the tables missing, or the
 * read failed) there is no switch: SiteLinksView leads with the outreach hero,
 * which says why for a Shopify store and never mentions the network otherwise.
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

export default function SiteLinksScreen({ projectId }: { projectId: string }) {
  const { language } = useDashboardLanguage()
  const copy = getDashboardDictionary(language).siteLinks
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
  if (load.kind === 'hidden') return <SiteLinksView projectId={projectId} outreach={load.reason} />

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
      />
    </div>
  )
}
