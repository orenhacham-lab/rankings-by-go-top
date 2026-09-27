'use client'

/**
 * A connected Wix or custom-site (webhook) connection: what it points at, its
 * masked key, its health, and the two actions — test (Wix: one read; webhook:
 * a signed test event) and disconnect. Never receives a secret: the connection
 * it is given is the sanitized shape, which has only `secret_hint`.
 */
import { useState } from 'react'
import { Send, ShieldCheck, Unplug } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { formatDateTime } from '@/lib/utils'
import type { SanitizedSiteConnection } from '@/lib/site-platforms/types'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import WebhookDocs from './WebhookDocs'
import { siteErrorText } from './PlatformSwitchModal'

type T = DashboardDictionary['sitePlatforms']

export default function SitePlatformPanel({
  projectId, connection, t, onChanged, locked,
}: {
  projectId: string
  connection: SanitizedSiteConnection
  t: T
  onChanged: () => void
  locked?: boolean
}) {
  const [testing, setTesting] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const wix = connection.platform === 'wix'
  const status = connection.connection_status
  const tone = status === 'connected' ? 'success' : status === 'failed' ? 'danger' : 'neutral'

  async function test() {
    setTesting(true); setMessage(null)
    try {
      const res = await fetch('/api/site-platforms/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }) })
      const d = await res.json().catch(() => ({})) as { ok?: boolean; code?: string }
      setMessage(d.ok ? { text: wix ? t.panel.testOk : t.webhook.testOk, ok: true } : { text: siteErrorText(t, d.code), ok: false })
      onChanged()
    } catch { setMessage({ text: t.errors.unexpected, ok: false }) } finally { setTesting(false) }
  }

  async function disconnect() {
    if (!window.confirm(t.panel.disconnectConfirm)) return
    setRemoving(true); setMessage(null)
    try {
      const res = await fetch(`/api/site-platforms/connection?projectId=${encodeURIComponent(projectId)}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({})) as { reason?: string }
      if (res.ok) onChanged()
      else setMessage({ text: siteErrorText(t, d.reason), ok: false })
    } catch { setMessage({ text: t.errors.unexpected, ok: false }) } finally { setRemoving(false) }
  }

  const rows: [string, string | null][] = wix
    ? [[t.panel.siteUrl, connection.site_url], [t.panel.siteId, connection.wix_site_id], [t.panel.apiKey, connection.secret_hint]]
    : [[t.panel.endpoint, connection.endpoint_url], [t.panel.secret, connection.secret_hint]]

  return (
    <div data-site-panel={connection.platform}>
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-ink">{t.names[connection.platform]}</h3>
        <Badge variant={tone} dot>{t.status[status]}</Badge>
      </div>

      <dl className="grid gap-x-6 gap-y-2 text-copy sm:grid-cols-[max-content_minmax(0,1fr)]">
        {rows.filter(([, v]) => !!v).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd dir="ltr" className="min-w-0 truncate text-start font-mono text-caption text-ink sm:text-copy rtl:text-end">{v}</dd>
          </div>
        ))}
        <dt className="text-muted">{t.panel.lastTest}</dt>
        <dd className="text-body">{connection.last_tested_at ? formatDateTime(connection.last_tested_at) : t.panel.never}</dd>
      </dl>

      {status === 'failed' && connection.last_error_code && (
        <p className="rounded-control border border-bad/20 bg-bad-soft px-3 py-2 text-copy text-bad">{siteErrorText(t, connection.last_error_code)}</p>
      )}

      {!wix && <WebhookDocs t={t.webhook.docs} />}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => void test()} loading={testing} disabled={testing || removing}>
          {wix ? <ShieldCheck size={14} aria-hidden /> : <Send size={14} aria-hidden />}
          {testing ? (wix ? t.panel.testing : t.webhook.sending) : (wix ? t.panel.test : t.webhook.sendTest)}
        </Button>
        {!locked && (
          <Button size="sm" variant="ghost" onClick={() => void disconnect()} loading={removing} disabled={testing || removing} className="text-bad hover:text-bad">
            <Unplug size={14} aria-hidden /> {t.panel.disconnect}
          </Button>
        )}
      </div>

      {message && (
        <p role="status" className={`text-caption font-medium animate-pop-in ${message.ok ? 'text-ok' : 'text-bad'}`}>{message.text}</p>
      )}
    </Card>
    </div>
  )
}
