'use client'

/**
 * Phase 4F.1 — Shopify connection panel (project level).
 *
 * Connect a Shopify store via a manually-supplied Admin API access token:
 * shop domain + token (+ optional custom storefront domain) → save (encrypted
 * server-side) → test → sync entities. The token is write-only: never returned
 * or displayed again. Shows status, last sync, entity counts, last error.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
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
}
type Counts = { product: number; collection: number; page: number; blog: number; article: number }

const ZERO: Counts = { product: 0, collection: 0, page: 0, blog: 0, article: 0 }

export default function ShopifyConnectionPanel({ projectId }: { projectId: string }) {
  const { language } = useDashboardLanguage()
  const t = useMemo(() => getDashboardDictionary(language).projectDetail.contentSection.shopify, [language])

  const [loading, setLoading] = useState(true)
  const [connection, setConnection] = useState<SanitizedConnection | null>(null)
  const [counts, setCounts] = useState<Counts>(ZERO)
  const [showForm, setShowForm] = useState(false)

  const [shopDomain, setShopDomain] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [storefrontDomain, setStorefrontDomain] = useState('')

  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/shopify/connection?projectId=${projectId}`)
      if (res.ok) {
        const data = await res.json()
        setConnection(data.connection ?? null)
        setCounts(data.counts ?? ZERO)
      }
    } catch { /* leave not-connected */ } finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { load() }, [load])

  async function save() {
    if (!shopDomain.trim() || !accessToken.trim()) { setMessage({ text: t.needFields, ok: false }); return }
    setSaving(true); setMessage(null)
    try {
      const res = await fetch('/api/shopify/connection', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, shopDomain, accessToken, storefrontDomain: storefrontDomain.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setMessage({ text: mapErr(data.reason || data.error), ok: false }); return }
      setConnection(data.connection ?? null)
      setAccessToken(''); setShowForm(false)
      const msg = testStatusMessage(data.test)
      setMessage({ text: `${t.saved}${msg.text ? ` · ${msg.text}` : ''}`, ok: msg.ok })
    } catch { setMessage({ text: t.saveError, ok: false }) } finally { setSaving(false) }
  }

  async function test() {
    setTesting(true); setMessage(null)
    try {
      const res = await fetch('/api/shopify/test-connection', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && (data.status || typeof data.ok === 'boolean')) {
        const msg = testStatusMessage(data, data.shopName)
        setMessage({ text: msg.text, ok: msg.ok })
      } else setMessage({ text: mapErr(data.kind || data.reason || data.error), ok: false })
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
        const base = data.partial ? `${t.syncPartial}` : t.syncOk
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
      if (res.ok) { setConnection(null); setCounts(ZERO); setMessage({ text: t.disconnected, ok: true }) }
      else setMessage({ text: t.disconnectError, ok: false })
    } catch { setMessage({ text: t.disconnectError, ok: false }) } finally { setDisconnecting(false) }
  }

  function mapErr(code: unknown): string {
    const k = String(code || '')
    return (t.errors as Record<string, string>)[k] || t.errors.generic
  }

  /** Build a precise message from a rich test result ({status, missingScopes, versions}). */
  function testStatusMessage(test: { status?: string; ok?: boolean; missingScopes?: string[] | null; apiVersionRequested?: string | null; apiVersionActual?: string | null } | undefined, shopName?: string): { text: string; ok: boolean } {
    if (!test) return { text: '', ok: true }
    switch (test.status) {
      case 'connection_ok':
        return { text: `${t.testOk}${shopName ? ` — ${shopName}` : ''}`, ok: true }
      case 'missing_scopes':
        return { text: `${t.missingScopesLabel}: ${(test.missingScopes || []).join(', ')}`, ok: false }
      case 'api_version_fallback':
        return { text: `${t.versionFallback} (${test.apiVersionRequested} → ${test.apiVersionActual})`, ok: false }
      case 'invalid_token':
        return { text: t.errors.invalid_token, ok: false }
      case 'permission_error':
        return { text: t.errors.permission_error, ok: false }
      default:
        return { text: test.ok ? t.testOk : t.errors.generic, ok: !!test.ok }
    }
  }

  const statusVariant = connection?.connection_status === 'connected' ? 'success' : connection?.connection_status === 'failed' ? 'danger' : 'neutral'
  const statusLabel = connection?.connection_status === 'connected' ? t.connected : connection?.connection_status === 'failed' ? t.failed : t.untested

  if (loading) return <Card className="hover:translate-y-0"><p className="text-xs text-slate-400">{t.loading}</p></Card>

  return (
    <Card className="hover:translate-y-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{t.title}</h3>
        {connection && <Badge variant={statusVariant}>{statusLabel}</Badge>}
      </div>

      {!connection && !showForm && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t.hint}</p>
          <Button size="sm" onClick={() => setShowForm(true)}>{t.connect}</Button>
        </div>
      )}

      {(showForm || (connection && showForm)) && (
        <div className="space-y-2">
          <Input label={t.shopDomain} placeholder="acme.myshopify.com" value={shopDomain} onChange={(e) => setShopDomain(e.target.value)} />
          <Input label={t.token} type="password" placeholder="shpat_…" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} />
          <Input label={t.storefrontDomain} placeholder="shop.example.com" value={storefrontDomain} onChange={(e) => setStorefrontDomain(e.target.value)} />
          <p className="text-[11px] text-slate-400">{t.scopesHint}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} loading={saving} disabled={saving}>{t.save}</Button>
            <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setAccessToken('') }}>{t.cancel}</Button>
          </div>
        </div>
      )}

      {connection && !showForm && (
        <div className="space-y-3">
          <div className="text-sm text-slate-700 dark:text-slate-200">
            <div className="font-medium">{connection.shop_domain}</div>
            {connection.storefront_domain && <div className="text-xs text-slate-500">{connection.storefront_domain}</div>}
          </div>

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

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={sync} loading={syncing} disabled={syncing || testing}>{t.syncNow}</Button>
            <Button size="sm" variant="outline" onClick={test} loading={testing} disabled={testing || syncing}>{t.testConnection}</Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>{t.reconnect}</Button>
            <Button size="sm" variant="ghost" onClick={disconnect} loading={disconnecting} disabled={disconnecting}>{t.disconnect}</Button>
          </div>
        </div>
      )}

      {message && (
        <p className={`mt-2 text-xs ${message.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{message.text}</p>
      )}
    </Card>
  )
}
