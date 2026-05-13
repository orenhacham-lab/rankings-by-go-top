'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Project, Client } from '@/lib/supabase/types'
import Header from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Link from 'next/link'

interface AIVisibilityMetrics {
  totalScans: number
  totalMentions: number
  totalCitations: number
  totalQueries: number
  lastScanAt: string | null
}

export default function AIVisibilityPage() {
  const [projects, setProjects] = useState<(Project & { clients?: Client; metricsLoading?: boolean; metrics?: AIVisibilityMetrics })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadProjects() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const { data: projectsData } = await supabase
        .from('projects')
        .select('*, clients(*)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name')

      const withMetrics = (projectsData || []).map((p) => ({ ...p, metricsLoading: true }))
      setProjects(withMetrics)

      // Load metrics for each project in parallel
      for (const project of withMetrics) {
        loadMetrics(project.id, supabase)
      }

      setLoading(false)
    }

    async function loadMetrics(projectId: string, supabase: any) {
      try {
        const [runs, prompts] = await Promise.all([
          supabase.from('ai_runs').select('*').eq('project_id', projectId),
          supabase.from('ai_prompts').select('id').eq('project_id', projectId),
        ])

        const successfulScans = (runs.data || []).filter((r: any) => r.status === 'success').length
        let totalMentions = 0
        let totalCitations = 0

        for (const run of runs.data || []) {
          if (run.mentioned) totalMentions++
          totalCitations += run.citationCount || 0
        }

        const lastScan = (runs.data || [])
          .filter((r: any) => r.status === 'success')
          .sort((a: any, b: any) => new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime())
          [0]

        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  metricsLoading: false,
                  metrics: {
                    totalScans: successfulScans,
                    totalMentions,
                    totalCitations,
                    totalQueries: (prompts.data || []).length,
                    lastScanAt: lastScan ? lastScan.completedAt || lastScan.createdAt : null,
                  },
                }
              : p
          )
        )
      } catch (e) {
        console.error('Failed to load metrics for project', projectId, e)
      }
    }

    loadProjects()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin ml-2" />
        טוען...
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div>
        <Header title="נראות ב-AI" subtitle="עקוב אחר הופעות האתר שלך בתוצאות AI" />
        <div className="text-center py-20 text-slate-500">
          <p className="mb-4">אין פרויקטים זמינים</p>
          <Link href="/projects/new">
            <Button>+ הוסף פרויקט</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Header title="נראות ב-AI" subtitle="עקוב אחר הופעות האתר שלך בתוצאות AI" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((project) => (
          <Card key={project.id} className="p-4 hover:shadow-md transition">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-900 truncate">{project.name}</h3>
                <p className="text-xs text-slate-500 truncate">{project.target_domain}</p>
              </div>
            </div>

            <div className="space-y-2 mb-4 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">סריקות:</span>
                <span className="font-medium text-slate-900">
                  {project.metricsLoading ? '...' : project.metrics?.totalScans || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">הזכרות:</span>
                <span className="font-medium text-slate-900">
                  {project.metricsLoading ? '...' : project.metrics?.totalMentions || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">ציטוטים:</span>
                <span className="font-medium text-slate-900">
                  {project.metricsLoading ? '...' : project.metrics?.totalCitations || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">שאילתות:</span>
                <span className="font-medium text-slate-900">
                  {project.metricsLoading ? '...' : project.metrics?.totalQueries || 0}
                </span>
              </div>
              {project.metrics?.lastScanAt && (
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">סריקה אחרונה:</span>
                  <span className="text-slate-700">
                    {new Date(project.metrics.lastScanAt).toLocaleDateString('he-IL')}
                  </span>
                </div>
              )}
            </div>

            <Link href={`/projects/${project.id}#ai-visibility`} className="block">
              <Button variant="secondary" size="sm" className="w-full">
                פתח
              </Button>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  )
}
