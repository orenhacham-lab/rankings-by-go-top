'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Project, Client, TrackingTarget, ScanResult } from '@/lib/supabase/types'
import Header from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { Table, TableHead, TableBody, TableRow, Th, Td, EmptyRow } from '@/components/ui/Table'
import { EngineBadge, PositionChange } from '@/components/ui/StatusBadge'
import Badge from '@/components/ui/Badge'
import { formatDateTime } from '@/lib/utils'
import { sortTargetsByPosition } from '@/lib/sorting'
import { BarChart3, FileText, Zap } from 'lucide-react'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

type ReportType = 'google' | 'ai'

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
  const searchParams = useSearchParams()
  const defaultProjectId = searchParams.get('project_id') || ''
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const t = dict.reports

  const [projects, setProjects] = useState<(Project & { clients?: Client })[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState(defaultProjectId)
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
  const [sortColumn, setSortColumn] = useState<'position' | null>('position')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    async function loadProjects() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('projects')
        .select('*, clients(*)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name')
      setProjects(data || [])
    }
    loadProjects()
  }, [])

  useEffect(() => {
    if (defaultProjectId && projects.length > 0 && reportType === 'google') {
      loadGoogleReport(defaultProjectId)
    }
  }, [defaultProjectId, projects.length])

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
      const successfulResults = results.filter((r: any) => r.status === 'success')
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
    setExporting('excel')

    if (reportType === 'google' && googleReportData) {
      const { exportToExcel } = await import('@/lib/export/excel')
      exportToExcel({
        client: googleReportData.project.clients!,
        project: googleReportData.project,
        targets: googleReportData.targets,
        latestResults: googleReportData.latestResults,
        allHistory: googleReportData.allHistory,
        language,
      })
    } else if (reportType === 'ai' && aiReportData) {
      // TODO: Implement AI export to Excel
      alert(t.excelExportWorkInProgress)
    }

    setExporting(null)
  }

  async function handleExportPDF() {
    if (!selectedProjectId) return
    if (reportType === 'ai' && !aiReportData) {
      alert(t.loadAIReportFirst)
      return
    }
    if (reportType === 'google' && !googleReportData) {
      alert(t.loadGoogleReportFirst)
      return
    }

    setExporting('pdf')
    try {
      const payload: any = {
        projectId: selectedProjectId,
        reportType,
        language,
      }

      if (reportType === 'ai' && aiReportData) {
        payload.aiReportData = {
          summary: aiReportData.summary,
          results: aiReportData.results,
        }
      }

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
    } catch (error) {
      console.error('PDF export error:', error)
      alert(t.downloadError)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div dir={language === 'en' ? 'ltr' : 'rtl'}>
      <Header
        title={t.title}
        subtitle={reportType === 'google' ? t.googleSubtitle : t.aiSubtitle}
      />

      {/* Project & Report Type Selector */}
      <Card className="mb-6">
        <div className="flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-48">
            <Select
              label={t.selectProject}
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              options={[
                { value: '', label: t.selectProjectPlaceholder },
                ...projects.map((p) => ({
                  value: p.id,
                  label: `${p.clients?.name || ''} — ${p.name}`,
                })),
              ]}
            />
          </div>
          <div className="flex-1 min-w-48">
            <Select
              label={t.reportType}
              value={reportType}
              onChange={(e) => handleReportTypeChange(e.target.value as ReportType)}
              options={[
                { value: 'google', label: t.googleReportType },
                { value: 'ai', label: t.aiReportType },
              ]}
            />
          </div>
          <Button
            onClick={() => {
              if (reportType === 'google') {
                loadGoogleReport(selectedProjectId)
              } else {
                loadAiReport(selectedProjectId)
              }
            }}
            disabled={!selectedProjectId}
            loading={loading}
          >
            {t.loadReport}
          </Button>
        </div>
      </Card>

      {loading && (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin ml-2" />
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
        />
      )}
    </div>
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
}: any) {
  const foundCount = Object.values(reportData.latestResults).filter((r: any) => r.found).length
  const total = reportData.targets.length || 0
  const primaryEngine = reportData.targets[0]?.engine_type || 'google_search'

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
      <div className="bg-blue-600 text-white rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs text-blue-200 mb-1">Rankings by Go Top</div>
            <h2 className="text-xl font-bold">{reportData.project.name}</h2>
            <p className="text-blue-200 text-sm mt-1">
              {reportData.project.clients?.name} · {reportData.project.target_domain}
            </p>
            <p className="text-blue-300 text-xs mt-1">
              {t.generatedOn} {new Date().toLocaleDateString('en-US')}
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={onExportExcel}
              loading={exporting === 'excel'}
              className="!bg-white !text-blue-700 hover:!bg-blue-50 flex items-center gap-2"
            >
              <BarChart3 size={18} strokeWidth={2} />
              {t.exportExcel}
            </Button>
            <Button
              variant="secondary"
              onClick={onExportPDF}
              loading={exporting === 'pdf'}
              className="!bg-white !text-blue-700 hover:!bg-blue-50 flex items-center gap-2"
            >
              <FileText size={18} strokeWidth={2} />
              {t.downloadReport}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t.google.totalKeywords}</div>
          <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{total}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t.google.found}</div>
          <div className="text-2xl font-bold text-green-600">{foundCount}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t.google.notFound}</div>
          <div className="text-2xl font-bold text-red-500">{total - foundCount}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t.google.coverage}</div>
          <div className="text-2xl font-bold text-blue-600">
            {total > 0 ? `${Math.round((foundCount / total) * 100)}%` : '0%'}
          </div>
        </Card>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100">{t.google.currentRankings} ({total})</h3>
      </div>

      <Table>
        <TableHead>
          <tr>
            <Th>{t.google.keyword}</Th>
            <Th>{t.google.engine}</Th>
            <Th>
              <button
                onClick={() => handleSortClick('position')}
                className="cursor-pointer select-none"
              >
                {t.google.ranking} {sortColumn === 'position' && (sortOrder === 'asc' ? '↑' : '↓')}
              </button>
            </Th>
            <Th>{t.google.change}</Th>
          </tr>
        </TableHead>
        <TableBody>
          {getSortedTargets().map((target: any) => {
            const result = reportData.latestResults[target.id]
            return (
              <TableRow key={target.id}>
                <Td>{target.keyword}</Td>
                <Td><EngineBadge engine={target.engine_type} /></Td>
                <Td>{result?.found ? result.position : '—'}</Td>
                <Td>{result && <PositionChange change={result.change_value} />}</Td>
              </TableRow>
            )
          })}
          {getSortedTargets().length === 0 && (
            <EmptyRow colSpan={4} message={t.google.noKeywordsInReport} />
          )}
        </TableBody>
      </Table>
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

  return (
    <>
      <div className="bg-indigo-600 text-white rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs text-indigo-200 mb-1">Rankings by Go Top</div>
            <h2 className="text-xl font-bold">{reportData.project.name}</h2>
            <p className="text-indigo-200 text-sm mt-1">
              {reportData.project.clients?.name} · {reportData.project.target_domain}
            </p>
            <p className="text-indigo-300 text-xs mt-1">
              {t.ai.aiVisibilityReport} | {t.generatedOn} {new Date().toLocaleDateString('en-US')}
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={onExportExcel}
              loading={exporting === 'excel'}
              className="!bg-white !text-indigo-700 hover:!bg-indigo-50 flex items-center gap-2"
            >
              <BarChart3 size={18} strokeWidth={2} />
              {t.exportExcel}
            </Button>
            <Button
              variant="secondary"
              onClick={onExportPDF}
              loading={exporting === 'pdf'}
              className="!bg-white !text-indigo-700 hover:!bg-indigo-50 flex items-center gap-2"
            >
              <FileText size={18} strokeWidth={2} />
              {t.downloadReport}
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t.ai.aiScans}</div>
          <div className="text-2xl font-bold text-indigo-600">{reportData.summary.totalScans}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t.ai.aiQueries}</div>
          <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{reportData.summary.totalResults}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t.ai.mentions}</div>
          <div className="text-2xl font-bold text-green-600">{reportData.summary.mentionedCount}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t.ai.mentionRate}</div>
          <div className="text-2xl font-bold text-indigo-600">
            {Math.round(reportData.summary.mentionRate)}%
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t.ai.domainCited}</div>
          <div className="text-2xl font-bold text-cyan-600">{reportData.summary.totalCitations}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t.ai.citationRate}</div>
          <div className="text-2xl font-bold text-indigo-600">
            {Math.round(reportData.summary.citationRate)}%
          </div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t.ai.activeEngines}</div>
          <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            {Object.keys(reportData.summary.engineBreakdown).length}
          </div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t.ai.overallVisibility}</div>
          <div className="text-2xl font-bold text-indigo-600">
            {reportData.summary.totalResults > 0
              ? Math.round(((reportData.summary.mentionedCount + reportData.summary.citedCount) / (reportData.summary.totalResults * 2)) * 100)
              : 0}%
          </div>
        </Card>
      </div>

      {/* Engine Breakdown */}
      <div className="mb-6">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4">{t.ai.performanceByEngine}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {engines.map((engine) => {
            const breakdown = reportData.summary.engineBreakdown[engine]
            if (!breakdown || breakdown.scans === 0) return null
            const mentionRate = Math.round((breakdown.mentions / breakdown.scans) * 100)
            const citationRate = Math.round((breakdown.cited / breakdown.scans) * 100)
            return (
              <Card key={engine}>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">{engineLabels[engine]}</div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-300">{t.ai.scans}:</span>
                    <span className="font-medium">{breakdown.scans}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-300">{t.ai.mentions}:</span>
                    <span className="font-medium text-green-600">{breakdown.mentions} ({mentionRate}%)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-300">{t.ai.citations}:</span>
                    <span className="font-medium text-cyan-600">{breakdown.cited} ({citationRate}%)</span>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      {/* AI Query Results Table */}
      <div className="mb-6">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4">{t.ai.aiQueryResults} ({reportData.results.length})</h3>
        <div className="overflow-x-auto">
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
              {reportData.results.slice(0, 50).map((result: any) => (
                <TableRow key={result.id}>
                  <Td className="max-w-xs">
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
                  <Td>{result.citation_count}</Td>
                  <Td>{formatDateTime(result.created_at)}</Td>
                </TableRow>
              ))}
              {reportData.results.length === 0 && (
                <EmptyRow colSpan={6} message={t.ai.noResultsInReport} />
              )}
            </TableBody>
          </Table>
          {reportData.results.length > 50 && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{t.ai.showingResults(50, reportData.results.length)}</p>
          )}
        </div>
      </div>
    </>
  )
}

export default function ReportsPage() {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  return (
    <Suspense fallback={<div>{dict.reports.loading}</div>}>
      <ReportsContent />
    </Suspense>
  )
}
