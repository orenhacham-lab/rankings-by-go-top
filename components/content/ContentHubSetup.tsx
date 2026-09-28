'use client'

/**
 * K5 — Content Hub "missing connections": ONE compact line (UX review P1-18; it
 * used to be two large cards repeated on every content screen), with two
 * INDEPENDENT parts:
 *   - Platform (publishing): connect / fix — publishing is NEVER implied without one.
 *   - Search Console (OPTIONAL evidence): connect / choose property / reconnect —
 *     topic generation works without it.
 * Each part hides when its dimension is ready; the whole line hides when both are.
 *
 * The links REUSE the existing K3 (WP/Shopify) and K4 (GscPanel) flows by LINKING to
 * the settings section that owns each one — no duplicated OAuth/token logic here. They
 * used to scroll to panels further down the same page, which stopped meaning anything
 * once the content workspace became one screen per concern.
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plug } from 'lucide-react'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import {
  selectSetupCards, platformSetupHref, settingsGscHref,
  type PlatformState, type GscState,
} from '@/lib/content/content-hub-setup'

export default function ContentHubSetup({
  projectId, platform, platformFailed, shopifyNeedsScope,
}: {
  projectId: string
  platform: PlatformState
  platformFailed?: boolean
  shopifyNeedsScope?: boolean
}) {
  const { language } = useDashboardLanguage()
  const dict = useMemo(() => getDashboardDictionary(language), [language])
  const s = dict.contentHub.setup

  // GSC readiness — read-only status (no OAuth logic here; the GscPanel owns the flow).
  const [gscStatus, setGscStatus] = useState<GscState>('none')
  const [gscHasProperty, setGscHasProperty] = useState(false)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/gsc/status?projectId=${encodeURIComponent(projectId)}`)
        if (!res.ok || cancelled) return
        const d = await res.json().catch(() => ({}))
        if (cancelled) return
        setGscStatus((d?.connection?.status as GscState) ?? 'none')
        setGscHasProperty(!!d?.property)
      } catch { /* leave defaults (treated as not-connected) */ }
    })()
    return () => { cancelled = true }
  }, [projectId])

  const { platformCard, gscCard, showSetup } = selectSetupCards({ platform, platformFailed, shopifyNeedsScope, gscStatus, gscHasProperty })
  if (!showSetup) return null

  // ONE LINE, NOT TWO CARDS (UX review P1-18). The two large cards used to repeat
  // on every content screen; the connections are set up in one place, the
  // project's settings, and here a 40px line only says what is missing and links
  // to the exact section that sets it up.
  const linkClass = 'inline-flex shrink-0 items-center gap-1 rounded-control font-semibold text-action hover:underline'
  return (
    <div
      role="note"
      aria-label={s.rowLabel}
      data-content-setup-row
      className="mb-4 flex min-h-10 flex-wrap items-center gap-x-4 gap-y-1 rounded-control border border-line bg-surface px-3 py-2 text-caption text-body"
    >
      <Plug size={15} strokeWidth={2} aria-hidden="true" className="shrink-0 text-muted" />
      {platformCard && (
        <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2">
          <span className={platformCard === 'none' ? 'text-body' : 'font-medium text-warn'}>
            {platformCard === 'none' ? s.rowPlatformNone : s.rowPlatformFailed}
          </span>
          <Link href={platformSetupHref(projectId)} className={linkClass}>
            {platformCard === 'none' ? s.connectInSettings : s.fixConnection}
          </Link>
        </span>
      )}
      {platformCard && gscCard && <span aria-hidden="true" className="text-muted">·</span>}
      {gscCard && (
        <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2">
          <span className="text-body">
            {gscCard === 'no_property' ? s.rowGscNoProperty : gscCard === 'reauth' ? s.rowGscReauth : s.rowGscNone}
          </span>
          <Link href={settingsGscHref(projectId)}>
            <span className={linkClass}>
              {gscCard === 'no_property' ? s.gscChooseProperty : gscCard === 'reauth' ? s.gscReconnect : s.gscConnect}
            </span>
          </Link>
        </span>
      )}
    </div>
  )
}
