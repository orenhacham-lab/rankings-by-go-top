'use client'

/**
 * The site-platform connection, as the project's settings screen shows it.
 *
 * It used to open the project page's "Content & Articles" block, under a title and
 * four article counters. The counters were never wired to data (they always read
 * 0), and article numbers belong to the content screens, so the settings screen
 * keeps only the connection itself.
 *
 * Phase 4F.1 UX: a project uses ONE primary platform. This section derives the
 * active platform from the existing connection tables (no migration) and shows
 * exactly one of: platform choice (neither connected), the WordPress panel, the
 * Shopify panel, or a configuration-conflict warning (both connected). Server-
 * side exclusivity is enforced in the connection routes — this is the UI half.
 *
 * Site platforms: a web project can also publish to Wix or to a custom-built
 * site (signed webhook). The card on top names the platform in use and offers
 * "switch platform", which opens ONE modal with the four options
 * (components/content/site-platforms). WordPress and Shopify still connect
 * through their own panels below, unchanged. A merchant who came from the
 * Shopify App Store is never offered the switch: for them this section renders
 * exactly what it rendered before (`legacy` below).
 *
 * THE CHOICE SURVIVES THE RE-READ. Confirming WordPress (or Shopify) in the
 * modal sets `choice` and re-reads the connections. That re-read used to reset
 * `choice` whenever nothing was connected, which is exactly the state right
 * after choosing a platform, so the WordPress panel mounted and vanished and
 * the form the modal had promised never appeared. The reset now happens only
 * when a re-read follows a disconnect (a panel's onChanged); a confirmed choice
 * re-reads with keepChoice. The chosen WordPress panel opens with its form out.
 *
 * The platform the site scan detected is preselected in the modal while
 * nothing is connected; nothing is shown as connected that is not.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowLeftRight, ScanSearch } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import WordPressConnectionPanel from './WordPressConnectionPanel'
import ShopifyConnectionPanel from './ShopifyConnectionPanel'
import PlatformIcon from './site-platforms/PlatformIcon'
import PlatformSwitchModal from './site-platforms/PlatformSwitchModal'
import SitePlatformPanel from './site-platforms/SitePlatformPanel'
import type { ChoosablePlatform, SanitizedSiteConnection } from '@/lib/site-platforms/types'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

/**
 * What the site scan read off the site, as a hint on the platform choice: its
 * words (already in the screen's language) and the platform it points at, if
 * it is one of the two this connects. A hint only: it orders the two buttons
 * and nothing else; each still opens the same panel as before.
 */
export type PlatformHint = { label: string; preferred: 'wordpress' | 'shopify' | 'wix' | null }

export default function ContentSection({ projectId, platformHint }: { projectId: string; platformHint?: PlatformHint | null }) {
  const router = useRouter()
  const { language } = useDashboardLanguage()
  const t = useMemo(() => getDashboardDictionary(language).projectDetail.contentSection, [language])
  const sp = useMemo(() => getDashboardDictionary(language).sitePlatforms, [language])

  // K1 — a clean connection success from the project page drops the user straight
  // into the Content Hub for this project (validated internal path; no open redirect).
  const goToContentHub = useCallback(() => {
    router.push(`/content?projectId=${encodeURIComponent(projectId)}`)
  }, [router, projectId])

  const [loading, setLoading] = useState(true)
  const [wpConnected, setWpConnected] = useState(false)
  const [shopifyConnected, setShopifyConnected] = useState(false)
  // Wix / custom-site connection (sanitized: never a key or secret).
  const [site, setSite] = useState<SanitizedSiteConnection | null>(null)
  // A Shopify App Store merchant: no platform switch, the section as it always was.
  const [switchLocked, setSwitchLocked] = useState(false)
  const [switchOpen, setSwitchOpen] = useState(false)
  // When neither platform is connected, which one the user chose to connect.
  const [choice, setChoice] = useState<'wordpress' | 'shopify' | null>(null)

  const refresh = useCallback(async (opts?: { keepChoice?: boolean }) => {
    try {
      const [wpRes, shRes, siteRes] = await Promise.all([
        fetch(`/api/wordpress/connection?projectId=${projectId}`),
        fetch(`/api/shopify/connection?projectId=${projectId}`),
        fetch(`/api/site-platforms/connection?projectId=${projectId}`),
      ])
      const wp = wpRes.ok ? await wpRes.json().catch(() => ({})) : {}
      const sh = shRes.ok ? await shRes.json().catch(() => ({})) : {}
      const st = siteRes.ok ? await siteRes.json().catch(() => ({})) : {}
      const wpc = !!wp.connection
      const shc = !!sh.connection
      setWpConnected(wpc)
      setShopifyConnected(shc)
      setSite((st.connection ?? null) as SanitizedSiteConnection | null)
      setSwitchLocked(st.switchLocked === true)
      // Returning to the neither-connected state (a disconnect) resets to the
      // platform choice; a choice the merchant just confirmed is kept.
      if (!wpc && !shc && !opts?.keepChoice) setChoice(null)
    } catch {
      /* leave as-is; panels still render on demand */
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { void refresh() }, [refresh])
  const onPanelChanged = useCallback(() => { void refresh() }, [refresh])

  // Returning from a Shopify OAuth attempt (?shopify=connected|warning|error)
  // opens the Shopify view so its panel shows the result + a re-entry field
  // (instead of a silent platform-choice screen). No-op when already connected.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('shopify')) setChoice('shopify')
  }, [])

  const both = wpConnected && shopifyConnected

  // K2 — when a platform is connected, explain what the Content Hub offers and link
  // to it. This is a pointer to the hub, NOT a second Content Hub inside the project.
  const connectedBanner = (
    <Card className="hover:translate-y-0 border-action/20 bg-action-soft/50">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="font-semibold text-ink">{t.connectedTitle}</div>
          <p className="text-sm text-body mt-0.5">{t.connectedBody}</p>
        </div>
        <Button size="sm" onClick={goToContentHub} className="shrink-0">{t.goToContentHub}</Button>
      </div>
    </Card>
  )

  const legacy = (
    <section>
      {loading ? (
        <Card className="hover:translate-y-0">
          <div className="flex items-center gap-2 text-sm text-muted py-3">
            <span className="inline-block w-4 h-4 border-2 border-action border-t-transparent rounded-full animate-spin" />
          </div>
        </Card>
      ) : both ? (
        // Unexpected dual connection — surface a conflict, delete nothing. Both
        // panels render so the owner can disconnect one to resolve it.
        <div className="space-y-3">
          <Card className="hover:translate-y-0 border-warn/40">
            <div className="flex items-start gap-2">
              <AlertTriangle size={18} className="text-warn mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold text-warn">{t.conflictTitle}</div>
                <p className="text-sm text-warn">{t.conflictBody}</p>
              </div>
            </div>
          </Card>
          <WordPressConnectionPanel projectId={projectId} onChanged={onPanelChanged} />
          <ShopifyConnectionPanel projectId={projectId} onChanged={onPanelChanged} />
        </div>
      ) : wpConnected ? (
        <div className="space-y-3">
          {connectedBanner}
          <WordPressConnectionPanel projectId={projectId} onChanged={onPanelChanged} />
        </div>
      ) : shopifyConnected ? (
        <div className="space-y-3">
          {connectedBanner}
          <ShopifyConnectionPanel projectId={projectId} onChanged={onPanelChanged} />
        </div>
      ) : choice === 'wordpress' ? (
        <div className="space-y-2">
          <button type="button" onClick={() => setChoice(null)} className="text-xs text-action hover:underline">← {t.back}</button>
          <WordPressConnectionPanel projectId={projectId} onChanged={onPanelChanged} onConnected={goToContentHub} />
        </div>
      ) : choice === 'shopify' ? (
        <div className="space-y-2">
          <button type="button" onClick={() => setChoice(null)} className="text-xs text-action hover:underline">← {t.back}</button>
          <ShopifyConnectionPanel projectId={projectId} onChanged={onPanelChanged} />
        </div>
      ) : (
        // Neither connected → platform choice (never both full panels at once).
        <Card className="hover:translate-y-0">
          <h3 className="text-base font-semibold text-ink mb-1">{t.platformChoiceTitle}</h3>
          <p className="text-sm text-muted mb-3">{t.platformChoiceHint}</p>
          {platformHint && (
            <p data-platform-hint={platformHint.preferred ?? 'other'} className="mb-3 inline-flex max-w-full items-center gap-1.5 rounded-pill border border-info/20 bg-info-soft px-2.5 py-1 text-caption font-medium text-info">
              <ScanSearch size={13} className="shrink-0" aria-hidden />
              <span className="min-w-0">{platformHint.label}</span>
            </p>
          )}
          {platformHint?.preferred === 'shopify' ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setChoice('shopify')}>{t.connectShopify}</Button>
              <Button size="sm" variant="outline" onClick={() => setChoice('wordpress')}>{t.connectWordPress}</Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setChoice('wordpress')}>{t.connectWordPress}</Button>
              <Button size="sm" variant="outline" onClick={() => setChoice('shopify')}>{t.connectShopify}</Button>
            </div>
          )}
        </Card>
      )}
    </section>
  )

  if (loading || switchLocked) return legacy

  // ── Web projects: the platform card, the switch modal, and the current panel ──
  const current: ChoosablePlatform | null = wpConnected ? 'wordpress' : shopifyConnected ? 'shopify' : site ? site.platform : null
  const connectedCount = [wpConnected, shopifyConnected, !!site].filter(Boolean).length
  const conflict = connectedCount > 1
  const onSwitched = (p: ChoosablePlatform, saved?: SanitizedSiteConnection | null) => {
    if (p === 'wordpress' || p === 'shopify') { setWpConnected(false); setShopifyConnected(false); setSite(null); setChoice(p) }
    else setSite(saved ?? null)
    void refresh({ keepChoice: true })
  }

  const platformCard = (
    <Card className="hover:translate-y-0" >
      <div className="flex flex-wrap items-center justify-between gap-4" data-platform-card={conflict ? 'conflict' : current ?? 'none'}>
        <div className="flex min-w-0 items-center gap-3">
          {current && !conflict ? <PlatformIcon platform={current} /> : (
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl border border-dashed border-line-strong text-muted"><ArrowLeftRight size={18} /></span>
          )}
          <div className="min-w-0">
            <p className="text-caption font-semibold uppercase tracking-wide text-muted">{sp.cardTitle}</p>
            {current && !conflict ? (
              <p className="flex flex-wrap items-center gap-2 text-section font-semibold text-ink">
                {sp.names[current]}
                <Badge variant="success" dot>{sp.currentLabel}</Badge>
              </p>
            ) : (
              <p className="text-section font-semibold text-ink">{conflict ? t.conflictTitle : sp.noneTitle}</p>
            )}
            <p className="mt-0.5 text-copy text-muted">{conflict ? sp.conflictNote : current ? sp.cardBody : sp.noneBody}</p>
          </div>
        </div>
        {!conflict && (
          <Button size="sm" variant={current ? 'secondary' : 'primary'} onClick={() => setSwitchOpen(true)} className="shrink-0" data-open-switch>
            <ArrowLeftRight size={14} aria-hidden /> {current ? sp.change : sp.choose}
          </Button>
        )}
      </div>
      {!current && platformHint && (
        <p data-platform-hint={platformHint.preferred ?? 'other'} className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-pill border border-info/20 bg-info-soft px-2.5 py-1 text-caption font-medium text-info">
          <ScanSearch size={13} className="shrink-0" aria-hidden />
          <span className="min-w-0">{platformHint.label}</span>
        </p>
      )}
    </Card>
  )

  return (
    <section className="space-y-3">
      {platformCard}
      {conflict ? (
        <div className="space-y-3">
          {wpConnected && <WordPressConnectionPanel projectId={projectId} onChanged={onPanelChanged} />}
          {shopifyConnected && <ShopifyConnectionPanel projectId={projectId} onChanged={onPanelChanged} />}
          {site && <SitePlatformPanel projectId={projectId} connection={site} t={sp} onChanged={onPanelChanged} />}
        </div>
      ) : current === 'wordpress' || (!current && choice === 'wordpress') ? (
        // One element for "chosen" and "connected", so saving does not remount
        // the panel: its answer (a failed test, say) stays on screen.
        <div className="space-y-3 animate-pop-in" data-wp-section>
          {current === 'wordpress' && connectedBanner}
          <WordPressConnectionPanel
            projectId={projectId}
            onChanged={onPanelChanged}
            onConnected={current === 'wordpress' ? undefined : goToContentHub}
            startWithForm={current !== 'wordpress'}
          />
        </div>
      ) : current === 'shopify' ? (
        <div className="space-y-3">
          {connectedBanner}
          <ShopifyConnectionPanel projectId={projectId} onChanged={onPanelChanged} />
        </div>
      ) : site ? (
        <div className="space-y-3">
          {site.connection_status === 'connected' && connectedBanner}
          <SitePlatformPanel projectId={projectId} connection={site} t={sp} onChanged={onPanelChanged} />
        </div>
      ) : choice === 'shopify' ? (
        <div className="animate-pop-in">
          <ShopifyConnectionPanel projectId={projectId} onChanged={onPanelChanged} />
        </div>
      ) : null}
      <PlatformSwitchModal
        open={switchOpen}
        onClose={() => setSwitchOpen(false)}
        projectId={projectId}
        current={current}
        preferred={current ? null : platformHint?.preferred ?? null}
        t={sp}
        onSwitched={onSwitched}
      />
    </section>
  )
}
