'use client'

/**
 * Topics & strategy — what is planned but not yet written.
 *
 * The pending topic list, its per-topic link plan, and the batch that turns topics
 * into articles. It used to be "Section 3" inside the one big content page, below
 * the article table and above the connection panels, so a merchant had to scroll
 * past everything else to reach it.
 *
 * Below the topics, the recommendations Search Console adds to the strategy. They
 * used to be a Search Console screen of their own; they are always here now, and
 * before Search Console is set up they say what they will show (with Search Console
 * switched off on the server they are not shown at all).
 */

import { useEffect, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import TopicsList from '@/components/content/TopicsList'
import NewTopicsLinkPlanPanel from '@/components/content/NewTopicsLinkPlanPanel'
import InternalLinkIndexStatus from '@/components/content/InternalLinkIndexStatus'
import GscRecommendations from '@/components/content/GscRecommendations'
import { ChevronDown, ListTodo, Plus } from 'lucide-react'
import Notice from '@/components/ui/Notice'
import SectionHeading from '@/components/ui/SectionHeading'
import EmptyState from '@/components/ui/EmptyState'
import { useContentWorkspace } from './ContentWorkspaceProvider'
import { BATCH_LIMIT } from './types'

export default function TopicsScreen() {
  const {
    t, language, projectId, toast, selectedProject, load, loadTopics,
    selectableTopics, articleByTopic, topicsLoading,
    planStatus, setPlanStatus, highlightTopicIds,
    newTopics, setNewTopics, newTopicsUnchecked, newTopicsSelected,
    reviewLinksHint, setReviewLinksHint,
    ensurePoolAndEnqueue, handleSaveAndQueue, handleDrawerPlanSaved, handleReturnToQueue,
    handleCreateTopic, goToQueue, setEditingTopic, setBriefOpen,
  } = useContentWorkspace()

  // ── Batch article creation (client-side, sequential) ──
  type BatchEntry = { status: 'queued' | 'generating' | 'success' | 'failed'; error?: string }
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchState, setBatchState] = useState<Record<string, BatchEntry>>({})
  const [batchRunning, setBatchRunning] = useState(false)
  const cancelRef = useRef(false)
  // Synchronous lock — set BEFORE any await so rapid double-clicks can't start a
  // second loop while React's batchRunning state is still updating.
  const batchRunningRef = useRef(false)

  const allSelectableSelected = selectableTopics.length > 0 && selectableTopics.every((tp) => selected.has(tp.id))

  // Clear selection/batch state when the project changes.
  useEffect(() => {
    setSelected(new Set()); setBatchState({}); setBatchRunning(false); cancelRef.current = false
  }, [projectId])

  function toggleSelect(id: string) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function toggleSelectAll() {
    setSelected(() => (allSelectableSelected ? new Set() : new Set(selectableTopics.map((tp) => tp.id))))
  }
  function clearSelection() { setSelected(new Set()) }

  // Readable Hebrew error from the generate endpoint (no raw JSON).
  function genErrorText(d: { reason?: unknown; audit?: { blockers?: unknown } }): string {
    const errs = t.genErrors as Record<string, string>
    const reason = typeof d.reason === 'string' ? d.reason : 'unknown'
    const blockers = Array.isArray(d.audit?.blockers) ? (d.audit!.blockers as string[]) : []
    if (blockers.length) {
      const codes = t.editor.auditCodes as Record<string, string>
      return `${errs.qualityIntro} ${blockers.map((b) => codes[b] || b).join(', ')}`
    }
    return errs[reason] || errs.unknown
  }

  // One generation request — reuses the EXISTING single endpoint. A generous
  // client timeout only guards a truly stuck request; on timeout the batch STOPS
  // (a client abort can't stop the server, so we never start the next topic).
  async function runOne(topicId: string): Promise<{ ok: boolean; error?: string; timedOut?: boolean }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 180_000)
    try {
      const res = await fetch('/api/content/articles/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId }), signal: controller.signal,
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.articleId) return { ok: true }
      return { ok: false, error: genErrorText(d) }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return { ok: false, error: t.batch.timeout, timedOut: true }
      return { ok: false, error: (t.genErrors as Record<string, string>).unknown }
    } finally {
      clearTimeout(timer)
    }
  }

  async function runBatch() {
    // Synchronous lock FIRST — before any state update or await.
    if (batchRunningRef.current || batchRunning) return
    const ids = Array.from(selected).filter((id) => !articleByTopic[id])
    if (ids.length === 0) return
    if (ids.length > BATCH_LIMIT) { toast.error(t.batch.tooMany); return }
    batchRunningRef.current = true

    cancelRef.current = false
    setBatchRunning(true)
    setBatchState((s) => { const next = { ...s }; ids.forEach((id) => { next[id] = { status: 'queued' } }); return next })

    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onUnload)

    let ok = 0, fail = 0
    let stoppedByTimeout = false
    for (const id of ids) {
      if (cancelRef.current) break
      if (articleByTopic[id]) continue // got an article meanwhile → skip safely
      setBatchState((s) => ({ ...s, [id]: { status: 'generating' } }))
      const r = await runOne(id)
      if (r.ok) { ok++; setBatchState((s) => ({ ...s, [id]: { status: 'success' } })) }
      else {
        fail++
        setBatchState((s) => ({ ...s, [id]: { status: 'failed', error: r.error } }))
        // A timeout means the server MAY still be generating — never start N+1.
        if (r.timedOut) { stoppedByTimeout = true; break }
      }
    }

    window.removeEventListener('beforeunload', onUnload)
    const wasCancelled = cancelRef.current
    batchRunningRef.current = false
    setBatchRunning(false)
    setSelected(new Set())
    await load(); await loadTopics() // new articles surface up top; done topics de-select
    if (stoppedByTimeout) toast.error(t.batch.stoppedTimeout)
    else if (wasCancelled) toast.success(t.batch.cancelled)
    else toast.success(t.batch.summary.replace('{ok}', String(ok)).replace('{fail}', String(fail)))
  }

  function cancelBatch() { cancelRef.current = true }

  async function retryTopic(id: string) {
    // Never overlap a batch or another retry.
    if (batchRunningRef.current || batchRunning) return
    batchRunningRef.current = true
    setBatchRunning(true) // lock the topics UI (checkboxes / single create) too
    setBatchState((s) => ({ ...s, [id]: { status: 'generating' } }))
    const r = await runOne(id)
    setBatchState((s) => ({ ...s, [id]: r.ok ? { status: 'success' } : { status: 'failed', error: r.error } }))
    batchRunningRef.current = false
    setBatchRunning(false)
    await load(); await loadTopics()
    if (r.ok) toast.success(t.batch.retrySuccess)
    else toast.error(r.error || t.rowWp.errGeneric)
  }

  return (
    <div className="mt-8 scroll-mt-4 space-y-4 border-t border-line pt-8">
      <SectionHeading title={t.topicsHeading} description={t.topicsSubtitle} className="mb-0" />

      {/* "Review links" helper when several topics were just approved. */}
      {reviewLinksHint && (
        <Notice tone="info" onDismiss={() => setReviewLinksHint(false)}>{t.reviewRowsHint}</Notice>
      )}
      {/* Workflow help — collapsed by default so it doesn't add standing
          vertical weight. Wraps ONLY the help text. */}
      <details className="group">
        <summary className="inline-flex cursor-pointer select-none list-none items-center gap-1.5 rounded-control text-copy font-semibold text-action hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 [&::-webkit-details-marker]:hidden">
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform duration-150 group-open:rotate-180" />
          {t.topicsHelpTitle}
        </summary>
        <div className="mt-2 max-w-prose space-y-2 text-copy text-muted">
          <p>{t.topicsHelpText}</p>
          <p>{t.queueExplain}</p>
        </div>
      </details>

      {/* Internal-link index status (Phase 2E.1) — flag-gated, read-only +
          manual refresh. It used to sit inside the connection card at the
          bottom of the page; it reports on the index the link plans on THIS
          screen are built from, so this is where it belongs. */}
      {process.env.NEXT_PUBLIC_ENABLE_INTERNAL_LINK_PLANNING === 'true' && (
        <div>
          <InternalLinkIndexStatus projectId={projectId} language={language} />
        </div>
      )}

      {/* Batch action bar — only once something is selected (or a batch runs).
          Selecting all is the table's header checkbox. */}
      {selectableTopics.length > 0 && (selected.size > 0 || batchRunning) && (
        <div data-bulk-bar="" className="sticky top-16 z-20 flex flex-wrap items-center gap-3 rounded-inset bg-contrast px-4 py-2.5 text-contrast-ink shadow-pop motion-safe:animate-pop-in">
          <span className="text-copy font-semibold tabular-nums">{t.batch.selected.replace('{n}', String(selected.size))}</span>
          <Button size="sm" onClick={runBatch} loading={batchRunning} disabled={batchRunning || selected.size === 0 || selected.size > BATCH_LIMIT}>
            {batchRunning ? t.batch.running : t.batch.createSelected.replace('{n}', String(selected.size))}
          </Button>
          {batchRunning ? (
            <Button size="sm" variant="ghost" onClick={cancelBatch} className="text-contrast-ink hover:bg-white/10 hover:text-contrast-ink">{t.batch.cancel}</Button>
          ) : (
            selected.size > 0 && <Button size="sm" variant="ghost" onClick={clearSelection} className="text-contrast-ink hover:bg-white/10 hover:text-contrast-ink">{t.batch.clear}</Button>
          )}
          {selected.size > BATCH_LIMIT && <span className="text-caption text-contrast-ink/80">{t.batch.tooMany}</span>}
        </div>
      )}

      {/* Phase 2F.1 — internal-link suggestions for just-created topics.
          Flag-gated; mounts only after topic creation (manual brief OR
          approved automatic ideas), independent of the list's empty state. */}
      {process.env.NEXT_PUBLIC_ENABLE_INTERNAL_LINK_PLANNING === 'true' && projectId && newTopics && newTopics.length > 0 && (
        <NewTopicsLinkPlanPanel
          key={newTopics.map((tp) => tp.id).join(',')}
          projectId={projectId}
          language={language}
          topics={newTopics}
          initialUnchecked={newTopicsUnchecked}
          initialSelected={newTopicsSelected}
          onClose={() => setNewTopics(null)}
          onEnqueue={ensurePoolAndEnqueue}
          onGoToQueue={goToQueue}
          onSaved={(summaries) => setPlanStatus((prev) => {
            const next = { ...prev }
            for (const s of summaries) next[s.topicId] = s.summary
            return next
          })}
        />
      )}
      {selectableTopics.length === 0 ? (
        // Flat inside the strategy's "advanced" card; the page's call to action is above.
        <EmptyState
          icon={<ListTodo />}
          title={t.topicsEmptyTitle}
          action={<Button variant="secondary" onClick={handleCreateTopic}><Plus aria-hidden="true" className="size-4" /> {t.newTopicButton}</Button>}
          className="border-y border-line"
        />
      ) : (
        <>
          <TopicsList
            topics={selectableTopics}
            projectId={projectId}
            projectName={selectedProject?.name ?? '—'}
            articleByTopic={articleByTopic}
            onEdit={(topic) => { setEditingTopic(topic); setBriefOpen(true) }}
            onChanged={loadTopics}
            onToast={(kind, text) => (kind === 'success' ? toast.success(text) : toast.error(text))}
            selectedIds={selected}
            onToggleSelect={toggleSelect}
            allSelected={allSelectableSelected}
            onToggleAll={toggleSelectAll}
            batchState={batchState}
            batchRunning={batchRunning}
            onRetry={retryTopic}
            planStatus={planStatus}
            planStatusLoading={topicsLoading}
            onPlanStatusChange={(id, summary) => setPlanStatus((prev) => ({ ...prev, [id]: summary }))}
            highlightIds={highlightTopicIds}
            onReturnToQueue={handleReturnToQueue}
            onPlanSaved={handleDrawerPlanSaved}
            onSaveAndQueue={handleSaveAndQueue}
          />
        </>
      )}

      {/* Keyed by the project: the workspace stays mounted when the top bar switches
          projects, and a switch must not show, or later receive, the previous
          project's recommendations. The spacing and separator are the section's own,
          so with Search Console switched off on the server nothing is left of it. */}
      <GscRecommendations
        projectId={projectId}
        key={projectId}
        className="mt-8 border-t border-line pt-6"
        onToast={(kind, text) => (kind === 'success' ? toast.success(text) : toast.error(text))}
      />
    </div>
  )
}
