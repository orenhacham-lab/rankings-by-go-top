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
    </div>
  )
}
