'use client'

/**
 * WordPress connection panel — Content module Phase 1.
 *
 * Connect a WordPress site to the project via Application Password:
 * URL + username + password → test → save (encrypted server-side).
 * The password is write-only: it is never returned or displayed again.
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
  site_url: string
  wp_username: string
  connection_status: 'untested' | 'connected' | 'failed'
  last_tested_at: string | null
}

export default function WordPressConnectionPanel({ projectId }: { projectId: string }) {
  const { language } = useDashboardLanguage()
  const t = useMemo(() => getDashboardDictionary(language).projectDetail.contentSection, [language])

  const [loading, setLoading] = useState(true)
  const [connection, setConnection] = useState<SanitizedConnection | null>(null)
  const [showForm, setShowForm] = useState(false)

  const [siteUrl, setSiteUrl] = useState('')
  const [username, setUsername] = useState('')
  const [appPassword, setAppPassword] = useState('')

  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

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
        setMessage({ text: data.error || t.genericError, ok: false })
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
        setMessage({ text: data.error || t.genericError, ok: false })
        return
      }
      setConnection(data.connection ?? null)
      setAppPassword('')
      if (data.test?.ok) {
        setMessage({ text: t.testSuccess, ok: true })
        setShowForm(false)
      } else {
        setMessage({ text: data.test?.error || t.statusFailed, ok: false })
      }
    } catch {
      setMessage({ text: t.genericError, ok: false })
    } finally {
      setSaving(false)
    }
  }

  async function handleDisconnect() {
    if (!window.confirm(t.confirmDisconnect)) return
    setDisconnecting(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/wordpress/connection?projectId=${projectId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setConnection(null)
        setShowForm(false)
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
    <Card className="hover:translate-y-0">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
          {t.wpConnectionTitle}
        </h3>
        {statusBadge}
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t.wpConnectionHelp}</p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-4">
          <span className="inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !connection && !showForm ? (
        <div className="text-center py-6">
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">{t.notConnected}</p>
          <Button size="sm" onClick={openForm}>{t.connectButton}</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {connection && !showForm && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-2">
              <div className="font-mono text-sm text-slate-800 dark:text-slate-100" dir="ltr">
                {connection.site_url}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {t.wpUsername}: <span className="font-medium">{connection.wp_username}</span>
              </div>
              {connection.last_tested_at && (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {t.lastTestedAt}: {formatDateTime(connection.last_tested_at)}
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={handleTest} loading={testing} disabled={testing}>
                  {testing ? t.testing : t.testConnection}
                </Button>
                <Button size="sm" variant="outline" onClick={openForm}>
                  {t.wpConnectionTitle}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDisconnect}
                  loading={disconnecting}
                  disabled={disconnecting}
                  className="text-red-600 dark:text-red-400 border-red-200 dark:border-red-800"
                >
                  {disconnecting ? t.disconnecting : t.disconnect}
                </Button>
              </div>
            </div>
          )}

          {showForm && (
            <div className="space-y-3">
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
                  variant="outline"
                  onClick={handleTest}
                  loading={testing}
                  disabled={testing || !siteUrl || !username || (!appPassword && !connection)}
                >
                  {testing ? t.testing : t.testConnection}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  loading={saving}
                  disabled={saving || !siteUrl || !username || (!appPassword && !connection)}
                >
                  {saving ? t.saving : t.saveConnection}
                </Button>
              </div>
            </div>
          )}

          {message && (
            <div
              className={`text-sm rounded-lg px-3 py-2 border ${
                message.ok
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
              }`}
            >
              {message.text}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
