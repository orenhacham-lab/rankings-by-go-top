'use client'

/**
 * TopicsList — article briefs/topics table for the Content Hub (Phase 2A).
 * Approve / Reject are status transitions (PATCH); Delete is guarded by an
 * explicit confirm. "Create article" is a disabled placeholder (later phase).
 */

import { useState, useEffect, useCallback, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { Table, TableHead, TableBody, TableRow, Th, Td, EmptyRow } from '@/components/ui/Table'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatDate } from '@/lib/utils'
import TopicPlanBadge, { type TopicPlanSummary } from '@/components/content/TopicPlanBadge'
import TopicPlanDrawer from '@/components/content/TopicPlanDrawer'
import type { ArticleTopic } from '@/lib/supabase/types'


export default function TopicsList({
  topics,
  projectId,
  projectName,
  articleByTopic = {},
  onEdit,
  onChanged,
  onToast,
  selectedIds,
  onToggleSelect,
  batchState = {},
  batchRunning = false,
  onRetry,
  planStatus: planStatusExternal,
  onPlanStatusChange,
  highlightIds = [],
  onReturnToQueue,
  onPlanSaved,
  onSaveAndQueue,
}: {
  topics: ArticleTopic[]
  projectId?: string
  projectName: string
  articleByTopic?: Record<string, { id: string; status: string }>
  onEdit: (topic: ArticleTopic) => void
  onChanged: () => void
  onToast?: (kind: 'success' | 'error', text: string) => void
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  batchState?: Record<string, { status: 'queued' | 'generating' | 'success' | 'failed'; error?: string }>
  batchRunning?: boolean
  onRetry?: (id: string) => void
  // Phase 2F.1: optional CONTROLLED plan-status map (so the "new topics" panel
  // can seed row badges). Falls back to internal state when not provided.
  planStatus?: Record<string, TopicPlanSummary>
  onPlanStatusChange?: (id: string, summary: TopicPlanSummary) => void
  // Phase 3F.3.3 — topic ids to highlight briefly (just added to the queue).
  highlightIds?: string[]
  // Phase 3F.3.3e — drawer completion callbacks (guide back to the queue CTA).
  onReturnToQueue?: () => void
  onPlanSaved?: () => void
  // Phase 3F.3.6 (Part G) — save the plan AND enqueue the topic from the drawer.
  onSaveAndQueue?: (topicId: string) => Promise<boolean>
}) {
  const { language } = useDashboardLanguage()
  const c = getDashboardDictionary(language).contentHub
  const isHebrew = language === 'he'
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  // Phase 2E.2: internal-link planning (flag-gated). Status is loaded lazily by
  // the drawer (never per-row), so rendering the list triggers zero plan fetches.
  const planningOn = process.env.NEXT_PUBLIC_ENABLE_INTERNAL_LINK_PLANNING === 'true' && !!projectId
  const [internalPlanStatus, setInternalPlanStatus] = useState<Record<string, TopicPlanSummary>>({})
  const planStatus = planStatusExternal ?? internalPlanStatus
  const [planTopic, setPlanTopic] = useState<{ id: string; topic: string; primary_keyword: string | null } | null>(null)
  // Stable identity: passing an inline arrow here made the drawer's load effect
  // re-run on every parent render, causing a /plan/saved refetch loop. Uses the
  // controlled setter when provided, else the internal map.
  const handlePlanStatus = useCallback((id: string, summary: TopicPlanSummary) => {
    if (onPlanStatusChange) onPlanStatusChange(id, summary)
    else setInternalPlanStatus((prev) => ({ ...prev, [id]: summary }))
  }, [onPlanStatusChange])
  const [creatingId, setCreatingId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false) // show first 3 rows by default
  // The "More" menu renders in a portal at fixed coords so it's never clipped by
  // the table's overflow-x container (even on the last row).
  const [menu, setMenu] = useState<{ topicId: string; top: number; left: number } | null>(null)
  const [genError, setGenError] = useState<{ topicId: string; text: string } | null>(null)

  // Reposition-safe: close the menu on scroll/resize (coords would go stale).
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [menu])

  const MENU_WIDTH = 180
  function openMenu(e: MouseEvent<HTMLButtonElement>, topicId: string) {
    const r = e.currentTarget.getBoundingClientRect()
    const left = isHebrew
      ? Math.max(8, r.right - MENU_WIDTH)
      : Math.min(r.left, window.innerWidth - MENU_WIDTH - 8)
    setMenu({ topicId, top: r.bottom + 4, left })
  }

  // Build a clear, human failure message from the safe audit debug (no alert).
  function genErrorMessage(data: { reason?: unknown; audit?: { blockers?: unknown } }): string {
    const errs = c.genErrors as Record<string, string>
    const reason = typeof data.reason === 'string' ? data.reason : 'unknown'
    const blockers = Array.isArray(data.audit?.blockers) ? (data.audit!.blockers as string[]) : []
    if (blockers.length) {
      const codes = c.editor.auditCodes as Record<string, string>
      const list = blockers.map((b) => codes[b] || b).join(', ')
      return `${errs.qualityIntro} ${list}`
    }
    return errs[reason] || errs.unknown
  }

  async function createArticle(topicId: string) {
    if (creatingId) return // guard against double-click / concurrent generation
    setGenError(null)
    setCreatingId(topicId)
    try {
      const res = await fetch('/api/content/articles/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.articleId) {
        router.push(`/content/articles/${data.articleId}`)
        return
      }
      // Failure: topic is NOT marked as used server-side, so the button stays
      // "Create article". Show a clear inline reason instead of a browser alert.
      setGenError({ topicId, text: genErrorMessage(data) })
    } catch {
      setGenError({ topicId, text: (c.genErrors as Record<string, string>).unknown })
    } finally {
      setCreatingId(null)
    }
  }

  async function setStatus(id: string, status: 'approved' | 'rejected') {
    setBusyId(id)
    try {
      const res = await fetch(`/api/content/topics/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) { onChanged(); onToast?.('success', status === 'approved' ? c.toasts.topicApproved : c.toasts.topicRejected) }
      else onToast?.('error', (c.genErrors as Record<string, string>).unknown)
    } catch {
      onToast?.('error', (c.genErrors as Record<string, string>).unknown)
    } finally {
      setBusyId(null)
    }
  }

  async function remove(id: string) {
    if (!window.confirm(c.topicActions.confirmDelete)) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/content/topics/${id}`, { method: 'DELETE' })
      if (res.ok) { onChanged(); onToast?.('success', c.toasts.topicDeleted) }
      else onToast?.('error', (c.genErrors as Record<string, string>).unknown)
    } finally {
      setBusyId(null)
    }
  }

  // Create a NEW draft article for a topic that already has one. Never deletes
  // or overwrites the existing article — /generate always inserts a new row.
  async function regenerateArticle(topicId: string) {
    if (!window.confirm(c.topicActions.regenerateConfirm)) return
    await createArticle(topicId)
  }

  // Topic-FOCUSED state (never the article's status like "used"/"published").
  const topicState = (topic: ArticleTopic): 'has_article' | 'rejected' | 'approved' | 'waiting' => {
    if (articleByTopic[topic.id]) return 'has_article'
    if (topic.status === 'rejected') return 'rejected'
    if (topic.status === 'approved') return 'approved'
    return 'waiting'
  }
  const TOPIC_STATE_TONE: Record<string, 'neutral' | 'success' | 'danger' | 'info'> = {
    has_article: 'success', rejected: 'danger', approved: 'info', waiting: 'neutral',
  }

  // Collapse long lists to the first 3 rows (batch selection still applies to
  // the full set via "select all" in the parent — hidden rows remain selectable).
  const visibleTopics = expanded ? topics : topics.slice(0, 3)

  return (
    <div className="overflow-x-auto">
      {genError && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <span>{genError.text}</span>
          <button type="button" onClick={() => setGenError(null)} className="shrink-0 text-red-500 hover:text-red-700" aria-label="close">✕</button>
        </div>
      )}
      <Table>
        <TableHead>
          <tr>
            <Th> </Th>
            <Th>{c.topicsTable.project}</Th>
            <Th>{c.topicsTable.topic}</Th>
            <Th>{c.topicsTable.primaryKeyword}</Th>
            <Th>{c.topicsTable.searchIntent}</Th>
            <Th>{c.topicsTable.status}</Th>
            <Th>{c.topicsTable.anchors}</Th>
            <Th>{c.topicsTable.created}</Th>
            <Th>{c.topicsTable.actions}</Th>
          </tr>
        </TableHead>
        <TableBody>
          {topics.length === 0 ? (
            <EmptyRow colSpan={9} message={c.topicsTable.empty} />
          ) : (
            visibleTopics.map((topic) => {
              const anchorCount = Array.isArray(topic.anchors_json) ? topic.anchors_json.length : 0
              const busy = busyId === topic.id
              const tState = topicState(topic)
              const hasArticle = tState === 'has_article'
              const bs = batchState[topic.id]
              const selectable = !hasArticle
              const highlighted = highlightIds.includes(topic.id)
              return (
                <TableRow key={topic.id} className={highlighted ? 'bg-emerald-50 dark:bg-emerald-900/20 transition-colors duration-1000' : undefined}>
                  {/* Batch selection — only for topics without an article. */}
                  <Td>
                    {selectable && (
                      <input
                        type="checkbox"
                        checked={selectedIds?.has(topic.id) ?? false}
                        disabled={batchRunning}
                        onChange={() => onToggleSelect?.(topic.id)}
                        className="cursor-pointer disabled:cursor-not-allowed"
                        aria-label={c.topicsTable.topic}
                      />
                    )}
                  </Td>
                  <Td><span className="text-sm text-slate-600 dark:text-slate-300">{projectName}</span></Td>
                  {/* De-emphasize topics that already produced an article. */}
                  <Td><span className={hasArticle ? 'text-slate-500 dark:text-slate-400' : 'font-medium'}>{topic.topic}</span></Td>
                  <Td><span className="text-sm text-slate-600 dark:text-slate-300">{topic.primary_keyword || '—'}</span></Td>
                  <Td><span className="text-sm text-slate-600 dark:text-slate-300">{topic.search_intent || '—'}</span></Td>
                  <Td>
                    {bs && bs.status !== 'success' ? (
                      bs.status === 'generating' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          {c.batch.generating}
                        </span>
                      ) : bs.status === 'queued' ? (
                        <Badge variant="neutral">{c.batch.queued}</Badge>
                      ) : (
                        <span className="inline-flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-2">
                            <Badge variant="danger">{c.batch.failed}</Badge>
                            <button type="button" onClick={() => onRetry?.(topic.id)} disabled={batchRunning} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50">{c.batch.retry}</button>
                          </span>
                          {bs.error && <span className="text-[11px] text-red-600 dark:text-red-400 max-w-[16rem] truncate" title={bs.error}>{bs.error}</span>}
                        </span>
                      )
                    ) : (
                      <Badge variant={TOPIC_STATE_TONE[tState]}>{(c.topicState as Record<string, string>)[tState]}</Badge>
                    )}
                  </Td>
                  <Td><span className="text-sm tabular-nums">{anchorCount}</span></Td>
                  <Td><span className="text-xs text-slate-500">{formatDate(topic.created_at)}</span></Td>
                  <Td>
                    <div className="flex items-center gap-1 justify-end">
                      {/* Internal-link planning entry point (flag-gated). Opens the
                          drawer; status is loaded there, never per row. */}
                      {planningOn && (
                        <TopicPlanBadge summary={planStatus[topic.id]} onClick={() => setPlanTopic({ id: topic.id, topic: topic.topic, primary_keyword: topic.primary_keyword })} t={c.topicPlan} highlight={highlighted} />
                      )}
                      {/* Visible feedback while (re)generating — the primary button
                          may be "Edit article" during a regenerate. */}
                      {creatingId === topic.id && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          {c.creatingArticleWithImage}
                        </span>
                      )}
                      {/* Primary action: create OR edit the article. */}
                      {articleByTopic[topic.id] ? (
                        <Link href={`/content/articles/${articleByTopic[topic.id].id}`}>
                          <Button size="sm" variant="outline" className="h-7 whitespace-nowrap shadow-sm hover:translate-y-0">{c.openArticle}</Button>
                        </Link>
                      ) : (
                        // Flatten the primary button's lift/shadow so it aligns with the
                        // outline link-planning + open buttons as equal row actions.
                        <Button
                          size="sm"
                          className="h-7 whitespace-nowrap shadow-sm hover:translate-y-0 hover:shadow-md"
                          onClick={() => createArticle(topic.id)}
                          loading={creatingId === topic.id}
                          disabled={busy || creatingId === topic.id || batchRunning}
                        >
                          {creatingId === topic.id ? c.creatingArticleWithImage : c.createArticle}
                        </Button>
                      )}

                      {/* Secondary actions live in a compact "More" menu (portal). */}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => openMenu(e, topic.id)}
                        disabled={busy || batchRunning}
                        aria-label={c.topicActions.more}
                        title={c.topicActions.more}
                      >
                        ⋯
                      </Button>
                    </div>
                  </Td>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>

      {topics.length > 3 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center justify-center gap-1 rounded-full border border-indigo-200 dark:border-indigo-500/40 px-3.5 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
          >
            {expanded ? c.showLess : `${c.showMore} (${topics.length - 3})`}
          </button>
        </div>
      )}

      {menu && typeof document !== 'undefined' && (() => {
        const topic = topics.find((t) => t.id === menu.topicId)
        if (!topic) return null
        const hasArticle = !!articleByTopic[topic.id]
        const item = 'block w-full text-start px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800'
        return createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
            <div
              dir={isHebrew ? 'rtl' : 'ltr'}
              style={{ position: 'fixed', top: menu.top, left: menu.left, minWidth: MENU_WIDTH }}
              className="z-50 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1"
            >
              <button type="button" className={`${item} text-slate-700 dark:text-slate-200`} onClick={() => { setMenu(null); onEdit(topic) }}>{c.topicActions.edit}</button>
              {topic.status !== 'approved' && (
                <button type="button" className={`${item} text-slate-700 dark:text-slate-200`} onClick={() => { setMenu(null); setStatus(topic.id, 'approved') }}>{c.topicActions.approve}</button>
              )}
              {topic.status !== 'rejected' && (
                <button type="button" className={`${item} text-slate-700 dark:text-slate-200`} onClick={() => { setMenu(null); setStatus(topic.id, 'rejected') }}>{c.topicActions.reject}</button>
              )}
              {hasArticle && (
                <button type="button" className={`${item} text-indigo-600 dark:text-indigo-400`} onClick={() => { setMenu(null); regenerateArticle(topic.id) }}>{c.topicActions.regenerate}</button>
              )}
              <button type="button" className={`${item} text-red-600 dark:text-red-400`} onClick={() => { setMenu(null); remove(topic.id) }}>{c.topicActions.delete}</button>
            </div>
          </>,
          document.body,
        )
      })()}

      {/* Internal-link planning drawer (one at a time, flag-gated). */}
      {planningOn && projectId && (
        <TopicPlanDrawer
          open={!!planTopic}
          onClose={() => setPlanTopic(null)}
          projectId={projectId}
          topic={planTopic}
          language={language}
          onStatusChange={handlePlanStatus}
          onReturnToQueue={onReturnToQueue}
          onPlanSaved={onPlanSaved}
          onSaveAndQueue={onSaveAndQueue}
        />
      )}
    </div>
  )
}
