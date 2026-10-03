'use client'

/**
 * Search Console on the Keywords tab: Google's own 28-day figures beside our scan.
 *
 * Product rule (wave 8): our live check (Serper) is the position of record. Search
 * Console is a free, separate layer, always labelled as Google's 28-day average and
 * never drawn as a second position column competing with ours. So:
 *
 *  - GscGoogleAverage: a small line under each keyword's NAME (visible on a phone too):
 *    "Google average, 28 days · Position 8.4 · 12 clicks · 1.2K impressions". It shows
 *    value before any live scan has run. Its full sentence (with the sync date) is its
 *    title and its screen-reader text.
 *  - GscKeywordsNotice: the block under the table, mounted whatever the connection.
 *    Connected, it lists the searches Google already shows the site for that are not
 *    tracked yet (GscUntrackedQueries), with a one-click "track it" through the existing
 *    add-to-project route and its plan limit. Not set up, it is one quiet card saying
 *    what connecting adds, with exactly one link to the Search Console section of
 *    settings, whose label names the one missing step (never a connection that does
 *    not exist). A failed read offers a retry; switched off on the server, nothing.
 *
 * Before wave 8 the table showed clicks · impressions in a fixed box under the search
 * volume, a column a phone does not show, with no position and no date; and production
 * (main) had no Search Console on this tab at all.
 *
 * A keyword is matched to Search Console queries by the opportunity engine's own
 * normalization (lib/gsc/tab-metrics.ts, on the server).
 */
import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { gscSettingsHref, isGscSetupState, type GscSetupState } from '@/lib/gsc/widget-state'
import type { GoogleAverage, KeywordFigures, UntrackedQuery } from '@/lib/gsc/tab-metrics'
import { useGscMetrics, useGscStatus, type GscData } from './gsc-data'
import { GSC_ACTION_LINK_CLASS, GscLoadError } from './GscSetupPrompt'
import GscUntrackedQueries, { GoogleMark, type TrackQuery } from './GscUntrackedQueries'
import { formatCompact, formatCount, formatDay, formatPosition } from './format'

/** Clicks and impressions per tracked keyword (keyword research reads these). */
export interface GscKeywordFiguresView {
  data: GscData<Record<string, KeywordFigures>>
  retry: () => void
}

function pickKeywords(body: Record<string, unknown>): Record<string, KeywordFigures> {
  return body.keywords && typeof body.keywords === 'object' ? (body.keywords as Record<string, KeywordFigures>) : {}
}

/**
 * The figures of every keyword of the project. `targetsKey` names the keyword list the
 * table shows; when it changes (a keyword added or removed), the figures are read again.
 */
export function useGscKeywordFigures(projectId: string | null | undefined, targetsKey: string): GscKeywordFiguresView {
  const status = useGscStatus(projectId)
  const figures = useGscMetrics(projectId, status.view, 'keywords', pickKeywords)
  const reloadFigures = figures.reload
  const seenKey = useRef(targetsKey)
  useEffect(() => {
    if (seenKey.current === targetsKey) return
    seenKey.current = targetsKey
    reloadFigures()
  }, [targetsKey, reloadFigures])
  return { data: figures.data, retry: () => { status.reload(); figures.reload() } }
}


// ── The Keywords tab ─────────────────────────────────────────────────────────

/** What the Keywords tab reads from the keywords view of the latest 28-day sync. */
export interface KeywordInsights {
  /** Each tracked keyword's Google average, by target id; absent: Google reported nothing. */
  averages: Record<string, GoogleAverage>
  /** The searches Google shows the site for that no tracked keyword matches, most seen first. */
  untracked: UntrackedQuery[]
  untrackedTotal: number
  queriesTotal: number
  /** When the sync finished (ISO), for "updated …". */
  syncedAt: string | null
  /** The sync's real window (YYYY-MM-DD, inclusive): 28 days up to the last day Google had. */
  windowStart?: string | null
  windowEnd?: string | null
}

export interface GscKeywordsView {
  data: GscData<KeywordInsights>
  retry: () => void
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function pickInsights(body: Record<string, unknown>): KeywordInsights {
  const averages: Record<string, GoogleAverage> = {}
  if (body.averages && typeof body.averages === 'object') {
    for (const [id, a] of Object.entries(body.averages as Record<string, Partial<GoogleAverage>>)) {
      if (!a || typeof a !== 'object') continue
      averages[id] = { clicks: num(a.clicks), impressions: num(a.impressions), position: a.position == null ? null : num(a.position) }
    }
  }
  const untracked = Array.isArray(body.untracked)
    ? (body.untracked as Partial<UntrackedQuery>[])
      .filter((q) => q && typeof q.query === 'string' && q.query.trim() !== '')
      .map((q) => ({ query: String(q.query), clicks: num(q.clicks), impressions: num(q.impressions), position: q.position == null ? null : num(q.position) }))
    : []
  return {
    averages,
    untracked,
    untrackedTotal: Math.max(untracked.length, num(body.untrackedTotal)),
    queriesTotal: num(body.queriesTotal),
    syncedAt: typeof body.syncedAt === 'string' ? body.syncedAt : null,
    ...windowOf(body.run),
  }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
/** The run's window, as the metrics route reports it (`run.startDate`, `run.endDate`). */
function windowOf(run: unknown): { windowStart: string | null; windowEnd: string | null } {
  const r = run && typeof run === 'object' ? (run as Record<string, unknown>) : {}
  const day = (v: unknown) => (typeof v === 'string' && DAY.test(v) ? v : null)
  return { windowStart: day(r.startDate), windowEnd: day(r.endDate) }
}

/**
 * The Keywords tab's Search Console read: one request (the keywords view, shared by URL
 * with keyword research's figures), read again when the keyword list changes.
 */
export function useGscKeywordInsights(projectId: string | null | undefined, targetsKey: string): GscKeywordsView {
  const status = useGscStatus(projectId)
  const insights = useGscMetrics(projectId, status.view, 'keywords', pickInsights)
  const reloadInsights = insights.reload
  const seenKey = useRef(targetsKey)
  useEffect(() => {
    if (seenKey.current === targetsKey) return
    seenKey.current = targetsKey
    reloadInsights()
  }, [targetsKey, reloadInsights])
  return { data: insights.data, retry: () => { status.reload(); insights.reload() } }
}

/**
 * Whether a keyword row carries the Google line: while the figures load, once they are
 * there, or when they could not be read. Not before Search Console is set up (the card
 * under the table says what it would add, once, instead of a dash on every row), and
 * never when it is switched off on the server.
 */
export function googleLineShown(view: GscKeywordsView | undefined): boolean {
  const state = view?.data.state
  return state === 'ready' || state === 'loading' || state === 'error'
}

/** "27 Sep": the day a sync finished, in the screen's language. */
function syncedDay(syncedAt: string | null, language: string): string | null {
  return syncedAt && /^\d{4}-\d{2}-\d{2}/.test(syncedAt) ? formatDay(syncedAt.slice(0, 10), language) : null
}

const LINE = 'mt-1 flex max-w-[22rem] flex-wrap items-center gap-x-2 gap-y-0.5 whitespace-normal text-caption text-muted'

/** The line under a keyword's name: Google's 28-day average for that search. */
export function GscGoogleAverage({ view, targetId }: { view: GscKeywordsView; targetId: string }) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).gscWidgets.googleAverage
  const data = view.data
  if (data.state === 'disabled') return null
  if (data.state === 'loading') {
    return (
      <span className={LINE} data-gsc-keyword="loading" aria-busy="true">
        <GoogleMark />
        <span className="h-2.5 w-40 rounded-control bg-sunk" aria-hidden="true" />
        <span className="sr-only">{t.loading}</span>
      </span>
    )
  }
  if (data.state !== 'ready') {
    return (
      <span className={LINE} data-gsc-keyword={data.state} title={data.state === 'error' ? t.loadFailed : undefined}>
        <GoogleMark />
        <span>{t.label}</span>
        <span aria-hidden="true">—</span>
        {data.state === 'error' && <span className="sr-only">{t.loadFailed}</span>}
      </span>
    )
  }
  const a = data.data.averages[targetId]
  if (!a || a.impressions <= 0) {
    return (
      <span className={LINE} data-gsc-keyword="none" title={t.noneFull}>
        <span className="inline-flex items-center gap-1.5 sm:whitespace-nowrap" aria-hidden="true"><GoogleMark />{t.label}</span>
        <span className="whitespace-nowrap" aria-hidden="true">{t.none}</span>
        <span className="sr-only">{t.noneFull}</span>
      </span>
    )
  }
  const synced = syncedDay(data.data.syncedAt, language) ?? '—'
  const position = a.position == null ? t.noPosition : formatPosition(a.position, language)
  const full = t.full(position, formatCount(a.clicks, language), formatCount(a.impressions, language), synced)
  return (
    <span className={LINE} data-gsc-keyword="figures" title={full}>
      {/* Two groups that wrap as wholes: the label, then the figures (no stray "·" at a line's start). */}
      {/* On a phone the keyword column is narrow: every part wraps on its own, so the
          line never widens the column (and the table never scrolls sideways for it). */}
      <span className="inline-flex items-center gap-1.5 sm:whitespace-nowrap" aria-hidden="true">
        <GoogleMark />
        {t.label}
      </span>
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums sm:flex-nowrap" aria-hidden="true">
        <span className="whitespace-nowrap rounded-control bg-sunk px-1.5 font-semibold text-ink">{a.position == null ? t.noPosition : t.position(position)}</span>
        <span className="whitespace-nowrap">{t.clicks(formatCompact(a.clicks, language))}</span>
        <span className="whitespace-nowrap">{t.impressions(formatCompact(a.impressions, language))}</span>
      </span>
      <span className="sr-only">{full}</span>
    </span>
  )
}

/** One caption above the table, once the figures are there: what the line is, and its date. */
export function GscKeywordsLegend({ view, className }: { view: GscKeywordsView; className?: string }) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).gscWidgets.googleAverage
  const data = view.data
  // A caption for the lines, not a widget: the widget is the notice under the table,
  // which is always mounted. Without figures there is nothing to caption.
  const synced = data.state === 'ready' ? syncedDay(data.data.syncedAt, language) : null
  return data.state === 'ready' && synced ? (
    <p data-gsc-legend="" className={cn('flex items-center gap-2 text-caption text-muted', className)}>
      <GoogleMark />
      <span className="min-w-0">{t.legend(synced)}</span>
    </p>
  ) : null
}

/**
 * The Search Console block of the Keywords tab.
 *
 * Wave 9 (the owner's layout): connected, it is the TOP of the tab, Google's positions
 * for the site's searches (tracked ones included), above our live rank tracking;
 * before setup it is the quiet connect card UNDER the live tracking, as before. The
 * panel mounts it twice, unconditionally: `slot="top"` draws only the connected states
 * (loading, ready, error), `slot="bottom"` only the setup card. Without a slot it draws
 * whatever the state is (one block, as other screens and the guards compose it).
 */
export function GscKeywordsNotice({ projectId, view, onTrack, targets, slot, className }: {
  projectId: string | null | undefined
  view: GscKeywordsView
  /** Adds a query to the tracked keywords (the panel's add-to-project request). */
  onTrack?: TrackQuery
  /** The tracked keywords, so the ones Google reports appear in the list as "tracked". */
  targets?: readonly { id: string; keyword: string }[]
  slot?: 'top' | 'bottom'
  className?: string
}) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).gscWidgets
  const data = view.data
  if (data.state === 'disabled') return null
  if (isGscSetupState(data.state)) {
    if (slot === 'top') return null
    return <GscConnectCard state={data.state} projectId={projectId} className={className} />
  }
  if (slot === 'bottom') return null
  const synced = data.state === 'ready' ? syncedDay(data.data.syncedAt, language) : null
  const range = data.state === 'ready' && data.data.windowStart && data.data.windowEnd
    ? t.keywords.range(formatDay(data.data.windowStart, language), formatDay(data.data.windowEnd, language))
    : null
  const tracked = data.state === 'ready' && targets
    ? targets.flatMap((target) => {
      const a = data.data.averages[target.id]
      return a && a.impressions > 0 ? [{ query: target.keyword, ...a }] : []
    })
    : []
  return (
    <section
      data-gsc-widget="keywords"
      data-gsc-state={data.state}
      aria-labelledby="gsc-untracked-title"
      className={cn('rounded-card border border-line bg-surface shadow-card', className)}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-4 sm:px-6">
        <div className="min-w-0 flex-1 basis-72">
          <h2 id="gsc-untracked-title" className="flex items-center gap-2 text-section font-semibold text-ink">
            <GoogleMark size="md" />
            {t.keywords.title}
          </h2>
          <p className="mt-1 max-w-prose text-copy text-muted">{t.keywords.about}</p>
          {range && <p className="mt-1 text-caption text-muted" data-gsc-window="">{range}</p>}
        </div>
        <p className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-sunk px-2.5 py-1 text-caption text-muted">
          <span className="font-medium text-body">{t.googleAverage.label}</span>
          {synced && <><span aria-hidden="true">·</span><span>{t.googleAverage.synced(synced)}</span></>}
        </p>
      </header>
      {data.state === 'error' ? (
        <GscLoadError onRetry={view.retry} className="px-4 py-6 sm:px-6" />
      ) : (
        <GscUntrackedQueries
          loading={data.state === 'loading'}
          insights={data.state === 'ready' ? data.data : null}
          onTrack={onTrack}
          tracked={tracked}
        />
      )}
      {/* One small note, so no one reads a rounded average as a wrong figure. */}
      {data.state === 'ready' && (
        <p data-gsc-rounding="" className="border-t border-line px-4 py-2.5 text-caption text-muted sm:px-6">{t.keywords.rounded}</p>
      )}
    </section>
  )
}

/**
 * Before Search Console is set up: what connecting adds, in three lines, and the one
 * step that is missing. Quiet on purpose (no fill, the secondary button): connecting is
 * never the tab's main action, the keyword check is.
 */
function GscConnectCard({ state, projectId, className }: { state: GscSetupState; projectId: string | null | undefined; className?: string }) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).gscWidgets
  const c = t.connect
  return (
    <section
      data-gsc-widget="keywords"
      data-gsc-state={state}
      aria-labelledby="gsc-connect-title"
      className={cn('rounded-card border border-dashed border-line-strong bg-surface px-4 py-5 sm:px-6', className)}
    >
      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-1 basis-80 items-start gap-3.5">
          <GoogleMark size="lg" />
          <div className="min-w-0">
            <h2 id="gsc-connect-title" className="text-section font-semibold text-ink">{c.titles[state]}</h2>
            <p className="mt-1 text-copy text-muted">{c.body}</p>
            <ul className="mt-3 flex flex-col gap-2">
              {c.points.map((point) => (
                <li key={point} className="flex items-start gap-2 text-copy text-body">
                  <Check size={16} strokeWidth={2.25} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />
                  <span className="min-w-0">{point}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-caption text-muted">{c.note}</p>
          </div>
        </div>
        <Link href={gscSettingsHref(projectId)} className={cn(GSC_ACTION_LINK_CLASS, 'shrink-0 self-center')}>
          {t.actions[state]}
        </Link>
      </div>
    </section>
  )
}
