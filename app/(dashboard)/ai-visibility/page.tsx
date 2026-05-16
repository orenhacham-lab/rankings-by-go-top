'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Project, Client } from '@/lib/supabase/types'
import Header from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Link from 'next/link'

type Summary = {
  projectId: string
  totalQueries: number
  totalScans: number
  totalMentions: number
  totalCitations: number
  visibilityScore: number
  lastScanAt: string | null
}

type ProjectRow = Project & { clients?: Client | null }

export default function AIVisibilityPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [summaries, setSummaries] = useState<Map<string, Summary>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setLoading(false)
          return
        }

        const projectsPromise = supabase
          .from('projects')
          .select('*, clients(*)')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('name')

        const summaryPromise = fetch('/api/ai-visibility/summary')

        const [projectsRes, summaryRes] = await Promise.all([projectsPromise, summaryPromise])
        const projectsData = (projectsRes.data ?? []) as ProjectRow[]
        setProjects(projectsData)

        if (summaryRes.ok) {
          const json = await summaryRes.json()
          const map = new Map<string, Summary>()
          for (const s of json.summaries ?? []) {
            map.set(s.projectId, s)
          }
          setSummaries(map)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const formatDate = (iso: string | null): string => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleDateString('he-IL', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return '—'
    }
  }

  const overallStats = useMemo(() => {
    let totalQueries = 0
    let totalScans = 0
    let totalMentions = 0
    let totalCitations = 0
    let avgScore = 0
    let scoreCount = 0
    for (const summary of summaries.values()) {
      totalQueries += summary.totalQueries
      totalScans += summary.totalScans
      totalMentions += summary.totalMentions
      totalCitations += summary.totalCitations
      if (summary.totalScans > 0) {
        avgScore += summary.visibilityScore
        scoreCount++
      }
    }
    return {
      totalProjects: projects.length,
      totalQueries,
      totalScans,
      totalMentions,
      totalCitations,
      avgScore: scoreCount > 0 ? Math.round(avgScore / scoreCount) : 0,
    }
  }, [summaries, projects.length])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin ml-2" />
        טוען...
      </div>
    )
  }

  return (
    <div>
      <Header title="נראות ב-AI" subtitle="ההופעות של האתר שלך בתוצאות AI לפי פרויקט" />

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {projects.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <p className="mb-4">אין פרויקטים זמינים</p>
          <Link href="/projects/new">
            <Button>+ הוסף פרויקט</Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
            <Card className="p-3">
              <div className="text-[11px] text-slate-500 mb-1">סה״כ פרויקטים</div>
              <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{overallStats.totalProjects}</div>
            </Card>
            <Card className="p-3">
              <div className="text-[11px] text-slate-500 mb-1">סה״כ שאילתות</div>
              <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{overallStats.totalQueries}</div>
            </Card>
            <Card className="p-3">
              <div className="text-[11px] text-slate-500 mb-1">סה״כ סריקות</div>
              <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{overallStats.totalScans}</div>
            </Card>
            <Card className="p-3">
              <div className="text-[11px] text-slate-500 mb-1">סה״כ אזכורים</div>
              <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{overallStats.totalMentions}</div>
            </Card>
            <Card className="p-3">
              <div className="text-[11px] text-slate-500 mb-1">סה״כ ציטוטים</div>
              <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{overallStats.totalCitations}</div>
            </Card>
            <Card className="p-3">
              <div className="text-[11px] text-slate-500 mb-1">ממוצע נראות</div>
              <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{overallStats.avgScore}%</div>
            </Card>
          </div>

          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">פרויקטים</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => {
            const summary = summaries.get(project.id)
            const score = summary?.visibilityScore ?? 0
            const scoreTone: 'success' | 'warning' | 'danger' | 'neutral' =
              !summary || summary.totalScans === 0
                ? 'neutral'
                : score >= 60
                ? 'success'
                : score >= 30
                ? 'warning'
                : 'danger'

            return (
              <Card key={project.id} className="p-4 hover:shadow-md transition flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 truncate">{project.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate font-mono">{project.target_domain}</p>
                    {project.clients?.name && (
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{project.clients.name}</p>
                    )}
                  </div>
                  <Badge variant={scoreTone}>
                    {summary && summary.totalScans > 0 ? `${score}%` : 'אין נתונים'}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-md p-2">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">שאילתות</div>
                    <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{summary?.totalQueries ?? 0}</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-md p-2">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">סריקות</div>
                    <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{summary?.totalScans ?? 0}</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-md p-2">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">הזכרות</div>
                    <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{summary?.totalMentions ?? 0}</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-md p-2">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">ציטוטים</div>
                    <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{summary?.totalCitations ?? 0}</div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
                  סריקה אחרונה: {formatDate(summary?.lastScanAt ?? null)}
                </div>

                <Link
                  href={`/projects/${project.id}?section=ai-visibility`}
                  className="mt-auto block"
                >
                  <Button variant="secondary" size="sm" className="w-full">
                    פתח נראות ב-AI ←
                  </Button>
                </Link>
              </Card>
            )
          })}
        </div>
        </>
      )}
    </div>
  )
}
