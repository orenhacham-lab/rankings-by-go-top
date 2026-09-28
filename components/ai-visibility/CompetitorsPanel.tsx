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

import SiteAvatar from '@/components/ui/SiteAvatar'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, RotateCcw, X, Check } from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import Notice from '@/components/ui/Notice'
import RowMenu from '@/components/ui/RowMenu'
import { Skeleton } from '@/components/ui/Skeleton'
import { FIELD_CLASSES, FIELD_LABEL_CLASSES } from '@/components/ui/Input'
import { CompetitorIcon } from '@/components/competitors/CompetitorIcon'
import { cn } from '@/lib/utils'
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

export default function CompetitorsPanel({ projectId, defaultCollapsed = true, onCompetitorsChanged }: { projectId: string; defaultCollapsed?: boolean; onCompetitorsChanged?: () => void }) {
  const { language } = useDashboardLanguage()
  const t = useMemo(() => createI18n(language), [language])
  const isRTL = language === 'he'

  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)
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
      onCompetitorsChanged?.()
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
      onCompetitorsChanged?.()
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
      onCompetitorsChanged?.()
    } catch {
      alert(t('competitor_load_failed'))
    }
  }

  const isFormOpen = adding || editingId !== null
  const canAddMore = activeCount < MAX_ACTIVE

  if (isCollapsed && !loadError && !loading) {
    return (
      <div className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
        <div className={`flex items-center justify-between gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <div className={isRTL ? 'text-right' : 'text-left'}>
            <h4 className="text-copy font-semibold text-ink">
              {t('competitors_title')}
            </h4>
            <p className="text-caption text-muted mt-0.5">
              {t('competitor_active_count')}: <span className="font-semibold">{activeCount}</span> / {MAX_ACTIVE}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsCollapsed(false)}
          >
            {t('competitor_edit')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className={`flex items-start justify-between gap-3 mb-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className={isRTL ? 'text-right' : 'text-left'}>
          <div className="flex items-center gap-2">
            <h3 className="text-section font-semibold text-ink">
              {t('competitors_title')}
            </h3>
            {!loading && !loadError && (
              <button
                type="button"
                onClick={() => setIsCollapsed(true)}
                className="grid size-8 place-items-center rounded-control text-muted transition-colors duration-150 ease-snappy hover:bg-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
                title={t('close_panel')}
                aria-label={t('close_panel')}
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            )}
          </div>
          <p className="text-caption text-muted mt-0.5">
            {t('competitors_subtitle')}
          </p>
          <p className="text-caption text-muted mt-1">{t('competitors_used_for')}</p>
          <p className="text-caption text-muted mt-1">
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
            <Plus aria-hidden="true" className="size-4" />
            <span>{t('competitor_add')}</span>
          </Button>
        )}
      </div>

      {loading && (
        <div role="status" aria-busy="true" className="space-y-2 py-2" data-skeleton="">
          <span className="sr-only">{t('competitor_loading')}</span>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {!loading && loadError && <Notice tone="bad">{loadError}</Notice>}

      {/* Form (add or edit) */}
      {isFormOpen && (
        <div className="mb-4 space-y-4 rounded-inset border border-line bg-sunk p-4">
          <div>
            <label className={`mb-1.5 block ${FIELD_LABEL_CLASSES}`}>
              {t('competitor_name')} *
            </label>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder={t('competitor_name_placeholder')}
              className={cn(FIELD_CLASSES, 'py-2')}
              maxLength={120}
            />
          </div>
          <div>
            <label className={`mb-1.5 block ${FIELD_LABEL_CLASSES}`}>
              {t('competitor_domain')}
            </label>
            <input
              type="text"
              value={draft.domain}
              onChange={(e) => setDraft({ ...draft, domain: e.target.value })}
              placeholder={t('competitor_domain_placeholder')}
              className={cn(FIELD_CLASSES, 'py-2')}
              dir="ltr"
              maxLength={255}
            />
          </div>
          <div>
            <label className={`mb-1.5 block ${FIELD_LABEL_CLASSES}`}>
              {t('competitor_aliases')}
            </label>
            <input
              type="text"
              value={draft.aliasesText}
              onChange={(e) => setDraft({ ...draft, aliasesText: e.target.value })}
              placeholder={t('competitor_aliases_placeholder')}
              className={cn(FIELD_CLASSES, 'py-2')}
            />
            <p className="mt-1.5 text-caption text-muted">
              {t('competitor_aliases_help')}
            </p>
          </div>
          {saveError && (
            <Notice tone="bad">{saveError}</Notice>
          )}
          <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Button variant="primary" size="sm" onClick={handleSave} loading={saving} disabled={saving}>
              <Check aria-hidden="true" className="size-4" />
              <span>{t('competitor_save')}</span>
            </Button>
            <Button variant="secondary" size="sm" onClick={closeForm} disabled={saving}>
              <span>{t('competitor_cancel')}</span>
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {!loading && !loadError && competitors.length === 0 && !isFormOpen && (
        <EmptyState icon={<CompetitorIcon />} title={t('competitor_empty')} className="py-8" />
      )}

      {!loading && competitors.length > 0 && (
        <ul className="space-y-2">
          {competitors.map((c) => {
            const isInactive = !c.is_active
            return (
              <li
                key={c.id}
                className={`rounded-inset border border-line p-4 ${isInactive ? 'bg-sunk' : 'bg-surface'}`}
              >
                <div className={`flex items-start justify-between gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className={`flex-1 min-w-0 ${isRTL ? 'text-right' : 'text-left'}`}>
                    <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <SiteAvatar domain={c.domain} name={c.name} size="sm" />
                      <span className="font-semibold text-copy text-ink truncate">
                        {c.name}
                      </span>
                      {isInactive && (
                        <Badge variant="neutral">{t('competitor_inactive')}</Badge>
                      )}
                    </div>
                    {c.domain && (
                      <div className="text-caption text-muted mt-0.5" dir="ltr">
                        {c.domain}
                      </div>
                    )}
                    {c.aliases.length > 0 && (
                      <div className={`mt-1.5 flex flex-wrap gap-1 ${isRTL ? 'justify-end' : ''}`}>
                        {c.aliases.map((a) => (
                          <span key={a} className="rounded-pill bg-sunk px-2 py-0.5 text-caption text-body">
                            {a}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={`flex items-center gap-1 shrink-0 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    {isInactive ? (
                      <Button variant="ghost" size="sm" onClick={() => handleReactivate(c.id)}>
                        <RotateCcw aria-hidden="true" className="size-4" />
                        {t('competitor_reactivate')}
                      </Button>
                    ) : (
                      <RowMenu
                        label={`${t('competitor_edit')}: ${c.name}`}
                        items={[
                          { key: 'edit', label: t('competitor_edit'), disabled: isFormOpen, icon: <Pencil aria-hidden="true" className="size-4" />, onSelect: () => openEdit(c) },
                          { key: 'delete', label: t('competitor_delete'), disabled: isFormOpen, icon: <Trash2 aria-hidden="true" className="size-4" />, onSelect: () => handleSoftDelete(c.id) },
                        ]}
                      />
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
