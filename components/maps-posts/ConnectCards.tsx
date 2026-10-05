'use client'

import { useEffect, useState } from 'react'
import { Check, ExternalLink, MapPin, Store, Unplug } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Notice from '@/components/ui/Notice'
import EmptyState from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { gbpErrorText } from './error-text'
import type { GbpReadyStatus } from './types'

function StepHead({ icon: Icon, overline, title, aside }: { icon: typeof MapPin; overline: string; title: string; aside?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-inset bg-action-soft text-action">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-overline font-semibold uppercase tracking-wide text-muted">{overline}</p>
        <h2 className="text-section font-semibold text-ink">{title}</h2>
      </div>
      {aside}
    </div>
  )
}

/** Step 1: connect the Google account that manages the business profile (business.manage only). */
export function ConnectCard({ projectId, status, onChanged }: { projectId: string; status: GbpReadyStatus; onChanged: () => void }) {
  const { uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).mapsPosts
  const { confirm, dialog } = useConfirm()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const conn = status.connection

  const start = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/gbp/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }) })
      const body = await res.json().catch(() => ({}))
      if (res.ok && typeof body.authUrl === 'string' && body.authUrl.startsWith('https://accounts.google.com/')) {
        window.location.assign(body.authUrl)
        return
      }
      setError(gbpErrorText(t, body.error))
    } catch {
      setError(t.errors.unexpected)
    }
    setBusy(false)
  }

  const disconnect = async () => {
    const ok = await confirm({ title: t.connect.confirmTitle, body: t.connect.confirmBody, confirmLabel: t.connect.confirmAction, cancelLabel: t.connect.cancel, tone: 'danger' })
    if (!ok) return
    setBusy(true)
    const res = await fetch(`/api/gbp/connection?projectId=${encodeURIComponent(projectId)}`, { method: 'DELETE' }).catch(() => null)
    setBusy(false)
    if (!res || !res.ok) { setError(t.errors.unexpected); return }
    onChanged()
  }

  if (conn?.status === 'connected') {
    return (
      <div data-gbp-connect="">
      <Card className="p-5 sm:p-6">
        <StepHead icon={Store} overline={t.connect.overline} title={t.connect.title}
          aside={<Badge variant="success" dot>{t.connect.connected}</Badge>} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-prose text-copy text-body">{t.connect.points[0]}</p>
          <Button variant="ghost" size="sm" onClick={disconnect} disabled={busy}>
            <Unplug aria-hidden="true" className="size-4" />
            {t.connect.disconnect}
          </Button>
        </div>
        {error && <Notice tone="bad" className="mt-4">{error}</Notice>}
        {dialog}
      </Card>
      </div>
    )
  }

  return (
    <div data-gbp-connect="">
    <Card className="p-5 sm:p-6">
      <StepHead icon={Store} overline={t.connect.overline} title={conn ? t.connect.reauthTitle : t.connect.title} />
      <div className="space-y-4">
        <p className="max-w-prose text-copy text-body">{conn ? t.connect.reauthBody : t.connect.body}</p>
        {!conn && (
          <ul className="space-y-2">
            {t.connect.points.map((p) => (
              <li key={p} className="flex items-start gap-2 text-copy text-body">
                <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-action" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        )}
        {!status.configured && <Notice tone="info">{t.notConfiguredBody}</Notice>}
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={start} loading={busy} disabled={busy || !status.configured}>
            <GoogleMark />
            {busy ? t.connect.connecting : conn ? t.connect.reconnect : t.connect.cta}
          </Button>
        </div>
      </div>
    </Card>
    </div>
  )
}

/** Google's "G", in its own four colours, the way sign-in buttons show it. */
function GoogleMark() {
  return (
    <span aria-hidden="true" className="inline-flex size-5 items-center justify-center rounded-pill bg-surface">
      <svg viewBox="0 0 18 18" className="size-3.5">
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.7H.96v2.33A9 9 0 0 0 9 18z" />
        <path fill="#FBBC05" d="M3.96 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.28-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3-2.33z" />
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3 2.33C4.67 5.16 6.66 3.58 9 3.58z" />
      </svg>
    </span>
  )
}

interface LocationOption { accountName: string; locationName: string; title: string; address: string | null }

/**
 * Codes that mean Google no longer honours the connection. Step 2 learns them first
 * (listing the businesses needs a live grant); they belong to step 1, so step 2 hands
 * them up instead of showing its own red error beside step 1's "connected" badge.
 */
export const GBP_AUTH_LOST_CODES: ReadonlySet<string> = new Set(['reauth_required', 'not_connected', 'connection_revoked'])

/** Step 2: which of the merchant's businesses this project posts to. */
export function LocationCard({ projectId, status, onChanged, onAuthLost }: {
  projectId: string
  status: GbpReadyStatus
  onChanged: () => void
  /** The grant turned out to be gone: step 1 says so (one status per step). */
  onAuthLost?: () => void
}) {
  const { uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).mapsPosts
  const connected = status.connection?.status === 'connected'
  const [picking, setPicking] = useState(false)
  const [options, setOptions] = useState<LocationOption[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const needList = connected && (picking || !status.location)

  useEffect(() => {
    if (!needList || options) return
    let alive = true
    fetch(`/api/gbp/locations?projectId=${encodeURIComponent(projectId)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!alive) return
        if (res.ok && Array.isArray(body.locations)) setOptions(body.locations as LocationOption[])
        else if (typeof body.error === 'string' && GBP_AUTH_LOST_CODES.has(body.error)) { setOptions(null); onAuthLost?.() }
        else { setOptions([]); setError(gbpErrorText(t, body.error)) }
      })
      .catch(() => { if (alive) { setOptions([]); setError(t.errors.unexpected) } })
    return () => { alive = false }
  }, [needList, options, projectId, t, onAuthLost])

  const choose = async (o: LocationOption) => {
    setSaving(o.locationName); setError(null)
    const res = await fetch('/api/gbp/locations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, accountName: o.accountName, locationName: o.locationName }) }).catch(() => null)
    const body = res ? await res.json().catch(() => ({})) : {}
    setSaving(null)
    if (res && typeof body.error === 'string' && GBP_AUTH_LOST_CODES.has(body.error)) { onAuthLost?.(); return }
    if (!res || !res.ok) { setError(gbpErrorText(t, body.error)); return }
    setPicking(false)
    onChanged()
  }

  return (
    <div data-gbp-location="">
    <Card className="p-5 sm:p-6">
      <StepHead icon={MapPin} overline={t.location.overline} title={t.location.title}
        aside={connected && status.location && !picking ? (
          <Button variant="ghost" size="sm" onClick={() => { setPicking(true); setOptions(null) }}>{t.location.change}</Button>
        ) : undefined} />
      {!connected ? (
        <p className="max-w-prose text-copy text-muted">{t.location.body}</p>
      ) : status.location && !picking ? (
        <div className="rounded-inset border border-line bg-sunk px-4 py-3">
          <p className="text-caption text-muted">{t.location.selectedLabel}</p>
          <p className="text-copy font-semibold text-ink">{status.location.title}</p>
          {status.location.address && <p className="text-caption text-muted">{status.location.address}</p>}
          {status.location.mapsUri && (
            <a href={status.location.mapsUri} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 rounded-control text-caption font-semibold text-action hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20">
              {t.location.openInMaps}
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </a>
          )}
        </div>
      ) : options === null ? (
        <div className="space-y-2" aria-busy="true" aria-label={t.location.loading}>
          <Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" />
        </div>
      ) : options.length === 0 ? (
        error ? <Notice tone="bad">{error}</Notice> : <EmptyState icon={<Store className="size-5" />} title={t.location.emptyTitle} body={t.location.emptyBody} />
      ) : (
        <div className="space-y-3">
          <p className="max-w-prose text-copy text-body">{t.location.body}</p>
          <ul className="divide-y divide-line rounded-inset border border-line">
            {options.map((o) => (
              <li key={o.locationName} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-copy font-semibold text-ink" title={o.title}>{o.title}</p>
                  {o.address && <p className="truncate text-caption text-muted" title={o.address}>{o.address}</p>}
                </div>
                <Button size="sm" variant="secondary" onClick={() => choose(o)} loading={saving === o.locationName} disabled={saving !== null}>
                  {saving === o.locationName ? t.location.saving : t.location.choose}
                </Button>
              </li>
            ))}
          </ul>
          {error && <Notice tone="bad">{error}</Notice>}
        </div>
      )}
    </Card>
    </div>
  )
}
