/**
 * The landing page's product pictures: one per feature row and one for the
 * free check. Drawn with the app's tokens so the picture of the product looks
 * like the product; every word comes from the page's copy (Hebrew or English).
 * Status is carried by lucide icons and the ok / action tones, never glyphs.
 */
import type { LucideIcon } from 'lucide-react'
import { CalendarClock, Check, CircleCheck, FileSpreadsheet, FileText, Lock, MapPin, PenLine, Send, Sparkles, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('relative rounded-card border border-line bg-surface p-4 text-start shadow-card sm:p-6', className)}>
      {children}
    </div>
  )
}

function Chip({ tone, icon: Icon, children }: { tone: 'ok' | 'info' | 'muted' | 'action'; icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-pill px-2 text-caption font-semibold',
        tone === 'ok' && 'bg-ok-soft text-ok',
        tone === 'info' && 'bg-info-soft text-info',
        tone === 'muted' && 'bg-sunk text-muted',
        tone === 'action' && 'bg-action text-action-ink',
      )}
    >
      {Icon && <Icon className="size-3.5" aria-hidden="true" />}
      {children}
    </span>
  )
}

// ── Content: a week of articles, each on its way to the site ────────────────
export type ContentVisualCopy = {
  heading: string
  days: string[]
  items: { day: number; title: string; status: 'published' | 'scheduled' | 'writing'; label: string }[]
  destinationLabel: string
  destinations: string[]
}

const STATUS_ICON = { published: CircleCheck, scheduled: CalendarClock, writing: PenLine } as const
const STATUS_TONE = { published: 'ok', scheduled: 'info', writing: 'muted' } as const

export function ContentVisual({ copy }: { copy: ContentVisualCopy }) {
  const busy = new Map(copy.items.map((it) => [it.day, it.status]))
  return (
    <Frame>
      <div className="mb-4 text-section font-semibold text-ink">{copy.heading}</div>
      <div className="mb-4 grid grid-cols-7 gap-1.5" aria-hidden="true">
        {copy.days.map((d, i) => {
          const st = busy.get(i)
          return (
            <div key={d} className={cn('flex flex-col items-center gap-1.5 rounded-inset border py-2', st ? 'border-action/25 bg-action-soft' : 'border-line bg-canvas')}>
              <span className="text-caption text-muted">{d}</span>
              <span className={cn('size-2 rounded-pill', st === 'published' ? 'bg-ok' : st === 'scheduled' ? 'bg-action' : st === 'writing' ? 'bg-line-strong' : 'bg-transparent')} />
            </div>
          )
        })}
      </div>
      <ul className="space-y-2">
        {copy.items.map((it) => (
          <li key={it.title} className="flex items-center justify-between gap-3 rounded-inset border border-line bg-surface px-3 py-2.5">
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-action-soft text-action" aria-hidden="true">
                <FileText className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-copy font-semibold text-ink">{it.title}</span>
                <span className="block text-caption text-muted">{copy.days[it.day]}</span>
              </span>
            </span>
            <Chip tone={STATUS_TONE[it.status]} icon={STATUS_ICON[it.status]}>{it.label}</Chip>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Send className="size-4 text-action" aria-hidden="true" />
        <span className="text-caption text-muted">{copy.destinationLabel}</span>
        {copy.destinations.map((d) => (
          <span key={d} dir="ltr" className="inline-flex h-7 items-center rounded-pill border border-line bg-canvas px-3 text-caption font-semibold text-ink">{d}</span>
        ))}
      </div>
    </Frame>
  )
}

// ── AI visibility: which engines recommend you, question by question ────────
export type AiVisualCopy = {
  heading: string
  engines: string[]
  rows: { question: string; hits: boolean[] }[]
  shareTitle: string
  you: { label: string; value: number }
  rival: { label: string; value: number }
}

export function AiVisual({ copy }: { copy: AiVisualCopy }) {
  return (
    <Frame>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-section font-semibold text-ink">{copy.heading}</span>
        <Sparkles className="size-5 text-action" aria-hidden="true" />
      </div>
      <ul className="space-y-3">
        {copy.rows.map((row) => (
          <li key={row.question} className="rounded-inset border border-line bg-canvas p-3">
            <div className="mb-2 text-copy font-medium text-ink">{row.question}</div>
            <div className="flex flex-wrap gap-1.5">
              {copy.engines.map((engine, i) => (
                <span
                  key={engine}
                  dir="ltr"
                  className={cn('inline-flex h-6 items-center gap-1 rounded-pill px-2 text-caption font-semibold', row.hits[i] ? 'bg-ok-soft text-ok' : 'bg-surface text-muted ring-1 ring-line')}
                >
                  {row.hits[i] && <Check className="size-3" strokeWidth={3} aria-hidden="true" />}
                  {engine}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 space-y-2.5 border-t border-line pt-4">
        <div className="text-caption font-semibold text-muted">{copy.shareTitle}</div>
        {[copy.you, copy.rival].map((bar, i) => (
          <div key={bar.label} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-caption text-body">{bar.label}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-sunk" aria-hidden="true">
              <span className={cn('block h-full rounded-pill', i === 0 ? 'bg-action' : 'bg-line-strong')} style={{ width: `${bar.value}%` }} />
            </span>
            <span className="w-10 shrink-0 text-end text-caption font-semibold tabular-nums text-ink">{bar.value}%</span>
          </div>
        ))}
      </div>
    </Frame>
  )
}

// ── Rankings: keywords climbing, and the map pack ──────────────────────────
export type RankVisualCopy = {
  heading: string
  columns: [string, string, string]
  rows: { keyword: string; pos: number; up: number }[]
  maps: { label: string; area: string; value: string }
}

export function RankVisual({ copy }: { copy: RankVisualCopy }) {
  return (
    <div className="relative pb-10 sm:pb-12">
      <Frame>
        <div className="mb-4 text-section font-semibold text-ink">{copy.heading}</div>
        <div className="overflow-hidden rounded-inset border border-line">
          <div className="grid grid-cols-[1fr_4rem_4.5rem] gap-2 bg-sunk px-3 py-2 text-caption text-muted sm:px-4">
            <span>{copy.columns[0]}</span>
            <span className="text-center">{copy.columns[1]}</span>
            <span className="text-end">{copy.columns[2]}</span>
          </div>
          <ul className="divide-y divide-line">
            {copy.rows.map((row) => (
              <li key={row.keyword} className="grid grid-cols-[1fr_4rem_4.5rem] items-center gap-2 px-3 py-2.5 sm:px-4">
                <span className="truncate text-copy text-ink">{row.keyword}</span>
                <span className="text-center text-copy font-semibold tabular-nums text-ink">{row.pos}</span>
                <span className="flex justify-end"><Chip tone="ok" icon={TrendingUp}>{row.up}</Chip></span>
              </li>
            ))}
          </ul>
        </div>
      </Frame>
      {/* The map pack card, overlapping the table's corner */}
      <div className="absolute bottom-0 end-4 w-60 rounded-inset border border-line bg-surface p-3.5 shadow-pop sm:end-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-action text-action-ink" aria-hidden="true">
            <MapPin className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="text-caption text-muted">{copy.maps.label} · {copy.maps.area}</div>
            <div className="text-section font-bold text-ink">{copy.maps.value}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Reports: the export, and the figures a client reads first ──────────────
export type ReportVisualCopy = {
  heading: string
  period: string
  stats: { label: string; value: string; up?: boolean }[]
  clientsLabel: string
  clients: string[]
}

export function ReportsVisual({ copy }: { copy: ReportVisualCopy }) {
  return (
    <Frame>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-section font-semibold text-ink">{copy.heading}</div>
          <div className="text-caption text-muted">{copy.period}</div>
        </div>
        <div className="flex gap-2" aria-hidden="true">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-control border border-line bg-surface px-3 text-caption font-semibold text-ink shadow-control">
            <FileText className="size-4 text-action" />
            PDF
          </span>
          <span className="inline-flex h-8 items-center gap-1.5 rounded-control border border-line bg-surface px-3 text-caption font-semibold text-ink shadow-control">
            <FileSpreadsheet className="size-4 text-action" />
            Excel
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {copy.stats.map((s) => (
          <div key={s.label} className="rounded-inset border border-line bg-canvas p-3">
            <div className="text-caption text-muted">{s.label}</div>
            <div className="mt-1 flex items-center gap-1.5 text-metric font-bold tabular-nums text-ink">
              {s.value}
              {s.up && <TrendingUp className="size-4 text-ok" aria-hidden="true" />}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <span className="text-caption text-muted">{copy.clientsLabel}</span>
        {copy.clients.map((c, i) => (
          <span key={c} className={cn('inline-flex h-7 items-center rounded-pill px-3 text-caption font-semibold', i === 0 ? 'bg-action-soft text-action' : 'border border-line bg-surface text-body')} dir="ltr">{c}</span>
        ))}
      </div>
    </Frame>
  )
}

// ── The free check's result, previewed ─────────────────────────────────────
export type CheckPreviewCopy = {
  domain: string
  heading: string
  scoreLabel: string
  score: string
  findings: string[]
  lockedLabel: string
}

export function CheckPreview({ copy }: { copy: CheckPreviewCopy }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4 text-start shadow-pop sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-section font-semibold text-ink">{copy.heading}</div>
          <div dir="ltr" className="truncate text-caption text-muted">{copy.domain}</div>
        </div>
        <div className="shrink-0 rounded-inset bg-action-soft px-3 py-2 text-center">
          <div className="text-metric font-bold tabular-nums text-action" dir="ltr">{copy.score}</div>
          <div className="text-caption text-body">{copy.scoreLabel}</div>
        </div>
      </div>
      <ul className="space-y-2">
        {copy.findings.map((f) => (
          <li key={f} className="flex items-center gap-2.5 rounded-inset border border-line border-s-[3px] border-s-warn bg-surface px-3 py-2.5 text-copy text-ink">
            {f}
          </li>
        ))}
        <li className="flex items-center gap-2.5 rounded-inset border border-dashed border-line-strong bg-canvas px-3 py-2.5 text-copy text-muted">
          <Lock className="size-4 shrink-0" aria-hidden="true" />
          {copy.lockedLabel}
        </li>
      </ul>
    </div>
  )
}
