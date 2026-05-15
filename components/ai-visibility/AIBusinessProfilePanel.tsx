'use client'

/**
 * AIBusinessProfilePanel — manual override for the AI Business Profile.
 *
 * Shows the currently-detected category (auto) and lets the user override:
 *   • Primary category (dropdown of BusinessCategory values)
 *   • Secondary categories (free-text tag input)
 *   • Excluded topics (free-text tag input)
 *
 * The panel only affects recommended-AI-question generation. It does NOT
 * change scans, rankings, or any other module behavior.
 */

import { useEffect, useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { createI18n } from '@/lib/ai-visibility/i18n'
import {
  detectCategory,
  type BusinessCategory,
  type ManualAIProfile,
} from '@/lib/ai-visibility/prompt-templates'

type CategoryOption = { value: BusinessCategory | ''; labelKey: string }

const CATEGORY_OPTIONS: CategoryOption[] = [
  { value: '', labelKey: 'auto_detect' },
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
  { value: 'generic', labelKey: 'cat_generic' },
]

function categoryLabel(
  t: ReturnType<typeof createI18n>,
  cat: BusinessCategory | null | undefined
): string {
  if (!cat) return ''
  const opt = CATEGORY_OPTIONS.find((o) => o.value === cat)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return opt ? t(opt.labelKey as any) : cat
}

export default function AIBusinessProfilePanel({
  projectId,
  businessName,
  domain,
  keywords,
  initialProfile,
  onChange,
}: {
  projectId: string
  businessName: string | null
  domain: string | null
  keywords: string[]
  initialProfile: ManualAIProfile | null
  onChange: (profile: ManualAIProfile | null) => void
}) {
  const t = useMemo(() => createI18n('he', 'IL'), [])
  const isHebrew = true

  // Auto-detected category (display only — updates when project data changes)
  const autoCategory = useMemo<BusinessCategory>(
    () => detectCategory(businessName || '', domain || '', keywords || []),
    [businessName, domain, keywords]
  )

  const [mode, setMode] = useState<'auto' | 'manual'>(initialProfile?.mode ?? 'auto')
  const [primaryCategory, setPrimaryCategory] = useState<BusinessCategory | ''>(
    initialProfile?.mode === 'manual' && initialProfile.primaryCategory
      ? initialProfile.primaryCategory
      : ''
  )
  const [secondaryCategories, setSecondaryCategories] = useState<string[]>(
    initialProfile?.secondaryCategories ?? []
  )
  const [excludedTopics, setExcludedTopics] = useState<string[]>(
    initialProfile?.excludedTopics ?? []
  )
  const [secondaryInput, setSecondaryInput] = useState('')
  const [excludedInput, setExcludedInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(initialProfile?.mode === 'manual')

  useEffect(() => {
    setMode(initialProfile?.mode ?? 'auto')
    setPrimaryCategory(
      initialProfile?.mode === 'manual' && initialProfile.primaryCategory
        ? initialProfile.primaryCategory
        : ''
    )
    setSecondaryCategories(initialProfile?.secondaryCategories ?? [])
    setExcludedTopics(initialProfile?.excludedTopics ?? [])
  }, [initialProfile])

  const displayedCategory = mode === 'manual' && primaryCategory ? primaryCategory : autoCategory

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
    setter(list.filter((t) => t !== tag))
  }

  async function save() {
    setError(null)
    setSaving(true)
    try {
      const payload: ManualAIProfile = {
        mode: 'manual',
        primaryCategory: primaryCategory || null,
        secondaryCategories,
        excludedTopics,
      }
      const res = await fetch(`/api/projects/${projectId}/ai-profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      const saved: ManualAIProfile = {
        mode: 'manual',
        primaryCategory: data.profile?.primaryCategory ?? null,
        secondaryCategories: data.profile?.secondaryCategories ?? [],
        excludedTopics: data.profile?.excludedTopics ?? [],
      }
      setMode('manual')
      onChange(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  async function resetToAuto() {
    setError(null)
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-profile`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      setMode('auto')
      setPrimaryCategory('')
      setSecondaryCategories([])
      setExcludedTopics([])
      onChange(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-4 mb-4"
      dir={isHebrew ? 'rtl' : 'ltr'}
    >
      {/* Header — always visible */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-bold text-slate-800">{t('ai_business_profile')}</h3>
          <Badge variant={mode === 'manual' ? 'warning' : 'info'}>
            {mode === 'manual' ? t('manual_badge') : t('auto_badge')}
          </Badge>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-indigo-600 hover:text-indigo-700 hover:underline shrink-0"
        >
          {expanded ? '−' : '+'}
        </button>
      </div>

      {/* Current category display */}
      <div className="mt-2 text-xs text-slate-600">
        <span className="text-slate-500">
          {mode === 'manual' ? t('manually_set') : t('auto_detected')}:
        </span>{' '}
        <span className="font-medium text-slate-800">{categoryLabel(t, displayedCategory)}</span>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-500">{t('ai_business_profile_help')}</p>

          {/* Primary category dropdown */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {t('primary_category')}
            </label>
            <select
              value={primaryCategory}
              onChange={(e) => setPrimaryCategory(e.target.value as BusinessCategory | '')}
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              dir={isHebrew ? 'rtl' : 'ltr'}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value || 'auto'} value={opt.value}>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {t(opt.labelKey as any)}
                </option>
              ))}
            </select>
          </div>

          {/* Secondary categories tag input */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
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
                    onClick={() =>
                      removeTag(tag, secondaryCategories, setSecondaryCategories)
                    }
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
                    setSecondaryInput('')
                  )
                }
              }}
              onBlur={() =>
                addTag(secondaryInput, secondaryCategories, setSecondaryCategories, () =>
                  setSecondaryInput('')
                )
              }
              placeholder={t('add_tag_placeholder')}
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              dir={isHebrew ? 'rtl' : 'ltr'}
            />
          </div>

          {/* Excluded topics tag input */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
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
                    setExcludedInput('')
                  )
                }
              }}
              onBlur={() =>
                addTag(excludedInput, excludedTopics, setExcludedTopics, () =>
                  setExcludedInput('')
                )
              }
              placeholder={t('add_tag_placeholder')}
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              dir={isHebrew ? 'rtl' : 'ltr'}
            />
          </div>

          {error && (
            <div className="p-2 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
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
          </div>
        </div>
      )}
    </div>
  )
}
