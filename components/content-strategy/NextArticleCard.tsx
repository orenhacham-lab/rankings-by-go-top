'use client'

/**
 * Row 1 of the content strategy tab: "the next article". The next topic in the queue,
 * the date it is projected to go live, and why it was chosen, in the one dark card the
 * screen opens with.
 *
 * Where the publishing queue exists (automation on), approving IS scheduling: the
 * approved topic goes straight into the queue with its date, and the FIRST approval on a
 * project writes the first article on the server (lib/content/strategy/first-article.ts;
 * the owner's ask of 2026-10-02 replaced decision 6, "never automatically"). The card
 * then shows it being written, and once it is ready, the one "publish now" of the whole
 * plan (FirstArticlePanel); every later article goes out on the plan's rhythm.
 *
 * Without automation (no queue), its one action before any article is still "write the
 * first article", through the existing flow and nothing else:
 *   - a topic that already exists: POST /api/content/articles/generate, the same call
 *     the topics list makes, where the allowance is reserved and checked;
 *   - an idea that is not a topic yet: the existing "new article topic" brief, filled
 *     in with the idea, so the merchant confirms the brief before anything is spent.
 *
 * When the next article is still an idea, it is acted on right here, with the board
 * card's own actions (useIdeaActions): approve it, or say it is not a fit. Nothing on this card leads
 * to the list view to approve an idea. The link that remains leads to what only the
 * list view has: the publishing queue (and, without automation, the topics list).
 */

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarClock, Check, CircleCheck, ExternalLink, KeyRound, ListOrdered, Loader2, PauseCircle, PenLine, Plus, Send, Sparkles, X } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import type { NextArticle, StrategyOrigin } from '@/lib/content/strategy/board'
import { STRATEGY_ANCHORS, strategyHref } from '@/lib/content/strategy/view'
import type { PublicLocale } from '@/lib/i18n/locales'
import type { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { generationErrorCopy } from '@/lib/content/strategy/copy'
import { canRejectIdea, type IdeaTarget } from '@/lib/content/strategy/ideas'
import { dateTile, fill, longDate } from './format'
import type { FirstArticleView } from '@/lib/content/strategy/first-article'
import { BILLING_HREF } from '@/lib/onboarding/links'
import type { BoardIdeaActions } from './StrategyBoard'
import type { TopicInsight } from '@/lib/content/strategy/insights'
import TopicFacts from './TopicFacts'

type Dict = ReturnType<typeof getDashboardDictionary>

const GENERATE_TIMEOUT_MS = 180_000

/** A quiet action on the dark card (the filled primary stays for the one main action). */
const SPINNER = <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />
const INK_ACTION = 'inline-flex h-9 items-center gap-1.5 rounded-control border border-white/15 px-4 text-copy font-semibold text-contrast-ink transition-colors duration-150 ease-snappy hover:bg-white/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-50'

/** Why the first article could not be written, in the onboarding's own friendly words. */
type FirstErrors = Dict['seedOnboarding']['firstArticle']['errors']

/**
 * The project's first article, on the dark card: being written, ready (with the plan's
 * one "publish now"), or stopped. Shown only for the first article (firstArticleView).
 */
function FirstArticlePanel({ first, date, lang, dict, hasSite, connectHref, publishing, onPublish }: {
  first: Exclude<FirstArticleView, { kind: 'none' }>
  date: string | null
  lang: PublicLocale
  dict: Dict
  /** null while the connection is not read yet. */
  hasSite: boolean | null
  connectHref: string
  publishing: boolean
  onPublish: () => void
}) {
  const f = dict.contentStrategy.first
  if (first.kind === 'writing') {
    return (
      <div data-first-article="writing" role="status" aria-live="polite" className="mt-4 flex items-start gap-3 rounded-control border border-white/10 bg-white/[0.06] p-4">
        <Loader2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-contrast-ink/80 motion-safe:animate-spin" />
        <div className="min-w-0">
          <p className="text-copy font-semibold">{f.writingTitle}</p>
          <p className="mt-0.5 text-caption text-contrast-ink/70">{f.writingBody}</p>
          <div aria-hidden="true" className="mt-3 h-1 w-full max-w-xs overflow-hidden rounded-pill bg-white/10">
            <div className="progress-sweep h-full rounded-pill bg-white/55" />
          </div>
        </div>
      </div>
    )
  }
  if (first.kind === 'failed') {
    const errors = dict.seedOnboarding.firstArticle.errors as FirstErrors
    const needsPlan = first.reason === 'quota' || first.reason === 'billing'
    return (
      <div data-first-article="failed" role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-control border border-white/10 bg-white/[0.06] p-4">
        <p className="min-w-0 text-copy text-contrast-ink/90">{errors[first.reason]}</p>
        {needsPlan && <Link href={BILLING_HREF} className={INK_ACTION}>{dict.seedOnboarding.actions.billing}</Link>}
      </div>
    )
  }
  const when = longDate(date, lang)
  return (
    <div data-first-article="ready" className="mt-4 rounded-control border border-white/20 bg-white/[0.08] p-4 motion-safe:animate-pop-in">
      <p className="inline-flex items-center gap-2 text-copy font-semibold">
        <CircleCheck aria-hidden="true" className="size-5 text-contrast-ink" /> {f.readyTitle}
      </p>
      <p className="mt-1 text-copy text-contrast-ink/80">{when ? fill(f.readyBody, { date: when }) : f.readyBodyNoDate}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {hasSite === false ? (
          <p data-first-article-no-site className="w-full text-caption text-contrast-ink/75">{f.noSite}</p>
        ) : null}
        {hasSite === false ? (
          <Link href={connectHref} className={INK_ACTION}><ExternalLink aria-hidden="true" className="size-4" /> {f.connect}</Link>
        ) : (
          <Button onClick={onPublish} loading={publishing} disabled={publishing || hasSite === null} data-first-article-publish>
            {!publishing && <Send aria-hidden="true" className="size-4" />} {publishing ? f.publishing : f.publishNow}
          </Button>
        )}
        <Link href={`/content/articles/${encodeURIComponent(first.articleId)}`} className={INK_ACTION}>{f.open}</Link>
      </div>
      <p className="mt-3 text-caption text-contrast-ink/60">{f.rhythm}</p>
    </div>
  )
}

function originOf(next: NextArticle): StrategyOrigin {
  if (next.kind === 'scan') return 'scan'
  if (next.kind === 'idea') return 'plan'
  return next.source === 'manual' ? 'manual' : 'topic'
}

export default function NextArticleCard({
  next, hasArticles, lang, dict, idea = null, act = null, insight = null, onOpenBrief, onCreateTopic, onGenerated, onError,
  automation = false, first = { kind: 'none' }, queuePaused = false, hasSite = null, connectHref = '/settings', publishing = false, onPublishFirst,
}: {
  /** The publishing queue exists: approving schedules, and the first approval writes the first article. */
  automation?: boolean
  /** The project's first article (firstArticleView): the only one with "publish now". */
  first?: FirstArticleView
  /** The queue is paused, so a queued article has no date. */
  queuePaused?: boolean
  hasSite?: boolean | null
  connectHref?: string
  publishing?: boolean
  onPublishFirst?: () => void
  next: NextArticle | null
  hasArticles: boolean
  lang: PublicLocale
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

  // The queue lives only in the list view. With automation an approved topic is already
  // in it, so there is no "add it to the queue" step; without it, the topics list remains.
  const secondary = next.kind === 'queued'
    ? { href: strategyHref('list', STRATEGY_ANCHORS.queue), label: s.manageQueue }
    : next.kind === 'topic' && !automation
      ? { href: strategyHref('list', STRATEGY_ANCHORS.topics), label: s.queueIt }
      : null
  // The first article's panel sits on its own topic: queued while it is written or ready,
  // and a topic again (out of the queue's waiting line) when writing it stopped.
  const firstShown = first.kind !== 'none' && (next.kind === 'queued' || (first.kind === 'failed' && next.kind === 'topic'))
  const firstStopped = firstShown && first.kind === 'failed'
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
              {next.kind === 'queued' && queuePaused
                ? <PauseCircle className="size-6 text-contrast-ink/60" aria-hidden="true" />
                : <CalendarClock className="size-6 text-contrast-ink/60" aria-hidden="true" />}
              {/* A queued article is in the queue: without a date, that is because the queue is paused. */}
              <span data-next-date-state={next.kind === 'queued' ? 'paused' : firstStopped ? 'stopped' : 'unscheduled'} className="text-caption text-contrast-ink/70">
                {next.kind === 'queued' ? s.nextPaused : firstStopped ? s.first.stoppedTile : s.nextNotScheduled}
              </span>
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

          {firstShown && (
            <FirstArticlePanel
              first={first} date={next.date} lang={lang} dict={dict} hasSite={hasSite} connectHref={connectHref}
              publishing={publishing} onPublish={() => onPublishFirst?.()}
            />
          )}
          {next.kind === 'queued' && queuePaused && <p className="mt-3 text-caption text-contrast-ink/65">{s.first.pausedHint}</p>}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {!hasArticles && !automation && (
              <>
                <Button onClick={writeFirst} loading={writing} disabled={writing}>
                  {!writing && <PenLine aria-hidden="true" className="size-4" />} {writing ? s.writing : s.writeFirst}
                </Button>
                <span className="text-caption text-contrast-ink/60">{s.writeFirstHint}</span>
              </>
            )}
            {ideaActs && (
              <div role="group" aria-label={fill(a.groupLabel, { title: next.title })} data-next-idea-actions className="flex flex-wrap items-center gap-2">
                {/* Without automation, "write" is the one filled action before the first article;
                    otherwise approving is (and the first approval writes the first article). */}
                {hasArticles || automation ? (
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
                {canRejectIdea(ideaActs.idea, ideaActs.act.automation) && (
                  <button type="button" className={INK_ACTION} onClick={() => void ideaActs.act.actions.reject(ideaActs.idea)} disabled={!!busy}
                    aria-busy={busy === 'reject' || undefined} aria-label={fill(a.rejectAria, { title: next.title })} data-idea-action="reject">
                    {busy === 'reject' ? SPINNER : <X aria-hidden="true" className="size-4" />} {a.reject}
                  </button>
                )}
                {automation && !hasArticles && (
                  <span data-approve-first-hint className="basis-full text-caption text-contrast-ink/60">{s.first.approveHint}</span>
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
