'use client'

import { useState, useEffect, Suspense } from 'react'
import ProjectScoped from '@/components/layout/ProjectScoped'
import { createClient } from '@/lib/supabase/client'
import { useActiveProject } from '@/lib/active-project/ActiveProjectProvider'
import { Project, Client, TrackingTarget, ScanResult } from '@/lib/supabase/types'
import Header from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { Table, TableHead, TableBody, TableRow, Th, Td, EmptyRow } from '@/components/ui/Table'
import { EngineBadge, PositionChange } from '@/components/ui/StatusBadge'
import Badge from '@/components/ui/Badge'
import StatTile from '@/components/ui/StatTile'
import { sortTargetsByPosition } from '@/lib/sorting'
import { ArrowDown, ArrowUp, ArrowUpDown, BarChart3, Bot, FileText, Search } from 'lucide-react'
import { LinkButton } from '@/components/dashboard/ui'
import EmptyState from '@/components/ui/EmptyState'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatDate } from '@/lib/i18n/format-date'
import type { Locale, PublicLocale } from '@/lib/i18n/locales'
import GscPerformance from '@/components/gsc/GscPerformance'
import MonthlyReports from '@/components/reports/monthly/MonthlyReports'
import ScanHistory from '@/components/scans/ScanHistory'
import { ToastHost, useToasts } from '@/components/ui/Toast'
import Notice from '@/components/ui/Notice'

type ReportType = 'google' | 'ai'
type ReportsCopy = ReturnType<typeof getDashboardDictionary>['reports']
/** One row of the AI results table, as loadAiReport flattens it. */
type AiResultRow = { id: string; prompt_text?: string; engine: string; mentioned?: boolean; target_cited?: boolean; citation_count?: number; created_at: string }

interface AIScanResult {
  id: string
  project_id: string
  run_id: string
  prompt_id: string | null
  prompt_text: string
  engine: string
  mentioned: boolean
  target_cited: boolean
  citation_count: number
  target_brand: string | null
  response_text: string | null
  created_at: string
}

interface AIScanRun {
  id: string
  project_id: string
  status: string
  total_prompts: number
  completed_prompts: number
  started_at: string
  completed_at: string | null
}

function ReportsContent() {
  const { language, uiLocale } = useDashboardLanguage()
  const dict = getDashboardDictionary(uiLocale)
  const t = dict.reports
  // Creating a PDF takes a while: a progress toast, then its outcome (components/ui/Toast.tsx).
  const toasts = useToasts()

  // Area D — the selected project is the GLOBAL active project, picked in the top
  // bar like on every screen. This page has no project dropdown of its own.
  const { activeProjectId, projects } = useActiveProject()
  const selectedProjectId = activeProjectId ?? ''
  const [reportType, setReportType] = useState<ReportType>('google')
  
  // Google report data
  const [googleReportData, setGoogleReportData] = useState<{
    project: Project & { clients?: Client }
    targets: TrackingTarget[]
    latestResults: Record<string, ScanResult>
    allHistory: ScanResult[]
  } | null>(null)
  
  // AI report data
  const [aiReportData, setAiReportData] = useState<{
    project: Project & { clients?: Client }
    results: any[]
    runs: AIScanRun[]
    citations: any[]
    summary: {
      totalScans: number
      totalResults: number
      mentionedCount: number
      citedCount: number
      totalCitations: number
      mentionRate: number
      citationRate: number
      engineBreakdown: Record<string, { scans: number; mentions: number; cited: number }>
    }
  } | null>(null)
  
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null)
  // What an export could not do, said inline above the report in the dictionary's
  // words (never a browser alert, never a route's own text).
  const [exportNotice, setExportNotice] = useState<string | null>(null)
  const [sortColumn, setSortColumn] = useState<'position' | null>('position')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  // Area D — load the current report type whenever the GLOBAL active project resolves
  // or changes (replaces the old ?project_id deep-link effect). The project switch is
  // handled centrally by ActiveProjectProvider; this section only reacts to it.
  useEffect(() => {
    if (selectedProjectId) {
      if (reportType === 'google') loadGoogleReport(selectedProjectId)
      else loadAiReport(selectedProjectId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId])

  async function loadGoogleReport(projectId: string) {
    if (!projectId) return
    setLoading(true)
    setGoogleReportData(null)

    const supabase = createClient()
    const [
      { data: projectData },
      { data: targetsData },
    ] = await Promise.all([
      supabase.from('projects').select('*, clients(*)').eq('id', projectId).single(),
      supabase.from('tracking_targets').select('*').eq('project_id', projectId).eq('is_active', true),
    ])

    if (!projectData || !targetsData) {
      setLoading(false)
      return
    }

    const targetIds = targetsData.map((t) => t.id)
    const { data: historyData } = await supabase
      .from('scan_results')
      .select('*')
      .in('tracking_target_id', targetIds)
      .order('checked_at', { ascending: false })
      .limit(1000)

    const latest: Record<string, ScanResult> = {}
    for (const r of historyData || []) {
      if (!latest[r.tracking_target_id]) {
        latest[r.tracking_target_id] = r
      }
    }

    setGoogleReportData({
      project: projectData,
      targets: targetsData,
      latestResults: latest,
      allHistory: historyData || [],
    })
    setLoading(false)
  }

  async function loadAiReport(projectId: string) {
    if (!projectId) return
    setLoading(true)
    setAiReportData(null)

    try {
      const supabase = createClient()
      const { data: projectData } = await supabase
        .from('projects')
        .select('*, clients(*)')
        .eq('id', projectId)
        .single()

      if (!projectData) {
        setLoading(false)
        return
      }

      // Load from API endpoints instead of direct Supabase queries
      const [runsRes, promptsRes] = await Promise.all([
        fetch(`/api/ai-visibility/runs?projectId=${projectId}&limit=500`),
        fetch(`/api/ai-visibility/prompts?projectId=${projectId}`),
      ])

      if (!runsRes.ok || !promptsRes.ok) {
        setLoading(false)
        return
      }

      const runsData = await runsRes.json()
      const promptsData = await promptsRes.json()

      const allRuns = runsData.runs || []
      const promptMap = new Map<string, string>()
      for (const p of (promptsData.prompts || [])) {
        promptMap.set(p.id, p.prompt)
      }

      // Flatten all results from all runs
      const results: any[] = []
      for (const run of allRuns) {
        for (const result of (run.results || [])) {
          results.push({
            ...result,
            run_id: run.id,
            engine: result.engine,
            mentioned: result.mentioned,
            target_cited: result.targetCited,
            citation_count: result.citationCount,
            prompt_id: result.promptId,
            promptText: result.promptText || promptMap.get(result.promptId) || '',
            created_at: result.scannedAt || run.completedAt || run.createdAt,
          })
        }
      }

      // Calculate summary
      // Archived questions (excluded_from_score = true) are removed from the
      // report's data source entirely: they are not listed, not counted, and
      // not part of any KPI, percentage, engine breakdown or export.
      const successfulResults = results.filter(
        (r: any) => r.status === 'success' && r.excludedFromScore !== true
      )
      const mentionedCount = successfulResults.filter((r: any) => r.mentioned).length
      const citedCount = successfulResults.filter((r: any) => r.target_cited).length
      const totalCitations = successfulResults.reduce((sum: number, r: any) => sum + (r.citation_count || 0), 0)

      const engineBreakdown: Record<string, { scans: number; mentions: number; cited: number }> = {}
      for (const result of successfulResults) {
        if (!engineBreakdown[result.engine]) {
          engineBreakdown[result.engine] = { scans: 0, mentions: 0, cited: 0 }
        }
        engineBreakdown[result.engine].scans++
        if (result.mentioned) engineBreakdown[result.engine].mentions++
        if (result.target_cited) engineBreakdown[result.engine].cited++
      }

      const summary = {
        totalScans: successfulResults.length,
        totalResults: successfulResults.length,
        mentionedCount,
        citedCount,
        totalCitations,
        mentionRate: successfulResults.length > 0 ? (mentionedCount / successfulResults.length) * 100 : 0,
        citationRate: successfulResults.length > 0 ? (citedCount / successfulResults.length) * 100 : 0,
        engineBreakdown,
      }

      setAiReportData({
        project: projectData,
        results: successfulResults,
        runs: allRuns,
        citations: [],
        summary,
      })
    } catch (error) {
      console.error('Failed to load AI report:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleReportTypeChange(newType: ReportType) {
    setReportType(newType)
    setExportNotice(null)
    if (selectedProjectId) {
      if (newType === 'google') {
        loadGoogleReport(selectedProjectId)
      } else {
        loadAiReport(selectedProjectId)
      }
    }
  }

  async function handleExportExcel() {
    if (!selectedProjectId) return
    setExportNotice(null)
    setExporting('excel')

    if (reportType === 'google' && googleReportData) {
      const { exportToExcel } = await import('@/lib/export/excel')
      exportToExcel({
        client: googleReportData.project.clients!,
        project: googleReportData.project,
        targets: googleReportData.targets,
        latestResults: googleReportData.latestResults,
        allHistory: googleReportData.allHistory,
        language: uiLocale,
      })
    } else if (reportType === 'ai' && aiReportData) {
      if (!aiReportData.results || aiReportData.results.length === 0) {
        setExportNotice(t.ai.noResultsInReport)
        setExporting(null)
        return
      }
      const { exportAIVisibilityToExcel } = await import('@/lib/export/excel')
      exportAIVisibilityToExcel({
        client: aiReportData.project.clients!,
        project: aiReportData.project,
        summary: aiReportData.summary,
        results: aiReportData.results.map((r: any) => ({
          prompt_text: r.prompt_text || r.promptText,
          engine: r.engine,
          mentioned: !!r.mentioned,
          target_cited: !!r.target_cited,
          citation_count: r.citation_count || 0,
          created_at: r.created_at,
          response_text: r.response_text || r.responseText || null,
          citations: r.citations || null,
        })),
        language: uiLocale,
      })
    }

    setExporting(null)
  }

  async function handleExportPDF() {
    if (!selectedProjectId) return
    if (reportType === 'ai' && !aiReportData) {
      setExportNotice(t.loadAIReportFirst)
      return
    }
    if (reportType === 'google' && !googleReportData) {
      setExportNotice(t.loadGoogleReportFirst)
      return
    }
    setExportNotice(null)

    setExporting('pdf')
    const payload: {
      projectId: string
      reportType: ReportType
      language: PublicLocale
      aiReportData?: { summary: unknown; results: unknown }
    } = {
      projectId: selectedProjectId,
      reportType,
      language: uiLocale,
    }
    if (reportType === 'ai' && aiReportData) {
      payload.aiReportData = {
        summary: aiReportData.summary,
        results: aiReportData.results,
      }
    }
    try {
      await toasts.track(dict.longActions.reportPdf, async () => {
        const res = await fetch('/api/reports/export-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }

        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        const projectName = (reportType === 'google'
          ? googleReportData?.project.name
          : aiReportData?.project.name) || t.reportFilename
        const safeName = projectName.replace(/[/\\:*?"<>|]/g, '-').slice(0, 60)
        const timestamp = new Date().toISOString().slice(0, 10)
        const reportTypeLabel = reportType === 'google' ? t.rankingsLabel : 'AI'
        link.href = url
        link.download = `${t.reportFilename}_${reportTypeLabel}_${safeName}_${timestamp}.pdf`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      })
    } catch (error) {
      // The toast already says so, in our words; the details stay in the console.
      console.error('PDF export error:', error)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div>
      <Header title={t.title} subtitle={t.subtitle} />
      <ToastHost toasts={toasts.toasts} dismiss={toasts.dismiss} dir={language === 'he' ? 'rtl' : 'ltr'} />

      {/* The automatic monthly reports, made on the 1st. Self-contained: it reads its
          own route and renders nothing until the report tables exist. The reports
          built by hand below are unchanged. */}
      <MonthlyReports
        projectId={activeProjectId}
        projectLabel={projects.find((p) => p.id === activeProjectId)?.name ?? ''}
        language={uiLocale}
        toasts={toasts}
      />

      {/* Clicks, impressions and position on Google, with their trend across syncs.
          Always here: before Search Console is set up it says what it will show
          (with Search Console switched off on the server it renders nothing). */}
      <GscPerformance projectId={activeProjectId} className="mb-8" />

      {/* The report built on demand. The project is the one the top bar names; the
          report loads on arrival and again whenever its type changes, so there is
          no separate "load" step. */}
      <section aria-labelledby="on-demand-report-title" data-on-demand-report={reportType}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h2 id="on-demand-report-title" className="text-section font-semibold text-ink">{t.onDemandTitle}</h2>
            <p className="mt-0.5 max-w-prose text-copy text-muted">{t.onDemandBody}</p>
          </div>
          <div className="w-full sm:w-72">
            <Select
              data-report-type=""
              label={t.reportType}
              value={reportType}
              onChange={(e) => handleReportTypeChange(e.target.value as ReportType)}
              options={[
                { value: 'google', label: t.googleReportType },
                { value: 'ai', label: t.aiReportType },
              ]}
            />
          </div>
        </div>

        {exportNotice && (
          <Notice tone="info" onDismiss={() => setExportNotice(null)} className="mb-4">{exportNotice}</Notice>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 rounded-card border border-line bg-surface py-16 text-copy text-muted" aria-busy="true">
            <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-action border-t-transparent motion-reduce:animate-none" />
            {t.loadingReportData}
          </div>
        )}

        {/* Google Report */}
        {reportType === 'google' && googleReportData && !loading && (
          <GoogleReport
            reportData={googleReportData}
            exporting={exporting}
            onExportPDF={handleExportPDF}
            onExportExcel={handleExportExcel}
            sortColumn={sortColumn}
            setSortColumn={setSortColumn}
            sortOrder={sortOrder}
            setSortOrder={setSortOrder}
            t={t}
            language={language}
          />
        )}

        {/* AI Visibility Report */}
        {reportType === 'ai' && aiReportData && !loading && (
          <AIVisibilityReport
            reportData={aiReportData}
            exporting={exporting}
            onExportPDF={handleExportPDF}
            onExportExcel={handleExportExcel}
            t={t}
            language={language}
          />
        )}
      </section>

      {/* The project's check history, closed until asked for (it was the Scans tab). */}
      <ScanHistory key={activeProjectId ?? 'none'} projectId={activeProjectId} className="mt-8" />
    </div>
  )
}

/**
 * The head of a report built on demand: what kind of report, for which project,
 * when it was made, and its two downloads. A plain surface card: no coloured rail
 * bending round its corner (final review G3), the kind is the overline's colour.
 * Both downloads are secondary (the page's one primary is the monthly report's),
 * and with nothing in the report they are disabled, with the reason under them.
 */
function ReportCard({ kind, project, language, exporting, onExportExcel, onExportPDF, empty, t }: {
  kind: string
  project: Project & { clients?: Client }
  language: Locale
  exporting: 'excel' | 'pdf' | null
  onExportExcel: () => void
  onExportPDF: () => void
  /** Nothing to download yet: both buttons disabled, and why. */
  empty: boolean
  t: ReportsCopy
}) {
  const meta = [project.clients?.name, project.target_domain].filter(Boolean) as string[]
  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-4" data-report-card="" data-report-empty={empty || undefined}>
        <div className="min-w-0">
          <p className="text-overline font-semibold text-action">{kind}</p>
          <h3 className="mt-1 text-section font-bold text-ink">{project.name}</h3>
          {meta.length > 0 && (
            <p className="mt-0.5 text-copy text-muted">
              {meta.map((m, i) => (
                <span key={m}>{i > 0 && ' · '}<bdi>{m}</bdi></span>
              ))}
            </p>
          )}
          <p className="mt-1 text-caption text-muted" data-report-date="">
            {t.generatedOn} {formatDate(language).date(new Date())}
          </p>
        </div>
        <div className="flex flex-col items-start gap-1.5 sm:items-end">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={onExportExcel} loading={exporting === 'excel'} disabled={empty} aria-describedby={empty ? 'report-download-reason' : undefined}>
              <BarChart3 size={16} strokeWidth={2} aria-hidden="true" />
              {t.exportExcel}
            </Button>
            <Button variant="secondary" onClick={onExportPDF} loading={exporting === 'pdf'} disabled={empty} aria-describedby={empty ? 'report-download-reason' : undefined}>
              <FileText size={16} strokeWidth={2} aria-hidden="true" />
              {t.downloadReport}
            </Button>
          </div>
          {empty && <p id="report-download-reason" data-report-download-reason="" className="max-w-xs text-caption text-muted sm:text-end">{t.nothingToDownload}</p>}
        </div>
      </div>
    </Card>
  )
}

// Google Report Component (existing logic)
function GoogleReport({
  reportData,
  exporting,
  onExportPDF,
  onExportExcel,
  sortColumn,
  setSortColumn,
  sortOrder,
  setSortOrder,
  t,
  language,
}: any) {
  const foundCount = Object.values(reportData.latestResults).filter((r: any) => r.found).length
  const total = reportData.targets.length || 0

  const getSortedTargets = () => {
    if (!reportData) return []
    if (sortColumn === 'position') {
      const sorted = sortTargetsByPosition(reportData.targets, reportData.latestResults)
      return sortOrder === 'desc' ? sorted.reverse() : sorted
    }
    return reportData.targets
  }

  const handleSortClick = (column: 'position') => {
    if (sortColumn === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortOrder('asc')
    }
  }

  return (
    <>
      <ReportCard
        kind={t.googleReport}
        project={reportData.project}
        language={language}
        exporting={exporting}
        onExportExcel={onExportExcel}
        onExportPDF={onExportPDF}
        empty={total === 0}
        t={t}
      />

      {total === 0 ? (
        // Nothing tracked: four tiles of zeros say nothing, so the report says what fills it.
        <Card padding={false}>
          <EmptyState
            icon={<Search />}
            title={t.google.emptyTitle}
            body={t.google.emptyBody}
            action={<LinkButton href="/keyword-research" variant="secondary" size="sm">{t.google.emptyAction}</LinkButton>}
          />
        </Card>
      ) : (
      <>
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label={t.google.totalKeywords} value={total} />
        <StatTile label={t.google.found} value={foundCount} />
        <StatTile label={t.google.notFound} value={total - foundCount} />
        <StatTile label={t.google.coverage} value={total > 0 ? `${Math.round((foundCount / total) * 100)}%` : '0%'} />
      </div>

      <h3 className="mb-3 text-section font-semibold text-ink">{t.google.currentRankings} ({total})</h3>

      {/* At 390 the table keeps the keyword and its position (the change under it);
          the engine and the change column return from sm, so nothing is cut inside
          a sideways-scrolling card. */}
      <Table>
        <TableHead>
          <tr className="max-sm:[&>th]:px-3">
            <Th>{t.google.keyword}</Th>
            <Th className="hidden sm:table-cell">{t.google.engine}</Th>
            <Th>
              <button
                type="button"
                onClick={() => handleSortClick('position')}
                className="cursor-pointer select-none rounded-control hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
              >
                <span className="inline-flex items-center gap-1">
                  {t.google.ranking}
                  {sortColumn !== 'position'
                    ? <ArrowUpDown aria-hidden="true" className="size-3.5" />
                    : sortOrder === 'asc' ? <ArrowUp aria-hidden="true" className="size-3.5" /> : <ArrowDown aria-hidden="true" className="size-3.5" />}
                </span>
              </button>
            </Th>
            <Th className="hidden sm:table-cell">{t.google.change}</Th>
          </tr>
        </TableHead>
        <TableBody>
          {getSortedTargets().map((target: any) => {
            const result = reportData.latestResults[target.id]
            return (
              <TableRow key={target.id} className="max-sm:[&>td]:px-3">
                <Td className="font-medium text-ink">{target.keyword}</Td>
                <Td className="hidden sm:table-cell"><EngineBadge engine={target.engine_type} /></Td>
                <Td className="tabular-nums">
                  <div className="flex flex-col items-start gap-0.5">
                    <span>{result?.found ? result.position : '—'}</span>
                    {result && <span className="sm:hidden"><PositionChange change={result.change_value} /></span>}
                  </div>
                </Td>
                <Td className="hidden sm:table-cell">{result && <PositionChange change={result.change_value} />}</Td>
              </TableRow>
            )
          })}
          {getSortedTargets().length === 0 && (
            <EmptyRow colSpan={4} message={t.google.noKeywordsInReport} />
          )}
        </TableBody>
      </Table>
      </>
      )}
    </>
  )
}

// AI Visibility Report Component
function AIVisibilityReport({
  reportData,
  exporting,
  onExportPDF,
  onExportExcel,
  t,
  language,
}: any) {
  const engines = ['chatgpt', 'perplexity', 'gemini', 'copilot', 'grok', 'google_ai_mode']
  const engineLabels: Record<string, string> = {
    chatgpt: 'ChatGPT',
    perplexity: 'Perplexity',
    gemini: 'Gemini',
    copilot: 'Copilot',
    grok: 'Grok',
    google_ai_mode: 'Google AI',
  }
  const dates = formatDate(language)
  const engineCards = engines.filter((engine) => (reportData.summary.engineBreakdown[engine]?.scans ?? 0) > 0)

  return (
    <>
      <ReportCard
        kind={t.ai.aiVisibilityReport}
        project={reportData.project}
        language={language}
        exporting={exporting}
        onExportExcel={onExportExcel}
        onExportPDF={onExportPDF}
        empty={reportData.summary.totalResults === 0}
        t={t}
      />

      {reportData.summary.totalResults === 0 ? (
        <Card padding={false}>
          <EmptyState
            icon={<Bot />}
            title={t.ai.emptyTitle}
            body={t.ai.emptyBody}
            action={<LinkButton href="/ai-visibility" variant="secondary" size="sm">{t.ai.emptyAction}</LinkButton>}
          />
        </Card>
      ) : (
      <>
      {/* Summary Metrics */}
      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label={t.ai.aiScans} value={reportData.summary.totalScans} />
        <StatTile label={t.ai.aiQueries} value={reportData.summary.totalResults} />
        <StatTile label={t.ai.mentions} value={reportData.summary.mentionedCount} />
        <StatTile label={t.ai.mentionRate} value={`${Math.round(reportData.summary.mentionRate)}%`} />
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label={t.ai.domainCited} value={reportData.summary.totalCitations} />
        <StatTile label={t.ai.citationRate} value={`${Math.round(reportData.summary.citationRate)}%`} />
        <StatTile label={t.ai.activeEngines} value={Object.keys(reportData.summary.engineBreakdown).length} />
        <StatTile
          label={t.ai.overallVisibility}
          value={`${reportData.summary.totalResults > 0
            ? Math.round(((reportData.summary.mentionedCount + reportData.summary.citedCount) / (reportData.summary.totalResults * 2)) * 100)
            : 0}%`}
        />
      </div>

      {/* Engine Breakdown */}
      {engineCards.length > 0 && (
        <div className="mb-8">
          <h3 className="mb-3 text-section font-semibold text-ink">{t.ai.performanceByEngine}</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {engineCards.map((engine) => {
              const breakdown = reportData.summary.engineBreakdown[engine]
              const mentionRate = Math.round((breakdown.mentions / breakdown.scans) * 100)
              const citationRate = Math.round((breakdown.cited / breakdown.scans) * 100)
              return (
                <Card key={engine} padding={false} className="p-5 sm:p-6">
                  <div className="mb-3 text-copy font-semibold text-ink">{engineLabels[engine]}</div>
                  <dl className="space-y-2 text-caption">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">{t.ai.scans}</dt>
                      <dd className="font-medium tabular-nums text-ink">{breakdown.scans}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">{t.ai.mentions}</dt>
                      <dd className="font-medium tabular-nums text-ink">{breakdown.mentions} ({mentionRate}%)</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">{t.ai.citations}</dt>
                      <dd className="font-medium tabular-nums text-ink">{breakdown.cited} ({citationRate}%)</dd>
                    </div>
                  </dl>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* AI Query Results Table */}
      <div className="mb-6">
        <h3 className="mb-3 text-section font-semibold text-ink">{t.ai.aiQueryResults} ({reportData.results.length})</h3>
        <Table>
          <TableHead>
            <tr>
              <Th>{t.ai.query}</Th>
              <Th>{t.ai.engine}</Th>
              <Th>{t.ai.mentioned}</Th>
              <Th>{t.ai.domainCited2}</Th>
              <Th>{t.ai.citations2}</Th>
              <Th>{t.ai.date}</Th>
            </tr>
          </TableHead>
          <TableBody>
            {reportData.results.slice(0, 50).map((result: AiResultRow) => (
              <TableRow key={result.id}>
                <Td className="max-w-xs text-ink">
                  {result.prompt_text}
                </Td>
                <Td><EngineBadge engine={result.engine} /></Td>
                <Td>
                  <Badge variant={result.mentioned ? 'success' : 'neutral'}>
                    {result.mentioned ? t.ai.yes : t.ai.no}
                  </Badge>
                </Td>
                <Td>
                  <Badge variant={result.target_cited ? 'success' : 'neutral'}>
                    {result.target_cited ? t.ai.yes : t.ai.no}
                  </Badge>
                </Td>
                <Td className="tabular-nums">{result.citation_count}</Td>
                <Td className="whitespace-nowrap tabular-nums">{dates.dateTime(result.created_at)}</Td>
              </TableRow>
            ))}
            {reportData.results.length === 0 && (
              <EmptyRow colSpan={6} message={t.ai.noResultsInReport} />
            )}
          </TableBody>
        </Table>
        {reportData.results.length > 50 && (
          <p className="mt-2 text-caption text-muted">{t.ai.showingResults(50, reportData.results.length)}</p>
        )}
      </div>
      </>
      )}
    </>
  )
}

export default function ReportsPage() {
  const { uiLocale } = useDashboardLanguage()
  const dict = getDashboardDictionary(uiLocale)
  return (
    <Suspense fallback={<div>{dict.reports.loading}</div>}>
      <ProjectScoped>
        <ReportsContent />
      </ProjectScoped>
    </Suspense>
  )
}
