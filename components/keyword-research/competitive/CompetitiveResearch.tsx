'use client'

/**
 * The research tab's competitive section: where the site stands against its
 * competitors, which page answers each keyword, and the rankings it already has.
 *
 * One section, mounted once by the research page. Its reads are its own
 * (/api/keyword-research/competitive, and Search Console's shared status), both
 * read-only: opening the tab spends no check. Until both answers are in it is a
 * skeleton, so it never flashes "no competitors" or "connect Search Console" at a
 * merchant who has both (competitive-view.ts).
 *
 * Every figure carries one label of its source (SourceTag), and the legend at the
 * top says once what each source means.
 */
import { useCallback, useState } from 'react'
import { Target } from 'lucide-react'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { useGscStatus } from '@/components/gsc/gsc-data'
import { Card } from '@/components/ui/Card'
import Notice from '@/components/ui/Notice'
import { Skeleton, SkeletonRegion } from '@/components/ui/Skeleton'
import { ToastHost, useToasts } from '@/components/ui/Toast'
import type { RankingRow } from '@/lib/keyword-research/competitive'
import { bareHost } from '@/components/keyword-research/landscape'
import CompetitorStanding from './CompetitorStanding'
import ExistingRankings from './ExistingRankings'
import KeywordMapping from './KeywordMapping'
import SourceTag from './SourceTag'
import { competitiveScreen } from './competitive-view'
import { useCompetitive } from './useCompetitive'

export const COMPETITIVE_ID = 'research-competitive'
const MANAGE_COMPETITORS_HREF = '/ai-visibility?tab=competitors'

function LoadingBody({ label }: { label: string }) {
  return (
    <SkeletonRegion label={label} className="block space-y-6 p-4 sm:p-6">
      <Skeleton className="h-3 w-full rounded-pill" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-inset" />)}
      </div>
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-56 rounded-card" />
    </SkeletonRegion>
  )
}

export default function CompetitiveResearch({ projectId, siteIcon, suggested, onTracked }: {
  projectId: string
  siteIcon: string | null
  /** Competitor domains the seeding scan saw on Google (validated), offered when none is tracked. */
  suggested: readonly string[]
  /** A keyword was added to the tracked set (the page re-reads its own list). */
  onTracked?: () => void
}) {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language).researchCompetitive
  const { view, reload } = useCompetitive(projectId)
  const gsc = useGscStatus(projectId)
  const screen = competitiveScreen(view, gsc.view)
  const toast = useToasts()
  const [tracking, setTracking] = useState<Set<string>>(new Set())
  const [justTracked, setJustTracked] = useState<Set<string>>(new Set())
  const [addingCompetitor, setAddingCompetitor] = useState<string | null>(null)

  const track = useCallback(async (row: RankingRow) => {
    if (tracking.has(row.key)) return
    setTracking((s) => new Set(s).add(row.key))
    try {
      const res = await fetch('/api/keyword-research/add-to-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, engineType: 'google_search', language, keywords: [{ keyword: row.keyword }] }),
      })
      const body = await res.json().catch(() => null) as { success?: boolean; added?: number } | null
      if (res.ok && body?.success) {
        toast.success((body.added ?? 0) > 0 ? dict.rankings.added(row.keyword) : dict.rankings.skipped(row.keyword))
        setJustTracked((s) => new Set(s).add(row.key))
        onTracked?.()
        reload()
      } else {
        // Our own words only: the route's message is for the log.
        toast.error(res.status === 402 ? dict.rankings.quota : dict.rankings.failed)
      }
    } catch {
      toast.error(dict.rankings.failed)
    } finally {
      setTracking((s) => { const next = new Set(s); next.delete(row.key); return next })
    }
  }, [tracking, projectId, language, toast, dict, onTracked, reload])

  const addCompetitor = useCallback(async (domain: string) => {
    if (addingCompetitor) return
    setAddingCompetitor(domain)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/ai-visibility/competitors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: domain, domain }),
      })
      if (res.ok) {
        toast.success(dict.competitors.added(domain))
        reload()
      } else {
        toast.error(dict.competitors.addFailed)
      }
    } catch {
      toast.error(dict.competitors.addFailed)
    } finally {
      setAddingCompetitor(null)
    }
  }, [addingCompetitor, projectId, toast, dict, reload])

  const data = screen.state === 'ready' ? screen.data : null
  const tracked = new Set((data?.competitorDomains ?? []).map(bareHost))
  const own = data?.ownDomain ? bareHost(data.ownDomain) : null
  const offer = data?.competitorsManageable
    ? [...new Set(suggested.map(bareHost))].filter((d) => d !== own && !tracked.has(d)).slice(0, 5)
    : []

  return (
    <section id={COMPETITIVE_ID} data-competitive-research={screen.state} className="mb-6 scroll-mt-20" aria-labelledby={`${COMPETITIVE_ID}-title`}>
      <Card padding={false}>
        <header className="border-b border-line px-4 py-5 sm:px-6">
          <div className="flex items-start gap-3.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-inset bg-action-soft text-action" aria-hidden="true">
              <Target size={20} strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <h2 id={`${COMPETITIVE_ID}-title`} className="text-section font-semibold text-ink">{dict.title}</h2>
              <p className="mt-1 max-w-3xl text-copy text-muted text-pretty">{dict.subtitle}</p>
            </div>
          </div>
          {/* The legend: once, what each source's label means. */}
          <dl data-competitive-legend="" aria-label={dict.legend.title} className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-inset border border-line bg-sunk/60 px-3 py-2.5">
              <dt><SourceTag source="scan" short /></dt>
              <dd className="mt-1.5 text-caption text-body text-pretty">{dict.legend.scanWhat}</dd>
            </div>
            {!(screen.state === 'ready' && screen.gsc === 'disabled') && (
              <div className="rounded-inset border border-line bg-sunk/60 px-3 py-2.5">
                <dt><SourceTag source="gsc" short /></dt>
                <dd className="mt-1.5 text-caption text-body text-pretty">{dict.legend.gscWhat}</dd>
              </div>
            )}
          </dl>
        </header>

        {screen.state === 'loading' && <LoadingBody label={dict.loading} />}
        {screen.state === 'error' && (
          <div className="p-4 sm:p-6">
            <Notice tone="bad" action={{ label: dict.retry, onClick: () => { gsc.reload(); reload() } }}>{dict.error}</Notice>
          </div>
        )}
        {screen.state === 'ready' && (
          <div className="divide-y divide-line">
            <div className="p-4 sm:p-6">
              <CompetitorStanding
                model={screen.data.model}
                domain={screen.data.ownDomain}
                siteIcon={siteIcon}
                manageHref={screen.data.competitorsManageable ? MANAGE_COMPETITORS_HREF : null}
                suggested={offer}
                onAddCompetitor={addCompetitor}
                addingCompetitor={addingCompetitor}
              />
            </div>
            <div className="p-4 sm:p-6">
              <KeywordMapping model={screen.data.model} />
            </div>
            <div className="p-4 sm:p-6">
              <ExistingRankings
                model={screen.data.model}
                gsc={screen.gsc}
                gscRun={screen.data.gscRun}
                projectId={projectId}
                onTrack={track}
                tracking={tracking}
                justTracked={justTracked}
              />
            </div>
          </div>
        )}
      </Card>
      <ToastHost toasts={toast.toasts} dismiss={toast.dismiss} dir={language === 'he' ? 'rtl' : 'ltr'} />
    </section>
  )
}
