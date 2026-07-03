'use client'

/**
 * TopicsList — article briefs/topics table for the Content Hub (Phase 2A).
 * Approve / Reject are status transitions (PATCH); Delete is guarded by an
 * explicit confirm. "Create article" is a disabled placeholder (later phase).
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { Table, TableHead, TableBody, TableRow, Th, Td, EmptyRow } from '@/components/ui/Table'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatDate } from '@/lib/utils'
import type { ArticleTopic } from '@/lib/supabase/types'

const STATUS_TONE: Record<string, 'neutral' | 'success' | 'danger' | 'info'> = {
  suggested: 'neutral',
  approved: 'success',
  rejected: 'danger',
  used: 'info',
}

export default function TopicsList({
  topics,
  projectName,
  articleByTopic = {},
  onEdit,
  onChanged,
}: {
  topics: ArticleTopic[]
  projectName: string
  articleByTopic?: Record<string, { id: string; status: string }>
  onEdit: (topic: ArticleTopic) => void
  onChanged: () => void
}) {
  const { language } = useDashboardLanguage()
  const c = getDashboardDictionary(language).contentHub
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [creatingId, setCreatingId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
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
      if (res.ok) onChanged()
    } finally {
      setBusyId(null)
    }
  }

  async function remove(id: string) {
    if (!window.confirm(c.topicActions.confirmDelete)) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/content/topics/${id}`, { method: 'DELETE' })
      if (res.ok) onChanged()
    } finally {
      setBusyId(null)
    }
  }

  const statusLabel = (s: string) => (c.topicStatus as Record<string, string>)[s] ?? s

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
            <EmptyRow colSpan={8} message={c.topicsTable.empty} />
          ) : (
            topics.map((topic) => {
              const anchorCount = Array.isArray(topic.anchors_json) ? topic.anchors_json.length : 0
              const busy = busyId === topic.id
              return (
                <TableRow key={topic.id}>
                  <Td><span className="text-sm text-slate-600 dark:text-slate-300">{projectName}</span></Td>
                  <Td><span className="font-medium">{topic.topic}</span></Td>
                  <Td><span className="text-sm text-slate-600 dark:text-slate-300">{topic.primary_keyword || '—'}</span></Td>
                  <Td><span className="text-sm text-slate-600 dark:text-slate-300">{topic.search_intent || '—'}</span></Td>
                  <Td><Badge variant={STATUS_TONE[topic.status] ?? 'neutral'}>{statusLabel(topic.status)}</Badge></Td>
                  <Td><span className="text-sm tabular-nums">{anchorCount}</span></Td>
                  <Td><span className="text-xs text-slate-500">{formatDate(topic.created_at)}</span></Td>
                  <Td>
                    <div className="flex items-center gap-1 justify-end">
                      {/* Primary action: create OR edit the article. */}
                      {articleByTopic[topic.id] ? (
                        <span className="inline-flex items-center gap-2">
                          <Link href={`/content/articles/${articleByTopic[topic.id].id}`}>
                            <Button size="sm" variant="outline">{c.editArticle}</Button>
                          </Link>
                          <Badge variant={articleByTopic[topic.id].status === 'ready' ? 'success' : 'neutral'}>
                            {(c.status as Record<string, string>)[articleByTopic[topic.id].status] ?? articleByTopic[topic.id].status}
                          </Badge>
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => createArticle(topic.id)}
                          loading={creatingId === topic.id}
                          disabled={busy || creatingId === topic.id}
                        >
                          {creatingId === topic.id ? c.creatingArticle : c.createArticle}
                        </Button>
                      )}

                      {/* Secondary actions tucked into a compact "More" menu. */}
                      <div className="relative">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setOpenMenuId(openMenuId === topic.id ? null : topic.id)}
                          disabled={busy}
                          aria-label={c.topicActions.more}
                          title={c.topicActions.more}
                        >
                          ⋯
                        </Button>
                        {openMenuId === topic.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                            <div className="absolute z-20 mt-1 end-0 min-w-[9rem] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1">
                              <button type="button" className="block w-full text-start px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => { setOpenMenuId(null); onEdit(topic) }}>
                                {c.topicActions.edit}
                              </button>
                              {topic.status !== 'approved' && (
                                <button type="button" className="block w-full text-start px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => { setOpenMenuId(null); setStatus(topic.id, 'approved') }}>
                                  {c.topicActions.approve}
                                </button>
                              )}
                              {topic.status !== 'rejected' && (
                                <button type="button" className="block w-full text-start px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => { setOpenMenuId(null); setStatus(topic.id, 'rejected') }}>
                                  {c.topicActions.reject}
                                </button>
                              )}
                              <button type="button" className="block w-full text-start px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => { setOpenMenuId(null); remove(topic.id) }}>
                                {c.topicActions.delete}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </Td>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}
