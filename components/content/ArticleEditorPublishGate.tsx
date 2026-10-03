'use client'

/**
 * Phase 4F.1 — platform gate for the article editor's PUBLISHING controls.
 *
 * Derives the active platform from the project connection state (never from a
 * WordPress post id) and renders exactly one:
 *   - WordPress connected → the WordPress publishing subtree (children), unchanged.
 *   - Shopify connected    → a compact informational card (Shopify publishing is
 *                            a later phase; NO fake/disabled CTA).
 *   - Neither              → a compact "connect a platform on the project page".
 *   - Both                 → a configuration-conflict warning (no publish flow).
 *   - Wix / custom site    → the publish card for those platforms (SitePublishCard).
 *
 * UI-only: hides WordPress controls in non-WordPress projects rather than
 * rendering them disabled. No publishing behavior changes.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { platformSetupHref } from '@/lib/content/content-hub-setup'
import { Card } from '@/components/ui/Card'
import Notice from '@/components/ui/Notice'
import { Skeleton } from '@/components/ui/Skeleton'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { SitePublishCard } from './site-platforms/SiteHubCard'
import { resolveActivePlatform, siteConnectionState, type ActivePlatform } from '@/lib/content/platform/active-platform'

/**
 * The project's active publishing platform, detected ONCE for the article viewer
 * and shared by its top bar and this gate (so the two can never disagree, and
 * the three connection reads are not made twice). Platform by connection
 * VALIDITY through the shared resolver, never by a WordPress post id.
 */
export interface PublishPlatformState {
  loading: boolean
  platform: ActivePlatform
  shopifyNeedsScope: boolean
  shopDomain: string | null
}

export function usePublishPlatform(projectId: string | null, enabled = true): PublishPlatformState {
  // The result carries the project it was read for, so a project change reads as
  // "loading" until its own answer arrives (no stale platform, no flash).
  const [result, setResult] = useState<(Omit<PublishPlatformState, 'loading'> & { key: string }) | null>(null)

  useEffect(() => {
    if (!enabled || !projectId) return
    let live = true
    void (async () => {
      let next: Omit<PublishPlatformState, 'loading'> = { platform: 'none', shopifyNeedsScope: false, shopDomain: null }
      try {
        const q = encodeURIComponent(projectId)
        const [wpRes, shRes, siteRes] = await Promise.all([
          fetch(`/api/wordpress/connection?projectId=${q}`),
          fetch(`/api/shopify/connection?projectId=${q}`),
          fetch(`/api/site-platforms/connection?projectId=${q}`),
        ])
        const wp = wpRes.ok ? await wpRes.json().catch(() => ({})) : {}
        const sh = shRes.ok ? await shRes.json().catch(() => ({})) : {}
        const st = siteRes.ok ? await siteRes.json().catch(() => ({})) : {}
        const shConn = (sh.connection ?? null) as { connection_status?: string; can_publish?: boolean; shop_domain?: string } | null
        const resolved = resolveActivePlatform({
          wordpress: { present: !!wp.connection, connectionStatus: (wp.connection as { connection_status?: string } | null)?.connection_status ?? null },
          shopify: { present: !!shConn, connectionStatus: shConn?.connection_status ?? null, canPublish: !!shConn?.can_publish },
          site: siteConnectionState(st.connection ?? null),
        })
        next = { platform: resolved.platform, shopifyNeedsScope: resolved.shopifyNeedsScope, shopDomain: shConn?.shop_domain ?? null }
      } catch { /* leave none */ }
      if (live) setResult({ key: projectId, ...next })
    })()
    return () => { live = false }
  }, [projectId, enabled])

  const loading = !!projectId && result?.key !== projectId
  if (loading || !result) return { loading, platform: 'none', shopifyNeedsScope: false, shopDomain: null }
  return { loading: false, platform: result.platform, shopifyNeedsScope: result.shopifyNeedsScope, shopDomain: result.shopDomain }
}

export default function ArticleEditorPublishGate({ projectId, children, shopifyPanel, articleId, detected }: {
  projectId: string | null
  children: React.ReactNode
  shopifyPanel?: React.ReactNode
  articleId?: string
  /** The platform the page already detected (the article viewer's top bar); the gate then does not read it again. */
  detected?: PublishPlatformState
}) {
  const { language, uiLocale } = useDashboardLanguage()
  const t = useMemo(() => getDashboardDictionary(uiLocale).contentHub.editor.publishGate, [uiLocale])
  const dir: 'rtl' | 'ltr' = language === 'he' ? 'rtl' : 'ltr'

  // Platform by connection VALIDITY (shared resolver), not row existence — a
  // stale/failed WordPress row never masks a valid Shopify connection.
  const own = usePublishPlatform(projectId, !detected)
  const { loading, platform } = detected ?? own

  // Wait for detection so WordPress controls never flash in a Shopify project.
  if (loading) {
    return (
      <Card>
        <div role="status" aria-busy="true" className="space-y-2 py-1">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-10 w-full" />
        </div>
      </Card>
    )
  }

  // Both GENUINELY connected → conflict; never render a publishing flow.
  if (platform === 'conflict') {
    return (
      <div dir={dir}>
        <Notice tone="warn">
          <p className="font-semibold">{t.conflictTitle}</p>
          <p className="max-w-prose text-body">{t.conflictText}</p>
          {projectId && <Link href={platformSetupHref(projectId)} className="mt-1 inline-block rounded-control text-caption font-semibold text-action hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20">{t.projectPageLink}</Link>}
        </Notice>
      </div>
    )
  }

  // WordPress active → the existing WordPress publishing subtree, unchanged.
  if (platform === 'wordpress') return <>{children}</>

  // Shopify active → the Shopify publishing panel (Phase 4F.2). Falls back to
  // an informational card only when no panel is supplied.
  if (platform === 'shopify') {
    if (shopifyPanel) return <>{shopifyPanel}</>
    return (
      <Card className="p-5 sm:p-6">
        <div dir={dir}>
          <h3 className="text-section font-semibold text-ink mb-1">{t.shopifyTitle}</h3>
          <p className="text-copy text-body">{t.shopifyText}</p>
          <p className="text-caption text-muted mt-1">{t.shopifySecondary}</p>
        </div>
      </Card>
    )
  }

  // Wix / custom site → publish straight to the connected site (no draft step).
  if ((platform === 'wix' || platform === 'webhook') && projectId && articleId) {
    return <SitePublishCard projectId={projectId} articleId={articleId} />
  }

  // Neither connected → direct the user to connect on the project page.
  return (
    <Card className="p-5 sm:p-6">
      <div dir={dir}>
        <p className="max-w-prose text-copy text-body">{t.neitherText}</p>
        {projectId && <Link href={platformSetupHref(projectId)} className="mt-2 inline-block rounded-control text-caption font-semibold text-action hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20">{t.projectPageLink}</Link>}
      </div>
    </Card>
  )
}
