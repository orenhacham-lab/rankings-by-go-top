'use client'

/**
 * Row 2 of the content strategy tab: the month board. Four columns (ideas, planned,
 * written, published) under a row of month chips, each with its count; "all" is the
 * default and every other chip is a month that has at least one card. A card is dated
 * by the one date that matters for its column, and says which date it is.
 *
 * Written and published cards open the article. An idea is acted on right here, on its
 * own card (useIdeaActions): approve it (it moves to "planned"), say it is not a fit, or
 * swap it for the next pending idea when the column has more than it shows. None of
 * them leads to the list view.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, Check, KeyRound, Sparkles, Telescope, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import Button from '@/components/ui/Button'
import {
  ALL_MONTHS, STRATEGY_COLUMNS, cardsInMonth, monthChips, sameTopicKey,
  type StrategyCard, type StrategyColumn,
} from '@/lib/content/strategy/board'
import { canRejectIdea, ideaTargetFromCard } from '@/lib/content/strategy/ideas'
import type { IdeaActions } from './useIdeaActions'
import type { Locale } from '@/lib/i18n/locales'
import type { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { fill, monthLabel, shortDate } from './format'

type Dict = ReturnType<typeof getDashboardDictionary>

/** How many cards a column shows before "N more". */
export const COLUMN_PREVIEW = 5

/** One accent per column, from the app's own state tokens. */
const ACCENT: Record<StrategyColumn, { dot: string; count: string }> = {
  ideas: { dot: 'bg-info', count: 'bg-info-soft text-info' },
  planned: { dot: 'bg-warn', count: 'bg-warn-soft text-warn' },
  written: { dot: 'bg-action', count: 'bg-action-soft text-action' },
  published: { dot: 'bg-ok', count: 'bg-ok-soft text-ok' },
}

/** What the board needs to act on an idea; absent, the cards only show. */
export type BoardIdeaActions = { actions: IdeaActions; automation: boolean }

function IdeaButtons({ card, dict, act, canSwap }: { card: StrategyCard; dict: Dict; act: BoardIdeaActions; canSwap: boolean }) {
  const a = dict.contentStrategy.ideaActions
  const target = ideaTargetFromCard(card)
  if (!target) return null
  const busy = act.actions.busy[card.key]
  return (
    <div role="group" aria-label={fill(a.groupLabel, { title: card.title })} className="mt-3 flex flex-wrap items-center gap-1 border-t border-line pt-3">
      <Button size="sm" onClick={() => void act.actions.approve(target)} loading={busy === 'approve'} disabled={!!busy}
        aria-label={fill(a.approveAria, { title: card.title })} data-idea-action="approve">
        {busy !== 'approve' && <Check size={14} aria-hidden />} {a.approve}
      </Button>
      {canSwap && (
        <Button size="sm" variant="ghost" className="px-2.5" onClick={() => act.actions.swap(target)} disabled={!!busy}
          aria-label={fill(a.swapAria, { title: card.title })} data-idea-action="swap">
          {a.swapShort}
        </Button>
      )}
      {canRejectIdea(target, act.automation) && (
        <Button size="sm" variant="ghost" className="px-2.5" onClick={() => void act.actions.reject(target)} loading={busy === 'reject'} disabled={!!busy}
          aria-label={fill(a.rejectAria, { title: card.title })} data-idea-action="reject">
          {a.reject}
        </Button>
      )}
    </div>
  )
}

function BoardCard({ card, lang, dict, act, canSwap }: { card: StrategyCard; lang: Locale; dict: Dict; act: BoardIdeaActions | null; canSwap: boolean }) {
  const s = dict.contentStrategy
  const date = shortDate(card.date, lang)
  const approvedNow = card.column === 'planned' && !!act && act.actions.approvedNow.has(sameTopicKey(card.title))
  const body = (
    <>
      <p className="line-clamp-2 text-copy font-semibold text-ink [overflow-wrap:anywhere]">{card.title}</p>
      {card.keyword && (
        <p className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-pill bg-sunk px-2 py-0.5 text-caption text-muted">
          <KeyRound size={11} className="shrink-0" aria-hidden />
          <span className="truncate">{card.keyword}</span>
        </p>
      )}
      {card.column === 'ideas' && card.reason && (
        <p className="mt-1.5 line-clamp-2 text-caption text-muted [overflow-wrap:anywhere]">{card.reason}</p>
      )}
      {card.origin === 'ranking' && typeof card.position === 'number' && (
        <p className="mt-1.5 text-caption text-muted">{fill(card.position <= 10 ? s.rankingReasonTop : s.rankingReason, { n: card.position })}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted">
        {date && (
          <span className="inline-flex items-center gap-1">
            <CalendarDays size={12} aria-hidden />
            {s.dateKinds[card.dateKind]} · <span className="tabular-nums">{date}</span>
          </span>
        )}
        {card.origin === 'scan' && (
          <span className="inline-flex items-center gap-1 rounded-pill bg-info-soft px-1.5 text-info"><Sparkles size={11} aria-hidden />{s.origins.scan}</span>
        )}
        {card.origin === 'ranking' && (
          <span className="inline-flex items-center gap-1 rounded-pill bg-ok-soft px-1.5 text-ok"><TrendingUp size={11} aria-hidden />{s.origins.ranking}</span>
        )}
        {card.queued && card.column !== 'published' && (
          <span className="rounded-pill bg-warn-soft px-1.5 text-warn">{s.queued}</span>
        )}
        {approvedNow && (
          <span data-approved-now className="inline-flex items-center gap-1 rounded-pill bg-ok-soft px-1.5 font-semibold text-ok"><Check size={11} aria-hidden />{s.ideaActions.approvedNow}</span>
        )}
      </div>
      {card.column === 'ideas' && act && <IdeaButtons card={card} dict={dict} act={act} canSwap={canSwap} />}
    </>
  )
  const frame = 'block rounded-control border border-line bg-surface p-3 transition-colors'
  if (card.articleId) {
    return (
      <Link
        href={`/content/articles/${encodeURIComponent(card.articleId)}`}
        aria-label={`${s.openArticle}: ${card.title}`}
        data-strategy-card={card.key}
        className={cn(frame, 'hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action')}
      >
        {body}
      </Link>
    )
  }
  return <div data-strategy-card={card.key} className={cn(frame, approvedNow && 'border-ok/40')}>{body}</div>
}

function Column({ column, cards, lang, dict, note, act }: { column: StrategyColumn; cards: StrategyCard[]; lang: Locale; dict: Dict; note?: string | null; act: BoardIdeaActions | null }) {
  const s = dict.contentStrategy
  const [open, setOpen] = useState(false)
  const shown = open ? cards : cards.slice(0, COLUMN_PREVIEW)
  const hidden = cards.length - shown.length
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
          <Telescope size={12} aria-hidden />
          {note}
        </p>
      )}
      {cards.length === 0 ? (
        <p className="rounded-control border border-dashed border-line-strong/70 px-3 py-4 text-caption text-muted">{s.columnEmpty[column]}</p>
      ) : (
        <ul className="space-y-2">
          {/* Swap brings the next pending idea in, so it is offered while the column holds more than it shows. */}
          {shown.map((c) => <li key={c.key}><BoardCard card={c} lang={lang} dict={dict} act={act} canSwap={hidden > 0} /></li>)}
        </ul>
      )}
      {(hidden > 0 || open) && cards.length > COLUMN_PREVIEW && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-2 rounded-control px-2 py-1.5 text-caption font-semibold text-action transition-colors hover:bg-action-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
        >
          {open ? s.showLess : fill(s.showMore, { n: hidden })}
        </button>
      )}
    </section>
  )
}

export default function StrategyBoard({ cards, lang, dict, ideasNote = null, act = null }: {
  cards: StrategyCard[]
  lang: Locale
  dict: Dict
  /** One line under the ideas column's header (a project with no scan: the mapping will add more). */
  ideasNote?: string | null
  /** The idea actions; without them the board only shows. */
  act?: BoardIdeaActions | null
}) {
  const s = dict.contentStrategy
  const chips = useMemo(() => monthChips(cards), [cards])
  const [month, setMonth] = useState<string>(ALL_MONTHS)
  // A month that no longer has a card (after an approval moved it) falls back to all.
  const active = chips.some((c) => c.key === month) ? month : ALL_MONTHS
  const visible = useMemo(() => cardsInMonth(cards, active), [cards, active])
  const byColumn = useMemo(() => {
    const m: Record<StrategyColumn, StrategyCard[]> = { ideas: [], planned: [], written: [], published: [] }
    for (const c of visible) m[c.column].push(c)
    return m
  }, [visible])

  return (
    <div>
      <div role="group" aria-label={s.monthsLabel} className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
        {chips.map((c) => {
          const on = c.key === active
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={on}
              onClick={() => setMonth(c.key)}
              className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-pill border px-3 text-caption font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action',
                on ? 'border-action bg-action text-action-ink' : 'border-line bg-surface text-body hover:bg-sunk',
              )}
            >
              {c.key === ALL_MONTHS ? s.allMonths : monthLabel(c.key, lang)}
              <span className={cn('tabular-nums', on ? 'text-action-ink/80' : 'text-muted')}>{c.count}</span>
            </button>
          )
        })}
      </div>

      <div key={active} className="grid animate-pop-in items-start gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STRATEGY_COLUMNS.map((col) => <Column key={col} column={col} cards={byColumn[col]} lang={lang} dict={dict} note={col === 'ideas' ? ideasNote : null} act={act} />)}
      </div>
    </div>
  )
}
