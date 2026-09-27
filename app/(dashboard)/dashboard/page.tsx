'use client'

/**
 * The dashboard of the current project.
 *
 * It used to add up every client and project in the account into one page, with
 * tiles that counted clients and projects and linked to their tabs. A project is
 * a workspace now, picked in the top bar, so the dashboard shows that one site:
 * its keywords, its scans and what moved in its rankings.
 *
 * These are the widgets the page already had, scoped to the project, plus what
 * Search Console adds: clicks from Google and the top pages. Those two are always
 * here; until Search Console is set up they say what they will show, with the one
 * step that is missing. The redesigned dashboard is its own phase of the plan.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileText, KeyRound, ListChecks, Search, Settings2, TrendingDown, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Project } from '@/lib/supabase/types'
import Header from '@/components/layout/Header'
import WorkspaceGate from '@/components/layout/WorkspaceGate'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import StatTile from '@/components/ui/StatTile'
import EmptyState from '@/components/ui/EmptyState'
import { ScanStatusBadge, PositionChange, EngineBadge } from '@/components/ui/StatusBadge'
import { DashboardOnboardingTour } from '@/components/onboarding/DashboardOnboardingTour'
import { useActiveProject } from '@/lib/active-project/ActiveProjectProvider'
import { withDeadline } from '@/lib/active-project/useProjectRow'
import { formatDateTime } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import CompetitorSummary from '@/components/competitors/CompetitorSummary'
import { useProjectCompetitorComparison } from '@/components/competitors/useCompetitorComparison'
import GscClicksTile from '@/components/gsc/GscClicksTile'
import GscTopPages from '@/components/gsc/GscTopPages'

interface LatestScan {
  id: string
  status: string
  completed_targets: number
  total_targets: number
  started_at: string | null
}

interface RankingChange {
  tracking_target_id: string
  keyword: string
  engine_type: string
  position: number
  change_value: number
}

interface ProjectSnapshot {
  keywords: number
  scans: number
  latestScans: LatestScan[]
  improvements: RankingChange[]
  drops: RankingChange[]
}

/** How many ranking changes each list shows. */
const CHANGES_SHOWN = 5

/**
 * One project's numbers. Every query is filtered by the project, and the project
 * itself was validated against the signed-in user's own list before it got here.
 * Any failed or stalled read fails the whole snapshot: a dashboard that shows
 * zero keywords because a query timed out is telling the merchant something false.
 */
async function loadSnapshot(projectId: string): Promise<ProjectSnapshot | null> {
  const supabase = createClient()
  const [targetsRes, scanCountRes, scansRes] = await Promise.all([
    withDeadline(supabase.from('tracking_targets').select('id, is_active').eq('project_id', projectId)),
    withDeadline(supabase.from('scans').select('id', { count: 'exact', head: true }).eq('project_id', projectId)),
    withDeadline(
      supabase
        .from('scans')
        .select('id, status, completed_targets, total_targets, started_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(5)
    ),
  ])
  if (!targetsRes || targetsRes.error || !scanCountRes || scanCountRes.error || !scansRes || scansRes.error) return null

  const targets = (targetsRes.data ?? []) as { id: string; is_active: boolean }[]
  const targetIds = targets.map((t) => t.id)

  let results: (RankingChange & { change_value: number | null })[] = []
  if (targetIds.length > 0) {
    const resultsRes = await withDeadline(
      supabase
        .from('scan_results')
        .select('tracking_target_id, keyword, engine_type, position, change_value, checked_at')
        .in('tracking_target_id', targetIds)
        .not('change_value', 'is', null)
        .order('checked_at', { ascending: false })
        .limit(200)
    )
    if (!resultsRes || resultsRes.error) return null
    results = (resultsRes.data ?? []) as typeof results
  }

  // The newest change of each keyword, split by direction.
  const seen = new Set<string>()
  const improvements: RankingChange[] = []
  const drops: RankingChange[] = []
  for (const r of results) {
    if (seen.has(r.tracking_target_id)) continue
    seen.add(r.tracking_target_id)
    if (r.change_value === null || r.change_value === 0) continue
    const change = { ...r, change_value: r.change_value }
    if (change.change_value > 0) improvements.push(change)
    else drops.push(change)
  }

  return {
    keywords: targets.filter((t) => t.is_active).length,
    scans: scanCountRes.count ?? 0,
    latestScans: (scansRes.data ?? []) as LatestScan[],
    improvements: improvements.sort((a, b) => b.change_value - a.change_value).slice(0, CHANGES_SHOWN),
    drops: drops.sort((a, b) => a.change_value - b.change_value).slice(0, CHANGES_SHOWN),
  }
}

export default function DashboardPage() {
  const { language } = useDashboardLanguage()
  const home = getDashboardDictionary(language).home
  const { projects, isResolved, projectsError } = useActiveProject()

  return (
    <div>
      {/* The tour picks its first step from the project count, so it waits for
          the list; mounted earlier it would read an account with projects as new. */}
      {isResolved && !projectsError && <DashboardOnboardingTour totalProjects={projects.length} />}

      <Header title={home.title} subtitle={home.subtitle} />

      <WorkspaceGate>
        {(project) => <ProjectDashboard key={project.id} project={project} />}
      </WorkspaceGate>
    </div>
  )
}

function ProjectDashboard({ project }: { project: Project }) {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const home = dict.home
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  // Loaded alongside the snapshot but never part of it: a failure here is the
  // card's own state and cannot take the rest of the dashboard down with it.
  const competitorView = useProjectCompetitorComparison(project.id)

  useEffect(() => {
    let cancelled = false
    loadSnapshot(project.id).then(
      (next) => {
        if (cancelled) return
        setSnapshot(next)
        setStatus(next ? 'ready' : 'error')
      },
      () => { if (!cancelled) setStatus('error') }
    )
    return () => { cancelled = true }
  }, [project.id, attempt])

  const retry = () => {
    setStatus('loading')
    setAttempt((n) => n + 1)
  }

  if (status === 'error') {
    return (
      <Card>
        <EmptyState title={home.loadError} action={<Button onClick={retry}>{dict.workspace.retry}</Button>} />
      </Card>
    )
  }

  if (status === 'loading' || !snapshot) {
    return (
      <Card className="py-16 text-center">
        <p className="text-sm text-muted">{home.loading}</p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href="/keywords" className="block rounded-card transition-shadow hover:shadow-card">
          <StatTile
            className="h-full"
            label={home.keywords}
            value={snapshot.keywords}
            source={home.keywordsSource}
            icon={<KeyRound size={16} strokeWidth={2} />}
          />
        </Link>
        <Link href="/scans" className="block rounded-card transition-shadow hover:shadow-card">
          <StatTile
            className="h-full"
            label={home.scansPerformed}
            value={snapshot.scans}
            source={home.scansSource}
            icon={<Search size={16} strokeWidth={2} />}
          />
        </Link>
        <GscClicksTile projectId={project.id} />
      </div>

      <CompetitorSummary view={competitorView} variant="compact" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card padding={false}>
          <div className="flex items-center justify-between gap-3 border-b border-line p-4">
            <h2 className="text-base font-semibold text-ink">{home.latestScans}</h2>
            <Link href="/scans" className="text-sm font-medium text-action hover:underline">{home.viewAll}</Link>
          </div>
          {snapshot.latestScans.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted">{home.noScans}</p>
          ) : (
            <ul className="divide-y divide-line">
              {snapshot.latestScans.map((scan) => (
                <li key={scan.id}>
                  <Link
                    href={`/scans/${encodeURIComponent(scan.id)}/details`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-sunk"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink tabular-nums">
                        {scan.started_at ? formatDateTime(scan.started_at) : home.notStarted}
                      </p>
                      <p className="mt-0.5 text-xs text-muted tabular-nums">
                        {scan.completed_targets}/{scan.total_targets} {home.targets}
                      </p>
                    </div>
                    <ScanStatusBadge status={scan.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-base font-semibold text-ink">{home.quickLinks}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <QuickLink href="/keyword-research" icon={KeyRound} label={dict.sidebar.keywordResearch} sub={home.researchSub} />
            <QuickLink href="/keywords" icon={ListChecks} label={dict.sidebar.keywords} sub={home.keywordsSub} />
            <QuickLink href="/reports" icon={FileText} label={dict.sidebar.reports} sub={home.excelAndPdf} />
            <QuickLink href="/settings" icon={Settings2} label={dict.sidebar.projectSettings} sub={home.settingsSub} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChangeList
          title={home.majorImprovements}
          icon={<TrendingUp size={18} strokeWidth={2} className="text-ok" />}
          items={snapshot.improvements}
          empty={home.noRecentImprovements}
        />
        <ChangeList
          title={home.majorDrops}
          icon={<TrendingDown size={18} strokeWidth={2} className="text-bad" />}
          items={snapshot.drops}
          empty={home.noRecentDrops}
        />
      </div>

      <GscTopPages projectId={project.id} />
    </div>
  )
}

/** A list of keywords whose ranking moved, each opening that keyword's history. */
function ChangeList({ title, icon, items, empty }: {
  title: string
  icon: React.ReactNode
  items: RankingChange[]
  empty: string
}) {
  return (
    <Card padding={false}>
      <div className="flex items-center gap-2 border-b border-line p-4">
        {icon}
        <h2 className="text-base font-semibold text-ink">{title}</h2>
      </div>
      {items.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item) => (
            <li key={item.tracking_target_id}>
              <Link
                href={`/keywords/${encodeURIComponent(item.tracking_target_id)}/history`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-sunk"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{item.keyword}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                    <span className="tabular-nums">#{item.position}</span>
                    <EngineBadge engine={item.engine_type} />
                  </div>
                </div>
                <PositionChange change={item.change_value} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function QuickLink({ href, icon: Icon, label, sub }: {
  href: string
  icon: React.ComponentType<{ size: number; strokeWidth: number }>
  label: string
  sub: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-control border border-line p-3 transition-colors hover:bg-sunk"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-sunk text-muted">
        <Icon size={20} strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-muted">{sub}</span>
      </span>
    </Link>
  )
}
