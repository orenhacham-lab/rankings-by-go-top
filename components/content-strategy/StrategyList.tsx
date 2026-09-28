'use client'

/**
 * The content strategy tab's list view: the same cards as the board
 * (buildStrategyBoard), one row each, grouped by stage, with the same actions. An idea
 * is approved, rejected (and, while its stage shows fewer than it holds, swapped) on
 * its row, exactly as on its board card (IdeaButtons, useIdeaActions); a written or
 * published article opens. Each row says when (the card's own date and what it means)
 * and why (TopicFacts, from the research). Nothing here reads or writes on its own.
 */
import { useState } from 'react'
import Link from 'next/link'
import { ArrowUpLeft, ArrowUpRight, CalendarDays, KeyRound, Sparkles, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCount } from '@/components/gsc/format'
import { STRATEGY_COLUMNS, type StrategyCard, type StrategyColumn } from '@/lib/content/strategy/board'
import type { TopicInsight } from '@/lib/content/strategy/insights'
import type { Locale } from '@/lib/i18n/locales'
import type { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import TopicFacts from './TopicFacts'
import { ACCENT, IdeaButtons, type BoardIdeaActions } from './StrategyBoard'
import { fill, shortDate } from './format'

type Dict = ReturnType<typeof getDashboardDictionary>

/** Rows a stage shows before "N more". */
export const LIST_PREVIEW = 10

const ROW_GRID = 'md:grid md:grid-cols-[minmax(0,1fr)_10rem_minmax(0,15rem)] md:items-start md:gap-4'

function Row({ card, lang, dict, act, canSwap, insight }: {
  card: StrategyCard; lang: Locale; dict: Dict; act: BoardIdeaActions | null; canSwap: boolean; insight?: TopicInsight
}) {
  const s = dict.contentStrategy
  const date = shortDate(card.date, lang)
  const Arrow = lang === 'he' ? ArrowUpLeft : ArrowUpRight
  return (
    <li data-strategy-row={card.key} className={cn('px-4 py-3 transition-colors hover:bg-sunk/50', ROW_GRID)}>
      <div className="min-w-0">
        <p className="text-copy font-semibold text-ink [overflow-wrap:anywhere]">{card.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {card.keyword && (
            <span className="inline-flex max-w-full items-center gap-1 rounded-pill bg-sunk px-2 py-0.5 text-caption text-muted">
              <KeyRound size={11} className="shrink-0" aria-hidden />
              <span className="truncate">{card.keyword}</span>
            </span>
          )}
          {card.origin === 'scan' && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-info-soft px-1.5 text-caption text-info"><Sparkles size={11} aria-hidden />{s.origins.scan}</span>
          )}
          {card.origin === 'ranking' && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-ok-soft px-1.5 text-caption text-ok"><TrendingUp size={11} aria-hidden />{s.origins.ranking}</span>
          )}
        </div>
        {insight && <TopicFacts insight={insight} lang={lang} dict={dict} className="mt-2" />}
        {card.column === 'ideas' && card.reason && <p className="mt-1.5 line-clamp-2 text-caption text-muted [overflow-wrap:anywhere]">{card.reason}</p>}
        {card.origin === 'ranking' && typeof card.position === 'number' && (
          <p className="mt-1.5 text-caption text-muted">{fill(card.position <= 10 ? s.rankingReasonTop : s.rankingReason, { n: card.position })}</p>
        )}
      </div>
      <div className="mt-2 text-caption text-muted md:mt-0.5">
        {date ? (
          <span className="inline-flex items-center gap-1">
            <CalendarDays size={12} aria-hidden />
            {s.dateKinds[card.dateKind]} · <span className="tabular-nums">{date}</span>
          </span>
        ) : null}
        {card.queued && card.column !== 'published' && <span className="ms-1 rounded-pill bg-warn-soft px-1.5 text-warn">{s.queued}</span>}
      </div>
      <div className="mt-2 md:mt-0 md:justify-self-end">
        {card.column === 'ideas' && act ? (
          <IdeaButtons card={card} dict={dict} act={act} canSwap={canSwap} inline />
        ) : card.articleId ? (
          <Link
            href={`/content/articles/${encodeURIComponent(card.articleId)}`}
            aria-label={`${s.openArticle}: ${card.title}`}
            className="inline-flex h-8 items-center gap-1 rounded-control border border-line px-3 text-caption font-semibold text-action transition-colors hover:bg-action-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
          >
            {s.openArticle}<Arrow size={13} aria-hidden />
          </Link>
        ) : null}
      </div>
    </li>
  )
}

function Stage({ column, cards, lang, dict, act, insights }: {
  column: StrategyColumn; cards: StrategyCard[]; lang: Locale; dict: Dict; act: BoardIdeaActions | null; insights: ReadonlyMap<string, TopicInsight> | null
}) {
  const s = dict.contentStrategy
  const l = dict.strategyInsights.list
  const [open, setOpen] = useState(false)
  const shown = open ? cards : cards.slice(0, LIST_PREVIEW)
  const hidden = cards.length - shown.length
  return (
    <section aria-labelledby={`strategy-list-${column}`} data-strategy-stage={column} className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <header className="flex items-center justify-between gap-2 border-b border-line bg-sunk/60 px-4 py-2.5">
        <h3 id={`strategy-list-${column}`} className="inline-flex items-center gap-2 text-copy font-semibold text-ink">
          <span className={cn('size-2 rounded-pill', ACCENT[column].dot)} aria-hidden />
          {s.columns[column]}
        </h3>
        <span className={cn('min-w-6 rounded-pill px-2 text-center text-caption font-semibold tabular-nums', ACCENT[column].count)}>{formatCount(cards.length, lang)}</span>
      </header>
      {cards.length === 0 ? (
        <p className="px-4 py-3 text-caption text-muted">{l.empty}</p>
      ) : (
        <>
          <div aria-hidden className={cn('hidden border-b border-line px-4 py-1.5 text-overline font-semibold uppercase text-muted', ROW_GRID)}>
            <span>{l.topic}</span><span>{l.date}</span><span className="md:justify-self-end">{l.actions}</span>
          </div>
          <ul className="divide-y divide-line">
            {shown.map((c) => <Row key={c.key} card={c} lang={lang} dict={dict} act={act} canSwap={hidden > 0} insight={insights?.get(c.key)} />)}
          </ul>
          {cards.length > LIST_PREVIEW && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="w-full border-t border-line px-4 py-2 text-caption font-semibold text-action transition-colors hover:bg-action-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action"
            >
              {open ? s.showLess : fill(s.showMore, { n: hidden })}
            </button>
          )}
        </>
      )}
    </section>
  )
}

export default function StrategyList({ cards, lang, dict, act = null, insights = null }: {
  cards: readonly StrategyCard[]
  lang: Locale
  dict: Dict
  act?: BoardIdeaActions | null
  insights?: ReadonlyMap<string, TopicInsight> | null
}) {
  const by: Record<StrategyColumn, StrategyCard[]> = { ideas: [], planned: [], written: [], published: [] }
  for (const c of cards) by[c.column].push(c)
  return (
    <div data-strategy-list="" className="tab-enter space-y-4">
      {STRATEGY_COLUMNS.map((col) => <Stage key={col} column={col} cards={by[col]} lang={lang} dict={dict} act={act} insights={insights} />)}
    </div>
  )
}
