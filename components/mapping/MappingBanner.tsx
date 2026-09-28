'use client'

/**
 * The mapping banner, above the dashboard's opening card: one invitation to map
 * the site, the same on every older project (plan, part B §3).
 *
 *   none     "Let's get to know your site better", one sentence, "Run the mapping"
 *            and "Later" (which hides it for a week, on this browser only)
 *   running  the four steps of the mapping, moving without a refresh
 *   failed   says so plainly, keeps the owner's data, and offers another try
 *   done     nothing: a toast says it finished and the areas fill in
 *
 * Shown only when the mapping can be offered at all (lib/project-mapping/state.ts
 * `available`): the seed route answers exactly when the settings screen's scan
 * band is shown, so production is unchanged until the scan's flag is on.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, Loader2, RefreshCw, Telescope, TriangleAlert } from 'lucide-react'
import Button from '@/components/ui/Button'
import Notice from '@/components/settings/Notice'
import { rescanCopy } from '@/components/settings/ScanBand'
import { useNoticeAction } from '@/components/settings/AiControls'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { Locale } from '@/lib/i18n/locales'
import { summaryHref } from '@/lib/onboarding/links'
import { snoozeKey, snoozed, MAPPING_STEPS, type Mapping } from '@/lib/project-mapping/state'
import { rescanNoticeAction } from '@/lib/project-settings/view'
import { cn } from '@/lib/utils'
import type { MappingControl } from './useMapping'

function readSnooze(projectId: string): string | null {
  try {
    return window.localStorage.getItem(snoozeKey(projectId))
  } catch {
    return null
  }
}

function writeSnooze(projectId: string, at: number): void {
  try {
    window.localStorage.setItem(snoozeKey(projectId), String(at))
  } catch {
    // Private mode or blocked storage: "later" lasts until the page is left.
  }
}

/** The four steps of a running mapping, each with its state in words. */
export function MappingSteps({ mapping, locale }: { mapping: Mapping; locale: Locale }) {
  const dict = getDashboardDictionary(locale)
  const m = dict.mapping
  if (mapping.available !== true) return null
  const done = mapping.steps.filter((s) => s.state === 'done').length
  return (
    <div className="min-w-0">
      <div
        role="progressbar"
        aria-label={m.progressLabel}
        aria-valuemin={0}
        aria-valuemax={MAPPING_STEPS.length}
        aria-valuenow={done}
        className="h-1.5 overflow-hidden rounded-pill bg-surface"
      >
        <div className="h-full rounded-pill bg-action transition-[width] duration-500" style={{ width: `${Math.max(6, (done / MAPPING_STEPS.length) * 100)}%` }} />
      </div>
      <ol className="mt-3 grid gap-2 sm:grid-cols-4">
        {mapping.steps.map((s) => (
          <li key={s.step} data-mapping-step={s.step} data-state={s.state} className="flex min-w-0 items-center gap-2 text-caption">
            <span
              aria-hidden
              className={cn(
                'grid size-5 shrink-0 place-items-center rounded-pill',
                s.state === 'done' ? 'bg-action text-action-ink' : s.state === 'running' ? 'bg-surface text-action ring-1 ring-action/40' : 'bg-surface text-muted ring-1 ring-line',
              )}
            >
              {s.state === 'done' ? <Check size={12} strokeWidth={3} /> : s.state === 'running' ? <Loader2 size={12} className="motion-safe:animate-spin" /> : null}
            </span>
            <span className={cn('min-w-0 truncate', s.state === 'pending' ? 'text-muted' : 'font-medium text-ink')}>
              {dict.seedOnboarding.progress.steps[s.step].title}
            </span>
            <span className="sr-only">{s.state === 'done' ? m.stepDone : s.state === 'running' ? m.stepRunning : m.stepPending}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/**
 * What the last start came to (a refusal, a slow run), in the settings' own
 * words, for a screen that offers the mapping without the banner (the AI tab's
 * card, the research tab's start). Nothing when there is nothing to say.
 */
export function MappingNotice({ control, locale }: { control: MappingControl; locale: Locale }) {
  const dict = getDashboardDictionary(locale)
  const { notice, start, dismiss } = control
  const actionFor = useNoticeAction(dict.projectSettings, { retry: () => void start() })
  const noticeCopy = notice && notice.kind !== 'finished' ? rescanCopy(notice, dict.projectSettings, locale) : null
  if (!noticeCopy || !notice) return null
  return (
    <Notice tone={noticeCopy.tone} action={actionFor(rescanNoticeAction(notice))} onDismiss={dismiss}>
      {noticeCopy.text}
    </Notice>
  )
}

export default function MappingBanner({ projectId, control, locale }: { projectId: string; control: MappingControl; locale: Locale }) {
  const dict = getDashboardDictionary(locale)
  const m = dict.mapping
  const { mapping, starting, notice, start, dismiss } = control
  const Arrow = locale === 'he' ? ArrowLeft : ArrowRight
  // This browser's "later", read when the project (or the choice) changes. The
  // server reads nothing (no window), and the banner renders nothing before the
  // seed route has answered on the client, so the two never disagree on screen.
  const [laterAt, setLaterAt] = useState<{ projectId: string; at: number } | null>(null)
  const hidden = useMemo(
    () => (laterAt?.projectId === projectId ? true : snoozed(typeof window === 'undefined' ? null : readSnooze(projectId), new Date())),
    [projectId, laterAt],
  )
  const actionFor = useNoticeAction(dict.projectSettings, { retry: () => void start() })

  if (mapping.available !== true) return null
  const state = mapping.state
  // "Later" hides the invitation, never a mapping that is running or a notice about one.
  const invite = state === 'none' || state === 'failed'
  if (!invite && state !== 'running' && !notice) return null
  if (invite && hidden && !notice) return null

  const noticeCopy = notice && notice.kind !== 'finished' ? rescanCopy(notice, dict.projectSettings, locale) : null
  const summaryLink = state !== 'none' && (
    <Link href={summaryHref(projectId)} className="inline-flex items-center gap-1 text-caption font-semibold text-action hover:underline">
      {m.summaryLink}
      <Arrow size={14} aria-hidden />
    </Link>
  )

  return (
    <section aria-labelledby="mapping-banner-title" data-mapping-banner={state} className="animate-pop-in space-y-3">
      {(invite || state === 'running') && (
        <div
          className={cn(
            'flex min-h-[72px] flex-wrap items-center gap-x-4 gap-y-3 rounded-card border px-4 py-3 sm:px-5',
            state === 'failed' ? 'border-warn/30 bg-warn-soft' : 'border-action/15 bg-action-soft',
          )}
        >
          <span
            aria-hidden
            className={cn('grid size-10 shrink-0 place-items-center rounded-control bg-surface', state === 'failed' ? 'text-warn' : 'text-action')}
          >
            {state === 'failed' ? <TriangleAlert size={20} /> : <Telescope size={20} />}
          </span>
          <div className="min-w-0 flex-1 basis-64">
            <h2 id="mapping-banner-title" className="text-copy font-semibold text-ink">
              {state === 'running' ? m.runningTitle : state === 'failed' ? m.failedTitle : m.bannerTitle}
            </h2>
            <p className="mt-0.5 text-caption text-body" aria-live="polite">
              {state === 'running' ? m.runningBody : state === 'failed' ? m.failedBody : m.bannerBody}
            </p>
          </div>
          {state === 'running' ? (
            summaryLink
          ) : (
            <div className="flex shrink-0 items-center gap-3">
              {state === 'failed' && summaryLink}
              <Button size="md" onClick={() => void start()} loading={starting} data-mapping-run>
                {!starting && (state === 'failed' ? <RefreshCw size={15} aria-hidden /> : <Telescope size={15} aria-hidden />)}
                {starting ? m.starting : state === 'failed' ? m.retry : m.run}
              </Button>
              <button
                type="button"
                onClick={() => {
                  const at = Date.now()
                  writeSnooze(projectId, at)
                  setLaterAt({ projectId, at })
                }}
                className="rounded-control px-2 py-1.5 text-caption font-semibold text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
                data-mapping-later
              >
                {m.later}
              </button>
            </div>
          )}
          {state === 'running' && (
            <div className="w-full">
              <MappingSteps mapping={mapping} locale={locale} />
            </div>
          )}
        </div>
      )}
      {noticeCopy && notice && (
        <Notice tone={noticeCopy.tone} action={actionFor(rescanNoticeAction(notice))} onDismiss={dismiss}>
          {noticeCopy.text}
        </Notice>
      )}
    </section>
  )
}
