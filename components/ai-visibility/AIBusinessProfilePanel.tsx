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
import Notice from '@/components/ui/Notice'
import { FIELD_CLASSES, FIELD_LABEL_CLASSES } from '@/components/ui/Input'
import { ChevronDown, Settings2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
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
  { value: 'home_improvement_service', labelKey: 'cat_home_improvement_service' },
  { value: 'product_brand', labelKey: 'cat_product_brand' },
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
  // A code the list does not name yet is never shown raw (home_improvement_service
  // was): the owner sees "Other" instead. A category they typed stays as typed.
  if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(raw)) return t('cat_generic')
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
  // Detection that found nothing ("Other") tells the owner nothing: the line is left out
  // until they set a category or detection finds a real one.
  const showDetected = !!displayedCategoryLabel && !(mode === 'auto' && displayedCategoryLabel === t('cat_generic'))

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
    } catch {
      setError(t('profile_save_failed'))
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
    } catch {
      setError(t('profile_reset_failed'))
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
      className="overflow-hidden rounded-card border border-line bg-surface shadow-card"
      dir={isHebrew ? 'rtl' : 'ltr'}
    >
      {/* Collapsed/header — the WHOLE row is clickable */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-4 p-4 text-start transition-colors duration-150 ease-snappy hover:bg-sunk focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-action/20 sm:px-5"
        aria-expanded={expanded}
      >
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-inset bg-action-soft text-action">
          <Settings2 className="size-5" />
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-copy font-semibold text-ink">{t('ai_business_profile')}</h3>
            <Badge variant={mode === 'manual' ? 'warning' : 'info'}>
              {mode === 'manual' ? t('manual_badge') : t('auto_badge')}
            </Badge>
          </div>
          {showDetected && (
            <div className="mt-1 text-caption text-body truncate" data-ai-profile-detected="">
              <span className="text-muted">
                {mode === 'manual' ? t('manually_set') : t('auto_detected')}:
              </span>{' '}
              <span className="font-medium text-ink">{displayedCategoryLabel}</span>
            </div>
          )}
        </div>

        <span
          className="pointer-events-none hidden shrink-0 items-center gap-1.5 text-caption font-semibold text-action sm:inline-flex"
          aria-hidden="true"
        >
          {expanded ? t('close_panel') : t('edit_ai_profile')}
        </span>
        <ChevronDown aria-hidden="true" className={`size-4 shrink-0 text-muted transition-transform duration-150 ease-snappy ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {/* Expanded editor */}
      {expanded && (
        <div className="space-y-4 border-t border-line px-4 py-4 sm:px-5">
          <p className="text-caption text-muted">{t('ai_business_profile_help')}</p>

          {/* Primary category — freeform combobox */}
          <div className="flex flex-col gap-1.5">
            <label className={FIELD_LABEL_CLASSES}>
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
                className={cn(FIELD_CLASSES, 'py-2')}
                dir={isHebrew ? 'rtl' : 'ltr'}
                autoComplete="off"
              />
              {suggestionsOpen && filteredSuggestions.length > 0 && (
                <div
                  className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-card border border-line bg-surface p-1 shadow-pop"
                  dir={isHebrew ? 'rtl' : 'ltr'}
                >
                  <div className="px-2.5 py-1.5 text-overline font-semibold uppercase tracking-wide text-muted">
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
                      className="flex w-full items-center justify-between gap-2 rounded-control px-2.5 py-1.5 text-start text-copy text-ink transition-colors duration-150 ease-snappy hover:bg-sunk"
                    >
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <span>{t(opt.labelKey as any)}</span>
                      <span className="text-caption text-muted" dir="ltr">{opt.value}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {primaryCategory.trim().length > 0 && (
              <p className="text-caption text-muted">
                {t('manually_set')}: <span className="font-medium">{primaryCategory}</span>
              </p>
            )}
          </div>

          {/* Secondary categories tag input */}
          <div className="flex flex-col gap-1.5">
            <label className={FIELD_LABEL_CLASSES}>
              {t('secondary_categories')}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {secondaryCategories.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex h-7 items-center gap-1 rounded-pill border border-line bg-sunk ps-2.5 pe-1 text-caption font-medium text-ink"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag, secondaryCategories, setSecondaryCategories)}
                    className="grid size-5 place-items-center rounded-pill text-muted transition-colors duration-150 ease-snappy hover:bg-line hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
                    aria-label={t('remove_tag')}
                  >
                    <X aria-hidden="true" className="size-3.5" />
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
              className={cn(FIELD_CLASSES, 'py-2')}
              dir={isHebrew ? 'rtl' : 'ltr'}
            />
          </div>

          {/* Excluded topics tag input */}
          <div className="flex flex-col gap-1.5">
            <label className={FIELD_LABEL_CLASSES}>
              {t('excluded_topics')}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {excludedTopics.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex h-7 items-center gap-1 rounded-pill border border-bad/20 bg-bad-soft ps-2.5 pe-1 text-caption font-medium text-bad"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag, excludedTopics, setExcludedTopics)}
                    className="grid size-5 place-items-center rounded-pill transition-colors duration-150 ease-snappy hover:bg-bad/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
                    aria-label={t('remove_tag')}
                  >
                    <X aria-hidden="true" className="size-3.5" />
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
              className={cn(FIELD_CLASSES, 'py-2')}
              dir={isHebrew ? 'rtl' : 'ltr'}
            />
          </div>

          {error && <Notice tone="bad">{error}</Notice>}
          {success && <Notice tone="ok">{success}</Notice>}

          <div className="flex gap-2">
            <Button size="sm" onClick={save} loading={saving} disabled={saving}>
              {t('save_profile')}
            </Button>
            {mode === 'manual' && (
              <Button size="sm" variant="secondary" onClick={resetToAuto} disabled={saving}>
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
