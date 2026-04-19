'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ScanResult } from '@/lib/supabase/types'
import Header from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { formatDateTime } from '@/lib/utils'
import Badge from '@/components/ui/Badge'

export default function ScanDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [results, setResults] = useState<ScanResult[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRawId, setExpandedRawId] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('scan_results')
        .select('*')
        .eq('scan_id', id)
        .order('checked_at', { ascending: false })

      if (error) {
        console.error('Error loading scan results:', error)
      }
      setResults(data || [])
      setLoading(false)
    }
    loadData()
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin ml-2" />
        טוען...
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div>
        <Header title="פרטי סריקה" subtitle="תיעוד מלא של תוצאות הסריקה" />
        <Card>
          <div className="p-6 text-center text-slate-500">אין תוצאות סריקה</div>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <Header title="פרטי סריקה" subtitle="תיעוד מלא של תוצאות הסריקה" />

      <div className="space-y-6">
        {results.map((result) => {
          const hasAudit = Boolean(result.audit_request || result.audit_response || result.audit_decision)
          const auditRequest = result.audit_request as any
          const auditResponse = result.audit_response as any
          const auditDecision = result.audit_decision as any
          const auditVersion = result.audit_scanner_version

          return (
            <Card key={result.id} className="overflow-hidden">
              <div className="p-6 space-y-6">
                {/* Header */}
                <div className="flex items-start justify-between border-b pb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{result.keyword}</h3>
                    <div className="text-sm text-slate-500 mt-2">
                      תעודה: {formatDateTime(result.checked_at)}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={result.found ? 'success' : 'neutral'}>
                      {result.found ? `מיקום #${result.position}` : 'לא נמצא'}
                    </Badge>
                    {result.error_message && (
                      <div className="text-sm text-red-600 mt-2">שגיאה: {result.error_message}</div>
                    )}
                  </div>
                </div>

                {!hasAudit ? (
                  <div className="bg-amber-50 border border-amber-200 rounded p-4">
                    <p className="text-amber-800 text-sm">No audit data stored for this scan</p>
                  </div>
                ) : (
                  <>
                    {/* Request Section */}
                    {auditRequest && (
                      <div>
                        <h4 className="font-semibold text-slate-900 mb-3">Request</h4>
                        <div className="bg-slate-50 p-4 rounded space-y-2 text-sm">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-slate-600">keyword:</span>
                              <div className="font-mono text-slate-900">{auditRequest.keyword}</div>
                            </div>
                            <div>
                              <span className="text-slate-600">engine:</span>
                              <div className="font-mono text-slate-900">{auditRequest.engine}</div>
                            </div>
                            <div>
                              <span className="text-slate-600">project city:</span>
                              <div className="font-mono text-slate-900">{auditRequest.projectCity || '(none)'}</div>
                            </div>
                            <div>
                              <span className="text-slate-600">country:</span>
                              <div className="font-mono text-slate-900">{auditRequest.projectCountry}</div>
                            </div>
                            <div>
                              <span className="text-slate-600">location_sent:</span>
                              <div className="font-mono text-slate-900">{auditRequest.locationSent || '(none)'}</div>
                            </div>
                            <div>
                              <span className="text-slate-600">ll_sent:</span>
                              <div className="font-mono text-slate-900">{auditRequest.llSent || '(none)'}</div>
                            </div>
                            <div>
                              <span className="text-slate-600">gl:</span>
                              <div className="font-mono text-slate-900">{auditRequest.gl}</div>
                            </div>
                            <div>
                              <span className="text-slate-600">hl:</span>
                              <div className="font-mono text-slate-900">{auditRequest.hl}</div>
                            </div>
                            {auditRequest.scanner_version && (
                              <div>
                                <span className="text-slate-600">scanner_version:</span>
                                <div className="font-mono text-slate-900">{auditRequest.scanner_version}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Response Section */}
                    {auditResponse && (
                      <div>
                        <h4 className="font-semibold text-slate-900 mb-3">Response</h4>
                        <div className="bg-slate-50 p-4 rounded space-y-3 text-sm">
                          <div>
                            <span className="text-slate-600">searchParameters.location:</span>
                            <div className="font-mono text-slate-900">{auditResponse.searchParameters?.location || '(none)'}</div>
                          </div>
                          <div>
                            <span className="text-slate-600">searchParameters.ll:</span>
                            <div className="font-mono text-slate-900">{auditResponse.searchParameters?.ll || '(none)'}</div>
                          </div>
                          <div>
                            <span className="text-slate-600">places_count:</span>
                            <div className="font-mono text-slate-900">{auditResponse.placesCount || 0}</div>
                          </div>
                          {auditResponse.placesSample && auditResponse.placesSample.length > 0 && (
                            <div>
                              <span className="text-slate-600">top 10 place titles:</span>
                              <ul className="mt-2 space-y-1 ml-4">
                                {auditResponse.placesSample.map((place: any, idx: number) => (
                                  <li key={idx} className="text-slate-700">• {place.title || '(no title)'}</li>
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
                        <h4 className="font-semibold text-slate-900 mb-3">Decision</h4>
                        <div className="bg-slate-50 p-4 rounded space-y-3 text-sm">
                          <div>
                            <span className="text-slate-600">found:</span>
                            <div className="font-mono text-slate-900">{auditDecision.found ? 'yes' : 'no'}</div>
                          </div>
                          {auditDecision.found && (
                            <>
                              <div>
                                <span className="text-slate-600">matched title:</span>
                                <div className="font-mono text-slate-900">{auditDecision.matchedTitle || '(none)'}</div>
                              </div>
                              <div>
                                <span className="text-slate-600">matched position:</span>
                                <div className="font-mono text-slate-900">
                                  #{auditDecision.matchedPosition}
                                  {auditDecision.position_source && (
                                    <span className="text-slate-500 text-xs ml-2">({auditDecision.position_source})</span>
                                  )}
                                </div>
                              </div>
                              <div>
                                <span className="text-slate-600">matched address:</span>
                                <div className="font-mono text-slate-900">{auditDecision.matchedAddress || '(none)'}</div>
                              </div>
                            </>
                          )}
                          {!auditDecision.grid_enabled && (
                            <div>
                              <span className="text-slate-600">geo validation result:</span>
                              <div className="font-mono text-slate-900">{auditDecision.geoValidationPassed ? 'passed' : 'failed'}</div>
                            </div>
                          )}
                          {auditDecision.rejectionReason && (
                            <div>
                              <span className="text-red-600">rejection reason:</span>
                              <div className="font-mono text-red-700">{auditDecision.rejectionReason}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Grid Results Section */}
                    {auditDecision?.grid_enabled && (
                      <div>
                        <h4 className="font-semibold text-slate-900 mb-3">
                          Grid Scan — {auditDecision.grid_size} ({auditDecision.per_point_results?.length || 0} points)
                        </h4>

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
                              sub: `${auditDecision.per_point_results?.filter((p: any) => p.found).length || 0} / ${auditDecision.per_point_results?.length || 0} points` },
                          ].map((m, i) => (
                            <div key={i} className="bg-slate-50 p-3 rounded text-sm">
                              <div className="text-slate-500 text-xs mb-1">{m.label}</div>
                              <div className="font-mono font-semibold text-slate-900">{m.value}</div>
                              {m.sub && <div className="text-slate-400 text-xs mt-0.5">{m.sub}</div>}
                            </div>
                          ))}
                        </div>

                        {/* Per-point results */}
                        {auditDecision.per_point_results && auditDecision.per_point_results.length > 0 && (
                          <div className="space-y-3">
                            {auditDecision.per_point_results.map((pt: any, idx: number) => (
                              <div key={idx} className={`p-3 rounded border-l-4 ${pt.found ? 'bg-green-50 border-green-400' : 'bg-slate-50 border-slate-300'}`}>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-semibold text-slate-700 text-sm">
                                    #{pt.point_index + 1} {pt.label}
                                    <span className="font-normal text-slate-400 ml-2 text-xs">{pt.lat}, {pt.lng}</span>
                                  </span>
                                  <span className={`font-mono font-semibold text-sm ${pt.found ? 'text-green-700' : 'text-slate-400'}`}>
                                    {pt.found ? `#${pt.position}` : 'not found'}
                                  </span>
                                </div>

                                {/* Match Status Debug */}
                                <div className="bg-white p-2 rounded text-xs space-y-1 mb-2">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <span className="text-slate-600">business_returned:</span>
                                      <span className="font-mono ml-1">{pt.business_returned ? 'yes' : 'no'}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-600">business_rejected:</span>
                                      <span className="font-mono ml-1">{pt.business_rejected ? 'yes' : 'no'}</span>
                                    </div>
                                  </div>
                                  {pt.rejection_reason && (
                                    <div className="text-red-600">
                                      <span>rejection reason:</span>
                                      <span className="font-mono ml-1">{pt.rejection_reason}</span>
                                    </div>
                                  )}
                                </div>

                                {/* Top Places */}
                                {pt.top_places && pt.top_places.length > 0 && (
                                  <div className="bg-white p-2 rounded text-xs mb-2">
                                    <div className="text-slate-600 font-semibold mb-1">Top {pt.top_places.length} places:</div>
                                    <ul className="space-y-0.5 ml-2">
                                      {pt.top_places.map((place: any, pidx: number) => (
                                        <li key={pidx} className="text-slate-700">
                                          #{place.position}: {place.title}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {pt.found && pt.matched_title && (
                                  <div className="text-slate-600 text-xs mt-1">
                                    <strong>Matched:</strong> {pt.matched_title}{pt.matched_address ? ` — ${pt.matched_address}` : ''}
                                  </div>
                                )}
                                <div className="text-slate-400 text-xs mt-1">{pt.places_count} places returned</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Attempts Section — only for non-grid scans */}
                    {!auditDecision?.grid_enabled && auditDecision?.attempts && auditDecision.attempts.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-slate-900 mb-3">Attempts ({auditDecision.attempts.length})</h4>
                        <div className="space-y-3">
                          {auditDecision.attempts.map((attempt: any, idx: number) => (
                            <div key={idx} className="bg-slate-50 p-3 rounded text-sm border-l-4 border-slate-300">
                              <div className="font-semibold text-slate-900 mb-2">#{attempt.attemptNumber}: {attempt.context}</div>
                              <div className="grid grid-cols-2 gap-2 text-slate-700">
                                <div>location: <span className="font-mono">{attempt.location || '(none)'}</span></div>
                                <div>ll: <span className="font-mono">{attempt.ll || '(none)'}</span></div>
                                <div>found: <span className="font-mono">{attempt.found ? 'yes' : 'no'}</span></div>
                                <div>geo_validation: <span className="font-mono">{attempt.geoValidationPassed !== undefined ? (attempt.geoValidationPassed ? 'passed' : 'failed') : '—'}</span></div>
                                {attempt.rejectionReason && (
                                  <div className="col-span-2 text-red-600">
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
                          className="font-semibold text-slate-900 hover:text-blue-600 text-sm flex items-center gap-1"
                        >
                          {expandedRawId === result.id ? '▼' : '▶'} Raw Response
                        </button>
                        {expandedRawId === result.id && (
                          <div className="bg-slate-900 text-slate-100 p-4 rounded mt-2 overflow-x-auto text-xs font-mono max-h-96 overflow-y-auto">
                            {typeof auditResponse.rawResponse === 'string'
                              ? auditResponse.rawResponse
                              : JSON.stringify(auditResponse.rawResponse, null, 2)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Scanner Version */}
                    {auditVersion && (
                      <div className="border-t pt-4 text-xs">
                        <span className="text-slate-600">scanner version:</span>
                        <div className="font-mono text-slate-900 bg-slate-100 p-2 rounded mt-1">{auditVersion}</div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
