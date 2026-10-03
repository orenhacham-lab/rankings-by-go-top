'use client'

/**
 * Settings › "Weekly email summary": one switch per project, OFF until the owner
 * turns it on. Self-contained (its own read, its own save, its own words) so the
 * settings screen only gives it a place.
 *
 * STORING THE SWITCH SENDS NOTHING. No sender is wired
 * (lib/reports/monthly/weekly-email.ts), and the card says so plainly.
 * Renders nothing while the preference table is not installed.
 */
import { useEffect, useState } from 'react'
import { Mail } from 'lucide-react'
import SettingsCard from '@/components/settings/SettingsCard'
import type { PublicLocale } from '@/lib/i18n/locales'
import { cn } from '@/lib/utils'
import { monthlyCopy } from './copy'

export const WEEKLY_EMAIL_SECTION = 'weekly-email'

type Load = { status: 'loading' | 'hidden' } | { status: 'ready'; on: boolean }

export function WeeklyEmailSwitch({ on, busy, onChange, language, note }: {
  on: boolean
  busy: boolean
  onChange: (next: boolean) => void
  language: PublicLocale
  note: 'saved' | 'failed' | null
}) {
  const t = monthlyCopy(language).email
  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center justify-between gap-4">
        <span className="text-copy font-semibold text-ink">{t.label}</span>
        <span className="flex items-center gap-2">
          <span className="text-caption text-muted" aria-hidden="true">{on ? t.on : t.off}</span>
          <button type="button" role="switch" aria-checked={on} aria-label={t.label} disabled={busy}
            data-weekly-email={on ? 'on' : 'off'}
            onClick={() => onChange(!on)}
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
      <p className="rounded-control bg-info-soft px-3 py-2 text-caption text-info">{t.notLive}</p>
      {note && (
        <p role="status" className={cn('text-caption font-medium', note === 'saved' ? 'text-ok' : 'text-bad')}>
          {note === 'saved' ? t.saved : t.failed}
        </p>
      )}
    </div>
  )
}

export default function WeeklyEmailCard({ projectId, language }: { projectId: string; language: PublicLocale }) {
  const t = monthlyCopy(language).email
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<'saved' | 'failed' | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/reports/monthly/preferences?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => null) as { ok?: boolean; weeklyEmailSummary?: boolean } | null
        if (!live) return
        // Not installed or not readable: the card stays out of the way.
        setLoad(res.ok && body?.ok ? { status: 'ready', on: body.weeklyEmailSummary === true } : { status: 'hidden' })
      })
      .catch(() => { if (live) setLoad({ status: 'hidden' }) })
    return () => { live = false }
  }, [projectId])

  if (load.status !== 'ready') return null

  async function change(next: boolean) {
    setBusy(true)
    setNote(null)
    try {
      const res = await fetch('/api/reports/monthly/preferences', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, weeklyEmailSummary: next }),
      })
      const body = await res.json().catch(() => null) as { ok?: boolean; weeklyEmailSummary?: boolean } | null
      if (res.ok && body?.ok) {
        setLoad({ status: 'ready', on: body.weeklyEmailSummary === true })
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

  return (
    <SettingsCard id={WEEKLY_EMAIL_SECTION} icon={Mail} title={t.title} description={t.description}>
      <WeeklyEmailSwitch on={load.on} busy={busy} onChange={change} language={language} note={note} />
    </SettingsCard>
  )
}
