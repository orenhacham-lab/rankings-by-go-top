'use client'

/**
 * Phase 4F.1 — Shopify connection panel (merchant OAuth).
 *
 * Disconnected: the merchant enters only the *.myshopify.com domain and clicks
 * Connect → we redirect to Shopify to approve READ-ONLY scopes; the callback
 * exchanges the code for an offline token server-side. No token/secret is ever
 * entered or shown here. Connected: shop, granted scopes, Test, Sync, Disconnect.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import { Card } from '@/components/ui/Card'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatDateTime } from '@/lib/utils'

type SanitizedConnection = {
  id: string
  shop_domain: string
  storefront_domain: string | null
  connection_status: 'untested' | 'connected' | 'failed'
  last_tested_at: string | null
  last_synced_at: string | null
  last_error: string | null
  granted_scopes: string[]
  auth_method: 'manual' | 'oauth'
  can_publish: boolean
  default_blog_id: string | null
}
type Counts = { product: number; collection: number; page: number; blog: number; article: number }
type Blog = { id: string; title: string; handle: string }

const ZERO: Counts = { product: 0, collection: 0, page: 0, blog: 0, article: 0 }

export default function ShopifyConnectionPanel({ projectId, onChanged }: { projectId: string; onChanged?: () => void }) {
  const { language } = useDashboardLanguage()
  const t = useMemo(() => getDashboardDictionary(language).projectDetail.contentSection.shopify, [language])
  const dir: 'ltr' | 'rtl' = language === 'he' ? 'rtl' : 'ltr'
  const g = t.guide

  const [loading, setLoading] = useState(true)
  const [connection, setConnection] = useState<SanitizedConnection | null>(null)
  const [counts, setCounts] = useState<Counts>(ZERO)
  const [showConnect, setShowConnect] = useState(false)
  const [shopDomain, setShopDomain] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [testing, setTesting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  // Phase 4F.2 — project default publishing Blog.
  const [blogs, setBlogs] = useState<Blog[]>([])
  const [defaultBlogId, setDefaultBlogId] = useState<string>('')
  const [savingDefault, setSavingDefault] = useState(false)

  function mapErr(code: unknown): string {
    const k = String(code || '')
    return (t.errors as Record<string, string>)[k] || t.errors.generic
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/shopify/connection?projectId=${projectId}`)
      if (res.ok) {
        const data = await res.json()
        const conn = data.connection ?? null
        setConnection(conn)
        setCounts(data.counts ?? ZERO)
        setDefaultBlogId(conn?.default_blog_id ?? '')
      }
    } catch { /* leave not-connected */ } finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { load() }, [load])

  // Load Blogs for the default-Blog selector once publishing is enabled.
  useEffect(() => {
    if (!connection) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/shopify/blogs?projectId=${projectId}`)
        const data = await res.json().catch(() => ({}))
        if (!cancelled && res.ok && Array.isArray(data.blogs)) {
          setBlogs(data.blogs)
          // One blog → preselect (persisted only on explicit Save).
          if (data.blogs.length === 1 && !defaultBlogId) setDefaultBlogId(data.blogs[0].id)
        }
      } catch { /* selector just stays empty */ }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, projectId])

  async function saveDefaultBlog() {
    setSavingDefault(true); setMessage(null)
    try {
      const res = await fetch('/api/shopify/connection', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, defaultBlogId: defaultBlogId || null }),
      })
      setMessage(res.ok ? { text: t.defaultBlogSaved, ok: true } : { text: t.defaultBlogError, ok: false })
      if (res.ok) await load()
    } catch { setMessage({ text: t.defaultBlogError, ok: false }) } finally { setSavingDefault(false) }
  }

  // Surface the OAuth callback result (?shopify=connected|warning|error&reason=)
  // then strip it from the URL so a refresh doesn't repeat the message.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const s = p.get('shopify')
    if (!s) return
    if (s === 'connected') setMessage({ text: t.connectedMsg, ok: true })
    else if (s === 'warning') setMessage({ text: mapErr(p.get('reason')), ok: false })
    else setMessage({ text: mapErr(p.get('reason')), ok: false })
    p.delete('shopify'); p.delete('reason')
    const qs = p.toString()
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
    load()
    onChanged?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function connect() {
    const shop = shopDomain.trim()
    if (!shop) { setMessage({ text: t.needDomain, ok: false }); return }
    setConnecting(true)
    // Full-page redirect into Shopify's authorization flow (server builds the
    // authorize URL with state; the token is exchanged server-side).
    window.location.href = `/api/shopify/oauth/start?projectId=${encodeURIComponent(projectId)}&shop=${encodeURIComponent(shop)}`
  }

  async function test() {
    setTesting(true); setMessage(null)
    try {
      const res = await fetch('/api/shopify/test-connection', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.status === 'connection_ok') setMessage({ text: `${t.testOk}${data.shopName ? ` — ${data.shopName}` : ''}`, ok: true })
      else if (res.ok && data.status === 'missing_scopes') setMessage({ text: `${t.missingScopesLabel}: ${(data.missingScopes || []).join(', ')}`, ok: false })
      else if (res.ok && data.status === 'api_version_fallback') setMessage({ text: `${t.versionFallback} (${data.apiVersionRequested} → ${data.apiVersionActual})`, ok: false })
      else setMessage({ text: mapErr(data.status || data.kind || data.reason || data.error), ok: false })
      await load()
    } catch { setMessage({ text: t.testFail, ok: false }) } finally { setTesting(false) }
  }

  async function sync() {
    setSyncing(true); setMessage(null)
    try {
      const res = await fetch('/api/shopify/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        setCounts(data.counts ?? ZERO)
        const base = data.partial ? t.syncPartial : t.syncOk
        setMessage({ text: data.warnings?.length ? `${base}: ${data.warnings.join(' · ')}` : base, ok: !data.partial })
      } else setMessage({ text: mapErr(data.reason || data.error), ok: false })
      await load()
    } catch { setMessage({ text: t.syncFail, ok: false }) } finally { setSyncing(false) }
  }

  async function disconnect() {
    if (!window.confirm(t.disconnectConfirm)) return
    setDisconnecting(true); setMessage(null)
    try {
      const res = await fetch(`/api/shopify/connection?projectId=${projectId}`, { method: 'DELETE' })
      if (res.ok) { setConnection(null); setCounts(ZERO); setMessage({ text: t.disconnected, ok: true }); onChanged?.() }
      else setMessage({ text: t.disconnectError, ok: false })
    } catch { setMessage({ text: t.disconnectError, ok: false }) } finally { setDisconnecting(false) }
  }

  const statusVariant = connection?.connection_status === 'connected' ? 'success' : connection?.connection_status === 'failed' ? 'danger' : 'neutral'
  const statusLabel = connection?.connection_status === 'connected' ? t.connected : connection?.connection_status === 'failed' ? t.failed : t.untested

  if (loading) return <Card className="hover:translate-y-0"><p className="text-xs text-slate-400">{t.loading}</p></Card>

  return (
    <Card className="hover:translate-y-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{t.title}</h3>
        <div className="flex items-center gap-2">
          {connection && <Badge variant={statusVariant}>{statusLabel}</Badge>}
          <button type="button" onClick={() => setGuideOpen(true)} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">{g.openGuide}</button>
        </div>
      </div>

      {!connection && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t.oauthExplain}</p>
          {!showConnect ? (
            <Button size="sm" onClick={() => setShowConnect(true)}>{t.connect}</Button>
          ) : (
            <div className="space-y-2">
              <div>
                <Input label={t.shopDomain} placeholder="acme.myshopify.com" value={shopDomain} onChange={(e) => setShopDomain(e.target.value)} />
                <button type="button" onClick={() => setGuideOpen(true)} className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline">{g.whereToFind}</button>
              </div>
              <p className="text-[11px] text-slate-400">{t.scopesHint}</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={connect} loading={connecting} disabled={connecting}>{t.connect}</Button>
                <Button size="sm" variant="outline" onClick={() => setShowConnect(false)} disabled={connecting}>{t.cancel}</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {connection && (
        <div className="space-y-3">
          <div className="text-sm text-slate-700 dark:text-slate-200">
            <div className="font-medium">{connection.shop_domain}</div>
            {connection.storefront_domain && <div className="text-xs text-slate-500">{connection.storefront_domain}</div>}
          </div>

          {connection.granted_scopes.length > 0 && (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {t.grantedScopesLabel}: <span className="text-slate-700 dark:text-slate-300">{connection.granted_scopes.join(', ')}</span>
            </div>
          )}

          <div className="grid grid-cols-5 gap-1 text-center">
            {(['product', 'collection', 'page', 'blog', 'article'] as const).map((k) => (
              <div key={k} className="rounded-md bg-slate-50 dark:bg-slate-800 py-1.5">
                <div className="text-base font-bold text-slate-800 dark:text-slate-100">{counts[k]}</div>
                <div className="text-[10px] text-slate-500">{t.counts[k]}</div>
              </div>
            ))}
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400">
            {connection.last_synced_at ? `${t.lastSync}: ${formatDateTime(connection.last_synced_at)}` : t.neverSynced}
          </div>
          {connection.last_error && (
            <div className={`text-xs ${connection.connection_status === 'failed' ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>{connection.last_error}</div>
          )}

          {/* Default publishing Blog.
              RECONCILIATION. This section was gated on `connection.can_publish`
              — and so was the blogs FETCH above — so a connection without
              write_content showed nothing at all: no selector, no explanation,
              no way to act. That is what a merchant reported. The gate is not
              removed blindly: `can_publish` and the publishing service both
              read hasWriteContent(granted_scopes), i.e. the SAME predicate on
              the SAME column, so they cannot disagree — a store that reached
              `no_shopify_blog` in the service HAD the scope, and its section
              should already have rendered. Two separate concerns were being
              conflated: whether the app MAY publish (a scope), and WHERE it
              would publish (a destination). The destination is now always shown
              for a live connection, and the missing scope is stated in words
              instead of hiding the whole block. (Note: ContentHubPlatformCard,
              the other Shopify card, has never contained this section at all —
              if that is the card in the screenshot, this panel was simply not
              on screen.) */}
          {(
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t.defaultBlogLabel}</label>
              {!connection.can_publish && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400">{t.defaultBlogNeedsScope}</p>
              )}
              {blogs.length === 0 ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">{t.defaultBlogNone}</p>
              ) : blogs.length === 1 ? (
                /* Exactly one blog: nothing to choose. The server resolves and
                   saves it automatically on the first publish, so this states
                   the destination rather than demanding an action. */
                <div className="text-sm text-slate-700 dark:text-slate-200">
                  {blogs[0].title}
                  <span className="ms-2 text-[11px] text-emerald-700 dark:text-emerald-400">{t.defaultBlogAuto}</span>
                </div>
              ) : (
                <select value={defaultBlogId} onChange={(e) => setDefaultBlogId(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                  <option value="">{t.defaultBlogSelect}</option>
                  {blogs.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
                </select>
              )}
              {blogs.length > 1 && !connection.default_blog_id && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400">{t.defaultBlogMissing}</p>
              )}
              {blogs.length >= 1 && (
                <Button size="sm" variant="outline" onClick={saveDefaultBlog} loading={savingDefault} disabled={savingDefault || (blogs.length > 1 && !defaultBlogId)}>{t.defaultBlogSave}</Button>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={sync} loading={syncing} disabled={syncing || testing}>{t.syncNow}</Button>
            <Button size="sm" variant="outline" onClick={test} loading={testing} disabled={testing || syncing}>{t.testConnection}</Button>
            <Button size="sm" variant="ghost" onClick={disconnect} loading={disconnecting} disabled={disconnecting}>{t.disconnect}</Button>
          </div>
        </div>
      )}

      {message && (
        <p className={`mt-2 text-xs ${message.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{message.text}</p>
      )}

      <Modal open={guideOpen} onClose={() => setGuideOpen(false)} title={g.title} size="lg">
        <div className="space-y-4 text-sm text-slate-700 dark:text-slate-200" dir={dir}>
          <p className="text-slate-600 dark:text-slate-300">{g.intro}</p>
          <ol className="list-decimal ms-5 space-y-1.5">
            {g.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
            <div className="font-medium text-amber-800 dark:text-amber-300 mb-1">{g.warningsTitle}</div>
            <ul className="list-disc ms-5 space-y-1 text-amber-800 dark:text-amber-300/90">
              {g.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
          <a href={g.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-indigo-600 dark:text-indigo-400 hover:underline">{g.docsLabel}</a>
          <div className="pt-1">
            <Button size="sm" onClick={() => setGuideOpen(false)}>{g.close}</Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
