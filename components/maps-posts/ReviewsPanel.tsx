'use client'

import { useCallback, useEffect, useState } from 'react'
import { MessageSquare, RefreshCw, Star } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import Notice from '@/components/ui/Notice'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import { Skeleton } from '@/components/ui/Skeleton'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatDate } from '@/lib/i18n/format-date'
import { countReplyChars, validateReplyInput } from '@/lib/gbp/review-validate'
import { gbpErrorText, gbpFieldText } from './error-text'
import type { GbpReadyStatus, GbpReviewOrderKey, GbpReviewView, GbpReviewsBody } from './types'

type ReviewsFetch = { ok: true; body: GbpReviewsBody } | { ok: false; code: string | null }

/** The reviews as the server reports them. No state is touched here. */
async function fetchReviews(projectId: string, order: GbpReviewOrderKey): Promise<ReviewsFetch> {
  const res = await fetch(
    `/api/gbp/reviews?projectId=${encodeURIComponent(projectId)}&order=${encodeURIComponent(order)}`,
    { cache: 'no-store' },
  ).catch(() => null)
  const json = res ? await res.json().catch(() => null) : null
  if (!res || !res.ok || !json?.ok) return { ok: false, code: typeof json?.error === 'string' ? json.error : null }
  return { ok: true, body: json as GbpReviewsBody }
}

/** Five stars with the given ones filled. The number is also written out for a screen reader. */
function Stars({ stars, label }: { stars: number | null; label: string }) {
  if (stars === null) return <span className="text-caption text-muted">{label}</span>
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={label} role="img">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} aria-hidden="true" className={i <= stars ? 'size-4 fill-warn text-warn' : 'size-4 text-muted'} />
      ))}
    </span>
  )
}

/**
 * The reviews of the connected business, read live from Google, with the reply
 * box under each one. Nothing here is stored by us: closing the screen and
 * opening it again asks Google afresh.
 */
export default function ReviewsPanel({ projectId, status }: { projectId: string; status: GbpReadyStatus }) {
  const { language, uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).mapsPosts
  const fmt = formatDate(language)
  const { confirm, dialog } = useConfirm()

  const connected = status.connection?.status === 'connected'
  const located = Boolean(status.location)
  const ready = connected && located

  const [body, setBody] = useState<GbpReviewsBody | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [order, setOrder] = useState<GbpReviewOrderKey>('updateTime desc')
  const [flash, setFlash] = useState<string | null>(null)

  /**
   * The owner has now seen the list, so nothing stays marked "new" for them.
   * Best effort: a failure here only means a badge shows once more.
   */
  const markSeen = useCallback((reviews: GbpReviewView[]) => {
    const newest = reviews
      .map((r) => r.updateTime)
      .filter((v): v is string => Boolean(v))
      .sort()
      .pop()
    if (!newest) return
    void fetch('/api/gbp/reviews/seen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, newestUpdateTime: newest }),
    }).catch(() => null)
  }, [projectId])

  const apply = useCallback((result: ReviewsFetch) => {
    setLoading(false)
    if (!result.ok) { setError(result.code ? gbpErrorText(t, result.code) : t.reviews.loadFailed); return }
    setError(null)
    setBody(result.body)
    markSeen(result.body.reviews)
  }, [t, markSeen])

  // The read is awaited first, so no state is set synchronously inside the effect.
  useEffect(() => {
    if (!ready) return
    let live = true
    void (async () => {
      const result = await fetchReviews(projectId, order)
      if (live) apply(result)
    })()
    return () => { live = false }
  }, [ready, projectId, order, apply])

  const refresh = async () => {
    setLoading(true)
    apply(await fetchReviews(projectId, order))
  }

  if (!connected) return <Card className="p-5 sm:p-6"><p className="text-copy text-body">{t.reviews.lockedConnect}</p></Card>
  if (!located) return <Card className="p-5 sm:p-6"><p className="text-copy text-body">{t.reviews.lockedLocation}</p></Card>

  const summary = body?.summary

  return (
    <div data-gbp-reviews="">
      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-section font-semibold text-ink">{t.reviews.title}</h2>
            <p className="mt-1 max-w-prose text-copy text-muted">{t.reviews.subtitle}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw aria-hidden="true" className="size-4" />{t.reviews.refresh}
          </Button>
        </div>

        {error && <Notice tone="bad" className="mb-4" onDismiss={() => setError(null)}>{error}</Notice>}
        {flash && <Notice tone="ok" className="mb-4" onDismiss={() => setFlash(null)}>{flash}</Notice>}

        {summary && (
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            {summary.average !== null && (
              <span className="inline-flex items-center gap-2 text-copy text-body">
                <Stars stars={Math.round(summary.average)} label={t.reviews.starsLabel(Math.round(summary.average))} />
                {t.reviews.summaryAverage(summary.average.toFixed(1))}
              </span>
            )}
            {summary.total !== null && <span className="text-caption text-muted">{t.reviews.summaryTotal(summary.total)}</span>}
            {summary.unanswered > 0
              ? <Badge variant="warning" dot>{t.reviews.summaryUnanswered(summary.unanswered)}</Badge>
              : <Badge variant="success" dot>{t.reviews.allAnswered}</Badge>}
          </div>
        )}

        <div className="mb-4 max-w-xs">
          <Select
            label={t.reviews.orderLabel}
            value={order}
            onChange={(e) => setOrder(e.target.value as GbpReviewOrderKey)}
            disabled={loading}
            options={(['updateTime desc', 'rating', 'rating desc'] as const).map((o) => ({ value: o, label: t.reviews.orders[o] }))}
          />
        </div>

        {loading && !body && <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>}

        {body && body.reviews.length === 0 && (
          <EmptyState icon={<MessageSquare className="size-5" />} title={t.reviews.emptyTitle} body={t.reviews.emptyBody} />
        )}

        {body && body.reviews.length > 0 && (
          <ul className="divide-y divide-line">
            {body.reviews.map((r: GbpReviewView) => (
              <ReviewRow
                key={r.reviewName}
                projectId={projectId}
                review={r}
                replyMax={body.replyMax}
                t={t}
                fmt={fmt}
                confirm={confirm}
                onDone={(message) => { setFlash(message); void refresh() }}
              />
            ))}
          </ul>
        )}

        {body && <p className="mt-4 text-caption text-muted">{t.reviews.liveNote}</p>}
        {dialog}
      </Card>
    </div>
  )
}

type T = ReturnType<typeof getDashboardDictionary>['mapsPosts']

function ReviewRow({ projectId, review, replyMax, t, fmt, confirm, onDone }: {
  projectId: string
  review: GbpReviewView
  replyMax: number
  t: T
  fmt: ReturnType<typeof formatDate>
  confirm: ReturnType<typeof useConfirm>['confirm']
  onDone: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(review.reply?.comment ?? '')
  const [busy, setBusy] = useState<'draft' | 'send' | 'remove' | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const chars = countReplyChars(text)
  const checked = validateReplyInput({ comment: text })

  const draft = async () => {
    setBusy('draft'); setError(null)
    const res = await fetch('/api/gbp/reviews/draft', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, reviewName: review.reviewName }),
    }).catch(() => null)
    const json = res ? await res.json().catch(() => null) : null
    setBusy(null)
    if (!res || !res.ok || !json?.ok) { setError(gbpErrorText(t, json?.error)); return }
    setText(String(json.comment ?? ''))
  }

  const send = async () => {
    if (!checked.ok) { setFieldError(gbpFieldText(t, checked.errors[0])); return }
    setBusy('send'); setError(null); setFieldError(null)
    const res = await fetch('/api/gbp/reviews/reply', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, reviewName: review.reviewName, comment: checked.value.comment }),
    }).catch(() => null)
    const json = res ? await res.json().catch(() => null) : null
    setBusy(null)
    if (!res || !res.ok || !json?.ok) {
      const codes = Array.isArray(json?.errors) ? json.errors : null
      if (codes?.length) { setFieldError(gbpFieldText(t, codes[0])); return }
      setError(gbpErrorText(t, json?.error)); return
    }
    setOpen(false)
    onDone(t.reviews.sent)
  }

  const remove = async () => {
    const ok = await confirm({
      title: t.reviews.confirmRemoveTitle, body: t.reviews.confirmRemoveBody,
      confirmLabel: t.reviews.confirmRemoveAction, cancelLabel: t.reviews.cancel, tone: 'danger',
    })
    if (!ok) return
    setBusy('remove'); setError(null)
    const res = await fetch(`/api/gbp/reviews/reply?projectId=${encodeURIComponent(projectId)}&reviewName=${encodeURIComponent(review.reviewName)}`, { method: 'DELETE' }).catch(() => null)
    const json = res ? await res.json().catch(() => null) : null
    setBusy(null)
    if (!res || !res.ok || !json?.ok) { setError(gbpErrorText(t, json?.error)); return }
    setText('')
    setOpen(false)
    onDone(t.reviews.removed)
  }

  return (
    <li className="space-y-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <Stars stars={review.stars} label={review.stars === null ? t.reviews.noStars : t.reviews.starsLabel(review.stars)} />
        <span className="text-copy font-medium text-ink">{review.reviewerName ?? t.reviews.anonymous}</span>
        {review.createTime && <span className="text-caption text-muted">{fmt.dateTime(review.createTime)}</span>}
        {review.isNew && <Badge variant="info" dot>{t.reviews.newBadge}</Badge>}
      </div>

      {review.comment
        ? <p className="max-w-prose whitespace-pre-line text-copy text-body">{review.comment}</p>
        : <p className="text-caption text-muted">{t.reviews.noText}</p>}

      {review.reply && !open && (
        <div className="rounded-control bg-sunk p-3">
          <p className="text-caption font-semibold text-muted">
            {t.reviews.businessReply}
            {review.reply.updateTime ? ` · ${t.reviews.repliedAt(fmt.dateTime(review.reply.updateTime))}` : ''}
          </p>
          <p className="mt-1 max-w-prose whitespace-pre-line text-copy text-body">{review.reply.comment}</p>
        </div>
      )}

      {error && <Notice tone="bad" onDismiss={() => setError(null)}>{error}</Notice>}

      {!open && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => { setText(review.reply?.comment ?? ''); setOpen(true) }}>
            {review.reply ? t.reviews.edit : t.reviews.reply}
          </Button>
          {review.reply && (
            <Button variant="ghost" size="sm" onClick={remove} disabled={busy === 'remove'}>
              {busy === 'remove' ? t.reviews.removing : t.reviews.remove}
            </Button>
          )}
        </div>
      )}

      {open && (
        <div className="space-y-2">
          <Textarea
            label={t.reviews.reply}
            rows={4}
            value={text}
            maxLength={replyMax}
            placeholder={t.reviews.replyPlaceholder}
            onChange={(e) => { setText(e.target.value); setFieldError(null) }}
            error={fieldError ?? undefined}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-caption text-muted">{t.reviews.counter(chars, replyMax)}</span>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" onClick={draft} disabled={busy !== null}>
                {busy === 'draft' ? t.reviews.drafting : t.reviews.draft}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setOpen(false); setFieldError(null) }} disabled={busy !== null}>
                {t.reviews.cancel}
              </Button>
              <Button size="sm" onClick={send} disabled={busy !== null || !checked.ok}>
                {busy === 'send' ? t.reviews.sending : t.reviews.send}
              </Button>
            </div>
          </div>
          <p className="text-caption text-muted">{t.reviews.draftNote}</p>
        </div>
      )}
    </li>
  )
}
