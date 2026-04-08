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
import { formatDateTime, getEngineDisplayLabel } from '@/lib/utils'

function ReportsContent() {
  const searchParams = useSearchParams()
  const defaultProjectId = searchParams.get('project_id') || ''

  const [projects, setProjects] = useState<(Project & { clients?: Client })[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState(defaultProjectId)
  const [reportData, setReportData] = useState<{
    project: Project & { clients?: Client }
    targets: TrackingTarget[]
    latestResults: Record<string, ScanResult>
    allHistory: ScanResult[]
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null)
  const [positionSort, setPositionSort] = useState<'none' | 'best' | 'worst'>('none')

  useEffect(() => {
    async function loadProjects() {
      const supabase = createClient()
      const { data } = await supabase
        .from('projects')
        .select('*, clients(*)')
        .eq('is_active', true)
        .order('name')
      setProjects(data || [])
    }
    loadProjects()
  }, [])

  useEffect(() => {
    if (defaultProjectId && projects.length > 0) {
      loadReport(defaultProjectId)
    }
  }, [defaultProjectId, projects.length])

  async function loadReport(projectId: string) {
    if (!projectId) return
    setLoading(true)
    setReportData(null)

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

    // Latest per target
    const latest: Record<string, ScanResult> = {}
    for (const r of historyData || []) {
      if (!latest[r.tracking_target_id]) {
        latest[r.tracking_target_id] = r
      }
    }

    setReportData({
      project: projectData,
      targets: targetsData,
      latestResults: latest,
      allHistory: historyData || [],
    })
    setLoading(false)
  }

  async function handleExportExcel() {
    if (!reportData) return
    setExporting('excel')
    const { exportToExcel } = await import('@/lib/export/excel')
    exportToExcel({
      client: reportData.project.clients!,
      project: reportData.project,
      targets: reportData.targets,
      latestResults: reportData.latestResults,
      allHistory: reportData.allHistory,
    })
    setExporting(null)
  }

  async function handleExportPDF() {
    if (!reportData) return
    setExporting('pdf')
    try {
      const { exportToPDF } = await import('@/lib/export/pdf')
      await exportToPDF({
        client: reportData.project.clients!,
        project: reportData.project,
        targets: reportData.targets,
        latestResults: reportData.latestResults,
      })
    } finally {
      setExporting(null)
    }
  }

  const foundCount = reportData ? Object.values(reportData.latestResults).filter((r) => r.found).length : 0
  const total = reportData?.targets.length || 0
  const sortedTargets = reportData
    ? [...reportData.targets].sort((a, b) => {
      if (positionSort === 'none') return 0
      const aResult = reportData.latestResults[a.id]
      const bResult = reportData.latestResults[b.id]
      const aPos = aResult?.found && aResult.position !== null ? aResult.position : Number.POSITIVE_INFINITY
      const bPos = bResult?.found && bResult.position !== null ? bResult.position : Number.POSITIVE_INFINITY
      return positionSort === 'best' ? aPos - bPos : bPos - aPos
    })
    : []

  function togglePositionSort() {
    setPositionSort((prev) => {
      if (prev === 'none') return 'best'
      if (prev === 'best') return 'worst'
      return 'none'
    })
  }

  return (
    <div>
      <Header
        title="דוחות"
        subtitle="יצוא דוחות ל-Excel ו-PDF"
      />

      {/* Project Selector */}
      <Card className="mb-6">
        <div className="flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-48">
            <Select
              label="בחר פרויקט"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              options={[
                { value: '', label: 'בחר פרויקט...' },
                ...projects.map((p) => ({
                  value: p.id,
                  label: `${p.clients?.name || ''} — ${p.name}`,
                })),
              ]}
            />
          </div>
          <Button
            onClick={() => loadReport(selectedProjectId)}
            disabled={!selectedProjectId}
            loading={loading}
          >
            טען דוח
          </Button>
        </div>
      </Card>

      {loading && (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin ml-2" />
          טוען נתוני דוח...
        </div>
      )}

      {reportData && !loading && (
        <>
          {/* Report Header */}
          <div className="bg-blue-600 text-white rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <div className="text-xs text-blue-200 mb-1">Rankings by Go Top</div>
                <h2 className="text-xl font-bold">{reportData.project.name}</h2>
                <p className="text-blue-200 text-sm mt-1">
                  {reportData.project.clients?.name} · {reportData.project.target_domain}
                </p>
                <p className="text-blue-300 text-xs mt-1">
                  הופק בתאריך {new Date().toLocaleDateString('he-IL')}
                </p>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  onClick={handleExportExcel}
                  loading={exporting === 'excel'}
                  className="!bg-white !text-blue-700 hover:!bg-blue-50"
                >
                  📊 יצוא Excel
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleExportPDF}
                  loading={exporting === 'pdf'}
                  className="!bg-white !text-blue-700 hover:!bg-blue-50"
                >
                  📄 יצוא PDF
                </Button>
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <div className="text-xs text-slate-500 mb-1">{"סה\"כ ביטויים"}</div>
              <div className="text-2xl font-bold text-slate-800">{total}</div>
            </Card>
            <Card>
              <div className="text-xs text-slate-500 mb-1">נמצאו</div>
              <div className="text-2xl font-bold text-green-600">{foundCount}</div>
            </Card>
            <Card>
              <div className="text-xs text-slate-500 mb-1">לא נמצאו</div>
              <div className="text-2xl font-bold text-red-500">{total - foundCount}</div>
            </Card>
            <Card>
              <div className="text-xs text-slate-500 mb-1">כיסוי</div>
              <div className="text-2xl font-bold text-blue-600">
                {total > 0 ? `${Math.round((foundCount / total) * 100)}%` : '0%'}
              </div>
            </Card>
          </div>

          {/* Rankings Table */}
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">דירוגים נוכחיים ({total})</h3>
          </div>

          <Table>
            <TableHead>
              <tr>
                <Th>מילת מפתח</Th>
                <Th>מנוע</Th>
                <Th>
                  <button
                    type="button"
                    onClick={togglePositionSort}
                    className="inline-flex items-center gap-1 hover:text-blue-700 transition-colors"
                    title="מיין לפי מיקום"
                  >
                    מיקום
                    <span className="text-xs">
                      {positionSort === 'best' ? '▲' : positionSort === 'worst' ? '▼' : '↕'}
                    </span>
                  </button>
                </Th>
                <Th>מיקום קודם</Th>
                <Th>שינוי</Th>
                <Th>נמצא</Th>
                <Th>תאריך בדיקה</Th>
                <Th>URL / כתובת</Th>
              </tr>
            </TableHead>
            <TableBody>
              {sortedTargets.length === 0 && (
                <EmptyRow colSpan={8} message="אין מילות מפתח בפרויקט זה" />
              )}
              {sortedTargets.map((target) => {
                const result = reportData.latestResults[target.id]
                return (
                  <TableRow key={target.id}>
                    <Td>
                      <span className="font-medium">{target.keyword}</span>
                    </Td>
                    <Td>
                      <EngineBadge
                        engine={target.engine_type}
                        label={getEngineDisplayLabel(target.engine_type, reportData.project.device_type)}
                      />
                    </Td>
                    <Td>
                      {result?.error_message ? (
                        <span className="text-amber-600 text-sm" title={result.error_message}>שגיאת סריקה</span>
                      ) : result?.found ? (
                        <span className="font-bold text-slate-800">#{result.position}</span>
                      ) : '—'}
                    </Td>
                    <Td>
                      {result?.previous_position != null ? `#${result.previous_position}` : '—'}
                    </Td>
                    <Td>
                      {result ? <PositionChange change={result.change_value} /> : '—'}
                    </Td>
                    <Td>
                      <Badge variant={result?.error_message ? 'warning' : result?.found ? 'success' : result ? 'neutral' : 'neutral'}>
                        {result ? (result.error_message ? 'שגיאה' : result.found ? 'כן' : 'לא') : '—'}
                      </Badge>
                    </Td>
                    <Td>
                      <span className="text-xs text-slate-500">
                        {result ? formatDateTime(result.checked_at) : '—'}
                      </span>
                    </Td>
                    <Td>
                      {result?.result_url ? (
                        <a href={result.result_url} target="_blank" rel="noopener noreferrer"
                           className="text-blue-500 hover:underline text-xs truncate max-w-48 block">
                          {result.result_url}
                        </a>
                      ) : result?.result_address ? (
                        <span className="text-xs text-slate-500">{result.result_address}</span>
                      ) : '—'}
                    </Td>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  )
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-slate-400">טוען...</div>}>
      <ReportsContent />
    </Suspense>
  )
}
