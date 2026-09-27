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
 */

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarClock, KeyRound, ListOrdered, PenLine, Plus, Sparkles } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import type { NextArticle, StrategyOrigin } from '@/lib/content/strategy/board'
import { STRATEGY_ANCHORS, strategyHref } from '@/lib/content/strategy/view'
import type { Locale } from '@/lib/i18n/locales'
import type { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { generationErrorCopy } from '@/lib/content/strategy/copy'
import { dateTile, fill } from './format'

type Dict = ReturnType<typeof getDashboardDictionary>

const GENERATE_TIMEOUT_MS = 180_000

function originOf(next: NextArticle): StrategyOrigin {
  if (next.kind === 'scan') return 'scan'
  if (next.kind === 'idea') return 'plan'
  return next.source === 'manual' ? 'manual' : 'topic'
}

export default function NextArticleCard({
  next, hasArticles, lang, dict, automationEnabled, onOpenBrief, onCreateTopic, onGenerated, onError,
}: {
  next: NextArticle | null
  hasArticles: boolean
  lang: Locale
  dict: Dict
  automationEnabled: boolean
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
        <Button className="mt-5" onClick={onCreateTopic}><Plus size={16} /> {s.addTopic}</Button>
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

  const secondary = next.kind === 'queued'
    ? { href: strategyHref('list', STRATEGY_ANCHORS.queue), label: s.manageQueue }
    : next.kind === 'topic'
      ? { href: strategyHref('list', STRATEGY_ANCHORS.topics), label: s.queueIt }
      : next.kind === 'idea' && automationEnabled
        ? { href: strategyHref('list', STRATEGY_ANCHORS.ideas), label: s.planIt }
        : null

  return (
    <Card tone="ink" className="p-5 md:p-8" >
      <div className="grid gap-5 md:grid-cols-[7.5rem_minmax(0,1fr)] md:gap-8">
        {/* The date tile: when it goes live, or that it is not queued yet. */}
        <div className="flex items-center gap-3 md:flex-col md:items-stretch md:gap-0">
          {tile ? (
            <div className="flex w-24 shrink-0 flex-col items-center rounded-control border border-white/10 bg-white/[0.06] px-2 py-3 text-center md:w-full" aria-label={next.date ?? undefined}>
              <span className="text-caption text-contrast-ink/65">{tile.weekday}</span>
              <span className="text-[2.25rem] font-bold leading-none tabular-nums">{tile.day}</span>
              <span className="mt-1 text-caption font-semibold text-contrast-ink/80">{tile.month}</span>
            </div>
          ) : (
            <div className="flex w-24 shrink-0 flex-col items-center gap-1.5 rounded-control border border-dashed border-white/20 px-2 py-3 text-center md:w-full">
              <CalendarClock size={22} className="text-contrast-ink/60" aria-hidden />
              <span className="text-caption text-contrast-ink/70">{s.nextNotScheduled}</span>
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-caption font-semibold uppercase tracking-wide text-contrast-ink/60">{s.nextEyebrow}</p>
            <span className="inline-flex items-center gap-1 rounded-pill bg-white/10 px-2 py-0.5 text-caption text-contrast-ink/80">
              {origin === 'scan' || origin === 'plan' ? <Sparkles size={12} aria-hidden /> : null}
              {s.factSource[origin]}
            </span>
          </div>
          <h2 className="mt-2 text-section font-semibold leading-snug md:text-title [overflow-wrap:anywhere]">{next.title}</h2>

          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-caption text-contrast-ink/75">
            {next.keyword && (
              <li className="inline-flex items-center gap-1.5"><KeyRound size={13} aria-hidden /> {s.factKeyword}: <span className="font-semibold text-contrast-ink">{next.keyword}</span></li>
            )}
            {next.queuePosition && (
              <li className="inline-flex items-center gap-1.5"><ListOrdered size={13} aria-hidden /> {fill(s.factQueue, { n: next.queuePosition, total: next.queueLength })}</li>
            )}
          </ul>

          <div className="mt-4 rounded-control border border-white/10 bg-white/[0.04] p-4">
            <p className="text-caption font-semibold text-contrast-ink/60">{s.whyTitle}</p>
            <p className="mt-1 text-copy text-contrast-ink/90 [overflow-wrap:anywhere]">{why}</p>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {!hasArticles && (
              <>
                <Button onClick={writeFirst} loading={writing} disabled={writing}>
                  {!writing && <PenLine size={16} aria-hidden />} {writing ? s.writing : s.writeFirst}
                </Button>
                <span className="text-caption text-contrast-ink/60">{s.writeFirstHint}</span>
              </>
            )}
            {secondary && (
              <Link
                href={secondary.href}
                className="inline-flex h-9 items-center rounded-control border border-white/15 px-4 text-sm font-semibold text-contrast-ink transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
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
