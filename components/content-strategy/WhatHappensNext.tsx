'use client'

/**
 * "What happens from here": the four steps every topic goes through (the topics are
 * chosen, one is written in its turn, it goes live, its ranking is measured), each with
 * what is waiting at it right now, counted from the board's cards. The first step with
 * work waiting is marked "now"; a step before it whose work has all moved on is done.
 *
 * STEP ONE DEPENDS ON WHO OWNS IT. The monthly top-up (lib/content/automation/
 * topic-topup.ts) approves by itself as many ideas as the next month needs, for an
 * entitled owner whose publishing queue is on, and leaves the rest in the plan as
 * stock. For those projects the ideas are NOT waiting for the merchant, and saying
 * they are puts the blame for an empty blog on the one person who cannot move it.
 * `autoApproves` is that case: step one then reads as topics we prepared, and the
 * ideas count as work already past it. Without it (a trial, an unpaid owner, or the
 * queue switched off) nothing promotes them and the merchant really does decide.
 */
import { BarChart3, CheckCircle2, Globe, PenLine, ThumbsUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCount } from '@/components/gsc/format'
import type { NextArticle, StrategyColumn } from '@/lib/content/strategy/board'
import type { PublicLocale } from '@/lib/i18n/locales'
import type { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { shortDate } from './format'

type Dict = ReturnType<typeof getDashboardDictionary>

export type StepState = 'done' | 'now' | 'later'
export type NextStep = { key: 'approve' | 'write' | 'publish' | 'measure'; state: StepState; waiting: number }

/** Each step's state from the column counts: pure, so the screen and its guard agree. */
export function nextSteps(counts: Record<StrategyColumn, number>, autoApproves = false): NextStep[] {
  const waiting = { approve: autoApproves ? 0 : counts.ideas, write: counts.planned, publish: counts.written, measure: 0 }
  const past = counts.planned + counts.written + counts.published
  const after = { approve: autoApproves ? counts.ideas + past : past, write: counts.written + counts.published, publish: counts.published, measure: 0 }
  const keys = ['approve', 'write', 'publish', 'measure'] as const
  const now = keys.findIndex((k) => waiting[k] > 0)
  return keys.map((key, i) => ({
    key,
    waiting: waiting[key],
    // Done: nothing waits at it or before it, and something already went past it.
    state: i === now ? 'now' : (now === -1 || i < now) && after[key] > 0 ? 'done' : 'later',
  }))
}

const ICON = { approve: ThumbsUp, write: PenLine, publish: Globe, measure: BarChart3 } as const

export default function WhatHappensNext({ counts, next, lang, dict, autoApproves = false }: {
  counts: Record<StrategyColumn, number>
  next: NextArticle | null
  lang: PublicLocale
  dict: Dict
  /** The top-up approves this project's ideas by itself: step one is ours, not theirs. */
  autoApproves?: boolean
}) {
  const t = dict.strategyInsights.next
  const n = (v: number) => formatCount(v, lang)
  const nextDate = next?.date ? shortDate(next.date, lang) : null
  const body: Record<NextStep['key'], string> = {
    approve: autoApproves
      ? (counts.ideas > 0 ? t.preparedBody(n(counts.ideas)) : t.preparedNone)
      : (counts.ideas > 0 ? t.approveBody(n(counts.ideas)) : t.approveNone),
    write: nextDate ? t.writeBody(nextDate) : t.writeNone,
    publish: counts.published > 0 ? t.publishBody(n(counts.published)) : t.publishNone,
    measure: t.measureBody,
  }
  const title: Record<NextStep['key'], string> = {
    approve: autoApproves ? t.prepared : t.approve, write: t.write, publish: t.publish, measure: t.measure,
  }

  return (
    <section aria-labelledby="strategy-next-heading" data-what-next="">
      <h2 id="strategy-next-heading" className="mb-3 text-section font-semibold text-ink">{t.title}</h2>
      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {nextSteps(counts, autoApproves).map((step, i) => {
          const Icon = step.state === 'done' ? CheckCircle2 : ICON[step.key]
          return (
            <li
              key={step.key}
              data-next-step={step.key}
              data-step-state={step.state}
              style={{ animationDelay: `${i * 70}ms` }}
              className={cn(
                'relative rounded-card border p-4 motion-safe:animate-pop-in [animation-fill-mode:backwards]',
                step.state === 'now' ? 'border-line border-s-[3px] border-s-action bg-surface shadow-card' : 'border-line bg-surface',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={cn(
                  'grid size-8 place-items-center rounded-pill text-caption font-semibold',
                  step.state === 'done' ? 'bg-action-soft text-action' : step.state === 'now' ? 'bg-action text-action-ink' : 'bg-sunk text-muted',
                )}>
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                {step.state !== 'later' && (
                  <span className={cn('rounded-pill px-2 py-0.5 text-overline font-semibold', step.state === 'now' ? 'bg-action text-action-ink' : 'bg-sunk text-body')}>
                    {step.state === 'now' ? t.stepNow : t.stepDone}
                  </span>
                )}
              </div>
              <p className="mt-3 text-copy font-semibold text-ink"><span className="text-muted tabular-nums">{n(i + 1)}. </span>{title[step.key]}</p>
              <p className="mt-1 text-caption text-body">{body[step.key]}</p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
