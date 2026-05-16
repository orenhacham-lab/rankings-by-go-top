'use client'

import { useState, useEffect, useCallback, use } from 'react'
import { useSearchParams } from 'next/navigation'
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
import AIVisibilitySection from '@/components/ai-visibility/AIVisibilitySection'
import Link from 'next/link'
import { formatDate, formatDateTime, getDeviceLabel, getFrequencyLabel, getSearchTypeLabel } from '@/lib/utils'
import Badge from '@/components/ui/Badge'
import { Search, BarChart3, Sparkles, FileText } from 'lucide-react'

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const searchParams = useSearchParams()
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

  // Deep-link support: ?section=ai-visibility | rankings scrolls to that area.
  useEffect(() => {
    if (loading) return
    const section = searchParams.get('section')
    if (!section) return
    const sectionMap: Record<string, string> = {
      'ai-visibility': 'ai-visibility',
      rankings: 'rankings',
      reports: 'rankings',
    }
    const elementId = sectionMap[section]
    if (!elementId) return
    requestAnimationFrame(() => {
      const el = document.getElementById(elementId)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [loading, searchParams])

  function showScanResult(message: string, isError: boolean) {
    setScanMessage(message)
    setScanError(isError)
    setTimeout(() => setScanMessage(''), 5000)
  }

  async function handleScanAll() {
    const keywordsSection = document.getElementById('keywords-section')
    if (keywordsSection) {
      keywordsSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
      keywordsSection.classList.add('ring-2', 'ring-indigo-400')
      setTimeout(() => {
        keywordsSection.classList.remove('ring-2', 'ring-indigo-400')
      }, 1500)
    }
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
              onClick={() => {
                const section = document.getElementById('keywords-section')
                section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className="flex items-center gap-2"
            >
              <Search size={18} strokeWidth={2} />
              עבור לסריקת מילות מפתח
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

      {/* Project Module Navigation */}
      <nav className="mb-4 -mx-1 overflow-x-auto" aria-label="Project modules">
        <div className="flex items-center gap-1 px-1 py-1.5 bg-gradient-to-r from-slate-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 rounded-xl border border-slate-200/70 dark:border-slate-700 shadow-sm">
          <a
            href="#rankings"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow transition whitespace-nowrap"
          >
            <BarChart3 size={18} strokeWidth={2} className="text-slate-600 dark:text-slate-300" />
            <span>דירוגי Google Organic / Google Maps</span>
          </a>
          {process.env.NEXT_PUBLIC_ENABLE_AI_VISIBILITY === 'true' && (
            <a
              href="#ai-visibility"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:shadow-sm transition whitespace-nowrap"
            >
              <Sparkles size={18} strokeWidth={2} />
              <span>נראות ב-AI</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/25 font-bold tracking-wider">חדש</span>
            </a>
          )}
          <Link
            href={`/reports?project_id=${id}`}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition whitespace-nowrap"
          >
            <FileText size={18} strokeWidth={2} className="text-slate-600 dark:text-slate-300" />
            <span>דוחות</span>
          </Link>
        </div>
      </nav>

      {/* Project Summary — 5 compact cards in one row on desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <Card className="p-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">דומיין</div>
          <div className="font-mono text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{project.target_domain}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">מילות מפתח</div>
          <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{targets.length}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">סריקה אחרונה</div>
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
            {project.last_scan_at ? formatDateTime(project.last_scan_at) : '—'}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">תדירות</div>
          <div className="flex items-center gap-2">
            <Badge variant={project.auto_scan_enabled ? 'info' : 'neutral'}>
              {getFrequencyLabel(project.scan_frequency)}
            </Badge>
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">פרמטרים לסריקה</div>
          <div className="text-[11px] text-slate-700 dark:text-slate-300 leading-tight">
            {scanParams.engine} · {scanParams.device} · gl={scanParams.gl} · hl={scanParams.hl}
            {scanParams.location !== '—' && <> · {scanParams.location}</>}
          </div>
        </Card>
      </div>

      {/* AI Visibility module — placed prominently above the keyword table */}
      {/* Gated by client-side NEXT_PUBLIC_ENABLE_AI_VISIBILITY flag (build-time). */}
      {process.env.NEXT_PUBLIC_ENABLE_AI_VISIBILITY === 'true' && (
        <div id="ai-visibility" className="scroll-mt-6">
          <AIVisibilitySection
            projectId={id}
            projectCountry={project.country}
            projectLanguage={project.language}
            projectDomain={project.target_domain}
            projectBrandName={project.business_name}
            projectCity={project.city}
            projectKeywords={targets.map((t) => t.keyword).filter(Boolean)}
          />
        </div>
      )}

      {/* Tracking Targets */}
      {/* Tracking Targets */}
      <div id="keywords-section" className="flex items-center justify-between mb-4 scroll-mt-6">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          מילות מפתח ({targets.length})
        </h2>
        <div className="flex gap-2">
          <Button
            onClick={handleScanAll}
            loading={scanning}
            disabled={activeTargets.length === 0}
            className="flex items-center gap-2"
            size="sm"
          >
            <Search size={16} strokeWidth={2} />
            {scanning ? 'סורק...' : 'סרוק את כל מילות המפתח'}
          </Button>
          <Link href={`/reports?project_id=${id}`}>
            <Button variant="outline" size="sm" className="flex items-center gap-1.5">
              <FileText size={16} strokeWidth={2} />
              דוח
            </Button>
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
