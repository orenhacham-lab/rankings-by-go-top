'use client'

/**
 * OPERATOR acceptance-matrix runner — /reco-qa (Preview-only).
 *
 * ONE action: pick tier (default Premium/Pro) → "Run acceptance matrix" → the
 * page runs every owned project sequentially through the live engine (real
 * data + real Gemini via /api/content/automation/reco-qa), auto-evaluates the
 * full acceptance rule set per run, and renders a verdict table + full topic
 * lists + a downloadable JSON report. No manual network inspection.
 *
 * The API is double-gated (ENABLE_CONTENT_AUTOMATION + RECO_ISOLATION_DIAGNOSTICS=1
 * + session ownership); in any non-QA environment this page just reports the
 * endpoint as unavailable.
 */

import { useEffect, useState } from 'react'
import { Check, Download, Play, TriangleAlert, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import Segmented from '@/components/ui/Segmented'
import Select from '@/components/ui/Select'
import { FIELD_CLASSES, FIELD_LABEL_CLASSES } from '@/components/ui/Input'
import { cn } from '@/lib/utils'

interface ProjectOpt { id: string; name: string | null; business_name: string | null }
interface RuleRow { id: string; level: 'fail' | 'warn'; pass: boolean; detail: string }
interface RunReport {
  ok: boolean
  error?: string
  message?: string
  project?: { id: string }
  tierRequested?: string
  durationMs?: number
  acceptance?: { verdict?: 'PASS' | 'FAIL' | 'INSUFFICIENT_INVENTORY'; passed: boolean; warnings: number; rules: RuleRow[] }
  run?: Record<string, unknown> & { modelPath?: { requestedTier: string; model: string | null; tierUsed: string; downgraded: boolean; downgradeReason: string | null }; modelConfig?: { model: string; thinkingMode: string; thinkingBudget: number; maxOutputTokens: number } | null; accepted?: number; model_calls?: number; stop_reason?: string; brief_pool?: { pool_size: number; total_raw_candidates?: number; raw_query_candidates?: number; raw_tracked_candidates?: number; raw_theme_candidates?: number; with_demand?: number; rejected_by_reason?: Record<string, number>; rejected_examples?: { subject: string; reason: string; evidenceKind: string }[] } }
  topics?: { title: string; primaryKeyword: string; normalizedPrimaryKeyword?: string; intent: string; reason: string; demand: { demandQuery: string | null; avgMonthlySearches: number | null } | null; demandMatchType?: string; coverageMatches?: { existingTitle: string; matchType: string; score: number }[]; links: { url: string; anchor: string }[]; linkDiagnostics?: { targetUrl: string; targetTitle: string; role: string; semanticRelation: string; rejectionReasons: string[]; acceptedBecause: string | null }[]; recommendedPageType?: string | null }[]
}
interface CostTelemetry { totalPaidCalls: number; estimatedRunCostUsd: number; estimatedRunCostIls: number; costPerAcceptedTopic: number; configuredCostCeilingUsd: number; remainingBudgetUsd: number; callsPreventedByBudget: number; calls: { model: string; callPurpose: string; inputTokens: number; answerOutputTokens: number; thinkingTokens: number; totalBillableOutputTokens: number; estimatedCostUsd: number }[] }

export default function RecoQaPage() {
  const [projects, setProjects] = useState<ProjectOpt[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [tier, setTier] = useState<'premium' | 'standard'>('premium')
  const [persist, setPersist] = useState(false)
  const [running, setRunning] = useState(false)
  const [current, setCurrent] = useState<string | null>(null)
  const [reports, setReports] = useState<Record<string, RunReport>>({})
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/content/overview')
      .then((r) => r.json())
      .then((d) => {
        const list: ProjectOpt[] = Array.isArray(d.projects) ? d.projects : []
        setProjects(list)
        setSelected(new Set(list.map((p) => p.id)))
      })
      .catch(() => setLoadError('projects load failed'))
  }, [])

  const label = (p: ProjectOpt) => p.name || p.business_name || p.id.slice(0, 8)

  async function runMatrix() {
    if (running) return
    setRunning(true)
    setReports({})
    for (const p of projects.filter((x) => selected.has(x.id))) {
      setCurrent(p.id)
      try {
        const res = await fetch('/api/content/automation/reco-qa', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: p.id, tier, persist }),
        })
        const data: RunReport = await res.json().catch(() => ({ ok: false, error: `http_${res.status}` }))
        if (!res.ok && !data.error) data.error = `http_${res.status}`
        setReports((prev) => ({ ...prev, [p.id]: data }))
      } catch (e) {
        setReports((prev) => ({ ...prev, [p.id]: { ok: false, error: 'network_error', message: String(e).slice(0, 200) } }))
      }
    }
    setCurrent(null)
    setRunning(false)
  }

  function downloadJson() {
    const payload = { generatedAt: new Date().toISOString(), tier, persist, reports }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `reco-qa-report-${Date.now()}.json`
    a.click()
  }

  const done = Object.keys(reports).length
  const verdictOf = (r: RunReport): 'PASS' | 'FAIL' | 'INSUFFICIENT_INVENTORY' =>
    !r.ok ? 'FAIL' : (r.acceptance?.verdict ?? (r.acceptance?.passed ? 'PASS' : 'FAIL'))
  const verdictColor = (v: string) => v === 'PASS' ? 'text-ok' : v === 'INSUFFICIENT_INVENTORY' ? 'text-warn' : 'text-bad'
  const counts = Object.values(reports).reduce((acc, r) => { const v = verdictOf(r); acc[v] = (acc[v] ?? 0) + 1; return acc }, {} as Record<string, number>)
  const allPassed = done > 0 && (counts['FAIL'] ?? 0) === 0 && (counts['INSUFFICIENT_INVENTORY'] ?? 0) === 0

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8" dir="rtl">
      <div>
      <h1 className="text-title font-bold tracking-tight text-ink">בדיקת קבלה חיה — מנוע הרעיונות</h1>
      <p className="mt-1.5 max-w-prose text-copy text-muted">מריץ את המנוע על נתוני הפרויקטים האמיתיים מול Gemini אמיתי, בודק אוטומטית את כל כללי הקבלה ומפיק דוח. Preview בלבד (דורש RECO_ISOLATION_DIAGNOSTICS=1).</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-3 text-copy">
        <Segmented
          ariaLabel="מודל"
          value={tier}
          onChange={(m) => setTier(m)}
          options={(['premium', 'standard'] as const).map((m) => ({ value: m, label: m === 'premium' ? 'איכותי: Gemini Pro' : 'מהיר: Gemini Flash', disabled: running }))}
        />
        <Checkbox id="reco-qa-persist" checked={persist} onChange={(checked) => setPersist(checked)} disabled={running} label="שמור רעיונות בפרויקט (בדיקת persistence מלאה)" />
        <Button onClick={runMatrix} disabled={running || selected.size === 0} loading={running}>
          {!running && <Play aria-hidden className="size-4" />}
          {running ? `מריץ… ${current ? label(projects.find((p) => p.id === current) ?? { id: current, name: null, business_name: null }) : ''}` : `הרץ בדיקת קבלה (${selected.size} פרויקטים)`}
        </Button>
        {done > 0 && !running && (
          <Button variant="secondary" onClick={downloadJson}><Download aria-hidden className="size-4" />הורד דוח JSON</Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-5 text-caption">
        {projects.map((p) => (
          <div key={p.id} className="flex items-center gap-2 rounded-control border border-line bg-surface px-2.5 py-1.5">
            <Checkbox id={`reco-qa-project-${p.id}`} checked={selected.has(p.id)} disabled={running}
              onChange={(checked) => setSelected((prev) => { const n = new Set(prev); if (checked) n.add(p.id); else n.delete(p.id); return n })} label={label(p)} />
            {reports[p.id] && (
              <span className={`${verdictColor(verdictOf(reports[p.id]))} font-bold`}>{verdictOf(reports[p.id])}</span>
            )}
          </div>
        ))}
        {loadError && <span className="text-bad">{loadError}</span>}
      </div>

      {done > 0 && !running && (
        <p className={`text-copy font-bold mb-4 ${allPassed ? 'text-ok' : (counts['FAIL'] ?? 0) > 0 ? 'text-bad' : 'text-warn'}`}>
          {`PASS: ${counts['PASS'] ?? 0} · INSUFFICIENT_INVENTORY: ${counts['INSUFFICIENT_INVENTORY'] ?? 0} · FAIL: ${counts['FAIL'] ?? 0}`}
        </p>
      )}

      {Object.entries(reports).map(([pid, r]) => {
        const p = projects.find((x) => x.id === pid)
        const mp = r.run?.modelPath
        return (
          <div key={pid} className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
            <h2 className="font-bold text-ink mb-1">
              {p ? label(p) : pid} — <span className={verdictColor(verdictOf(r))}>{verdictOf(r)}</span>
              {typeof r.acceptance?.warnings === 'number' && r.acceptance.warnings > 0 && <span className="text-warn text-caption"> · {r.acceptance.warnings} לבדיקה ידנית</span>}
            </h2>
            {!r.ok && <p className="text-caption text-bad mb-2">{r.error} {r.message}</p>}
            {mp && (
              <p className="text-caption text-body mb-2" dir="ltr">
                model: <b>{mp.model}</b> · tierUsed: <b>{mp.tierUsed}</b> · requested: {mp.requestedTier} · downgraded: <b className={mp.downgraded ? 'text-bad' : 'text-ok'}>{String(mp.downgraded)}</b>
                {' '}· calls: {String(r.run?.model_calls)} · accepted: {String(r.run?.accepted)} · pool: {String(r.run?.brief_pool?.pool_size)} · stop: {String(r.run?.stop_reason)} · {r.durationMs}ms
              </p>
            )}
            {r.run?.modelConfig && (
              <p className="text-caption text-muted mb-1" dir="ltr">
                thinking: {r.run.modelConfig.thinkingMode} · budget {r.run.modelConfig.thinkingBudget} · maxOutputTokens {r.run.modelConfig.maxOutputTokens}
              </p>
            )}
            {r.run?.brief_pool && (
              <p className="text-caption text-muted mb-1" dir="ltr">
                pool: raw {String(r.run.brief_pool.total_raw_candidates ?? '—')} (queries {String(r.run.brief_pool.raw_query_candidates ?? '—')} · tracked {String(r.run.brief_pool.raw_tracked_candidates ?? '—')} · themes {String(r.run.brief_pool.raw_theme_candidates ?? '—')}), pool {r.run.brief_pool.pool_size} · withDemand {String(r.run.brief_pool.with_demand ?? '—')} · rejected {JSON.stringify(r.run.brief_pool.rejected_by_reason ?? {})}
              </p>
            )}
            {Array.isArray(r.run?.brief_pool?.rejected_examples) && r.run.brief_pool.rejected_examples.length > 0 && (
              <details className="text-caption text-muted mb-2">
                <summary>דוגמאות מועמדים שנדחו ({r.run.brief_pool.rejected_examples.length})</summary>
                <ul className="mt-1 space-y-0.5">
                  {r.run.brief_pool.rejected_examples.map((ex, i) => (
                    <li key={i} dir="rtl">「{ex.subject}」 — <span dir="ltr">{ex.reason} · {ex.evidenceKind}</span></li>
                  ))}
                </ul>
              </details>
            )}
            {r.acceptance && (
              <table className="w-full text-caption mb-3" dir="ltr">
                <tbody>
                  {r.acceptance.rules.map((rule) => (
                    <tr key={rule.id} className="border-t border-line">
                      <td className={`py-0.5 pr-2 whitespace-nowrap ${rule.pass ? 'text-ok' : rule.level === 'warn' ? 'text-warn' : 'text-bad'}`}>
                        <span className="inline-flex items-center gap-1">{rule.pass ? <Check aria-hidden className="size-3.5" /> : rule.level === 'warn' ? <TriangleAlert aria-hidden className="size-3.5" /> : <X aria-hidden className="size-3.5" />}{rule.id}</span>
                      </td>
                      <td className="py-0.5 text-muted break-all">{rule.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {(() => {
              const cost = r.run?.cost as CostTelemetry | undefined
              const cl = r.run?.competitorLeakage as { researchRejected?: string[]; acceptedTitle?: string[]; acceptedPrimaryKeyword?: string[]; acceptedSecondaryKeyword?: string[]; acceptedLinkTarget?: string[]; acceptedMatches?: { field: string; value: string; token: string | null; evidence: string }[] } | undefined
              const acceptedLeak = cl ? (cl.acceptedMatches ?? []).map((m) => `${m.field}:"${m.value}" [${m.token} · ${m.evidence}]`) : []
              return (
                <>
                  {cost && (
                    <p className="text-caption text-muted mb-1" dir="ltr">
                      cost: ${cost.estimatedRunCostUsd} (₪{cost.estimatedRunCostIls}) · perTopic ${cost.costPerAcceptedTopic} · calls {cost.totalPaidCalls}/2 · ceiling ${cost.configuredCostCeilingUsd} · remaining ${cost.remainingBudgetUsd} · preventedByBudget {cost.callsPreventedByBudget}
                      {(cost.calls ?? []).map((c, i) => <span key={i}> · [{c.callPurpose} {c.model}: in {c.inputTokens} / out {c.answerOutputTokens} + think {c.thinkingTokens} = {c.totalBillableOutputTokens}, ${c.estimatedCostUsd}]</span>)}
                    </p>
                  )}
                  {cl && (
                    <p className={`text-caption mb-1 ${acceptedLeak.length ? 'text-bad' : 'text-muted'}`} dir="rtl">
                      דליפת מתחרים — בפלט מאושר: {acceptedLeak.length ? acceptedLeak.join(' · ') : 'אין'} · במחקר שנדחה (אבחון): {(cl.researchRejected ?? []).length}
                    </p>
                  )}
                </>
              )
            })()}
            {Array.isArray(r.topics) && r.topics.length > 0 && (
              <div className="space-y-2">
                {r.topics.map((t0, i) => (
                  <div key={i} className="rounded-inset border border-line p-3 text-caption">
                    <div className="font-medium text-ink ">{t0.title}</div>
                    <div className="text-muted">מילת מפתח: {t0.normalizedPrimaryKeyword ?? t0.primaryKeyword} · כוונה: {t0.intent}{t0.recommendedPageType ? ` · ${t0.recommendedPageType}` : ''} · demand: {t0.demandMatchType ?? 'none'}{t0.demand?.avgMonthlySearches && (t0.demandMatchType === 'exact' || t0.demandMatchType === 'close_intent') ? ` "${t0.demand.demandQuery}" ≈ ${t0.demand.avgMonthlySearches}/חודש` : ''}</div>
                    <div className="text-muted">{t0.reason}</div>
                    {(t0.coverageMatches ?? []).filter((m) => m.matchType !== 'distinct').length > 0 && (
                      <div className="text-warn" dir="rtl">כיסוי קיים: {(t0.coverageMatches ?? []).filter((m) => m.matchType !== 'distinct').map((m) => `${m.existingTitle} (${m.matchType} ${m.score})`).join(' · ')}</div>
                    )}
                    {(t0.linkDiagnostics ?? []).filter((l) => !!l.acceptedBecause).length > 0 && (
                      <div className="text-ok" dir="ltr"><Check aria-hidden className="inline size-3.5" /> links: {(t0.linkDiagnostics ?? []).filter((l) => !!l.acceptedBecause).map((l) => `${l.targetTitle} [${l.role}] ${l.acceptedBecause}`).join(' · ')}</div>
                    )}
                    {(t0.linkDiagnostics ?? []).filter((l) => !l.acceptedBecause).length > 0 && (
                      <div className="text-bad" dir="ltr"><X aria-hidden className="inline size-3.5" /> rejected: {(t0.linkDiagnostics ?? []).filter((l) => !l.acceptedBecause).map((l) => `${l.targetTitle} (${l.rejectionReasons.join(',')})`).join(' · ')}</div>
                    )}
                    {(t0.linkDiagnostics ?? []).length === 0 && t0.links.length > 0 && <div className="text-muted" dir="ltr">{t0.links.map((l) => l.url).join(' · ')}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      <ComparisonSection projects={projects} label={label} />
    </div>
  )
}

// ── Stage-B QA/admin Flash-vs-Pro comparison (isolated; Preview-only; never in the
//    normal project UI). Non-persisting; two-step (preflight cost → confirm → run). ──
interface RescueCounts { finalizedAccepted: number; totalRescuePotential: number; permanentlyStructuralRejected: number; engineModelRescuableRejected: number; postProcessingModelRescuable: number; batchReplacementPotential: number; unprocessedPotential: number; modelSkipped: number; partialMissingPotential: number }
interface AttemptRow {
  attemptId: string; role: 'flash' | 'pro'; model: string | null; attemptIndex: number
  engineAcceptedCount: number; finalizedCount: number; zeroResult: boolean
  providerStatus: string; synthesisStatus: string; stopReason: string
  estimatedCostUsd: number; tokenUsage: { input: number; output: number; thinking: number }
  callCount: number; latencyMs: number; uniqueAcceptedCount: number; uniqueAcceptedBriefIds: string[]
  rescueCounts: RescueCounts; escalation: { escalate: boolean; reason: string }; failed: boolean; error: string | null
  providerDiagnostics?: { requestedModel: string | null; providerStatus: string | null; providerErrorType: string | null; sanitizedProviderMessage: string | null; finishReason: string | null; httpStatus: number | null; retryCount: number; threw: boolean }
}
interface PairOutcome { index: number; decision: string; reason: string; provisional: boolean; flashCount: number; proCount: number }
interface AggMetrics {
  model: string | null; totalAttempts: number; targetCompletionRate: number; nonEmptyRate: number; zeroResultRate: number
  meanFinalized: number; medianFinalized: number; minFinalized: number; maxFinalized: number
  averageCostUsd: number; costPerNonEmptyBatchUsd: number | null; costPerFinalizedAcceptedUsd: number | null
  averageLatencyMs: number; p95LatencyMs: number; providerFailureRate: number; synthesisFailureRate: number
}
interface CompareResponse {
  ok: boolean; preflight?: boolean; error?: string; message?: string
  snapshotId?: string; commitSha?: string | null; poolSize?: number; discoveryRan?: boolean
  preparationProviderCalls?: number; targetCount?: number; attemptsPerModel?: number
  maxAuthorizedCostUsd?: number; estimatedWorstCaseCostUsd?: number; authorizedLimitUsd?: number
  withinAuthorizedLimit?: boolean; actualCostUsd?: number; requiresConfirmation?: boolean
  attempts?: AttemptRow[]; aggregate?: { flash: AggMetrics; pro: AggMetrics }
  selectionSimulation?: { policy: string; pairedBy: string; simulated: boolean; pairs: PairOutcome[]; summary: { proWins: number; flashWins: number; provisionalTies: number; noDecision: number; pairsCompared: number } }
  budget?: { ok: boolean; path: string; requiredAuthorizationUsd: number }
  modelResolution?: { flashRequested: string; flashResolved: boolean; flashResolutionReason: string | null; proRequested: string; proTierUsed: string; proDowngraded: boolean; proDowngradeReason: string | null }
  blindAvailable?: boolean; blindBlocked?: { reason: string; hitCount: number } | null
  exportIntegrity?: { ok: boolean; failures: { batchId: string; invariant: string; detail: string }[] }
  blindReview?: unknown; mapping?: unknown; persist?: boolean; persistedWrites?: number
  limits?: { serverMaxAttemptsPerModel: number; serverMaxTargetCount: number }
}

function ComparisonSection({ projects, label }: { projects: ProjectOpt[]; label: (p: ProjectOpt) => string }) {
  const [projectId, setProjectId] = useState<string>('')
  const [targetCount, setTargetCount] = useState(12)
  const [attempts, setAttempts] = useState(3)
  // Two INDEPENDENT states — the preflight and the confirmed run never share a
  // loading flag (the earlier bug: one derived boolean stayed true after preflight).
  const [isCalculatingCost, setIsCalculatingCost] = useState(false)
  const [isRunningComparison, setIsRunningComparison] = useState(false)
  const [preflight, setPreflight] = useState<CompareResponse | null>(null)
  const [result, setResult] = useState<CompareResponse | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const effectiveProject = projectId || projects[0]?.id || ''
  const busy = isCalculatingCost || isRunningComparison

  // Changing project / target / attempts invalidates the previous preflight
  // authorization — the operator must recalculate the cost before confirming.
  function invalidatePreflight() { setPreflight(null); setResult(null); setErr(null) }

  async function call(confirm: boolean): Promise<CompareResponse> {
    const res = await fetch('/api/content/automation/reco-qa/compare', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: effectiveProject, targetCount, attemptsPerModel: attempts, confirm }),
    })
    const data: CompareResponse = await res.json().catch(() => ({ ok: false, error: `http_${res.status}` }))
    if (!res.ok && !data.error) data.error = `http_${res.status}`
    return data
  }

  async function doPreflight() {
    setErr(null); setResult(null); setPreflight(null)
    if (!effectiveProject) { setErr('בחר פרויקט'); return }
    setIsCalculatingCost(true)
    try {
      const d = await call(false)
      if (!d.ok) { setErr(`${d.error ?? ''} ${d.message ?? ''}`); return } // preflight stays null → confirm gated
      setPreflight(d)
    } catch (e) {
      setErr(`preflight_error ${String(e).slice(0, 160)}`)
    } finally {
      setIsCalculatingCost(false) // ALWAYS clears — success, failure or abort
    }
  }
  async function doRun() {
    // Never run against a stale/absent or over-cap preflight.
    if (!preflight || preflight.withinAuthorizedLimit === false || busy) return
    setErr(null)
    setIsRunningComparison(true)
    try {
      const d = await call(true)
      if (!d.ok) { setErr(`${d.error ?? ''} ${d.message ?? ''}`); return }
      setResult(d)
    } catch (e) {
      setErr(`run_error ${String(e).slice(0, 160)}`)
    } finally {
      setIsRunningComparison(false)
    }
  }

  function download(obj: unknown, name: string) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click()
  }

  const within = preflight ? (preflight.withinAuthorizedLimit ?? true) : false
  const canConfirm = !!preflight && within && !isCalculatingCost && !isRunningComparison
  const pct = (n: number) => `${Math.round(n * 100)}%`

  return (
    <section className="mt-10 rounded-card border border-line border-s-[3px] border-s-action bg-surface p-5 shadow-card sm:p-6" dir="rtl" data-testid="reco-qa-comparison">
      <h2 className="mb-1 text-section font-semibold text-ink">השוואת Flash מול Pro (QA/אדמין בלבד)</h2>
      <p className="text-caption text-muted mb-3">מריץ תמונת מצב אחת (snapshot) ומריץ עליה מספר ניסיונות Flash ו-Pro. אינו נוגע בזרימת המשתמש הרגילה, אינו שומר דבר, ואינו מפעיל אסקלציה אוטומטית. Preview בלבד.</p>

      <div className="flex flex-wrap items-end gap-3 mb-3 text-copy">
        <div className="min-w-[180px]">
          <Select id="reco-qa-compare-project" label="פרויקט" value={effectiveProject} onChange={(e) => { setProjectId(e.target.value); invalidatePreflight() }} disabled={busy}
            options={projects.map((p) => ({ value: p.id, label: label(p) }))} />
        </div>
        <label className={cn('flex flex-col gap-1.5', FIELD_LABEL_CLASSES)}>מספר המלצות מבוקש
          <input type="number" min={1} max={20} value={targetCount} disabled={busy} onChange={(e) => { setTargetCount(Number(e.target.value) || 1); invalidatePreflight() }} className={cn(FIELD_CLASSES, 'h-9 w-24 font-normal')} />
        </label>
        <label className={cn('flex flex-col gap-1.5', FIELD_LABEL_CLASSES)}>ניסיונות לכל מודל
          <input type="number" min={3} max={6} value={attempts} disabled={busy} onChange={(e) => { setAttempts(Number(e.target.value) || 3); invalidatePreflight() }} className={cn(FIELD_CLASSES, 'h-9 w-24 font-normal')} />
        </label>
        <button type="button" onClick={doPreflight} disabled={busy} className="inline-flex h-9 items-center rounded-control bg-action px-4 text-copy font-semibold text-action-ink transition-colors duration-150 ease-snappy hover:bg-action-hover disabled:opacity-50" data-testid="reco-qa-preflight-btn">
          {isCalculatingCost ? 'מחשב…' : 'חשב עלות מקסימלית'}
        </button>
      </div>

      {err && <p className="text-caption text-bad mb-2" data-testid="reco-qa-error">{err}</p>}

      {preflight && !result && (() => {
        const estWorst = preflight.estimatedWorstCaseCostUsd ?? preflight.maxAuthorizedCostUsd
        const limit = preflight.authorizedLimitUsd
        return (
          <div className="mb-3 rounded-inset border border-line border-s-[3px] border-s-warn bg-surface p-4 text-copy" data-testid="reco-qa-preflight">
            <p className="text-warn mb-2" dir="rtl">
              עלות בתרחיש הגרוע: <b dir="ltr">${estWorst}</b> · תקרת QA מאושרת: <b dir="ltr">${limit ?? '—'}</b> · {attempts}×2 ניסיונות · יעד {targetCount}. הריצה אינה שומרת המלצות.
            </p>
            {within ? (
              <button type="button" onClick={doRun} disabled={!canConfirm} className="inline-flex h-9 items-center rounded-control bg-bad px-4 text-copy font-semibold text-bad-ink transition-colors duration-150 ease-snappy hover:opacity-90 disabled:opacity-50" data-testid="reco-qa-confirm-run">
                {isRunningComparison ? 'מריץ השוואה…' : 'אשר והרץ השוואה'}
              </button>
            ) : (
              <p className="text-bad text-caption" data-testid="reco-qa-cost-blocked" dir="rtl">
                הריצה חסומה: העלות בתרחיש הגרוע (${estWorst}) חורגת מהתקרה המאושרת (${limit}). הקטן את מספר הניסיונות או העלה את RECO_QA_MAX_RUN_COST_USD ופרוס מחדש את ה-Preview.
              </p>
            )}
          </div>
        )
      })()}

      {result && (
        <div data-testid="reco-qa-comparison-result">
          <p className="text-caption text-body mb-2" dir="ltr">
            snapshot <b>{result.snapshotId}</b> · commit <b>{result.commitSha ?? 'unknown'}</b> · pool {result.poolSize} · discovery {String(result.discoveryRan)} · prepCalls {result.preparationProviderCalls} · maxCost ${result.maxAuthorizedCostUsd} · actualCost ${result.actualCostUsd} · persist {String(result.persist)} · writes {result.persistedWrites}
          </p>
          {result.modelResolution && (
            <p className="text-caption mb-1" dir="ltr" data-testid="reco-qa-model-resolution">
              models: flash <b>{result.modelResolution.flashRequested}</b>{result.modelResolution.flashResolved ? '' : ` (unresolved: ${result.modelResolution.flashResolutionReason})`} · pro <b>{result.modelResolution.proRequested}</b> (tierUsed {result.modelResolution.proTierUsed}{result.modelResolution.proDowngraded ? ` · DOWNGRADED: ${result.modelResolution.proDowngradeReason}` : ''})
            </p>
          )}
          {result.selectionSimulation && (
            <p className="text-caption mb-3" dir="ltr" data-testid="reco-qa-selection-sim">
              selection <b>(simulated · {result.selectionSimulation.policy}, paired by {result.selectionSimulation.pairedBy})</b>: Pro won {result.selectionSimulation.summary.proWins}/{result.selectionSimulation.summary.pairsCompared} · Flash won {result.selectionSimulation.summary.flashWins} · provisional ties {result.selectionSimulation.summary.provisionalTies} · no-decision {result.selectionSimulation.summary.noDecision} · budget <b>{result.budget?.path}</b>
            </p>
          )}

          <div className="mb-4 flex flex-wrap gap-2">
            <button type="button"
              onClick={() => result.blindReview && download(result.blindReview, `blind-review-${result.snapshotId}.json`)}
              disabled={!result.blindAvailable}
              className="inline-flex h-9 items-center rounded-control border border-line bg-surface px-3 text-copy font-semibold text-ink shadow-control transition-colors duration-150 ease-snappy hover:bg-sunk/60 disabled:opacity-40" data-testid="reco-qa-download-blind">
              הורדת קובץ לבדיקה עיוורת
            </button>
            <button type="button"
              onClick={() => result.mapping && download(result.mapping, `blind-mapping-${result.snapshotId}.json`)}
              className="inline-flex h-9 items-center rounded-control border border-line bg-surface px-3 text-copy font-semibold text-ink shadow-control transition-colors duration-150 ease-snappy hover:bg-sunk/60" data-testid="reco-qa-download-mapping">
              הורדת מיפוי פנימי
            </button>
            {!result.blindAvailable && <span className="text-caption text-bad self-center" data-testid="reco-qa-blind-blocked">קובץ הבדיקה נחסם: {result.blindBlocked?.reason} ({result.blindBlocked?.hitCount})</span>}
            {result.exportIntegrity && (
              <span className={`text-caption self-center ${result.exportIntegrity.ok ? 'text-ok' : 'text-bad'}`} data-testid="reco-qa-export-integrity">
                תקינות ייצוא: {result.exportIntegrity.ok ? 'תקין (blind = finalized לכל אצווה)' : `נכשל — ${result.exportIntegrity.failures.map((f) => `${f.batchId}:${f.invariant}`).join(' · ')}`}
              </span>
            )}
          </div>

          {result.aggregate && (
            <table className="w-full text-caption mb-4 border border-line" dir="ltr">
              <thead><tr className="bg-sunk">
                <th className="p-1 text-right">metric</th><th className="p-1">Flash</th><th className="p-1">Pro</th>
              </tr></thead>
              <tbody>
                {([
                  ['attempts', (a: AggMetrics) => a.totalAttempts],
                  ['target completion', (a: AggMetrics) => pct(a.targetCompletionRate)],
                  ['non-empty rate', (a: AggMetrics) => pct(a.nonEmptyRate)],
                  ['zero-result rate', (a: AggMetrics) => pct(a.zeroResultRate)],
                  ['mean finalized', (a: AggMetrics) => a.meanFinalized],
                  ['median finalized', (a: AggMetrics) => a.medianFinalized],
                  ['min / max', (a: AggMetrics) => `${a.minFinalized} / ${a.maxFinalized}`],
                  ['avg cost $', (a: AggMetrics) => a.averageCostUsd],
                  ['$/non-empty batch', (a: AggMetrics) => a.costPerNonEmptyBatchUsd ?? '—'],
                  ['$/finalized accepted', (a: AggMetrics) => a.costPerFinalizedAcceptedUsd ?? '—'],
                  ['avg latency ms', (a: AggMetrics) => a.averageLatencyMs],
                  ['p95 latency ms', (a: AggMetrics) => a.p95LatencyMs],
                  ['provider fail rate', (a: AggMetrics) => pct(a.providerFailureRate)],
                  ['synthesis fail rate', (a: AggMetrics) => pct(a.synthesisFailureRate)],
                ] as [string, (a: AggMetrics) => unknown][]).map(([k, f]) => (
                  <tr key={k} className="border-t border-line">
                    <td className="p-1 text-right text-muted">{k}</td>
                    <td className="p-1 text-center">{String(f(result.aggregate!.flash))}</td>
                    <td className="p-1 text-center">{String(f(result.aggregate!.pro))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <table className="w-full text-caption border border-line" dir="ltr" data-testid="reco-qa-attempt-table">
            <thead><tr className="bg-sunk">
              {['batchId', 'model', 'final', 'engine', 'zero', 'provider', 'synth', 'stop', 'cost$', 'tokens(i/o/t)', 'calls', 'ms', 'uniqAccepted', 'rescue', 'escalate', 'reqModel', 'providerErr', 'http', 'retry', 'providerMsg'].map((h) => <th key={h} className="p-1">{h}</th>)}
            </tr></thead>
            <tbody>
              {(result.attempts ?? []).map((a) => (
                <tr key={a.attemptId} className={`border-t border-line ${a.failed ? 'bg-bad-soft ' : ''}`}>
                  <td className="p-1">{a.attemptId}</td>
                  <td className="p-1">{a.model}</td>
                  <td className="p-1 text-center font-bold">{a.finalizedCount}</td>
                  <td className="p-1 text-center">{a.engineAcceptedCount}</td>
                  <td className="p-1 text-center">{a.zeroResult ? '0' : ''}</td>
                  <td className={`p-1 text-center ${a.providerStatus === 'ok' ? 'text-ok' : 'text-bad'}`}>{a.providerStatus}</td>
                  <td className={`p-1 text-center ${a.synthesisStatus === 'ok' ? 'text-ok' : 'text-bad'}`}>{a.synthesisStatus}</td>
                  <td className="p-1">{a.stopReason}</td>
                  <td className="p-1 text-center">{a.estimatedCostUsd}</td>
                  <td className="p-1 text-center">{a.tokenUsage.input}/{a.tokenUsage.output}/{a.tokenUsage.thinking}</td>
                  <td className="p-1 text-center">{a.callCount}</td>
                  <td className="p-1 text-center">{a.latencyMs}</td>
                  <td className="p-1 text-center">{a.uniqueAcceptedCount}</td>
                  <td className="p-1 text-center" title={`rescue potential ${a.rescueCounts.totalRescuePotential}`}>{a.rescueCounts.totalRescuePotential}</td>
                  <td className={`p-1 text-center ${a.escalation.escalate ? 'text-warn' : 'text-muted'}`}>{a.escalation.escalate ? a.escalation.reason : '—'}</td>
                  <td className="p-1">{a.providerDiagnostics?.requestedModel ?? '—'}</td>
                  <td className={`p-1 ${a.providerDiagnostics?.providerErrorType ? 'text-bad' : 'text-muted'}`}>{a.providerDiagnostics?.providerErrorType ?? '—'}</td>
                  <td className="p-1 text-center">{a.providerDiagnostics?.httpStatus ?? '—'}</td>
                  <td className="p-1 text-center">{a.providerDiagnostics?.retryCount ?? 0}</td>
                  <td className="p-1 text-bad max-w-[240px] truncate" title={a.providerDiagnostics?.sanitizedProviderMessage ?? ''}>{a.providerDiagnostics?.sanitizedProviderMessage ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
