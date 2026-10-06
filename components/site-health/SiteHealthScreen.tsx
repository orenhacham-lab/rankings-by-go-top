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
import Segmented from '@/components/ui/Segmented'
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
import FindingCard, { type FixMode } from './FindingCard'
import FixPreviewModal from './FixPreviewModal'
import ApproveFixModal from './ApproveFixModal'
import AutoFixStrip, { pluginUpdateFor } from './AutoFixStrip'
import FixQueue from './FixQueue'
import PluginInstallModal from './PluginInstallModal'
import { fixKey, useSiteHealthScan, type ScanProgress } from './useSiteHealthScan'
import { useSiteFixes } from './useSiteFixes'
import { useSafeFixes } from './useSafeFixes'
import { safeFixesEnabled } from '@/lib/site-fix/bulk'
import type { FixType } from '@/lib/site-fix/types'
import { rowStateFrom, rowTarget, type FixRowState } from '@/lib/site-fix/job-match'
import { FIX_TYPE, scoreWithFixes } from '@/lib/site-health/rules'

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
  const { language, uiLocale } = useDashboardLanguage()
  const dict = getDashboardDictionary(uiLocale)
  const copy = dict.siteHealth
  const dir = language === 'he' ? 'rtl' : 'ltr'
  const toasts = useToasts()
  const { report, fixed, loaded, progress, error, scan, markFixed } = useSiteHealthScan(project.id)
  const [filter, setFilter] = useState<Filter>('all')
  const [target, setTarget] = useState<{ finding: Finding; page: FindingPage; type: FixType | null } | null>(null)
  const [installOpen, setInstallOpen] = useState(false)
  const fixes = useSiteFixes(project.id)
  const caps = fixes.capabilities
  const queueLive = fixes.active && !!caps
  const domain = cleanDomain(project.target_domain)
  const icon = project.site_icon ?? null
  const scanning = progress !== null

  /**
   * With the fix queue live, what each page offers comes from where an approved fix would go
   * (lib/site-fix/channel.ts): fix it now, install the plugin first, or instructions only.
   */
  /**
   * Where a finding row stands in the fix queue (the server's jobs, not this browser's memory):
   * applied or sent reads "fixed", pending or waiting for a manual update reads "in the queue",
   * and neither offers "fix it for me" again.
   */
  const jobStateFor = useCallback((finding: Finding, page: FindingPage): FixRowState => {
    if (!queueLive || !finding.fixType) return null
    return rowStateFrom(fixes.jobs, rowTarget(finding.fixType, page))
  }, [queueLive, fixes.jobs])

  const fixModeFor = useCallback((finding: Finding, page: FindingPage): FixMode => {
    if (!queueLive || !caps || !finding.fixType) return null
    const channel = caps.channelFor[finding.fixType]
    // A Shopify store: only its articles and pages are written; products, collections and llms.txt keep their instructions.
    // (A broken link is judged by the page it was found on, which the store's own check reads.)
    if (caps.shopify && (finding.fixType === 'llms_txt' || (finding.fixType !== 'broken_link' && page.kind !== 'article' && page.kind !== 'page'))) return null
    // The store's own check found the problem outside what the connection edits (theme, menu, a product).
    if (page.outside === 'theme') return null
    // llms.txt: the plugin (2.1.0) serves it; every other site gets the same text to copy and place.
    if (finding.fixType === 'llms_txt') return channel === 'plugin' ? 'fix' : 'copy'
    if (!channel) return null
    if (finding.fixType === 'broken_link' && !page.from) return null
    if (channel === 'needs_plugin') return 'install'
    // A type newer than the installed plugin: offer the update, never send it to the old plugin.
    if (channel === 'needs_update') return 'update'
    // An extra main heading is changed only where the plugin proves it safe; otherwise instructions.
    if (finding.fixType === 'h1_demote' && channel !== 'plugin' && channel !== 'shopify') return null
    if (finding.fixType === 'internal_link' && (channel === 'webhook' || channel === 'manual')) return null
    return 'fix'
  }, [queueLive, caps])
  const findings = useMemo(() => {
    // A report kept from before the fix queue has no fix type on its findings: take it from the
    // same rules the scan uses, so the buttons show without a new scan.
    const list = (report?.findings ?? []).map((f) => (f.fixType ? f : { ...f, fixType: FIX_TYPE[f.id] ?? null }))
    if (!queueLive) return list
    return list.map((f) => ({ ...f, fixable: f.pages.some((p) => fixModeFor(f, p) === 'fix' && !jobStateFor(f, p)) }))
  }, [report, queueLive, fixModeFor, jobStateFor])

  const fixableCount = useMemo(() => findings.filter((f) => f.fixable).length, [findings])
  // The score counts what is already fixed (an applied or sent job, or the owner's own "I fixed it"),
  // at once: each fixed page takes its share of its problem's points off (lib/site-health/rules.ts).
  const live = useMemo(
    () => scoreWithFixes(findings, (f, p) => jobStateFor(f, p) === 'applied' || fixed.has(fixKey(f.id, p.url))),
    [findings, jobStateFor, fixed],
  )
  const visible = useMemo(() => {
    const list = findings
    if (filter === 'fixable') return list.filter((f) => f.fixable)
    if (filter === 'guide') return list.filter((f) => !f.fixable)
    return list
  }, [findings, filter])

  const onFix = useCallback((finding: Finding, page: FindingPage) => setTarget({ finding, page, type: finding.fixType ?? null }), [setTarget])
  const openInstall = useCallback(() => setInstallOpen(true), [setInstallOpen])
  const when = useCallback((iso: string) => formatDate(language).dateTime(iso), [language])
  // Closing the approval re-reads the queue, so a fix approved elsewhere (another tab, another
  // person, or an "already approved" answer) shows on its row at once.
  const reloadFixes = fixes.reload
  const closeFix = useCallback(() => { setTarget(null); if (queueLive) void reloadFixes() }, [setTarget, queueLive, reloadFixes])

  // "Fix {n} safe items for me": the plugin connected and writing all three safe types now.
  const safeEnabled = queueLive && safeFixesEnabled(caps)
  const safeFixable = useCallback((f: Finding, p: FindingPage) => fixModeFor(f, p) === 'fix' && !jobStateFor(f, p), [fixModeFor, jobStateFor])
  const safe = useSafeFixes({
    projectId: project.id, enabled: safeEnabled, findings, jobs: fixes.jobs, fixable: safeFixable,
    copy: copy.autofix, toasts, onJob: fixes.upsertJob, onFinished: reloadFixes,
  })
  const openQueue = useCallback(() => {
    document.getElementById('fixes')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  }, [])

  const rescan = (
    <Button variant="secondary" onClick={() => void scan()} loading={scanning} disabled={scanning} data-scan-again="">
      {!scanning && <RefreshCw size={16} strokeWidth={2} aria-hidden="true" />}
      {copy.scanAgain}
    </Button>
  )

  const showStrip = queueLive && !!caps && (caps.wordpress || caps.webhook || caps.plugin.state !== 'none')
  const hint = report && !showStrip && !(report.platform === 'wordpress' && report.connections.wordpress)
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
            live={live}
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

        {loaded && showStrip && caps && (
          <AutoFixStrip
            projectId={project.id}
            capabilities={caps}
            copy={copy.autofix}
            onInstall={openInstall}
            onChanged={fixes.reload}
            lastSeen={when}
            safe={safeEnabled ? { count: safe.count, phase: safe.phase, start: () => void safe.start(), onRecheck: () => void scan(), onOpenQueue: openQueue } : null}
          />
        )}

        {loaded && queueLive && fixes.jobs.length > 0 && (
          <FixQueue projectId={project.id} jobs={fixes.jobs} copy={copy.autofix} toasts={toasts} when={when} onJob={(j) => { fixes.upsertJob(j); void fixes.reload() }} />
        )}

        {loaded && report && report.findings.length > 0 && (
          <section data-site-health="findings" aria-label={copy.counts.findings(report.findings.length)} className={cn('space-y-4', scanning && 'pointer-events-none opacity-50')}>
            {/* Below sm the filter takes its own full-width line under the count. */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-section font-semibold text-ink">{copy.counts.findings(report.findings.length)}</h2>
              <div data-site-health-filter="">
                <Segmented
                  ariaLabel={copy.filters.label}
                  value={filter}
                  onChange={setFilter}
                  fill
                  className="sm:inline-flex sm:w-auto"
                  options={(['all', 'fixable', 'guide'] as const).map((f) => ({ value: f, label: copy.filters[f] }))}
                />
              </div>
            </div>
            <div className="space-y-4">
              {visible.map((f, i) => (
                <Reveal key={f.id} index={i}>
                  <FindingCard
                    finding={f}
                    copy={copy}
                    platform={report.platform}
                    fixed={fixed}
                    onFix={onFix}
                    fixModeFor={queueLive ? fixModeFor : null}
                    jobStateFor={queueLive ? jobStateFor : null}
                    onInstall={openInstall}
                  />
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

      {target && report && queueLive && target.type && (
        <ApproveFixModal
          key={`${target.type}|${fixKey(target.finding.id, target.page.url)}`}
          projectId={project.id}
          finding={target.finding}
          page={target.page}
          type={target.type}
          platform={report.platform}
          copy={copy}
          toasts={toasts}
          onClose={closeFix}
          onJob={fixes.upsertJob}
          onFixed={(on) => { if (target.type !== 'focus_keyphrase') markFixed(fixKey(target.finding.id, target.page.url), on) }}
          onInstall={openInstall}
          updateAvailable={!!caps && pluginUpdateFor(caps) !== null}
          onFocusNext={caps?.channelFor.focus_keyphrase === 'plugin' && target.type === 'seo_title'
            ? () => setTarget({ ...target, type: 'focus_keyphrase' })
            : null}
        />
      )}
      {target && report && !queueLive && (
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
      {installOpen && caps && (
        <PluginInstallModal
          projectId={project.id}
          siteUrl={`https://${domain}`}
          capabilities={caps}
          copy={copy.autofix}
          toasts={toasts}
          onClose={() => setInstallOpen(false)}
          onChanged={fixes.reload}
        />
      )}
      {safe.dialog}
      <ToastHost toasts={toasts.toasts} dismiss={toasts.dismiss} dir={dir} />
    </div>
  )
}
