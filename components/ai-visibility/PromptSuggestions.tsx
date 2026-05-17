'use client'

/**
 * PromptSuggestions modal — smart suggested prompts with multi-select,
 * edit-before-save, one-click add, and working regenerate.
 *
 * Suggestions are project-aware: uses business/domain/keywords/locale to
 * generate intent-varied prompts. Regenerate creates fresh shuffled set
 * with keyword-derived variants.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import { generatePromptSuggestions, PromptSuggestion, type ManualAIProfile } from '@/lib/ai-visibility/prompt-templates'
import { createI18n } from '@/lib/ai-visibility/i18n'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'

const INTENT_TONE: Record<string, 'info' | 'success' | 'warning' | 'neutral' | 'danger'> = {
  brand: 'info',
  comparison: 'warning',
  local: 'success',
  transactional: 'warning',
  recommendation: 'info',
  informational: 'neutral',
  commercial: 'warning',
  alternatives: 'neutral',
  pre_purchase: 'info',
  gift: 'success',
}

export default function PromptSuggestions({
  open,
  onClose,
  projectId,
  businessName,
  domain,
  city,
  country,
  language,
  keywords,
  manualProfile = null,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  projectId: string
  businessName: string | null
  domain: string | null
  city: string | null
  country: string | null
  language: string | null
  keywords?: string[]
  manualProfile?: ManualAIProfile | null
  onAdded: () => void
}) {
  // UI follows dashboard language; scan parameters (language/country) remain separate
  const { language: dashboardLanguage } = useDashboardLanguage()
  const t = useMemo(() => createI18n(dashboardLanguage), [dashboardLanguage])
  const isHebrew = dashboardLanguage === 'he'

  const intentLabel = (intent: string): string => {
    switch (intent) {
      case 'brand': return t('intent_brand')
      case 'comparison': return t('intent_comparison')
      case 'local': return t('intent_local')
      case 'transactional': return t('intent_transactional')
      case 'recommendation': return t('intent_recommendation')
      case 'informational': return t('intent_informational')
      default: return intent
    }
  }

  const [suggestions, setSuggestions] = useState<PromptSuggestion[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Session memory: every prompt shown in any past regenerate (avoid repeats),
  // the *last* shown set (never echo the previous set exactly),
  // secondary categories used in the last regenerate (rotate away),
  // and already-added project questions (never suggest them).
  const seenPromptsRef = useRef<Set<string>>(new Set())
  const lastShownPromptsRef = useRef<string[]>([])
  const recentlyUsedSecondaryRef = useRef<Set<string>>(new Set())
  const alreadyAddedPromptsRef = useRef<Set<string>>(new Set())
  const [loadingAlreadyAdded, setLoadingAlreadyAdded] = useState(false)

  // Normalize prompt text for dedup comparison — must match the generator's
  // internal normalizer so excludePrompts/previousSet are recognized.
  function normalizePrompt(p: string): string {
    return p.toLowerCase().replace(/[?!.,;:'"״׳`\-–—]/g, '').replace(/\s+/g, ' ').trim()
  }

  // Fetch already-added AI queries for this project and add to exclusion set
  async function fetchAlreadyAdded() {
    if (!projectId) return
    try {
      setLoadingAlreadyAdded(true)
      const res = await fetch(`/api/ai-visibility/prompts?projectId=${projectId}`)
      if (!res.ok) return
      const { prompts } = await res.json()
      if (Array.isArray(prompts)) {
        for (const p of prompts) {
          if (p.prompt) alreadyAddedPromptsRef.current.add(normalizePrompt(p.prompt))
        }
      }
    } catch {
      // Silently fail — don't block modal opening
    } finally {
      setLoadingAlreadyAdded(false)
    }
  }

  // Record a freshly produced set into session memory and update state.
  // If the generator returned fewer items than requested, the pool is
  // exhausted — reset seen prompts so the next regenerate has options again.
  function recordAndSet(produced: PromptSuggestion[], requested: number) {
    const normalized = produced.map((s) => normalizePrompt(s.prompt))
    if (produced.length < requested) {
      // Pool exhausted — wipe seen and keep only the just-shown set as
      // "previous" so the next regenerate avoids an immediate echo.
      seenPromptsRef.current = new Set(normalized)
    } else {
      for (const n of normalized) seenPromptsRef.current.add(n)
    }
    lastShownPromptsRef.current = normalized

    // Track which secondary categories were used in this set (for rotation)
    // Extract secondary category references from prompts
    if (manualProfile?.secondaryCategories) {
      const usedSecondary = new Set<string>()
      for (const secondary of manualProfile.secondaryCategories) {
        if (!secondary) continue
        for (const p of produced) {
          if (p.prompt.toLowerCase().includes(secondary.toLowerCase())) {
            usedSecondary.add(secondary)
          }
        }
      }
      recentlyUsedSecondaryRef.current = usedSecondary
    }

    setSuggestions(produced)
  }

  // Generate fresh suggestions when modal opens
  useEffect(() => {
    if (open) {
      seenPromptsRef.current = new Set()
      lastShownPromptsRef.current = []
      recentlyUsedSecondaryRef.current = new Set()
      alreadyAddedPromptsRef.current = new Set()
      setError(null)

      // Fetch already-added prompts first
      fetchAlreadyAdded().then(() => {
        const produced = generatePromptSuggestions({
          businessName,
          domain,
          city,
          country,
          language,
          keywords,
          manualProfile,
          diversify: true,
          limit: 6,
          // Exclude already-added prompts from suggestions
          excludePrompts: Array.from(alreadyAddedPromptsRef.current),
        })
        recordAndSet(produced, 6)
        setSelectedIds(new Set())
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, businessName, domain, city, country, language, keywords, manualProfile])

  async function regenerate() {
    setRegenerating(true)
    setError(null)
    await new Promise((r) => setTimeout(r, 250))

    // Combine all exclusions: seen in this session + already added to project
    const allExcluded = Array.from(seenPromptsRef.current).concat(
      Array.from(alreadyAddedPromptsRef.current)
    )

    const produced = generatePromptSuggestions({
      businessName,
      domain,
      city,
      country,
      language,
      keywords,
      manualProfile,
      diversify: true,
      excludePrompts: allExcluded,
      previousSet: lastShownPromptsRef.current,
      recentlyUsedSecondaryCategories: Array.from(recentlyUsedSecondaryRef.current),
      limit: 6,
    })
    recordAndSet(produced, 6)
    setSelectedIds(new Set())
    setRegenerating(false)
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function startEdit(id: string, current: string) {
    setEditingId(id)
    setEditValue(current)
  }

  function commitEdit() {
    if (!editingId) return
    setSuggestions((prev) =>
      prev.map((s) => (s.id === editingId ? { ...s, prompt: editValue.trim() || s.prompt } : s))
    )
    setEditingId(null)
    setEditValue('')
  }

  async function addOne(suggestion: PromptSuggestion) {
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/ai-visibility/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          prompt: suggestion.prompt,
          country,
          language,
          targetDomain: domain,
          targetBrandName: businessName,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id))
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(suggestion.id)
        return next
      })
      onAdded()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add prompt')
    } finally {
      setSaving(false)
    }
  }

  async function addSelected() {
    setError(null)
    setSaving(true)
    const targets = suggestions.filter((s) => selectedIds.has(s.id))
    try {
      for (const s of targets) {
        const res = await fetch('/api/ai-visibility/prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            prompt: s.prompt,
            country,
            language,
            targetDomain: domain,
            targetBrandName: businessName,
          }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${res.status}`)
        }
      }
      setSuggestions((prev) => prev.filter((s) => !selectedIds.has(s.id)))
      setSelectedIds(new Set())
      onAdded()
      if (suggestions.length === targets.length) onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add selected prompts')
    } finally {
      setSaving(false)
    }
  }

  const selectedCount = selectedIds.size

  return (
    <Modal open={open} onClose={onClose} title={t('smart_questions_title')} size="lg">
      <div className="space-y-4" dir={isHebrew ? 'rtl' : 'ltr'}>
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="text-slate-600 dark:text-slate-300 flex-1">{t('smart_questions_help')}</p>
          <button
            onClick={regenerate}
            disabled={regenerating}
            className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:underline disabled:opacity-50 disabled:cursor-not-allowed transition"
            type="button"
          >
            <span className={`inline-block transition-transform ${regenerating ? 'animate-spin' : ''}`}>↻</span>
            {t('regenerate')}
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        {regenerating ? (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 animate-pulse">
                <div className="w-4 h-4 rounded bg-slate-200 dark:bg-slate-700 mt-1" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
                  <div className="h-3 w-20 bg-slate-100 dark:bg-slate-800 rounded-full" />
                </div>
                <div className="w-12 h-7 bg-slate-100 dark:bg-slate-800 rounded" />
              </div>
            ))}
          </div>
        ) : suggestions.length === 0 ? (
          <div className="text-center py-10 text-slate-500 dark:text-slate-400">
            <div className="text-sm mb-3">{t('all_added')}</div>
            <Button size="sm" variant="outline" onClick={regenerate}>
              {t('generate_again')}
            </Button>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {suggestions.map((s) => {
              const checked = selectedIds.has(s.id)
              const isEditing = editingId === s.id
              return (
                <div
                  key={s.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border transition-all duration-200 ${
                    checked
                      ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/60 dark:bg-indigo-900/20 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSelect(s.id)}
                    className="mt-1.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit()
                          if (e.key === 'Escape') {
                            setEditingId(null)
                            setEditValue('')
                          }
                        }}
                        autoFocus
                        dir={isHebrew ? 'rtl' : 'ltr'}
                        className="w-full px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    ) : (
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-snug">
                        {s.prompt}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <Badge variant={INTENT_TONE[s.intent] || 'neutral'}>
                        {s.intentLabel || intentLabel(s.intent)}
                      </Badge>
                      <button
                        onClick={() => startEdit(s.id, s.prompt)}
                        className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        type="button"
                      >
                        {t('edit')}
                      </button>
                    </div>
                    {s.reason && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2" title={s.reason}>
                        {s.reason}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => addOne(s)}
                    disabled={saving}
                  >
                    {t('add')}
                  </Button>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-700 pt-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {selectedCount > 0
              ? `${selectedCount} ${t('selected')} ${t('of')} ${suggestions.length}`
              : `${suggestions.length}`}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              {t('close')}
            </Button>
            <Button
              disabled={selectedCount === 0 || saving}
              loading={saving}
              onClick={addSelected}
            >
              {selectedCount > 0
                ? `${t('add_selected')} (${selectedCount})`
                : t('add_selected')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
