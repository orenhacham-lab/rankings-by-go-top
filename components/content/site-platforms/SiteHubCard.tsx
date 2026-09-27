'use client'

/**
 * Wix / custom-site cards for the content screens:
 *   SiteHubCard     — where the articles go (the Articles screen), with a link
 *                     to Project settings, where the connection is managed.
 *   SitePublishCard — the article editor's publish action for these platforms.
 * Both read only the sanitized connection (no key, no secret).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Send } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { platformSetupHref } from '@/lib/content/content-hub-setup'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { SanitizedSiteConnection } from '@/lib/site-platforms/types'
import PlatformIcon from './PlatformIcon'
import { siteErrorText } from './PlatformSwitchModal'

function useSiteConnection(projectId: string | null) {
  const [conn, setConn] = useState<SanitizedSiteConnection | null>(null)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    if (!projectId) { setLoading(false); return }
    try {
      const res = await fetch(`/api/site-platforms/connection?projectId=${encodeURIComponent(projectId)}`)
      const d = res.ok ? await res.json().catch(() => ({})) : {}
      setConn((d.connection ?? null) as SanitizedSiteConnection | null)
    } catch { /* stays null */ } finally { setLoading(false) }
  }, [projectId])
  useEffect(() => { void load() }, [load])
  return { conn, loading }
}

export default function SiteHubCard({ projectId }: { projectId: string }) {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const sp = dict.sitePlatforms
  const { conn, loading } = useSiteConnection(projectId)
  if (loading || !conn) return null
  const tone = conn.connection_status === 'connected' ? 'success' : conn.connection_status === 'failed' ? 'danger' : 'neutral'
  return (
    <Card className="hover:translate-y-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <PlatformIcon platform={conn.platform} size="sm" />
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-copy font-semibold text-ink">{sp.names[conn.platform]} <Badge variant={tone} dot>{sp.status[conn.connection_status]}</Badge></p>
            {(conn.site_url || conn.endpoint_url) && <p dir="ltr" className="truncate text-caption text-muted rtl:text-end">{conn.site_url ?? conn.endpoint_url}</p>}
          </div>
        </div>
        <Link href={platformSetupHref(projectId)} className="text-sm font-medium text-action hover:underline">{dict.contentHub.manageConnectionCta}</Link>
      </div>
      {conn.connection_status === 'failed' && conn.last_error_code && (
        <p className="mt-3 text-caption text-bad">{siteErrorText(sp, conn.last_error_code)}</p>
      )}
    </Card>
  )
}

export function SitePublishCard({ projectId, articleId }: { projectId: string; articleId: string }) {
  const { language } = useDashboardLanguage()
  const sp = useMemo(() => getDashboardDictionary(language).sitePlatforms, [language])
  const { conn } = useSiteConnection(projectId)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string; url?: string | null } | null>(null)

  async function publish() {
    if (!window.confirm(sp.publish.confirm)) return
    setBusy(true); setResult(null)
    try {
      const res = await fetch(`/api/content/articles/${articleId}/site-platform`, { method: 'POST' })
      const d = await res.json().catch(() => ({})) as { ok?: boolean; reason?: string; site_post_url?: string | null }
      setResult(res.ok && d.ok ? { ok: true, text: sp.publish.published, url: d.site_post_url ?? null } : { ok: false, text: siteErrorText(sp, d.reason) })
    } catch { setResult({ ok: false, text: sp.errors.unexpected }) } finally { setBusy(false) }
  }

  const name = conn ? sp.names[conn.platform] : ''
  return (
    <Card className="hover:translate-y-0">
      <h3 className="mb-1 text-base font-semibold text-ink">{sp.publish.cardTitle}</h3>
      <p className="mb-3 text-copy text-muted">{sp.publish.cardBody.replace('{platform}', name)}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => void publish()} loading={busy} disabled={busy || !conn}>
          <Send size={14} aria-hidden /> {busy ? sp.publish.publishing : sp.publish.button}
        </Button>
        {result && (
          <span role="status" className={`inline-flex items-center gap-2 text-caption font-medium animate-pop-in ${result.ok ? 'text-ok' : 'text-bad'}`}>
            {result.text}
            {result.url && (
              <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-action hover:underline">
                {sp.publish.open} <ExternalLink size={12} aria-hidden />
              </a>
            )}
          </span>
        )}
      </div>
    </Card>
  )
}
