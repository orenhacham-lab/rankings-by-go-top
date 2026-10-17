'use client'

/**
 * Widget 10, recent activity: articles written and published, new topics, rank
 * checks, AI checks, and every step of the seeding scan ("Found 188 keywords
 * from competitors"), each with how long ago it happened. While stage B runs,
 * its current step leads the list and the steps still to come are counted, so
 * the wait reads as work in progress rather than an empty screen.
 */
import { Activity, AlertCircle, CheckCircle2, FileText, KeyRound, Loader2, Search, Sparkles, Target } from 'lucide-react'
import type { ReactNode } from 'react'
import { relativeTime, type FeedItem } from '@/lib/dashboard/activity'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import { LinkButton, Widget, WidgetEmpty, WidgetError, WidgetLoading } from './ui'

type Copy = DashboardDictionary['dashboardHome']

export type ActivityModel =
  | { state: 'loading' }
  | { state: 'error'; retry: () => void }
  | { state: 'ready'; items: FeedItem[]; pending: number }

function describe(item: FeedItem, a: Copy['activity']): { text: string; icon: ReactNode; tone: 'ok' | 'bad' | 'live' | 'neutral' } {
  const size = 14
  if (item.source === 'seed') {
    const { line } = item
    if (line.status === 'running') return { text: a.seedRunning[line.step], icon: <Loader2 size={size} strokeWidth={2} className="animate-spin motion-reduce:animate-none" />, tone: 'live' }
    if (line.status === 'failed') return { text: a.seedFailed(a.seedRunning[line.step]), icon: <AlertCircle size={size} strokeWidth={2} />, tone: 'bad' }
    return { text: a.seedDone[line.step](line.count), icon: <CheckCircle2 size={size} strokeWidth={2} />, tone: 'ok' }
  }
  const e = item.event
  switch (e.kind) {
    case 'article_created': return { text: a.events.article_created(e.title ?? ''), icon: <FileText size={size} strokeWidth={2} />, tone: 'neutral' }
    case 'article_published': return { text: a.events.article_published(e.title ?? ''), icon: <Sparkles size={size} strokeWidth={2} />, tone: 'ok' }
    case 'topic_created': return { text: a.events.topic_created(e.title ?? ''), icon: <Target size={size} strokeWidth={2} />, tone: 'neutral' }
    case 'rank_check': return { text: a.events.rank_check(e.count), icon: <Search size={size} strokeWidth={2} />, tone: 'neutral' }
    case 'ai_check': return { text: a.events.ai_check, icon: <Sparkles size={size} strokeWidth={2} />, tone: 'neutral' }
  }
}

const TONE: Record<'ok' | 'bad' | 'live' | 'neutral', string> = {
  ok: 'bg-ok-soft text-ok',
  bad: 'bg-bad-soft text-bad',
  live: 'bg-action-soft text-action',
  neutral: 'bg-sunk text-muted',
}

export default function RecentActivity({ t, model, now, language, emptyHref }: {
  t: Copy
  model: ActivityModel
  now: Date
  language: 'he' | 'en'
  emptyHref: string
}) {
  const a = t.activity
  const empty = model.state === 'ready' && model.items.length === 0
  return (
    <Widget id="activity" state={empty ? 'empty' : model.state} title={a.title} subtitle={a.subtitle} icon={<Activity size={16} strokeWidth={2} />}>
      {model.state === 'loading' && <WidgetLoading lines={4} label={a.title} />}
      {model.state === 'error' && <WidgetError message={t.loadError} retryLabel={t.actions.retry} onRetry={model.retry} />}
      {empty && (
        <WidgetEmpty
          icon={<KeyRound size={18} strokeWidth={2} />}
          title={a.emptyTitle}
          body={a.empty}
          action={<LinkButton href={emptyHref} variant="secondary" size="sm">{a.emptyCta}</LinkButton>}
        />
      )}
      {model.state === 'ready' && model.items.length > 0 && (
        <ol className="relative space-y-0">
          {model.items.map((item, i) => {
            const d = describe(item, a)
            const running = item.source === 'seed' && item.line.status === 'running'
            const key = item.source === 'seed' ? `seed-${item.line.step}` : `${item.event.kind}-${item.at}-${i}`
            return (
              <li key={key} data-activity={item.source === 'seed' ? `seed:${item.line.step}:${item.line.status}` : item.event.kind}
                className="relative flex gap-3 pb-4 last:pb-0">
                {/* The rail between the dots. */}
                {i < model.items.length - 1 && <span aria-hidden="true" className="absolute start-[13px] top-7 bottom-0 w-px bg-line" />}
                <span aria-hidden="true" className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-pill ${TONE[d.tone]}`}>
                  {d.icon}
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-copy text-ink break-words">{d.text}</p>
                  <p className="text-caption text-muted">
                    {running && <span className="font-medium text-action">{a.running}</span>}
                    {running && item.at && ' · '}
                    {item.at && <time dateTime={item.at}>{relativeTime(item.at, now, language)}</time>}
                  </p>
                </div>
              </li>
            )
          })}
          {model.pending > 0 && (
            <li data-activity="seed:pending" className="relative flex gap-3 pt-4">
              <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-pill border border-dashed border-line-strong" />
              <p className="pt-1 text-caption text-muted">{a.pending(model.pending)}</p>
            </li>
          )}
        </ol>
      )}
    </Widget>
  )
}
