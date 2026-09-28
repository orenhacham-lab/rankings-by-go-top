'use client'

/**
 * The dashboard of the current project (plan §2): what changed since the last
 * visit, and the next step.
 *
 * It opens with one dark card (one big number, one sentence, one line of news,
 * one next step), then a row of figures that each name their source, then the
 * widgets, in the order a merchant needs them: finishing the setup, what holds
 * the site back, what just happened, where the keywords rank, what moved, the
 * competitors, the content, AI visibility and the account.
 *
 * WHERE EACH NUMBER COMES FROM, and why opening this screen calls no one:
 *   - the keywords and their latest checks: read here, through the merchant's own
 *     RLS-scoped client, filtered to this project (the rank scanner wrote them);
 *   - articles, the publishing board, AI visibility, setup facts, activity and the
 *     account: GET /api/projects/[id]/dashboard, which checks the owner and reads
 *     only what is stored;
 *   - the seeding scan: GET /api/projects/[id]/seed, asked again only while it runs;
 *   - competitors: the keywords tab's own comparison (W10), from stored positions;
 *   - Search Console: its two widgets, which read their own stored summary.
 * No read here runs a search, a keyword-volume lookup or a model. Each widget
 * owns its failure: one unreadable source is one widget's retry, never a blank page.
 *
 * On a phone the two columns become one, and the widgets are ordered by what a
 * merchant needs first (the `order-*` classes); on a wide screen the main column
 * holds the charts and lists and the side column the short status cards.
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FileText, KeyRound, Send, Target } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Project } from '@/lib/supabase/types'
import Header from '@/components/layout/Header'
import WorkspaceGate from '@/components/layout/WorkspaceGate'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import StatTile from '@/components/ui/StatTile'
import EmptyState from '@/components/ui/EmptyState'
import { DashboardOnboardingTour } from '@/components/onboarding/DashboardOnboardingTour'
import { useActiveProject } from '@/lib/active-project/ActiveProjectProvider'
import { withDeadline } from '@/lib/active-project/useProjectRow'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { useProjectCompetitorComparison } from '@/components/competitors/useCompetitorComparison'
import GscClicksTile from '@/components/gsc/GscClicksTile'
import GscTopPages from '@/components/gsc/GscTopPages'
import { formatCount } from '@/components/gsc/format'
import { strategyHref } from '@/lib/content/strategy/view'
import { buildRankings, type DashboardResult, type DashboardTarget, type RankingsView } from '@/lib/dashboard/rankings'
import { holdingBack, seedFeed } from '@/lib/dashboard/seed'
import { mergeFeed, relativeTime } from '@/lib/dashboard/activity'
import { competitorRows } from '@/lib/dashboard/competitors'
import type { DashboardOverview } from '@/lib/dashboard/overview'
import { useDashboardOverview, useSeedState } from '@/components/dashboard/useDashboardData'
import Shortcuts, { contentEnabled } from '@/components/dashboard/Shortcuts'
import HeroCard, { type HeroNews, type NextStep } from '@/components/dashboard/HeroCard'
import DashboardSetup from '@/components/dashboard/DashboardSetup'
import HoldingBack from '@/components/dashboard/HoldingBack'
import RecentActivity, { type ActivityModel } from '@/components/dashboard/RecentActivity'
import RankDistribution from '@/components/dashboard/RankDistribution'
import RankingChanges from '@/components/dashboard/RankingChanges'
import CompetitorsWidget, { type CompetitorsModel } from '@/components/dashboard/CompetitorsWidget'
import ContentOpportunities from '@/components/dashboard/ContentOpportunities'
import { PublishingBoard, RecentArticles } from '@/components/dashboard/ContentWidgets'
import AiVisibilityBrief from '@/components/dashboard/AiVisibilityBrief'
import AccountStatus from '@/components/dashboard/AccountStatus'
import MonthlyReportTeaser from '@/components/reports/monthly/MonthlyReportTeaser'

/** A PostgREST page; far more than one scan of any project's keywords. */
const RESULTS_READ = 1000
/** An article is "news" for the opening card for this long. */
const NEWS_WINDOW_MS = 7 * 24 * 3600 * 1000
/** Relative times ("3 minutes ago") are refreshed this often. */
const CLOCK_TICK_MS = 30_000

/**
 * The project's keywords and their checks. Every read is filtered by the project,
 * and the project was validated against the signed-in user's own list before it
 * got here. A failed or stalled read is null: a dashboard that says zero keywords
 * because a query timed out tells the merchant something false.
 */
async function loadRankings(projectId: string): Promise<RankingsView | null> {
  const supabase = createClient()
  const targetsRes = await withDeadline(
    supabase
      .from('tracking_targets')
      .select('id, keyword, is_active, engine_type, avg_monthly_searches')
      .eq('project_id', projectId)
  )
  if (!targetsRes || targetsRes.error) return null
  const targets = (targetsRes.data ?? []) as DashboardTarget[]
  const targetIds = targets.map((t) => t.id)

  let results: DashboardResult[] = []
  if (targetIds.length > 0) {
    const resultsRes = await withDeadline(
      supabase
        .from('scan_results')
        .select('tracking_target_id, keyword, engine_type, position, found, change_value, checked_at')
        .in('tracking_target_id', targetIds)
        .order('checked_at', { ascending: false })
        .limit(RESULTS_READ)
    )
    if (!resultsRes || resultsRes.error) return null
    results = (resultsRes.data ?? []) as DashboardResult[]
  }
  return buildRankings(targets, results)
}

export default function DashboardPage() {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const home = dict.home
  const { projects, isResolved, projectsError } = useActiveProject()

  return (
    <div>
      {/* The tour picks its first step from the project count, so it waits for
          the list; mounted earlier it would read an account with projects as new. */}
      {isResolved && !projectsError && <DashboardOnboardingTour totalProjects={projects.length} />}

      <Header title={home.title} subtitle={home.subtitle} actions={<Shortcuts t={dict.dashboardHome} />} />

      <WorkspaceGate>
        {(project) => <ProjectDashboard key={project.id} project={project} />}
      </WorkspaceGate>
    </div>
  )
}

/** The opening card's next step: the first thing missing, else writing an article. */
function nextStep(input: {
  t: ReturnType<typeof getDashboardDictionary>['dashboardHome']
  projectId: string
  rankings: RankingsView
  overview: DashboardOverview | null
  content: boolean
}): NextStep | null {
  const { t, rankings, overview, content } = input
  if (rankings.tracked === 0) return { href: '/keyword-research', label: t.actions.addKeywords, commit: false, note: null }
  const articles = overview?.articles
  if (content && articles?.state === 'ready' && articles.data.total === 0) {
    return { href: strategyHref('board'), label: t.actions.writeFirstArticle, commit: true, note: t.actions.articleQuota }
  }
  // No "connect the site" here (UX review P1-16): it had nothing to do with the
  // number above it, and the setup checklist beside the card already offers it.
  if (content && articles?.state === 'ready') {
    return { href: strategyHref('board'), label: t.actions.writeArticle, commit: true, note: t.actions.articleQuota }
  }
  return null
}

function ProjectDashboard({ project }: { project: Project }) {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const home = dict.home
  const t = dict.dashboardHome
  // The site icon its scan found, for the hero; the switcher's list carries it too.
  const { projects } = useActiveProject()

  const [rankings, setRankings] = useState<RankingsView | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [now, setNow] = useState(() => new Date())
  // On a phone: the first five cards, and the rest behind one button (P1-16).
  const [allCards, setAllCards] = useState(false)
  const fold = allCards ? '' : 'max-xl:hidden'
  // Read alongside the keywords but never part of them: each is its own widgets' state.
  const { overview, reload } = useDashboardOverview(project.id)
  const seed = useSeedState(project.id)
  const competitorView = useProjectCompetitorComparison(project.id)

  useEffect(() => {
    let cancelled = false
    loadRankings(project.id).then(
      (next) => {
        if (cancelled) return
        setRankings(next)
        setStatus(next ? 'ready' : 'error')
      },
      () => { if (!cancelled) setStatus('error') }
    )
    return () => { cancelled = true }
  }, [project.id, attempt])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), CLOCK_TICK_MS)
    return () => clearInterval(timer)
  }, [])

  const data = overview.status === 'ready' ? overview.data : null
  /** A section of the dashboard route: null while it loads, an error for every widget when the route failed. */
  const sectionOf = <K extends 'articles' | 'board' | 'ai' | 'setup' | 'account'>(key: K): DashboardOverview[K] | null =>
    data ? data[key] : overview.status === 'error' ? ({ state: 'error' } as DashboardOverview[K]) : null
  const content = contentEnabled()
  const showContent = content && data?.articles.state !== 'disabled'
  const showAi = process.env.NEXT_PUBLIC_ENABLE_AI_VISIBILITY === 'true' && data?.ai.state !== 'disabled'
  const settingsHref = `/settings?projectId=${encodeURIComponent(project.id)}`

  const activity = useMemo<ActivityModel>(() => {
    if (overview.status === 'loading') return { state: 'loading' }
    if (overview.status === 'error' || overview.data.activity.state !== 'ready') return { state: 'error', retry: reload }
    const feed = seed.kind === 'run' ? seedFeed(seed.run) : { lines: [], pending: 0 }
    return { state: 'ready', items: mergeFeed(overview.data.activity.data, feed.lines), pending: feed.pending }
  }, [overview, seed, reload])

  const competitors = useMemo<CompetitorsModel>(() => {
    switch (competitorView.status) {
      case 'loading': return { state: 'loading' }
      case 'error': return { state: 'error', retry: competitorView.retry }
      case 'ready': return { state: 'ready', rows: competitorRows(competitorView.competitors, competitorView.comparison) }
      case 'no_competitors': {
        const found = seed.kind === 'run' && seed.run.summary
          ? seed.run.summary.competitors.filter((c) => c.validated).map((c) => c.domain).slice(0, 5)
          : []
        return found.length ? { state: 'scan_only', domains: found } : { state: 'empty' }
      }
    }
  }, [competitorView, seed])

  if (status === 'error') {
    return (
      <Card>
        <EmptyState title={home.loadError} action={<Button onClick={() => { setStatus('loading'); setAttempt((n) => n + 1) }}>{dict.workspace.retry}</Button>} />
      </Card>
    )
  }

  if (status === 'loading' || !rankings) {
    return (
      <div aria-busy="true" className="space-y-5">
        <div className="h-44 animate-pulse rounded-card bg-contrast/90 motion-reduce:animate-none" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-card border border-line bg-surface motion-reduce:animate-none" />)}
        </div>
        <p className="sr-only">{home.loading}</p>
      </div>
    )
  }

  const articles = data?.articles.state === 'ready' ? data.articles.data : null
  const latestArticle = articles?.latest && now.getTime() - Date.parse(articles.latest.at) < NEWS_WINDOW_MS ? articles.latest : null
  const news: HeroNews = latestArticle
    ? { kind: 'article', title: latestArticle.title }
    : rankings.biggestMove
      ? { kind: 'move', keyword: rankings.biggestMove.keyword, change: rankings.biggestMove.change, position: rankings.biggestMove.position }
      : null
  const next = nextStep({ t, projectId: project.id, rankings, overview: data, content: showContent })
  const heroHasFirstArticle = next?.label === t.actions.writeFirstArticle
  const hold = seed.kind === 'run' ? holdingBack(seed.run, language) : null
  const tile = t.tiles
  const pending = <span aria-hidden="true" className="inline-block h-7 w-12 animate-pulse rounded-control bg-sunk align-middle motion-reduce:animate-none" />

  return (
    <div className="space-y-5">
      <HeroCard
        t={t}
        language={language}
        domain={project.target_domain}
        siteIcon={(seed.kind === 'run' ? seed.run.summary?.siteIcon : null) ?? projects.find((p) => p.id === project.id)?.site_icon}
        rankings={rankings}
        news={news}
        seedPhase={seed.kind === 'run' ? seed.phase : null}
        next={next}
      />

      {/* One equal column per tile from sm up; the clicks tile renders nothing when
          Search Console is off, and the row closes up. On a phone, two per row. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-flow-col sm:auto-cols-fr max-sm:[&>*:last-child:nth-child(odd)]:col-span-2">
        <Link href="/keywords" className="block rounded-card transition-shadow hover:shadow-card">
          <StatTile className="h-full" label={tile.keywords} value={formatCount(rankings.tracked, language)} source={tile.keywordsSource}
            icon={<KeyRound size={16} strokeWidth={2} />} />
        </Link>
        <StatTile
          className="h-full"
          label={tile.avgPosition}
          value={rankings.avgPosition ?? ''}
          empty={rankings.avgPosition === null ? tile.noChecks : undefined}
          delta={rankings.avgChange !== null && rankings.avgChange !== 0
            ? { value: String(Math.abs(rankings.avgChange)), direction: rankings.avgChange > 0 ? 'up' : 'down' }
            : undefined}
          source={tile.avgPositionSource}
          icon={<Target size={16} strokeWidth={2} />}
        />
        {showContent && (
          <StatTile
            className="h-full"
            label={tile.articlesLive}
            value={articles ? formatCount(articles.live, language) : pending}
            empty={data?.articles.state === 'error' ? tile.unavailable : articles && articles.live === 0 ? tile.noArticles : undefined}
            source={tile.articlesLiveSource}
            icon={<FileText size={16} strokeWidth={2} />}
          />
        )}
        {showContent && (
          <StatTile
            className="h-full"
            label={tile.publishedMonth}
            value={articles ? formatCount(articles.publishedThisMonth, language) : pending}
            empty={data?.articles.state === 'error' ? tile.unavailable : undefined}
            delta={articles && articles.publishedThisMonth !== articles.publishedLastMonth
              ? {
                  value: String(Math.abs(articles.publishedThisMonth - articles.publishedLastMonth)),
                  direction: articles.publishedThisMonth > articles.publishedLastMonth ? 'up' : 'down',
                }
              : undefined}
            source={tile.publishedMonthSource}
            icon={<Send size={16} strokeWidth={2} />}
          />
        )}
        <GscClicksTile projectId={project.id} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        {/* Main column: the charts and the lists. */}
        <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-5">
          {hold && (
            <div className="order-2 min-w-0">
              <HoldingBack
                t={t}
                model={hold}
                scannedLabel={hold.state === 'ready' && hold.scannedAt ? t.holdingBack.scannedAt(relativeTime(hold.scannedAt, now, language)) : null}
                settingsHref={settingsHref}
              />
            </div>
          )}
          <div className="order-4 min-w-0">
            <RankDistribution t={t} rankings={rankings} language={language} />
          </div>
          <div className="order-5 grid min-w-0 gap-5 md:grid-cols-2">
            <RankingChanges t={t} direction="up" title={home.majorImprovements} moves={rankings.improvements} />
            <RankingChanges t={t} direction="down" title={home.majorDrops} moves={rankings.drops} />
          </div>
          <div className={`order-7 min-w-0 ${fold}`}>
            <ContentOpportunities t={t} language={language} projectId={project.id} items={rankings.pageTwo} canCreateTopics={showContent} />
          </div>
          {showContent && (
            <div className={`order-8 grid min-w-0 gap-5 md:grid-cols-2 ${fold}`}>
              <PublishingBoard t={t} language={language} section={sectionOf('board')} retry={reload} />
              <RecentArticles t={t} language={language} section={sectionOf('articles')} retry={reload}
                firstArticleHref={heroHasFirstArticle ? null : strategyHref('board')} />
            </div>
          )}
          <div className={`order-11 min-w-0 ${fold} empty:hidden`}>
            <GscTopPages projectId={project.id} />
          </div>
        </div>

        {/* Side column: the short status cards. */}
        <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-5">
          <div className="order-1 min-w-0 empty:hidden">
            <DashboardSetup t={t} projectId={project.id} facts={sectionOf('setup')}
              hasKeywords={rankings.tracked > 0} />
          </div>
          <div className="order-3 min-w-0">
            <RecentActivity t={t} model={activity} now={now} language={language} emptyHref="/keyword-research" />
          </div>
          <div className={`order-6 min-w-0 ${fold}`}>
            <CompetitorsWidget t={t} model={competitors} manageHref={competitorView.manageHref ?? `${settingsHref}#competitors`} />
          </div>
          {/* The latest automatic monthly report, linking to it on the Reports screen. */}
          <div className={`order-9 min-w-0 ${fold} empty:hidden`}>
            <MonthlyReportTeaser projectId={project.id} language={language} />
          </div>
          {showAi && (
            <div className={`order-10 min-w-0 ${fold}`}>
              <AiVisibilityBrief t={t} language={language} section={sectionOf('ai')} retry={reload} now={now} />
            </div>
          )}
          <div className={`order-12 min-w-0 ${fold}`}>
            <AccountStatus t={t} section={sectionOf('account')} retry={reload} />
          </div>
        </div>

        {/* Phone only: the fold after the fifth card (P1-16), and back. */}
        <div className={`${allCards ? 'order-last' : 'order-5'} flex justify-center xl:hidden`}>
          <Button type="button" variant="secondary" aria-expanded={allCards} data-dashboard-fold onClick={() => setAllCards((v) => !v)}>
            {allCards ? t.fewerCards : t.moreCards}
          </Button>
        </div>
      </div>
    </div>
  )
}
