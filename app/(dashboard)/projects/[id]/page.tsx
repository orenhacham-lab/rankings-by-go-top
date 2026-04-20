'use client'

import { useState, useEffect, useCallback, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Project, Client, TrackingTarget, ScanResult } from '@/lib/supabase/types'
import Header from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { ActiveBadge } from '@/components/ui/StatusBadge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ProjectForm from '@/components/projects/ProjectForm'
import TrackingTargetsTable from '@/components/keywords/TrackingTargetsTable'
import TrackingTargetForm from '@/components/keywords/TrackingTargetForm'
import Link from 'next/link'
import { formatDate, formatDateTime, getDeviceLabel, getFrequencyLabel, getSearchTypeLabel } from '@/lib/utils'
import Badge from '@/components/ui/Badge'

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [project, setProject] = useState<Project & { clients?: Client } | null>(null)
  const [targets, setTargets] = useState<TrackingTarget[]>([])
  const [latestResults, setLatestResults] = useState<Record<string, ScanResult>>({})
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [showAddTarget, setShowAddTarget] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanningTargets, setScanningTargets] = useState<Set<string>>(new Set())
  const [scanMessage, setScanMessage] = useState('')
  const [scanError, setScanError] = useState(false)

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const [
      { data: projectData },
      { data: targetsData },
      { data: clientsData },
    ] = await Promise.all([
      supabase.from('projects').select('*, clients(*)').eq('id', id).single(),
      supabase.from('tracking_targets').select('*').eq('project_id', id).order('created_at'),
      supabase.from('clients').select('*').eq('is_active', true),
    ])

    setProject(projectData)
    setTargets(targetsData || [])
    setClients(clientsData || [])

    // Load latest results for each target
    if (targetsData && targetsData.length > 0) {
      const targetIds = targetsData.map((t) => t.id)
      const { data: resultsData } = await supabase
        .from('scan_results')
        .select('*')
        .in('tracking_target_id', targetIds)
        .order('checked_at', { ascending: false })

      // Keep only the latest result per target
      const latest: Record<string, ScanResult> = {}
      for (const result of resultsData || []) {
        if (!latest[result.tracking_target_id]) {
          latest[result.tracking_target_id] = result
        }
      }
      setLatestResults(latest)
    }

    setLoading(false)
  }, [id])

  useEffect(() => {
    loadData()
  }, [loadData])

  function showScanResult(message: string, isError: boolean) {
    setScanMessage(message)
    setScanError(isError)
    setTimeout(() => setScanMessage(''), 5000)
  }

  async function handleScanAll() {
    setScanning(true)
    setScanMessage('')
    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id }),
      })
      const data = await response.json()
      if (response.ok) {
        await loadData()
        showScanResult(`סריקה הושלמה: ${data.completed} / ${data.total} הצליחו`, data.failed > 0 && data.completed === 0)
      } else {
        showScanResult(`שגיאה: ${data.error}`, true)
      }
    } catch {
      showScanResult('שגיאת רשת בסריקה', true)
    } finally {
      setScanning(false)
    }
  }

  async function handleScanTarget(targetId: string) {
    setScanningTargets((prev) => new Set([...prev, targetId]))
    setScanMessage('')
    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id, targetId }),
      })
      const data = await response.json()
      if (response.ok) {
        await loadData()
        showScanResult('סריקה הושלמה בהצלחה', false)
      } else {
        showScanResult(`שגיאה: ${data.error}`, true)
      }
    } catch {
      showScanResult('שגיאת רשת', true)
    } finally {
      setScanningTargets((prev) => {
        const next = new Set(prev)
        next.delete(targetId)
        return next
      })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin ml-2" />
        טוען...
      </div>
    )
  }

  if (!project) {
    return <div className="text-center py-20 text-slate-400">פרויקט לא נמצא</div>
  }

  const activeTargets = targets.filter((t) => t.is_active)
  const primaryEngine = activeTargets[0]?.engine_type || 'google_search'
  const scanParams = {
    engine: getSearchTypeLabel(primaryEngine, project.device_type),
    device: getDeviceLabel(project.device_type),
    gl: project.country.toLowerCase(),
    hl: project.language,
    location: project.city || '—',
  }

  return (
    <div>
      <Header
        title={project.name}
        subtitle={project.clients?.name}
        actions={
          <div className="flex gap-2">
            <Link href="/projects">
              <Button variant="outline" size="sm">← פרויקטים</Button>
            </Link>
            <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)}>
              עריכה
            </Button>
            <Button
              onClick={handleScanAll}
              loading={scanning}
              disabled={activeTargets.length === 0}
            >
              {scanning ? 'סורק...' : '🔍 סרוק הכל'}
            </Button>
          </div>
        }
      />

      {scanMessage && (
        <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${scanError ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-700'}`}>
          <span>{scanError ? '✗' : '✓'}</span>
          <span>{scanMessage}</span>
        </div>
      )}

      {/* Project Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <div className="text-xs text-slate-500 mb-1">דומיין</div>
          <div className="font-mono text-sm font-semibold text-slate-800 truncate">{project.target_domain}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 mb-1">מילות מפתח</div>
          <div className="text-2xl font-bold text-slate-800">{targets.length}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 mb-1">סריקה אחרונה</div>
          <div className="text-sm font-medium text-slate-800">
            {project.last_scan_at ? formatDateTime(project.last_scan_at) : '—'}
          </div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 mb-1">תדירות</div>
          <div className="flex items-center gap-2">
            <Badge variant={project.auto_scan_enabled ? 'info' : 'neutral'}>
              {getFrequencyLabel(project.scan_frequency)}
            </Badge>
          </div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 mb-1">פרמטרים לסריקה</div>
          <div className="text-xs text-slate-700 space-y-1">
            <div><b>engine:</b> {scanParams.engine}</div>
            <div><b>device:</b> {scanParams.device}</div>
            <div><b>gl:</b> {scanParams.gl}</div>
            <div><b>hl:</b> {scanParams.hl}</div>
            <div><b>location:</b> {scanParams.location}</div>
          </div>
        </Card>
      </div>

      {/* Tracking Targets */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">
          מילות מפתח ({targets.length})
        </h2>
        <div className="flex gap-2">
          <Link href={`/reports?project_id=${id}`}>
            <Button variant="outline" size="sm">📄 דוח</Button>
          </Link>
          <Button size="sm" onClick={() => setShowAddTarget(true)}>
            + הוסף מילת מפתח
          </Button>
        </div>
      </div>

      <TrackingTargetsTable
        targets={targets}
        latestResults={latestResults}
        projectId={id}
        projectCity={project.city}
        projectCountry={project.country}
        projectDomain={project.target_domain}
        projectBusinessName={project.business_name || undefined}
        onScanTarget={handleScanTarget}
        scanningTargets={scanningTargets}
        projectDevice={project.device_type}
        onActionComplete={loadData}
      />

      {/* Edit Modal */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="עריכת פרויקט" size="lg">
        <ProjectForm
          project={project}
          clients={clients}
          onSuccess={() => { setShowEdit(false); loadData() }}
          onCancel={() => setShowEdit(false)}
        />
      </Modal>

      {/* Add Target Modal */}
      <Modal open={showAddTarget} onClose={() => setShowAddTarget(false)} title="הוספת מילת מפתח" size="md">
        <TrackingTargetForm
          projectId={id}
          projectCity={project.city || undefined}
          projectCountry={project.country}
          defaultDomain={project.target_domain}
          defaultBusinessName={project.business_name || undefined}
          onSuccess={() => { setShowAddTarget(false); loadData() }}
          onCancel={() => setShowAddTarget(false)}
        />
      </Modal>
    </div>
  )
}
