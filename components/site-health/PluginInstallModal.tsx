'use client'

/**
 * Installing and pairing the GO TOP SEO Bridge plugin (3.0.0, from WordPress.org, slug
 * go-top-seo-bridge), in two numbered steps: install it from the site's own wp-admin (a search
 * for the plugin, or its WordPress.org page; no file to download), and connect, in one click when
 * the site is already connected by application password, otherwise with a one-time code pasted in
 * the plugin's settings page. Every answer is our own sentence (`siteHealth.autofix.errors`).
 *
 * Connected with an older version (2.x, installed from our zip in the folder gotop-seo-bridge/):
 * the modal becomes "switch to the plugin from WordPress.org". WordPress.org installs into
 * go-top-seo-bridge/, so the two are separate plugins with the same functions: both active is a
 * PHP fatal that WordPress refuses to activate, and DELETING the old one runs its uninstall, which
 * erases the shared options (the pairing key). So: deactivate the old one, install and activate the
 * new one, connect again (3.0.0 also records which administrator connected it, the author of
 * published articles). The steps stay on screen while the new code is pending.
 *
 * The zip (GET /api/site-health/plugin-zip) is no longer linked: it stays served, signed-in only,
 * as the reviewed copy of the PHP the app talks to (a QA guard checks it is current) and as a
 * fallback support can hand to a host that blocks installs from WordPress.org.
 */
import { useCallback, useState } from 'react'
import { ArrowUpRight, Check, Copy, PlugZap, ShieldCheck, Unplug } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button, { buttonClasses } from '@/components/ui/Button'
import Notice from '@/components/ui/Notice'
import Badge from '@/components/ui/Badge'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { cn } from '@/lib/utils'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import { versionAtLeast, type FixCapabilities, type FixErrorCode } from '@/lib/site-fix/types'
import type { useToasts } from '@/components/ui/Toast'
import { postFix } from './useSiteFixes'
import { pluginUpdateFor } from './AutoFixStrip'

type Copy = DashboardDictionary['siteHealth']['autofix']

/** The plugin's page on WordPress.org (approved 3.0.0). */
export const PLUGIN_WPORG_URL = 'https://wordpress.org/plugins/go-top-seo-bridge/'

function Step({ n, title, body, done, children, label }: { n: number; title: string; body: string; done?: boolean; children?: React.ReactNode; label: string }) {
  return (
    <li className="relative flex gap-4">
      <span
        aria-hidden="true"
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-full text-caption font-semibold ring-1',
          done ? 'bg-ok-soft text-ok ring-ok/20' : 'bg-surface text-action ring-line shadow-control',
        )}
      >
        {done ? <Check size={16} strokeWidth={2.4} /> : n}
      </span>
      <div className="min-w-0 flex-1 pb-1">
        <p className="sr-only">{label}</p>
        <p className="text-copy font-semibold text-ink">{title}</p>
        <p className="mt-1 text-copy text-muted text-pretty">{body}</p>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </li>
  )
}

export default function PluginInstallModal({
  projectId, siteUrl, capabilities, copy, toasts, onClose, onChanged,
}: {
  projectId: string
  siteUrl: string
  capabilities: FixCapabilities
  copy: Copy
  toasts: ReturnType<typeof useToasts>
  onClose: () => void
  onChanged: () => Promise<void> | void
}) {
  const { confirm, dialog } = useConfirm()
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState<null | 'auto' | 'code' | 'check' | 'disconnect'>(null)
  const [error, setError] = useState<FixErrorCode | null>(null)
  const plugin = capabilities.plugin
  const connected = plugin.state === 'connected'
  /** The stored key cannot be read: only a new pairing code helps, so "check" waits for one. */
  const rekey = plugin.state === 'disconnected' && !!plugin.rekey
  const admin = `${siteUrl.replace(/\/+$/, '')}/wp-admin`
  const searchUrl = `${admin}/plugin-install.php?s=${encodeURIComponent('GO TOP SEO Bridge')}&tab=search&type=term`
  const pluginsUrl = `${admin}/plugins.php`
  /** Connected with an older version: this modal walks through the switch to WordPress.org. */
  const update = pluginUpdateFor(capabilities)
  /** Fixed when the modal opens, so the steps stay while the new pairing code is pending. */
  const [switching] = useState<{ from: string; to: string } | null>(() =>
    update && plugin.state === 'connected' ? { from: plugin.version ?? '2.0.0', to: update } : null)
  const showSwitch = !!switching && !(connected && !update)

  const connectedNow = useCallback(async () => {
    await onChanged()
    toasts.success(copy.queue.toast.pluginConnected)
  }, [onChanged, toasts, copy.queue.toast.pluginConnected])

  const autoPair = useCallback(async () => {
    if (busy) return
    setBusy('auto'); setError(null)
    const issued = await postFix<{ code: string }>('/api/site-health/plugin', { projectId, action: 'issue' })
    if (!issued.ok) { setBusy(null); setError(issued.code); return }
    const paired = await postFix<{ plugin: unknown }>('/api/site-health/plugin', { projectId, action: 'pair' })
    setBusy(null)
    if (!paired.ok) { setCode(issued.code); setError(paired.code); await onChanged(); return }
    await connectedNow()
  }, [busy, projectId, onChanged, connectedNow])

  const makeCode = useCallback(async () => {
    if (busy) return
    setBusy('code'); setError(null); setCopied(false)
    const issued = await postFix<{ code: string }>('/api/site-health/plugin', { projectId, action: 'issue' })
    setBusy(null)
    if (!issued.ok) { setError(issued.code); return }
    setCode(issued.code)
    await onChanged()
  }, [busy, projectId, onChanged])

  const check = useCallback(async () => {
    if (busy) return
    setBusy('check'); setError(null)
    const r = await postFix<{ plugin?: { version?: string | null } }>('/api/site-health/plugin', { projectId, action: 'check' })
    setBusy(null)
    if (!r.ok) { setError(r.code); await onChanged(); return }
    setCode(null)
    const version = r.plugin?.version ?? null
    const target = switching?.to ?? update
    if (target && version && versionAtLeast(version, target)) {
      await onChanged()
      toasts.success(copy.plugin.update.done(version))
      return
    }
    await connectedNow()
  }, [busy, projectId, onChanged, connectedNow, update, switching, toasts, copy.plugin.update])

  const disconnect = useCallback(async () => {
    if (busy) return
    const ok = await confirm({
      title: copy.plugin.disconnectConfirm.title, body: copy.plugin.disconnectConfirm.body,
      confirmLabel: copy.plugin.disconnectConfirm.confirm, tone: 'danger',
    })
    if (!ok) return
    setBusy('disconnect'); setError(null)
    const r = await postFix<Record<string, never>>('/api/site-health/plugin', { projectId, action: 'disconnect' })
    setBusy(null)
    if (!r.ok) { setError(r.code); return }
    setCode(null)
    await onChanged()
    toasts.success(copy.plugin.disconnected)
  }, [busy, confirm, copy.plugin, projectId, onChanged, toasts])

  const copyCode = useCallback(async () => {
    if (!code) return
    try { await navigator.clipboard.writeText(code); setCopied(true) } catch { setCopied(false) }
  }, [code])

  /** Install from WordPress.org: the site's own plugin search, and the plugin's public page. */
  const installLinks = (
    <div className="flex flex-wrap items-center gap-2">
      <a href={searchUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: 'secondary', size: 'md' })} data-plugin-install="">
        {copy.plugin.install.action}
        <ArrowUpRight size={16} strokeWidth={2} aria-hidden="true" className="rtl:-scale-x-100" />
      </a>
      <a href={PLUGIN_WPORG_URL} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: 'ghost', size: 'md' })} data-plugin-wporg="">
        {copy.plugin.install.page}
        <ArrowUpRight size={16} strokeWidth={2} aria-hidden="true" className="rtl:-scale-x-100" />
      </a>
    </div>
  )

  const pairBlock = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {capabilities.appPassword && (
          <Button onClick={autoPair} loading={busy === 'auto'} disabled={!!busy} data-plugin-autopair="">
            {busy !== 'auto' && <PlugZap size={16} strokeWidth={2} aria-hidden="true" />}
            {copy.plugin.pair.autoAction}
          </Button>
        )}
        <Button variant={capabilities.appPassword ? 'ghost' : 'primary'} onClick={makeCode} loading={busy === 'code'} disabled={!!busy} data-plugin-code="">
          {code ? copy.plugin.pair.newCode : capabilities.appPassword ? copy.plugin.pair.orCode : copy.plugin.pair.makeCode}
        </Button>
      </div>
      {code && (
        <div className="mt-4 rounded-inset border border-action/30 bg-action-soft/40 p-4" data-plugin-pairing-code="">
          <p className="text-overline font-semibold uppercase tracking-wide text-action">{copy.plugin.pair.codeLabel}</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code dir="ltr" className="min-w-0 flex-1 select-all break-all rounded-control bg-surface px-3 py-2 font-mono text-caption text-ink ring-1 ring-line">{code}</code>
            <Button variant="secondary" size="sm" onClick={copyCode} aria-live="polite">
              {copied ? <Check size={14} strokeWidth={2.4} aria-hidden="true" /> : <Copy size={14} strokeWidth={2} aria-hidden="true" />}
              {copied ? copy.plugin.pair.copied : copy.plugin.pair.copy}
            </Button>
          </div>
          <p className="mt-2 text-caption text-muted">{copy.plugin.pair.codeNote}</p>
        </div>
      )}
    </>
  )

  return (
    <Modal open onClose={busy ? () => {} : onClose} title={showSwitch ? copy.plugin.update.title : copy.plugin.title} size="lg">
      <div className="space-y-6" data-plugin-modal={plugin.state}>
        <div className="flex gap-3 rounded-inset border border-line bg-sunk/50 p-4">
          <ShieldCheck size={20} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0 text-action" />
          <p className="text-copy text-body text-pretty">{copy.plugin.intro}</p>
        </div>

        {rekey && <Notice tone="warn">{copy.plugin.rekeyNotice}</Notice>}

        {showSwitch && switching ? (
          <div className="space-y-5" data-plugin-update={switching.to}>
            <Notice tone="info">{copy.plugin.update.notice(switching.from, switching.to)}</Notice>
            <ol className="space-y-6" role="list">
              <Step n={1} label={copy.plugin.step(1)} title={copy.plugin.update.deactivate.title} body={copy.plugin.update.deactivate.body}>
                <a href={pluginsUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: 'secondary', size: 'md' })} data-plugin-deactivate="">
                  {copy.plugin.update.deactivate.action}
                  <ArrowUpRight size={16} strokeWidth={2} aria-hidden="true" className="rtl:-scale-x-100" />
                </a>
              </Step>
              <Step n={2} label={copy.plugin.step(2)} title={copy.plugin.update.install.title} body={copy.plugin.update.install.body}>
                {installLinks}
              </Step>
              <Step n={3} label={copy.plugin.step(3)} title={copy.plugin.update.pair.title} body={capabilities.appPassword ? copy.plugin.pair.auto : copy.plugin.pair.code}>
                {pairBlock}
              </Step>
            </ol>
          </div>
        ) : connected ? (
          <div className="space-y-4">
            <Notice tone="ok">{copy.plugin.connected}</Notice>
            <div className="flex flex-wrap items-center gap-2">
              {plugin.version && <Badge variant="neutral">{copy.connection.version(plugin.version)}</Badge>}
              {plugin.seoPlugin && <Badge variant="neutral">{copy.connection.seoPlugin[plugin.seoPlugin]}</Badge>}
            </div>
          </div>
        ) : (
          <ol className="space-y-6" role="list">
            <Step n={1} label={copy.plugin.step(1)} title={copy.plugin.install.title} body={copy.plugin.install.body}>
              {installLinks}
            </Step>
            <Step n={2} label={copy.plugin.step(2)} title={copy.plugin.pair.title} body={capabilities.appPassword ? copy.plugin.pair.auto : copy.plugin.pair.code}>
              {pairBlock}
            </Step>
          </ol>
        )}

        {error && <Notice tone={error === 'plugin_outdated' || error === 'plugin_not_connected' ? 'warn' : 'bad'}>{copy.errors[error]}</Notice>}
        {busy === 'check' && <p role="status" className="text-caption text-muted">{copy.plugin.checking}</p>}

        <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {plugin.state !== 'none' && (
              <Button variant="ghost" onClick={disconnect} loading={busy === 'disconnect'} disabled={!!busy} data-plugin-disconnect="">
                {busy !== 'disconnect' && <Unplug size={16} strokeWidth={2} aria-hidden="true" />}
                {copy.plugin.disconnect}
              </Button>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="ghost" onClick={onClose} disabled={!!busy}>{copy.plugin.close}</Button>
            {((!connected && plugin.state !== 'none' && (!rekey || !!code)) || (connected && !!update)) && (
              <Button onClick={check} loading={busy === 'check'} disabled={!!busy} data-plugin-check="">{copy.connection.check}</Button>
            )}
          </div>
        </div>
      </div>
      {dialog}
    </Modal>
  )
}
