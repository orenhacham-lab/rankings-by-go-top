'use client'

/**
 * The content strategy tab: what will be written, when, and why this one.
 *
 * It merged two screens of the content workspace, "topics" and "automation", into one
 * tab (decision 2 of the per-tab plan), in this order:
 *   row 0  where the plan comes from: the seeding scan's step b4, or, until it is
 *          ready, the topics its stage A found (SeedPlanNotice, and the board's ideas);
 *          and the topics the monthly top-up prepared this month (TopUpNotice)
 *   row 1  the next article, its date, and why it was chosen (NextArticleCard)
 *   row 2  the month board: ideas, planned, written, published (StrategyBoard); its
 *          ideas include the tracked keywords the site already ranks 4 to 20 for
 *          (useRankingIdeas), which need no scan. Ideas are approved, rejected and
 *          swapped right on their cards and on the next-article card, and "+ add a
 *          keyword" adds an approved topic (useIdeaActions); none of it leaves the board.
 *   row 3  the plan in numbers (PlanOverview), its pillars when the topics form them
 *          (TopicClusters), and what happens from here (WhatHappensNext), all counted
 *          from the board's own cards; each card also says why it is worth writing
 *          (TopicFacts, from the research's cached figures: useStrategyInsights)
 *   list   the same cards as rows (StrategyList) with the same actions, and, folded
 *          under "advanced", the two old screens, unchanged, for what only they do:
 *          asking the engine for new ideas ("improve with Pro", filters), the
 *          publishing queue with its cadence (AutomationScreen), and the topics with
 *          their link plans and "add to the queue" (TopicsScreen). A link to one of
 *          their sections (the old screens' redirects, "open the queue") unfolds it.
 *
 * The view is in the url (?view=list), so a refresh, a shared link and the old
 * screens' redirects all land where they meant to. Opening the tab reads three GET
 * routes and nothing else (useStrategyData); the list view mounts only when chosen.
 * `?add=keyword` (the workspace's "new topic") opens the keyword field on the board.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CalendarPlus, ChevronDown, Columns3, List, Plus, RotateCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Segmented from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import SectionHeading from '@/components/ui/SectionHeading'
import EmptyState from '@/components/ui/EmptyState'
import AutomationScreen from '@/components/content/workspace/AutomationScreen'
import TopicsScreen from '@/components/content/workspace/TopicsScreen'
import { useContentWorkspace } from '@/components/content/workspace/ContentWorkspaceProvider'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { buildStrategyBoard, type StrategyCard } from '@/lib/content/strategy/board'
import { cardInsights, planSearches, topicInsight, type TopicInsight } from '@/lib/content/strategy/insights'
import type { Locale } from '@/lib/i18n/locales'
import {
  STRATEGY_ADD_PARAM, STRATEGY_ANCHORS, STRATEGY_VIEW_PARAM, isStrategyAnchor, strategyViewFromParam, wantsAddKeyword,
  type StrategyView,
} from '@/lib/content/strategy/view'
import { ideaTargetFromCard } from '@/lib/content/strategy/ideas'
import { useStrategyData } from './useStrategyData'
import { useRankingIdeas } from './useRankingIdeas'
import { useIdeaActions } from './useIdeaActions'
import NextArticleCard from './NextArticleCard'
import StrategyBoard, { type BoardIdeaActions } from './StrategyBoard'
import AddKeywordForm, { AddKeywordButton } from './AddKeywordForm'
import SeedPlanNotice, { PlanBasis } from './SeedPlanNotice'
import TopUpNotice from './TopUpNotice'
import { useStrategyInsights } from './useStrategyInsights'
import PlanOverview from './PlanOverview'
import TopicClusters from './TopicClusters'
import WhatHappensNext from './WhatHappensNext'
import StrategyList from './StrategyList'

type Dict = ReturnType<typeof getDashboardDictionary>

function ViewSwitch({ view, onChange, dict }: { view: StrategyView; onChange: (v: StrategyView) => void; dict: Dict }) {
  const s = dict.contentStrategy
  return (
    <Segmented<StrategyView>
      ariaLabel={s.viewsLabel}
      value={view}
      onChange={onChange}
      options={[
        { value: 'board', label: s.views.board, icon: Columns3 },
        { value: 'list', label: s.views.list, icon: List },
      ]}
    />
  )
}

/**
 * A plan with nothing in it yet: one empty state with the one way in, instead of four
 * empty columns (or rows) that each say the same thing (final review R28).
 */
function StrategyEmpty({ dict, note, onCreate }: { dict: Dict; note?: string | null; onCreate: () => void }) {
  const s = dict.contentStrategy
  return (
    <Card padding={false} className="motion-safe:animate-pop-in">
      <div data-strategy-empty="">
        <EmptyState
          icon={<CalendarPlus />}
          title={s.emptyPlanTitle}
          body={s.emptyPlanBody}
          action={<Button onClick={onCreate}><Plus aria-hidden="true" className="size-4" /> {s.emptyPlanAction}</Button>}
          secondary={note ?? undefined}
        />
      </div>
    </Card>
  )
}

/** The page's anchor, read without an effect (empty on the server), and followed when it changes. */
function subscribeHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}
const readHash = () => window.location.hash.replace(/^#/, '')
const noHash = () => ''

/**
 * The list view: the board's cards as rows, then, folded under "advanced", the two
 * screens this tab replaced, as they were. They mount only when unfolded, and a link to
 * one of their sections unfolds them.
 */
function StrategyListView({ proFirst, dict, cards, lang, act, insights, empty = null }: {
  proFirst: boolean
  /** The plan has no card yet: its empty state stands where the rows would. */
  empty?: ReactNode
  dict: Dict
  cards: readonly StrategyCard[] | null
  lang: Locale
  act: BoardIdeaActions
  insights: ReadonlyMap<string, TopicInsight> | null
}) {
  const { automationEnabled, scheduleSectionRef } = useContentWorkspace()
  const s = dict.contentStrategy
  const l = dict.strategyInsights.list
  const anchor = useSyncExternalStore(subscribeHash, readHash, noHash)
  const linked = isStrategyAnchor(anchor)
  const [choice, setChoice] = useState<boolean | null>(null)
  const open = choice ?? linked

  // A link to a section of the list (the old screens' redirects, "open the queue")
  // lands on it once the section has rendered.
  useEffect(() => {
    if (!open || !isStrategyAnchor(anchor)) return
    const id = window.setTimeout(() => {
      const el = anchor === STRATEGY_ANCHORS.queue ? scheduleSectionRef.current : document.getElementById(anchor)
      el?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    }, 250)
    return () => window.clearTimeout(id)
  }, [open, anchor, scheduleSectionRef])

  return (
    <div className="space-y-6">
      {empty ?? (cards && <StrategyList cards={cards} lang={lang} dict={dict} act={act} insights={insights} />)}
      <section data-strategy-advanced="" className="rounded-card border border-line bg-surface">
        <h3>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="strategy-advanced"
            onClick={() => setChoice(!open)}
            className="flex w-full items-center justify-between gap-3 rounded-card p-5 text-start transition-colors duration-150 ease-snappy hover:bg-sunk/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 sm:p-6"
          >
            <span className="min-w-0">
              <span className="block text-section font-semibold text-ink">{l.advancedTitle}</span>
              <span className="mt-0.5 block text-caption font-normal text-muted">{l.advancedHint}</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-caption font-semibold text-action">
              <span className="hidden sm:inline">{open ? l.advancedClose : l.advancedOpen}</span>
              <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform duration-150 ease-snappy motion-reduce:transition-none', open && 'rotate-180')} />
            </span>
          </button>
        </h3>
        {open && (
          <div id="strategy-advanced" className="tab-enter border-t border-line p-5 sm:p-6">
            {automationEnabled && (
              <section id={STRATEGY_ANCHORS.ideas} className="scroll-mt-4">
                <SectionHeading title={s.sections.ideas} />
                <AutomationScreen proFirst={proFirst} />
              </section>
            )}
            <section id={STRATEGY_ANCHORS.topics} className="scroll-mt-4">
              <TopicsScreen />
            </section>
          </div>
        )}
      </section>
    </div>
  )
}

export default function ContentStrategyScreen({ proFirst = false }: { proFirst?: boolean }) {
  const {
    language, projectId, toast, topics, data, automationRefresh, automationEnabled,
    load, loadTopics, handleCreateTopic, openPrefilledBrief,
  } = useContentWorkspace()
  const dict = useMemo(() => getDashboardDictionary(language), [language])
  const s = dict.contentStrategy

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const view = strategyViewFromParam(searchParams.get(STRATEGY_VIEW_PARAM))
  const setView = (next: StrategyView) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    if (next === 'list') params.set(STRATEGY_VIEW_PARAM, 'list')
    else params.delete(STRATEGY_VIEW_PARAM)
    const search = params.toString()
    router.replace(`${pathname}${search ? `?${search}` : ''}`, { scroll: false })
  }

  // Whatever the workspace reloads (topics, articles, the queue), the board follows.
  const refreshKey = useMemo(() => ({ topics, data, automationRefresh }), [topics, data, automationRefresh])
  const strategy = useStrategyData(projectId, refreshKey)
  const ranking = useRankingIdeas(projectId)
  const { reload: reloadStrategy } = strategy
  const onChanged = useCallback(() => { reloadStrategy(); void loadTopics() }, [reloadStrategy, loadTopics])
  const actions = useIdeaActions({ projectId, automation: automationEnabled, dict, toast, onChanged })
  const { view: withActions, prune, deferred } = actions
  // A fresh read retires what it already shows.
  useEffect(() => { if (strategy.data) prune(strategy.data) }, [strategy.data, prune])
  const board = useMemo(
    () => (strategy.data ? buildStrategyBoard({ data: withActions(strategy.data), queue: strategy.queue, seed: strategy.seed, ranking, deferred }) : null),
    [strategy.data, strategy.queue, strategy.seed, ranking, withActions, deferred],
  )
  const act: BoardIdeaActions = { actions, automation: automationEnabled }
  const nextIdea = useMemo(() => {
    const card = board?.next?.cardKey ? board.cards.find((c) => c.key === board.next!.cardKey) : undefined
    return card ? ideaTargetFromCard(card) : null
  }, [board])
  // Why each topic: the research's cached figures and the project's audiences, read once.
  const { ctx } = useStrategyInsights(projectId, strategy.seed.audiences)
  const insights = useMemo(() => (board ? cardInsights(board.cards, ctx) : null), [board, ctx])
  const searches = useMemo(() => (board ? planSearches(board.cards, ctx) : null), [board, ctx])
  const nextInsight = useMemo(() => {
    if (!board?.next || !ctx) return null
    const i = topicInsight({ keyword: board.next.keyword, title: board.next.title }, ctx)
    return i.volume !== null || i.audience !== null || i.rivals.length > 0 ? i : null
  }, [board, ctx])

  // "+ add a keyword": opened here, or by the workspace's "new topic" (?add=keyword), which
  // only automation has a route for; without it "new topic" opens the manual brief instead.
  const [adding, setAdding] = useState(false)
  const addAsked = wantsAddKeyword(searchParams.get(STRATEGY_ADD_PARAM))
  // Asked for in the url: open it (while rendering, not in an effect), then drop the parameter.
  if (addAsked && automationEnabled && !adding) setAdding(true)
  useEffect(() => {
    if (!addAsked) return
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.delete(STRATEGY_ADD_PARAM)
    const search = params.toString()
    router.replace(`${pathname}${search ? `?${search}` : ''}`, { scroll: false })
  }, [addAsked, searchParams, pathname, router])
  const addOpen = automationEnabled && view === 'board' && adding
  // A project with no scan: its ideas column says the mapping will add more, when the mapping can be offered.
  const ideasNote = strategy.seed.state === 'none' && strategy.mappingAvailable ? dict.mapping.strategyMore : null
  const createTopic = automationEnabled ? () => { setView('board'); setAdding(true) } : handleCreateTopic
  // Nothing planned at all: one empty state carries the one action (the dark "next
  // article" card would only repeat it, so it waits for the first topic).
  const planEmpty = !!board && board.cards.length === 0 && !board.next
  const emptyState = planEmpty ? <StrategyEmpty dict={dict} note={ideasNote} onCreate={createTopic} /> : null

  return (
    <div className="space-y-6">
      <SeedPlanNotice seed={strategy.seed} dict={dict} />
      <TopUpNotice data={strategy.data} projectId={projectId} dict={dict} />

      {planEmpty ? null : board ? (
        <NextArticleCard
          next={board.next}
          hasArticles={board.hasArticles}
          lang={language}
          dict={dict}
          idea={nextIdea}
          act={act}
          insight={nextInsight}
          onOpenBrief={openPrefilledBrief}
          onCreateTopic={createTopic}
          onGenerated={() => { void load(); void loadTopics() }}
          onError={(text) => toast.error(text)}
        />
      ) : strategy.status === 'error' ? (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-copy text-body">{s.loadError}</p>
          <Button size="sm" variant="secondary" onClick={strategy.reload}><RotateCw className="size-4" aria-hidden="true" />{s.retry}</Button>
        </Card>
      ) : (
        <Card tone="ink" className="p-6 md:p-8" >
          <div role="status" aria-busy="true" aria-label={s.loading} className="space-y-3">
            <Skeleton className="h-3 w-24 rounded-pill opacity-20" />
            <Skeleton className="h-6 w-2/3 rounded-pill opacity-20" />
            <Skeleton className="h-16 w-full opacity-15" />
          </div>
        </Card>
      )}

      <section aria-labelledby="strategy-plan-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="strategy-plan-heading" className="text-section font-semibold text-ink">{s.planHeading}</h2>
            <p className="text-caption text-muted">{s.planSubtitle}</p>
            <PlanBasis seed={strategy.seed} dict={dict} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {automationEnabled && view === 'board' && !!board && !planEmpty && <AddKeywordButton dict={dict} open={addOpen} onOpen={() => setAdding(true)} />}
            <ViewSwitch view={view} onChange={setView} dict={dict} />
          </div>
        </div>

        {addOpen && <AddKeywordForm dict={dict} onAdd={actions.addKeyword} onClose={() => setAdding(false)} projectId={projectId} language={language} />}
        {/* What the last action did, for a screen reader (the toast says it on screen). */}
        <p role="status" aria-live="polite" className="sr-only">{actions.announcement}</p>

        {view === 'list' ? (
          <StrategyListView proFirst={proFirst} dict={dict} cards={board?.cards ?? null} lang={language} act={act} insights={insights} empty={emptyState} />
        ) : planEmpty ? (
          emptyState
        ) : board ? (
          <StrategyBoard cards={board.cards} lang={language} dict={dict} ideasNote={ideasNote} act={act} insights={insights} />
        ) : strategy.status === 'loading' ? (
          <div role="status" aria-busy="true" aria-label={s.loading} className="grid gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-card" />)}
          </div>
        ) : null}
      </section>

      {board && board.cards.length > 0 && (
        <>
          <PlanOverview cards={board.cards} counts={board.counts} searches={searches} lang={language} dict={dict} />
          <TopicClusters cards={board.cards} insights={insights} lang={language} dict={dict} />
          <WhatHappensNext counts={board.counts} next={board.next} lang={language} dict={dict} />
        </>
      )}
    </div>
  )
}
