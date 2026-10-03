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
import type { GbpReadyStatus, GbpStatus } from './types'

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

/** The status as the screen shows it: a grant step 2 found gone reads as "reconnect" in every step. */
export function withAuthLost(status: GbpReadyStatus, authLost: boolean): GbpReadyStatus {
  if (!authLost || status.connection?.status !== 'connected') return status
  return { ...status, connection: { ...status.connection, status: 'reauth_required' } }
}

function Screen({ projectId }: { projectId: string }) {
  const { uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).mapsPosts
  const [status, setStatus] = useState<GbpStatus | null>(null)
  const [failed, setFailed] = useState(false)
  const [flash, setFlash] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  // Step 2 learned that Google no longer honours the grant (the server marks the
  // connection too). Until the status read says so, step 1 already shows "reconnect":
  // the screen never says "connected" and "permission expired" at once (review P2-7).
  const [authLost, setAuthLost] = useState(false)

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
  const onAuthLost = useCallback(() => { setAuthLost(true); void load() }, [load])

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
  const shown = withAuthLost(status, authLost)

  return (
    <div className="space-y-8">
      {flash && <Notice tone={flash.tone} onDismiss={() => setFlash(null)}>{flash.text}</Notice>}
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        <ConnectCard projectId={projectId} status={shown} onChanged={() => { setAuthLost(false); void load() }} />
        <LocationCard projectId={projectId} status={shown} onChanged={load} onAuthLost={onAuthLost} />
      </div>
      <PostComposer key={shown.location?.locationName ?? 'none'} projectId={projectId} status={shown} onPosted={load} />
      <PostsList projectId={projectId} posts={status.posts} onChanged={load} />
    </div>
  )
}

export default function MapsPostsView() {
  const { uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).mapsPosts
  return (
    <div>
      <Header title={t.title} subtitle={t.subtitle} />
      <WorkspaceGate>
        {(project) => <Screen key={project.id} projectId={project.id} />}
      </WorkspaceGate>
    </div>
  )
}

