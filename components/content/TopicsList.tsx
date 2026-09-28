'use client'

/**
 * TopicsList — article briefs/topics table for the Content Hub (Phase 2A).
 * Approve / Reject are status transitions (PATCH); Delete is guarded by an
 * explicit confirm. "Create article" is a disabled placeholder (later phase).
 */

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { Table, TableHead, TableBody, TableRow, Th, Td, EmptyRow } from '@/components/ui/Table'
import Checkbox from '@/components/ui/Checkbox'
import Notice from '@/components/ui/Notice'
import RowMenu from '@/components/ui/RowMenu'
import { Check, ChevronDown, Loader2, Pencil, RefreshCw, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatDate } from '@/lib/utils'
import TopicPlanBadge, { type TopicPlanSummary } from '@/components/content/TopicPlanBadge'
import TopicPlanDrawer from '@/components/content/TopicPlanDrawer'
import type { ArticleTopic } from '@/lib/supabase/types'


export default function TopicsList({
  topics,
  projectId,
  articleByTopic = {},
  onEdit,
  onChanged,
  onToast,
  selectedIds,
  onToggleSelect,
  allSelected = false,
  onToggleAll,
  batchState = {},
  batchRunning = false,
  onRetry,
  planStatus: planStatusExternal,
  planStatusLoading = false,
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
  /** The header checkbox: every selectable topic is chosen / choose or clear them all. */
  allSelected?: boolean
  onToggleAll?: () => void
  batchState?: Record<string, { status: 'queued' | 'generating' | 'success' | 'failed'; error?: string }>
  batchRunning?: boolean
  onRetry?: (id: string) => void
  // Phase 2F.1: optional CONTROLLED plan-status map (so the "new topics" panel
  // can seed row badges). Falls back to internal state when not provided.
  planStatus?: Record<string, TopicPlanSummary>
  // True while the plan summaries are (re)hydrating — badges without a summary yet show a
  // neutral "checking" state instead of "add links".
  planStatusLoading?: boolean
  onPlanStatusChange?: (id: string, summary: TopicPlanSummary) => void
  // Phase 3F.3.3 — topic ids to highlight briefly (just added to the queue).
  highlightIds?: string[]
  // Phase 3F.3.3e — drawer completion callbacks (guide back to the queue CTA).
  onReturnToQueue?: () => void
  onPlanSaved?: () => void
  // Phase 3F.3.6 (Part G) — save the plan AND enqueue the topic from the drawer.
  /** `expectsLinks` is decided by the drawer and passed straight through. */
  onSaveAndQueue?: (topicId: string, expectsLinks: boolean) => Promise<boolean>
}) {
  const { language } = useDashboardLanguage()
  const c = getDashboardDictionary(language).contentHub
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
  const [genError, setGenError] = useState<{ topicId: string; text: string } | null>(null)

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
        <Notice tone="bad" className="mb-3" onDismiss={() => setGenError(null)}>
          {genError.text}
        </Notice>
      )}
      <Table>
        <TableHead>
          <tr>
            {/* The row's project is the one the top bar names, so it has no column (UX review P1-18). */}
            <Th className="w-10">
              {onToggleAll && topics.some((tp) => !articleByTopic[tp.id]) && (
                <Checkbox
                  checked={allSelected}
                  indeterminate={!allSelected && (selectedIds?.size ?? 0) > 0}
                  onChange={() => onToggleAll()}
                  disabled={batchRunning}
                  aria-label={c.batch.selectAll}
                />
              )}
            </Th>
            <Th>{c.topicsTable.topic}</Th>
            <Th>{c.topicsTable.primaryKeyword}</Th>
            <Th>{c.topicsTable.searchIntent}</Th>
            <Th>{c.topicsTable.status}</Th>
            <Th className="text-end">{c.topicsTable.anchors}</Th>
            <Th>{c.topicsTable.created}</Th>
            <Th className="text-end">{c.topicsTable.actions}</Th>
          </tr>
        </TableHead>
        <TableBody>
          {topics.length === 0 ? (
            <EmptyRow colSpan={8} message={c.topicsTable.empty} />
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
                <TableRow key={topic.id} className={cn(highlighted ? 'bg-action-soft' : selectedIds?.has(topic.id) && 'bg-action-soft hover:bg-action-soft')}>
                  {/* Batch selection — only for topics without an article. */}
                  <Td>
                    {selectable && (
                      <Checkbox
                        checked={selectedIds?.has(topic.id) ?? false}
                        disabled={batchRunning}
                        onChange={() => onToggleSelect?.(topic.id)}
                        aria-label={`${c.topicsTable.topic}: ${topic.topic}`}
                      />
                    )}
                  </Td>
                  {/* De-emphasize topics that already produced an article. */}
                  <Td className="min-w-48"><span className={hasArticle ? 'text-muted' : 'font-medium text-ink'}>{topic.topic}</span></Td>
                  <Td><span className="text-copy text-body">{topic.primary_keyword || '—'}</span></Td>
                  <Td><span className="text-copy text-body">{topic.search_intent ? ((c.brief.intents as Record<string, string>)[topic.search_intent] ?? topic.search_intent).split(' — ')[0] : '—'}</span></Td>
                  <Td>
                    {bs && bs.status !== 'success' ? (
                      bs.status === 'generating' ? (
                        <span className="inline-flex items-center gap-1.5 text-caption text-muted">
                          <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />
                          {c.batch.generating}
                        </span>
                      ) : bs.status === 'queued' ? (
                        <Badge variant="neutral">{c.batch.queued}</Badge>
                      ) : (
                        <span className="inline-flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-2">
                            <Badge variant="danger">{c.batch.failed}</Badge>
                            <Button size="sm" variant="ghost" onClick={() => onRetry?.(topic.id)} disabled={batchRunning} className="text-action"><RefreshCw className="size-4" aria-hidden="true" />{c.batch.retry}</Button>
                          </span>
                          {bs.error && <span className="max-w-64 truncate text-caption text-muted" title={bs.error}>{bs.error}</span>}
                        </span>
                      )
                    ) : (
                      <Badge variant={TOPIC_STATE_TONE[tState]}>{(c.topicState as Record<string, string>)[tState]}</Badge>
                    )}
                  </Td>
                  <Td className="text-end"><span className="text-copy tabular-nums">{anchorCount}</span></Td>
                  <Td><span className="whitespace-nowrap text-caption text-muted">{formatDate(topic.created_at)}</span></Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Internal-link planning entry point (flag-gated). Opens the
                          drawer; status is loaded there, never per row. */}
                      {planningOn && (
                        <TopicPlanBadge summary={planStatus[topic.id]} checking={planStatusLoading && !planStatus[topic.id]} onClick={() => setPlanTopic({ id: topic.id, topic: topic.topic, primary_keyword: topic.primary_keyword })} t={c.topicPlan} highlight={highlighted} />
                      )}
                      {/* Visible feedback while (re)generating — the primary button
                          may be "Edit article" during a regenerate. */}
                      {creatingId === topic.id && (
                        <span className="inline-flex items-center gap-1.5 text-caption text-muted">
                          <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />
                          {c.creatingArticleWithImage}
                        </span>
                      )}
                      {/* Primary action: create OR edit the article. */}
                      {articleByTopic[topic.id] ? (
                        <Link href={`/content/articles/${articleByTopic[topic.id].id}`}>
                          <Button size="sm" variant="ghost" className="whitespace-nowrap text-action">{c.openArticle}</Button>
                        </Link>
                      ) : (
                        // The row's one inline action; everything else is in the row menu.
                        <Button
                          size="sm"
                          variant="secondary"
                          className="whitespace-nowrap"
                          onClick={() => createArticle(topic.id)}
                          loading={creatingId === topic.id}
                          disabled={busy || creatingId === topic.id || batchRunning}
                        >
                          {creatingId === topic.id ? c.creatingArticleWithImage : c.createArticle}
                        </Button>
                      )}

                      {/* Secondary actions: the shared row menu (edit / approve / reject /
                          regenerate / delete — delete still asks first). */}
                      <RowMenu
                        label={`${c.topicActions.more}: ${topic.topic}`}
                        items={[
                          { key: 'edit', label: c.topicActions.edit, onSelect: () => onEdit(topic), disabled: busy || batchRunning, icon: <Pencil className="size-4" aria-hidden="true" /> },
                          ...(topic.status !== 'approved' ? [{ key: 'approve', label: c.topicActions.approve, onSelect: () => setStatus(topic.id, 'approved'), disabled: busy || batchRunning, icon: <Check className="size-4" aria-hidden="true" /> }] : []),
                          ...(topic.status !== 'rejected' ? [{ key: 'reject', label: c.topicActions.reject, onSelect: () => setStatus(topic.id, 'rejected'), disabled: busy || batchRunning, icon: <X className="size-4" aria-hidden="true" /> }] : []),
                          ...(hasArticle ? [{ key: 'regenerate', label: c.topicActions.regenerate, onSelect: () => regenerateArticle(topic.id), disabled: busy || batchRunning, icon: <RefreshCw className="size-4" aria-hidden="true" /> }] : []),
                          { key: 'delete', label: c.topicActions.delete, danger: true, onSelect: () => remove(topic.id), disabled: busy || batchRunning, icon: <Trash2 className="size-4" aria-hidden="true" /> },
                        ]}
                      />
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
            aria-expanded={expanded}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-pill border border-line bg-surface px-3.5 text-caption font-semibold text-action shadow-control transition-colors duration-150 hover:border-line-strong hover:bg-action-soft"
          >
            {expanded ? c.showLess : `${c.showMore} (${topics.length - 3})`}
            <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform duration-150', expanded && 'rotate-180')} />
          </button>
        </div>
      )}

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
