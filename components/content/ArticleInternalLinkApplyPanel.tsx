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
import Notice from '@/components/ui/Notice'
import { Check, ChevronDown, Circle, CircleDot, ExternalLink, Link2, Minus } from 'lucide-react'

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
  // Phase 3B.3 — count of PLANNED (saved-but-unapproved) links in the topic's
  // latest batch, surfaced only in the no_approved_links state.
  plannedLinks: number
  planStale: boolean
  cacheStale: boolean
  cacheVersionStale: boolean
  planStaleReasons: string[]
  items: PreviewItem[]
}

// Phase 3B.4 — safe in-draft alternative anchors for approved links whose anchor
// text is missing from the generated body.
interface ReanchorSuggestion { anchorText: string; sentence: string | null; wordOffset: number | null }
interface ReanchorLink { linkId: string; targetUrl: string; targetTitle: string | null; originalAnchor: string; suggestions: ReanchorSuggestion[] }

const PREVIEW_URL = '/api/content/automation/internal-links/plan/insert/preview'
const APPLY_URL = '/api/content/automation/internal-links/plan/insert/apply'
const ROLLBACK_URL = '/api/content/automation/internal-links/plan/insert/rollback'
const APPROVE_PLANNED_URL = '/api/content/automation/internal-links/plan/insert/approve-planned'
const REANCHOR_SUGGEST_URL = '/api/content/automation/internal-links/plan/insert/reanchor/suggest'
const REANCHOR_SELECT_URL = '/api/content/automation/internal-links/plan/insert/reanchor/select'

export interface ApplyOutcome {
  applied: number
  skipped: number
  snapshotId: string | null
  // Phase 3J — success accounting: links whose target was ALREADY linked in the
  // content count as embedded (success), and the total approved is the "of Y".
  alreadyLinked?: number
  approvedTotal?: number
}
export interface PreviewSummary { hasPreview: boolean; approvedLinks: number; wouldInsert: number; wouldSkip: number }

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
  // Lifted so the editor's "mark ready" guard can see, session-only, whether a
  // preview found approved links not yet applied. Never fetched automatically.
  onPreviewSummaryChange,
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
  onPreviewSummaryChange?: (s: PreviewSummary | null) => void
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
  const [approvingPlanned, setApprovingPlanned] = useState(false)
  const [reanchorLoading, setReanchorLoading] = useState(false)
  const [reanchorLinks, setReanchorLinks] = useState<ReanchorLink[] | null>(null)
  const [reanchorSel, setReanchorSel] = useState<Record<string, string>>({})
  const [reanchorApplying, setReanchorApplying] = useState(false)
  const [copiedAnchor, setCopiedAnchor] = useState<string | null>(null)
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
    setReanchorLinks(null); setReanchorSel({}) // a fresh preview supersedes any re-anchor suggestions
    try {
      const res = await fetch(PREVIEW_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, generatedArticleId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(t.loadError); setPreviewResult(null); setPreviewToken(null); return }
      const wouldInsert = data.wouldInsert ?? 0
      const approvedLinks = data.approvedLinks ?? 0
      const wouldSkip = data.wouldSkip ?? 0
      setPreviewResult({
        reason: data.reason,
        approvedLinks,
        wouldInsert,
        wouldSkip,
        plannedLinks: typeof data.plannedLinks === 'number' ? data.plannedLinks : 0,
        planStale: !!data.planStale,
        cacheStale: !!data.cacheStale,
        cacheVersionStale: !!data.cacheVersionStale,
        planStaleReasons: Array.isArray(data.planStaleReasons) ? data.planStaleReasons : [],
        items: Array.isArray(data.items) ? data.items : [],
      })
      setPreviewToken(typeof data.previewToken === 'string' ? data.previewToken : null)
      setPreviewedForHtml(contentHtml)
      onPreviewSummaryChange?.({ hasPreview: true, approvedLinks, wouldInsert, wouldSkip })
    } catch {
      setError(t.loadError)
    } finally {
      setLoadingPreview(false)
    }
  }, [loadingPreview, projectId, generatedArticleId, contentHtml, t, onPreviewSummaryChange])

  // Phase 3B.3 — when a topic has planned-but-unapproved links, flip them to
  // approved (review-status only, no content write) then re-run the normal
  // read-only preview so approved links surface as would_insert and the existing
  // Apply flow becomes available. No silent auto-approve: this is an explicit
  // button, and apply itself still requires its own confirmed click.
  const approvePlanned = useCallback(async () => {
    if (approvingPlanned || loadingPreview) return
    setApprovingPlanned(true); setError(null)
    try {
      const res = await fetch(APPROVE_PLANNED_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, generatedArticleId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) { setError(t.approvePlannedError); return }
      await runPreview()
    } catch {
      setError(t.approvePlannedError)
    } finally {
      setApprovingPlanned(false)
    }
  }, [approvingPlanned, loadingPreview, projectId, generatedArticleId, runPreview, t])

  // Phase 3B.4 — approved links skipped because their exact anchor text is
  // missing from the draft body. These are the only ones the re-anchor recovery
  // targets; links that place normally are shown as-is.
  const missingAnchorItems = useMemo(
    () => (previewResult && !previewResult.reason ? previewResult.items.filter((it) => it.status === 'skipped' && (it.reason || '').startsWith('anchor_not_found_in_safe_prose')) : []),
    [previewResult],
  )

  // Fetch SAFE alternative anchors that already exist in the draft (read-only;
  // suggests only vetted anchor phrases present as natural prose — invents none).
  const findReanchors = useCallback(async () => {
    if (reanchorLoading) return
    setReanchorLoading(true); setError(null); setReanchorLinks(null); setReanchorSel({})
    try {
      const res = await fetch(REANCHOR_SUGGEST_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, generatedArticleId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) { setError(t.reanchorError); return }
      setReanchorLinks(Array.isArray(data.links) ? data.links : [])
    } catch {
      setError(t.reanchorError)
    } finally {
      setReanchorLoading(false)
    }
  }, [reanchorLoading, projectId, generatedArticleId, t])

  const chooseReanchor = useCallback((linkId: string, anchorText: string) => {
    setReanchorSel((prev) => ({ ...prev, [linkId]: anchorText }))
  }, [])

  // Copy an original anchor so the user can paste it into the body manually when
  // no in-draft alternative exists. Best-effort; silent if clipboard is blocked.
  const copyAnchor = useCallback(async (linkId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedAnchor(linkId)
      window.setTimeout(() => setCopiedAnchor((c) => (c === linkId ? null : c)), 1500)
    } catch { /* clipboard unavailable — no-op */ }
  }, [])

  // Record the chosen alternative anchors (plan anchor_text update only — no
  // content mutation), then re-run the normal read-only preview so they surface
  // as would_insert and the existing confirmed apply flow becomes available.
  const applyReanchors = useCallback(async () => {
    if (reanchorApplying) return
    const selections = Object.entries(reanchorSel).map(([linkId, anchorText]) => ({ linkId, anchorText })).filter((s) => s.anchorText)
    if (selections.length === 0) return
    setReanchorApplying(true); setError(null)
    try {
      const res = await fetch(REANCHOR_SELECT_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, generatedArticleId, selections }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) { setError(t.reanchorApproveError); return }
      setReanchorLinks(null); setReanchorSel({})
      await runPreview()
    } catch {
      setError(t.reanchorApproveError)
    } finally {
      setReanchorApplying(false)
    }
  }, [reanchorApplying, reanchorSel, projectId, generatedArticleId, runPreview, t])

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
        // Phase 3J — carry the success accounting (already-linked = success) from
        // the preview that produced this apply, for the "X/Y embedded" line.
        const alreadyLinked = previewResult && !previewResult.reason
          ? previewResult.items.filter((it) => (it.reason || '').startsWith('target_already_linked')).length
          : 0
        onApplyOutcomeChange({ applied: data.applied, skipped: data.skipped ?? 0, snapshotId: data.snapshotId ?? null, alreadyLinked, approvedTotal: previewResult?.approvedLinks })
        onRollbackAvailableChange(true)
        onPreviewSummaryChange?.(null) // links applied → no longer "unapplied"
        setPreviewResult(null); setPreviewToken(null)
        await onContentReplaced()
      } else {
        // nothing_inserted / no-op — no snapshot, no content change, not an error.
        onApplyOutcomeChange(null)
        onNoticeChange(t.nothingInserted)
        onPreviewSummaryChange?.(null)
        setPreviewResult(null); setPreviewToken(null)
      }
    } catch {
      setError(t.applyError)
    } finally {
      setApplying(false)
    }
  }, [applying, canApply, previewToken, previewResult, projectId, generatedArticleId, onContentReplaced, onApplyOutcomeChange, onRollbackAvailableChange, onNoticeChange, onPreviewSummaryChange, t])

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
        onPreviewSummaryChange?.(null)
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
  }, [rollingBack, projectId, generatedArticleId, onContentReplaced, onApplyOutcomeChange, onRollbackAvailableChange, onNoticeChange, onPreviewSummaryChange, t])

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

  // Compact status chip so the current state is obvious at a glance.
  const s = t.state as Record<string, string>
  const chipTones: Record<string, 'neutral' | 'warning' | 'success' | 'info'> = {
    neutral: 'neutral',
    amber: 'warning',
    emerald: 'success',
    indigo: 'info',
  }
  let chip: { label: string; tone: string }
  if (!isDraft) chip = { label: s.nonDraft, tone: 'amber' }
  else if (applyOutcome) chip = { label: s.applied.replace('{n}', String(applyOutcome.applied)), tone: 'emerald' }
  else if (contentChanged) chip = { label: s.contentChanged, tone: 'amber' }
  else if (previewResult?.reason === 'no_plan_batch') chip = { label: s.noPlan, tone: 'neutral' }
  else if (previewResult?.reason === 'no_approved_links') chip = previewResult.plannedLinks > 0 ? { label: s.plannedReady.replace('{n}', String(previewResult.plannedLinks)), tone: 'amber' } : { label: s.noApproved, tone: 'neutral' }
  else if (previewResult && !previewResult.reason) {
    if (previewResult.planStale || previewResult.cacheStale || previewResult.cacheVersionStale) chip = { label: s.stale, tone: 'amber' }
    else if (previewResult.wouldInsert > 0) chip = { label: s.wouldInsert.replace('{n}', String(previewResult.wouldInsert)), tone: 'indigo' }
    else chip = { label: s.nothingToInsert, tone: 'neutral' }
  } else chip = { label: s.readyToPreview, tone: 'neutral' }

  return (
    <Card className="border-s-[3px] border-s-action p-5 sm:p-6">
      <div dir={isHebrew ? 'rtl' : 'ltr'}>
        {/* Header — distinct from the QA card; toggle does NOT fetch. */}
        <button type="button" onClick={() => setCollapsed((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 rounded-control text-start focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20">
          <span className="inline-flex items-center gap-2">
            <Link2 aria-hidden="true" className="size-4 text-action" />
            <span className="text-section font-semibold text-ink">{t.title}</span>
          </span>
          <span className="inline-flex items-center gap-2 text-muted flex-wrap justify-end">
            <Badge variant={chipTones[chip.tone]}>{chip.label}</Badge>
            {rollbackAvailable && <Badge variant="neutral">{t.rollbackAvailable}</Badge>}
            <ChevronDown aria-hidden="true" className={`size-4 transition-transform duration-150 ease-snappy ${open ? 'rotate-180' : ''}`} />
          </span>
        </button>

        {open && (
          <div className="mt-3">
            <p className="mb-4 max-w-prose text-copy text-muted">{t.subtitle}</p>

            {/* Non-draft guard — warning only, no controls, no calls. */}
            {!isDraft ? (
              <Notice tone="warn">{t.draftOnly}</Notice>
            ) : (
              <>
                {error && <Notice tone="bad" className="mb-3">{error}</Notice>}
                {notice && <Notice tone="info" className="mb-3">{notice}</Notice>}

                {/* Manual actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant={canApply ? 'secondary' : 'primary'} onClick={runPreview} loading={loadingPreview} disabled={loadingPreview || applying || rollingBack}>
                    {loadingPreview ? t.previewing : t.runPreview}
                  </Button>
                  {canApply && (
                    <Button size="sm" onClick={apply} loading={applying} disabled={applying}>
                      {applying ? t.applying : t.apply}
                    </Button>
                  )}
                  {rollbackAvailable && (
                    <Button size="sm" variant="ghost" onClick={rollback} loading={rollingBack} disabled={rollingBack} className="text-bad">
                      {rollingBack ? t.rollingBack : t.rollback}
                    </Button>
                  )}
                </div>

                {/* Session-only rollback explanation (shown once rollback is available). */}
                {rollbackAvailable && (
                  <p className="mt-2 max-w-prose text-caption text-muted">{t.rollbackSessionOnly}</p>
                )}

                {/* Content-edited-since-preview invalidation */}
                {contentChanged && (
                  <Notice tone="warn" className="mt-3">{t.contentChangedRepreview}</Notice>
                )}

                {/* Apply result */}
                {applyOutcome && (
                  <Notice tone="ok" className="mt-3">
                    {/* Phase 3J — the definitive success line: inserted + already-
                        existing links both count as embedded, out of all approved. */}
                    {typeof applyOutcome.approvedTotal === 'number' && applyOutcome.approvedTotal > 0 && (
                      <p className="font-semibold">
                        {t.embeddedLine
                          .replace('{x}', String(applyOutcome.applied + (applyOutcome.alreadyLinked ?? 0)))
                          .replace('{y}', String(applyOutcome.approvedTotal))}
                      </p>
                    )}
                    <p className="text-caption tabular-nums">
                      <span className="font-medium">{t.appliedTitle}</span>
                      {' · '}{t.appliedCount}: {applyOutcome.applied} · {t.skippedCount}: {applyOutcome.skipped}
                      {applyOutcome.snapshotId && <span> · {t.snapshotLabel}: {applyOutcome.snapshotId.slice(0, 8)}</span>}
                      {rollbackAvailable && <span className="font-medium"> · {t.rollbackAvailable}</span>}
                    </p>
                  </Notice>
                )}

                {/* Preview result */}
                {previewResult && previewResult.reason === 'no_plan_batch' && (
                  <div className="mt-3 text-copy text-muted">
                    <p>{t.noPlan}</p>
                    <Link href={`/content?projectId=${projectId}`} className="rounded-control text-caption font-medium text-action hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20">{t.noPlanHint}</Link>
                  </div>
                )}
                {previewResult && previewResult.reason === 'no_approved_links' && (
                  previewResult.plannedLinks > 0 ? (
                    <Notice tone="info" className="mt-3">
                      <span className="flex flex-wrap items-center gap-3">
                        <span className="min-w-0 flex-1">{t.plannedAvailable.replace('{n}', String(previewResult.plannedLinks))}</span>
                        <Button size="sm" onClick={approvePlanned} loading={approvingPlanned} disabled={approvingPlanned || loadingPreview}>
                          {approvingPlanned ? t.approvingPlanned : t.approvePlanned}
                        </Button>
                      </span>
                    </Notice>
                  ) : (
                    <p className="mt-3 text-copy text-muted">{t.noApproved}</p>
                  )
                )}

                {previewResult && !previewResult.reason && (
                  <div className="mt-4">
                    <div className="mb-2 text-overline font-semibold uppercase tracking-wide text-muted">{t.previewTitle}</div>
                    {/* Phase 3J.1 — a PREVIEW is not a final count: separate the
                        three states so "ready to embed" isn't mistaken for a skip.
                        already-existing (success) · ready to embed · skipped. */}
                    {previewResult.approvedLinks > 0 && (() => {
                      const already = previewResult.items.filter((it) => (it.reason || '').startsWith('target_already_linked')).length
                      const ready = previewResult.wouldInsert
                      const skipped = Math.max(0, previewResult.approvedLinks - already - ready)
                      return (
                        <p className="mb-1 text-copy font-semibold text-ink tabular-nums">
                          {t.previewStatusLine
                            .replace('{a}', String(already))
                            .replace('{r}', String(ready))
                            .replace('{s}', String(skipped))}
                        </p>
                      )
                    })()}
                    <p className="mb-3 text-caption text-muted tabular-nums">
                      {t.summaryApproved}: {previewResult.approvedLinks} · {t.summaryWouldInsert}: {previewResult.wouldInsert} · {t.summaryWouldSkip}: {previewResult.wouldSkip} · {t.contentUnchanged}
                    </p>
                    {staleWarn && <Notice tone="warn" className="mb-3">{staleWarn}</Notice>}
                    <div className="space-y-2">
                      {previewResult.items.map((it) => {
                        const alreadyLinked = (it.reason || '').startsWith('target_already_linked')
                        return (
                        <div key={it.linkId} className="rounded-inset border border-line px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-copy font-medium text-ink break-words">{it.anchorText || '—'}</span>
                            <Badge variant={it.status === 'would_insert' || alreadyLinked ? 'success' : 'neutral'}>
                              {it.status === 'would_insert' ? t.statusWouldInsert : t.statusSkipped}
                            </Badge>
                            <span className="text-caption text-muted">{reasonLabel(it.reason)}</span>
                          </div>
                          <a href={it.targetUrl} target="_blank" rel="noopener noreferrer" dir="ltr" title={it.targetUrl} className="mt-1 inline-flex max-w-64 items-center gap-1 text-caption text-muted hover:text-action hover:underline"><span className="truncate">{it.targetUrl}</span><ExternalLink aria-hidden="true" className="size-3.5 shrink-0" /></a>
                          {it.sentencePreview && (
                            <p className="mt-1 text-caption text-muted"><span className="text-muted">{t.sentenceLabel}:</span> “{it.sentencePreview}”</p>
                          )}
                          {it.checks && Object.keys(it.checks).length > 0 && (
                            <details className="group mt-2">
                              <summary className="inline-flex cursor-pointer select-none list-none items-center gap-1 rounded-control text-caption text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 [&::-webkit-details-marker]:hidden">
                                {t.techDetails}
                                <ChevronDown aria-hidden="true" className="size-4 transition-transform duration-150 ease-snappy group-open:rotate-180" />
                              </summary>
                              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-caption text-muted">
                                {Object.entries(it.checks).map(([k, v]) => (
                                  <div key={k} className="flex items-center gap-1">
                                    {v
                                      ? <Check aria-hidden="true" className="size-3.5 shrink-0 text-ok" />
                                      : <Minus aria-hidden="true" className="size-3.5 shrink-0 text-muted" />}
                                    <span className="sr-only">{String(!!v)}</span>
                                    <span dir="ltr">{k}</span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                        )
                      })}
                    </div>

                    {/* Re-anchor recovery (Phase 3B.4) — approved links whose exact
                        anchor text is missing from the draft body. Links that place
                        normally are shown above unchanged. */}
                    {missingAnchorItems.length > 0 && (
                      <div className="mt-4 rounded-inset border border-line bg-sunk/60 p-4">
                        <Notice tone="warn">{t.reanchorExplain}</Notice>
                        <p className="mt-2 max-w-prose text-caption text-muted">{t.reanchorGuidance}</p>

                        {!reanchorLinks && (
                          <div className="mt-2">
                            <Button size="sm" variant="secondary" onClick={findReanchors} loading={reanchorLoading} disabled={reanchorLoading || applying || rollingBack}>
                              {reanchorLoading ? t.reanchorFinding : t.reanchorFind}
                            </Button>
                          </div>
                        )}

                        {reanchorLinks && (() => {
                          // Only offer the approve/select flow when at least one
                          // skipped link actually has a selectable in-draft
                          // alternative; otherwise there is nothing to submit.
                          const hasAnyAlternatives = reanchorLinks.some((l) => l.suggestions.length > 0)
                          return (
                          <div className="mt-2 space-y-2">
                            {hasAnyAlternatives
                              ? <p className="text-caption text-muted">{t.reanchorSelectHint}</p>
                              : <p className="text-caption text-body">{t.reanchorNoneAll}</p>}
                            {reanchorLinks.map((link) => (
                              <div key={link.linkId} className="rounded-inset border border-line bg-surface p-3">
                                <div className="flex flex-wrap items-center gap-2 text-caption text-muted">
                                  <span className="text-muted">{t.reanchorOriginalLabel}:</span>
                                  <span className="font-medium text-body break-words">{link.originalAnchor || '—'}</span>
                                  {link.originalAnchor && (
                                    <button type="button" onClick={() => copyAnchor(link.linkId, link.originalAnchor)} className="inline-flex h-7 items-center rounded-control border border-line px-2 text-caption text-muted transition-colors duration-150 ease-snappy hover:bg-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20">
                                      {copiedAnchor === link.linkId ? t.reanchorCopied : t.reanchorCopy}
                                    </button>
                                  )}
                                </div>
                                <a href={link.targetUrl} target="_blank" rel="noopener noreferrer" dir="ltr" title={link.targetUrl} className="mt-1 block max-w-64 truncate text-caption text-muted hover:text-action hover:underline">{link.targetTitle || link.targetUrl}</a>
                                {link.suggestions.length === 0 ? (
                                  <p className="mt-1 text-caption text-muted">{t.reanchorNone}</p>
                                ) : (
                                  <>
                                    <div className="mt-1.5 text-caption font-medium text-muted">{t.reanchorSuggestLabel}</div>
                                    <div role="radiogroup" aria-label={t.reanchorSuggestLabel} className="mt-1 space-y-1">
                                      {link.suggestions.map((s, i) => {
                                        const on = reanchorSel[link.linkId] === s.anchorText
                                        return (
                                        <button
                                          key={`${link.linkId}-${i}`}
                                          type="button"
                                          role="radio"
                                          aria-checked={on}
                                          onClick={() => chooseReanchor(link.linkId, s.anchorText)}
                                          disabled={reanchorApplying}
                                          className={`flex w-full items-start gap-2 rounded-control border px-3 py-2 text-start text-caption transition-colors duration-150 ease-snappy focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 disabled:cursor-not-allowed disabled:opacity-50 ${on ? 'border-action bg-action-soft' : 'border-line bg-sunk/60 hover:border-line-strong'}`}
                                        >
                                          {on
                                            ? <CircleDot aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-action" />
                                            : <Circle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" />}
                                          <span className="min-w-0 flex-1">
                                            <span className="font-medium text-ink break-words">{s.anchorText}</span>
                                            {s.sentence && <span className="mt-0.5 block text-caption text-muted">“{s.sentence}”</span>}
                                          </span>
                                        </button>
                                        )
                                      })}
                                    </div>
                                  </>
                                )}
                              </div>
                            ))}
                            <p className="max-w-prose text-caption text-muted">{t.reanchorFutureNote}</p>
                            {hasAnyAlternatives && (
                              <div>
                                <Button size="sm" onClick={applyReanchors} loading={reanchorApplying} disabled={reanchorApplying || Object.keys(reanchorSel).length === 0}>
                                  {reanchorApplying ? t.reanchorApproving : t.reanchorApprove}
                                </Button>
                              </div>
                            )}
                          </div>
                          )
                        })()}
                      </div>
                    )}
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
