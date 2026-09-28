'use client'

/**
 * Site health for the project the top bar names: the score, the findings in
 * plain words, "fix it for me" where the connection allows it, and step-by-step
 * cards everywhere else. See lib/site-health for the rules and the routes.
 */
import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { FileSearch, Link2, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react'
import Button from '@/components/ui/Button'
import SiteAvatar from '@/components/ui/SiteAvatar'
import { Skeleton } from '@/components/ui/Skeleton'
import { Reveal } from '@/components/ui/motion'
import { ToastHost, useToasts } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/i18n/format-date'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import type { Finding, FindingPage } from '@/lib/site-health/types'
import type { Project } from '@/lib/supabase/types'
import ScoreCard from './ScoreCard'
import FindingCard from './FindingCard'
import FixPreviewModal from './FixPreviewModal'
import { fixKey, useSiteHealthScan, type ScanProgress } from './useSiteHealthScan'

type Copy = DashboardDictionary['siteHealth']
type Filter = 'all' | 'fixable' | 'guide'

const cleanDomain = (d: string) => d.replace(/^https?:\/\//i, '').replace(/\/+$/, '')

/** Overall share done: pages are most of the work, then links, then the site checks. */
function percent(p: ScanProgress): number {
  const share = Math.min(1, p.done / Math.max(1, p.total))
  if (p.stage === 'pages') return Math.round(4 + share * 66)
  if (p.stage === 'links') return Math.round(70 + share * 24)
  return Math.round(94 + share * 6)
}

function ScanningCard({ copy, progress, domain, icon }: { copy: Copy; progress: ScanProgress; domain: string; icon?: string | null }) {
  const pct = percent(progress)
  const label = progress.stage === 'pages' ? copy.stage.pages(progress.done, progress.total)
    : progress.stage === 'links' ? copy.stage.links(progress.done, progress.total)
      : copy.stage.site
  return (
    <section className="rounded-card border border-line bg-surface p-6 shadow-card lg:p-8" aria-busy="true" data-site-health="scanning">
      <div className="flex items-center gap-4">
        <SiteAvatar domain={domain} icon={icon} size="lg" />
        <div className="min-w-0">
          <h2 className="text-section font-semibold text-ink">{copy.scanning}</h2>
          <p className="truncate text-copy text-muted" dir="ltr">{domain}</p>
        </div>
      </div>
      <div className="mt-6">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={label}
          className="h-2 w-full overflow-hidden rounded-pill bg-sunk"
          dir="ltr"
        >
          <div className="h-full rounded-pill bg-action transition-[width] duration-500 ease-snappy" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="text-copy font-medium text-ink" aria-live="polite">{label}</p>
          <p className="text-caption tabular-nums text-muted" dir="ltr">{pct}%</p>
        </div>
        <p className="mt-1 text-caption text-muted">{copy.scanningNote}</p>
      </div>
    </section>
  )
}

function EmptyCard({ copy, domain, icon, onScan }: { copy: Copy; domain: string; icon?: string | null; onScan: () => void }) {
  const points = [
    { icon: FileSearch, text: copy.empty.points[0] },
    { icon: Link2, text: copy.empty.points[1] },
    { icon: ShieldCheck, text: copy.empty.points[2] },
  ]
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card" data-site-health="empty">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="p-6 sm:p-8 lg:p-10">
          <div className="flex items-center gap-3">
            <SiteAvatar domain={domain} icon={icon} size="md" />
            <p className="min-w-0 truncate text-copy font-medium text-body" dir="ltr">{domain}</p>
          </div>
          <h2 className="mt-6 text-title font-semibold tracking-tight text-ink text-balance">{copy.empty.title}</h2>
          <p className="mt-2 max-w-[52ch] text-copy text-muted text-pretty">{copy.empty.body}</p>
          <Button size="lg" className="mt-7" onClick={onScan} data-scan-start="">
            {copy.scanFirst}
          </Button>
        </div>
        <ul className="flex flex-col justify-center gap-5 border-t border-line bg-sunk/50 p-6 sm:p-8 lg:border-s lg:border-t-0 lg:p-10" role="list">
          {points.map((p, i) => (
            <Reveal key={i} index={i}>
              <li className="flex items-center gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-inset bg-surface text-action shadow-control ring-1 ring-line">
                  <p.icon size={18} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="text-copy font-medium text-ink">{p.text}</span>
              </li>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}

export default function SiteHealthScreen({ project }: { project: Project & { site_icon?: string | null } }) {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const copy = dict.siteHealth
  const dir = language === 'he' ? 'rtl' : 'ltr'
  const toasts = useToasts()
  const { report, fixed, loaded, progress, error, scan, markFixed } = useSiteHealthScan(project.id)
  const [filter, setFilter] = useState<Filter>('all')
  const [target, setTarget] = useState<{ finding: Finding; page: FindingPage } | null>(null)
  const domain = cleanDomain(project.target_domain)
  const icon = project.site_icon ?? null
  const scanning = progress !== null

  const fixableCount = useMemo(() => report?.findings.filter((f) => f.fixable).length ?? 0, [report])
  const visible = useMemo(() => {
    const list = report?.findings ?? []
    if (filter === 'fixable') return list.filter((f) => f.fixable)
    if (filter === 'guide') return list.filter((f) => !f.fixable)
    return list
  }, [report, filter])

  const onFix = useCallback((finding: Finding, page: FindingPage) => setTarget({ finding, page }), [])
  const closeFix = useCallback(() => setTarget(null), [])

  const rescan = (
    <Button variant="secondary" onClick={() => void scan()} loading={scanning} disabled={scanning} data-scan-again="">
      {!scanning && <RefreshCw size={16} strokeWidth={2} aria-hidden="true" />}
      {copy.scanAgain}
    </Button>
  )

  const hint = report && !(report.platform === 'wordpress' && report.connections.wordpress)
    ? copy.connectHint[report.platform]
    : null
  const canConnect = report && (report.platform === 'wordpress' || report.platform === 'other') && !report.connections.wordpress

  return (
    <div>
      <div className="space-y-6">
        {error && (
          <p role="alert" className="flex items-start gap-3 rounded-card border border-bad/20 bg-bad-soft px-5 py-4 text-copy text-ink" data-site-health-error={error}>
            <TriangleAlert size={18} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0 text-bad" />
            {copy.errors[error]}
          </p>
        )}

        {!loaded && <Skeleton className="h-[220px] rounded-card" />}

        {loaded && scanning && progress && <ScanningCard copy={copy} progress={progress} domain={domain} icon={icon} />}

        {loaded && !scanning && !report && <EmptyCard copy={copy} domain={domain} icon={icon} onScan={() => void scan()} />}

        {loaded && !scanning && report && (
          <ScoreCard
            report={report}
            copy={copy}
            domain={domain}
            siteIcon={icon}
            checkedAt={copy.checkedAt(formatDate(language).dateTime(report.scannedAt))}
            fixableCount={fixableCount}
            action={rescan}
          />
        )}

        {loaded && report && hint && (
          <div className="flex flex-col gap-3 rounded-card border border-line bg-surface px-5 py-4 shadow-card sm:flex-row sm:items-center sm:justify-between" data-site-health="hint">
            <p className="max-w-3xl text-copy text-body text-pretty">{hint}</p>
            {canConnect && (
              <Link
                href="/settings#connections"
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-control bg-action px-4 text-copy font-semibold text-action-ink shadow-control transition-colors hover:bg-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
              >
                {copy.connectCta}
              </Link>
            )}
          </div>
        )}

        {loaded && report && report.findings.length > 0 && (
          <section aria-label={copy.counts.findings(report.findings.length)} className={cn('space-y-4', scanning && 'pointer-events-none opacity-50')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-section font-semibold text-ink">{copy.counts.findings(report.findings.length)}</h2>
              <div role="group" aria-label={copy.filters.label} className="inline-flex rounded-control border border-line bg-sunk/70 p-1">
                {(['all', 'fixable', 'guide'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={filter === f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      'h-8 rounded-[0.5rem] px-3.5 text-caption font-semibold transition-[background-color,color,box-shadow] duration-150 ease-snappy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action',
                      filter === f ? 'bg-surface text-ink shadow-control' : 'text-muted hover:text-ink',
                    )}
                  >
                    {copy.filters[f]}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              {visible.map((f, i) => (
                <Reveal key={f.id} index={i}>
                  <FindingCard finding={f} copy={copy} platform={report.platform} fixed={fixed} onFix={onFix} />
                </Reveal>
              ))}
            </div>
          </section>
        )}

        {loaded && !scanning && report && report.findings.length === 0 && (
          <section className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-14 text-center shadow-card" data-site-health="clean">
            <span className="grid size-14 place-items-center rounded-full bg-ok-soft text-ok ring-8 ring-ok/5">
              <ShieldCheck size={24} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <h2 className="mt-2 text-section font-semibold text-ink">{copy.clean.title}</h2>
            <p className="max-w-md text-copy text-muted text-pretty">{copy.clean.body}</p>
          </section>
        )}
      </div>

      {target && report && (
        <FixPreviewModal
          key={fixKey(target.finding.id, target.page.url)}
          projectId={project.id}
          finding={target.finding}
          page={target.page}
          platform={report.platform}
          copy={copy}
          toasts={toasts}
          onClose={closeFix}
          onFixed={(on) => markFixed(fixKey(target.finding.id, target.page.url), on)}
        />
      )}
      <ToastHost toasts={toasts.toasts} dismiss={toasts.dismiss} dir={dir} />
    </div>
  )
}
