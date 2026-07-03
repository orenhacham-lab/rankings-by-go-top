'use client'

/**
 * Content Hub — standalone content workspace (Phase 1.5, read-only).
 *
 * Tool-first entry: pick a project at the top, see its article stats + list,
 * and manage its WordPress connection. NO generation/publish/scheduling yet —
 * those actions render as disabled "coming soon". Data comes from the read-only
 * /api/content/overview endpoint (no secrets, RLS-scoped).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { Table, TableHead, TableBody, TableRow, Th, Td, EmptyRow } from '@/components/ui/Table'
import WordPressConnectionPanel from '@/components/content/WordPressConnectionPanel'
import ArticleBriefModal from '@/components/content/ArticleBriefModal'
import TopicsList from '@/components/content/TopicsList'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatDate } from '@/lib/utils'
import { ExternalLink, Plus } from 'lucide-react'
import type { ArticleTopic } from '@/lib/supabase/types'

type ProjectOption = { id: string; name: string; business_name: string | null; target_domain: string | null; language: string | null }

type Counts = {
  total: number; draft: number; ready: number; scheduled: number
  publishing: number; published: number; failed: number
}

type ArticleRow = {
  id: string; title: string; slug: string; status: string
  wp_post_id: number | null; wp_post_url: string | null
  scheduled_at: string | null; published_at: string | null
  created_at: string; updated_at: string
}

type Overview = {
  projects: ProjectOption[]
  selected: string | null
  counts: Counts | null
  articles: ArticleRow[]
  wordpress: { connected: boolean; siteUrl: string | null; status: string | null } | null
}

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  draft: 'neutral',
  ready: 'info',
  scheduled: 'warning',
  publishing: 'warning',
  published: 'success',
  failed: 'danger',
}

export default function ContentHub() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = searchParams.get('projectId') || ''

  const { language } = useDashboardLanguage()
  const t = useMemo(() => getDashboardDictionary(language).contentHub, [language])
  const isHebrew = language === 'he'

  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'articles' | 'gbp' | 'scheduled'>('articles')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [topics, setTopics] = useState<ArticleTopic[]>([])
  const [briefOpen, setBriefOpen] = useState(false)
  const [editingTopic, setEditingTopic] = useState<ArticleTopic | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
      const res = await fetch(`/api/content/overview${qs}`)
      if (res.ok) setData(await res.json())
    } catch {
      // Non-fatal: the page still renders its empty/selector states.
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const loadTopics = useCallback(async () => {
    if (!projectId) { setTopics([]); return }
    try {
      const res = await fetch(`/api/content/topics?projectId=${encodeURIComponent(projectId)}`)
      if (res.ok) {
        const json = await res.json()
        setTopics(json.topics || [])
      }
    } catch {
      // Non-fatal: the topics section simply shows its empty state.
    }
  }, [projectId])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadTopics() }, [loadTopics])

  // Auto-select when the user has exactly one project and none is chosen yet.
  useEffect(() => {
    if (!projectId && data && data.projects.length === 1) {
      router.replace(`/content?projectId=${data.projects[0].id}`)
    }
  }, [projectId, data, router])

  function onSelectProject(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value
    router.push(id ? `/content?projectId=${id}` : '/content')
  }

  const projects = data?.projects ?? []
  const counts = data?.counts
  const selectedProject = projects.find((p) => p.id === projectId) || null

  const filteredArticles = (data?.articles ?? []).filter((a) => {
    const matchStatus = !statusFilter || a.status === statusFilter
    const matchSearch = !search || a.title.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  const statusLabel = (s: string) =>
    (t.status as Record<string, string>)[s] ?? s

  const statCards = counts
    ? [
        { key: 'total', label: t.stats.total, value: counts.total },
        { key: 'draft', label: t.stats.draft, value: counts.draft },
        { key: 'ready', label: t.stats.ready, value: counts.ready },
        { key: 'scheduled', label: t.stats.scheduled, value: counts.scheduled },
        { key: 'published', label: t.stats.published, value: counts.published },
        { key: 'failed', label: t.stats.failed, value: counts.failed },
      ]
    : []

  return (
    <div dir={isHebrew ? 'rtl' : 'ltr'}>
      <Header title={t.title} subtitle={t.subtitle} />

      {/* Coming-soon context banner (this is an SEO/GEO content hub) */}
      <div className="mb-4 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-900/10 px-3 py-2 text-xs text-indigo-700 dark:text-indigo-300">
        {t.comingSoonBanner}
      </div>

      {/* No projects → empty state */}
      {!loading && projects.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{t.noProjectsTitle}</p>
          <Link href="/projects/new"><Button>{t.noProjectsCta}</Button></Link>
        </Card>
      ) : (
        <>
          {/* Project selector */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <label className="text-sm text-slate-600 dark:text-slate-300">{t.selectProject}</label>
            <select
              value={projectId}
              onChange={onSelectProject}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t.selectProjectPlaceholder}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Tabs — only "Articles" is active in Phase 1.5 */}
          <div className="flex items-center gap-1 mb-6 border-b border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setActiveTab('articles')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                activeTab === 'articles'
                  ? 'border-indigo-600 text-indigo-700 dark:text-indigo-300'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {t.tabs.articles}
            </button>
            {(['gbpPosts', 'scheduled'] as const).map((key) => (
              <span
                key={key}
                className="px-4 py-2 text-sm font-medium text-slate-400 dark:text-slate-600 cursor-not-allowed inline-flex items-center gap-1.5"
                title={t.tabs.comingSoon}
              >
                {t.tabs[key]}
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">{t.tabs.comingSoon}</span>
              </span>
            ))}
          </div>

          {/* No project selected yet (multi-project) */}
          {!projectId ? (
            <Card className="p-10 text-center text-slate-500 dark:text-slate-400">
              {t.selectProjectMessage}
            </Card>
          ) : (
            <>
              {/* Primary action */}
              <div className="flex justify-end mb-4">
                <Button onClick={() => { setEditingTopic(null); setBriefOpen(true) }}>
                  <Plus size={16} /> {t.newTopicButton}
                </Button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                {statCards.map((s) => (
                  <Card key={s.key} className="p-3 hover:translate-y-0">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">{s.label}</div>
                    <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{s.value}</div>
                  </Card>
                ))}
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-3 mb-3">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">{t.filters.allStatuses}</option>
                  {['draft', 'ready', 'scheduled', 'publishing', 'published', 'failed'].map((s) => (
                    <option key={s} value={s}>{statusLabel(s)}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder={t.filters.search}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 max-w-xs px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Article table */}
              <div className="overflow-x-auto mb-6">
                <Table>
                  <TableHead>
                    <tr>
                      <Th>{t.table.title}</Th>
                      <Th>{t.table.project}</Th>
                      <Th>{t.table.status}</Th>
                      <Th>{t.table.created}</Th>
                      <Th>{t.table.updated}</Th>
                      <Th>{t.table.scheduledAt}</Th>
                      <Th>{t.table.publishedAt}</Th>
                      <Th>{t.table.wordpressUrl}</Th>
                      <Th>{t.table.actions}</Th>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {filteredArticles.length === 0 ? (
                      <EmptyRow colSpan={9} message={t.table.emptyTitle} />
                    ) : (
                      filteredArticles.map((a) => (
                        <TableRow key={a.id}>
                          <Td><span className="font-medium">{a.title}</span></Td>
                          <Td><span className="text-sm text-slate-600 dark:text-slate-300">{selectedProject?.name ?? '—'}</span></Td>
                          <Td><Badge variant={STATUS_TONE[a.status] ?? 'neutral'}>{statusLabel(a.status)}</Badge></Td>
                          <Td><span className="text-xs text-slate-500">{formatDate(a.created_at)}</span></Td>
                          <Td><span className="text-xs text-slate-500">{formatDate(a.updated_at)}</span></Td>
                          <Td><span className="text-xs text-slate-500">{a.scheduled_at ? formatDate(a.scheduled_at) : '—'}</span></Td>
                          <Td><span className="text-xs text-slate-500">{a.published_at ? formatDate(a.published_at) : '—'}</span></Td>
                          <Td>
                            {a.wp_post_url ? (
                              <a href={a.wp_post_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm inline-flex items-center gap-1">
                                {t.table.openInWordpress}<ExternalLink size={12} />
                              </a>
                            ) : '—'}
                          </Td>
                          <Td>
                            <div className="flex items-center gap-2">
                              <Link href={`/content/articles/${a.id}`} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                                {t.actions.edit}
                              </Link>
                              {/* Publish/Schedule arrive in later phases. */}
                              <span className="text-xs text-slate-400 dark:text-slate-600" title={t.actions.comingSoon}>
                                {t.actions.publish} · {t.actions.comingSoon}
                              </span>
                            </div>
                          </Td>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                {filteredArticles.length === 0 && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 px-1">{t.table.emptyHint}</p>
                )}
              </div>

              {/* Topics / Briefs */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-2">{t.topicsHeading}</h3>
                <TopicsList
                  topics={topics}
                  projectName={selectedProject?.name ?? '—'}
                  onEdit={(topic) => { setEditingTopic(topic); setBriefOpen(true) }}
                  onChanged={loadTopics}
                />
              </div>

              {/* WordPress connection — reuse the existing self-contained panel */}
              <WordPressConnectionPanel projectId={projectId} />
            </>
          )}
        </>
      )}

      <ArticleBriefModal
        open={briefOpen}
        onClose={() => setBriefOpen(false)}
        projects={projects}
        defaultProjectId={projectId}
        editing={editingTopic}
        onSaved={loadTopics}
      />
    </div>
  )
}
