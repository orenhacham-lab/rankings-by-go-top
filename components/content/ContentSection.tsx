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
import { ArrowLeft, ArrowLeftRight, ScanSearch } from 'lucide-react'
import Notice from '@/components/ui/Notice'
import { Skeleton } from '@/components/ui/Skeleton'
import { BACK_LINK_CLASSES } from '@/components/ui/BackLink'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import WordPressConnectionPanel from './WordPressConnectionPanel'
import ShopifyConnectionPanel from './ShopifyConnectionPanel'
import PlatformIcon from './site-platforms/PlatformIcon'
import PlatformSwitchModal from './site-platforms/PlatformSwitchModal'
import SitePlatformPanel from './site-platforms/SitePlatformPanel'
import type { ChoosablePlatform, SanitizedSiteConnection } from '@/lib/site-platforms/types'
import ConnectionLoadFailed from '@/components/shared/ConnectionLoadFailed'
import { peekKnownRead, readKnown } from '@/lib/connection-status/useKnownRead'
import { projectConnectionsFrom, projectConnectionUrls, type ProjectConnections } from '@/lib/connection-status/project-connections'
import type { Known } from '@/lib/connection-status/known'
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

  // The three connections, known or not (lib/connection-status). When the screen
  // already read them (the settings screen asks for them the moment it opens), the
  // first render has the answer and draws the final state: no skeleton, no flash.
  const urls = useMemo(() => projectConnectionUrls(projectId), [projectId])
  const [initial] = useState(() => projectConnectionsFrom<unknown, unknown, SanitizedSiteConnection>({
    wordpress: peekKnownRead(urls.wordpress), shopify: peekKnownRead(urls.shopify), site: peekKnownRead(urls.site),
  }))
  const known0 = initial.state === 'ready' ? initial.value : null
  // 'error': the connections could not be READ. That is not "nothing is connected",
  // so it never draws the platform choice; it says so, with a retry.
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'ready'>(initial.state)
  const loading = loadState === 'loading'
  const [wpConnected, setWpConnected] = useState(!!known0?.wordpress)
  const [shopifyConnected, setShopifyConnected] = useState(!!known0?.shopify)
  // Wix / custom-site connection (sanitized: never a key or secret).
  const [site, setSite] = useState<SanitizedSiteConnection | null>(known0?.site ?? null)
  // A Shopify App Store merchant: no platform switch, the section as it always was.
  const [switchLocked, setSwitchLocked] = useState(known0?.switchLocked ?? false)
  const [switchOpen, setSwitchOpen] = useState(false)
  // When neither platform is connected, which one the user chose to connect.
  const [choice, setChoice] = useState<'wordpress' | 'shopify' | null>(null)

  const readConnections = useCallback(async (fresh: boolean) => {
    const [wordpress, shopify, siteRes] = await Promise.all([
      readKnown(urls.wordpress, { fresh }), readKnown(urls.shopify, { fresh }), readKnown(urls.site, { fresh }),
    ])
    return projectConnectionsFrom<unknown, unknown, SanitizedSiteConnection>({ wordpress, shopify, site: siteRes })
  }, [urls])

  const apply = useCallback((known: Known<ProjectConnections<unknown, unknown, SanitizedSiteConnection>>, keepChoice?: boolean) => {
    if (known.state !== 'ready') {
      // A re-read that failed keeps what is on screen; a first read that failed says so.
      setLoadState((prev) => (prev === 'ready' ? 'ready' : 'error'))
      return
    }
    const wpc = !!known.value.wordpress
    const shc = !!known.value.shopify
    setWpConnected(wpc)
    setShopifyConnected(shc)
    setSite(known.value.site)
    setSwitchLocked(known.value.switchLocked)
    // Returning to the neither-connected state (a disconnect) resets to the
    // platform choice; a choice the merchant just confirmed is kept.
    if (!wpc && !shc && !keepChoice) setChoice(null)
    setLoadState('ready')
  }, [])

  const refresh = useCallback(async (opts?: { keepChoice?: boolean }) => {
    apply(await readConnections(true), opts?.keepChoice)
  }, [readConnections, apply])

  const retry = useCallback(() => { setLoadState('loading'); void refresh() }, [refresh])
  // The first read joins one the screen already started; later reads ask again.
  useEffect(() => {
    if (initial.state !== 'loading') return
    let cancelled = false
    void readConnections(false).then((known) => { if (!cancelled) apply(known) })
    return () => { cancelled = true }
  }, [readConnections, apply, initial.state])
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
    <Card className="border-s-[3px] border-s-action p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-section font-semibold text-ink">{t.connectedTitle}</h3>
          <p className="mt-1 max-w-prose text-copy text-body">{t.connectedBody}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={goToContentHub} className="shrink-0">{t.goToContentHub}</Button>
      </div>
    </Card>
  )

  const legacy = (
    <section>
      {loading ? (
        <PlatformCardSkeleton />
      ) : both ? (
        // Unexpected dual connection — surface a conflict, delete nothing. Both
        // panels render so the owner can disconnect one to resolve it.
        <div className="space-y-3">
          <Notice tone="warn">
            <span className="font-semibold">{t.conflictTitle}</span> {t.conflictBody}
          </Notice>
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
          <button type="button" onClick={() => setChoice(null)} className={BACK_LINK_CLASSES}><ArrowLeft aria-hidden="true" className="size-4 shrink-0 rtl:-scale-x-100" />{t.back}</button>
          <WordPressConnectionPanel projectId={projectId} onChanged={onPanelChanged} onConnected={goToContentHub} />
        </div>
      ) : choice === 'shopify' ? (
        <div className="space-y-2">
          <button type="button" onClick={() => setChoice(null)} className={BACK_LINK_CLASSES}><ArrowLeft aria-hidden="true" className="size-4 shrink-0 rtl:-scale-x-100" />{t.back}</button>
          <ShopifyConnectionPanel projectId={projectId} onChanged={onPanelChanged} />
        </div>
      ) : (
        // Neither connected → platform choice (never both full panels at once).
        <Card className="p-5 sm:p-6">
          <h3 className="mb-1 text-section font-semibold text-ink">{t.platformChoiceTitle}</h3>
          <p className="mb-3 max-w-prose text-copy text-muted">{t.platformChoiceHint}</p>
          {platformHint && (
            <p data-platform-hint={platformHint.preferred ?? 'other'} className="mb-3 inline-flex max-w-full items-center gap-1.5 rounded-pill border border-line bg-sunk px-2.5 py-1 text-caption font-medium text-body">
              <ScanSearch className="size-4 shrink-0 text-action" aria-hidden />
              <span className="min-w-0">{platformHint.label}</span>
            </p>
          )}
          {platformHint?.preferred === 'shopify' ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setChoice('shopify')}>{t.connectShopify}</Button>
              <Button size="sm" variant="secondary" onClick={() => setChoice('wordpress')}>{t.connectWordPress}</Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setChoice('wordpress')}>{t.connectWordPress}</Button>
              <Button size="sm" variant="secondary" onClick={() => setChoice('shopify')}>{t.connectShopify}</Button>
            </div>
          )}
        </Card>
      )}
    </section>
  )

  if (loadState === 'error') return <ConnectionLoadFailed onRetry={retry} />
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
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4" data-platform-card={conflict ? 'conflict' : current ?? 'none'}>
        <div className="flex min-w-0 items-center gap-3">
          {current && !conflict ? <PlatformIcon platform={current} /> : (
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-inset bg-action-soft text-action"><ArrowLeftRight className="size-5" /></span>
          )}
          <div className="min-w-0">
            <p className="text-overline font-semibold uppercase tracking-wide text-muted">{sp.cardTitle}</p>
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
            <ArrowLeftRight className="size-4" aria-hidden /> {current ? sp.change : sp.choose}
          </Button>
        )}
      </div>
      {!current && platformHint && (
        <p data-platform-hint={platformHint.preferred ?? 'other'} className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-pill border border-line bg-sunk px-2.5 py-1 text-caption font-medium text-body">
          <ScanSearch className="size-4 shrink-0 text-action" aria-hidden />
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
        <div className="space-y-3 motion-safe:animate-pop-in" data-wp-section>
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
        <div className="motion-safe:animate-pop-in">
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

/**
 * The platform card's shape while the connections are read: the icon tile, the
 * overline, the title, one line and the button, where they will be, so the card
 * does not jump when the answer arrives. Nothing in it says "connected" or not.
 */
function PlatformCardSkeleton() {
  return (
    <div aria-busy="true" data-connection-loading="platform">
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-inset" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full max-w-sm" />
          </div>
        </div>
        <Skeleton className="h-8 w-32 shrink-0 rounded-control" />
      </div>
    </Card>
    </div>
  )
}
