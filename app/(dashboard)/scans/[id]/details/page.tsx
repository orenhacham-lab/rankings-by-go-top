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
                                <div className="font-mono text-slate-900">#{auditDecision.matchedPosition}</div>
                              </div>
                              <div>
                                <span className="text-slate-600">matched address:</span>
                                <div className="font-mono text-slate-900">{auditDecision.matchedAddress || '(none)'}</div>
                              </div>
                            </>
                          )}
                          <div>
                            <span className="text-slate-600">geo validation result:</span>
                            <div className="font-mono text-slate-900">{auditDecision.geoValidationPassed ? 'passed' : 'failed'}</div>
                          </div>
                          {auditDecision.rejectionReason && (
                            <div>
                              <span className="text-red-600">rejection reason:</span>
                              <div className="font-mono text-red-700">{auditDecision.rejectionReason}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Attempts Section */}
                    {auditDecision?.attempts && auditDecision.attempts.length > 0 && (
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
