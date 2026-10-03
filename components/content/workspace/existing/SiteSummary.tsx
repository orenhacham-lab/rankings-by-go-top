'use client'

/**
 * The top of the existing-content screen: the hero every other tab has
 * (HeroPanel, wave 8 UX A7), with the same data as before and no new fetch.
 *
 *   badge     when the list was updated, or, while the full-site mapping runs,
 *             a live "mapping the site" pill; the list's refresh is an inverse
 *             secondary button at the top end.
 *   headline  how big the site is ("86 pages on the site", "at least 500"), and
 *             with Search Console, how many of them bring clicks from Google.
 *   figures   with Search Console: pages with clicks, seen without clicks, with a
 *             clear opportunity, and (only when there are any) pages competing with
 *             each other, which is a button that filters the list. Without it: one
 *             figure per kind the site HAS (summaryKinds: a figure that says 0 says
 *             nothing, design contract §7; one kind alone would only repeat the
 *             total; the grid has as many columns as figures, so none is left alone).
 *   below     the kind composition as a bar, and where the list comes from.
 *   footer    without Search Console: what connecting it shows, and the button;
 *             while the mapping runs: its progress (as ArticlesHero's connection row).
 *
 * The kind filters live in the list's own tab row (KindTabs), not here.
 * Presentation only: every number comes from the payload (lib/content/existing-content).
 */
import type { ReactNode } from 'react'
import { AlertTriangle, Eye, FileText, MousePointerClick, RefreshCw, Target } from 'lucide-react'
import Button from '@/components/ui/Button'
import DistributionBar, { type DistributionPart } from '@/components/ui/DistributionBar'
import HeroPanel, { HERO_INVERSE_BUTTON, HeroBadge, HeroStat } from '@/components/ui/HeroPanel'
import { AnimatedNumber } from '@/components/ui/motion'
import { cn } from '@/lib/utils'
import type { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { settingsGscHref } from '@/lib/content/content-hub-setup'
import LinkButton from '@/components/site-links/LinkButton'
import { SITE_KINDS, type SiteKind } from '@/lib/content/existing-content/classify'
import type { ExistingContentPayload, ExistingContentTab } from '@/lib/content/existing-content/model'
import { fill, joinList } from './format'

type Copy = ReturnType<typeof getDashboardDictionary>['existingContent']

/**
 * The kind figures worth drawing: every kind the site has, and the one on screen (a
 * link can open a kind with none). One kind alone repeats the total: no figures.
 */
export function summaryKinds(counts: Record<SiteKind, number>, tab: ExistingContentTab): SiteKind[] {
  const kinds = SITE_KINDS.filter((k) => counts[k] > 0 || k === tab)
  return kinds.length > 1 ? kinds : []
}

/** As many columns as figures (four go 2 by 2 on a phone), so no row is left with a gap. */
export function summaryGridClass(n: number): string {
  return n === 4 ? 'grid-cols-2 sm:grid-cols-4' : n === 3 ? 'grid-cols-3' : 'grid-cols-2'
}

/** The kinds' colours on the dark card (contrast-safe tokens, as the articles hero's bar). */
const KIND_SWATCH: Record<SiteKind, string> = {
  product: 'bg-rail-focus',
  article: 'bg-rail-focus/60',
  page: 'bg-rail-focus/30',
  category: 'bg-contrast-ink/35',
}

const KIND_ICON = <FileText />

export default function SiteSummary({
  x, data, tab, risk, onRisk, num, day, refresh, projectId,
}: {
  x: Copy
  data: ExistingContentPayload
  tab: ExistingContentTab
  /** Kept for callers: the kind filters are the list's tab row now. */
  onTab?: (t: ExistingContentTab) => void
  risk: boolean
  onRisk: () => void
  num: Intl.NumberFormat
  day: (iso: string | null) => string | null
  refresh: { show: boolean; busy: boolean; onClick: () => void }
  projectId?: string
}) {
  const total = data.counts.all
  const capped = data.map.capped
  const mapRunning = data.map.state === 'running'
  const sourceParts = (['map', 'shopify', 'wordpress', 'crawl', 'gsc'] as const)
    .filter((s) => data.sources[s] > 0)
    .map((s) => x.sourceNames[s])
  const updated = day(data.indexedAt)
  // The badge says when, except while mapping: then the caption keeps the date.
  const captionDate = mapRunning ? updated : null
  const gscOk = data.gsc.state === 'ok'
  const kinds = summaryKinds(data.counts, tab)
  const h = x.hero
  const count = (n: number) => num.format(n)
  const totalText = count(total)

  // The total is its own element (data-existing-total), inside the sentence.
  const template = gscOk ? h.headlineGsc : capped ? h.headlineAtLeast : h.headline
  const [before, after = ''] = template.split('{total}')
  const totalShown = gscOk && capped ? fill(x.totalAtLeast, { n: totalText }) : totalText
  const headline = (
    <>
      {before}<span data-existing-total="">{totalShown}</span>{fill(after, { withClicks: count(data.insights.withClicks) })}
    </>
  )

  const parts: DistributionPart[] = SITE_KINDS
    .filter((k) => data.counts[k] > 0)
    .map((k) => ({ key: k, label: x.kinds[k], count: data.counts[k], swatch: KIND_SWATCH[k] }))
  const spread = `${x.breakdownLabel}: ${parts.map((p) => `${p.label} ${count(p.count)}`).join(', ')}`

  const figure = (n: number) => <AnimatedNumber value={n} format={count} />
  const gscStats = gscOk ? [
    { key: 'withClicks', label: h.stats.withClicks, icon: <MousePointerClick />, value: data.insights.withClicks },
    { key: 'seenNoClicks', label: h.stats.seenNoClicks, icon: <Eye />, value: data.insights.seenNoClicks },
    { key: 'actionable', label: h.stats.actionable, icon: <Target />, value: data.insights.actionable },
  ] : []
  const gscCells = gscStats.length + (gscOk && data.riskCount > 0 ? 1 : 0)

  return (
    <HeroPanel data-existing-hero="">
      <div className="px-5 pb-6 pt-5 sm:px-8 sm:pb-7 sm:pt-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {mapRunning
              ? <HeroBadge tone="action" live>{h.mapping}</HeroBadge>
              : updated && <HeroBadge tone="ok">{fill(h.updated, { date: updated })}</HeroBadge>}
            <span className="text-caption font-medium text-contrast-ink/70">{x.summaryOverline}</span>
          </div>
          {refresh.show && (
            <Button variant="secondary" size="sm" onClick={refresh.onClick} loading={refresh.busy} disabled={mapRunning} className={cn('ms-auto', HERO_INVERSE_BUTTON)} data-existing-refresh="">
              {!refresh.busy && <RefreshCw aria-hidden="true" className="size-4" />}
              {refresh.busy || mapRunning ? x.map.refreshing : x.map.refresh}
            </Button>
          )}
        </div>

        <h2 className="mt-5 max-w-3xl text-title font-bold tracking-tight text-balance tabular-nums">{headline}</h2>

        {gscOk ? (
          <div data-existing-insights="" className={cn('stagger-in mt-6 grid gap-3', gscCells === 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 min-[420px]:grid-cols-3')}>
            {gscStats.map((s) => <HeroStat key={s.key} label={s.label} icon={s.icon} value={figure(s.value)} />)}
            {data.riskCount > 0 && (
              <button
                type="button"
                aria-pressed={risk}
                onClick={onRisk}
                data-existing-risk=""
                className="rounded-inset text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-contrast-ink focus-visible:ring-offset-2 focus-visible:ring-offset-contrast"
              >
                <HeroStat
                  label={h.stats.risk}
                  icon={<AlertTriangle />}
                  value={figure(data.riskCount)}
                  hint={h.riskHint}
                  className={cn('h-full transition-colors duration-150 hover:bg-contrast-ink/[0.1]', risk && 'bg-contrast-ink/[0.14] ring-contrast-ink/40')}
                />
              </button>
            )}
          </div>
        ) : kinds.length > 0 && (
          <div data-kind-cells={kinds.length} className={cn('stagger-in mt-6 grid gap-3', summaryGridClass(kinds.length))}>
            {kinds.map((k: SiteKind) => (
              <div key={k} data-kind-count={k} className="min-w-0">
                <HeroStat label={x.kinds[k]} icon={KIND_ICON} value={figure(data.counts[k])} className="h-full" />
              </div>
            ))}
          </div>
        )}

        {(parts.length > 1 || sourceParts.length > 0 || captionDate) && (
          <div className="mt-6 space-y-3 border-t border-contrast-ink/10 pt-5">
            {parts.length > 1 && <DistributionBar parts={parts} label={spread} tone="contrast" formatCount={count} />}
            {(sourceParts.length > 0 || captionDate) && (
              <p className="text-caption text-contrast-ink/65">
                {sourceParts.length > 0 && <>{x.sourcesLead}{joinList(sourceParts, x.listJoin, x.listLastJoin)}</>}
                {sourceParts.length > 0 && captionDate && ' · '}
                {captionDate && fill(x.updatedOn, { date: captionDate })}
              </p>
            )}
          </div>
        )}
      </div>

      {!gscOk && (
        <HeroFooter>
          <p className="min-w-0 flex-1 basis-64 text-pretty">{x.insightsNoGsc}</p>
          {projectId && <LinkButton href={settingsGscHref(projectId) as `/${string}`} size="sm" variant="secondary" className={cn('shrink-0', HERO_INVERSE_BUTTON)}>{h.connectGsc}</LinkButton>}
        </HeroFooter>
      )}
      {mapRunning && <MappingProgress x={x} data={data} num={num} tone="contrast" />}
    </HeroPanel>
  )
}

function HeroFooter({ children }: { children: ReactNode }) {
  return (
    <div data-existing-hero-footer="" className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-contrast-ink/10 px-5 py-3.5 text-caption text-contrast-ink/75 sm:px-8">
      {children}
    </div>
  )
}

/** The mapping at work: what it found so far, and that nothing waits for it. */
export function MappingProgress({ x, data, num, tone = 'default' }: { x: Copy; data: ExistingContentPayload; num: Intl.NumberFormat; tone?: 'default' | 'contrast' }) {
  const dark = tone === 'contrast'
  const m = data.map
  const pct = m.phase === 'platform' ? 92 : m.docsSeen > 0 ? Math.max(6, Math.min(88, (m.docsRead / m.docsSeen) * 88)) : 6
  const detail = m.phase === 'platform'
    ? fill(x.map.runningPlatform, { n: num.format(m.found) })
    : fill(x.map.runningSitemaps, { n: num.format(m.found), read: num.format(m.docsRead), seen: num.format(Math.max(m.docsSeen, m.docsRead)) })
  return (
    <div role="status" data-existing-mapping="" className={cn('border-t px-5 py-4', dark ? 'border-contrast-ink/10 sm:px-8' : 'border-line bg-action-soft/40 sm:px-6')}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className={cn('text-copy font-semibold', dark ? 'text-contrast-ink' : 'text-ink')}>{x.map.running}</p>
        <p className={cn('text-caption tabular-nums', dark ? 'text-contrast-ink/75' : 'text-body')}>{detail}</p>
      </div>
      <div
        role="progressbar"
        aria-label={x.map.progressLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className={cn('mt-3 h-1.5 w-full overflow-hidden rounded-pill', dark ? 'bg-contrast-ink/10' : 'bg-sunk')}
      >
        <span className={cn('block h-full rounded-pill transition-[width] duration-150 ease-snappy', dark ? 'bg-rail-focus' : 'bg-action')} style={{ width: `${pct}%` }} />
      </div>
      <p className={cn('mt-2 text-caption', dark ? 'text-contrast-ink/65' : 'text-muted')}>{x.map.runningNote}</p>
    </div>
  )
}
