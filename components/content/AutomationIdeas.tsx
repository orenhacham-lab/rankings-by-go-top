'use client'

/**
 * AutomationIdeas — "רעיונות אוטומטיים למאמרים" (content automation, Phase 3).
 *
 * Simple, non-SEO-user flow: pick a source (keyword / project data / site
 * keyword research), generate ideas, review cards, bulk-approve selected → they
 * become article_topics (status 'approved'). Rejecting just clears them from the
 * list. No scheduling here (Phase 4). Gated by the caller (automation flag).
 */

import { useRef, useState } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

type Source = 'keyword' | 'project_data' | 'keyword_research_url' | 'site_scan'

interface Suggestion {
  id: string
  title: string
  primaryKeyword: string
  secondaryKeywords: string[]
  searchIntent: string
  recommendedWordCount: number
  angle: string
  suggestedInternalLinks: { url: string; anchor: string }[]
  source: Source
  suggestionReason: string
  suggestionScore: number
}

export default function AutomationIdeas({
  projectId,
  language,
  onCreated,
  onScheduled,
  onTopicsCreated,
}: {
  projectId: string
  language: 'he' | 'en'
  onCreated: () => void
  onScheduled?: () => void
  // Phase 2F.1 — fires with the newly-created topics so the hub can offer the
  // internal-link planning step for exactly those new topic IDs.
  onTopicsCreated?: (topics: { id: string; topic: string; primary_keyword: string | null }[]) => void
}) {
  const t = getDashboardDictionary(language).contentHub.autoIdeas
  const isHebrew = language === 'he'
  const [lastCreatedIds, setLastCreatedIds] = useState<string[]>([])
  const [scheduling, setScheduling] = useState(false)

  // Default to the most SEO-grounded source (real Google Ads keyword data).
  const [source, setSource] = useState<Source>('keyword_research_url')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [ideasExpanded, setIdeasExpanded] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [meta, setMeta] = useState<{ skippedDuplicates: number; finalCount: number; reason?: string; keywordResearchFailed?: boolean } | null>(null)

  const sourceBadge = (s: Source) => (s === 'keyword' ? t.badgeKeyword : s === 'project_data' ? t.badgeProject : s === 'site_scan' ? t.badgeSiteScan : t.badgeResearch)

  // Monotonic request id: only the latest generate() call is allowed to write
  // state, so a slow earlier response can never overwrite a newer one.
  const reqRef = useRef(0)

  async function generate() {
    if (loading) return
    const reqId = ++reqRef.current
    setLoading(true); setMessage(null); setMeta(null); setSelected(new Set()); setSuggestions([])
    try {
      const res = await fetch('/api/content/automation/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, source, keyword: keyword.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (reqId !== reqRef.current) return // a newer request superseded this one
      if (!res.ok) {
        // keyword_required is a real validation error; anything else (5xx /
        // timeout / transient) must NOT read as "no ideas found".
        if (data?.error === 'keyword_required') {
          setMessage({ text: t.keywordPlaceholder, ok: false })
          setSuggestions([])
        } else {
          setSuggestions([])
          setMeta({ skippedDuplicates: 0, finalCount: 0, reason: 'http_error' })
        }
        return
      }
      const list: Suggestion[] = Array.isArray(data.suggestions) ? data.suggestions : []
      setSuggestions(list)
      setSelected(new Set(list.map((s) => s.id))) // pre-select all for quick bulk approve
      setMeta({
        skippedDuplicates: data.meta?.skippedDuplicates ?? 0,
        finalCount: data.meta?.finalCount ?? list.length,
        reason: data.meta?.reason,
        keywordResearchFailed: data.meta?.keywordResearchFailed,
      })
    } catch {
      if (reqId !== reqRef.current) return
      setSuggestions([])
      setMeta({ skippedDuplicates: 0, finalCount: 0, reason: 'http_error' })
    } finally {
      if (reqId === reqRef.current) setLoading(false)
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const selectAll = () => setSelected(new Set(suggestions.map((s) => s.id)))
  const clearSel = () => setSelected(new Set())

  function rejectSelected() {
    setSuggestions((prev) => prev.filter((s) => !selected.has(s.id)))
    setSelected(new Set())
  }

  async function approveSelected() {
    if (creating) return
    const chosen = suggestions.filter((s) => selected.has(s.id))
    if (chosen.length === 0) return
    setCreating(true); setMessage(null)
    try {
      const res = await fetch('/api/content/automation/topics/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, status: 'approved', topics: chosen }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data?.error === 'automation_migration_required' ? 'automation_migration_required' : (data?.error || 'error'), ok: false })
        return
      }
      const created = data.created ?? 0
      const skipped = data.skipped ?? 0
      setMessage({ text: skipped > 0 ? t.createdSkipped.replace('{n}', String(created)).replace('{m}', String(skipped)) : t.createdToast.replace('{n}', String(created)), ok: true })
      // Remove the created ones from the list and refresh the topics table.
      setSuggestions((prev) => prev.filter((s) => !selected.has(s.id)))
      setSelected(new Set())
      setLastCreatedIds(Array.isArray(data.ids) ? data.ids : [])
      const createdTopics = Array.isArray(data.topics)
        ? (data.topics as { id?: unknown; topic?: unknown; primary_keyword?: unknown }[])
            .filter((r): r is { id: string; topic: string; primary_keyword: string | null } => typeof r?.id === 'string')
            .map((r) => ({ id: r.id, topic: typeof r.topic === 'string' ? r.topic : '', primary_keyword: typeof r.primary_keyword === 'string' ? r.primary_keyword : null }))
        : []
      if (createdTopics.length) onTopicsCreated?.(createdTopics)
      onCreated()
    } catch {
      setMessage({ text: 'error', ok: false })
    } finally {
      setCreating(false)
    }
  }

  async function addCreatedToSchedule() {
    if (scheduling || lastCreatedIds.length === 0) return
    setScheduling(true); setMessage(null)
    try {
      // Ensure the project's pool exists WITHOUT mutating an existing one: GET
      // first, and only create a new (paused) pool when none exists. This never
      // flips an already-active pool to paused.
      let poolId: string | null = null
      try {
        const gr = await fetch(`/api/content/automation/pools?projectId=${encodeURIComponent(projectId)}`)
        if (gr.ok) { const gd = await gr.json(); poolId = gd.pool?.id ?? null }
      } catch { /* fall through to create */ }
      if (!poolId) {
        const pr = await fetch('/api/content/automation/pools', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, cadence: 'weekly', intervalDays: 7, isActive: false }),
        })
        if (!pr.ok) { setMessage({ text: 'error', ok: false }); return }
        const pd = await pr.json()
        poolId = pd.pool?.id ?? null
      }
      if (!poolId) { setMessage({ text: 'error', ok: false }); return }
      await fetch(`/api/content/automation/pools/${poolId}/items`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicIds: lastCreatedIds }),
      })
      setLastCreatedIds([])
      onScheduled?.()
    } finally {
      setScheduling(false)
    }
  }

  // Strongest SEO source first (site keyword research), then keyword, then project data.
  const sourceTabs: { key: Source; label: string }[] = [
    { key: 'keyword_research_url', label: t.sourceResearch },
    { key: 'site_scan', label: t.sourceSiteScan },
    { key: 'keyword', label: t.sourceKeyword },
    { key: 'project_data', label: t.sourceProject },
  ]

  return (
    <Card className="hover:translate-y-0">
      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{t.title}</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-3">{t.intro}</p>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {sourceTabs.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSource(s.key)}
            className={`text-xs font-medium rounded-full px-3 py-1.5 border ${
              source === s.key
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {source === 'keyword' && (
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t.keywordPlaceholder}
            className="flex-1 min-w-[12rem] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm"
          />
        )}
        <Button onClick={generate} loading={loading} disabled={loading || (source === 'keyword' && !keyword.trim())}>
          {loading ? (source === 'site_scan' ? t.siteScanAnalyzing : t.generating) : t.generate}
        </Button>
      </div>

      {message && (
        <p className={`text-xs mb-2 ${message.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{message.text}</p>
      )}
      {/* Batch feedback: what was found vs. filtered, or a helpful empty reason. */}
      {meta && suggestions.length > 0 && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
          {t.foundSummary.replace('{found}', String(suggestions.length)).replace('{skipped}', String(meta.skippedDuplicates))}
        </p>
      )}
      {meta && suggestions.length === 0 && !loading && (
        <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">
          {meta.reason === 'no_scan'
            ? t.noScan
            : meta.reason === 'insufficient_data'
              ? t.insufficientScan
              : meta.reason === 'model_error' || meta.reason === 'http_error'
                ? t.temporaryError
                : meta.keywordResearchFailed || meta.reason === 'keyword_research_failed'
                  ? t.researchFailed
                  : meta.reason === 'all_duplicates'
                    ? t.allDuplicates
                    : t.tryOther}
        </p>
      )}
      {lastCreatedIds.length > 0 && (
        <div className="mb-3 rounded-lg border border-indigo-300 dark:border-indigo-500/40 bg-indigo-50 dark:bg-indigo-500/10 px-3 py-2.5 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-indigo-800 dark:text-indigo-200 flex-1">
            {t.approvedCta.replace('{n}', String(lastCreatedIds.length))}
          </span>
          <Button onClick={addCreatedToSchedule} loading={scheduling} disabled={scheduling}>{t.addToSchedule}</Button>
        </div>
      )}

      {suggestions.length === 0 && !loading ? (
        null
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Button size="sm" variant="ghost" onClick={selectAll}>{t.selectAll}</Button>
            <Button size="sm" variant="ghost" onClick={clearSel}>{t.clear}</Button>
            <div className="flex-1" />
            <Button size="sm" variant="outline" onClick={rejectSelected} disabled={selected.size === 0}>{t.rejectSelected}</Button>
            <Button size="sm" onClick={approveSelected} loading={creating} disabled={creating || selected.size === 0}>
              {creating ? t.creating : `${t.approveSelected} (${selected.size})`}
            </Button>
          </div>

          <div className="space-y-2">
            {(ideasExpanded ? suggestions : suggestions.slice(0, 3)).map((s) => (
              <div key={s.id} className="rounded-lg border border-slate-100 dark:border-slate-800 p-3">
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="mt-1 h-4 w-4 accent-indigo-600" />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{s.title}</span>
                      <Badge variant="neutral">{sourceBadge(s.source)}</Badge>
                      {typeof s.suggestionScore === 'number' && (
                        <span className="text-[10px] text-slate-400">{Math.round(s.suggestionScore * 100)}%</span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">
                      {t.keywordLabel}: <span className="font-medium">{s.primaryKeyword}</span>
                      {s.searchIntent ? <> · {t.intentLabel}: {s.searchIntent}</> : null}
                    </div>
                    {s.secondaryKeywords.length > 0 && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t.secondaryLabel}: {s.secondaryKeywords.join(' · ')}</div>
                    )}
                    {s.suggestionReason && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t.reasonLabel}: {s.suggestionReason}</div>
                    )}
                    {s.suggestedInternalLinks.length > 0 && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5" dir={isHebrew ? 'rtl' : 'ltr'}>
                        {t.internalLinksLabel}: {s.suggestedInternalLinks.map((l) => l.anchor).join(' · ')}
                      </div>
                    )}
                  </div>
                </label>
              </div>
            ))}
            {suggestions.length > 3 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setIdeasExpanded((v) => !v)}
                  className="inline-flex items-center justify-center gap-1 rounded-full border border-indigo-200 dark:border-indigo-500/40 px-3.5 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                >
                  {ideasExpanded ? t.showLess : `${t.showMoreIdeas} (${suggestions.length - 3})`}
                </button>
              </div>
            )}
          </div>

          <p className="text-[11px] text-slate-400 mt-3">{t.nextStepHint}</p>
        </>
      )}
    </Card>
  )
}
