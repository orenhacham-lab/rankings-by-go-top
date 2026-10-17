'use client'
/* The audit columns are free-form JSON written by the scanner's versions over
   time; they are read field by field below, as they always were. */
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * One check's technical breakdown (the scanner's request, what Google returned,
 * and how the result was decided), opened from its row on the check details page.
 * A diagnostic for support: the field names are the scanner's own identifiers.
 */
import { ChevronDown } from 'lucide-react'
import type { ScanResult } from '@/lib/supabase/types'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'

export default function ScanAuditDetails({ result, t, expandedRawId, setExpandedRawId }: {
  result: ScanResult
  t: DashboardDictionary['scans']['details']
  expandedRawId: string | null
  setExpandedRawId: (id: string | null) => void
}) {
  const auditRequest = result.audit_request as any
  const auditResponse = result.audit_response as any
  const auditDecision = result.audit_decision as any
  const auditVersion = result.audit_scanner_version
  return (
    <div data-scan-audit="" className="space-y-6">
      {/* Request Section */}
      {auditRequest && (
        <div>
          <h4 className="font-semibold text-ink mb-3">{t.auditRequest}</h4>
          <div className="bg-sunk p-4 rounded-control space-y-2 text-copy">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-muted">keyword:</span>
                <div className="tabular-nums text-ink">{auditRequest.keyword}</div>
              </div>
              <div>
                <span className="text-muted">engine:</span>
                <div className="tabular-nums text-ink">{auditRequest.engine}</div>
              </div>
              <div>
                <span className="text-muted">project city:</span>
                <div className="tabular-nums text-ink">{auditRequest.projectCity || '(none)'}</div>
              </div>
              <div>
                <span className="text-muted">country:</span>
                <div className="tabular-nums text-ink">{auditRequest.projectCountry}</div>
              </div>
              <div>
                <span className="text-muted">location_sent:</span>
                <div className="tabular-nums text-ink">{auditRequest.locationSent || '(none)'}</div>
              </div>
              <div>
                <span className="text-muted">ll_sent:</span>
                <div className="tabular-nums text-ink">{auditRequest.llSent || '(none)'}</div>
              </div>
              <div>
                <span className="text-muted">gl:</span>
                <div className="tabular-nums text-ink">{auditRequest.gl}</div>
              </div>
              <div>
                <span className="text-muted">hl:</span>
                <div className="tabular-nums text-ink">{auditRequest.hl}</div>
              </div>
              {auditRequest.scanner_version && (
                <div>
                  <span className="text-muted">scanner_version:</span>
                  <div className="tabular-nums text-ink">{auditRequest.scanner_version}</div>
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
          <div className="bg-sunk p-4 rounded-control space-y-3 text-copy">
            <div>
              <span className="text-muted">searchParameters.location:</span>
              <div className="tabular-nums text-ink">{auditResponse.searchParameters?.location || '(none)'}</div>
            </div>
            <div>
              <span className="text-muted">searchParameters.ll:</span>
              <div className="tabular-nums text-ink">{auditResponse.searchParameters?.ll || '(none)'}</div>
            </div>
            <div>
              <span className="text-muted">places_count:</span>
              <div className="tabular-nums text-ink">{auditResponse.placesCount || 0}</div>
            </div>
            {auditResponse.placesSample && auditResponse.placesSample.length > 0 && (
              <div>
                <span className="text-muted">top 10 place titles:</span>
                <ul className="mt-2 list-disc space-y-1 ps-5 marker:text-muted">
                  {auditResponse.placesSample.map((place: any, idx: number) => (
                    <li key={idx} className="text-body">{place.title || '(no title)'}</li>
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
          <div className="bg-sunk p-4 rounded-control space-y-3 text-copy">
            <div>
              <span className="text-muted">found:</span>
              <div className="tabular-nums text-ink">{auditDecision.found ? 'yes' : 'no'}</div>
            </div>
            {auditDecision.found && (
              <>
                <div>
                  <span className="text-muted">matched title:</span>
                  <div className="tabular-nums text-ink">{auditDecision.matchedTitle || '(none)'}</div>
                </div>
                <div>
                  <span className="text-muted">matched position:</span>
                  <div className="tabular-nums text-ink">
                    #{auditDecision.matchedPosition}
                    {auditDecision.position_source && (
                      <span className="text-muted text-caption ms-2">({auditDecision.position_source})</span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-muted">matched address:</span>
                  <div className="tabular-nums text-ink">{auditDecision.matchedAddress || '(none)'}</div>
                </div>
              </>
            )}
            {!auditDecision.grid_enabled && (
              <div>
                <span className="text-muted">geo validation result:</span>
                <div className="tabular-nums text-ink">{auditDecision.geoValidationPassed ? 'passed' : 'failed'}</div>
              </div>
            )}
            {auditDecision.rejectionReason && (
              <div>
                <span className="text-bad">rejection reason:</span>
                <div className="tabular-nums text-bad">{auditDecision.rejectionReason}</div>
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
              <div key={i} className="bg-sunk p-3 rounded-control text-copy">
                <div className="text-muted text-caption mb-1">{m.label}</div>
                <div className="font-semibold tabular-nums text-ink">{m.value}</div>
                {m.sub && <div className="text-muted text-caption mt-0.5">{m.sub}</div>}
              </div>
            ))}
          </div>

          {/* Per-point results */}
          {auditDecision.per_point_results && auditDecision.per_point_results.length > 0 && (
            <div className="space-y-3">
              {auditDecision.per_point_results.map((pt: any, idx: number) => (
                <div key={idx} className={`p-3 rounded-control border-s-4 ${pt.found ? 'bg-ok-soft border-ok/40' : 'bg-sunk border-line-strong'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-body text-copy">
                      #{pt.point_index + 1} {pt.label}
                      <span className="font-normal text-muted ms-2 text-caption">{pt.lat}, {pt.lng}</span>
                    </span>
                    <span className={`font-semibold tabular-nums text-copy ${pt.found ? 'text-ok' : 'text-muted'}`}>
                      {pt.found ? `#${pt.position}` : 'not found'}
                    </span>
                  </div>

                  {/* Match Status Debug */}
                  <div className="bg-surface p-2 rounded-control text-caption space-y-1 mb-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-muted">business_returned:</span>
                        <span className="ms-1 tabular-nums text-ink">{pt.business_returned ? 'yes' : 'no'}</span>
                      </div>
                      <div>
                        <span className="text-muted">business_rejected:</span>
                        <span className="ms-1 tabular-nums text-ink">{pt.business_rejected ? 'yes' : 'no'}</span>
                      </div>
                      <div>
                        <span className="text-muted">places_checked_count:</span>
                        <span className="ms-1 tabular-nums text-ink">{pt.places_checked_count || pt.places_count || '—'}</span>
                      </div>
                      <div>
                        <span className="text-muted">checked_all_places:</span>
                        <span className="ms-1 tabular-nums text-ink">{pt.target_checked_against_all_places ? 'yes' : 'no'}</span>
                      </div>
                    </div>
                    {pt.rejection_reason && (
                      <div className="text-bad">
                        <span>rejection reason:</span>
                        <span className="ms-1 tabular-nums text-ink">{pt.rejection_reason}</span>
                      </div>
                    )}
                    {pt.result_signature && (
                      <div className="text-muted border-t border-line pt-1 mt-1">
                        <span className="text-muted">signature:</span>
                        <div className="tabular-nums text-body break-all text-caption mt-0.5">{pt.result_signature}</div>
                      </div>
                    )}
                  </div>

                  {/* Top Places */}
                  {pt.top_places && pt.top_places.length > 0 && (
                    <div className="bg-surface p-2 rounded-control text-caption mb-2">
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
                    <div className="text-muted text-caption mt-1">
                      <strong>Matched:</strong> {pt.matched_title}{pt.matched_address ? ` — ${pt.matched_address}` : ''}
                    </div>
                  )}
                  <div className="text-muted text-caption mt-1">{pt.places_count} places returned</div>
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
              <div key={idx} className="bg-sunk p-3 rounded-control text-copy border-s-4 border-line-strong">
                <div className="font-semibold text-ink mb-2">#{attempt.attemptNumber}: {attempt.context}</div>
                <div className="grid grid-cols-2 gap-2 text-body">
                  <div>location: <span className="tabular-nums text-ink">{attempt.location || '(none)'}</span></div>
                  <div>ll: <span className="tabular-nums text-ink">{attempt.ll || '(none)'}</span></div>
                  <div>found: <span className="tabular-nums text-ink">{attempt.found ? 'yes' : 'no'}</span></div>
                  <div>geo_validation: <span className="tabular-nums text-ink">{attempt.geoValidationPassed !== undefined ? (attempt.geoValidationPassed ? 'passed' : 'failed') : '—'}</span></div>
                  {attempt.rejectionReason && (
                    <div className="col-span-2 text-bad">
                      reason: <span className="tabular-nums text-ink">{attempt.rejectionReason}</span>
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
            aria-expanded={expandedRawId === result.id}
            type="button"
            className="flex items-center gap-1 rounded-control text-copy font-semibold text-ink transition-colors hover:text-action focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
          >
            <ChevronDown aria-hidden="true" className={`size-4 transition-transform duration-150 ${expandedRawId === result.id ? '' : '-rotate-90 rtl:rotate-90'}`} />
            {t.rawResponse}
          </button>
          {expandedRawId === result.id && (
            <div className="bg-contrast text-contrast-ink p-4 rounded-control mt-2 max-h-96 overflow-auto whitespace-pre font-mono text-caption">
              {typeof auditResponse.rawResponse === 'string'
                ? auditResponse.rawResponse
                : JSON.stringify(auditResponse.rawResponse, null, 2)}
            </div>
          )}
        </div>
      )}

      {/* Scanner Version */}
      {auditVersion && (
        <div className="border-t border-line pt-4 text-caption">
          <span className="text-muted">scanner version:</span>
          <div className="mt-1 rounded-control bg-sunk p-2 text-ink">{auditVersion}</div>
        </div>
      )}
    </div>
  )
}
