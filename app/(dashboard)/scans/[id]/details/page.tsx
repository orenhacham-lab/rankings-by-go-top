'use client'

import { Fragment, useState, useEffect, use, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ScanResult } from '@/lib/supabase/types'
import Header from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import BackLink from '@/components/ui/BackLink'
import Notice from '@/components/ui/Notice'
import EmptyState from '@/components/ui/EmptyState'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/Table'
import ScanAuditDetails from '@/components/scans/ScanAuditDetails'
import { ChevronDown, SearchX } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import Badge from '@/components/ui/Badge'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { EngineChip } from '@/components/scans/ScanHistory'
import { scanHistoryHref } from '@/lib/scans/history-href'

export default function ScanDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="py-20 text-center text-muted">…</div>}>
      <ScanDetailsContent params={params} />
    </Suspense>
  )
}

function ScanDetailsContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const searchParams = useSearchParams()
  const resultId = searchParams.get('resultId')
  const targetId = searchParams.get('targetId')
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const t = dict.scans.details

  const [results, setResults] = useState<ScanResult[]>([])
  const [projectId, setProjectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedRawId, setExpandedRawId] = useState<string | null>(null)
  // The row whose technical breakdown is open; one opened by a link (?resultId=) starts open.
  const [openId, setOpenId] = useState<string | null>(resultId)

  useEffect(() => {
    async function loadData() {
      const supabase = createClient()
      let query = supabase.from('scan_results').select('*').eq('scan_id', id)
      if (resultId) {
        query = query.eq('id', resultId)
      } else if (targetId) {
        query = query.eq('tracking_target_id', targetId)
      }
      const [{ data: scanData }, { data: resultsData, error }] = await Promise.all([
        supabase.from('scans').select('project_id').eq('id', id).single(),
        query.order('checked_at', { ascending: false }),
      ])

      if (error) {
        console.error('Error loading scan results:', error)
      }
      setProjectId(scanData?.project_id || null)
      setResults(resultsData || [])
      setLoading(false)
    }
    loadData()
  }, [id, resultId, targetId])

  if (loading) {
    return <TableSkeleton label={dict.scans.loading} rows={3} />
  }

  // Back to where this page was opened from: one keyword's result comes from
  // Keywords (its table or its check history), a whole run from the check
  // history, which is a section of Keywords now that the Scans tab is gone.
  const fromKeyword = !!(resultId || targetId)
  const backHref = fromKeyword
    ? (projectId ? `/keywords?projectId=${encodeURIComponent(projectId)}` : '/keywords')
    : scanHistoryHref(projectId)
  const backLabel = fromKeyword ? t.backToKeywords : t.backToHistory
  // One notice for the whole page, not a copy on every result without a breakdown.
  const someWithoutAudit = results.some((r) => !(r.audit_request || r.audit_response || r.audit_decision))

  const header = (
    <>
      <div className="mb-3"><BackLink href={backHref}>{backLabel}</BackLink></div>
      <Header title={t.title} subtitle={t.subtitle} />
    </>
  )

  if (results.length === 0) {
    return (
      <div>
        {header}
        <Card padding={false}>
          <EmptyState icon={<SearchX />} title={t.noResults} />
        </Card>
      </div>
    )
  }

  // One row per checked keyword (§6); the technical breakdown opens under its row.
  return (
    <div>
      {header}

      {someWithoutAudit && (
        <div data-audit-notice="" className="mb-6"><Notice tone="info">{t.noAuditData}</Notice></div>
      )}

      <Table>
        <TableHead>
          <tr>
            <Th>{t.colKeyword}</Th>
            <Th className="hidden sm:table-cell">{t.colEngine}</Th>
            <Th className="hidden md:table-cell">{t.colChecked}</Th>
            <Th className="text-end">{t.colResult}</Th>
            <Th className="w-12"><span className="sr-only">{t.technical}</span></Th>
          </tr>
        </TableHead>
        <TableBody>
          {results.map((result) => {
            const hasAudit = Boolean(result.audit_request || result.audit_response || result.audit_decision)
            const open = openId === result.id
            return (
              <Fragment key={result.id}>
                <TableRow className="h-14">
                  <Td className="max-w-72">
                    <span className="block truncate font-medium text-ink" title={result.keyword}>{result.keyword}</span>
                    {/* On a phone the engine and the time sit under the keyword. */}
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-caption text-muted md:hidden">
                      <span className="sm:hidden"><EngineChip engine={result.engine_type} /></span>
                      <span className="tabular-nums">{t.checkedAt(formatDateTime(result.checked_at))}</span>
                    </span>
                  </Td>
                  <Td className="hidden sm:table-cell"><EngineChip engine={result.engine_type} /></Td>
                  <Td className="hidden whitespace-nowrap text-caption text-muted tabular-nums md:table-cell">{formatDateTime(result.checked_at, language)}</Td>
                  <Td className="text-end">
                    {/* A failed check says so in words, never the provider's. */}
                    <Badge variant={result.found ? 'success' : 'neutral'}>
                      {result.found ? `${t.positionPrefix} #${result.position}` : t.notFound}
                    </Badge>
                    {result.error_message && (
                      <p className="mt-1 max-w-56 text-caption text-warn ms-auto">{t.checkFailed}</p>
                    )}
                  </Td>
                  <Td className="w-12 text-end">
                    {hasAudit && (
                      <button
                        type="button"
                        onClick={() => setOpenId(open ? null : result.id)}
                        aria-expanded={open}
                        aria-label={t.showTechnical(result.keyword)}
                        title={t.technical}
                        className="grid size-8 place-items-center rounded-control text-muted transition-colors duration-150 ease-snappy hover:bg-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
                      >
                        <ChevronDown aria-hidden="true" className={`size-4 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                  </Td>
                </TableRow>
                {hasAudit && open && (
                  <tr className="bg-sunk/40">
                    <td colSpan={5} className="px-4 py-5 sm:px-6">
                      <h3 className="mb-4 text-copy font-semibold text-ink">{t.technical}</h3>
                      <ScanAuditDetails result={result} t={t} expandedRawId={expandedRawId} setExpandedRawId={setExpandedRawId} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
