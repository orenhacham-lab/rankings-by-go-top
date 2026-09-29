'use client'

/**
 * "Fixes on your site": how approved fixes reach this project's site right now,
 * in one card — the plugin connected, waiting, or dropped (then approvals are
 * marked for manual update, and the card says so), the application password's
 * partial reach, or the webhook. One primary thing to do, at most two buttons.
 */
import { useCallback, useState } from 'react'
import { PlugZap, Plug, Send, TriangleAlert, Wrench } from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import type { FixCapabilities, FixErrorCode } from '@/lib/site-fix/types'
import { postFix } from './useSiteFixes'

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

export default function AutoFixStrip({
  projectId, capabilities, copy, onInstall, onChanged, lastSeen,
}: {
  projectId: string
  capabilities: FixCapabilities
  copy: Copy
  onInstall: () => void
  onChanged: () => Promise<void> | void
  lastSeen: (iso: string) => string
}) {
  const view = stripView(capabilities)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<FixErrorCode | null>(null)
  const text = copy.connection[view]
  const plugin = capabilities.plugin

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
            {error && <p role="alert" className="mt-2 text-caption font-medium text-warn">{copy.errors[error]}</p>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
          {(view === 'pending' || view === 'disconnected') && (
            <Button variant="secondary" onClick={check} loading={checking} data-autofix-check="">{copy.connection.check}</Button>
          )}
          {view !== 'webhook' && (
            <Button
              variant={view === 'connected' || view === 'disconnected' || view === 'pending' ? 'secondary' : 'primary'}
              onClick={onInstall}
              data-autofix-install=""
            >
              {view === 'none' || view === 'appPassword' ? copy.connection.install : view === 'rekey' ? copy.connection.reconnect : copy.connection.manage}
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
