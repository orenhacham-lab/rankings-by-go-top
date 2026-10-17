'use client'

/**
 * Settings › "Email reminders": one switch per project, ON by default (a service message:
 * it only ever mentions articles waiting for the owner's OK), with the unsubscribe link in
 * every email doing the same thing. Self-contained (its own read, save and words). Renders
 * nothing while the reminder table is not installed, so it never offers a switch that does
 * nothing.
 */
import { useEffect, useState } from 'react'
import { BellRing } from 'lucide-react'
import SettingsCard from '@/components/settings/SettingsCard'
import type { PublicLocale } from '@/lib/i18n/locales'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { cn } from '@/lib/utils'

export const REMINDER_EMAILS_SECTION = 'reminder-emails'

type Load = { status: 'loading' | 'hidden' } | { status: 'ready'; on: boolean }

export default function ReminderEmailsCard({ projectId, uiLocale }: { projectId: string; uiLocale: PublicLocale }) {
  const t = getDashboardDictionary(uiLocale).reminders
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<'saved' | 'failed' | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/reminders/preferences?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => null) as { ok?: boolean; available?: boolean; enabled?: boolean } | null
        if (!live) return
        setLoad(res.ok && body?.ok && body.available ? { status: 'ready', on: body.enabled !== false } : { status: 'hidden' })
      })
      .catch(() => { if (live) setLoad({ status: 'hidden' }) })
    return () => { live = false }
  }, [projectId])

  if (load.status !== 'ready') return null

  async function change(next: boolean) {
    setBusy(true)
    setNote(null)
    try {
      const res = await fetch('/api/reminders/preferences', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, enabled: next }),
      })
      const body = await res.json().catch(() => null) as { ok?: boolean; enabled?: boolean } | null
      if (res.ok && body?.ok) { setLoad({ status: 'ready', on: body.enabled === true }); setNote('saved') }
      else setNote('failed')
    } catch {
      setNote('failed')
    } finally {
      setBusy(false)
    }
  }

  const on = load.on
  return (
    <SettingsCard id={REMINDER_EMAILS_SECTION} icon={BellRing} title={t.settingsTitle} description={t.settingsDescription}>
      <div className="space-y-3">
        <label className="flex cursor-pointer items-center justify-between gap-4">
          <span className="text-copy font-semibold text-ink">{t.settingsLabel}</span>
          <span className="flex items-center gap-2">
            <span className="text-caption text-muted" aria-hidden="true">{on ? t.on : t.off}</span>
            <button type="button" role="switch" aria-checked={on} aria-label={t.settingsLabel} disabled={busy}
              data-reminder-emails={on ? 'on' : 'off'}
              onClick={() => change(!on)}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                'disabled:cursor-wait disabled:opacity-60',
                on ? 'bg-action' : 'bg-line-strong',
              )}>
              <span aria-hidden="true" className={cn(
                'inline-block size-5 rounded-pill bg-surface shadow-control transition-transform duration-150 ease-snappy',
                on ? 'translate-x-[1.375rem] rtl:-translate-x-[1.375rem]' : 'translate-x-0.5 rtl:-translate-x-0.5',
              )} />
            </button>
          </span>
        </label>
        {note && (
          <p role="status" className={cn('text-caption font-medium', note === 'saved' ? 'text-ok' : 'text-bad')}>
            {note === 'saved' ? t.saved : t.failed}
          </p>
        )}
      </div>
    </SettingsCard>
  )
}
