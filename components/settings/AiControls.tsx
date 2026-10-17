'use client'

import { useId, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import type { Locale } from '@/lib/i18n/locales'
import { fill, formatWait, redetectNoticeAction, type NoticeAction, type RedetectNotice } from '@/lib/project-settings/view'
import Notice, { type NoticeTone } from './Notice'
import { fillRich } from './copy'

type Copy = DashboardDictionary['projectSettings']

/**
 * A notice's one action as a button: plans, a page refresh, a retry or a scan
 * of the site. An action the caller has no handler for is left out, so a notice
 * never offers something that does nothing.
 */
export function useNoticeAction(t: Copy, handlers: { retry?: () => void; rescan?: () => void }) {
  const router = useRouter()
  return (action: NoticeAction): { label: string; onClick: () => void } | null => {
    switch (action) {
      case 'plans':
        return { label: t.scan.actions.plans, onClick: () => router.push('/billing') }
      case 'refresh':
        return { label: t.scan.actions.refresh, onClick: () => window.location.reload() }
      case 'retry':
        return handlers.retry ? { label: t.scan.actions.retry, onClick: handlers.retry } : null
      case 'rescan':
        return handlers.rescan ? { label: t.scan.actions.rescan, onClick: handlers.rescan } : null
      default:
        return null
    }
  }
}

/** Every answer of "detect again with AI" as one sentence, in the screen's words. */
export function redetectCopy(notice: RedetectNotice, t: Copy, locale: Locale): { tone: NoticeTone; text: string } {
  const n = t.ai.notices
  switch (notice.kind) {
    case 'scan_required':
      return { tone: 'info', text: n.scan_required }
    case 'run_in_progress':
      return { tone: 'info', text: n.run_in_progress }
    case 'in_progress':
      return { tone: 'info', text: n.in_progress }
    case 'daily_cap':
      return { tone: 'wait', text: fill(n.daily_cap, { wait: formatWait(notice.wait, locale) }) }
    case 'entitlement':
      return { tone: 'info', text: n.entitlement }
    case 'signed_out':
      return { tone: 'bad', text: n.signed_out }
    case 'unavailable':
      return { tone: 'bad', text: n.unavailable }
    default:
      return { tone: 'bad', text: n.failed }
  }
}

/** The section's "detect again with AI" button, beside its title. */
export function RedetectButton({
  working,
  busyScan,
  onClick,
  t,
}: {
  working: boolean
  /** A scan of the site is running: it is about to fill these fields itself. */
  busyScan: boolean
  onClick: () => void
  t: Copy
}) {
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={onClick}
      loading={working}
      disabled={busyScan}
      title={busyScan ? t.ai.busyScan : undefined}
      data-redetect
    >
      {!working && <Sparkles className="size-4 text-action" aria-hidden />}
      {working ? t.ai.working : t.ai.button}
      {busyScan && <span className="sr-only">. {t.ai.busyScan}</span>}
    </Button>
  )
}

/** What "detect again with AI" answered, when it is not suggestions. */
export function RedetectNoticeView({
  notice,
  t,
  locale,
  onRescan,
  onDismiss,
}: {
  notice: RedetectNotice
  t: Copy
  locale: Locale
  onRescan?: () => void
  onDismiss: () => void
}) {
  const actionFor = useNoticeAction(t, { rescan: onRescan })
  const { tone, text } = redetectCopy(notice, t, locale)
  return (
    <Notice tone={tone} action={actionFor(redetectNoticeAction(notice))} onDismiss={onDismiss}>
      {text}
    </Notice>
  )
}

export type SuggestionRow = {
  key: string
  /** The field's name. */
  label: string
  /** The suggestion, as it would go into the form. */
  value: ReactNode
  /** What the form holds now; null when it is empty. Left out for a new list item. */
  current?: ReactNode | null
  /** Rows of the 'new' group count against `room`. */
  group?: 'new'
}

/**
 * The model's suggestions, each against what the form holds now, for the owner
 * to pick from. Picking puts them into the form and saves nothing: the card's
 * own save does that, and makes them the owner's values.
 */
export function SuggestionsPanel({
  rows,
  room,
  footnote,
  onApply,
  onDismiss,
  t,
}: {
  rows: SuggestionRow[]
  /** How many rows of the 'new' group fit (free places in a list). */
  room?: number
  footnote?: ReactNode
  onApply: (keys: string[]) => void
  onDismiss: () => void
  t: Copy
}) {
  const titleId = useId()
  const [chosen, setChosen] = useState<Set<string>>(() => {
    let left = room ?? Infinity
    const out = new Set<string>()
    for (const row of rows) {
      if (row.group === 'new') {
        if (left <= 0) continue
        left--
      }
      out.add(row.key)
    }
    return out
  })

  if (rows.length === 0) {
    return (
      <Notice tone="info" onDismiss={onDismiss}>
        {t.ai.nothingNew}
      </Notice>
    )
  }

  const newChosen = rows.filter((r) => r.group === 'new' && chosen.has(r.key)).length
  const full = room !== undefined && newChosen >= room
  const toggle = (key: string) =>
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div
      role="group"
      aria-labelledby={titleId}
      data-suggestions
      className="rounded-inset border border-line bg-sunk p-4 motion-safe:animate-pop-in"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-inset bg-action-soft text-action">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0">
          <p id={titleId} className="text-copy font-semibold text-ink">{t.ai.panelTitle}</p>
          <p className="text-caption text-muted">{t.ai.panelBody}</p>
        </div>
      </div>

      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-inset border border-line bg-surface">
        {rows.map((row) => {
          const on = chosen.has(row.key)
          const locked = !on && row.group === 'new' && full
          return (
            <li key={row.key}>
              <div
                className={
                  'flex items-start gap-3 px-4 py-3 transition-colors duration-150 ease-snappy ' +
                  (locked ? 'opacity-50' : 'hover:bg-sunk/60')
                }
              >
                <span className="flex h-6 items-center">
                  <Checkbox
                    id={`${titleId}-${row.key}`}
                    checked={on}
                    disabled={locked}
                    onChange={() => toggle(row.key)}
                  />
                </span>
                <label htmlFor={`${titleId}-${row.key}`} className={'min-w-0 flex-1 ' + (locked ? 'cursor-not-allowed' : 'cursor-pointer')}>
                  <span className="block text-caption font-medium text-muted">{row.label}</span>
                  <span className="block break-words text-copy text-ink">{row.value}</span>
                  {row.current !== undefined && (
                    <span className="mt-0.5 block break-words text-caption text-muted">
                      {fillRich(t.ai.now, { value: row.current ?? t.ai.empty })}
                    </span>
                  )}
                </label>
              </div>
            </li>
          )
        })}
      </ul>

      {footnote && <p className="mt-2 text-caption text-muted">{footnote}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => onApply(rows.filter((r) => chosen.has(r.key)).map((r) => r.key))} disabled={chosen.size === 0}>
          {t.ai.useSelected}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          {t.ai.dismiss}
        </Button>
      </div>
    </div>
  )
}
