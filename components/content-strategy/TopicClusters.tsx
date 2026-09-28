'use client'

/**
 * Pillars: the plan's topics grouped by the subject they share, so the merchant sees a
 * central article and the ones that support it rather than a flat list. Grouped only
 * from the words of the topics themselves (lib/content/strategy/insights.ts
 * topicClusters), and shown only when the plan really has such groups
 * (clustersWorthShowing); a plan of unrelated topics shows nothing here.
 */
import { useMemo } from 'react'
import { CheckCircle2, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCount } from '@/components/gsc/format'
import type { StrategyCard } from '@/lib/content/strategy/board'
import { cardKeyword, clustersWorthShowing, topicClusters, type TopicInsight } from '@/lib/content/strategy/insights'
import type { Locale } from '@/lib/i18n/locales'
import type { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { ACCENT } from './StrategyBoard'

type Dict = ReturnType<typeof getDashboardDictionary>

/** Titles a pillar lists before "and N more". */
export const CLUSTER_TITLES = 4
/** Pillars shown at most. */
export const CLUSTERS_SHOWN = 6

export default function TopicClusters({ cards, insights, lang, dict }: {
  cards: readonly StrategyCard[]
  insights: ReadonlyMap<string, TopicInsight> | null
  lang: Locale
  dict: Dict
}) {
  const t = dict.strategyInsights.clusters
  const columns = dict.contentStrategy.columns
  const n = (v: number) => formatCount(v, lang)
  const { clusters, loose } = useMemo(() => topicClusters(cards.map((c) => ({
    key: c.key, keyword: cardKeyword(c), title: c.title, column: c.column, volume: insights?.get(c.key)?.volume ?? null,
  }))), [cards, insights])
  if (!clustersWorthShowing(clusters)) return null
  const shown = clusters.slice(0, CLUSTERS_SHOWN)

  return (
    <section aria-labelledby="strategy-clusters-heading" data-topic-clusters="">
      <div className="mb-3">
        <h2 id="strategy-clusters-heading" className="inline-flex items-center gap-2 text-section font-semibold text-ink">
          <span className="grid size-7 place-items-center rounded-control bg-info-soft text-info"><Layers size={15} aria-hidden="true" /></span>
          {t.title}
        </h2>
        <p className="mt-1 max-w-3xl text-caption text-muted">{t.subtitle}</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((c, i) => {
          const published = c.items.some((it) => it.column === 'published')
          const rest = c.items.length - CLUSTER_TITLES
          return (
            <li
              key={c.name}
              data-cluster={c.name}
              style={{ animationDelay: `${Math.min(i, 5) * 60}ms` }}
              className="rounded-card border border-line bg-surface p-4 shadow-card motion-safe:animate-pop-in [animation-fill-mode:backwards]"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-copy font-semibold text-ink [overflow-wrap:anywhere]">{c.name}</p>
                {published && (
                  <span title={t.hasPublished} className="shrink-0 text-ok"><CheckCircle2 size={16} aria-label={t.hasPublished} /></span>
                )}
              </div>
              <p className="mt-1 flex flex-wrap gap-x-3 text-caption text-muted tabular-nums">
                <span>{t.topics(n(c.items.length))}</span>
                {c.searches > 0 && <span className="font-semibold text-action">{t.searches(n(c.searches))}</span>}
              </p>
              <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
                {c.items.slice(0, CLUSTER_TITLES).map((it) => (
                  <li key={it.key} className="flex items-start gap-2 text-caption text-body">
                    <span
                      className={cn('mt-1.5 size-2 shrink-0 rounded-pill', ACCENT[it.column as keyof typeof ACCENT]?.dot ?? 'bg-muted')}
                      title={columns[it.column as keyof typeof columns]}
                      aria-hidden="true"
                    />
                    <span className="sr-only">{columns[it.column as keyof typeof columns]}: </span>
                    <span className="line-clamp-2 [overflow-wrap:anywhere]">{it.title}</span>
                  </li>
                ))}
              </ul>
              {rest > 0 && <p className="mt-2 text-caption font-medium text-muted">{t.more(n(rest))}</p>}
            </li>
          )
        })}
      </ul>
      {loose > 0 && <p className="mt-2 text-caption text-muted">{t.loose(n(loose))}</p>}
    </section>
  )
}
