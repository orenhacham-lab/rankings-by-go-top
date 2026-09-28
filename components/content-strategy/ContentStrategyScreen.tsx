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
 *   row 3  the list view, which IS the two old screens, unchanged, kept for what only
 *          they do: asking the engine for new ideas ("improve with Pro", filters), the
 *          publishing queue with its cadence (AutomationScreen), and the topics with
 *          their link plans and "add to the queue" (TopicsScreen).
 *
 * The view is in the url (?view=list), so a refresh, a shared link and the old
 * screens' redirects all land where they meant to. Opening the tab reads three GET
 * routes and nothing else (useStrategyData); the list view mounts only when chosen.
 * `?add=keyword` (the workspace's "new topic") opens the keyword field on the board.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Columns3, List, RotateCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import SectionHeading from '@/components/ui/SectionHeading'
import AutomationScreen from '@/components/content/workspace/AutomationScreen'
import TopicsScreen from '@/components/content/workspace/TopicsScreen'
import { useContentWorkspace } from '@/components/content/workspace/ContentWorkspaceProvider'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { buildStrategyBoard } from '@/lib/content/strategy/board'
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

/** The list view: the two screens this tab replaced, as they were. */
function StrategyListView({ proFirst, dict }: { proFirst: boolean; dict: Dict }) {
  const { automationEnabled, scheduleSectionRef } = useContentWorkspace()
  const s = dict.contentStrategy

  // A link to a section of the list (the old screens' redirects, "open the queue")
  // lands on it once the list has rendered.
  useEffect(() => {
    const anchor = window.location.hash.replace(/^#/, '')
    if (!isStrategyAnchor(anchor)) return
    const id = window.setTimeout(() => {
      const el = anchor === STRATEGY_ANCHORS.queue ? scheduleSectionRef.current : document.getElementById(anchor)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 250)
    return () => window.clearTimeout(id)
  }, [scheduleSectionRef])

  return (
    <div>
      <p className="mb-4 max-w-3xl text-copy text-muted">{s.listIntro}</p>
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
          <StrategyListView proFirst={proFirst} dict={dict} />
        ) : board ? (
          <StrategyBoard cards={board.cards} lang={language} dict={dict} ideasNote={ideasNote} act={act} />
        ) : strategy.status === 'loading' ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden>
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-40 animate-pulse rounded-card border border-line bg-sunk/60" />)}
          </div>
        ) : null}
      </section>
    </div>
  )
}
