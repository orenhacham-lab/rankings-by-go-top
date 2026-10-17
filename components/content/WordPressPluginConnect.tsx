'use client'

/**
 * Connecting a WordPress site with the GO TOP SEO Bridge plugin: the first way the WordPress panel
 * offers (components/content/WordPressConnectionPanel.tsx). Three numbered steps, one button each:
 *   1. install the plugin from WordPress.org (a link to its public page; no file to download),
 *   2. get a one-time pairing code (POST /api/site-health/plugin {action: 'issue'}) and paste it in
 *      WordPress under Settings > GO TOP SEO,
 *   3. check the connection ({action: 'check'}, a signed /status call to the plugin).
 * The same route and pairing the site-health screen uses (components/site-health/PluginInstallModal.tsx);
 * owner-checked on the server. Every answer is one of our sentences, never the route's code.
 */
import { useCallback, useState } from 'react'
import { ArrowUpRight, Check, Copy } from 'lucide-react'
import Button, { buttonClasses } from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Notice from '@/components/ui/Notice'
import { cn } from '@/lib/utils'
import { postFix } from '@/components/site-health/useSiteFixes'
import { PLUGIN_WPORG_URL } from '@/components/site-health/PluginInstallModal'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'

export type PluginConnectCopy = DashboardDictionary['projectDetail']['contentSection']['pluginConnect']
export type PairErrorKey = keyof PluginConnectCopy['errors']

/** The pairing route's code, as the one sentence the merchant reads. */
export function pairErrorKey(code: string): PairErrorKey {
  if (code === 'off_site') return 'offSite'
  if (code === 'queue_unavailable' || code === 'shopify_readonly') return 'unavailable'
  if (code === 'plugin_not_connected' || code === 'plugin_unreachable' || code === 'plugin_rejected' || code === 'plugin_outdated' || code === 'wordpress_permission') return 'notYet'
  return 'generic'
}

function Step({ n, title, body, done, children }: { n: number; title: string; body: string; done?: boolean; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3" data-plugin-step={n}>
      <span
        aria-hidden="true"
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-full text-caption font-semibold ring-1',
          done ? 'bg-ok-soft text-ok ring-ok/20' : 'bg-surface text-action ring-line shadow-control',
        )}
      >
        {done ? <Check size={14} strokeWidth={2.4} /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-copy font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-caption text-muted text-pretty">{body}</p>
        {children && <div className="mt-2.5">{children}</div>}
      </div>
    </li>
  )
}

export default function WordPressPluginConnect({ projectId, t, onPaired }: {
  projectId: string
  t: PluginConnectCopy
  /** The plugin answered: the parent re-reads the connections (and may open the Content Hub). */
  onPaired: () => void
}) {
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState<null | 'code' | 'check'>(null)
  const [error, setError] = useState<PairErrorKey | null>(null)
  const [done, setDone] = useState(false)

  const makeCode = useCallback(async () => {
    if (busy) return
    setBusy('code'); setError(null); setCopied(false)
    const issued = await postFix<{ code: string }>('/api/site-health/plugin', { projectId, action: 'issue' })
    setBusy(null)
    if (!issued.ok) { setError(pairErrorKey(issued.code)); return }
    setCode(issued.code)
  }, [busy, projectId])

  const check = useCallback(async () => {
    if (busy) return
    setBusy('check'); setError(null)
    const r = await postFix<{ plugin?: unknown }>('/api/site-health/plugin', { projectId, action: 'check' })
    setBusy(null)
    if (!r.ok) { setError(pairErrorKey(r.code)); return }
    setDone(true)
    setCode(null)
    onPaired()
  }, [busy, projectId, onPaired])

  const copyCode = useCallback(async () => {
    if (!code) return
    try { await navigator.clipboard.writeText(code); setCopied(true) } catch { setCopied(false) }
  }, [code])

  return (
    <div className="rounded-inset border border-action/30 bg-action-soft/20 p-4 sm:p-5" data-wp-plugin-steps="">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-copy font-semibold text-ink">{t.title}</p>
        <Badge variant="success">{t.badge}</Badge>
      </div>
      <p className="mt-1 max-w-prose text-caption text-body">{t.intro}</p>
      <ol className="mt-4 space-y-4" role="list">
        <Step n={1} title={t.step1Title} body={t.step1Body}>
          <a href={PLUGIN_WPORG_URL} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: 'secondary', size: 'sm' })} data-plugin-wporg="">
            {t.step1Link}
            <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" className="rtl:-scale-x-100" />
          </a>
        </Step>
        <Step n={2} title={t.step2Title} body={t.step2Body} done={!!code || done}>
          <Button size="sm" variant={code ? 'ghost' : 'primary'} onClick={makeCode} loading={busy === 'code'} disabled={!!busy} data-plugin-code="">
            {code ? t.newCode : t.getCode}
          </Button>
          {code && (
            <div className="mt-3 rounded-inset border border-line bg-surface p-3" data-plugin-pairing-code="">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <code dir="ltr" className="min-w-0 flex-1 select-all break-all rounded-control bg-sunk px-3 py-2 font-mono text-caption text-ink ring-1 ring-line">{code}</code>
                <Button variant="secondary" size="sm" onClick={copyCode} aria-live="polite">
                  {copied ? <Check size={14} strokeWidth={2.4} aria-hidden="true" /> : <Copy size={14} strokeWidth={2} aria-hidden="true" />}
                  {copied ? t.copied : t.copy}
                </Button>
              </div>
              <p className="mt-2 text-caption text-muted">{t.codeNote}</p>
            </div>
          )}
        </Step>
        <Step n={3} title={t.step3Title} body={t.step3Body} done={done}>
          <Button size="sm" variant={code ? 'primary' : 'secondary'} onClick={check} loading={busy === 'check'} disabled={!!busy || done} data-plugin-check="">
            {busy === 'check' ? t.checking : t.check}
          </Button>
        </Step>
      </ol>
      {error && <Notice tone={error === 'notYet' ? 'warn' : 'bad'} className="mt-4">{t.errors[error]}</Notice>}
      {done && <Notice tone="ok" className="mt-4">{t.connected}</Notice>}
    </div>
  )
}
