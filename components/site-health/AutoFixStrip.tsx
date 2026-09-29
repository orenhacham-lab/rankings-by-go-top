'use client'

/**
 * "Fixes on your site": how approved fixes reach this project's site right now,
 * in one card — the plugin connected, waiting, or dropped (then approvals are
 * marked for manual update, and the card says so), the application password's
 * partial reach, or the webhook. One primary thing to do, at most two buttons.
 *
 * With the plugin connected, the one primary button is "Fix {n} safe items for me" (./useSafeFixes:
 * Google titles, Google descriptions and image descriptions only, one confirmation listing every
 * change), which turns into a progress bar while the batch runs and into a summary when it is done.
 * A plugin older than the latest version keeps working as it is; the card says a new version adds
 * fixes, and "Manage the plugin" becomes "Update the plugin".
 */
import { useCallback, useState } from 'react'
import { PlugZap, Plug, Send, Sparkles, TriangleAlert, Wrench } from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import { PLUGIN_LATEST_VERSION, versionAtLeast, type FixCapabilities, type FixErrorCode } from '@/lib/site-fix/types'
import { postFix } from './useSiteFixes'
import type { SafePhase } from './useSafeFixes'

type Copy = DashboardDictionary['siteHealth']['autofix']
type View = 'none' | 'appPassword' | 'pending' | 'connected' | 'disconnected' | 'rekey' | 'webhook'

export function stripView(c: FixCapabilities): View {
  if (c.plugin.state === 'connected') return 'connected'
  // The key cannot be read: checking again cannot help, only a new pairing code can ("connect again").
  if (c.plugin.state === 'disconnected') return c.plugin.rekey ? 'rekey' : 'disconnected'
  if (c.plugin.state === 'pending') return 'pending'
  if (c.webhook && !c.wordpress) return 'webhook'
  return c.appPassword ? 'appPassword' : 'none'
}

/** The newer plugin version the site could install, or null when it runs the latest (or is not connected). */
export function pluginUpdateFor(c: FixCapabilities): string | null {
  if (c.plugin.state !== 'connected') return null
  const latest = c.pluginLatest ?? PLUGIN_LATEST_VERSION
  return versionAtLeast(c.plugin.version, latest) ? null : latest
}

export interface SafeFixesStrip {
  count: number
  phase: SafePhase
  start: () => void
  onRecheck: () => void
  onOpenQueue: () => void
}

export default function AutoFixStrip({
  projectId, capabilities, copy, onInstall, onChanged, lastSeen, safe,
}: {
  projectId: string
  capabilities: FixCapabilities
  copy: Copy
  onInstall: () => void
  onChanged: () => Promise<void> | void
  lastSeen: (iso: string) => string
  /** "Fix {n} safe items for me": only with the plugin connected. */
  safe?: SafeFixesStrip | null
}) {
  const view = stripView(capabilities)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<FixErrorCode | null>(null)
  const text = copy.connection[view]
  const plugin = capabilities.plugin
  const update = pluginUpdateFor(capabilities)
  const bulk = view === 'connected' && safe ? safe : null

  const check = useCallback(async () => {
    if (checking) return
    setChecking(true); setError(null)
    const r = await postFix<{ plugin: unknown }>('/api/site-health/plugin', { projectId, action: 'check' })
    setChecking(false)
    if (!r.ok) setError(r.code)
    await onChanged()
  }, [checking, projectId, onChanged])

  const Icon = view === 'connected' ? Plug : view === 'disconnected' ? TriangleAlert : view === 'webhook' ? Send : view === 'pending' ? PlugZap : Wrench
  const warn = view === 'disconnected' || view === 'rekey'

  return (
    <section
      aria-label={copy.connection.label}
      className={cn('rounded-card border bg-surface p-5 shadow-card sm:p-6', warn ? 'border-warn/30' : 'border-line')}
      data-autofix-strip={view}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 gap-4">
          <span
            className={cn(
              'grid size-11 shrink-0 place-items-center rounded-inset ring-1',
              view === 'connected' ? 'bg-ok-soft text-ok ring-ok/20' : warn ? 'bg-warn-soft text-warn ring-warn/20' : 'bg-action-soft text-action ring-action/15',
            )}
            aria-hidden="true"
          >
            <Icon size={20} strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="text-overline font-semibold uppercase tracking-wide text-muted">{copy.connection.label}</p>
            <h2 className="mt-0.5 text-section font-semibold text-ink text-balance">{text.title}</h2>
            <p className="mt-1 max-w-3xl text-copy text-muted text-pretty">{text.body}</p>
            {plugin.state === 'connected' && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {plugin.version && <Badge variant="neutral">{copy.connection.version(plugin.version)}</Badge>}
                {plugin.seoPlugin && <Badge variant="neutral">{copy.connection.seoPlugin[plugin.seoPlugin]}</Badge>}
                {plugin.lastSeenAt && <span className="text-caption text-muted">{copy.connection.lastSeen(lastSeen(plugin.lastSeenAt))}</span>}
              </div>
            )}
            {update && (
              <div className="mt-3 flex gap-2 rounded-inset bg-info-soft px-3 py-2.5 text-caption text-ink" data-plugin-update={update}>
                <Sparkles size={16} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0 text-info" />
                <p><span className="font-semibold">{copy.connection.update.title}. </span>{copy.connection.update.body(update)}</p>
              </div>
            )}
            {bulk && bulk.count === 0 && (bulk.phase.kind === 'idle' || bulk.phase.kind === 'preparing') && (
              <p className="mt-3 text-caption text-muted" data-safe-fixes="none">{copy.bulk.none}</p>
            )}
            {bulk && bulk.phase.kind === 'done' && (
              <div className="mt-3 space-y-1" role="status" data-safe-fixes="done">
                <p className="text-copy font-semibold text-ink">{copy.bulk.summary(bulk.phase.ok, bulk.phase.n)}</p>
                {bulk.phase.failed > 0 && <p className="text-caption text-warn">{copy.bulk.failed(bulk.phase.failed)}</p>}
              </div>
            )}
            {error && <p role="alert" className="mt-2 text-caption font-medium text-warn">{copy.errors[error]}</p>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
          {bulk && bulk.phase.kind === 'running' && (
            <div className="w-full min-w-[14rem] sm:w-64" data-safe-fixes="running">
              <p className="text-caption font-semibold text-ink" aria-live="polite">{copy.bulk.progress(bulk.phase.done, bulk.phase.n)}</p>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={bulk.phase.n}
                aria-valuenow={bulk.phase.done}
                aria-valuetext={copy.bulk.progress(bulk.phase.done, bulk.phase.n)}
                className="mt-1.5 h-2 w-full overflow-hidden rounded-pill bg-sunk"
                dir="ltr"
              >
                <div
                  className="h-full rounded-pill bg-action transition-[width] duration-500 ease-snappy motion-reduce:transition-none"
                  style={{ width: `${Math.round((bulk.phase.done / Math.max(1, bulk.phase.n)) * 100)}%` }}
                />
              </div>
            </div>
          )}
          {bulk && bulk.phase.kind === 'done' && (
            <>
              <Button variant="secondary" onClick={bulk.onRecheck} data-safe-recheck="">{copy.bulk.recheck}</Button>
              <Button variant="ghost" onClick={bulk.onOpenQueue} data-safe-queue="">{copy.bulk.openQueue}</Button>
            </>
          )}
          {bulk && bulk.count > 0 && (bulk.phase.kind === 'idle' || bulk.phase.kind === 'preparing') && (
            <Button onClick={bulk.start} loading={bulk.phase.kind === 'preparing'} data-safe-fixes={bulk.count}>
              {bulk.phase.kind === 'preparing' ? copy.bulk.preparing : copy.bulk.button(bulk.count)}
            </Button>
          )}
          {(view === 'pending' || view === 'disconnected') && (
            <Button variant="secondary" onClick={check} loading={checking} data-autofix-check="">{copy.connection.check}</Button>
          )}
          {view !== 'webhook' && (
            <Button
              variant={view === 'connected' || view === 'disconnected' || view === 'pending' ? 'secondary' : 'primary'}
              onClick={onInstall}
              data-autofix-install=""
            >
              {view === 'none' || view === 'appPassword' ? copy.connection.install : view === 'rekey' ? copy.connection.reconnect : update ? copy.connection.update.action : copy.connection.manage}
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
