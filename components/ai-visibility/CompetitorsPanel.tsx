'use client'

/**
 * CompetitorsPanel — Phase 1 of AI Visibility competitor tracking.
 *
 * Lets the user define up to 3 active competitors per project (name, optional
 * domain, optional alternative names). Competitors are stored in
 * ai_visibility_competitors via /api/projects/[id]/ai-visibility/competitors.
 *
 * Phase 1 scope is CRUD only — scans, results, and detection logic are NOT
 * touched. Soft-delete only (is_active=false) to keep historical analytics
 * stable for future Share of Voice / Timeline phases.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, RotateCcw, X, Check } from 'lucide-react'
import Button from '@/components/ui/Button'
import { createI18n } from '@/lib/ai-visibility/i18n'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'

const MAX_ACTIVE = 3

type Competitor = {
  id: string
  name: string
  domain: string | null
  aliases: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}

type DraftForm = {
  name: string
  domain: string
  aliasesText: string
}

function parseAliases(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function aliasesToText(aliases: string[]): string {
  return aliases.join(', ')
}

const emptyDraft: DraftForm = { name: '', domain: '', aliasesText: '' }

export default function CompetitorsPanel({ projectId }: { projectId: string }) {
  const { language } = useDashboardLanguage()
  const t = useMemo(() => createI18n(language), [language])
  const isRTL = language === 'he'

  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftForm>(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const activeCount = useMemo(
    () => competitors.filter((c) => c.is_active).length,
    [competitors],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-visibility/competitors`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setLoadError(body.error || t('competitor_load_failed'))
        setCompetitors([])
        return
      }
      const body = await res.json()
      setCompetitors((body.competitors as Competitor[]) || [])
    } catch {
      setLoadError(t('competitor_load_failed'))
      setCompetitors([])
    } finally {
      setLoading(false)
    }
  }, [projectId, t])

  useEffect(() => {
    load()
  }, [load])

  const openAdd = () => {
    setEditingId(null)
    setDraft(emptyDraft)
    setSaveError(null)
    setAdding(true)
  }

  const openEdit = (c: Competitor) => {
    setAdding(false)
    setEditingId(c.id)
    setDraft({
      name: c.name,
      domain: c.domain || '',
      aliasesText: aliasesToText(c.aliases),
    })
    setSaveError(null)
  }

  const closeForm = () => {
    setAdding(false)
    setEditingId(null)
    setDraft(emptyDraft)
    setSaveError(null)
  }

  const handleSave = async () => {
    const trimmedName = draft.name.trim()
    if (!trimmedName) {
      setSaveError(t('competitor_name') + ' *')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const payload = {
        name: trimmedName,
        domain: draft.domain.trim() || null,
        aliases: parseAliases(draft.aliasesText),
      }
      const url = editingId
        ? `/api/projects/${projectId}/ai-visibility/competitors/${editingId}`
        : `/api/projects/${projectId}/ai-visibility/competitors`
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSaveError(body.error || t('competitor_load_failed'))
        return
      }
      await load()
      closeForm()
    } catch {
      setSaveError(t('competitor_load_failed'))
    } finally {
      setSaving(false)
    }
  }

  const handleSoftDelete = async (id: string) => {
    if (!confirm(t('competitor_delete_confirm'))) return
    try {
      const res = await fetch(
        `/api/projects/${projectId}/ai-visibility/competitors/${id}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(body.error || t('competitor_load_failed'))
        return
      }
      await load()
    } catch {
      alert(t('competitor_load_failed'))
    }
  }

  const handleReactivate = async (id: string) => {
    if (activeCount >= MAX_ACTIVE) {
      alert(t('competitor_max_reached'))
      return
    }
    try {
      const res = await fetch(
        `/api/projects/${projectId}/ai-visibility/competitors/${id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: true }),
        },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(body.error || t('competitor_load_failed'))
        return
      }
      await load()
    } catch {
      alert(t('competitor_load_failed'))
    }
  }

  const isFormOpen = adding || editingId !== null
  const canAddMore = activeCount < MAX_ACTIVE

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 sm:p-5">
      <div className={`flex items-start justify-between gap-3 mb-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className={isRTL ? 'text-right' : 'text-left'}>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('competitors_title')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('competitors_subtitle')}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('competitor_active_count')}: <span className="font-semibold">{activeCount}</span> / {MAX_ACTIVE}
          </p>
        </div>
        {!isFormOpen && (
          <Button
            variant="secondary"
            size="sm"
            onClick={openAdd}
            disabled={!canAddMore}
            title={!canAddMore ? t('competitor_max_reached') : undefined}
          >
            <Plus size={14} />
            <span>{t('competitor_add')}</span>
          </Button>
        )}
      </div>

      {loading && (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-4">{t('competitor_loading')}</p>
      )}

      {!loading && loadError && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {loadError}
        </div>
      )}

      {/* Form (add or edit) */}
      {isFormOpen && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-3 mb-3 space-y-3">
          <div>
            <label className={`block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 ${isRTL ? 'text-right' : 'text-left'}`}>
              {t('competitor_name')} *
            </label>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder={t('competitor_name_placeholder')}
              className={`w-full px-3 py-1.5 text-sm rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${isRTL ? 'text-right' : 'text-left'}`}
              maxLength={120}
            />
          </div>
          <div>
            <label className={`block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 ${isRTL ? 'text-right' : 'text-left'}`}>
              {t('competitor_domain')}
            </label>
            <input
              type="text"
              value={draft.domain}
              onChange={(e) => setDraft({ ...draft, domain: e.target.value })}
              placeholder={t('competitor_domain_placeholder')}
              className={`w-full px-3 py-1.5 text-sm rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${isRTL ? 'text-right' : 'text-left'}`}
              dir="ltr"
              maxLength={255}
            />
          </div>
          <div>
            <label className={`block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 ${isRTL ? 'text-right' : 'text-left'}`}>
              {t('competitor_aliases')}
            </label>
            <input
              type="text"
              value={draft.aliasesText}
              onChange={(e) => setDraft({ ...draft, aliasesText: e.target.value })}
              placeholder={t('competitor_aliases_placeholder')}
              className={`w-full px-3 py-1.5 text-sm rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${isRTL ? 'text-right' : 'text-left'}`}
            />
            <p className={`text-[11px] text-slate-500 dark:text-slate-400 mt-1 ${isRTL ? 'text-right' : 'text-left'}`}>
              {t('competitor_aliases_help')}
            </p>
          </div>
          {saveError && (
            <div className="text-xs text-red-700 dark:text-red-400">{saveError}</div>
          )}
          <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Button variant="primary" size="sm" onClick={handleSave} loading={saving} disabled={saving}>
              <Check size={14} />
              <span>{t('competitor_save')}</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={closeForm} disabled={saving}>
              <X size={14} />
              <span>{t('competitor_cancel')}</span>
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {!loading && !loadError && competitors.length === 0 && !isFormOpen && (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
          {t('competitor_empty')}
        </p>
      )}

      {!loading && competitors.length > 0 && (
        <ul className="space-y-2">
          {competitors.map((c) => {
            const isInactive = !c.is_active
            return (
              <li
                key={c.id}
                className={`rounded-lg border ${isInactive ? 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 opacity-70' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'} p-3`}
              >
                <div className={`flex items-start justify-between gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className={`flex-1 min-w-0 ${isRTL ? 'text-right' : 'text-left'}`}>
                    <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <span className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                        {c.name}
                      </span>
                      {isInactive && (
                        <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                          {t('competitor_inactive')}
                        </span>
                      )}
                    </div>
                    {c.domain && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5" dir="ltr">
                        {c.domain}
                      </div>
                    )}
                    {c.aliases.length > 0 && (
                      <div className={`mt-1.5 flex flex-wrap gap-1 ${isRTL ? 'justify-end' : ''}`}>
                        {c.aliases.map((a) => (
                          <span
                            key={a}
                            className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                          >
                            {a}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={`flex items-center gap-1 shrink-0 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    {isInactive ? (
                      <button
                        type="button"
                        onClick={() => handleReactivate(c.id)}
                        className="p-1.5 rounded text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                        title={t('competitor_reactivate')}
                      >
                        <RotateCcw size={14} />
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          disabled={isFormOpen}
                          className="p-1.5 rounded text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                          title={t('competitor_edit')}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSoftDelete(c.id)}
                          disabled={isFormOpen}
                          className="p-1.5 rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                          title={t('competitor_delete')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
