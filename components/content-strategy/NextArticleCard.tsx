'use client'

/**
 * Row 1 of the content strategy tab: "the next article". The next topic in the queue,
 * the date it is projected to go live, and why it was chosen, in the one dark card the
 * screen opens with.
 *
 * Before the project has any article, its one action is "write the first article"
 * (decision 6 of the per-tab plan: the first article is never written automatically,
 * because it counts toward the article allowance). It goes through the existing flow
 * and nothing else:
 *   - a topic that already exists: POST /api/content/articles/generate, the same call
 *     the topics list makes, where the allowance is reserved and checked;
 *   - an idea that is not a topic yet: the existing "new article topic" brief, filled
 *     in with the idea, so the merchant confirms the brief before anything is spent.
 *
 * When the next article is still an idea, it is acted on right here, with the board
 * card's own actions (useIdeaActions): approve it, swap it for the next pending idea
 * (no model call, nothing rejected), or say it is not a fit. Nothing on this card leads
 * to the list view to approve an idea. The two links that remain lead to what only the
 * list view has: the publishing queue, and adding a topic to it with its link review.
 */

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarClock, Check, KeyRound, ListOrdered, Loader2, PenLine, Plus, Shuffle, Sparkles, X } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import type { NextArticle, StrategyOrigin } from '@/lib/content/strategy/board'
import { STRATEGY_ANCHORS, strategyHref } from '@/lib/content/strategy/view'
import type { Locale } from '@/lib/i18n/locales'
import type { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { generationErrorCopy } from '@/lib/content/strategy/copy'
import { canRejectIdea, type IdeaTarget } from '@/lib/content/strategy/ideas'
import { dateTile, fill } from './format'
import type { BoardIdeaActions } from './StrategyBoard'
import type { TopicInsight } from '@/lib/content/strategy/insights'
import TopicFacts from './TopicFacts'

type Dict = ReturnType<typeof getDashboardDictionary>

const GENERATE_TIMEOUT_MS = 180_000

/** A quiet action on the dark card (the filled primary stays for the one main action). */
const SPINNER = <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />
const INK_ACTION = 'inline-flex h-9 items-center gap-1.5 rounded-control border border-white/15 px-4 text-copy font-semibold text-contrast-ink transition-colors duration-150 ease-snappy hover:bg-white/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-50'

function originOf(next: NextArticle): StrategyOrigin {
  if (next.kind === 'scan') return 'scan'
  if (next.kind === 'idea') return 'plan'
  return next.source === 'manual' ? 'manual' : 'topic'
}

export default function NextArticleCard({
  next, hasArticles, lang, dict, idea = null, act = null, insight = null, onOpenBrief, onCreateTopic, onGenerated, onError,
}: {
  next: NextArticle | null
  hasArticles: boolean
  lang: Locale
  dict: Dict
  /** The board card the next article is, when it is an idea; with `act`, its actions show here. */
  idea?: IdeaTarget | null
  act?: BoardIdeaActions | null
  /** What the research knows about its keyword (searches, need, audience, competitors); none until read. */
  insight?: TopicInsight | null
  onOpenBrief: (prefill: { topic?: string; primaryKeyword?: string }) => void
  onCreateTopic: () => void
  onGenerated: () => void
  onError: (text: string) => void
}) {
  const s = dict.contentStrategy
  const router = useRouter()
  const [writing, setWriting] = useState(false)

  if (!next) {
    return (
      <Card tone="ink" className="p-6 md:p-8">
        <p className="text-caption font-semibold uppercase tracking-wide text-contrast-ink/60">{s.nextEyebrow}</p>
        <p className="mt-2 text-section font-semibold">{s.emptyNextTitle}</p>
        <p className="mt-1 max-w-xl text-copy text-contrast-ink/75">{s.emptyNextBody}</p>
        <Button className="mt-5" onClick={onCreateTopic}><Plus className="size-4" /> {s.addTopic}</Button>
      </Card>
    )
  }

  const tile = dateTile(next.date, lang)
  const origin = originOf(next)
  const why = next.reason
    ?? (next.kind === 'queued' ? (next.source === 'manual' ? s.whyFallback.manual : s.whyFallback.queued)
      : next.kind === 'topic' ? (next.source === 'manual' ? s.whyFallback.manual : s.whyFallback.topic)
        : next.kind === 'idea' ? s.whyFallback.idea
          : s.whyFallback.scan)

  async function writeFirst() {
    if (!next || writing) return
    if (!next.topicId) {
      onOpenBrief({ topic: next.title, ...(next.keyword ? { primaryKeyword: next.keyword } : {}) })
      return
    }
    setWriting(true)
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS)
    try {
      const res = await fetch('/api/content/articles/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId: next.topicId }), signal: controller.signal,
      })
      const body = await res.json().catch(() => null)
      const articleId = body && typeof body === 'object' ? (body as { articleId?: unknown }).articleId : null
      if (res.ok && typeof articleId === 'string') {
        onGenerated()
        router.push(`/content/articles/${encodeURIComponent(articleId)}`)
        return
      }
      onError(generationErrorCopy(body, dict.contentHub.genErrors as Record<string, string>))
    } catch (e) {
      const errs = dict.contentHub.genErrors as Record<string, string>
      onError(e instanceof DOMException && e.name === 'AbortError' ? dict.contentHub.batch.timeout : errs.unknown)
    } finally {
      window.clearTimeout(timer)
      setWriting(false)
    }
  }

  // The queue and "add it to the queue" (with its link review) live only in the list view.
  const secondary = next.kind === 'queued'
    ? { href: strategyHref('list', STRATEGY_ANCHORS.queue), label: s.manageQueue }
    : next.kind === 'topic'
      ? { href: strategyHref('list', STRATEGY_ANCHORS.topics), label: s.queueIt }
      : null
  const a = s.ideaActions
  const ideaActs = (next.kind === 'idea' || next.kind === 'scan') && idea && act ? { idea, act } : null
  const busy = ideaActs ? ideaActs.act.actions.busy[ideaActs.idea.key] : undefined

  return (
    <Card tone="ink" className="p-5 md:p-8" >
      <div className="grid gap-5 md:grid-cols-[7.5rem_minmax(0,1fr)] md:gap-8">
        {/* The date tile: when it goes live, or that it is not queued yet. */}
        <div className="flex items-center gap-3 md:flex-col md:items-stretch md:gap-0">
          {tile ? (
            <div className="flex w-24 shrink-0 flex-col items-center rounded-control border border-white/10 bg-white/[0.06] px-2 py-3 text-center md:w-full" aria-label={next.date ?? undefined}>
              <span className="text-caption text-contrast-ink/65">{tile.weekday}</span>
              <span className="text-metric font-bold leading-none tabular-nums">{tile.day}</span>
              <span className="mt-1 text-caption font-semibold text-contrast-ink/80">{tile.month}</span>
            </div>
          ) : (
            <div className="flex w-24 shrink-0 flex-col items-center gap-1.5 rounded-control border border-dashed border-white/20 px-2 py-3 text-center md:w-full">
              <CalendarClock className="size-6 text-contrast-ink/60" aria-hidden="true" />
              <span className="text-caption text-contrast-ink/70">{s.nextNotScheduled}</span>
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-caption font-semibold uppercase tracking-wide text-contrast-ink/60">{s.nextEyebrow}</p>
            <span className="inline-flex items-center gap-1 rounded-pill bg-white/10 px-2 py-0.5 text-caption text-contrast-ink/80">
              {origin === 'scan' || origin === 'plan' ? <Sparkles aria-hidden="true" className="size-3.5" /> : null}
              {s.factSource[origin]}
            </span>
          </div>
          <h2 data-next-title className="mt-2 text-section font-semibold leading-snug md:text-title [overflow-wrap:anywhere]">{next.title}</h2>

          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-caption text-contrast-ink/75">
            {next.keyword && (
              <li className="inline-flex items-center gap-1.5"><KeyRound aria-hidden="true" className="size-3.5" /> {s.factKeyword}: <span className="font-semibold text-contrast-ink">{next.keyword}</span></li>
            )}
            {next.queuePosition && (
              <li className="inline-flex items-center gap-1.5"><ListOrdered aria-hidden="true" className="size-3.5" /> {fill(s.factQueue, { n: next.queuePosition, total: next.queueLength })}</li>
            )}
          </ul>

          <div className="mt-4 rounded-control border border-white/10 bg-white/[0.04] p-4">
            <p className="text-caption font-semibold text-contrast-ink/60">{s.whyTitle}</p>
            <p className="mt-1 text-copy text-contrast-ink/90 [overflow-wrap:anywhere]">{why}</p>
            {insight && <TopicFacts insight={insight} lang={lang} dict={dict} tone="ink" className="mt-3" />}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {!hasArticles && (
              <>
                <Button onClick={writeFirst} loading={writing} disabled={writing}>
                  {!writing && <PenLine aria-hidden="true" className="size-4" />} {writing ? s.writing : s.writeFirst}
                </Button>
                <span className="text-caption text-contrast-ink/60">{s.writeFirstHint}</span>
              </>
            )}
            {ideaActs && (
              <div role="group" aria-label={fill(a.groupLabel, { title: next.title })} data-next-idea-actions className="flex flex-wrap items-center gap-2">
                {/* Before the first article, "write" is the one filled action; after it, approving is. */}
                {hasArticles ? (
                  <Button onClick={() => void ideaActs.act.actions.approve(ideaActs.idea)} loading={busy === 'approve'} disabled={!!busy}
                    aria-label={fill(a.approveAria, { title: next.title })} data-idea-action="approve">
                    {busy !== 'approve' && <Check aria-hidden="true" className="size-4" />} {a.approve}
                  </Button>
                ) : (
                  <button type="button" className={INK_ACTION} onClick={() => void ideaActs.act.actions.approve(ideaActs.idea)} disabled={!!busy}
                    aria-busy={busy === 'approve' || undefined} aria-label={fill(a.approveAria, { title: next.title })} data-idea-action="approve">
                    {busy === 'approve' ? SPINNER : <Check aria-hidden="true" className="size-4" />} {a.approve}
                  </button>
                )}
                {next.alternatives > 0 && (
                  <button type="button" className={INK_ACTION} onClick={() => ideaActs.act.actions.swap(ideaActs.idea)} disabled={!!busy}
                    aria-label={fill(a.swapAria, { title: next.title })} data-idea-action="swap">
                    <Shuffle aria-hidden="true" className="size-4" /> {a.swap}
                  </button>
                )}
                {canRejectIdea(ideaActs.idea, ideaActs.act.automation) && (
                  <button type="button" className={INK_ACTION} onClick={() => void ideaActs.act.actions.reject(ideaActs.idea)} disabled={!!busy}
                    aria-busy={busy === 'reject' || undefined} aria-label={fill(a.rejectAria, { title: next.title })} data-idea-action="reject">
                    {busy === 'reject' ? SPINNER : <X aria-hidden="true" className="size-4" />} {a.reject}
                  </button>
                )}
              </div>
            )}
            {secondary && (
              <Link
                href={secondary.href}
                className={INK_ACTION}
              >
                {secondary.label}
              </Link>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
