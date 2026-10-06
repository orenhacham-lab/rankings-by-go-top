'use client'

/**
 * Settings › "Automatic fixes": one switch per project, OFF until the owner turns it on.
 * Self-contained (its own read, its own save, its own words) so the settings screen only gives it a
 * place, like the weekly-email card.
 *
 * Turning it on opens the in-app confirmation listing the three types it covers, what it never
 * does, and how every fix is recorded (who turned it on, from which IP). Turning it off saves at
 * once, and applies at once: every automatic fix reads the switch again right before it is written
 * (lib/site-fix/api.ts autoFixProject). WordPress with the Go Top plugin only: a Shopify store gets
 * one line instead of the switch; a site without the plugin gets the switch disabled and a way to
 * the plugin. Renders nothing while the switch's table is not installed or cannot be read.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Sparkles, X } from 'lucide-react'
import SettingsCard from '@/components/settings/SettingsCard'
import { SECTION } from '@/components/settings/anchors'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { formatDate } from '@/lib/i18n/format-date'
import type { FixType } from '@/lib/site-fix/types'
import { cn } from '@/lib/utils'

type Block = 'shopify' | 'read_only' | 'needs_plugin' | 'needs_update' | null
type Ready = { status: 'ready'; on: boolean; enabledAt: string | null; lastRunAt: string | null; canEnable: boolean; block: Block; types: FixType[] }
type Load = { status: 'loading' | 'hidden' } | Ready
type Answer = { ok?: boolean; available?: boolean; state?: string; enabledAt?: string | null; lastRunAt?: string | null; canEnable?: boolean; block?: Block; types?: FixType[] }

const PATH = '/api/site-health/auto-fix'

function readyFrom(body: Answer, prev?: Ready): Ready {
  return {
    status: 'ready', on: body.state === 'on', enabledAt: body.enabledAt ?? null, lastRunAt: body.lastRunAt ?? null,
    canEnable: body.canEnable ?? prev?.canEnable ?? false, block: body.block !== undefined ? body.block : prev?.block ?? null,
    types: body.types ?? prev?.types ?? [],
  }
}

export default function SiteAutoFixCard({ projectId, onShown }: { projectId: string; onShown?: (shown: boolean) => void }) {
  const { language, uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).siteHealth.autofix.auto
  const { confirm, dialog } = useConfirm()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<'saved' | 'failed' | null>(null)

  useEffect(() => {
    let live = true
    fetch(`${PATH}?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => null) as Answer | null
        if (!live) return
        // Not installed or not readable: the card stays out of the way.
        setLoad(res.ok && body?.ok && body.available === true ? readyFrom(body) : { status: 'hidden' })
      })
      .catch(() => { if (live) setLoad({ status: 'hidden' }) })
    return () => { live = false }
  }, [projectId])

  const shown = load.status === 'ready'
  useEffect(() => { onShown?.(shown) }, [shown, onShown])

  if (load.status !== 'ready') return null
  const when = (iso: string) => formatDate(language).dateTime(iso)

  async function change(next: boolean) {
    if (load.status !== 'ready') return
    if (next) {
      const ok = await confirm({
        title: t.confirm.title, body: t.confirm.body, confirmLabel: t.confirm.confirm, size: 'md',
        details: (
          <div className="space-y-4 text-copy">
            <ul className="space-y-1.5" role="list">
              {load.types.map((type) => (
                <li key={type} className="flex items-start gap-2 text-body">
                  <Check size={16} strokeWidth={2.25} aria-hidden="true" className="mt-0.5 shrink-0 text-ok" />
                  <span>{t.types[type as keyof typeof t.types]}</span>
                </li>
              ))}
            </ul>
            <div>
              <p className="font-semibold text-ink">{t.neverTitle}</p>
              <p className="mt-1 flex items-start gap-2 text-muted">
                <X size={16} strokeWidth={2.25} aria-hidden="true" className="mt-0.5 shrink-0" />
                <span>{t.never} {t.homeNote}</span>
              </p>
            </div>
            <p className="rounded-control bg-info-soft px-3 py-2 text-caption text-info">{t.log}</p>
          </div>
        ),
      })
      if (!ok) return
    }
    setBusy(true)
    setNote(null)
    try {
      const res = await fetch(PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next ? { projectId, enabled: true, acknowledged: true, types: load.types } : { projectId, enabled: false }),
      })
      const body = await res.json().catch(() => null) as Answer | null
      if (res.ok && body?.ok) {
        setLoad((cur) => (cur.status === 'ready' ? readyFrom(body, cur) : cur))
        setNote('saved')
      } else {
        setNote('failed')
      }
    } catch {
      setNote('failed')
    } finally {
      setBusy(false)
    }
  }

  const { on, block } = load
  const blockLine = block === 'needs_update' ? t.needsUpdate : block === 'needs_plugin' || block === 'read_only' ? t.needsPlugin : null
  // Off is always possible; on only where the plugin can write every covered type.
  const disabled = busy || (!on && !load.canEnable)

  return (
    <SettingsCard id={SECTION.siteAutoFix} icon={Sparkles} title={t.title} description={t.description}>
      {block === 'shopify' && !on ? (
        <p className="text-copy text-muted" data-site-auto-fix="shopify">{t.shopify}</p>
      ) : (
        <div className="space-y-3" data-site-auto-fix={on ? 'on' : 'off'}>
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span className="text-copy font-semibold text-ink">{t.label}</span>
            <span className="flex items-center gap-2">
              <span className="text-caption text-muted" aria-hidden="true">{on ? t.on : t.off}</span>
              <button type="button" role="switch" aria-checked={on} aria-label={t.label} disabled={disabled}
                onClick={() => void change(!on)}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                  on ? 'bg-action' : 'bg-line-strong',
                )}>
                <span aria-hidden="true" className={cn(
                  'inline-block size-5 rounded-pill bg-surface shadow-control transition-transform duration-150 ease-snappy',
                  on ? 'translate-x-[1.375rem] rtl:-translate-x-[1.375rem]' : 'translate-x-0.5 rtl:-translate-x-0.5',
                )} />
              </button>
            </span>
          </label>
          <div className="space-y-1.5">
            <p className="text-caption font-semibold text-ink">{t.coversTitle}</p>
            <ul className="space-y-1" role="list">
              {load.types.map((type) => (
                <li key={type} className="flex items-start gap-2 text-caption text-body">
                  <Check size={14} strokeWidth={2.25} aria-hidden="true" className="mt-0.5 shrink-0 text-ok" />
                  <span>{t.types[type as keyof typeof t.types]}</span>
                </li>
              ))}
            </ul>
          </div>
          {on && (
            <p className="text-caption text-muted">
              {load.enabledAt ? t.enabledAt(when(load.enabledAt)) : null}
              {load.enabledAt ? <span aria-hidden="true"> · </span> : null}
              {load.lastRunAt ? t.lastRun(when(load.lastRunAt)) : t.noRunYet}
            </p>
          )}
          {blockLine && !on && (
            <p className="rounded-control bg-warn-soft px-3 py-2 text-caption text-warn" data-site-auto-fix-block={block ?? ''}>
              {blockLine}{' '}
              <Link href="/site-health" className="font-semibold underline underline-offset-2 hover:no-underline">{t.toSiteHealth}</Link>
            </p>
          )}
          {note && (
            <p role="status" className={cn('text-caption font-medium', note === 'saved' ? 'text-ok' : 'text-bad')}>
              {note === 'saved' ? t.saved : t.failed}
            </p>
          )}
        </div>
      )}
      {dialog}
    </SettingsCard>
  )
}
