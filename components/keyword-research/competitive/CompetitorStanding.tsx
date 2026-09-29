'use client'

/**
 * "Where you stand against your competitors", from our check only (the positions
 * of the project and of each competitor on the same Google results page):
 *
 *   the visibility share   each site's part of the estimated clicks on the compared
 *                          keywords (lib/keyword-research/competitive.ts), with its
 *                          average position and on how many keywords it shows;
 *   who is ahead           per keyword, and per competitor ("ahead on 5 · behind on 2").
 *
 * With no competitor, or none recorded yet, it says so and offers the one step that
 * is missing (the suggested competitors of the scan, or managing them); it never
 * shows a 0% bar that only means "not compared".
 */
import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, CircleSlash, Info, Plus, TriangleAlert } from 'lucide-react'
import { CompetitorIcon } from '@/components/competitors/CompetitorIcon'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatCount, formatPosition } from '@/components/gsc/format'
import { formatResearchDate } from '@/lib/keyword-research/format'
import Badge from '@/components/ui/Badge'
import Button, { buttonClasses } from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import SiteAvatar from '@/components/ui/SiteAvatar'
import StatTile from '@/components/ui/StatTile'
import { Table, TableBody, TableHead, TableMeta, TableRow, Td, Th } from '@/components/ui/Table'
import type { Battle, BattleOutcome, CompetitiveModel, CompetitiveShare } from '@/lib/keyword-research/competitive'
import SourceTag from './SourceTag'

/** Rows of the per-keyword table before "show more" (design contract §6). */
export const BATTLES_SHOWN = 25

/** The site first in the action colour, then the competitors in the chart ramp (contract §1). */
const SITE_COLORS = ['bg-action', 'bg-action/60', 'bg-action/35', 'bg-line-strong'] as const
export const siteColor = (index: number): string => SITE_COLORS[Math.min(index, SITE_COLORS.length - 1)]

export function formatShare(share: number, language: string): string {
  return new Intl.NumberFormat(language === 'he' ? 'he-IL' : 'en-US', { style: 'percent', maximumFractionDigits: 0 }).format(share)
}

const OUTCOME_BADGE: Record<BattleOutcome, 'success' | 'danger' | 'warning' | 'neutral'> = { win: 'success', loss: 'danger', tie: 'warning', none: 'neutral' }

function VisibilityShare({ share, domain, siteIcon }: { share: CompetitiveShare; domain: string | null; siteIcon: string | null }) {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language).researchCompetitive
  const t = dict.share
  const n = (v: number) => formatCount(v, language)
  const date = formatResearchDate(share.checkedAt, language) ?? ''
  const total = share.sites.reduce((s, x) => s + x.clicks, 0)
  const label = (s: CompetitiveShare['sites'][number]) => (s.own ? dict.you : s.domain)

  return (
    <div data-competitive-share="" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-section font-semibold text-ink">{t.title}</h3>
        <SourceTag source="scan" date={date} />
      </div>

      {share.weighted === 0 ? (
        <p data-share-state="no-volume" className="rounded-inset border border-line bg-sunk px-4 py-3 text-copy text-body">{t.noVolume}</p>
      ) : total === 0 ? (
        <p data-share-state="nobody" className="rounded-inset border border-line bg-sunk px-4 py-3 text-copy text-body">{t.nobody}</p>
      ) : (
        <span
          role="img"
          aria-label={t.barLabel(share.sites.map((s) => `${label(s)} ${formatShare(s.share, language)}`).join(', '))}
          className="flex h-3 w-full overflow-hidden rounded-pill bg-sunk"
        >
          {share.sites.map((s, i) => (
            <span
              key={s.domain || 'own'}
              data-share-segment={s.own ? 'own' : s.domain}
              className={cn('h-full transition-[width] duration-700 ease-snappy motion-reduce:transition-none', siteColor(i), i > 0 && 'border-s-2 border-surface')}
              style={{ width: `${(s.share * 100).toFixed(2)}%` }}
            />
          ))}
        </span>
      )}

      <ul className={cn('grid gap-3 sm:grid-cols-2', share.sites.length === 3 ? 'lg:grid-cols-3' : share.sites.length >= 4 && 'xl:grid-cols-4')}>
        {share.sites.map((s, i) => (
          <li
            key={s.domain || 'own'}
            data-share-site={s.own ? 'own' : s.domain}
            className={cn('flex min-w-0 flex-col rounded-inset border bg-surface p-4', s.own ? 'border-action/40' : 'border-line')}
          >
            <div className="flex items-center gap-2.5">
              <SiteAvatar domain={s.own ? domain : s.domain} icon={s.own ? siteIcon : null} size="sm" />
              <p dir="ltr" className="min-w-0 flex-1 truncate text-start text-copy font-semibold text-ink rtl:text-end">{s.own ? (domain ?? dict.you) : s.domain}</p>
              {s.own && <Badge variant="info">{dict.you}</Badge>}
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-metric font-bold tracking-tight text-ink tabular-nums">{total > 0 ? formatShare(s.share, language) : '—'}</span>
              <span className="text-caption text-muted">{t.shareLabel}</span>
            </div>
            <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-pill bg-sunk" aria-hidden="true">
              <span className={cn('block h-full rounded-pill', siteColor(i))} style={{ width: `${Math.max(s.share > 0 ? 2 : 0, Math.round(s.share * 100))}%` }} />
            </span>
            <dl className="mt-3 space-y-1 text-caption">
              {total > 0 && (
                <div className="flex justify-between gap-2">
                  <dt className="sr-only">{t.shareLabel}</dt>
                  <dd className="text-body tabular-nums">{t.clicks(n(s.clicks))}</dd>
                </div>
              )}
              <div className="flex flex-wrap justify-between gap-x-2">
                <dt className="text-muted">{t.avgLabel}</dt>
                <dd className="font-semibold text-ink tabular-nums">{s.avgPosition != null ? formatPosition(s.avgPosition, language) : '—'}</dd>
              </div>
              <div>
                <dd className="text-muted tabular-nums">{s.ranked > 0 ? t.rankedOn(n(s.ranked), n(share.keywords)) : t.notRanked}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      <p data-share-method="" className="flex items-start gap-2 text-caption text-muted">
        <Info size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span className="max-w-prose text-pretty">{t.method} {t.basis(n(share.keywords), date)}.</span>
      </p>
    </div>
  )
}

function Battles({ model }: { model: CompetitiveModel }) {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language).researchCompetitive
  const t = dict.battles
  const n = (v: number) => formatCount(v, language)
  const [all, setAll] = useState(false)
  const rows: Battle[] = all ? model.battles : model.battles.slice(0, BATTLES_SHOWN)
  const date = formatResearchDate(model.share?.checkedAt ?? null, language) ?? ''
  const source = dict.source.scan(date)
  const pos = (p: number | null) => (p == null ? dict.notInTop20 : dict.position(n(p)))

  return (
    <div data-competitive-battles="" className="space-y-4">
      <div>
        <h3 className="text-section font-semibold text-ink">{t.title}</h3>
        <p className="mt-0.5 max-w-prose text-copy text-muted">{t.subtitle}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label={t.aheadTile} value={n(model.counts.wins)} source={source} icon={<CheckCircle2 className="text-ok" />} />
        <StatTile label={t.behindTile} value={n(model.counts.losses)} source={source} icon={<TriangleAlert className="text-bad" />} />
        <StatTile label={t.tiedTile} value={n(model.counts.none + model.counts.ties)} source={source} icon={<CircleSlash />} />
      </div>
      {model.records.length > 0 && (
        <ul className="flex flex-wrap gap-2" data-competitive-records="">
          {model.records.map((r) => (
            <li key={r.domain} data-record={r.domain} className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-control border border-line bg-surface py-1 pe-3 ps-1 text-caption text-body">
              <SiteAvatar domain={r.domain} size="xs" />
              <span dir="ltr" className="truncate font-semibold text-ink">{r.domain}</span>
              <span className="whitespace-nowrap tabular-nums">{t.record(n(r.wins), n(r.losses))}</span>
            </li>
          ))}
        </ul>
      )}
      <Table stackBelowSm>
        <TableHead>
          <tr>
            <Th>{t.colKeyword}</Th>
            <Th>{t.colYou}</Th>
            <Th>{t.colBest}</Th>
            <Th className="text-end">{t.colResult}</Th>
          </tr>
        </TableHead>
        <TableBody>
          {rows.map((b) => (
            <TableRow key={b.targetId}>
              <Td stack="title">
                <span className="block truncate font-medium text-ink" title={b.keyword}>{b.keyword}</span>
                {b.volume != null && <span className="block text-caption text-muted tabular-nums">{t.volume(n(b.volume))}</span>}
              </Td>
              <Td label={t.colYou}><span className={cn('tabular-nums', b.own == null ? 'text-muted' : 'font-semibold text-ink')}>{pos(b.own)}</span></Td>
              <Td label={t.colBest}>
                {b.best ? (
                  <span className="inline-flex max-w-full items-center gap-1.5">
                    <span dir="ltr" className="truncate">{b.best.domain}</span>
                    <span className="shrink-0 font-semibold text-ink tabular-nums">{dict.position(n(b.best.position))}</span>
                  </span>
                ) : <span className="text-muted">{dict.notInTop20}</span>}
              </Td>
              <Td stack="end" className="text-end">
                <span data-outcome={b.outcome}><Badge variant={OUTCOME_BADGE[b.outcome]}>{t.outcome[b.outcome]}</Badge></span>
                <TableMeta>{source}</TableMeta>
              </Td>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {model.battles.length > BATTLES_SHOWN && (
        <div className="flex justify-center">
          <Button type="button" size="sm" variant="secondary" onClick={() => setAll((v) => !v)}>
            {all ? dict.showLess : dict.showMore(n(model.battles.length - BATTLES_SHOWN))}
          </Button>
        </div>
      )}
    </div>
  )
}

/** Competitors the scan found, offered one click each (only where they can be added from here). */
function SuggestedCompetitors({ suggested, onAdd, adding }: { suggested: string[]; onAdd: (domain: string) => void; adding: string | null }) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).researchCompetitive.competitors
  if (suggested.length === 0) return null
  return (
    <div data-competitive-suggested="" className="mx-auto mt-2 w-full max-w-md text-start">
      <p className="mb-2 text-overline font-semibold text-muted">{t.suggestedTitle}</p>
      <ul className="divide-y divide-line rounded-inset border border-line bg-surface">
        {suggested.map((d) => (
          <li key={d} className="flex items-center gap-3 px-3 py-2">
            <SiteAvatar domain={d} size="sm" />
            <span dir="ltr" className="min-w-0 flex-1 truncate text-start text-copy font-medium text-ink rtl:text-end">{d}</span>
            <Button type="button" size="sm" variant="secondary" loading={adding === d} disabled={adding !== null} onClick={() => onAdd(d)} aria-label={t.addAria(d)}>
              {adding !== d && <Plus aria-hidden="true" className="size-4" />}
              {adding === d ? t.adding : t.add}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function CompetitorStanding({ model, domain, siteIcon, manageHref, suggested, onAddCompetitor, addingCompetitor }: {
  model: CompetitiveModel
  domain: string | null
  siteIcon: string | null
  /** Where competitors are managed, or null when that screen is off. */
  manageHref: string | null
  /** Competitors the scan found and the project does not track yet (empty when they cannot be added here). */
  suggested: string[]
  onAddCompetitor: (domain: string) => void
  addingCompetitor: string | null
}) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).researchCompetitive.competitors
  const hasTracked = model.rankingCounts.tracked > 0

  if (model.competitorsState === 'none') {
    return (
      <div data-competitive-state="no-competitors">
        <EmptyState
          icon={<CompetitorIcon />}
          title={t.noneTitle}
          body={t.noneBody}
          action={suggested.length === 0 && manageHref ? <Link href={manageHref} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>{t.manage}</Link> : undefined}
          className="py-8"
        />
        <SuggestedCompetitors suggested={suggested} onAdd={onAddCompetitor} adding={addingCompetitor} />
      </div>
    )
  }
  if (model.competitorsState === 'not_recorded') {
    return (
      <div data-competitive-state={hasTracked ? 'not-recorded' : 'no-tracked'}>
        <EmptyState
          icon={<CompetitorIcon />}
          title={hasTracked ? t.notRecordedTitle : t.noTrackedTitle}
          body={hasTracked ? t.notRecordedBody : t.noTrackedBody}
          className="py-8"
        />
      </div>
    )
  }
  return (
    <div className="space-y-8" data-competitive-state="ready">
      {model.share && <VisibilityShare share={model.share} domain={domain} siteIcon={siteIcon} />}
      <Battles model={model} />
    </div>
  )
}
