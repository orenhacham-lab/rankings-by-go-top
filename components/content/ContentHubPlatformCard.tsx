'use client'

/**
 * Phase 4F.1 — Content Hub platform-aware connection/index card.
 *
 * Derives the active platform from the connection state and renders exactly one:
 *   - Shopify connected → a COMPACT Shopify status card (store, last sync, per-
 *     type counts, the PUBLISHING DESTINATION, Sync now, Test connection).
 *     Connection MANAGEMENT (connect/disconnect) stays on the project page.
 *
 *     The destination is here because this is the ONLY Shopify card a connected
 *     merchant sees in the hub: ShopifyConnectionPanel is rendered just while
 *     `activePlatform === 'none'`. Without it, a queue blocked on "choose a
 *     default blog" pointed at a control that was not on screen. It is the same
 *     shared component that panel renders — see ShopifyDestinationSection.
 *   - otherwise (WordPress / neither / both) → the existing WordPress subtree
 *     (passed as children), unchanged.
 *
 * No WordPress behavior changes; no duplicated Shopify connect form.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { platformSetupHref } from '@/lib/content/content-hub-setup'
import { AlertTriangle } from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatDateTime } from '@/lib/utils'
import ShopifyDestinationSection from './ShopifyDestinationSection'

// `can_publish` and `default_blog_id` are already returned by
// /api/shopify/connection (sanitizeShopifyConnection) — this card simply never
// read them, which is why it could not show a publishing destination.
type Conn = {
  shop_domain: string
  storefront_domain: string | null
  connection_status: 'untested' | 'connected' | 'failed'
  last_synced_at: string | null
  last_error: string | null
  can_publish: boolean
  default_blog_id: string | null
} | null
type Counts = { product: number; collection: number; page: number; blog: number; article: number }
const ZERO: Counts = { product: 0, collection: 0, page: 0, blog: 0, article: 0 }

export default function ContentHubPlatformCard({ projectId, children }: { projectId: string; children: React.ReactNode }) {
  const { language } = useDashboardLanguage()
  const cs = useMemo(() => getDashboardDictionary(language).projectDetail.contentSection, [language])
  const t = cs.shopify

  const [loading, setLoading] = useState(true)
  const [shopify, setShopify] = useState<Conn>(null)
  const [wpConnected, setWpConnected] = useState(false)
  const [counts, setCounts] = useState<Counts>(ZERO)
  const [syncing, setSyncing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  const load = useCallback(async () => {
    try {
      const [shRes, wpRes] = await Promise.all([
        fetch(`/api/shopify/connection?projectId=${projectId}`),
        fetch(`/api/wordpress/connection?projectId=${projectId}`),
      ])
      const sh = shRes.ok ? await shRes.json().catch(() => ({})) : {}
      const wp = wpRes.ok ? await wpRes.json().catch(() => ({})) : {}
      setShopify(sh.connection ?? null)
      setCounts(sh.counts ?? ZERO)
      setWpConnected(!!wp.connection)
    } catch { /* fall back to children */ } finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { load() }, [load])

  async function sync() {
    setSyncing(true); setMessage(null)
    try {
      const res = await fetch('/api/shopify/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }) })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        setCounts(data.counts ?? ZERO)
        const base = data.partial ? t.syncPartial : t.syncOk
        setMessage({ text: data.warnings?.length ? `${base}: ${data.warnings.join(' · ')}` : base, ok: !data.partial })
      } else setMessage({ text: (t.errors as Record<string, string>)[data.reason || data.error] || t.syncFail, ok: false })
      await load()
    } catch { setMessage({ text: t.syncFail, ok: false }) } finally { setSyncing(false) }
  }

  async function test() {
    setTesting(true); setMessage(null)
    try {
      const res = await fetch('/api/shopify/test-connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }) })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.status === 'connection_ok') setMessage({ text: `${t.testOk}${data.shopName ? ` — ${data.shopName}` : ''}`, ok: true })
      else setMessage({ text: (t.errors as Record<string, string>)[data.status || data.reason] || t.testFail, ok: false })
      await load()
    } catch { setMessage({ text: t.testFail, ok: false }) } finally { setTesting(false) }
  }

  // Platform-aware routing (Phase 4F.1):
  //   loading            → spinner (no WordPress flash)
  //   both connected     → explicit configuration-conflict warning
  //   WordPress only     → existing WordPress subtree (unchanged)
  //   neither connected  → compact platform choice (project page owns the forms)
  //   Shopify only       → the Shopify status card below
  if (loading) {
    return (
      <Card>
        <div role="status" aria-busy="true" className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56" />
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 rounded-inset" />)}
          </div>
        </div>
      </Card>
    )
  }
  if (wpConnected && shopify) {
    // Unexpected dual connection — surface a conflict, delete nothing.
    return (
      <Card className="border-warn/40">
        <div className="flex items-start gap-2">
          <AlertTriangle size={18} className="text-warn mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-warn">{cs.conflictTitle}</div>
            <p className="text-copy text-warn">{cs.conflictBody}</p>
            <Link href={platformSetupHref(projectId)} className="inline-block mt-2 text-caption text-action hover:underline">
              {cs.title} →
            </Link>
          </div>
        </div>
      </Card>
    )
  }
  if (wpConnected) return <>{children}</>
  if (!shopify) {
    // Neither connected → compact platform choice. Connection forms live in the
    // project's settings (reuse), so these navigate there instead of duplicating them.
    return (
      <Card>
        <h3 className="mb-1 text-section font-semibold text-ink">{cs.platformChoiceTitle}</h3>
        <p className="text-copy text-muted mb-3">{cs.platformChoiceHint}</p>
        <div className="flex flex-wrap gap-2">
          <Link href={platformSetupHref(projectId)}><Button size="sm">{cs.connectWordPress}</Button></Link>
          <Link href={platformSetupHref(projectId)}><Button size="sm" variant="outline">{cs.connectShopify}</Button></Link>
        </div>
      </Card>
    )
  }

  const variant = shopify.connection_status === 'connected' ? 'success' : shopify.connection_status === 'failed' ? 'danger' : 'neutral'
  const statusLabel = shopify.connection_status === 'connected' ? t.connected : shopify.connection_status === 'failed' ? t.failed : t.untested

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-section font-semibold text-ink">{t.title}</h3>
        <Badge variant={variant}>{statusLabel}</Badge>
      </div>

      <div className="text-copy text-body mb-2">
        <div className="font-medium">{shopify.shop_domain}</div>
        {shopify.storefront_domain && <div className="text-caption text-muted">{shopify.storefront_domain}</div>}
      </div>

      <div className="list-enter mb-3 grid grid-cols-3 gap-2 text-center sm:grid-cols-5">
        {(['product', 'collection', 'page', 'blog', 'article'] as const).map((k) => (
          <div key={k} className="rounded-inset border border-line bg-sunk/60 px-2 py-2.5">
            <div className="text-section font-semibold tabular-nums text-ink">{counts[k]}</div>
            <div className="text-caption text-muted">{t.counts[k]}</div>
          </div>
        ))}
      </div>

      <div className="text-caption text-muted mb-2">
        {shopify.last_synced_at ? `${t.lastSync}: ${formatDateTime(shopify.last_synced_at, language)}` : t.neverSynced}
      </div>
      {shopify.last_error && (
        <div className={`text-caption mb-2 ${shopify.connection_status === 'failed' ? 'text-bad' : 'text-warn'}`}>{shopify.last_error}</div>
      )}

      <ShopifyDestinationSection
        projectId={projectId}
        canPublish={shopify.can_publish}
        defaultBlogId={shopify.default_blog_id}
        onSaved={load}
      />

      <div className="flex flex-wrap gap-2 mt-2">
        <Button size="sm" onClick={sync} loading={syncing} disabled={syncing || testing}>{t.syncNow}</Button>
        <Button size="sm" variant="outline" onClick={test} loading={testing} disabled={testing || syncing}>{t.testConnection}</Button>
      </div>

      {message && <p className={`mt-2 text-caption ${message.ok ? 'text-ok' : 'text-bad'}`}>{message.text}</p>}
    </Card>
  )
}
