'use client'

/**
 * "Which page answers each keyword": the page of the site Google shows for every
 * keyword of the view (Search Console's query → page when it has data, otherwise the
 * URL our check found), with two flags a merchant can act on: no page shows for the
 * keyword (a page to write), or two pages split its impressions (they compete).
 * Each page carries the label of where it came from.
 */
import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatCount } from '@/components/gsc/format'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Segmented from '@/components/ui/Segmented'
import { EmptyRow, Table, TableBody, TableHead, TableRow, Td, Th } from '@/components/ui/Table'
import { COMPETING_MIN_SHARE, type CompetitiveModel, type MappingRow } from '@/lib/keyword-research/competitive'
import { filterMapping, mappingFlagKey, pagePath, type MappingFilter } from './competitive-view'
import { formatShare } from './CompetitorStanding'
import SourceTag from './SourceTag'

export const MAPPING_SHOWN = 25

const FLAG_BADGE = { ok: 'success', no_page: 'warning', no_page_top20: 'warning', competing: 'danger', unknown: 'neutral' } as const

function PageCell({ row }: { row: MappingRow }) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).researchCompetitive.mapping
  if (row.pages.length === 0) return <span className="text-muted">—</span>
  const shown = row.flag === 'competing' ? row.pages.filter((p) => p.share >= COMPETING_MIN_SHARE).slice(0, 3) : row.pages.slice(0, 1)
  return (
    <div className="min-w-0 space-y-1">
      {shown.map((p) => (
        <div key={p.url} className="flex min-w-0 items-center gap-2">
          <a
            href={p.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            dir="ltr"
            title={p.url}
            className="inline-flex min-w-0 max-w-64 items-center gap-1 truncate text-caption text-body underline-offset-2 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
          >
            <span className="truncate">{pagePath(p.url)}</span>
            <ArrowUpRight size={12} aria-hidden="true" className="shrink-0 rtl:-scale-x-100" />
          </a>
          {row.source === 'gsc' && row.flag === 'competing' && (
            <span className="shrink-0 text-caption text-muted tabular-nums">{t.pageShare(formatShare(p.share, language))}</span>
          )}
        </div>
      ))}
      {row.source && <SourceTag source={row.source} short />}
    </div>
  )
}

export default function KeywordMapping({ model }: { model: CompetitiveModel }) {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language).researchCompetitive
  const t = dict.mapping
  const n = (v: number) => formatCount(v, language)
  const [filter, setFilter] = useState<MappingFilter>('all')
  const [all, setAll] = useState(false)
  const filtered = filterMapping(model.mapping, filter)
  const rows = all ? filtered : filtered.slice(0, MAPPING_SHOWN)

  return (
    <div data-competitive-mapping="" className="space-y-4">
      <div>
        <h3 className="text-section font-semibold text-ink">{t.title}</h3>
        <p className="mt-0.5 max-w-prose text-copy text-muted text-pretty">{t.subtitle}</p>
      </div>
      {model.mapping.length === 0 ? (
        <p className="rounded-inset border border-line bg-sunk px-4 py-3 text-copy text-body">{t.empty}</p>
      ) : (
        <>
          <Segmented
            ariaLabel={t.filterLabel}
            value={filter}
            onChange={(v) => { setFilter(v); setAll(false) }}
            className="max-w-full overflow-x-auto"
            options={[
              { value: 'all', label: t.filterAll, count: model.mappingCounts.all },
              { value: 'no_page', label: t.filterNoPage, count: model.mappingCounts.noPage },
              { value: 'competing', label: t.filterCompeting, count: model.mappingCounts.competing },
            ]}
          />
          <Table stackBelowSm>
            <TableHead>
              <tr>
                <Th>{t.colKeyword}</Th>
                <Th>{t.colPage}</Th>
                <Th className="text-end">{t.colStatus}</Th>
              </tr>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? <EmptyRow colSpan={3} message={t.noneFiltered} /> : rows.map((r) => {
                const key = mappingFlagKey(r)
                return (
                  <TableRow key={r.key}>
                    <Td stack="title"><span className="block truncate font-medium text-ink" title={r.keyword}>{r.keyword}</span></Td>
                    <Td label={t.colPage}><PageCell row={r} /></Td>
                    <Td stack="end" className="text-end">
                      <span data-mapping-flag={key}><Badge variant={FLAG_BADGE[key]}>{t.flag[key]}</Badge></span>
                    </Td>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          {filtered.length > MAPPING_SHOWN && (
            <div className="flex justify-center">
              <Button type="button" size="sm" variant="secondary" onClick={() => setAll((v) => !v)}>
                {all ? dict.showLess : dict.showMore(n(filtered.length - MAPPING_SHOWN))}
              </Button>
            </div>
          )}
          {model.mappingCounts.competing > 0 && <p className="text-caption text-muted">{t.competingHow}</p>}
        </>
      )}
    </div>
  )
}
