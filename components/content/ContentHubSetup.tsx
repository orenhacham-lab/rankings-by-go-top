'use client'

/**
 * K5 — Content Hub "missing connections" onboarding. Two INDEPENDENT setup cards:
 *   - Platform (publishing): connect / fix — publishing is NEVER implied without one.
 *   - Search Console (OPTIONAL evidence): connect / choose property / reconnect —
 *     always labelled optional; topic generation works without it.
 * Each card hides when its dimension is ready; the whole block hides when both are.
 *
 * The buttons REUSE the existing K3 (WP/Shopify) and K4 (GscPanel) flows by
 * scrolling to those already-mounted panels — no duplicated OAuth/token logic here.
 */
import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import {
  selectSetupCards, PLATFORM_SETUP_ANCHOR, GSC_SETUP_ANCHOR,
  type PlatformState, type GscState,
} from '@/lib/content/content-hub-setup'

function scrollToAnchor(id: string) {
  if (typeof document === 'undefined') return
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

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
  const cs = dict.projectDetail.contentSection // reuse existing connect-button labels

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

  return (
    <div className="mb-4 space-y-2">
      <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{s.title}</div>

      {platformCard && (
        <Card className="hover:translate-y-0 border-amber-200 dark:border-amber-800/60">
          <div className="font-semibold text-slate-800 dark:text-slate-100">
            {platformCard === 'none' ? s.platformNoneTitle : s.platformFailedTitle}
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            {platformCard === 'none' ? s.platformNoneBody : platformCard === 'failed_scope' ? s.platformScopeBody : s.platformFailedBody}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {platformCard === 'none' ? (
              <>
                <Button size="sm" onClick={() => scrollToAnchor(PLATFORM_SETUP_ANCHOR)}>{cs.connectWordPress}</Button>
                <Button size="sm" variant="outline" onClick={() => scrollToAnchor(PLATFORM_SETUP_ANCHOR)}>{cs.connectShopify}</Button>
              </>
            ) : (
              <Button size="sm" onClick={() => scrollToAnchor(PLATFORM_SETUP_ANCHOR)}>{s.fixConnection}</Button>
            )}
          </div>
        </Card>
      )}

      {gscCard && (
        <Card className="hover:translate-y-0 border-indigo-200 dark:border-indigo-800/60">
          <div className="font-semibold text-slate-800 dark:text-slate-100">
            {gscCard === 'no_property' ? s.gscNoPropertyTitle : gscCard === 'reauth' ? s.gscReauthTitle : s.gscNoneTitle}
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            {gscCard === 'no_property' ? s.gscNoPropertyBody : gscCard === 'reauth' ? s.gscReauthBody : s.gscNoneBody}
          </p>
          <div className="mt-2">
            <Button size="sm" variant="outline" onClick={() => scrollToAnchor(GSC_SETUP_ANCHOR)}>
              {gscCard === 'no_property' ? s.gscChooseProperty : gscCard === 'reauth' ? s.gscReconnect : s.gscConnect}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
