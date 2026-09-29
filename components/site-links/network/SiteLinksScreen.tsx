'use client'

/**
 * The Links screen for one project: link opportunities from the open web and the
 * links between the site's own pages (SiteLinksView, free for everyone) first, the
 * link network ("רשת הקישורים", opt-in) second. A project that already joined the
 * network opens on it; every other project opens on the opportunities.
 *
 * The network exists only where the server says so: without its tables (the
 * migration is not applied yet), for a Shopify project, or when the read fails,
 * the screen is exactly the opportunities view, with no network and no switch.
 */
import { useCallback, useEffect, useState } from 'react'
import { Network, Telescope } from 'lucide-react'
import Segmented from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import SiteLinksView from '../SiteLinksView'
import NetworkPanel from './NetworkPanel'
import { networkUrl, type AvailableNetwork } from './shared'

type Load = { kind: 'loading' } | { kind: 'hidden' } | { kind: 'ok'; data: AvailableNetwork }
type View = 'network' | 'opportunities'

function readNetwork(body: unknown): AvailableNetwork | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Partial<AvailableNetwork>
  if (b.ok !== true || b.available !== true || !Array.isArray(b.received) || !Array.isArray(b.given) || !b.membership || !b.caps) return null
  return b as AvailableNetwork
}

export default function SiteLinksScreen({ projectId }: { projectId: string }) {
  const { language } = useDashboardLanguage()
  const copy = getDashboardDictionary(language).siteLinks
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  // Unset until the person picks a tab: the default follows membership (see the header).
  const [picked, setPicked] = useState<View | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch(networkUrl(projectId), { cache: 'no-store' })
      .then(async (res) => (res.ok ? readNetwork(await res.json().catch(() => null)) : null))
      .catch(() => null)
      .then((data) => { if (!cancelled) setLoad(data ? { kind: 'ok', data } : { kind: 'hidden' }) })
    return () => { cancelled = true }
  }, [projectId, attempt])

  const refresh = useCallback(() => setAttempt((n) => n + 1), [])

  if (load.kind === 'loading') {
    return (
      <div role="status" aria-busy="true" data-link-network="loading" className="space-y-6">
        <span className="sr-only">{copy.network.loading}</span>
        <Skeleton className="h-10 w-72 rounded-pill" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    )
  }
  if (load.kind === 'hidden') return <SiteLinksView projectId={projectId} />

  const t = copy.network.tabs
  const view: View = picked ?? (load.data.membership.active ? 'network' : 'opportunities')
  return (
    <div className="space-y-8" data-link-network="screen">
      <Segmented<View>
        ariaLabel={t.label}
        value={view}
        onChange={setPicked}
        options={[
          { value: 'opportunities', label: t.opportunities, icon: Telescope },
          { value: 'network', label: t.network, icon: Network },
        ]}
      />
      <div key={view} className="tab-enter">
        {view === 'network'
          ? <NetworkPanel projectId={projectId} data={load.data} onChanged={refresh} />
          : <SiteLinksView projectId={projectId} />}
      </div>
    </div>
  )
}
