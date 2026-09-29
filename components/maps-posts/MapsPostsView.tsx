'use client'

import { useCallback, useEffect, useState } from 'react'
import { MapPinOff, Store } from 'lucide-react'
import Header from '@/components/layout/Header'
import WorkspaceGate from '@/components/layout/WorkspaceGate'
import EmptyState from '@/components/ui/EmptyState'
import Notice from '@/components/ui/Notice'
import { ScreenSkeleton } from '@/components/ui/Skeleton'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { ConnectCard, LocationCard } from './ConnectCards'
import PostComposer from './PostComposer'
import PostsList from './PostsList'
import type { GbpStatus } from './types'

/** The result the OAuth callback appends (?gbp=…) → our sentence. Fixed set; anything else is "failed". */
/** The screen's state from the server, or null when it could not be read. */
async function fetchGbpStatus(projectId: string): Promise<GbpStatus | null> {
  const res = await fetch(`/api/gbp/status?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' }).catch(() => null)
  const body = res ? await res.json().catch(() => null) : null
  return res && res.ok && body?.ok ? (body as GbpStatus) : null
}

function callbackNotice(t: ReturnType<typeof getDashboardDictionary>['mapsPosts'], code: string): { tone: 'ok' | 'bad'; text: string } {
  if (code === 'connected') return { tone: 'ok', text: t.callback.connected }
  if (code === 'access_denied' || code === 'scope_missing' || code === 'google_unavailable') return { tone: 'bad', text: t.callback[code] }
  return { tone: 'bad', text: t.callback.failed }
}

function Screen({ projectId }: { projectId: string }) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).mapsPosts
  const [status, setStatus] = useState<GbpStatus | null>(null)
  const [failed, setFailed] = useState(false)
  const [flash, setFlash] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

  const apply = useCallback((body: GbpStatus | null) => {
    if (!body) { setFailed(true); return }
    setFailed(false)
    setStatus(body)
    // The OAuth callback's result (?gbp=…), shown once and then removed from the address.
    const url = new URL(window.location.href)
    const code = url.searchParams.get('gbp')
    if (code) {
      setFlash(callbackNotice(t, code))
      url.searchParams.delete('gbp')
      window.history.replaceState(null, '', url.toString())
    }
  }, [t])

  const load = useCallback(() => fetchGbpStatus(projectId).then(apply), [projectId, apply])

  useEffect(() => {
    let live = true
    fetchGbpStatus(projectId).then((body) => { if (live) apply(body) })
    return () => { live = false }
  }, [projectId, apply])

  if (failed) {
    return <Notice tone="bad" action={{ label: t.retry, onClick: () => void load() }}>{t.loadFailed}</Notice>
  }
  if (!status) return <ScreenSkeleton label={t.loading} />
  if (status.state === 'shopify') return <EmptyState icon={<Store className="size-5" />} title={t.shopifyTitle} body={t.shopifyBody} />
  if (status.state === 'unavailable') return <EmptyState icon={<MapPinOff className="size-5" />} title={t.unavailableTitle} body={t.unavailableBody} />

  return (
    <div className="space-y-8">
      {flash && <Notice tone={flash.tone} onDismiss={() => setFlash(null)}>{flash.text}</Notice>}
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        <ConnectCard projectId={projectId} status={status} onChanged={load} />
        <LocationCard projectId={projectId} status={status} onChanged={load} />
      </div>
      <PostComposer key={status.location?.locationName ?? 'none'} projectId={projectId} status={status} onPosted={load} />
      <PostsList projectId={projectId} posts={status.posts} onChanged={load} />
    </div>
  )
}

export default function MapsPostsView() {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).mapsPosts
  return (
    <div>
      <Header title={t.title} subtitle={t.subtitle} />
      <WorkspaceGate>
        {(project) => <Screen key={project.id} projectId={project.id} />}
      </WorkspaceGate>
    </div>
  )
}

