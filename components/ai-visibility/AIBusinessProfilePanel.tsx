'use client'

/**
 * AIBusinessProfilePanel — manual override for the AI Business Profile.
 *
 * Shows the currently-detected category (auto) and lets the user override:
 *   • Primary category — combobox: pick a predefined one OR type freeform
 *     Hebrew (e.g. "משלוחי פרחים", "בשמי נישה", "ניקיון משרדים")
 *   • Secondary categories (free-text tag input)
 *   • Excluded topics (free-text tag input)
 *
 * The panel only affects recommended-AI-question generation. It does NOT
 * change scans, rankings, or any other module behavior.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { createI18n } from '@/lib/ai-visibility/i18n'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import {
  detectCategory,
  type BusinessCategory,
  type ManualAIProfile,
} from '@/lib/ai-visibility/prompt-templates'

type CategoryOption = { value: BusinessCategory; labelKey: string }

const CATEGORY_OPTIONS: CategoryOption[] = [
  { value: 'florist', labelKey: 'cat_florist' },
  { value: 'perfume', labelKey: 'cat_perfume' },
  { value: 'gifts', labelKey: 'cat_gifts' },
  { value: 'agency', labelKey: 'cat_agency' },
  { value: 'sports_store', labelKey: 'cat_sports_store' },
  { value: 'appliance_store', labelKey: 'cat_appliance_store' },
  { value: 'ecommerce', labelKey: 'cat_ecommerce' },
  { value: 'local_service', labelKey: 'cat_local_service' },
  { value: 'cleaning', labelKey: 'cat_cleaning' },
  { value: 'saas', labelKey: 'cat_saas' },
  { value: 'restaurant', labelKey: 'cat_restaurant' },
  { value: 'healthcare', labelKey: 'cat_healthcare' },
  { value: 'legal', labelKey: 'cat_legal' },
  { value: 'real_estate', labelKey: 'cat_real_estate' },
  { value: 'fitness', labelKey: 'cat_fitness' },
  { value: 'beauty', labelKey: 'cat_beauty' },
  { value: 'education', labelKey: 'cat_education' },
  { value: 'second_hand_fashion', labelKey: 'cat_second_hand_fashion' },
  { value: 'generic', labelKey: 'cat_generic' },
]

function categoryLabelText(
  t: ReturnType<typeof createI18n>,
  raw: string | null | undefined,
): string {
  if (!raw) return ''
  const opt = CATEGORY_OPTIONS.find((o) => o.value === raw)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (opt) return t(opt.labelKey as any)
  return raw
}

export default function AIBusinessProfilePanel({
  projectId,
  businessName,
  domain,
  keywords,
  initialProfile,
  onChange,
  onProfileSaved,
}: {
  projectId: string
  businessName: string | null
  domain: string | null
  keywords: string[]
  initialProfile: ManualAIProfile | null
  onChange: (profile: ManualAIProfile | null) => void
  onProfileSaved?: () => void
}) {
  const { language: dashboardLanguage } = useDashboardLanguage()
  const t = useMemo(() => createI18n(dashboardLanguage), [dashboardLanguage])
  const isHebrew = dashboardLanguage === 'he'

  const autoCategory = useMemo<BusinessCategory>(
    () => detectCategory(businessName || '', domain || '', keywords || []),
    [businessName, domain, keywords],
  )

  const [mode, setMode] = useState<'auto' | 'manual'>(initialProfile?.mode ?? 'auto')
  const [primaryCategory, setPrimaryCategory] = useState<string>(
    initialProfile?.mode === 'manual' && initialProfile.primaryCategory
      ? initialProfile.primaryCategory
      : '',
  )
  const [secondaryCategories, setSecondaryCategories] = useState<string[]>(
    initialProfile?.secondaryCategories ?? [],
  )
  const [excludedTopics, setExcludedTopics] = useState<string[]>(
    initialProfile?.excludedTopics ?? [],
  )
  const [secondaryInput, setSecondaryInput] = useState('')
  const [excludedInput, setExcludedInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  // Always start collapsed. User must click to open even when a manual
  // profile was previously saved, so the section doesn't auto-expand and
  // take up space on every visit.
  const [expanded, setExpanded] = useState(false)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const primaryInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setMode(initialProfile?.mode ?? 'auto')
    setPrimaryCategory(
      initialProfile?.mode === 'manual' && initialProfile.primaryCategory
        ? initialProfile.primaryCategory
        : '',
    )
    setSecondaryCategories(initialProfile?.secondaryCategories ?? [])
    setExcludedTopics(initialProfile?.excludedTopics ?? [])
  }, [initialProfile])

  useEffect(() => {
    if (!success) return
    const id = window.setTimeout(() => setSuccess(null), 3500)
    return () => window.clearTimeout(id)
  }, [success])

  const displayedCategoryRaw =
    mode === 'manual' && primaryCategory ? primaryCategory : autoCategory
  const displayedCategoryLabel = categoryLabelText(t, displayedCategoryRaw)

  const filteredSuggestions = useMemo(() => {
    const q = primaryCategory.trim().toLowerCase()
    if (!q) return CATEGORY_OPTIONS
    return CATEGORY_OPTIONS.filter((o) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const label = (t(o.labelKey as any) || '').toLowerCase()
      return label.includes(q) || o.value.includes(q)
    })
  }, [primaryCategory, t])

  function addTag(value: string, list: string[], setter: (v: string[]) => void, reset: () => void) {
    const v = value.trim()
    if (!v) return
    if (list.includes(v)) {
      reset()
      return
    }
    setter([...list, v])
    reset()
  }

  function removeTag(tag: string, list: string[], setter: (v: string[]) => void) {
    setter(list.filter((it) => it !== tag))
  }

  async function save() {
    setError(null)
    setSuccess(null)
    setSaving(true)
    try {
      const trimmedPrimary = primaryCategory.trim()
      const targetMode: 'auto' | 'manual' =
        trimmedPrimary.length === 0 &&
        secondaryCategories.length === 0 &&
        excludedTopics.length === 0
          ? 'auto'
          : 'manual'

      const payload = {
        mode: targetMode,
        primaryCategory: targetMode === 'manual' ? trimmedPrimary : null,
        secondaryCategories: targetMode === 'manual' ? secondaryCategories : [],
        excludedTopics: targetMode === 'manual' ? excludedTopics : [],
      }
      const res = await fetch(`/api/projects/${projectId}/ai-profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || t('profile_save_failed'))
      }
      const savedProfile = data.profile as
        | { mode: 'auto' | 'manual'; primaryCategory: string | null; secondaryCategories: string[]; excludedTopics: string[] }
        | undefined
      const saved: ManualAIProfile = {
        mode: savedProfile?.mode === 'manual' ? 'manual' : 'auto',
        primaryCategory: (savedProfile?.primaryCategory ?? null) as ManualAIProfile['primaryCategory'],
        secondaryCategories: savedProfile?.secondaryCategories ?? [],
        excludedTopics: savedProfile?.excludedTopics ?? [],
      }
      setMode(saved.mode)
      onChange(saved.mode === 'manual' ? saved : null)
      setSuccess(t('profile_saved'))
      setExpanded(false)
      onProfileSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('profile_save_failed'))
    } finally {
      setSaving(false)
    }
  }

  async function resetToAuto() {
    setError(null)
    setSuccess(null)
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-profile`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || t('profile_reset_failed'))
      }
      setMode('auto')
      setPrimaryCategory('')
      setSecondaryCategories([])
      setExcludedTopics([])
      onChange(null)
      setSuccess(t('profile_reset'))
      setExpanded(false)
      onProfileSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('profile_reset_failed'))
    } finally {
      setSaving(false)
    }
  }

  function openEditor() {
    if (!expanded) setExpanded(true)
    setTimeout(() => primaryInputRef.current?.focus(), 50)
  }

  return (
    <div
      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 mb-4 overflow-hidden"
      dir={isHebrew ? 'rtl' : 'ltr'}
    >
      {/* Collapsed/header — the WHOLE row is clickable */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-start p-4 hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-slate-100 dark:active:bg-slate-700 transition flex items-center gap-4 cursor-pointer"
        aria-expanded={expanded}
      >
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
          {/* gear icon */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{t('ai_business_profile')}</h3>
            <Badge variant={mode === 'manual' ? 'warning' : 'info'}>
              {mode === 'manual' ? t('manual_badge') : t('auto_badge')}
            </Badge>
          </div>
          <div className="mt-1 text-xs text-slate-600 dark:text-slate-300 truncate">
            <span className="text-slate-500 dark:text-slate-400">
              {mode === 'manual' ? t('manually_set') : t('auto_detected')}:
            </span>{' '}
            <span className="font-medium text-slate-800 dark:text-slate-100">{displayedCategoryLabel}</span>
          </div>
        </div>

        <span
          className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition pointer-events-none"
          aria-hidden="true"
        >
          {expanded ? t('close_panel') : t('edit_ai_profile')}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {/* Expanded editor */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-slate-100 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t('ai_business_profile_help')}</p>

          {/* Primary category — freeform combobox */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('primary_category')}
            </label>
            <div className="relative">
              <input
                ref={primaryInputRef}
                type="text"
                value={primaryCategory}
                onChange={(e) => {
                  setPrimaryCategory(e.target.value)
                  setSuggestionsOpen(true)
                }}
                onFocus={() => setSuggestionsOpen(true)}
                onBlur={() => setTimeout(() => setSuggestionsOpen(false), 120)}
                placeholder={t('primary_category_placeholder')}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-400"
                dir={isHebrew ? 'rtl' : 'ltr'}
                autoComplete="off"
              />
              {suggestionsOpen && filteredSuggestions.length > 0 && (
                <div
                  className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg"
                  dir={isHebrew ? 'rtl' : 'ltr'}
                >
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-700">
                    {t('category_suggestions')}
                  </div>
                  {filteredSuggestions.map((opt) => (
                    <button
                      type="button"
                      key={opt.value}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        setPrimaryCategory(opt.value)
                        setSuggestionsOpen(false)
                      }}
                      className="w-full text-start px-2.5 py-1.5 text-sm hover:bg-indigo-50 hover:text-indigo-700 flex items-center justify-between gap-2"
                    >
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <span>{t(opt.labelKey as any)}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{opt.value}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {primaryCategory.trim().length > 0 && (
              <p className="mt-1 text-[11px] text-slate-500">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {t('manually_set')}: <span className="font-medium">{primaryCategory}</span>
              </p>
            )}
          </div>

          {/* Secondary categories tag input */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('secondary_categories')}
            </label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {secondaryCategories.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-xs text-indigo-700"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag, secondaryCategories, setSecondaryCategories)}
                    className="text-indigo-400 hover:text-indigo-700"
                    aria-label="Remove tag"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={secondaryInput}
              onChange={(e) => setSecondaryInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  addTag(secondaryInput, secondaryCategories, setSecondaryCategories, () =>
                    setSecondaryInput(''),
                  )
                }
              }}
              onBlur={() =>
                addTag(secondaryInput, secondaryCategories, setSecondaryCategories, () =>
                  setSecondaryInput(''),
                )
              }
              placeholder={t('add_secondary_placeholder')}
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-400 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              dir={isHebrew ? 'rtl' : 'ltr'}
            />
          </div>

          {/* Excluded topics tag input */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('excluded_topics')}
            </label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {excludedTopics.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 border border-red-200 text-xs text-red-700"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag, excludedTopics, setExcludedTopics)}
                    className="text-red-400 hover:text-red-700"
                    aria-label="Remove tag"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={excludedInput}
              onChange={(e) => setExcludedInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  addTag(excludedInput, excludedTopics, setExcludedTopics, () =>
                    setExcludedInput(''),
                  )
                }
              }}
              onBlur={() =>
                addTag(excludedInput, excludedTopics, setExcludedTopics, () =>
                  setExcludedInput(''),
                )
              }
              placeholder={t('add_excluded_placeholder')}
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-400 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              dir={isHebrew ? 'rtl' : 'ltr'}
            />
          </div>

          {error && (
            <div className="p-2 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 mb-3">
              {error}
            </div>
          )}
          {success && (
            <div className="p-2 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 mb-3">
              {success}
            </div>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={save} loading={saving} disabled={saving}>
              {t('save_profile')}
            </Button>
            {mode === 'manual' && (
              <Button size="sm" variant="outline" onClick={resetToAuto} disabled={saving}>
                {t('reset_to_auto')}
              </Button>
            )}
            {/* placate unused-warning for openEditor; exposed for parent triggers if ever needed */}
            <span className="hidden" aria-hidden onClick={openEditor} />
          </div>
        </div>
      )}
    </div>
  )
}
