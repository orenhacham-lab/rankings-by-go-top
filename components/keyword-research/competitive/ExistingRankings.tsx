'use client'

/**
 * "The rankings you already have": the tracked keywords and every Search Console
 * query of the latest 28-day sync, merged by normalized text into ONE row per
 * keyword. Two position columns, each labelled with its source once in its header
 * (and on a phone, on the value itself): our check's exact position, and Search
 * Console's 28-day average. A query only Search Console knows gets "track
 * precisely", which adds it to our check in one click.
 *
 * Without Search Console the tracked keywords still show, above one sentence on
 * what connecting adds and the one button that connects it.
 */
import { useState } from 'react'
import { Check, ScanSearch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatCount, formatPosition } from '@/components/gsc/format'
import { formatResearchDate } from '@/lib/keyword-research/format'
import GscSetupPrompt from '@/components/gsc/GscSetupPrompt'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Segmented from '@/components/ui/Segmented'
import { EmptyRow, Table, TableBody, TableHead, TableRow, Td, Th } from '@/components/ui/Table'
import type { CompetitiveModel, RankingRow } from '@/lib/keyword-research/competitive'
import { filterRankings, type RankingsFilter, type RankingsSource } from './competitive-view'
import SourceTag from './SourceTag'

export const RANKINGS_SHOWN = 25

export default function ExistingRankings({ model, gsc, gscRun, projectId, onTrack, tracking, justTracked, heading = true }: {
  model: CompetitiveModel
  gsc: RankingsSource
  gscRun: { startDate: string | null; endDate: string | null } | null
  projectId: string
  onTrack: (row: RankingRow) => void
  /** Keys being added right now. */
  tracking: ReadonlySet<string>
  /** Keys added in this visit (their exact position comes with the next check). */
  justTracked: ReadonlySet<string>
  /** False inside a Fold, whose button already is the title. */
  heading?: boolean
}) {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language).researchCompetitive
  const t = dict.rankings
  const n = (v: number) => formatCount(v, language)
  const [filter, setFilter] = useState<RankingsFilter>('all')
  const [all, setAll] = useState(false)
  const filtered = filterRankings(model.rankings, filter)
  const rows = all ? filtered : filtered.slice(0, RANKINGS_SHOWN)
  const gscReady = gsc === 'ready'
  const from = formatResearchDate(gscRun?.startDate ?? null, language)
  const to = formatResearchDate(gscRun?.endDate ?? null, language)

  const scanCell = (r: RankingRow) => {
    if (!r.scan) return <span className="text-muted">—</span>
    if (!r.scan.checkedAt) return <span className="text-muted">{dict.notChecked}</span>
    const date = formatResearchDate(r.scan.checkedAt, language) ?? ''
    return (
      <span title={dict.source.scan(date)} className="inline-flex flex-col">
        <span className={cn('tabular-nums', r.scan.position == null ? 'text-muted' : 'font-semibold text-ink')}>
          {r.scan.position == null ? dict.notInTop20 : dict.position(n(r.scan.position))}
        </span>
        <span className="text-caption text-muted">{date}</span>
      </span>
    )
  }
  const gscCell = (r: RankingRow) => (r.gsc
    ? <span title={dict.source.gsc} className="font-semibold text-ink tabular-nums">{dict.avgPosition(formatPosition(r.gsc.position, language))}</span>
    : <span className="text-muted">—</span>)

  return (
    <div data-competitive-rankings="" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          {heading && <h3 className="text-section font-semibold text-ink">{t.title}</h3>}
          <p className={heading ? 'mt-0.5 max-w-prose text-copy text-muted text-pretty' : 'max-w-prose text-copy text-muted text-pretty'}>{t.subtitle}</p>
        </div>
        {gscReady && from && to && <p className="shrink-0 text-caption text-muted">{t.gscRange(from, to)}</p>}
      </div>

      {gsc !== 'ready' && gsc !== 'disabled' && (
        <div data-competitive-gsc={gsc} className="rounded-inset border border-line bg-sunk px-4 py-3">
          <GscSetupPrompt state={gsc} about={t.gscAbout} projectId={projectId} layout="inline" />
        </div>
      )}

      {model.rankings.length === 0 ? (
        <p data-competitive-rankings-empty="" className="rounded-inset border border-line bg-sunk px-4 py-3 text-copy text-body">{t.empty}</p>
      ) : (
        <>
          {gscReady && (
            <Segmented
              ariaLabel={t.filterLabel}
              value={filter}
              onChange={(v) => { setFilter(v); setAll(false) }}
              className="max-w-full overflow-x-auto"
              options={[
                { value: 'all', label: t.filterAll, count: model.rankingCounts.all },
                { value: 'tracked', label: t.filterTracked, count: model.rankingCounts.tracked },
                { value: 'gsc', label: t.filterGscOnly, count: model.rankingCounts.gscOnly },
              ]}
            />
          )}
          <Table stackBelowSm>
            <TableHead>
              <tr>
                <Th>{t.colKeyword}</Th>
                <Th><span className="inline-flex items-center gap-2">{t.colScan}<SourceTag source="scan" short /></span></Th>
                {gscReady && <Th><span className="inline-flex items-center gap-2">{t.colGsc}<SourceTag source="gsc" short /></span></Th>}
                {gscReady && <Th hideBelow="md">{t.colClicks}</Th>}
                <Th className="w-40"><span className="sr-only">{t.track}</span></Th>
              </tr>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? <EmptyRow colSpan={gscReady ? 5 : 3} message={t.noneFiltered} /> : rows.map((r) => {
                const busy = tracking.has(r.key)
                const added = justTracked.has(r.key)
                return (
                  <TableRow key={r.key}>
                    <Td stack="title">
                      <span className="block truncate font-medium text-ink" title={r.keyword}>{r.keyword}</span>
                      {r.gsc && <span className="block text-caption text-muted tabular-nums md:hidden">{t.clicksLine(n(r.gsc.clicks), n(r.gsc.impressions))}</span>}
                    </Td>
                    <Td label={`${t.colScan} · ${dict.source.scanShort}`}>{scanCell(r)}</Td>
                    {gscReady && <Td label={`${t.colGsc} · ${dict.source.gscShort}`}>{gscCell(r)}</Td>}
                    {gscReady && (
                      <Td hideBelow="md">
                        {r.gsc ? <span className="text-caption text-body tabular-nums">{t.clicksLine(n(r.gsc.clicks), n(r.gsc.impressions))}</span> : <span className="text-muted">—</span>}
                      </Td>
                    )}
                    <Td stack="end" className="text-end">
                      {r.scan || added ? (
                        <span data-ranking-tracked=""><Badge variant="info"><Check size={12} strokeWidth={3} aria-hidden="true" />{t.tracked}</Badge></span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          loading={busy}
                          disabled={busy}
                          onClick={() => onTrack(r)}
                          aria-label={t.trackAria(r.keyword)}
                          title={t.trackHint}
                          data-track-precisely=""
                        >
                          {!busy && <ScanSearch aria-hidden="true" className="size-4 text-action" />}
                          {busy ? t.tracking : t.track}
                        </Button>
                      )}
                    </Td>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          {filtered.length > RANKINGS_SHOWN && (
            <div className="flex justify-center">
              <Button type="button" size="sm" variant="secondary" onClick={() => setAll((v) => !v)}>
                {all ? dict.showLess : dict.showMore(n(filtered.length - RANKINGS_SHOWN))}
              </Button>
            </div>
          )}
          {gscReady && model.rankingCounts.gscOnly > 0 && <p className="text-caption text-muted">{t.trackHint}</p>}
        </>
      )}
    </div>
  )
}
