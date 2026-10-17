'use client'

/**
 * The keywords tab's context card: where the project's keywords stand right now.
 *
 * One sentence says it ("3 of 9 keywords on Google's first page"), four figures
 * back it (tracked, in the top 3, on page one, the average position), a line says
 * what moved since the previous check, and one bar shows how the whole list spreads
 * over Google's pages. Everything is computed from the rows the table already shows
 * (each keyword's latest check): nothing here reads anything of its own.
 *
 * The figures count up the first time they are on screen and the bar grows from
 * its start edge (components/ui/motion.tsx, app/globals.css); with reduced motion
 * they are simply there. The project's one primary action, checking every keyword
 * now, sits on the card.
 */
import { ArrowDown, ArrowUp, Crown, KeyRound, Medal, RefreshCw, Target } from 'lucide-react'
import type { Project, ScanResult, TrackingTarget } from '@/lib/supabase/types'
import HeroPanel, { HeroBadge, HeroStat } from '@/components/ui/HeroPanel'
import DistributionBar, { type DistributionPart } from '@/components/ui/DistributionBar'
import SiteAvatar from '@/components/ui/SiteAvatar'
import Button from '@/components/ui/Button'
import { AnimatedNumber } from '@/components/ui/motion'
import { positionBucket, type PositionBucket } from '@/components/ui/PositionChip'
import { formatCount, formatPosition } from '@/components/gsc/format'
import { formatDateTime } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

export interface KeywordStanding {
  tracked: number
  active: number
  checked: number
  buckets: Record<PositionBucket | 'unchecked', number>
  found: number
  average: number | null
  up: number
  down: number
}

/** The figures of the card, from each keyword's latest check (the one the table shows). */
export function keywordStanding(targets: readonly TrackingTarget[], latest: Record<string, ScanResult>): KeywordStanding {
  const buckets: KeywordStanding['buckets'] = { top3: 0, page1: 0, page2: 0, beyond: 0, none: 0, unchecked: 0 }
  let sum = 0
  let found = 0
  let up = 0
  let down = 0
  for (const t of targets) {
    const r = latest[t.id]
    if (!r) { buckets.unchecked++; continue }
    buckets[positionBucket(r.position, r.found)]++
    if (r.found && typeof r.position === 'number' && r.position > 0) { sum += r.position; found++ }
    if (typeof r.change_value === 'number') {
      if (r.change_value > 0) up++
      else if (r.change_value < 0) down++
    }
  }
  return {
    tracked: targets.length,
    active: targets.filter((t) => t.is_active).length,
    checked: targets.length - buckets.unchecked,
    buckets,
    found,
    average: found > 0 ? sum / found : null,
    up,
    down,
  }
}

export default function KeywordsHero({ project, standing, marketLine, frequency, scanning, onScanAll, canScan }: {
  project: Project
  standing: KeywordStanding
  /** The scan parameters in words ("Google Israel · Hebrew · desktop · Tel Aviv"). */
  marketLine: string
  frequency: string
  scanning: boolean
  onScanAll: () => void
  canScan: boolean
}) {
  const { language, uiLocale } = useDashboardLanguage()
  const dict = getDashboardDictionary(uiLocale)
  const h = dict.keywordsPage.hero
  const k = dict.projectDetail
  const count = (n: number) => formatCount(n, language)
  const s = standing
  const page1 = s.buckets.top3 + s.buckets.page1

  const headline = s.checked === 0
    ? h.headlineUnchecked(count(s.tracked))
    : page1 > 0 ? h.headline(count(page1), count(s.tracked)) : h.headlineNone(count(s.tracked))

  const parts: DistributionPart[] = [
    { key: 'top3', label: h.buckets.top3, count: s.buckets.top3, swatch: 'bg-rail-focus' },
    { key: 'page1', label: h.buckets.page1, count: s.buckets.page1, swatch: 'bg-rail-focus/60' },
    { key: 'page2', label: h.buckets.page2, count: s.buckets.page2, swatch: 'bg-rail-focus/30' },
    { key: 'beyond', label: h.buckets.beyond, count: s.buckets.beyond, swatch: 'bg-contrast-ink/35' },
    { key: 'none', label: h.buckets.none, count: s.buckets.none, swatch: 'bg-contrast-ink/15' },
  ]
  if (s.buckets.unchecked > 0) parts.push({ key: 'unchecked', label: h.buckets.unchecked, count: s.buckets.unchecked, swatch: 'bg-contrast-ink/[0.08] ring-1 ring-inset ring-contrast-ink/20' })
  const spread = h.distributionLabel(parts.filter((p) => p.count > 0).map((p) => `${p.label} ${count(p.count)}`).join(', '))

  return (
    <HeroPanel data-keywords-hero="" className="mb-6">
      <div className="px-5 pb-6 pt-5 sm:px-8 sm:pb-7 sm:pt-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <span className="inline-flex max-w-full items-center gap-2 rounded-pill bg-contrast-ink/10 py-1 pe-3 ps-1 ring-1 ring-contrast-ink/10">
              <SiteAvatar domain={project.target_domain} name={project.business_name ?? project.name} size="sm" />
              <span dir="ltr" className="truncate text-caption font-semibold">{project.target_domain}</span>
            </span>
            <HeroBadge tone={scanning ? 'action' : project.last_scan_at ? 'ok' : 'muted'} live={scanning}>
              {scanning ? k.keywordsSection.scanning : project.last_scan_at ? h.lastCheck(formatDateTime(project.last_scan_at, language)) : h.neverChecked}
            </HeroBadge>
            <span className="min-w-0 truncate text-caption text-contrast-ink/70" title={marketLine}>
              {frequency}{marketLine ? ` · ${marketLine}` : ''}
            </span>
          </div>
          {/* The tab's one primary: check every keyword now. */}
          <Button onClick={onScanAll} loading={scanning} disabled={!canScan} className="shrink-0 self-start shadow-glow">
            {!scanning && <RefreshCw aria-hidden="true" className="size-4" />}
            {scanning ? k.keywordsSection.scanning : k.keywordsSection.scanAllButton}
          </Button>
        </div>

        <h2 className="mt-6 max-w-3xl text-title font-bold tracking-tight text-balance tabular-nums">{headline}</h2>
        {(s.up > 0 || s.down > 0) && (
          <p data-keywords-movement="" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-copy text-contrast-ink/80">
            {s.up > 0 && (
              <span className="inline-flex items-center gap-1 font-semibold text-contrast-ink">
                <span className="grid size-5 place-items-center rounded-pill bg-contrast-ink/15"><ArrowUp aria-hidden="true" strokeWidth={2.5} className="size-3" /></span>
                {h.movedUp(count(s.up))}
              </span>
            )}
            {s.down > 0 && (
              <span className="inline-flex items-center gap-1 font-semibold text-contrast-ink">
                <span className="grid size-5 place-items-center rounded-pill bg-contrast-ink/15"><ArrowDown aria-hidden="true" strokeWidth={2.5} className="size-3" /></span>
                {h.movedDown(count(s.down))}
              </span>
            )}
            <span className="text-contrast-ink/65">{h.sinceLast}</span>
          </p>
        )}

        <div className="stagger-in mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <HeroStat
            label={h.tracked}
            icon={<KeyRound />}
            value={<AnimatedNumber value={s.tracked} format={count} />}
            hint={h.trackedHint(count(s.active))}
          />
          <HeroStat
            label={h.top3}
            icon={<Crown />}
            value={<AnimatedNumber value={s.buckets.top3} format={count} />}
            hint={h.top3Hint}
          />
          <HeroStat
            label={h.page1}
            icon={<Medal />}
            value={<AnimatedNumber value={page1} format={count} />}
            hint={h.page1Hint}
          />
          <HeroStat
            label={h.average}
            icon={<Target />}
            value={s.average === null ? '—' : <AnimatedNumber value={s.average} format={(n) => formatPosition(n, language)} />}
            hint={s.average === null ? h.averageNone : h.averageHint(count(s.found))}
          />
        </div>

        {s.tracked > 0 && (
          <div className="mt-6 border-t border-contrast-ink/10 pt-5">
            <p className="mb-3 text-caption font-semibold text-contrast-ink/80">{h.distributionTitle}</p>
            <DistributionBar parts={parts} label={spread} tone="contrast" formatCount={count} />
          </div>
        )}
      </div>
    </HeroPanel>
  )
}
