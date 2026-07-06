'use client'

/**
 * ArticleInternalLinkApplyPanel — Phase 2E.3.
 *
 * Draft-only, MANUAL preview → apply → (session) rollback of the APPROVED
 * internal-link plan for a generated article. Flag-gated, collapsed by default.
 * Uses ONLY the existing endpoints and writes nothing on its own:
 *   POST …/insert/preview   (read-only; emits previewToken)
 *   POST …/insert/apply      (draft-only; requires fresh previewToken)
 *   POST …/insert/rollback   (draft-only; latest un-restored snapshot)
 *
 * No auto-preview / auto-apply: every network call is behind a button (apply &
 * rollback also behind an explicit confirm). Editing the body invalidates the
 * preview token. Rollback is session-scoped (shown only after a successful apply
 * this session — there is no snapshot-listing endpoint by design).
 *
 * Visually/textually distinct from the Phase-3A "planned internal links" QA card
 * — this is the automation apply flow. Never touches brief_notes / anchors_json.
 */

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { Link2, ChevronDown, ChevronUp } from 'lucide-react'

interface PreviewItem {
  linkId: string
  targetUrl: string
  anchorText: string
  status: 'would_insert' | 'skipped'
  reason?: string | null
  sentencePreview: string | null
  checks: Record<string, boolean>
}
interface PreviewResult {
  reason?: 'no_plan_batch' | 'no_approved_links'
  approvedLinks: number
  wouldInsert: number
  wouldSkip: number
  planStale: boolean
  cacheStale: boolean
  cacheVersionStale: boolean
  planStaleReasons: string[]
  items: PreviewItem[]
}

const PREVIEW_URL = '/api/content/automation/internal-links/plan/insert/preview'
const APPLY_URL = '/api/content/automation/internal-links/plan/insert/apply'
const ROLLBACK_URL = '/api/content/automation/internal-links/plan/insert/rollback'

export interface ApplyOutcome { applied: number; skipped: number; snapshotId: string | null }

export default function ArticleInternalLinkApplyPanel({
  projectId,
  generatedArticleId,
  status,
  isPublished,
  contentHtml,
  language,
  onContentReplaced,
  // Session outcome is LIFTED to the parent so it survives the re-render/remount
  // caused by resyncContentHtml after a successful apply — the rollback button
  // must stay visible until rollback / reload / non-draft.
  applyOutcome,
  rollbackAvailable,
  notice,
  onApplyOutcomeChange,
  onRollbackAvailableChange,
  onNoticeChange,
}: {
  projectId: string
  generatedArticleId: string
  status: 'draft' | 'ready'
  isPublished: boolean
  contentHtml: string
  language: 'he' | 'en'
  onContentReplaced: () => void | Promise<void>
  applyOutcome: ApplyOutcome | null
  rollbackAvailable: boolean
  notice: string | null
  onApplyOutcomeChange: (o: ApplyOutcome | null) => void
  onRollbackAvailableChange: (b: boolean) => void
  onNoticeChange: (s: string | null) => void
}) {
  const t = useMemo(() => getDashboardDictionary(language).contentHub.editor.linkApply, [language])
  const isHebrew = language === 'he'
  const isDraft = status === 'draft' && !isPublished

  const [collapsed, setCollapsed] = useState(true)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null)
  const [previewToken, setPreviewToken] = useState<string | null>(null)
  const [previewedForHtml, setPreviewedForHtml] = useState<string>('')
  const [applying, setApplying] = useState(false)
  const [rollingBack, setRollingBack] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reasonLabel = useCallback((r?: string | null): string => {
    if (!r) return ''
    const base = r.split('(')[0]!
    return (t.reasons as Record<string, string>)[base] ?? r
  }, [t])

  // Any body edit since the preview invalidates the (checksum-pinned) token.
  const contentChanged = !!previewResult && !previewResult.reason && previewedForHtml !== contentHtml

  const runPreview = useCallback(async () => {
    if (loadingPreview) return
    // A fresh preview replaces the apply-result banner + notice, but does NOT
    // clear a session rollback (the snapshot still exists until rolled back).
    setLoadingPreview(true); setError(null); onNoticeChange(null); onApplyOutcomeChange(null)
    try {
      const res = await fetch(PREVIEW_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, generatedArticleId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(t.loadError); setPreviewResult(null); setPreviewToken(null); return }
      setPreviewResult({
        reason: data.reason,
        approvedLinks: data.approvedLinks ?? 0,
        wouldInsert: data.wouldInsert ?? 0,
        wouldSkip: data.wouldSkip ?? 0,
        planStale: !!data.planStale,
        cacheStale: !!data.cacheStale,
        cacheVersionStale: !!data.cacheVersionStale,
        planStaleReasons: Array.isArray(data.planStaleReasons) ? data.planStaleReasons : [],
        items: Array.isArray(data.items) ? data.items : [],
      })
      setPreviewToken(typeof data.previewToken === 'string' ? data.previewToken : null)
      setPreviewedForHtml(contentHtml)
    } catch {
      setError(t.loadError)
    } finally {
      setLoadingPreview(false)
    }
  }, [loadingPreview, projectId, generatedArticleId, contentHtml, t])

  const canApply =
    isDraft && !!previewToken && !!previewResult && !previewResult.reason &&
    previewResult.wouldInsert > 0 && !previewResult.planStale &&
    !previewResult.cacheStale && !previewResult.cacheVersionStale && !contentChanged

  const apply = useCallback(async () => {
    if (applying || !canApply || !previewToken) return
    if (!window.confirm(t.applyConfirm)) return
    setApplying(true); setError(null); onNoticeChange(null)
    try {
      const res = await fetch(APPLY_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, generatedArticleId, previewToken }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409 && data.error === 'stale_preview') {
        setError(t.stalePreview); setPreviewToken(null); setPreviewResult(null); return
      }
      if (res.status === 409 && data.error === 'article_not_draft') { setError(t.draftOnly); return }
      if (!res.ok) { setError(t.applyError); return }
      if (data.contentChanged && (data.applied ?? 0) > 0) {
        // Persist the session outcome to the PARENT before resync so the rollback
        // button survives the contentHtml-driven re-render that follows.
        onApplyOutcomeChange({ applied: data.applied, skipped: data.skipped ?? 0, snapshotId: data.snapshotId ?? null })
        onRollbackAvailableChange(true)
        setPreviewResult(null); setPreviewToken(null)
        await onContentReplaced()
      } else {
        // nothing_inserted / no-op — no snapshot, no content change, not an error.
        onApplyOutcomeChange(null)
        onNoticeChange(t.nothingInserted)
        setPreviewResult(null); setPreviewToken(null)
      }
    } catch {
      setError(t.applyError)
    } finally {
      setApplying(false)
    }
  }, [applying, canApply, previewToken, projectId, generatedArticleId, onContentReplaced, onApplyOutcomeChange, onRollbackAvailableChange, onNoticeChange, t])

  const rollback = useCallback(async () => {
    if (rollingBack) return
    if (!window.confirm(t.rollbackConfirm)) return
    setRollingBack(true); setError(null); onNoticeChange(null)
    try {
      const res = await fetch(ROLLBACK_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, generatedArticleId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409 && data.error === 'article_not_draft') { setError(t.draftOnly); return }
      if (!res.ok) { setError(t.rollbackError); return }
      if (data.ok && data.rolledBack) {
        onNoticeChange(t.rollbackDone)
        onRollbackAvailableChange(false)
        onApplyOutcomeChange(null)
        setPreviewResult(null); setPreviewToken(null)
        await onContentReplaced()
      } else if (data.reason === 'no_snapshot') {
        onNoticeChange(t.rollbackNoSnapshot); onRollbackAvailableChange(false)
      }
    } catch {
      setError(t.rollbackError)
    } finally {
      setRollingBack(false)
    }
  }, [rollingBack, projectId, generatedArticleId, onContentReplaced, onApplyOutcomeChange, onRollbackAvailableChange, onNoticeChange, t])

  if (process.env.NEXT_PUBLIC_ENABLE_INTERNAL_LINK_PLANNING !== 'true') return null

  const staleWarn =
    previewResult && !previewResult.reason
      ? previewResult.planStale ? t.planStaleWarn
        : previewResult.cacheStale ? t.cacheStaleWarn
          : previewResult.cacheVersionStale ? t.cacheVersionStaleWarn
            : null
      : null

  // Force the panel open whenever there is an active session outcome so the
  // apply-success message + rollback stay visible even if a re-render/remount
  // resets the local `collapsed` flag.
  const open = !collapsed || rollbackAvailable || !!applyOutcome

  return (
    <Card className="hover:translate-y-0 border-indigo-100 dark:border-indigo-500/20">
      <div dir={isHebrew ? 'rtl' : 'ltr'}>
        {/* Header — distinct from the QA card; toggle does NOT fetch. */}
        <button type="button" onClick={() => setCollapsed((v) => !v)} className="w-full flex items-center justify-between gap-3 text-start">
          <span className="inline-flex items-center gap-2">
            <Link2 size={16} className="text-indigo-600 dark:text-indigo-400" />
            <span className="text-base font-semibold text-slate-800 dark:text-slate-100">{t.title}</span>
          </span>
          <span className="inline-flex items-center gap-2 text-slate-400">
            {rollbackAvailable && <Badge variant="neutral">{t.rollbackAvailable}</Badge>}
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </button>

        {open && (
          <div className="mt-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t.subtitle}</p>

            {/* Non-draft guard — warning only, no controls, no calls. */}
            {!isDraft ? (
              <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                {t.draftOnly}
              </p>
            ) : (
              <>
                {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
                {notice && <p className="mb-2 text-xs text-slate-600 dark:text-slate-300">{notice}</p>}

                {/* Manual actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={runPreview} loading={loadingPreview} disabled={loadingPreview || applying || rollingBack}>
                    {loadingPreview ? t.previewing : t.runPreview}
                  </Button>
                  {canApply && (
                    <Button size="sm" onClick={apply} loading={applying} disabled={applying}>
                      {applying ? t.applying : t.apply}
                    </Button>
                  )}
                  {rollbackAvailable && (
                    <Button size="sm" variant="ghost" onClick={rollback} loading={rollingBack} disabled={rollingBack} className="text-red-600 dark:text-red-400">
                      {rollingBack ? t.rollingBack : t.rollback}
                    </Button>
                  )}
                </div>

                {/* Content-edited-since-preview invalidation */}
                {contentChanged && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{t.contentChangedRepreview}</p>
                )}

                {/* Apply result */}
                {applyOutcome && (
                  <div className="mt-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
                    <span className="font-medium">{t.appliedTitle}</span>
                    {' · '}{t.appliedCount}: {applyOutcome.applied} · {t.skippedCount}: {applyOutcome.skipped}
                    {applyOutcome.snapshotId && <span className="text-emerald-600/80 dark:text-emerald-400/70"> · {t.snapshotLabel}: {applyOutcome.snapshotId.slice(0, 8)}</span>}
                    {rollbackAvailable && <span className="font-medium"> · {t.rollbackAvailable}</span>}
                  </div>
                )}

                {/* Preview result */}
                {previewResult && previewResult.reason === 'no_plan_batch' && (
                  <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                    <p>{t.noPlan}</p>
                    <Link href={`/content?projectId=${projectId}`} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">{t.noPlanHint}</Link>
                  </div>
                )}
                {previewResult && previewResult.reason === 'no_approved_links' && (
                  <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{t.noApproved}</p>
                )}

                {previewResult && !previewResult.reason && (
                  <div className="mt-3">
                    <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{t.previewTitle}</div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                      {t.summaryApproved}: {previewResult.approvedLinks} · {t.summaryWouldInsert}: {previewResult.wouldInsert} · {t.summaryWouldSkip}: {previewResult.wouldSkip} · {t.contentUnchanged}
                    </p>
                    {staleWarn && <p className="mb-2 text-xs text-amber-700 dark:text-amber-400">{staleWarn}{previewResult.planStale && previewResult.planStaleReasons.length ? ` (${previewResult.planStaleReasons.join(', ')})` : ''}</p>}
                    <div className="space-y-2">
                      {previewResult.items.map((it) => (
                        <div key={it.linkId} className="rounded-lg border border-slate-100 dark:border-slate-800 p-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{it.anchorText || '—'}</span>
                            <Badge variant={it.status === 'would_insert' ? 'success' : 'neutral'}>
                              {it.status === 'would_insert' ? t.statusWouldInsert : t.statusSkipped}
                            </Badge>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">{reasonLabel(it.reason)}</span>
                          </div>
                          <a href={it.targetUrl} target="_blank" rel="noopener noreferrer" dir="ltr" className="mt-1 block text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline break-all">{it.targetUrl}</a>
                          {it.sentencePreview && (
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400"><span className="text-slate-400">{t.sentenceLabel}:</span> “{it.sentencePreview}”</p>
                          )}
                          {it.checks && Object.keys(it.checks).length > 0 && (
                            <details className="mt-1">
                              <summary className="cursor-pointer select-none text-[10px] text-slate-400">{t.techDetails}</summary>
                              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                                {Object.entries(it.checks).map(([k, v]) => (
                                  <div key={k} className="flex items-center gap-1">
                                    <span className={v ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}>{v ? '✓' : '✕'}</span>
                                    <span dir="ltr">{k}</span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
