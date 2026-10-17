'use client'

/**
 * Row 2 of the content strategy tab: the month board. Four columns (ideas, planned,
 * written, published) under a row of month chips; "all" is the default and every other
 * chip is a month the plan schedules something in. A month shows what the plan puts in
 * it, and everything not scheduled yet (ideas, topics waiting for a slot), which belongs
 * to no month and so is never hidden by one (lib/content/strategy/board.ts monthChips).
 * The chips carry no bare number: "September 10" beside "all 11" read as ten topics in
 * September when one was (review P2-12). One line under them says the totals in words
 * ("10 topics shown in October: 1 planned for October and 9 with no date yet").
 * A card says which date it carries, and, when the research knows its keyword, why it
 * is worth writing (TopicFacts).
 *
 * Written and published cards open the article. An idea is acted on right here, on its
 * own card (useIdeaActions): approve it, so it moves to "planned", or say it is not a
 * fit. Neither leads to the list view. There used to be a third, "swap", which only
 * moved the idea behind the others and created nothing; a customer who wants a
 * different topic types their own keyword instead (AddKeywordForm), which is free and
 * immediate. Removed 5 October 2026 at the owner's call.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, Check, KeyRound, Sparkles, Telescope, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import Button from '@/components/ui/Button'
import Segmented from '@/components/ui/Segmented'
import {
  ALL_MONTHS, IDEA_GROUP_ORDER, STRATEGY_COLUMNS, cardsInMonth, ideaGroupCounts, ideaGroupOf, monthChips, sameTopicKey, unscheduledCount,
  type StrategyCard, type StrategyColumn,
} from '@/lib/content/strategy/board'
import type { TopicInsight } from '@/lib/content/strategy/insights'
import { formatCount } from '@/components/gsc/format'
import TopicFacts from './TopicFacts'
import { canRejectIdea, ideaTargetFromCard } from '@/lib/content/strategy/ideas'
import type { IdeaActions } from './useIdeaActions'
import type { PublicLocale } from '@/lib/i18n/locales'
import type { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { fill, monthLabel, shortDate } from './format'

type Dict = ReturnType<typeof getDashboardDictionary>

/** How many cards a column shows before "N more". */
export const COLUMN_PREVIEW = 5

/** One accent per column, from the app's own state tokens. */
/**
 * The stages as categories on the tokens (design contract §3): the further a topic
 * has come, the stronger the action colour; counts stay neutral.
 */
export const ACCENT: Record<StrategyColumn, { dot: string; count: string }> = {
  ideas: { dot: 'bg-line-strong', count: 'bg-sunk text-body' },
  planned: { dot: 'bg-action/35', count: 'bg-sunk text-body' },
  written: { dot: 'bg-action/60', count: 'bg-sunk text-body' },
  published: { dot: 'bg-action', count: 'bg-sunk text-body' },
}

/** What the board needs to act on an idea; absent, the cards only show. */
export type BoardIdeaActions = { actions: IdeaActions; automation: boolean }

export function IdeaButtons({ card, dict, act, inline = false }: { card: StrategyCard; dict: Dict; act: BoardIdeaActions; inline?: boolean }) {
  const a = dict.contentStrategy.ideaActions
  const target = ideaTargetFromCard(card)
  if (!target) return null
  const busy = act.actions.busy[card.key]
  return (
    <div role="group" aria-label={fill(a.groupLabel, { title: card.title })} className={cn('flex flex-wrap items-center gap-1', !inline && 'mt-3 border-t border-line pt-3')}>
      {/* Wave 10 (owner): approving an idea is the card's main action, so it is the site's
          dark-blue primary button (a white bordered one did not stand out). The others stay quiet. */}
      <Button size="sm" variant="primary" onClick={() => void act.actions.approve(target)} loading={busy === 'approve'} disabled={!!busy}
        aria-label={fill(a.approveAria, { title: card.title })} data-idea-action="approve">
        {busy !== 'approve' && <Check aria-hidden="true" className="size-4" />} {a.approve}
      </Button>
      {canRejectIdea(target, act.automation) && (
        <Button size="sm" variant="ghost" className="px-2.5" onClick={() => void act.actions.reject(target)} loading={busy === 'reject'} disabled={!!busy}
          aria-label={fill(a.rejectAria, { title: card.title })} data-idea-action="reject">
          {a.reject}
        </Button>
      )}
    </div>
  )
}

function BoardCard({ card, lang, dict, act, insight }: { card: StrategyCard; lang: PublicLocale; dict: Dict; act: BoardIdeaActions | null; insight?: TopicInsight }) {
  const s = dict.contentStrategy
  const date = shortDate(card.date, lang)
  const approvedNow = card.column === 'planned' && !!act && act.actions.approvedNow.has(sameTopicKey(card.title))
  const body = (
    <>
      <p className="line-clamp-2 text-copy font-semibold text-ink [overflow-wrap:anywhere]">{card.title}</p>
      {card.keyword && (
        <p className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-pill bg-sunk px-2 py-0.5 text-caption text-muted">
          <KeyRound className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{card.keyword}</span>
        </p>
      )}
      {insight && <TopicFacts insight={insight} lang={lang} dict={dict} className="mt-2" />}
      {card.column === 'ideas' && card.reason && (
        <p className="mt-1.5 line-clamp-2 text-caption text-muted [overflow-wrap:anywhere]">{card.reason}</p>
      )}
      {card.origin === 'ranking' && typeof card.position === 'number' && (
        <p className="mt-1.5 text-caption text-muted">{fill(card.position <= 10 ? s.rankingReasonTop : s.rankingReason, { n: card.position })}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted">
        {date && (
          <span className="inline-flex items-center gap-1">
            <CalendarDays aria-hidden="true" className="size-3.5" />
            {s.dateKinds[card.dateKind]} · <span className="tabular-nums">{date}</span>
          </span>
        )}
        {card.origin === 'scan' && (
          <span className="inline-flex items-center gap-1 rounded-pill bg-sunk px-1.5 text-body"><Sparkles aria-hidden="true" className="size-3 text-action" />{s.origins.scan}</span>
        )}
        {card.origin === 'ranking' && (
          <span className="inline-flex items-center gap-1 rounded-pill bg-sunk px-1.5 text-body"><TrendingUp aria-hidden="true" className="size-3 text-action" />{s.origins.ranking}</span>
        )}
        {card.queued && card.column !== 'published' && (
          <span className="rounded-pill bg-sunk px-1.5 font-medium text-body">{s.queued}</span>
        )}
        {approvedNow && (
          <span data-approved-now className="inline-flex items-center gap-1 rounded-pill bg-ok-soft px-1.5 font-semibold text-ok"><Check aria-hidden="true" className="size-3" />{s.ideaActions.approvedNow}</span>
        )}
      </div>
      {card.column === 'ideas' && act && <IdeaButtons card={card} dict={dict} act={act} />}
    </>
  )
  const frame = 'block rounded-inset border border-line bg-surface p-3 transition-colors duration-150 ease-snappy'
  if (card.articleId) {
    return (
      <Link
        href={`/content/articles/${encodeURIComponent(card.articleId)}`}
        aria-label={`${s.openArticle}: ${card.title}`}
        data-strategy-card={card.key}
        className={cn(frame, 'hover:border-line-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20')}
      >
        {body}
      </Link>
    )
  }
  return <div data-strategy-card={card.key} className={cn(frame, approvedNow && 'border-ok/40')}>{body}</div>
}

function Column({ column, cards: raw, lang, dict, note, act, insights }: { column: StrategyColumn; cards: StrategyCard[]; lang: PublicLocale; dict: Dict; note?: string | null; act: BoardIdeaActions | null; insights?: ReadonlyMap<string, TopicInsight> | null }) {
  const s = dict.contentStrategy
  const [open, setOpen] = useState(false)
  // Ideas: our own first, then the suggestions from the rankings, then the scan's (stable within a group).
  const cards = column === 'ideas' ? [...raw].sort((a, b) => IDEA_GROUP_ORDER.indexOf(ideaGroupOf(a)) - IDEA_GROUP_ORDER.indexOf(ideaGroupOf(b))) : raw
  const shown = open ? cards : cards.slice(0, COLUMN_PREVIEW)
  const hidden = cards.length - shown.length

  // The ideas column names each kind of card with its own count when there is more than one (the
  // dashboard's "N topics waiting" is the first group's number).
  const totals = column === 'ideas' ? ideaGroupCounts(cards) : null
  const groups = totals && IDEA_GROUP_ORDER.filter((k) => totals[k] > 0).length > 1
    ? IDEA_GROUP_ORDER.map((kind) => ({ kind, total: totals[kind], cards: shown.filter((c) => ideaGroupOf(c) === kind) })).filter((g) => g.cards.length > 0)
    : null
  return (
    <section aria-labelledby={`strategy-col-${column}`} data-strategy-column={column} className="flex min-w-0 flex-col rounded-card border border-line bg-sunk/60 p-3">
      <header className="mb-3 flex items-center justify-between gap-2 px-1">
        <h3 id={`strategy-col-${column}`} className="inline-flex items-center gap-2 text-copy font-semibold text-ink">
          <span className={cn('h-2 w-2 rounded-pill', ACCENT[column].dot)} aria-hidden />
          {s.columns[column]}
        </h3>
        <span className={cn('min-w-6 rounded-pill px-2 text-center text-caption font-semibold tabular-nums', ACCENT[column].count)}>{cards.length}</span>
      </header>
      {note && (
        <p data-strategy-note={column} className="-mt-1 mb-3 inline-flex items-center gap-1.5 px-1 text-caption font-medium text-action">
          <Telescope aria-hidden="true" className="size-3.5" />
          {note}
        </p>
      )}
      {cards.length === 0 ? (
        <p className="rounded-control border border-dashed border-line-strong/70 px-3 py-4 text-caption text-muted">{s.columnEmpty[column]}</p>
      ) : (
        groups ? (
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.kind} data-idea-group={g.kind}>
                <p className="mb-2 px-1 text-caption font-semibold text-body">
                  {s.ideaGroups[g.kind]} <span className="tabular-nums text-muted">({g.total})</span>
                </p>
                <ul className="space-y-2">
                  {g.cards.map((c) => <li key={c.key}><BoardCard card={c} lang={lang} dict={dict} act={act} insight={insights?.get(c.key)} /></li>)}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <ul className="space-y-2">
            {shown.map((c) => <li key={c.key}><BoardCard card={c} lang={lang} dict={dict} act={act} insight={insights?.get(c.key)} /></li>)}
          </ul>
        )
      )}
      {(hidden > 0 || open) && cards.length > COLUMN_PREVIEW && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-2 rounded-control px-2 py-1.5 text-caption font-semibold text-action transition-colors duration-150 ease-snappy hover:bg-action-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
        >
          {open ? s.showLess : fill(s.showMore, { n: hidden })}
        </button>
      )}
      {hidden > 0 && (
        <p data-column-shown="" className="mt-1 px-2 text-overline text-muted tabular-nums">
          {dict.strategyInsights.board.shown(formatCount(shown.length, lang), formatCount(cards.length, lang))}
        </p>
      )}
    </section>
  )
}

export default function StrategyBoard({ cards, lang, dict, ideasNote = null, act = null, insights = null }: {
  cards: StrategyCard[]
  lang: PublicLocale
  dict: Dict
  /** One line under the ideas column's header (a project with no scan: the mapping will add more). */
  ideasNote?: string | null
  /** The idea actions; without them the board only shows. */
  act?: BoardIdeaActions | null
  /** Why each card is worth writing, by card key (the research's facts); none until read. */
  insights?: ReadonlyMap<string, TopicInsight> | null
}) {
  const s = dict.contentStrategy
  const chips = useMemo(() => monthChips(cards), [cards])
  const [month, setMonth] = useState<string>(ALL_MONTHS)
  // A month that no longer has a card (after an approval moved it) falls back to all.
  const active = chips.some((c) => c.key === month) ? month : ALL_MONTHS
  const visible = useMemo(() => cardsInMonth(cards, active), [cards, active])
  const unscheduled = useMemo(() => unscheduledCount(cards), [cards])
  const fmt = (n: number) => formatCount(n, lang)
  const byColumn = useMemo(() => {
    const m: Record<StrategyColumn, StrategyCard[]> = { ideas: [], planned: [], written: [], published: [] }
    for (const c of visible) m[c.column].push(c)
    return m
  }, [visible])

  return (
    <div>
      <div data-strategy-months="" className="-mx-1 mb-4 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
        <Segmented<string>
          ariaLabel={s.monthsLabel}
          value={active}
          onChange={setMonth}
          options={chips.map((c) => ({ value: c.key, label: c.key === ALL_MONTHS ? s.allMonths : monthLabel(c.key, lang) }))}
        />
      </div>

      <p data-month-summary={active} aria-live="polite" className="-mt-2 mb-3 text-caption text-muted tabular-nums">
        {active === ALL_MONTHS
          ? dict.strategyInsights.board.summaryAll({ total: cards.length, dated: cards.length - unscheduled, undated: unscheduled }, fmt)
          : dict.strategyInsights.board.summaryMonth({ shown: visible.length, inMonth: visible.length - unscheduled, undated: unscheduled }, monthLabel(active, lang), fmt)}
      </p>

      <div key={active} className="grid motion-safe:animate-pop-in items-start gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STRATEGY_COLUMNS.map((col) => <Column key={col} column={col} cards={byColumn[col]} lang={lang} dict={dict} note={col === 'ideas' ? ideasNote : null} act={act} insights={insights} />)}
      </div>
    </div>
  )
}
