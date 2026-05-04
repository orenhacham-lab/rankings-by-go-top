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
import { formatDateTime, getDeviceLabel, getSearchTypeLabel } from '@/lib/utils'
import { sortTargetsByPosition } from '@/lib/sorting'

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
      const res = await fetch('/api/reports/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: reportData.project.id }),
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const safeName = reportData.project.name.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, '_').slice(0, 60)
      const timestamp = new Date().toISOString().slice(0, 10)
      link.href = url
      link.download = `דוח_דירוגים_${safeName}_${timestamp}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('PDF export error:', error)
      alert('שגיאה ביהורדת דוח')
    } finally {
      setExporting(null)
    }
  }

  const foundCount = reportData ? Object.values(reportData.latestResults).filter((r) => r.found).length : 0
  const total = reportData?.targets.length || 0
  const primaryEngine = reportData?.targets[0]?.engine_type || 'google_search'

  function getSortedTargets() {
    if (!reportData) return []

    // Report table shows ONLY found keywords (presentation-layer filter).
    // Exclude rows where found !== true OR position is null.
    const foundTargets = reportData.targets.filter((t) => {
      const r = reportData.latestResults[t.id]
      return r?.found === true && r.position != null
    })

    if (sortColumn === 'position') {
      const sorted = sortTargetsByPosition(foundTargets, reportData.latestResults)
      return sortOrder === 'desc' ? sorted.reverse() : sorted
    }

    return foundTargets
  }

  function handleSortClick(column: 'position') {
    if (sortColumn === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortOrder('asc')
    }
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
                {reportData && (
                  <p className="text-blue-200 text-xs mt-1">
                    engine: {getSearchTypeLabel(primaryEngine, reportData.project.device_type)} · device: {getDeviceLabel(reportData.project.device_type)} · gl: {reportData.project.country.toLowerCase()} · hl: {reportData.project.language} · location: {reportData.project.city || '—'}
                  </p>
                )}
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
                  📄 הורדת דוח
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
            <h3 className="font-semibold text-slate-800">דירוגים נוכחיים ({foundCount})</h3>
          </div>

          <Table>
            <TableHead>
              <tr>
                <Th>מילת מפתח</Th>
                <Th>מנוע</Th>
                <Th>
                  <button
                    onClick={() => handleSortClick('position')}
                    className="cursor-pointer hover:bg-slate-100 select-none w-full h-full px-4 py-3 flex items-center justify-center text-right"
                  >
                    <span className="flex items-center gap-2">
                      מיקום
                      {sortColumn === 'position' && (
                        <span className="text-sm">
                          {sortOrder === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
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
              {reportData.targets.length === 0 && (
                <EmptyRow colSpan={8} message="אין מילות מפתח בפרויקט זה" />
              )}
              {getSortedTargets().map((target) => {
                const result = reportData.latestResults[target.id]
                return (
                  <TableRow key={target.id}>
                    <Td>
                      <span className="font-medium">{target.keyword}</span>
                    </Td>
                    <Td>
                      <EngineBadge engine={target.engine_type} device={reportData.project.device_type} />
                    </Td>
                    <Td>
                      {result?.found ? (
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
                      <Badge variant={result?.found ? 'success' : result ? 'neutral' : 'neutral'}>
                        {result ? (result.found ? 'כן' : 'לא') : '—'}
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
