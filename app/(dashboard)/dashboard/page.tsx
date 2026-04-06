'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Table, TableHead, TableBody, TableRow, Th, Td, EmptyRow } from '@/components/ui/Table'
import { ScanStatusBadge, PositionChange, EngineBadge } from '@/components/ui/StatusBadge'
import { formatDateTime } from '@/lib/utils'
import Link from 'next/link'

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
  const [stats, setStats] = useState<DashboardStats>({ totalClients: 0, totalProjects: 0, totalKeywords: 0, totalScans: 0 })
  const [latestScans, setLatestScans] = useState<LatestScan[]>([])
  const [improvements, setImprovements] = useState<RankingChange[]>([])
  const [drops, setDrops] = useState<RankingChange[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadDashboard() {
      const supabase = createClient()

      const [
        { count: clientCount },
        { count: projectCount },
        { count: keywordCount },
        { count: scanCount },
        { data: scansData },
        { data: resultsData },
      ] = await Promise.all([
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('projects').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('tracking_targets').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('scans').select('*', { count: 'exact', head: true }),
        supabase
          .from('scans')
          .select('id, status, completed_targets, total_targets, started_at, projects(id, name)')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('scan_results')
          .select('tracking_target_id, keyword, engine_type, position, change_value, checked_at, tracking_targets(project_id, projects(name))')
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
        טוען לוח בקרה...
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">לוח בקרה</h1>
        <p className="text-slate-500 text-sm mt-0.5">ברוך הבא למערכת Rankings by Go Top</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="לקוחות פעילים" value={stats.totalClients} icon="👥" color="blue" href="/clients" />
        <StatCard label="פרויקטים פעילים" value={stats.totalProjects} icon="📁" color="purple" href="/projects" />
        <StatCard label="מילות מפתח" value={stats.totalKeywords} icon="🔑" color="green" href="/keywords" />
        <StatCard label="סריקות שבוצעו" value={stats.totalScans} icon="🔍" color="orange" href="/scans" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Latest Scans */}
        <Card padding={false}>
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">סריקות אחרונות</h2>
            <Link href="/scans" className="text-sm text-blue-600 hover:underline">הכל</Link>
          </div>
          {latestScans.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">אין סריקות עדיין</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {latestScans.map((scan) => (
                <div key={scan.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50">
                  <div>
                    <Link href={`/projects/${scan.project_id}`} className="font-medium text-slate-700 hover:text-blue-600 text-sm">
                      {scan.project_name}
                    </Link>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {scan.started_at ? formatDateTime(scan.started_at) : '—'} ·{' '}
                      {scan.completed_targets}/{scan.total_targets} יעדים
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
          <h2 className="font-semibold text-slate-800 mb-4">קישורים מהירים</h2>
          <div className="grid grid-cols-2 gap-3">
            <QuickLink href="/clients" icon="👥" label="לקוחות" sub="ניהול לקוחות" />
            <QuickLink href="/projects" icon="📁" label="פרויקטים" sub="כל הפרויקטים" />
            <QuickLink href="/keywords" icon="🔑" label="מילות מפתח" sub="מעקב ביטויים" />
            <QuickLink href="/reports" icon="📄" label="דוחות" sub="Excel ו-PDF" />
          </div>
        </Card>
      </div>

      {/* Ranking Changes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Improvements */}
        <Card padding={false}>
          <div className="p-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">📈 שיפורים גדולים</h2>
          </div>
          {improvements.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">אין שיפורים לאחרונה</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {improvements.map((item) => (
                <div key={item.tracking_target_id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50">
                  <div>
                    <span className="font-medium text-slate-700 text-sm">{item.keyword}</span>
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
          <div className="p-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">📉 ירידות גדולות</h2>
          </div>
          {drops.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">אין ירידות לאחרונה</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {drops.map((item) => (
                <div key={item.tracking_target_id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50">
                  <div>
                    <span className="font-medium text-slate-700 text-sm">{item.keyword}</span>
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

function StatCard({ label, value, icon, color, href }: {
  label: string
  value: number
  icon: string
  color: string
  href: string
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    green: 'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-600',
  }

  return (
    <Link href={href}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl ${colorMap[color]}`}>
            {icon}
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-800">{value}</div>
            <div className="text-xs text-slate-500">{label}</div>
          </div>
        </div>
      </Card>
    </Link>
  )
}

function QuickLink({ href, icon, label, sub }: { href: string; icon: string; label: string; sub: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 hover:border-blue-200 transition-all"
    >
      <span className="text-2xl">{icon}</span>
      <div>
        <div className="font-medium text-slate-700 text-sm">{label}</div>
        <div className="text-xs text-slate-400">{sub}</div>
      </div>
    </Link>
  )
}
