'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TrackingTarget, ScanResult, Project } from '@/lib/supabase/types'
import Header from '@/components/layout/Header'
import { Table, TableHead, TableBody, TableRow, Th, Td, EmptyRow } from '@/components/ui/Table'
import { ActiveBadge, EngineBadge, PositionChange } from '@/components/ui/StatusBadge'
import { formatDateTime } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import Link from 'next/link'
import Button from '@/components/ui/Button'

export default function KeywordsPage() {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const k = dict.keywordsPage

  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [targets, setTargets] = useState<(TrackingTarget & { projects?: { name: string; id: string; clients?: { name: string } } })[]>([])
  const [latestResults, setLatestResults] = useState<Record<string, ScanResult>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [engineFilter, setEngineFilter] = useState('')
  const [positionSort, setPositionSort] = useState<'none' | 'asc' | 'desc'>('none')
  const [volumeSort, setVolumeSort] = useState<'none' | 'asc' | 'desc'>('none')

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
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name')

      setProjects(projectsData || [])
      setLoading(false)
    }
    loadProjects()
  }, [])

  useEffect(() => {
    async function loadData() {
      if (!selectedProjectId) {
        setTargets([])
        setLatestResults({})
        return
      }

      setLoading(true)
      const supabase = createClient()
      const { data: targetsData } = await supabase
        .from('tracking_targets')
        .select('*, projects(id, name, device_type, clients(name))')
        .eq('project_id', selectedProjectId)
        .order('created_at', { ascending: false })

      setTargets(targetsData || [])

      if (targetsData && targetsData.length > 0) {
        const ids = targetsData.map((t) => t.id)
        const { data: resultsData } = await supabase
          .from('scan_results')
          .select('*')
          .in('tracking_target_id', ids)
          .order('checked_at', { ascending: false })

        const latest: Record<string, ScanResult> = {}
        for (const result of resultsData || []) {
          if (!latest[result.tracking_target_id]) {
            latest[result.tracking_target_id] = result
          }
        }
        setLatestResults(latest)
      }

      setLoading(false)
    }

    loadData()
  }, [selectedProjectId])

  const filtered = targets.filter((t) => {
    const matchSearch =
      !search ||
      t.keyword.toLowerCase().includes(search.toLowerCase()) ||
      (t.projects?.name || '').toLowerCase().includes(search.toLowerCase())
    const matchEngine = !engineFilter || t.engine_type === engineFilter
    return matchSearch && matchEngine
  })

  const sorted = [...filtered].sort((a, b) => {
    if (volumeSort !== 'none') {
      const aVol = a.avg_monthly_searches ?? -1
      const bVol = b.avg_monthly_searches ?? -1
      if (aVol !== bVol) {
        return volumeSort === 'asc' ? aVol - bVol : bVol - aVol
      }
    }

    if (positionSort !== 'none') {
      const aResult = latestResults[a.id]
      const bResult = latestResults[b.id]
      const aPos = aResult?.found && aResult.position !== null ? aResult.position : Number.POSITIVE_INFINITY
      const bPos = bResult?.found && bResult.position !== null ? bResult.position : Number.POSITIVE_INFINITY
      return positionSort === 'asc' ? aPos - bPos : bPos - aPos
    }

    return 0
  })

  function togglePositionSort() {
    setVolumeSort('none')
    setPositionSort((prev) => {
      if (prev === 'none') return 'asc'
      if (prev === 'asc') return 'desc'
      return 'none'
    })
  }

  function toggleVolumeSort() {
    setPositionSort('none')
    setVolumeSort((prev) => {
      if (prev === 'none') return 'desc'
      if (prev === 'desc') return 'asc'
      return 'none'
    })
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId)

  return (
    <div>
      <Header
        title={k.title}
        subtitle={selectedProjectId ? `${k.countPrefix} ${targets.length} ${k.countSuffix}` : k.selectProjectHint}
        actions={
          selectedProjectId ? (
            <Link href={`/projects/${selectedProjectId}?section=rankings`}>
              <Button size="sm">{k.openProjectButton}</Button>
            </Link>
          ) : null
        }
      />

      <div className="flex gap-3 mb-4">
        <select
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
        >
          <option value="">{k.selectProjectPlaceholder}</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder={k.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-sm px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
        />
        <select
          value={engineFilter}
          onChange={(e) => setEngineFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
        >
          <option value="">{k.allEngines}</option>
          <option value="google_search">{k.engineGoogleSearch}</option>
          <option value="google_maps">{k.engineGoogleMaps}</option>
        </select>
      </div>

      {!selectedProjectId ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center text-slate-500 dark:text-slate-400">
          {k.selectProjectMessage}
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin ml-2" />
          {dict.common.loading}
        </div>
      ) : (
        <Table>
          <TableHead>
            <tr>
              <Th>{k.table.keyword}</Th>
              <Th>{k.table.project}</Th>
              <Th>
                <button
                  type="button"
                  onClick={toggleVolumeSort}
                  className="inline-flex items-center gap-1 hover:text-blue-700 transition-colors"
                  title={k.sortByVolumeTooltip}
                >
                  {k.table.searchVolume}
                  <span className="text-xs">
                    {volumeSort === 'asc' ? '▲' : volumeSort === 'desc' ? '▼' : '↕'}
                  </span>
                </button>
              </Th>
              <Th>{k.table.engine}</Th>
              <Th>
                <button
                  type="button"
                  onClick={togglePositionSort}
                  className="inline-flex items-center gap-1 hover:text-blue-700 transition-colors"
                  title={k.sortByPositionTooltip}
                >
                  {k.table.position}
                  <span className="text-xs">
                    {positionSort === 'asc' ? '▲' : positionSort === 'desc' ? '▼' : '↕'}
                  </span>
                </button>
              </Th>
              <Th>{k.table.change}</Th>
              <Th>{k.table.lastChecked}</Th>
              <Th>{k.table.status}</Th>
              <Th>{k.table.actions}</Th>
            </tr>
          </TableHead>
          <TableBody>
            {sorted.length === 0 && (
              <EmptyRow colSpan={9} message={k.table.emptyState} />
            )}
            {sorted.map((target) => {
              const result = latestResults[target.id]
              return (
                <TableRow key={target.id}>
                  <Td>
                    <span className="font-medium">{target.keyword}</span>
                  </Td>
                  <Td>
                    {target.projects ? (
                      <Link
                        href={`/projects/${target.projects.id}?section=rankings`}
                        className="text-blue-600 hover:underline text-sm"
                      >
                        {target.projects.name}
                      </Link>
                    ) : '—'}
                  </Td>
                  <Td>
                    <span className="text-slate-700 dark:text-slate-200 text-sm tabular-nums">
                      {target.avg_monthly_searches ? target.avg_monthly_searches.toLocaleString() : '—'}
                    </span>
                  </Td>
                  <Td>
                    <EngineBadge
                      engine={target.engine_type}
                      device={(target.projects as { device_type?: 'desktop' | 'mobile' | null } | undefined)?.device_type}
                    />
                  </Td>
                  <Td>
                    {result?.error_message ? (
                      <span className="text-amber-600 text-sm" title={result.error_message}>{k.table.scanError}</span>
                    ) : result?.found ? (
                      <span className="font-bold">#{result.position}</span>
                    ) : result ? (
                      <span className="text-slate-400 text-sm">{k.table.notFound}</span>
                    ) : '—'}
                  </Td>
                  <Td>
                    {result ? <PositionChange change={result.change_value} /> : '—'}
                  </Td>
                  <Td>
                    <span className="text-xs text-slate-500">
                      {result ? formatDateTime(result.checked_at) : '—'}
                    </span>
                  </Td>
                  <Td>
                    <ActiveBadge active={target.is_active} />
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      <Link href={`/keywords/${target.id}/history`}>
                        <Button size="sm" variant="ghost">{k.actions.history}</Button>
                      </Link>
                      {target.projects && (
                        <Link href={`/projects/${target.projects.id}?section=rankings`}>
                          <Button size="sm" variant="outline">{k.actions.open}</Button>
                        </Link>
                      )}
                    </div>
                  </Td>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
