'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Table, TableHead, TableBody, TableRow, Th, Td, EmptyRow } from '@/components/ui/Table'
import { ScanStatusBadge, PositionChange, EngineBadge } from '@/components/ui/StatusBadge'
import { formatDateTime } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { DashboardOnboardingTour } from '@/components/onboarding/DashboardOnboardingTour'
import Link from 'next/link'
import { Users, Folder, KeyRound, Search, TrendingUp, TrendingDown, FileText } from 'lucide-react'

interface DashboardStats {
  totalClients: number
  totalProjects: number
  totalKeywords: number
  totalScans: number
}

interface LatestScan {
  id: string
  project_name: string
  project_id: string
  status: string
  completed_targets: number
  total_targets: number
  started_at: string | null
}

interface RankingChange {
  keyword: string
  project_name: string
  project_id: string
  tracking_target_id: string
  engine_type: string
  position: number
  change_value: number
}

export default function DashboardPage() {
  const { language, isLoaded } = useDashboardLanguage()
  const dict = isLoaded ? getDashboardDictionary(language) : getDashboardDictionary('he')

  const [stats, setStats] = useState<DashboardStats>({ totalClients: 0, totalProjects: 0, totalKeywords: 0, totalScans: 0 })
  const [latestScans, setLatestScans] = useState<LatestScan[]>([])
  const [improvements, setImprovements] = useState<RankingChange[]>([])
  const [drops, setDrops] = useState<RankingChange[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadDashboard() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [
        { count: clientCount },
        { count: projectCount },
        { count: keywordCount },
        { count: scanCount },
        { data: scansData },
        { data: resultsData },
      ] = await Promise.all([
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_active', true),
        supabase.from('projects').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_active', true),
        supabase.from('tracking_targets').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_active', true),
        supabase.from('scans').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase
          .from('scans')
          .select('id, status, completed_targets, total_targets, started_at, projects(id, name)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('scan_results')
          .select('tracking_target_id, keyword, engine_type, position, change_value, checked_at, tracking_targets(project_id, projects(name))')
          .eq('tracking_targets.user_id', user.id)
          .not('change_value', 'is', null)
          .order('checked_at', { ascending: false })
          .limit(200),
      ])

      setStats({
        totalClients: clientCount || 0,
        totalProjects: projectCount || 0,
        totalKeywords: keywordCount || 0,
        totalScans: scanCount || 0,
      })

      setLatestScans(
        (scansData || []).map((s) => ({
          id: s.id,
          project_name: (s.projects as unknown as { name: string; id: string })?.name || '—',
          project_id: (s.projects as unknown as { id: string })?.id || '',
          status: s.status,
          completed_targets: s.completed_targets,
          total_targets: s.total_targets,
          started_at: s.started_at,
        }))
      )

      // Build improvements and drops from latest results per target
      const seen = new Set<string>()
      const impr: RankingChange[] = []
      const drps: RankingChange[] = []

      for (const r of resultsData || []) {
        if (seen.has(r.tracking_target_id)) continue
        seen.add(r.tracking_target_id)

        const target = r.tracking_targets as unknown as { project_id: string; projects?: { name: string } } | null
        if (!target) continue

        if (r.change_value !== null && r.change_value > 0) {
          impr.push({
            keyword: r.keyword,
            project_name: target.projects?.name || '—',
            project_id: target.project_id,
            tracking_target_id: r.tracking_target_id,
            engine_type: r.engine_type,
            position: r.position,
            change_value: r.change_value,
          })
        } else if (r.change_value !== null && r.change_value < 0) {
          drps.push({
            keyword: r.keyword,
            project_name: target.projects?.name || '—',
            project_id: target.project_id,
            tracking_target_id: r.tracking_target_id,
            engine_type: r.engine_type,
            position: r.position,
            change_value: r.change_value,
          })
        }
      }

      setImprovements(impr.sort((a, b) => b.change_value - a.change_value).slice(0, 5))
      setDrops(drps.sort((a, b) => a.change_value - b.change_value).slice(0, 5))
      setLoading(false)
    }

    loadDashboard()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin ml-2" />
        {dict.home.loading}
      </div>
    )
  }

  return (
    <div>
      <DashboardOnboardingTour
        totalClients={stats.totalClients}
        totalProjects={stats.totalProjects}
      />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{dict.home.title}</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">{dict.home.welcome}</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label={dict.home.activeClients} value={stats.totalClients} icon={Users} color="indigo" href="/clients" />
        <StatCard label={dict.home.activeProjects} value={stats.totalProjects} icon={Folder} color="indigo" href="/projects" />
        <StatCard label={dict.home.keywords} value={stats.totalKeywords} icon={KeyRound} color="indigo" href="/keywords" />
        <StatCard label={dict.home.scansPerformed} value={stats.totalScans} icon={Search} color="indigo" href="/scans" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Latest Scans */}
        <Card padding={false}>
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">{dict.home.latestScans}</h2>
            <Link href="/scans" className="text-sm text-blue-600 hover:underline">{dict.home.viewAll}</Link>
          </div>
          {latestScans.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">{dict.home.noScans}</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {latestScans.map((scan) => (
                <div key={scan.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800">
                  <div>
                    <Link href={`/projects/${scan.project_id}`} className="font-medium text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 text-sm">
                      {scan.project_name}
                    </Link>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {scan.started_at ? formatDateTime(scan.started_at) : '—'} ·{' '}
                      {scan.completed_targets}/{scan.total_targets} {dict.home.targets}
                    </p>
                  </div>
                  <ScanStatusBadge status={scan.status} />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Quick Links */}
        <Card>
          <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-4">{dict.home.quickLinks}</h2>
          <div className="grid grid-cols-2 gap-3">
            <QuickLink href="/clients" icon={Users} label={dict.sidebar.clients} sub={dict.home.clientsManagement} />
            <QuickLink href="/projects" icon={Folder} label={dict.sidebar.projects} sub={dict.home.allProjects} />
            <QuickLink href="/keyword-research" icon={KeyRound} label={dict.sidebar.keywordResearch} sub={dict.home.trackingPhrases} />
            <QuickLink href="/reports" icon={FileText} label={dict.sidebar.reports} sub={dict.home.excelAndPdf} />
          </div>
        </Card>
      </div>

      {/* Ranking Changes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Improvements */}
        <Card padding={false}>
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
            <TrendingUp size={20} className="text-green-600 dark:text-green-400" strokeWidth={2} />
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">{dict.home.majorImprovements}</h2>
          </div>
          {improvements.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">{dict.home.noRecentImprovements}</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {improvements.map((item) => (
                <div key={item.tracking_target_id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800">
                  <div>
                    <span className="font-medium text-slate-700 dark:text-slate-200 text-sm">{item.keyword}</span>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {item.project_name} · #{item.position}
                    </p>
                  </div>
                  <PositionChange change={item.change_value} />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Drops */}
        <Card padding={false}>
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
            <TrendingDown size={20} className="text-red-600 dark:text-red-400" strokeWidth={2} />
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">{dict.home.majorDrops}</h2>
          </div>
          {drops.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">{dict.home.noRecentDrops}</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {drops.map((item) => (
                <div key={item.tracking_target_id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800">
                  <div>
                    <span className="font-medium text-slate-700 dark:text-slate-200 text-sm">{item.keyword}</span>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {item.project_name} · #{item.position}
                    </p>
                  </div>
                  <PositionChange change={item.change_value} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function StatCard({ label, value, icon: Icon, color, href }: {
  label: string
  value: number
  icon: React.ComponentType<{ size: number; strokeWidth: number }>
  color: string
  href: string
}) {
  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600',
  }

  return (
    <Link href={href}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
            <Icon size={22} strokeWidth={2} />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
          </div>
        </div>
      </Card>
    </Link>
  )
}

function QuickLink({ href, icon: Icon, label, sub }: { href: string; icon: React.ComponentType<{ size: number; strokeWidth: number }>; label: string; sub: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-blue-200 dark:hover:border-blue-700 transition-all"
    >
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
        <Icon size={20} strokeWidth={2} />
      </div>
      <div>
        <div className="font-medium text-slate-700 dark:text-slate-200 text-sm">{label}</div>
        <div className="text-xs text-slate-400 dark:text-slate-500">{sub}</div>
      </div>
    </Link>
  )
}
