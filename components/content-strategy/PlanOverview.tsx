'use client'

/**
 * The plan in numbers, between the next article and the board: how many topics wait at
 * each stage, how much monthly demand the plan's keywords carry (from the research,
 * each keyword once), the plan month by month (what went live, what is scheduled), and
 * what kinds of content it is made of. Everything is counted from the board's own cards
 * (buildStrategyBoard), so these numbers and the board can never disagree.
 */
import { CalendarRange, CheckCircle2, Lightbulb, ListChecks, PenLine, Search } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import StatTile from '@/components/ui/StatTile'
import CountUp from '@/components/ui/CountUp'
import { cn } from '@/lib/utils'
import { formatCount } from '@/components/gsc/format'
import { INTENT_TONE } from '@/components/keyword-research/LandscapeAudiences'
import { monthPlan, type StrategyCard, type StrategyColumn } from '@/lib/content/strategy/board'
import { planIntentMix } from '@/lib/content/strategy/insights'
import type { Locale } from '@/lib/i18n/locales'
import type { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { monthLabel } from './format'

type Dict = ReturnType<typeof getDashboardDictionary>

const TILES: { column: StrategyColumn; Icon: typeof Lightbulb }[] = [
  { column: 'ideas', Icon: Lightbulb },
  { column: 'planned', Icon: ListChecks },
  { column: 'written', Icon: PenLine },
  { column: 'published', Icon: CheckCircle2 },
]

export default function PlanOverview({ cards, counts, searches, lang, dict }: {
  cards: readonly StrategyCard[]
  counts: Record<StrategyColumn, number>
  /** The plan's keywords' monthly searches (planSearches), or null when the research has none of them. */
  searches: number | null
  lang: Locale
  dict: Dict
}) {
  const t = dict.strategyInsights.overview
  const f = dict.strategyInsights.facts
  const n = (v: number) => formatCount(v, lang)
  const months = monthPlan(cards)
  const maxMonth = Math.max(1, ...months.map((m) => m.published + m.scheduled))
  const mix = planIntentMix(cards)
  const mixTotal = mix.reduce((s, m) => s + m.count, 0)
  const label = { ideas: [t.ideas, t.ideasSource], planned: [t.planned, t.plannedSource], written: [t.written, t.writtenSource], published: [t.published, t.publishedSource] } as const

  return (
    <section aria-labelledby="strategy-overview-heading" data-plan-overview="">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <h2 id="strategy-overview-heading" className="text-section font-semibold text-ink">{t.title}</h2>
          <p className="text-caption text-muted">{t.subtitle}</p>
        </div>
        {searches !== null && (
          <p data-plan-searches="" className="inline-flex items-center gap-1.5 rounded-pill bg-action-soft px-3 py-1 text-caption font-semibold text-action tabular-nums" title={t.searchesHint}>
            <Search size={13} aria-hidden="true" />{t.searches(n(searches))}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TILES.map(({ column, Icon }) => (
          <StatTile
            key={column}
            label={label[column][0]}
            value={<CountUp value={counts[column]}>{n(counts[column])}</CountUp>}
            source={label[column][1]}
            icon={<Icon size={16} strokeWidth={2} />}
          />
        ))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="p-4 sm:p-5">
          <h3 className="inline-flex items-center gap-2 text-copy font-semibold text-ink"><CalendarRange size={15} aria-hidden="true" className="text-muted" />{t.monthsTitle}</h3>
          {months.length === 0 ? (
            <p className="mt-2 text-caption text-muted">{t.noMonths}</p>
          ) : (
            <ol className="mt-3 space-y-2.5">
              {months.map((m) => (
                <li key={m.key} data-plan-month={m.key} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[7rem_minmax(0,1fr)_auto]">
                  <span className="truncate text-caption font-semibold text-body">{monthLabel(m.key, lang)}</span>
                  <span className="flex h-2.5 overflow-hidden rounded-pill bg-sunk" aria-hidden="true">
                    <span className="h-full bg-ok transition-[width] duration-700 ease-snappy motion-reduce:transition-none" style={{ width: `${(m.published / maxMonth) * 100}%` }} />
                    <span className="h-full bg-action/70 transition-[width] duration-700 ease-snappy motion-reduce:transition-none" style={{ width: `${(m.scheduled / maxMonth) * 100}%` }} />
                  </span>
                  <span className="col-span-2 flex gap-3 text-caption text-muted tabular-nums sm:col-span-1">
                    {m.published > 0 && <span className="inline-flex items-center gap-1"><span className="size-2 rounded-pill bg-ok" aria-hidden="true" />{t.monthPublished(n(m.published))}</span>}
                    {m.scheduled > 0 && <span className="inline-flex items-center gap-1"><span className="size-2 rounded-pill bg-action/70" aria-hidden="true" />{t.monthScheduled(n(m.scheduled))}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {mixTotal > 0 && (
          <Card className="p-4 sm:p-5">
            <h3 className="text-copy font-semibold text-ink">{t.mixTitle}</h3>
            <span role="img" aria-label={mix.map((m) => `${f.intents[m.intent]}: ${n(m.count)}`).join(' · ')} className="mt-3 flex h-2.5 overflow-hidden rounded-pill bg-sunk">
              {mix.map((m) => <span key={m.intent} className={cn('h-full', INTENT_TONE[m.intent].bar)} style={{ width: `${(m.count / mixTotal) * 100}%` }} />)}
            </span>
            <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5" aria-hidden="true">
              {mix.map((m) => (
                <li key={m.intent} className="flex items-center justify-between gap-2 text-caption">
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-body"><span className={cn('size-2 shrink-0 rounded-pill', INTENT_TONE[m.intent].dot)} /><span className="truncate">{f.intents[m.intent]}</span></span>
                  <span className="font-semibold text-ink tabular-nums">{n(m.count)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </section>
  )
}
