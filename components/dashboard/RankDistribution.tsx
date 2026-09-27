'use client'

/**
 * Widget 4, where the keywords rank: one horizontal bar per range (1-3, 4-10,
 * 11-20, 21-50, 51-100, not found), from each keyword's latest check by our own
 * scanner, so it is full on the first day with no Search Console connection.
 *
 * One series, so one colour and no legend; "not found" is a neutral grey, not a
 * second hue. Every bar carries its count in text beside it, and its full
 * sentence for screen readers and on hover, so nothing is read from length alone.
 */
import { BarChart3, KeyRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RankingsView } from '@/lib/dashboard/rankings'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import { formatCount } from '@/components/gsc/format'
import { HeaderLink, LinkButton, Widget, WidgetEmpty } from './ui'

/** The closer to the top of Google, the deeper the accent: one hue, read top to bottom. */
const RANK_SHADES = ['bg-action', 'bg-action/85', 'bg-action/70', 'bg-action/60', 'bg-action/50'] as const

export default function RankDistribution({ t, rankings, language }: {
  t: DashboardDictionary['dashboardHome']
  rankings: RankingsView
  language: 'he' | 'en'
}) {
  const d = t.distribution
  const total = rankings.checked
  const max = Math.max(1, ...rankings.buckets.map((b) => b.count))
  return (
    <Widget id="distribution" state={total > 0 ? 'ready' : 'empty'} title={d.title} subtitle={d.subtitle}
      icon={<BarChart3 size={16} strokeWidth={2} />} action={<HeaderLink href="/keywords">{t.actions.viewAll}</HeaderLink>}>
      {total === 0 ? (
        <WidgetEmpty
          icon={<KeyRound size={18} strokeWidth={2} />}
          title={d.emptyTitle}
          body={rankings.tracked === 0 ? d.emptyNoKeywords : d.empty}
          action={<LinkButton href={rankings.tracked === 0 ? '/keyword-research' : '/keywords'} variant="secondary" size="sm">
            {rankings.tracked === 0 ? t.actions.addKeywords : d.emptyCta}
          </LinkButton>}
        />
      ) : (
        <ul className="space-y-2.5">
          {rankings.buckets.map((b, i) => {
            const label = d.buckets[b.key]
            const sentence = d.bucketSentence(label, b.count, total)
            const share = Math.round((b.count / max) * 100)
            return (
              <li key={b.key} data-bucket={b.key} data-count={b.count} title={sentence}
                className="grid grid-cols-[4.5rem_minmax(0,1fr)_2.5rem] items-center gap-3">
                <span className="text-caption font-medium text-body tabular-nums" dir="ltr">{label}</span>
                <span role="meter" aria-label={sentence} aria-valuemin={0} aria-valuemax={total} aria-valuenow={b.count}
                  className="h-3 w-full overflow-hidden rounded-pill bg-sunk">
                  <span
                    className={cn('block h-full rounded-pill transition-[width] duration-500',
                      b.key === 'notFound' ? 'bg-line-strong' : RANK_SHADES[Math.min(i, RANK_SHADES.length - 1)], b.count === 0 && 'opacity-0')}
                    style={{ width: `${Math.max(share, b.count > 0 ? 3 : 0)}%` }}
                  />
                </span>
                <span className="text-end text-copy font-semibold tabular-nums text-ink">{formatCount(b.count, language)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </Widget>
  )
}
