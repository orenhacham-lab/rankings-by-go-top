'use client'

/**
 * WordPress connection panel — Content module Phase 1.
 *
 * Connect a WordPress site to the project via Application Password:
 * URL + username + password → test → save (encrypted server-side).
 * The password is write-only: it is never returned or displayed again.
 *
 * `startWithForm`: the settings screen's "Choose platform" promises the form
 * (site address, username, application password) once WordPress is confirmed,
 * so it opens this panel with the form already out, and the three short steps
 * that say where in wp-admin the application password is created. The settings
 * screen passes it only while nothing is connected.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import { Card } from '@/components/ui/Card'
import Notice from '@/components/ui/Notice'
import { Skeleton } from '@/components/ui/Skeleton'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { ChevronDown } from 'lucide-react'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatDateTime } from '@/lib/utils'
import { wpErrorKey } from '@/lib/wordpress/error-copy'

type SanitizedConnection = {
  id: string
  site_url: string
  wp_username: string
  connection_status: 'untested' | 'connected' | 'failed'
  last_tested_at: string | null
}

export default function WordPressConnectionPanel({
  projectId,
  onChanged,
  onConnected,
  startWithForm = false,
}: {
  projectId: string
  onChanged?: () => void
  onConnected?: () => void
  startWithForm?: boolean
}) {
  const { language } = useDashboardLanguage()
  const t = useMemo(() => getDashboardDictionary(language).projectDetail.contentSection, [language])

  const [loading, setLoading] = useState(true)
  const [connection, setConnection] = useState<SanitizedConnection | null>(null)
  const [showForm, setShowForm] = useState(startWithForm)
  const { confirm, dialog } = useConfirm()
  const [guideOpen, setGuideOpen] = useState(false)

  const [siteUrl, setSiteUrl] = useState('')
  const [username, setUsername] = useState('')
  const [appPassword, setAppPassword] = useState('')

  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  /** A route's sentence, as one of ours in the merchant's language; never shown as it came. */
  const wpError = (raw: unknown): string => {
    const key = wpErrorKey(raw)
    return key === 'generic' ? t.genericError : t.wpErrors[key]
  }

  const loadConnection = useCallback(async () => {
    try {
      const res = await fetch(`/api/wordpress/connection?projectId=${projectId}`)
      if (res.ok) {
        const data = await res.json()
        setConnection(data.connection ?? null)
      }
    } catch {
      // Leave as not-connected; the panel still renders the connect form.
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    loadConnection()
  }, [loadConnection])

  function openForm() {
    setSiteUrl(connection?.site_url ?? '')
    setUsername(connection?.wp_username ?? '')
    setAppPassword('')
    setMessage(null)
    setShowForm(true)
  }

  async function handleTest() {
    setTesting(true)
    setMessage(null)
    try {
      // Choose the test payload so the server checks exactly what the user sees:
      //  - typed a password  → test the typed URL/username/password (mode 1)
      //  - editing the form, no password → test the edited URL/username with the
      //    stored password (mode 2), so edited values aren't silently ignored
      //  - saved-connection view → test the stored connection as-is (mode 3)
      const body =
        appPassword
          ? { projectId, siteUrl, username, applicationPassword: appPassword }
          : showForm && siteUrl && username
            ? { projectId, siteUrl, username }
            : { projectId }
      const res = await fetch('/api/wordpress/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.ok) {
        const who = data.user?.name ? ` (${t.connectedAs}: ${data.user.name})` : ''
        setMessage({ text: `${t.testSuccess}${who}`, ok: true })
      } else {
        setMessage({ text: wpError(data.error), ok: false })
      }
      loadConnection()
    } catch {
      setMessage({ text: t.genericError, ok: false })
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/wordpress/connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          siteUrl,
          username,
          // Omit when empty so an update keeps the stored password.
          ...(appPassword ? { applicationPassword: appPassword } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const text = data.reason === 'platform_already_connected' ? t.platformAlreadyConnected : wpError(data.error)
        setMessage({ text, ok: false })
        return
      }
      setConnection(data.connection ?? null)
      setAppPassword('')
      onChanged?.()
      if (data.test?.ok) {
        setMessage({ text: t.testSuccess, ok: true })
        setShowForm(false)
        // K1 — a CLEAN connect success may drop the user into the Content Hub. The
        // parent decides (the project page redirects; a Content-Hub mount stays put),
        // so a disconnect (onChanged only) never triggers navigation.
        onConnected?.()
      } else {
        setMessage({ text: data.test?.error ? wpError(data.test.error) : t.statusFailed, ok: false })
      }
    } catch {
      setMessage({ text: t.genericError, ok: false })
    } finally {
      setSaving(false)
    }
  }

  async function handleDisconnect() {
    const ok = await confirm({
      title: t.confirmDisconnectTitle,
      body: t.confirmDisconnectBody,
      confirmLabel: t.confirmDisconnectAction,
      tone: 'danger',
    })
    if (!ok) return
    setDisconnecting(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/wordpress/connection?projectId=${projectId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setConnection(null)
        setShowForm(false)
        onChanged?.()
      } else {
        setMessage({ text: t.genericError, ok: false })
      }
    } catch {
      setMessage({ text: t.genericError, ok: false })
    } finally {
      setDisconnecting(false)
    }
  }

  const statusBadge = connection ? (
    connection.connection_status === 'connected' ? (
      <Badge variant="success">{t.statusConnected}</Badge>
    ) : connection.connection_status === 'failed' ? (
      <Badge variant="danger">{t.statusFailed}</Badge>
    ) : (
      <Badge variant="neutral">{t.statusUntested}</Badge>
    )
  ) : null

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="text-section font-semibold text-ink">
          {t.wpConnectionTitle}
        </h3>
        {statusBadge}
      </div>
      <p className="mb-4 max-w-prose text-copy text-muted">{t.wpConnectionHelp}</p>

      {loading ? (
        <Skeleton className="h-12 w-full rounded-inset" />
      ) : !connection && !showForm ? (
        <div className="py-6 text-center">
          <p className="mb-3 text-copy text-body">{t.notConnected}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button size="sm" onClick={openForm} data-wp-connect-button>{t.connectButton}</Button>
            <Button size="sm" variant="secondary" onClick={() => setGuideOpen(true)}>{t.guideButton}</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {connection && !showForm && (
            // Compact connected state: URL + actions on one row; username /
            // last-tested tucked into a collapsed "details" so a set-once
            // connection doesn't dominate the page.
            <div className="rounded-inset border border-line bg-sunk/60 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 max-w-full truncate text-copy font-medium text-ink" dir="ltr" title={connection.site_url}>
                  {connection.site_url}
                </span>
                <div className="ms-auto flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={handleTest} loading={testing} disabled={testing}>
                    {testing ? t.testing : t.testConnection}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={openForm}>
                    {t.editConnection}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleDisconnect}
                    loading={disconnecting}
                    disabled={disconnecting}
                    className="text-bad hover:bg-bad-soft hover:text-bad"
                  >
                    {disconnecting ? t.disconnecting : t.disconnect}
                  </Button>
                </div>
              </div>
              {(connection.wp_username || connection.last_tested_at) && (
                <details className="group mt-2">
                  <summary className="inline-flex cursor-pointer select-none list-none items-center gap-1 text-caption font-medium text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
                    <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform duration-150 ease-snappy group-open:rotate-180" />
                    {t.connectionDetails}
                  </summary>
                  <div className="mt-1.5 space-y-1">
                    <div className="text-caption text-muted">
                      {t.wpUsername}: <span className="font-medium">{connection.wp_username}</span>
                    </div>
                    {connection.last_tested_at && (
                      <div className="text-caption text-muted">
                        {t.lastTestedAt}: {formatDateTime(connection.last_tested_at)}
                      </div>
                    )}
                  </div>
                </details>
              )}
            </div>
          )}

          {showForm && (
            <div className="space-y-4" data-wp-form>
              {!connection && <WpPasswordSteps t={t} siteUrl={siteUrl} />}
              <Input
                label={t.wpSiteUrl}
                type="url"
                placeholder="https://example.com"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
              />
              <Input
                label={t.wpUsername}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
              />
              <Input
                label={t.wpAppPassword}
                type="password"
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
                hint={connection ? t.wpAppPasswordKeep : t.wpAppPasswordHint}
                autoComplete="new-password"
              />
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleTest}
                  loading={testing}
                  disabled={testing || !siteUrl || !username || (!appPassword && !connection)}
                  data-wp-action="test"
                >
                  {testing ? t.testing : t.testConnection}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  loading={saving}
                  disabled={saving || !siteUrl || !username || (!appPassword && !connection)}
                  data-wp-action="save"
                >
                  {saving ? t.saving : t.saveConnection}
                </Button>
              </div>
            </div>
          )}

          {message && (
            <Notice tone={message.ok ? 'ok' : 'bad'}>
              {message.text}
            </Notice>
          )}
        </div>
      )}

      {/* Help-only modal: how to create a WordPress Application Password and
          connect. Pure guidance — no connection logic runs here. */}
      <Modal open={guideOpen} onClose={() => setGuideOpen(false)} title={t.guideTitle} size="md">
        <ol className="list-decimal space-y-2 ps-5 text-copy text-body">
          {t.guideSteps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        <Notice tone="warn" className="mt-4">
          {t.guideWarning}
        </Notice>
        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={() => setGuideOpen(false)}>{t.guideClose}</Button>
        </div>
      </Modal>
      {dialog}
    </Card>
  )
}

/**
 * The page on the merchant's own site where application passwords are made,
 * when the address typed so far is a plain http(s) site address; null otherwise.
 * It is a link the merchant opens themselves, in a new tab, to their own site:
 * never a redirect, and never built from anything but what they typed here.
 */
export function wpProfileHref(siteUrl: string): string | null {
  const raw = siteUrl.trim()
  if (!raw) return null
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password || !url.hostname.includes('.')) return null
  const base = url.pathname.replace(/\/+$/, '')
  return `${url.origin}${base}/wp-admin/profile.php#application-passwords-section`
}

function WpPasswordSteps({ t, siteUrl }: { t: { wpStepsTitle: string; wpSteps: readonly string[]; wpOpenProfile: string }; siteUrl: string }) {
  const href = wpProfileHref(siteUrl)
  return (
    <div className="rounded-inset border border-line bg-sunk/60 px-4 py-3" data-wp-steps>
      <p className="text-caption font-semibold text-ink">{t.wpStepsTitle}</p>
      <ol className="mt-1.5 list-decimal space-y-1 ps-5 text-caption text-body">
        {t.wpSteps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex text-caption font-medium text-action hover:underline">
          {t.wpOpenProfile}
        </a>
      )}
    </div>
  )
}
