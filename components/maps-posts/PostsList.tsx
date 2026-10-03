'use client'

import { useState } from 'react'
import { ExternalLink, ImageIcon, Newspaper } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import Notice from '@/components/ui/Notice'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatDate } from '@/lib/i18n/format-date'
import { gbpErrorText } from './error-text'
import { postBadgeKey, type GbpPostView, type PostBadgeKey } from './types'

const BADGE: Record<PostBadgeKey, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  live: 'success', review: 'info', scheduled: 'neutral', publishing: 'info', rejected: 'danger', failed: 'danger', cancelled: 'neutral',
}

/** Every post of the project with the one status that matters: is it on Google, under review, or why not. */
export default function PostsList({ projectId, posts, onChanged }: { projectId: string; posts: GbpPostView[]; onChanged: () => void }) {
  const { language, uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).mapsPosts
  const fmt = formatDate(language)
  const { confirm, dialog } = useConfirm()
  const [error, setError] = useState<string | null>(null)

  const cancel = async (p: GbpPostView) => {
    const ok = await confirm({ title: t.list.cancel, body: p.summary.slice(0, 140), confirmLabel: t.list.cancel, cancelLabel: t.connect.cancel, tone: 'danger' })
    if (!ok) return
    const res = await fetch(`/api/gbp/posts/${encodeURIComponent(p.id)}?projectId=${encodeURIComponent(projectId)}`, { method: 'DELETE' }).catch(() => null)
    if (!res || !res.ok) { setError(t.errors.unexpected); return }
    onChanged()
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="mb-4 text-section font-semibold text-ink">{t.list.title}</h2>
      {error && <Notice tone="bad" className="mb-4" onDismiss={() => setError(null)}>{error}</Notice>}
      {posts.length === 0 ? (
        <EmptyState icon={<Newspaper className="size-5" />} title={t.list.emptyTitle} body={t.list.emptyBody} />
      ) : (
        <ul className="divide-y divide-line">
          {posts.map((p) => {
            const key = postBadgeKey(p)
            const reason = key === 'rejected' ? t.errors.post_rejected : key === 'failed' ? gbpErrorText(t, p.errorCode) : null
            return (
              <li key={p.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={BADGE[key]} dot>{t.list.status[key]}</Badge>
                    <span className="text-caption text-muted">
                      {p.status === 'scheduled'
                        ? (p.errorCode ? t.list.retrying : t.list.scheduledFor(fmt.dateTime(p.scheduledAt)))
                        : t.list.publishedAt(fmt.dateTime(p.publishedAt ?? p.createdAt))}
                    </span>
                    {p.imageUrl && (
                      <span className="inline-flex items-center gap-1 text-caption text-muted">
                        <ImageIcon aria-hidden="true" className="size-3.5" />{t.list.withImage}
                      </span>
                    )}
                  </div>
                  <p className="line-clamp-2 max-w-prose text-copy text-body">{p.summary}</p>
                  {reason && <p className="text-caption text-bad">{reason}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {p.searchUrl && key === 'live' && (
                    <a href={p.searchUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1 rounded-control px-3 text-caption font-semibold text-action hover:bg-action-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20">
                      {t.list.view}<ExternalLink aria-hidden="true" className="size-3.5" />
                    </a>
                  )}
                  {p.status === 'scheduled' && (
                    <Button variant="ghost" size="sm" onClick={() => cancel(p)}>{t.list.cancel}</Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {dialog}
    </Card>
  )
}
