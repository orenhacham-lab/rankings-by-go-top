'use client'

/**
 * The content strategy tab: what will be written, when, and why this one.
 *
 * It merged two screens of the content workspace, "topics" and "automation", into one
 * tab (decision 2 of the per-tab plan), in this order:
 *   row 0  where the plan comes from: the seeding scan's step b4, or, until it is
 *          ready, the topics its stage A found (SeedPlanNotice, and the board's ideas)
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

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown, Columns3, List, RotateCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import SectionHeading from '@/components/ui/SectionHeading'
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
import { useStrategyInsights } from './useStrategyInsights'
import PlanOverview from './PlanOverview'
import TopicClusters from './TopicClusters'
import WhatHappensNext from './WhatHappensNext'
import StrategyList from './StrategyList'

type Dict = ReturnType<typeof getDashboardDictionary>

function ViewSwitch({ view, onChange, dict }: { view: StrategyView; onChange: (v: StrategyView) => void; dict: Dict }) {
  const s = dict.contentStrategy
  const options: { key: StrategyView; label: string; Icon: typeof List }[] = [
    { key: 'board', label: s.views.board, Icon: Columns3 },
    { key: 'list', label: s.views.list, Icon: List },
  ]
  return (
    <div role="group" aria-label={s.viewsLabel} className="inline-flex rounded-control border border-line bg-sunk p-0.5">
      {options.map(({ key, label, Icon }) => {
        const on = key === view
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(key)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-[0.375rem] px-3 text-caption font-semibold transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action',
              on ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
            )}
          >
            <Icon size={14} aria-hidden /> {label}
          </button>
        )
      })}
    </div>
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
function StrategyListView({ proFirst, dict, cards, lang, act, insights }: {
  proFirst: boolean
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
      {cards && <StrategyList cards={cards} lang={lang} dict={dict} act={act} insights={insights} />}
      <section data-strategy-advanced="" className="rounded-card border border-line bg-surface">
        <h3>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="strategy-advanced"
            onClick={() => setChoice(!open)}
            className="flex w-full items-center justify-between gap-3 rounded-card p-4 text-start transition-colors hover:bg-sunk/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
          >
            <span className="min-w-0">
              <span className="block text-copy font-semibold text-ink">{l.advancedTitle}</span>
              <span className="mt-0.5 block text-caption font-normal text-muted">{l.advancedHint}</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-caption font-semibold text-action">
              <span className="hidden sm:inline">{open ? l.advancedClose : l.advancedOpen}</span>
              <ChevronDown size={16} aria-hidden className={cn('transition-transform duration-200 ease-snappy motion-reduce:transition-none', open && 'rotate-180')} />
            </span>
          </button>
        </h3>
        {open && (
          <div id="strategy-advanced" className="tab-enter border-t border-line p-4">
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

  return (
    <div className="space-y-6">
      <SeedPlanNotice seed={strategy.seed} dict={dict} />

      {board ? (
        <NextArticleCard
          next={board.next}
          hasArticles={board.hasArticles}
          lang={language}
          dict={dict}
          idea={nextIdea}
          act={act}
          insight={nextInsight}
          onOpenBrief={openPrefilledBrief}
          onCreateTopic={automationEnabled ? () => { setView('board'); setAdding(true) } : handleCreateTopic}
          onGenerated={() => { void load(); void loadTopics() }}
          onError={(text) => toast.error(text)}
        />
      ) : strategy.status === 'error' ? (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-copy text-body">{s.loadError}</p>
          <Button size="sm" variant="secondary" onClick={strategy.reload}><RotateCw size={14} aria-hidden /> {s.retry}</Button>
        </Card>
      ) : (
        <Card tone="ink" className="p-6 md:p-8" >
          <div role="status" aria-label={s.loading} className="animate-pulse space-y-3">
            <div className="h-3 w-24 rounded-pill bg-white/15" />
            <div className="h-6 w-2/3 rounded-pill bg-white/15" />
            <div className="h-16 w-full rounded-control bg-white/10" />
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
            {automationEnabled && view === 'board' && <AddKeywordButton dict={dict} open={addOpen} onOpen={() => setAdding(true)} />}
            <ViewSwitch view={view} onChange={setView} dict={dict} />
          </div>
        </div>

        {addOpen && <AddKeywordForm dict={dict} onAdd={actions.addKeyword} onClose={() => setAdding(false)} />}
        {/* What the last action did, for a screen reader (the toast says it on screen). */}
        <p role="status" aria-live="polite" className="sr-only">{actions.announcement}</p>

        {view === 'list' ? (
          <StrategyListView proFirst={proFirst} dict={dict} cards={board?.cards ?? null} lang={language} act={act} insights={insights} />
        ) : board ? (
          <StrategyBoard cards={board.cards} lang={language} dict={dict} ideasNote={ideasNote} act={act} insights={insights} />
        ) : strategy.status === 'loading' ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden>
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-40 animate-pulse rounded-card border border-line bg-sunk/60" />)}
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
