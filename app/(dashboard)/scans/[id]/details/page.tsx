'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ScanResult } from '@/lib/supabase/types'
import Header from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

interface AuditData {
  request?: {
    keyword?: string
    engine?: string
    projectCity?: string | null
    projectCountry?: string
    locationSent?: string | null
    llSent?: string | null
    gl?: string
    hl?: string
  }
  response?: {
    searchParameters?: Record<string, unknown>
    placesCount?: number
    placesSample?: Array<{ title?: string }>
    rawResponse?: unknown
    rawResponseTruncated?: boolean
  }
  decision?: {
    found?: boolean
    matchedPosition?: number | null
    matchedTitle?: string | null
    matchedAddress?: string | null
    attempts?: Array<{
      attemptNumber?: number
      context?: string
      location?: string | null
      ll?: string | null
      found?: boolean
      geoValidationPassed?: boolean
      rejectionReason?: string | null
    }>
    successfulAttemptIndex?: number
    geoValidationPassed?: boolean
    rejectionReason?: string | null
  }
}

export default function ScanDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [results, setResults] = useState<ScanResult[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      const supabase = createClient()
      const { data } = await supabase
        .from('scan_results')
        .select('*')
        .eq('scan_id', id)
        .order('checked_at', { ascending: false })

      setResults(data || [])
      setLoading(false)
    }
    loadData()
  }, [id])

  const toggleExpanded = (resultId: string) => {
    setExpandedId(expandedId === resultId ? null : resultId)
  }

  return (
    <div>
      <Header title="פרטי סריקה" subtitle="תיעוד מלא של תוצאות הסריקה" />

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin ml-2" />
          טוען...
        </div>
      ) : results.length === 0 ? (
        <Card>
          <div className="p-6 text-center text-slate-500">אין תוצאות סריקה</div>
        </Card>
      ) : (
        <div className="space-y-4">
          {results.map((result) => {
            const audit = (result as ScanResult & { audit_request?: AuditData['request']; audit_response?: AuditData['response']; audit_decision?: AuditData['decision']; audit_scanner_version?: string }).audit_request ? {
              request: (result as any).audit_request,
              response: (result as any).audit_response,
              decision: (result as any).audit_decision,
            } as AuditData : null

            return (
              <Card key={result.id} className="overflow-hidden">
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-slate-900">{result.keyword}</h3>
                        <Badge variant={result.found ? 'success' : 'neutral'}>
                          {result.found ? `מיקום #${result.position}` : 'לא נמצא'}
                        </Badge>
                      </div>
                      <div className="text-sm text-slate-500">
                        <div>תעודה: {formatDateTime(result.checked_at)}</div>
                        {result.error_message && <div className="text-red-600 mt-1">שגיאה: {result.error_message}</div>}
                      </div>
                    </div>
                    {audit && (
                      <button
                        onClick={() => toggleExpanded(result.id)}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium px-3 py-1"
                      >
                        {expandedId === result.id ? 'סגור פרטים' : 'צפה בפרטים'}
                      </button>
                    )}
                  </div>

                  {expandedId === result.id && audit && (
                    <div className="mt-6 border-t pt-6 space-y-6">
                      {/* Request Data */}
                      <div>
                        <h4 className="font-semibold text-slate-900 mb-3">בקשה למנוע</h4>
                        <div className="bg-slate-50 p-4 rounded text-sm space-y-2 font-mono text-xs">
                          {audit.request && (
                            <>
                              <div>מילה-מפתח: <span className="text-slate-700">{audit.request.keyword}</span></div>
                              <div>מנוע: <span className="text-slate-700">{audit.request.engine}</span></div>
                              <div>עיר: <span className="text-slate-700">{audit.request.projectCity || '(לא הוגדרה)'}</span></div>
                              <div>ארץ: <span className="text-slate-700">{audit.request.projectCountry}</span></div>
                              <div>location שנשלח: <span className="text-slate-700">{audit.request.locationSent || '(לא)'}</span></div>
                              <div>ll שנשלח: <span className="text-slate-700">{audit.request.llSent || '(לא)'}</span></div>
                              <div>gl: <span className="text-slate-700">{audit.request.gl}</span></div>
                              <div>hl: <span className="text-slate-700">{audit.request.hl}</span></div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Response Data */}
                      <div>
                        <h4 className="font-semibold text-slate-900 mb-3">תגובת המנוע</h4>
                        <div className="bg-slate-50 p-4 rounded text-sm space-y-2">
                          {audit.response && (
                            <>
                              <div>מספר תוצאות: <span className="font-semibold">{audit.response.placesCount || 0}</span></div>
                              {audit.response.placesSample && audit.response.placesSample.length > 0 && (
                                <div>
                                  דוגמאות (עד 10):
                                  <ul className="mt-2 space-y-1 ml-4">
                                    {audit.response.placesSample.map((place, idx) => (
                                      <li key={idx} className="text-slate-600">• {place.title}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {audit.response.rawResponseTruncated && (
                                <div className="text-amber-600 text-xs mt-2">
                                  (התגובה הגולמית הוקטנה כדי לשמור על גודל סביר)
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Decision Data */}
                      <div>
                        <h4 className="font-semibold text-slate-900 mb-3">החלטת הסקן</h4>
                        <div className="bg-slate-50 p-4 rounded text-sm space-y-2">
                          {audit.decision && (
                            <>
                              <div>תוצאה: <span className="font-semibold">{audit.decision.found ? 'נמצא' : 'לא נמצא'}</span></div>
                              {audit.decision.found && (
                                <>
                                  <div>כותרת התוצאה: <span className="text-slate-700">{audit.decision.matchedTitle}</span></div>
                                  <div>מיקום: <span className="font-semibold">#{audit.decision.matchedPosition}</span></div>
                                  {audit.decision.matchedAddress && <div>כתובת: <span className="text-slate-700">{audit.decision.matchedAddress}</span></div>}
                                </>
                              )}
                              {audit.decision.rejectionReason && (
                                <div className="text-red-600">סיבת דחייה: {audit.decision.rejectionReason}</div>
                              )}

                              {audit.decision.attempts && audit.decision.attempts.length > 0 && (
                                <div className="mt-4 pt-4 border-t">
                                  <div className="font-semibold mb-2">נסיונות ({audit.decision.attempts.length}):</div>
                                  <ul className="space-y-2 ml-4">
                                    {audit.decision.attempts.map((attempt, idx) => (
                                      <li key={idx} className="text-xs space-y-1">
                                        <div className="font-semibold">#{attempt.attemptNumber}: {attempt.context}</div>
                                        <div className="text-slate-600">
                                          location: {attempt.location || '(לא)'}, ll: {attempt.ll || '(לא)'}
                                        </div>
                                        <div className="text-slate-600">
                                          נמצא: {attempt.found ? 'כן' : 'לא'}
                                          {attempt.geoValidationPassed !== undefined && (
                                            <span>, geo validation: {attempt.geoValidationPassed ? 'עברה' : 'נכשלה'}</span>
                                          )}
                                        </div>
                                        {attempt.rejectionReason && (
                                          <div className="text-red-600">סיבה: {attempt.rejectionReason}</div>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Scanner Version */}
                      <div>
                        <h4 className="font-semibold text-slate-900 mb-2">גרסת הסקן</h4>
                        <div className="bg-slate-50 p-4 rounded text-xs font-mono">
                          {(result as any).audit_scanner_version || 'לא זמין'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
