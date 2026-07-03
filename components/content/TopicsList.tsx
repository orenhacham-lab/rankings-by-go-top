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

  async function createArticle(topicId: string) {
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
      window.alert(c.createArticleFailed)
    } catch {
      window.alert(c.createArticleFailed)
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
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="ghost" onClick={() => onEdit(topic)} disabled={busy}>
                        {c.topicActions.edit}
                      </Button>
                      {topic.status !== 'approved' && (
                        <Button size="sm" variant="outline" onClick={() => setStatus(topic.id, 'approved')} disabled={busy}>
                          {c.topicActions.approve}
                        </Button>
                      )}
                      {topic.status !== 'rejected' && (
                        <Button size="sm" variant="outline" onClick={() => setStatus(topic.id, 'rejected')} disabled={busy}>
                          {c.topicActions.reject}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => remove(topic.id)}
                        disabled={busy}
                        className="text-red-600 dark:text-red-400"
                      >
                        {c.topicActions.delete}
                      </Button>
                      {articleByTopic[topic.id] ? (
                        <span className="inline-flex items-center gap-2">
                          <Link href={`/content/articles/${articleByTopic[topic.id].id}`} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                            {c.editArticle}
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
