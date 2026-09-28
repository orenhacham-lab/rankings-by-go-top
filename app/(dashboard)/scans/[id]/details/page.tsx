'use client'
/* The audit columns are free-form JSON written by the scanner's versions over
   time; they are read field by field below, as they always were. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, use, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ScanResult } from '@/lib/supabase/types'
import Header from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { formatDateTime } from '@/lib/utils'
import Badge from '@/components/ui/Badge'
import Link from 'next/link'
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

  if (results.length === 0) {
    return (
      <div>
        <Header
          title={t.title}
          subtitle={t.subtitle}
          actions={
            <Link href={backHref}>
              <Button variant="outline" size="sm">{backLabel}</Button>
            </Link>
          }
        />
        <Card>
          <div className="p-6 text-center text-muted">{t.noResults}</div>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <Header
        title={t.title}
        subtitle={t.subtitle}
        actions={
          <Link href={backHref}>
            <Button variant="outline" size="sm">{backLabel}</Button>
          </Link>
        }
      />

      {someWithoutAudit && (
        <p data-audit-notice="" className="mb-6 rounded-control border border-info/20 bg-info-soft px-4 py-3 text-copy text-info">
          {t.noAuditData}
        </p>
      )}

      <div className="space-y-6">
        {results.map((result) => {
          const hasAudit = Boolean(result.audit_request || result.audit_response || result.audit_decision)
          const auditRequest = result.audit_request as any
          const auditResponse = result.audit_response as any
          const auditDecision = result.audit_decision as any
          const auditVersion = result.audit_scanner_version

          return (
            <Card key={result.id} padding={false} className="overflow-hidden">
              <div className="p-6 space-y-6">
                {/* The keyword, which engine checked it and when, and what it found.
                    The engine chip is what tells a Maps row from an organic one of the
                    same keyword. A failed check says so in words, never the provider's. */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-section font-semibold text-ink">{result.keyword}</h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-caption text-muted">
                      <EngineChip engine={result.engine_type} />
                      <span>{t.checkedAt(formatDateTime(result.checked_at))}</span>
                    </div>
                  </div>
                  <div className="text-end">
                    <Badge variant={result.found ? 'success' : 'neutral'}>
                      {result.found ? `${t.positionPrefix} #${result.position}` : t.notFound}
                    </Badge>
                    {result.error_message && (
                      <p className="mt-2 max-w-xs text-caption text-warn">{t.checkFailed}</p>
                    )}
                  </div>
                </div>

                {hasAudit && (
                  <details className="group rounded-control border border-line">
                  <summary className="cursor-pointer select-none px-4 py-2.5 text-copy font-semibold text-ink hover:bg-sunk/60">{t.technical}</summary>
                  <div className="space-y-6 border-t border-line p-4">
                    {/* Request Section */}
                    {auditRequest && (
                      <div>
                        <h4 className="font-semibold text-ink mb-3">{t.auditRequest}</h4>
                        <div className="bg-sunk p-4 rounded-control space-y-2 text-sm">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-muted">keyword:</span>
                              <div className="font-mono text-ink">{auditRequest.keyword}</div>
                            </div>
                            <div>
                              <span className="text-muted">engine:</span>
                              <div className="font-mono text-ink">{auditRequest.engine}</div>
                            </div>
                            <div>
                              <span className="text-muted">project city:</span>
                              <div className="font-mono text-ink">{auditRequest.projectCity || '(none)'}</div>
                            </div>
                            <div>
                              <span className="text-muted">country:</span>
                              <div className="font-mono text-ink">{auditRequest.projectCountry}</div>
                            </div>
                            <div>
                              <span className="text-muted">location_sent:</span>
                              <div className="font-mono text-ink">{auditRequest.locationSent || '(none)'}</div>
                            </div>
                            <div>
                              <span className="text-muted">ll_sent:</span>
                              <div className="font-mono text-ink">{auditRequest.llSent || '(none)'}</div>
                            </div>
                            <div>
                              <span className="text-muted">gl:</span>
                              <div className="font-mono text-ink">{auditRequest.gl}</div>
                            </div>
                            <div>
                              <span className="text-muted">hl:</span>
                              <div className="font-mono text-ink">{auditRequest.hl}</div>
                            </div>
                            {auditRequest.scanner_version && (
                              <div>
                                <span className="text-muted">scanner_version:</span>
                                <div className="font-mono text-ink">{auditRequest.scanner_version}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Response Section */}
                    {auditResponse && (
                      <div>
                        <h4 className="font-semibold text-ink mb-3">{t.auditResponse}</h4>
                        <div className="bg-sunk p-4 rounded-control space-y-3 text-sm">
                          <div>
                            <span className="text-muted">searchParameters.location:</span>
                            <div className="font-mono text-ink">{auditResponse.searchParameters?.location || '(none)'}</div>
                          </div>
                          <div>
                            <span className="text-muted">searchParameters.ll:</span>
                            <div className="font-mono text-ink">{auditResponse.searchParameters?.ll || '(none)'}</div>
                          </div>
                          <div>
                            <span className="text-muted">places_count:</span>
                            <div className="font-mono text-ink">{auditResponse.placesCount || 0}</div>
                          </div>
                          {auditResponse.placesSample && auditResponse.placesSample.length > 0 && (
                            <div>
                              <span className="text-muted">top 10 place titles:</span>
                              <ul className="mt-2 space-y-1 ms-4">
                                {auditResponse.placesSample.map((place: any, idx: number) => (
                                  <li key={idx} className="text-body">• {place.title || '(no title)'}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Decision Section */}
                    {auditDecision && (
                      <div>
                        <h4 className="font-semibold text-ink mb-3">{t.auditDecision}</h4>
                        <div className="bg-sunk p-4 rounded-control space-y-3 text-sm">
                          <div>
                            <span className="text-muted">found:</span>
                            <div className="font-mono text-ink">{auditDecision.found ? 'yes' : 'no'}</div>
                          </div>
                          {auditDecision.found && (
                            <>
                              <div>
                                <span className="text-muted">matched title:</span>
                                <div className="font-mono text-ink">{auditDecision.matchedTitle || '(none)'}</div>
                              </div>
                              <div>
                                <span className="text-muted">matched position:</span>
                                <div className="font-mono text-ink">
                                  #{auditDecision.matchedPosition}
                                  {auditDecision.position_source && (
                                    <span className="text-muted text-xs ms-2">({auditDecision.position_source})</span>
                                  )}
                                </div>
                              </div>
                              <div>
                                <span className="text-muted">matched address:</span>
                                <div className="font-mono text-ink">{auditDecision.matchedAddress || '(none)'}</div>
                              </div>
                            </>
                          )}
                          {!auditDecision.grid_enabled && (
                            <div>
                              <span className="text-muted">geo validation result:</span>
                              <div className="font-mono text-ink">{auditDecision.geoValidationPassed ? 'passed' : 'failed'}</div>
                            </div>
                          )}
                          {auditDecision.rejectionReason && (
                            <div>
                              <span className="text-bad">rejection reason:</span>
                              <div className="font-mono text-bad">{auditDecision.rejectionReason}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Grid Results Section */}
                    {auditDecision?.grid_enabled && (
                      <div>
                        <h4 className="font-semibold text-ink mb-3">
                          Grid Scan — {auditDecision.grid_size} ({auditDecision.executed_points || auditDecision.per_point_results?.length || 0} executed{auditDecision.early_stopped && `, ${auditDecision.skipped_points} skipped`})
                        </h4>

                        {auditDecision.early_stopped && (
                          <div className="bg-warn-soft border border-warn/20 rounded-control p-3 mb-4 text-caption text-warn">
                            <strong>Early stop:</strong> {auditDecision.early_stop_reason}
                          </div>
                        )}

                        {/* Summary metrics */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                          {[
                            { label: 'Best position', value: auditDecision.best_position != null ? `#${auditDecision.best_position}` : '—' },
                            { label: 'Avg position', value: auditDecision.avg_position != null ? `#${auditDecision.avg_position}` : '—',
                              sub: auditDecision.avg_position_mode },
                            { label: 'Worst position', value: auditDecision.worst_position != null ? `#${auditDecision.worst_position}` : '—' },
                            { label: 'Coverage', value: auditDecision.coverage != null
                              ? `${Math.round(auditDecision.coverage * 100)}%`
                              : '—',
                              sub: `${auditDecision.per_point_results?.filter((p: any) => p.found).length || 0} / ${auditDecision.executed_points || auditDecision.per_point_results?.length || 0} points` },
                          ].map((m, i) => (
                            <div key={i} className="bg-sunk p-3 rounded-control text-sm">
                              <div className="text-muted text-xs mb-1">{m.label}</div>
                              <div className="font-mono font-semibold text-ink">{m.value}</div>
                              {m.sub && <div className="text-muted text-xs mt-0.5">{m.sub}</div>}
                            </div>
                          ))}
                        </div>

                        {/* Per-point results */}
                        {auditDecision.per_point_results && auditDecision.per_point_results.length > 0 && (
                          <div className="space-y-3">
                            {auditDecision.per_point_results.map((pt: any, idx: number) => (
                              <div key={idx} className={`p-3 rounded-control border-s-4 ${pt.found ? 'bg-ok-soft border-ok/40' : 'bg-sunk border-line-strong'}`}>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-semibold text-body text-sm">
                                    #{pt.point_index + 1} {pt.label}
                                    <span className="font-normal text-muted ms-2 text-xs">{pt.lat}, {pt.lng}</span>
                                  </span>
                                  <span className={`font-mono font-semibold text-sm ${pt.found ? 'text-ok' : 'text-muted'}`}>
                                    {pt.found ? `#${pt.position}` : 'not found'}
                                  </span>
                                </div>

                                {/* Match Status Debug */}
                                <div className="bg-surface p-2 rounded-control text-xs space-y-1 mb-2">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <span className="text-muted">business_returned:</span>
                                      <span className="font-mono ms-1">{pt.business_returned ? 'yes' : 'no'}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted">business_rejected:</span>
                                      <span className="font-mono ms-1">{pt.business_rejected ? 'yes' : 'no'}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted">places_checked_count:</span>
                                      <span className="font-mono ms-1">{pt.places_checked_count || pt.places_count || '—'}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted">checked_all_places:</span>
                                      <span className="font-mono ms-1">{pt.target_checked_against_all_places ? 'yes' : 'no'}</span>
                                    </div>
                                  </div>
                                  {pt.rejection_reason && (
                                    <div className="text-bad">
                                      <span>rejection reason:</span>
                                      <span className="font-mono ms-1">{pt.rejection_reason}</span>
                                    </div>
                                  )}
                                  {pt.result_signature && (
                                    <div className="text-muted border-t border-line pt-1 mt-1">
                                      <span className="text-muted">signature:</span>
                                      <div className="font-mono text-body break-all text-xs mt-0.5">{pt.result_signature}</div>
                                    </div>
                                  )}
                                </div>

                                {/* Top Places */}
                                {pt.top_places && pt.top_places.length > 0 && (
                                  <div className="bg-surface p-2 rounded-control text-xs mb-2">
                                    <div className="text-muted font-semibold mb-1">Top {pt.top_places.length} places:</div>
                                    <ul className="space-y-0.5 ms-2">
                                      {pt.top_places.map((place: any, pidx: number) => (
                                        <li key={pidx} className="text-body">
                                          #{place.position}: {place.title}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {pt.found && pt.matched_title && (
                                  <div className="text-muted text-xs mt-1">
                                    <strong>Matched:</strong> {pt.matched_title}{pt.matched_address ? ` — ${pt.matched_address}` : ''}
                                  </div>
                                )}
                                <div className="text-muted text-xs mt-1">{pt.places_count} places returned</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Attempts Section — only for non-grid scans */}
                    {!auditDecision?.grid_enabled && auditDecision?.attempts && auditDecision.attempts.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-ink mb-3">Attempts ({auditDecision.attempts.length})</h4>
                        <div className="space-y-3">
                          {auditDecision.attempts.map((attempt: any, idx: number) => (
                            <div key={idx} className="bg-sunk p-3 rounded-control text-sm border-s-4 border-line-strong">
                              <div className="font-semibold text-ink mb-2">#{attempt.attemptNumber}: {attempt.context}</div>
                              <div className="grid grid-cols-2 gap-2 text-body">
                                <div>location: <span className="font-mono">{attempt.location || '(none)'}</span></div>
                                <div>ll: <span className="font-mono">{attempt.ll || '(none)'}</span></div>
                                <div>found: <span className="font-mono">{attempt.found ? 'yes' : 'no'}</span></div>
                                <div>geo_validation: <span className="font-mono">{attempt.geoValidationPassed !== undefined ? (attempt.geoValidationPassed ? 'passed' : 'failed') : '—'}</span></div>
                                {attempt.rejectionReason && (
                                  <div className="col-span-2 text-bad">
                                    reason: <span className="font-mono">{attempt.rejectionReason}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Raw Response Section */}
                    {auditResponse?.rawResponse && (
                      <div>
                        <button
                          onClick={() => setExpandedRawId(expandedRawId === result.id ? null : result.id)}
                          className="font-semibold text-ink hover:text-action text-sm flex items-center gap-1"
                        >
                          {expandedRawId === result.id ? '▼' : '▶'} Raw Response
                        </button>
                        {expandedRawId === result.id && (
                          <div className="bg-contrast text-contrast-ink p-4 rounded-control mt-2 overflow-x-auto text-xs font-mono max-h-96 overflow-y-auto">
                            {typeof auditResponse.rawResponse === 'string'
                              ? auditResponse.rawResponse
                              : JSON.stringify(auditResponse.rawResponse, null, 2)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Scanner Version */}
                    {auditVersion && (
                      <div className="border-t border-line pt-4 text-xs">
                        <span className="text-muted">scanner version:</span>
                        <div className="font-mono text-ink bg-sunk p-2 rounded-control mt-1">{auditVersion}</div>
                      </div>
                    )}
                  </div>
                  </details>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
