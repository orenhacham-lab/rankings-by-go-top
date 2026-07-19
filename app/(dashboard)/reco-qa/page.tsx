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
  const verdictColor = (v: string) => v === 'PASS' ? 'text-emerald-600' : v === 'INSUFFICIENT_INVENTORY' ? 'text-amber-600' : 'text-red-600'
  const counts = Object.values(reports).reduce((acc, r) => { const v = verdictOf(r); acc[v] = (acc[v] ?? 0) + 1; return acc }, {} as Record<string, number>)
  const allPassed = done > 0 && (counts['FAIL'] ?? 0) === 0 && (counts['INSUFFICIENT_INVENTORY'] ?? 0) === 0

  return (
    <div className="max-w-5xl mx-auto py-8 px-4" dir="rtl">
      <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-1">בדיקת קבלה חיה — מנוע הרעיונות</h1>
      <p className="text-xs text-slate-500 mb-4">מריץ את המנוע על נתוני הפרויקטים האמיתיים מול Gemini אמיתי, בודק אוטומטית את כל כללי הקבלה ומפיק דוח. Preview בלבד (דורש RECO_ISOLATION_DIAGNOSTICS=1).</p>

      <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
        <div className="flex items-center gap-1">
          {(['premium', 'standard'] as const).map((m) => (
            <button key={m} onClick={() => setTier(m)} disabled={running}
              className={`rounded-full border px-3 py-1 text-xs ${tier === m ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}>
              {m === 'premium' ? 'איכותי — Gemini Pro' : 'מהיר — Gemini Flash'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <input type="checkbox" checked={persist} onChange={(e) => setPersist(e.target.checked)} disabled={running} />
          שמור רעיונות בפרויקט (בדיקת persistence מלאה)
        </label>
        <button onClick={runMatrix} disabled={running || selected.size === 0}
          className="rounded-md bg-indigo-600 text-white px-4 py-1.5 text-sm disabled:opacity-50">
          {running ? `מריץ… ${current ? label(projects.find((p) => p.id === current) ?? { id: current, name: null, business_name: null }) : ''}` : `הרץ בדיקת קבלה (${selected.size} פרויקטים)`}
        </button>
        {done > 0 && !running && (
          <button onClick={downloadJson} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">הורד דוח JSON</button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-5 text-xs">
        {projects.map((p) => (
          <label key={p.id} className="flex items-center gap-1 rounded border border-slate-200 dark:border-slate-700 px-2 py-1">
            <input type="checkbox" checked={selected.has(p.id)} disabled={running}
              onChange={(e) => setSelected((prev) => { const n = new Set(prev); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n })} />
            {label(p)}
            {reports[p.id] && (
              <span className={`${verdictColor(verdictOf(reports[p.id]))} font-bold`}>{verdictOf(reports[p.id])}</span>
            )}
          </label>
        ))}
        {loadError && <span className="text-red-600">{loadError}</span>}
      </div>

      {done > 0 && !running && (
        <p className={`text-sm font-bold mb-4 ${allPassed ? 'text-emerald-700' : (counts['FAIL'] ?? 0) > 0 ? 'text-red-700' : 'text-amber-700'}`}>
          {`PASS: ${counts['PASS'] ?? 0} · INSUFFICIENT_INVENTORY: ${counts['INSUFFICIENT_INVENTORY'] ?? 0} · FAIL: ${counts['FAIL'] ?? 0}`}
        </p>
      )}

      {Object.entries(reports).map(([pid, r]) => {
        const p = projects.find((x) => x.id === pid)
        const mp = r.run?.modelPath
        return (
          <div key={pid} className="mb-6 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <h2 className="font-bold text-slate-800 dark:text-slate-100 mb-1">
              {p ? label(p) : pid} — <span className={verdictColor(verdictOf(r))}>{verdictOf(r)}</span>
              {typeof r.acceptance?.warnings === 'number' && r.acceptance.warnings > 0 && <span className="text-amber-600 text-xs"> · {r.acceptance.warnings} לבדיקה ידנית</span>}
            </h2>
            {!r.ok && <p className="text-xs text-red-600 mb-2">{r.error} {r.message}</p>}
            {mp && (
              <p className="text-xs text-slate-600 dark:text-slate-300 mb-2" dir="ltr">
                model: <b>{mp.model}</b> · tierUsed: <b>{mp.tierUsed}</b> · requested: {mp.requestedTier} · downgraded: <b className={mp.downgraded ? 'text-red-600' : 'text-emerald-600'}>{String(mp.downgraded)}</b>
                {' '}· calls: {String(r.run?.model_calls)} · accepted: {String(r.run?.accepted)} · pool: {String(r.run?.brief_pool?.pool_size)} · stop: {String(r.run?.stop_reason)} · {r.durationMs}ms
              </p>
            )}
            {r.run?.modelConfig && (
              <p className="text-[11px] text-slate-500 mb-1" dir="ltr">
                thinking: {r.run.modelConfig.thinkingMode} · budget {r.run.modelConfig.thinkingBudget} · maxOutputTokens {r.run.modelConfig.maxOutputTokens}
              </p>
            )}
            {r.run?.brief_pool && (
              <p className="text-[11px] text-slate-500 mb-1" dir="ltr">
                pool: raw {String(r.run.brief_pool.total_raw_candidates ?? '—')} (queries {String(r.run.brief_pool.raw_query_candidates ?? '—')} · tracked {String(r.run.brief_pool.raw_tracked_candidates ?? '—')} · themes {String(r.run.brief_pool.raw_theme_candidates ?? '—')}) → pool {r.run.brief_pool.pool_size} · withDemand {String(r.run.brief_pool.with_demand ?? '—')} · rejected {JSON.stringify(r.run.brief_pool.rejected_by_reason ?? {})}
              </p>
            )}
            {Array.isArray(r.run?.brief_pool?.rejected_examples) && r.run.brief_pool.rejected_examples.length > 0 && (
              <details className="text-[11px] text-slate-500 mb-2">
                <summary>דוגמאות מועמדים שנדחו ({r.run.brief_pool.rejected_examples.length})</summary>
                <ul className="mt-1 space-y-0.5">
                  {r.run.brief_pool.rejected_examples.map((ex, i) => (
                    <li key={i} dir="rtl">「{ex.subject}」 — <span dir="ltr">{ex.reason} · {ex.evidenceKind}</span></li>
                  ))}
                </ul>
              </details>
            )}
            {r.acceptance && (
              <table className="w-full text-[11px] mb-3" dir="ltr">
                <tbody>
                  {r.acceptance.rules.map((rule) => (
                    <tr key={rule.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className={`py-0.5 pr-2 font-mono whitespace-nowrap ${rule.pass ? 'text-emerald-600' : rule.level === 'warn' ? 'text-amber-600' : 'text-red-600'}`}>
                        {rule.pass ? '✓' : rule.level === 'warn' ? '⚠' : '✗'} {rule.id}
                      </td>
                      <td className="py-0.5 text-slate-500 break-all">{rule.detail}</td>
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
                    <p className="text-[11px] text-slate-500 mb-1" dir="ltr">
                      cost: ${cost.estimatedRunCostUsd} (₪{cost.estimatedRunCostIls}) · perTopic ${cost.costPerAcceptedTopic} · calls {cost.totalPaidCalls}/2 · ceiling ${cost.configuredCostCeilingUsd} · remaining ${cost.remainingBudgetUsd} · preventedByBudget {cost.callsPreventedByBudget}
                      {(cost.calls ?? []).map((c, i) => <span key={i}> · [{c.callPurpose} {c.model}: in {c.inputTokens} / out {c.answerOutputTokens} + think {c.thinkingTokens} = {c.totalBillableOutputTokens} → ${c.estimatedCostUsd}]</span>)}
                    </p>
                  )}
                  {cl && (
                    <p className={`text-[11px] mb-1 ${acceptedLeak.length ? 'text-red-600' : 'text-slate-500'}`} dir="rtl">
                      דליפת מתחרים — בפלט מאושר: {acceptedLeak.length ? acceptedLeak.join(' · ') : 'אין'} · במחקר שנדחה (אבחון): {(cl.researchRejected ?? []).length}
                    </p>
                  )}
                </>
              )
            })()}
            {Array.isArray(r.topics) && r.topics.length > 0 && (
              <div className="space-y-2">
                {r.topics.map((t0, i) => (
                  <div key={i} className="rounded border border-slate-100 dark:border-slate-800 p-2 text-xs">
                    <div className="font-medium text-slate-800 dark:text-slate-200">{t0.title}</div>
                    <div className="text-slate-500">מילת מפתח: {t0.normalizedPrimaryKeyword ?? t0.primaryKeyword} · כוונה: {t0.intent}{t0.recommendedPageType ? ` · ${t0.recommendedPageType}` : ''} · demand: {t0.demandMatchType ?? 'none'}{t0.demand?.avgMonthlySearches && (t0.demandMatchType === 'exact' || t0.demandMatchType === 'close_intent') ? ` "${t0.demand.demandQuery}" ≈ ${t0.demand.avgMonthlySearches}/חודש` : ''}</div>
                    <div className="text-slate-500">{t0.reason}</div>
                    {(t0.coverageMatches ?? []).filter((m) => m.matchType !== 'distinct').length > 0 && (
                      <div className="text-amber-600" dir="rtl">כיסוי קיים: {(t0.coverageMatches ?? []).filter((m) => m.matchType !== 'distinct').map((m) => `${m.existingTitle} (${m.matchType} ${m.score})`).join(' · ')}</div>
                    )}
                    {(t0.linkDiagnostics ?? []).filter((l) => !!l.acceptedBecause).length > 0 && (
                      <div className="text-emerald-600" dir="ltr">✓ links: {(t0.linkDiagnostics ?? []).filter((l) => !!l.acceptedBecause).map((l) => `${l.targetTitle} [${l.role}] ${l.acceptedBecause}`).join(' · ')}</div>
                    )}
                    {(t0.linkDiagnostics ?? []).filter((l) => !l.acceptedBecause).length > 0 && (
                      <div className="text-rose-400/80" dir="ltr">✗ rejected: {(t0.linkDiagnostics ?? []).filter((l) => !l.acceptedBecause).map((l) => `${l.targetTitle} (${l.rejectionReasons.join(',')})`).join(' · ')}</div>
                    )}
                    {(t0.linkDiagnostics ?? []).length === 0 && t0.links.length > 0 && <div className="text-slate-400" dir="ltr">{t0.links.map((l) => l.url).join(' · ')}</div>}
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
    <section className="mt-10 rounded-lg border-2 border-dashed border-indigo-300 dark:border-indigo-800 p-4" dir="rtl" data-testid="reco-qa-comparison">
      <h2 className="text-lg font-bold text-indigo-800 dark:text-indigo-300 mb-1">השוואת Flash מול Pro (QA/אדמין בלבד)</h2>
      <p className="text-xs text-slate-500 mb-3">מריץ תמונת מצב אחת (snapshot) ומריץ עליה מספר ניסיונות Flash ו-Pro. אינו נוגע בזרימת המשתמש הרגילה, אינו שומר דבר, ואינו מפעיל אסקלציה אוטומטית. Preview בלבד.</p>

      <div className="flex flex-wrap items-end gap-3 mb-3 text-sm">
        <label className="flex flex-col gap-1 text-xs">פרויקט
          <select value={effectiveProject} onChange={(e) => { setProjectId(e.target.value); invalidatePreflight() }} disabled={busy} className="rounded border border-slate-300 px-2 py-1 text-sm min-w-[180px]">
            {projects.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">מספר המלצות מבוקש
          <input type="number" min={1} max={20} value={targetCount} disabled={busy} onChange={(e) => { setTargetCount(Number(e.target.value) || 1); invalidatePreflight() }} className="rounded border border-slate-300 px-2 py-1 text-sm w-24" />
        </label>
        <label className="flex flex-col gap-1 text-xs">ניסיונות לכל מודל
          <input type="number" min={3} max={6} value={attempts} disabled={busy} onChange={(e) => { setAttempts(Number(e.target.value) || 3); invalidatePreflight() }} className="rounded border border-slate-300 px-2 py-1 text-sm w-24" />
        </label>
        <button type="button" onClick={doPreflight} disabled={busy} className="rounded-md bg-indigo-600 text-white px-4 py-1.5 text-sm disabled:opacity-50" data-testid="reco-qa-preflight-btn">
          {isCalculatingCost ? 'מחשב…' : 'חשב עלות מקסימלית'}
        </button>
      </div>

      {err && <p className="text-xs text-red-600 mb-2" data-testid="reco-qa-error">{err}</p>}

      {preflight && !result && (() => {
        const estWorst = preflight.estimatedWorstCaseCostUsd ?? preflight.maxAuthorizedCostUsd
        const limit = preflight.authorizedLimitUsd
        return (
          <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 mb-3 text-sm" data-testid="reco-qa-preflight">
            <p className="text-amber-800 dark:text-amber-300 mb-2" dir="rtl">
              עלות בתרחיש הגרוע: <b dir="ltr">${estWorst}</b> · תקרת QA מאושרת: <b dir="ltr">${limit ?? '—'}</b> · {attempts}×2 ניסיונות · יעד {targetCount}. הריצה אינה שומרת המלצות.
            </p>
            {within ? (
              <button type="button" onClick={doRun} disabled={!canConfirm} className="rounded-md bg-rose-600 text-white px-4 py-1.5 text-sm disabled:opacity-50" data-testid="reco-qa-confirm-run">
                {isRunningComparison ? 'מריץ השוואה…' : 'אשר והרץ השוואה'}
              </button>
            ) : (
              <p className="text-red-600 text-xs" data-testid="reco-qa-cost-blocked" dir="rtl">
                הריצה חסומה: העלות בתרחיש הגרוע (${estWorst}) חורגת מהתקרה המאושרת (${limit}). הקטן את מספר הניסיונות או העלה את RECO_QA_MAX_RUN_COST_USD ופרוס מחדש את ה-Preview.
              </p>
            )}
          </div>
        )
      })()}

      {result && (
        <div data-testid="reco-qa-comparison-result">
          <p className="text-xs text-slate-600 dark:text-slate-300 mb-2" dir="ltr">
            snapshot <b>{result.snapshotId}</b> · commit <b>{result.commitSha ?? 'unknown'}</b> · pool {result.poolSize} · discovery {String(result.discoveryRan)} · prepCalls {result.preparationProviderCalls} · maxCost ${result.maxAuthorizedCostUsd} · actualCost ${result.actualCostUsd} · persist {String(result.persist)} · writes {result.persistedWrites}
          </p>
          {result.modelResolution && (
            <p className="text-xs mb-1" dir="ltr" data-testid="reco-qa-model-resolution">
              models: flash <b>{result.modelResolution.flashRequested}</b>{result.modelResolution.flashResolved ? '' : ` (unresolved: ${result.modelResolution.flashResolutionReason})`} · pro <b>{result.modelResolution.proRequested}</b> (tierUsed {result.modelResolution.proTierUsed}{result.modelResolution.proDowngraded ? ` · DOWNGRADED: ${result.modelResolution.proDowngradeReason}` : ''})
            </p>
          )}
          {result.selectionSimulation && (
            <p className="text-xs mb-3" dir="ltr" data-testid="reco-qa-selection-sim">
              selection <b>(simulated · {result.selectionSimulation.policy}, paired by {result.selectionSimulation.pairedBy})</b>: Pro won {result.selectionSimulation.summary.proWins}/{result.selectionSimulation.summary.pairsCompared} · Flash won {result.selectionSimulation.summary.flashWins} · provisional ties {result.selectionSimulation.summary.provisionalTies} · no-decision {result.selectionSimulation.summary.noDecision} · budget <b>{result.budget?.path}</b>
            </p>
          )}

          <div className="mb-4 flex flex-wrap gap-2">
            <button type="button"
              onClick={() => result.blindReview && download(result.blindReview, `blind-review-${result.snapshotId}.json`)}
              disabled={!result.blindAvailable}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40" data-testid="reco-qa-download-blind">
              הורדת קובץ לבדיקה עיוורת
            </button>
            <button type="button"
              onClick={() => result.mapping && download(result.mapping, `blind-mapping-${result.snapshotId}.json`)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" data-testid="reco-qa-download-mapping">
              הורדת מיפוי פנימי
            </button>
            {!result.blindAvailable && <span className="text-xs text-red-600 self-center">קובץ הבדיקה נחסם: {result.blindBlocked?.reason} ({result.blindBlocked?.hitCount})</span>}
          </div>

          {result.aggregate && (
            <table className="w-full text-[11px] mb-4 border border-slate-200 dark:border-slate-700" dir="ltr">
              <thead><tr className="bg-slate-50 dark:bg-slate-800">
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
                  <tr key={k} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="p-1 text-right text-slate-500">{k}</td>
                    <td className="p-1 text-center">{String(f(result.aggregate!.flash))}</td>
                    <td className="p-1 text-center">{String(f(result.aggregate!.pro))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <table className="w-full text-[10px] border border-slate-200 dark:border-slate-700" dir="ltr" data-testid="reco-qa-attempt-table">
            <thead><tr className="bg-slate-50 dark:bg-slate-800">
              {['batchId', 'model', 'final', 'engine', 'zero', 'provider', 'synth', 'stop', 'cost$', 'tokens(i/o/t)', 'calls', 'ms', 'uniqAccepted', 'rescue', 'escalate', 'reqModel', 'providerErr', 'http', 'retry', 'providerMsg'].map((h) => <th key={h} className="p-1">{h}</th>)}
            </tr></thead>
            <tbody>
              {(result.attempts ?? []).map((a) => (
                <tr key={a.attemptId} className={`border-t border-slate-100 dark:border-slate-800 ${a.failed ? 'bg-rose-50 dark:bg-rose-950/30' : ''}`}>
                  <td className="p-1 font-mono">{a.attemptId}</td>
                  <td className="p-1">{a.model}</td>
                  <td className="p-1 text-center font-bold">{a.finalizedCount}</td>
                  <td className="p-1 text-center">{a.engineAcceptedCount}</td>
                  <td className="p-1 text-center">{a.zeroResult ? '∅' : ''}</td>
                  <td className={`p-1 text-center ${a.providerStatus === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>{a.providerStatus}</td>
                  <td className={`p-1 text-center ${a.synthesisStatus === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>{a.synthesisStatus}</td>
                  <td className="p-1">{a.stopReason}</td>
                  <td className="p-1 text-center">{a.estimatedCostUsd}</td>
                  <td className="p-1 text-center">{a.tokenUsage.input}/{a.tokenUsage.output}/{a.tokenUsage.thinking}</td>
                  <td className="p-1 text-center">{a.callCount}</td>
                  <td className="p-1 text-center">{a.latencyMs}</td>
                  <td className="p-1 text-center">{a.uniqueAcceptedCount}</td>
                  <td className="p-1 text-center" title={`rescue potential ${a.rescueCounts.totalRescuePotential}`}>{a.rescueCounts.totalRescuePotential}</td>
                  <td className={`p-1 text-center ${a.escalation.escalate ? 'text-amber-600' : 'text-slate-400'}`}>{a.escalation.escalate ? a.escalation.reason : '—'}</td>
                  <td className="p-1 font-mono">{a.providerDiagnostics?.requestedModel ?? '—'}</td>
                  <td className={`p-1 ${a.providerDiagnostics?.providerErrorType ? 'text-red-600' : 'text-slate-400'}`}>{a.providerDiagnostics?.providerErrorType ?? '—'}</td>
                  <td className="p-1 text-center">{a.providerDiagnostics?.httpStatus ?? '—'}</td>
                  <td className="p-1 text-center">{a.providerDiagnostics?.retryCount ?? 0}</td>
                  <td className="p-1 text-rose-500 max-w-[240px] truncate" title={a.providerDiagnostics?.sanitizedProviderMessage ?? ''}>{a.providerDiagnostics?.sanitizedProviderMessage ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
