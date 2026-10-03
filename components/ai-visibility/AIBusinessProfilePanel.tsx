'use client'

/**
 * AIBusinessProfilePanel — what the business is, for the suggested AI questions.
 *
 * One line says what the business was identified as and from where ("העסק
 * זוהה כ־ מדריך טיולים ליפן לישראלים · לפי סריקת האתר · שינוי"). The value is
 * resolved by lib/ai-visibility/business-identity.ts: the owner's own words,
 * then the site scan, then the name/domain, then a clear keyword majority.
 * When none of them answers, the line asks the owner instead of guessing.
 * After a save the questions follow the new profile at once, and the notice
 * offers to generate new ones.
 *
 * The owner can set:
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
import Notice from '@/components/ui/Notice'
import { FIELD_CLASSES, FIELD_LABEL_CLASSES } from '@/components/ui/Input'
import { ChevronDown, HelpCircle, Pencil, ScanSearch, X } from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { createI18n } from '@/lib/ai-visibility/i18n'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import type { BusinessCategory, ManualAIProfile } from '@/lib/ai-visibility/prompt-templates'
import type { BusinessIdentity } from '@/lib/ai-visibility/business-identity'

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
  { value: 'travel', labelKey: 'cat_travel' },
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
  identity,
  scanDescription,
  ready,
  initialProfile,
  onRegenerate,
  onChange,
  onProfileSaved,
}: {
  projectId: string
  /** What the business is and where that came from (business-identity.ts). */
  identity: BusinessIdentity
  /** The site scan's description, shown in the editor so the owner sees what it read. */
  scanDescription: string | null
  /** False until the saved profile and the scan have been read. */
  ready: boolean
  initialProfile: ManualAIProfile | null
  onRegenerate: () => void
  onChange: (profile: ManualAIProfile | null) => void
  onProfileSaved?: () => void
}) {
  const { language: dashboardLanguage, uiLocale } = useDashboardLanguage()
  const t = useMemo(() => createI18n(uiLocale), [uiLocale])
  const isHebrew = dashboardLanguage === 'he'

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
  // Always start collapsed: the line above says what the business is.
  const [expanded, setExpanded] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
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

  // What the line names: the owner's words or the scan's niche when there are
  // some, the category's name otherwise. Never "Other": a business nothing
  // could identify gets the question instead (source 'unknown').
  const identifiedLabel = identity.label
    ? categoryLabelText(t, identity.label)
    : categoryLabelText(t, identity.category)
  const isUnknown = identity.source === 'unknown' || !identifiedLabel || identifiedLabel === t('cat_generic')
  const sourceKey = identity.source === 'manual'
    ? 'profile_source_manual'
    : identity.source === 'scan'
      ? 'profile_source_scan'
      : identity.source === 'site'
        ? 'profile_source_site'
        : 'profile_source_keywords'

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

  function openEditor() {
    setExpanded(true)
    setSuccess(null)
    setTimeout(() => primaryInputRef.current?.focus(), 50)
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
      setSuccess(t('profile_saved_questions'))
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
      setSuccess(t('profile_saved_questions'))
      setExpanded(false)
      onProfileSaved?.()
    } catch {
      setError(t('profile_reset_failed'))
    } finally {
      setSaving(false)
    }
  }

  const tagClasses = 'inline-flex h-7 items-center gap-1 rounded-pill border ps-2.5 pe-1 text-caption font-medium'
  const tagButtonClasses = 'grid size-5 place-items-center rounded-pill transition-colors duration-150 ease-snappy focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20'

  return (
    <div className="space-y-3" dir={isHebrew ? 'rtl' : 'ltr'} data-ai-profile-panel="" data-ai-profile-source={ready ? identity.source : 'loading'}>
      <div
        className={cn(
          'overflow-hidden rounded-card border border-line bg-surface shadow-card',
          ready && isUnknown && 'border-s-[3px] border-s-warn',
        )}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-5 sm:flex-nowrap sm:p-6">
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-inset bg-action-soft text-action">
            {ready && isUnknown ? <HelpCircle className="size-5" /> : <ScanSearch className="size-5" />}
          </span>

          <div className="min-w-0 flex-1 basis-48">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-overline font-semibold uppercase tracking-wide text-muted">{t('ai_business_profile')}</h3>
            </div>
            {!ready ? (
              <div className="mt-2" aria-busy="true" aria-label={t('profile_loading')}>
                <Skeleton className="h-5 w-64 max-w-full" />
              </div>
            ) : isUnknown ? (
              <div className="mt-1 space-y-0.5" data-ai-profile-unknown="">
                <p className="text-copy font-semibold text-ink">{t('profile_unknown_title')}</p>
                <p className="max-w-prose text-caption text-muted">{t('profile_unknown_help')}</p>
              </div>
            ) : (
              <div className="mt-1 space-y-0.5" data-ai-profile-detected="">
                <p className="text-copy text-body">
                  <span className="text-muted">{t('profile_identified_as')}</span>
                  <span className="font-semibold text-ink">{identifiedLabel}</span>
                </p>
                <p className="text-caption text-muted">{t(sourceKey)}</p>
              </div>
            )}
          </div>

          {ready && (
            isUnknown && !expanded ? (
              <Button size="sm" onClick={openEditor} className="shrink-0">
                <Pencil aria-hidden="true" className="size-4" />
                {t('profile_set')}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => (expanded ? setExpanded(false) : openEditor())}
                aria-expanded={expanded}
                className="shrink-0"
              >
                {expanded ? t('close_panel') : (
                  <>
                    <Pencil aria-hidden="true" className="size-4" />
                    {t('profile_change')}
                  </>
                )}
              </Button>
            )
          )}
        </div>

        {expanded && (
          <div className="space-y-4 border-t border-line p-5 sm:p-6" data-ai-profile-editor="">
            {scanDescription && (
              <div className="space-y-1 rounded-inset bg-sunk px-4 py-3">
                <p className="text-overline font-semibold uppercase tracking-wide text-muted">{t('profile_scan_found')}</p>
                <p className="max-w-prose text-caption text-body">{scanDescription}</p>
              </div>
            )}

            {/* What the business does — freeform, or one of the known categories */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`ai-profile-primary-${projectId}`} className={FIELD_LABEL_CLASSES}>
                {t('profile_what_business')}
              </label>
              <div className="relative">
                <input
                  id={`ai-profile-primary-${projectId}`}
                  ref={primaryInputRef}
                  type="text"
                  value={primaryCategory}
                  onChange={(e) => {
                    setPrimaryCategory(e.target.value)
                    setSuggestionsOpen(true)
                  }}
                  onFocus={() => setSuggestionsOpen(true)}
                  onBlur={() => setTimeout(() => setSuggestionsOpen(false), 120)}
                  placeholder={identity.label && identity.source === 'scan' ? identity.label : t('profile_what_business_placeholder')}
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
                        className="flex w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-start text-copy text-ink transition-colors duration-150 ease-snappy hover:bg-sunk"
                      >
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <span>{t(opt.labelKey as any)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {primaryCategory.trim().length > 0 && (
                <p className="text-caption text-muted">
                  {t('manually_set')}: <span className="font-medium text-ink">{categoryLabelText(t, primaryCategory)}</span>
                </p>
              )}
            </div>

            {/* More topics / excluded topics, folded: most owners need only the line above */}
            <div className="rounded-inset border border-line">
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-start text-copy font-medium text-ink transition-colors duration-150 ease-snappy hover:bg-sunk focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-action/20"
              >
                {t('profile_more_topics')}
                <ChevronDown aria-hidden="true" className={cn('size-4 shrink-0 text-muted transition-transform duration-150 ease-snappy', moreOpen && 'rotate-180')} />
              </button>
              {moreOpen && (
                <div className="space-y-4 border-t border-line px-4 py-4">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`ai-profile-secondary-${projectId}`} className={FIELD_LABEL_CLASSES}>
                      {t('secondary_categories')}
                    </label>
                    {secondaryCategories.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {secondaryCategories.map((tag) => (
                          <span key={tag} className={cn(tagClasses, 'border-line bg-sunk text-ink')}>
                            {tag}
                            <button
                              type="button"
                              onClick={() => removeTag(tag, secondaryCategories, setSecondaryCategories)}
                              className={cn(tagButtonClasses, 'text-muted hover:bg-line hover:text-ink')}
                              aria-label={t('remove_tag')}
                            >
                              <X aria-hidden="true" className="size-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <input
                      id={`ai-profile-secondary-${projectId}`}
                      type="text"
                      value={secondaryInput}
                      onChange={(e) => setSecondaryInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault()
                          addTag(secondaryInput, secondaryCategories, setSecondaryCategories, () => setSecondaryInput(''))
                        }
                      }}
                      onBlur={() => addTag(secondaryInput, secondaryCategories, setSecondaryCategories, () => setSecondaryInput(''))}
                      placeholder={t('add_secondary_placeholder')}
                      className={cn(FIELD_CLASSES, 'py-2')}
                      dir={isHebrew ? 'rtl' : 'ltr'}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`ai-profile-excluded-${projectId}`} className={FIELD_LABEL_CLASSES}>
                      {t('excluded_topics')}
                    </label>
                    {excludedTopics.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {excludedTopics.map((tag) => (
                          <span key={tag} className={cn(tagClasses, 'border-bad/20 bg-bad-soft text-bad')}>
                            {tag}
                            <button
                              type="button"
                              onClick={() => removeTag(tag, excludedTopics, setExcludedTopics)}
                              className={cn(tagButtonClasses, 'hover:bg-bad/10')}
                              aria-label={t('remove_tag')}
                            >
                              <X aria-hidden="true" className="size-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <input
                      id={`ai-profile-excluded-${projectId}`}
                      type="text"
                      value={excludedInput}
                      onChange={(e) => setExcludedInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault()
                          addTag(excludedInput, excludedTopics, setExcludedTopics, () => setExcludedInput(''))
                        }
                      }}
                      onBlur={() => addTag(excludedInput, excludedTopics, setExcludedTopics, () => setExcludedInput(''))}
                      placeholder={t('add_excluded_placeholder')}
                      className={cn(FIELD_CLASSES, 'py-2')}
                      dir={isHebrew ? 'rtl' : 'ltr'}
                    />
                  </div>
                </div>
              )}
            </div>

            <p className="text-caption text-muted">{t('ai_business_profile_help')}</p>

            {error && <Notice tone="bad">{error}</Notice>}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={save} loading={saving} disabled={saving}>
                {t('save_profile')}
              </Button>
              {mode === 'manual' && (
                <Button size="sm" variant="secondary" onClick={resetToAuto} disabled={saving}>
                  {t('reset_to_auto')}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {success && !expanded && (
        <Notice
          tone="ok"
          action={{ label: t('profile_regenerate'), onClick: () => { setSuccess(null); onRegenerate() } }}
          onDismiss={() => setSuccess(null)}
        >
          {success}
        </Notice>
      )}
    </div>
  )
}
