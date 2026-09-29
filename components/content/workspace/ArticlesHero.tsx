'use client'

/**
 * The articles screen's context card: where the project's articles stand.
 *
 * One sentence says it ("5 of your 12 articles are live"), the figures back it
 * (all articles, ready to publish, published, failed, scheduled), a bar shows how
 * the list spreads over the statuses and a small line shows the publishing pace
 * of the last weeks. The figures are the overview's own counts, the pace and the
 * last publication come from the rows the table shows (articles-standing.ts).
 *
 * Design contract §7 still holds: a figure that says 0 says nothing, so only the
 * total always shows and each status figure only when it counts something. The
 * figures count up the first time they are on screen and the bar grows; with
 * reduced motion they are simply there.
 */
import { AlertTriangle, CalendarClock, CheckCircle2, FileText, Globe } from 'lucide-react'
import HeroPanel, { HeroBadge, HeroStat } from '@/components/ui/HeroPanel'
import DistributionBar, { type DistributionPart } from '@/components/ui/DistributionBar'
import Sparkline from '@/components/ui/Sparkline'
import { AnimatedNumber } from '@/components/ui/motion'
import { formatCount } from '@/components/gsc/format'
import { formatDate } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { PACE_WEEKS, type ArticleStanding } from './articles-standing'

export default function ArticlesHero({ standing }: { standing: ArticleStanding }) {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const h = dict.contentHub.articlesHero
  const status = dict.contentHub.status
  const count = (n: number) => formatCount(n, language)
  const s = standing

  const headline = s.published > 0 ? h.headline(count(s.published), count(s.total)) : h.headlineNone(count(s.total))
  const paceTotal = s.weekly.reduce((a, b) => a + b, 0)

  // The total always; every status figure only when it counts something (§7).
  const figures = [
    { key: 'total', label: h.total, icon: <FileText />, value: s.total, hint: s.draft > 0 ? h.totalHint(count(s.draft)) : h.totalHintNone },
    { key: 'ready', label: h.ready, icon: <CheckCircle2 />, value: s.ready, hint: h.readyHint },
    { key: 'published', label: h.published, icon: <Globe />, value: s.published, hint: h.publishedHint(count(s.publishedLast30)) },
    { key: 'failed', label: h.failed, icon: <AlertTriangle />, value: s.failed, hint: h.failedHint },
    { key: 'scheduled', label: h.scheduled, icon: <CalendarClock />, value: s.scheduled, hint: h.scheduledHint },
  ].filter((f) => f.key === 'total' || f.value > 0)
    // Four at most: the scheduled figure yields first (the bar below still shows it).
    .slice(0, 4)

  const parts: DistributionPart[] = [
    { key: 'published', label: status.published, count: s.published, swatch: 'bg-rail-focus' },
    { key: 'scheduled', label: status.scheduled, count: s.scheduled + s.publishing, swatch: 'bg-rail-focus/60' },
    { key: 'ready', label: status.ready, count: s.ready, swatch: 'bg-rail-focus/30' },
    { key: 'draft', label: status.draft, count: s.draft, swatch: 'bg-contrast-ink/35' },
    { key: 'failed', label: status.failed, count: s.failed, swatch: 'bg-commit' },
  ].filter((p) => p.count > 0) // a status with nothing in it is not in the legend either (§7)
  const spread = h.distributionLabel(parts.map((p) => `${p.label} ${count(p.count)}`).join(', '))

  return (
    <HeroPanel data-articles-hero="" className="mb-8">
      <div className="px-5 pb-6 pt-5 sm:px-8 sm:pb-7 sm:pt-7">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <HeroBadge tone={s.lastPublishedAt ? 'ok' : 'muted'}>
            {s.lastPublishedAt ? h.lastPublished(formatDate(s.lastPublishedAt, language)) : h.neverPublished}
          </HeroBadge>
          {s.ready > 0 && <span className="text-caption text-contrast-ink/75">{h.waiting(count(s.ready))}</span>}
        </div>

        <h2 className="mt-5 max-w-3xl text-title font-bold tracking-tight text-balance tabular-nums">{headline}</h2>

        <div className={figures.length >= 4 ? 'stagger-in mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4' : 'stagger-in mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3'}>
          {figures.map((f) => (
            <HeroStat key={f.key} label={f.label} icon={f.icon} value={<AnimatedNumber value={f.value} format={count} />} hint={f.hint} />
          ))}
        </div>

        <div className="mt-6 grid gap-5 border-t border-contrast-ink/10 pt-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-8">
          <div className="min-w-0">
            <p className="mb-3 text-caption font-semibold text-contrast-ink/80">{h.distributionTitle}</p>
            <DistributionBar parts={parts} label={spread} tone="contrast" formatCount={count} />
          </div>
          {paceTotal > 0 && (
            <div data-articles-pace="" className="flex items-end gap-3">
              <div className="text-end">
                <p className="text-caption font-semibold text-contrast-ink/80">{h.paceTitle}</p>
                <p className="text-caption text-contrast-ink/60">{h.paceHint(count(PACE_WEEKS))}</p>
              </div>
              <Sparkline values={s.weekly} tone="contrast" width={132} height={36} label={h.paceLabel(count(PACE_WEEKS), count(paceTotal))} />
            </div>
          )}
        </div>
      </div>
    </HeroPanel>
  )
}
