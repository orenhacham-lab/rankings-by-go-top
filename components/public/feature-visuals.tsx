/**
 * The product illustrations under the feature pages' heroes, drawn with the
 * app's own pieces (tokens, Badge-like chips, tabular figures) inside a
 * ProductFrame, so the picture of the product looks like the product. Status
 * is carried by lucide icons in ok / bad, never by ✓ ✗ ↑ ↓ ★ glyphs.
 *
 * The words come from each page (Hebrew or English); these only lay them out.
 */
import type { LucideIcon } from 'lucide-react'
import { ArrowDown, ArrowUp, Check, FileSpreadsheet, FileText, Minus, Plus, Search, Star, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconSquircle, ProductFrame } from './marketing'

/** "Is the business in the AI answer?" — one row per engine. */
export function AiAnswersVisual({ heading, rows }: { heading: string; rows: { engine: string; detail: string; ok: boolean; icon: LucideIcon }[] }) {
  return (
    <ProductFrame>
      <h3 className="mb-4 text-section font-semibold text-ink">{heading}</h3>
      <ul className="space-y-2.5">
        {rows.map((row) => (
          <li
            key={row.engine}
            className={cn('flex items-center gap-3 rounded-inset border border-line border-s-[3px] bg-surface p-3 sm:p-4', row.ok ? 'border-s-ok' : 'border-s-bad')}
          >
            <IconSquircle icon={row.icon} />
            <div className="min-w-0 flex-1">
              <div className="text-copy font-semibold text-ink" dir="ltr">{row.engine}</div>
              <div className="text-caption text-muted">{row.detail}</div>
            </div>
            {row.ok ? (
              <span className="flex size-7 shrink-0 items-center justify-center rounded-pill bg-ok-soft text-ok"><Check className="size-4" strokeWidth={3} aria-hidden="true" /></span>
            ) : (
              <span className="flex size-7 shrink-0 items-center justify-center rounded-pill bg-bad-soft text-bad"><X className="size-4" strokeWidth={3} aria-hidden="true" /></span>
            )}
          </li>
        ))}
      </ul>
    </ProductFrame>
  )
}

export type Movement = { dir: 'up' | 'down' | 'flat'; value?: string }

export function MovementChip({ move }: { move: Movement }) {
  const Icon = move.dir === 'up' ? ArrowUp : move.dir === 'down' ? ArrowDown : Minus
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-0.5 rounded-pill px-2 text-caption font-semibold tabular-nums',
        move.dir === 'up' && 'bg-ok-soft text-ok',
        move.dir === 'down' && 'bg-bad-soft text-bad',
        move.dir === 'flat' && 'bg-sunk text-muted',
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {move.value}
    </span>
  )
}

/** A rank table: keyword, position, movement, URL. */
export function RankTableVisual({
  headers, rows,
}: {
  headers: [string, string, string, string]
  rows: { keyword: string; pos: number; move: Movement; url: string }[]
}) {
  return (
    <ProductFrame>
      <div className="overflow-hidden rounded-inset border border-line">
        <table className="w-full text-start">
          <thead className="bg-sunk">
            <tr className="h-10">
              {headers.map((h, i) => (
                <th key={h} className={cn('px-4 text-caption font-semibold text-muted', i === 0 ? 'text-start' : 'text-center', i === 3 && 'hidden sm:table-cell')}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-surface">
            {rows.map((row) => (
              <tr key={row.keyword} className="h-12">
                <td className="px-4 text-copy font-medium text-ink">{row.keyword}</td>
                <td className="px-4 text-center text-copy font-semibold tabular-nums text-ink">{row.pos}</td>
                <td className="px-4 text-center"><MovementChip move={row.move} /></td>
                <td className="hidden px-4 text-center text-caption text-muted sm:table-cell" dir="ltr">{row.url}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ProductFrame>
  )
}

/** The local pack: the business's place among its neighbours. */
export function MapsVisual({
  positionLabel, position, positionSub, changeLabel, change, changeSub, reviewsLabel, rows,
}: {
  positionLabel: string
  position: string
  positionSub: string
  changeLabel: string
  change: string
  changeSub: string
  reviewsLabel: string
  rows: { rank: number; name: string; stars: number; reviews: number; highlight?: boolean }[]
}) {
  return (
    <ProductFrame>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-inset border border-line border-s-[3px] border-s-action bg-surface p-4">
          <div className="text-caption font-semibold text-muted">{positionLabel}</div>
          <div className="mt-1 text-metric font-bold tabular-nums text-ink">{position}</div>
          <div className="mt-1 text-caption text-muted">{positionSub}</div>
        </div>
        <div className="rounded-inset border border-line bg-surface p-4">
          <div className="text-caption font-semibold text-muted">{changeLabel}</div>
          <div className="mt-1 flex items-center gap-1 text-metric font-bold tabular-nums text-ok">
            <ArrowUp className="size-5" aria-hidden="true" />
            {change}
          </div>
          <div className="mt-1 text-caption text-muted">{changeSub}</div>
        </div>
      </div>
      <ul className="space-y-2">
        {rows.map((item) => (
          <li
            key={item.rank}
            className={cn('flex items-center justify-between gap-3 rounded-inset border p-3', item.highlight ? 'border-action/30 bg-action-soft' : 'border-line bg-surface')}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="w-6 shrink-0 text-center text-copy font-bold tabular-nums text-ink">{item.rank}</span>
              <div className="min-w-0">
                <div className="truncate text-copy font-semibold text-ink">{item.name}</div>
                <div className="text-caption text-muted">
                  <span className="tabular-nums">{item.reviews}</span> {reviewsLabel}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-copy font-semibold tabular-nums text-ink">
              <Star className="size-4 fill-current text-muted" aria-hidden="true" />
              {item.stars}
            </div>
          </li>
        ))}
      </ul>
    </ProductFrame>
  )
}

/** A monthly report: export buttons, four figures, a short breakdown. */
export function ReportVisual({
  title, stats, breakdownTitle, breakdown,
}: {
  title: string
  stats: { label: string; value: string }[]
  breakdownTitle: string
  breakdown: string[]
}) {
  return (
    <ProductFrame>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-section font-semibold text-ink">{title}</h3>
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
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-inset border border-line bg-surface p-3 sm:p-4">
            <div className="text-caption text-muted">{s.label}</div>
            <div className="mt-1 text-metric font-bold tabular-nums text-ink">{s.value}</div>
          </div>
        ))}
      </div>
      <div className="border-t border-line pt-4">
        <h4 className="mb-3 text-copy font-semibold text-ink">{breakdownTitle}</h4>
        <ul className="space-y-2">
          {breakdown.map((item, i) => (
            <li key={item} className="flex items-center justify-between gap-3 rounded-inset bg-sunk px-3 py-2.5">
              <span className="text-copy text-body">{item}</span>
              <span className="h-1.5 w-24 overflow-hidden rounded-pill bg-surface" aria-hidden="true">
                <span className="block h-full rounded-pill bg-action" style={{ width: `${[92, 64, 48][i] ?? 40}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ProductFrame>
  )
}

/** Keyword ideas: a seed, then ideas with volume, competition and an "add" action. */
export function KeywordIdeasVisual({
  seed, headers, rows,
}: {
  seed: string
  headers: [string, string, string]
  rows: { keyword: string; volume: string; competition: string; level: 'low' | 'medium' | 'high'; added?: boolean }[]
}) {
  return (
    <ProductFrame>
      <div className="mb-4 flex h-11 items-center gap-2 rounded-control border border-line bg-surface px-3 shadow-control">
        <Search className="size-4 shrink-0 text-muted" aria-hidden="true" />
        <span className="truncate text-copy text-ink">{seed}</span>
      </div>
      <div className="overflow-hidden rounded-inset border border-line">
        <table className="w-full text-start">
          <thead className="bg-sunk">
            <tr className="h-10">
              {headers.map((h, i) => (
                <th key={h} className={cn('px-3 text-caption font-semibold text-muted sm:px-4', i === 0 ? 'text-start' : 'text-center', i === 2 && 'hidden sm:table-cell')}>{h}</th>
              ))}
              <th className="w-12 px-3" aria-hidden="true" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-surface">
            {rows.map((row) => (
              <tr key={row.keyword} className="h-12">
                <td className="px-3 text-copy font-medium text-ink sm:px-4">{row.keyword}</td>
                <td className="px-3 text-center text-copy font-semibold tabular-nums text-ink sm:px-4">{row.volume}</td>
                <td className="hidden px-3 text-center sm:table-cell sm:px-4">
                  <span className={cn(
                    'inline-flex h-6 items-center rounded-pill px-2 text-caption font-semibold',
                    row.level === 'low' && 'bg-ok-soft text-ok',
                    row.level === 'medium' && 'bg-warn-soft text-warn',
                    row.level === 'high' && 'bg-bad-soft text-bad',
                  )}>{row.competition}</span>
                </td>
                <td className="px-3 text-end">
                  <span
                    className={cn('inline-flex size-7 items-center justify-center rounded-pill', row.added ? 'bg-action text-action-ink' : 'border border-line text-muted')}
                    aria-hidden="true"
                  >
                    {row.added ? <Check className="size-4" strokeWidth={3} aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ProductFrame>
  )
}

/**
 * A work list: what the system found or did, one row each, with its state
 * ("done" in ok green, "waiting" neutral). Used for site fixes, a WordPress
 * site's publishing, and the solution pages' month at a glance.
 */
export function WorkListVisual({
  heading, rows,
}: {
  heading: string
  /** `url` is a path or a domain, always shown left-to-right so a Hebrew row keeps it whole. */
  rows: { title: string; detail: string; url?: string; icon: LucideIcon; done: boolean; status: string }[]
}) {
  return (
    <ProductFrame>
      <h3 className="mb-4 text-section font-semibold text-ink">{heading}</h3>
      <ul className="space-y-2.5">
        {rows.map((row) => (
          <li
            key={row.title}
            className={cn('flex items-center gap-3 rounded-inset border border-line border-s-[3px] bg-surface p-3 sm:p-4', row.done ? 'border-s-ok' : 'border-s-line')}
          >
            <IconSquircle icon={row.icon} />
            <div className="min-w-0 flex-1">
              <div className="text-copy font-semibold text-ink">{row.title}</div>
              <div className="truncate text-caption text-muted">
                {row.url && <span dir="ltr">{row.url}</span>}
                {row.url && row.detail && ' · '}
                {row.detail}
              </div>
            </div>
            <span
              className={cn(
                'inline-flex h-7 shrink-0 items-center gap-1 rounded-pill px-2.5 text-caption font-semibold',
                row.done ? 'bg-ok-soft text-ok' : 'bg-sunk text-muted',
              )}
            >
              {row.done && <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />}
              {row.status}
            </span>
          </li>
        ))}
      </ul>
    </ProductFrame>
  )
}
