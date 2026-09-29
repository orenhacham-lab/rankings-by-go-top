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
import Checkbox from '@/components/ui/Checkbox'
import EmptyState from '@/components/ui/EmptyState'
import Input from '@/components/ui/Input'
import Notice from '@/components/ui/Notice'
import { Skeleton } from '@/components/ui/Skeleton'
import { Pencil, RefreshCw, Sparkles } from 'lucide-react'
import { dropOffTopicSuggestions } from '@/lib/ai-visibility/question-relevance'
import { generatePromptSuggestions, buildFallbackSuggestions, normalizeLanguage, applyDisplayQualityGate, isInsufficientContextSuggestion, QUESTION_GENERATION_VERSION, PromptSuggestion, type ManualAIProfile, type BusinessCategory } from '@/lib/ai-visibility/prompt-templates'
import { createI18n } from '@/lib/ai-visibility/i18n'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { deriveSuggestionMeta } from '@/lib/ai-visibility/suggestion-dedup'
import { rankByWorth, type WorthContext } from '@/lib/ai-visibility/question-worth'
import { worthReason } from './sections/SmartQuestionCard'

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
  category,
  worthContext = null,
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
  /** The business category resolved by the section (lib/ai-visibility/business-identity.ts). */
  category: BusinessCategory
  /** The section's worth context; the modal keeps the same questions the tab would. */
  worthContext?: WorthContext | null
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
      case 'commercial': return t('intent_commercial')
      case 'local': return t('intent_local')
      case 'transactional': return t('intent_transactional')
      case 'recommendation': return t('intent_recommendation')
      case 'informational': return t('intent_informational')
      case 'alternatives': return t('intent_alternatives')
      case 'pre_purchase': return t('intent_pre_purchase')
      case 'gift': return t('intent_gift')
      default: return intent
    }
  }

  const confidenceTierLabel = (tier: string): string => {
    switch (tier) {
      case 'high': return t('confidence_high')
      case 'good': return t('confidence_good')
      case 'medium': return t('confidence_medium')
      case 'opportunity': return t('confidence_opportunity')
      case 'experimental': return t('confidence_experimental')
      // A tier with no words of its own (starter: its chip already says so) shows
      // no badge, never the raw identifier.
      default: return ''
    }
  }

  const confidenceTierColor = (tier: string): 'success' | 'info' | 'warning' | 'neutral' | 'danger' => {
    switch (tier) {
      case 'high': return 'success'
      case 'good': return 'info'
      case 'medium': return 'warning'
      case 'opportunity': return 'warning'
      case 'experimental': return 'neutral'
      default: return 'neutral'
    }
  }

  const chipLabel = (chip: string): string => {
    // Scoped safe fallback: an unknown chip key (e.g. a new tier's chip not yet added to
    // the i18n dictionary) must render the raw key instead of throwing and crashing the
    // whole AI Questions tab. This leniency is confined to the OPTIONAL chip label —
    // intentionally NOT a global t() guard, so required missing translations elsewhere
    // still fail loudly.
    try {
      return t(chip as any) || chip
    } catch {
      if (process.env.NODE_ENV !== 'production') console.warn('[ai-visibility] unknown chip label key:', chip)
      return chip
    }
  }

  // Helper to preserve quality mapping from cached items (via intent)
  function enrichCachedSuggestion(item: any): PromptSuggestion {
    const intent = item?.intent || 'informational'
    const meta = deriveSuggestionMeta(intent)
    return {
      id: item.id || `cached-${Math.random().toString(36).slice(2, 8)}`,
      prompt: item.question,
      intent: meta.intent,
      intentLabel: meta.intent,
      category: 'generic',
      language: language || 'he',
      qualityScore: meta.qualityScore,
      confidenceTier: meta.confidenceTier,
      reason: item.reason || '',
      chips: [],
      valueReason: '',
    }
  }

  // Calculate quality distribution for logging
  function analyzeQualityDistribution(items: PromptSuggestion[]): Record<string, number> {
    const dist: Record<string, number> = { high: 0, good: 0, medium: 0 }
    for (const item of items) {
      const tier = item.confidenceTier || 'medium'
      dist[tier] = (dist[tier] || 0) + 1
    }
    return dist
  }

  const [suggestions, setSuggestions] = useState<PromptSuggestion[]>([])
  // Marker-safe commit: the insufficient-context notice is never a question and
  // must never be rendered as a selectable card. Replaces (never appends) the
  // displayed pool so a stale marker can't survive a regenerate.
  // …and a suggestion about another trade than the project's is not shown
  // either (lib/ai-visibility/question-relevance.ts).
  // …and, like the tab's own list, only questions worth the business's time (question-worth.ts).
  function commitSuggestions(list: PromptSuggestion[]) {
    const onTopic = dropOffTopicSuggestions(list.filter((s) => !isInsufficientContextSuggestion(s)), {
      keywords: keywords ?? [],
      offerings: manualProfile?.mode === 'manual' ? [manualProfile.primaryCategory, ...manualProfile.secondaryCategories] : [],
      businessName,
      domain,
    })
    setSuggestions(worthContext ? rankByWorth(onTopic, worthContext) : onTopic)
  }
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)

  // Session memory: used ONLY for regenerate/generator behavior, NOT for modal filtering
  // seenPromptsRef: tracks what generator has produced in this session (for regenerate rotation)
  // lastShownPromptsRef: previous regenerate set (to avoid immediate echo)
  // recentlyUsedSecondaryRef: used secondary categories (for rotation)
  // alreadyAddedPromptsRef: project's saved prompts (filter from modal display)
  const seenPromptsRef = useRef<Set<string>>(new Set())
  const lastShownPromptsRef = useRef<string[]>([])
  const recentlyUsedSecondaryRef = useRef<Set<string>>(new Set())
  const alreadyAddedPromptsRef = useRef<Set<string>>(new Set())
  const [loadingAlreadyAdded, setLoadingAlreadyAdded] = useState(false)

  // Initial load when modal opens
  useEffect(() => {
    if (open) {
      alreadyAddedPromptsRef.current = new Set()
      setError(null)
      setIsLoadingSuggestions(true)

      // Fetch already-added prompts and load modal pool
      fetchAlreadyAdded().then(() => {
        loadModalRecommendationPool({ allowGenerate: true })
      })
    }
    // Re-run only when the modal opens or its inputs change; the two loaders
    // are plain functions recreated every render, so listing them would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId, language, country, businessName, domain, city, keywords, manualProfile, category])

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

  // Record generator state for refresh behavior (seenPrompts, lastShown)
  // BUT DO NOT USE THIS FOR MODAL DISPLAY FILTERING
  function recordGeneratorState(produced: PromptSuggestion[]) {
    const normalized = produced.map((s) => normalizePrompt(s.prompt))
    if (produced.length < 6) {
      // Pool exhausted — reset for next regenerate
      seenPromptsRef.current = new Set(normalized)
    } else {
      for (const n of normalized) seenPromptsRef.current.add(n)
    }
    lastShownPromptsRef.current = normalized

    // Track secondary categories
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
  }

  // DISPLAY QUALITY GATE for the modal: drop legacy/weak cached questions and
  // top up with the intent-v2 engine. `forceRefresh` is logged so we can tell
  // an explicit regenerate from a passive load.
  function gateModalSuggestions(
    items: PromptSuggestion[],
    source: string,
    forceRefresh: boolean
  ): PromptSuggestion[] {
    const result = applyDisplayQualityGate(items, {
      businessName,
      domain,
      category,
      location: city,
      keywords: keywords || [],
      language,
    }, { minCount: 6, maxCount: Math.max(items.length + 8, 24) })
    console.log('[ai-question-suggestions] displayed source:', source)
    console.log('[ai-question-suggestions] cache suggestions count', { count: items.length })
    console.log('[ai-question-suggestions] current generation version', { version: QUESTION_GENERATION_VERSION })
    console.log('[ai-question-suggestions] using cached suggestions:', items.length > 0)
    console.log('[ai-question-suggestions] force refresh:', forceRefresh)
    console.log('[ai-question-suggestions] old suggestions rejected count', { count: result.rejectedCount })
    console.log('[ai-question-suggestions] new suggestions generated count', { count: result.addedFromEngine })
    console.log('[ai-question-suggestions] final displayed suggestions count', { count: result.suggestions.length })
    // Keep already-tracked questions out of the modal.
    return result.suggestions.filter((q) => !alreadyAddedPromptsRef.current.has(normalizePrompt(q.prompt)))
  }

  // Build a quality local fallback set (shared with the inline panel logic).
  // Never returns [] — guarantees the modal is never left empty even when
  // Gemini is unavailable / returns nothing and the cache is empty.
  function buildModalFallback(): PromptSuggestion[] {
    const lang = normalizeLanguage(language)
    const fb = buildFallbackSuggestions(
      businessName,
      null, // projectName not available here
      domain,
      category,
      city,
      keywords || [],
      [], // competitors not available here
      lang,
    )
    // Filter out the insufficient-context marker (a notice, not a question) and
    // anything the project already tracks so the modal stays useful.
    return fb.filter(
      (q) => !isInsufficientContextSuggestion(q) && !alreadyAddedPromptsRef.current.has(normalizePrompt(q.prompt))
    )
  }

  // Load full modal recommendation pool: cache first, then optional Gemini
  // generation, then a guaranteed local fallback so the panel is never empty.
  // Scenario A: Project has cached questions → show full pool
  // Scenario B: New project, no cache → try Gemini, else quality fallback
  const MIN_MODAL_POOL = 8
  async function loadModalRecommendationPool({ allowGenerate }: { allowGenerate: boolean }) {
    const normalizedLang = normalizeLanguage(language)
    const detectedCategory = category
    console.log('[ai-question-suggestions] inner button clicked', { projectId, via: 'recommend_modal' })
    console.log('[ai-question-suggestions] generate clicked', {
      projectId,
      businessName: businessName || '(none)',
      projectName: businessName || '(none)',
      targetDomain: domain || '(none)',
      rawLanguage: language || '(none)',
      normalizedLanguage: normalizedLang,
      detectedCategory,
      location: city || '(none)',
      keywordsCount: (keywords || []).length,
      competitorsCount: 0,
    })
    try {
      // Step 1: Try full cache load
      const response = await fetch('/api/ai-visibility/enriched-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          language: normalizedLang,
          country: country || undefined,
          businessCategory: null,
          cacheOnly: true,
        }),
      })

      if (!response.ok) throw new Error('Cache fetch failed')

      const data = await response.json()
      const cachedRaw: Array<{ id?: string; question: string; intent?: string }> = data.cachedSuggestions || []

      // Filter: only by already-saved (NOT seenPromptsRef)
      const availableAfterFiltering = cachedRaw
        .filter(q => {
          const normalized = normalizePrompt(q.question)
          return !alreadyAddedPromptsRef.current.has(normalized)
        })
        .map(enrichCachedSuggestion)

      const qualityDist = analyzeQualityDistribution(availableAfterFiltering)

      console.log('[AI_RECOMMENDED_MODAL_LOAD_FLOW]', {
        projectId,
        allowGenerate,
        initialCacheCount: cachedRaw.length,
        initialAvailableCount: availableAfterFiltering.length,
        minModalPool: MIN_MODAL_POOL,
        generationCalled: false,
        generationReason: null,
        afterGenerationCacheCount: cachedRaw.length,
        finalAvailableCount: availableAfterFiltering.length,
        renderedCount: availableAfterFiltering.length,
        reasonIfEmpty: availableAfterFiltering.length === 0 ? 'cache_empty_no_generation' : null,
        qualityDistribution: qualityDist,
      })

      // Step 2: Enough in cache? Display it (after the display quality gate).
      if (availableAfterFiltering.length >= MIN_MODAL_POOL) {
        const gatedCache = gateModalSuggestions(availableAfterFiltering, 'cache', false)
        console.log('[ai-question-suggestions] fallback used', { projectId, used: false })
        console.log('[ai-question-suggestions] final suggestions count:', gatedCache.length)
        console.log('[ai-question-suggestions] state updated')
        commitSuggestions(gatedCache)
        setSelectedIds(new Set())
        setIsLoadingSuggestions(false)
        return
      }

      // Step 3: Not enough in cache and allowGenerate=true? Trigger Gemini.
      // Gemini is the PRIMARY source — only fall back to local questions when
      // it is unavailable or returns nothing usable.
      if (allowGenerate && availableAfterFiltering.length < MIN_MODAL_POOL) {
        console.log('[AI_RECOMMENDED_MODAL_TRIGGERING_GENERATION]', {
          currentCacheCount: cachedRaw.length,
          threshold: MIN_MODAL_POOL,
        })
        console.log('[ai-question-suggestions] calling enriched suggestions endpoint', { projectId, normalizedLanguage: normalizedLang })

        // Call enriched endpoint with cacheOnly=false to allow Gemini
        const genResponse = await fetch('/api/ai-visibility/enriched-suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            language: normalizedLang,
            country: country || undefined,
            businessCategory: null,
            cacheOnly: false, // Allow generation
          }),
        })

        if (genResponse.ok) {
          // After generation, reload full cache. Prefer reloaded cache (which now
          // includes any Gemini questions); fall back to dedupedQuestions if the
          // cache reload came back empty for any reason.
          const genData = await genResponse.json()
          let newCachedRaw: Array<{ id?: string; question: string; intent?: string }> = genData.cachedSuggestions || []
          if (newCachedRaw.length === 0 && Array.isArray(genData.dedupedQuestions)) {
            newCachedRaw = genData.dedupedQuestions
              .map((q: any) => ({ id: q.id, question: q.question ?? q.prompt, intent: q.intent }))
              .filter((q: any) => q.question)
          }
          const geminiWasCalled = genData.geminiWasCalled || false
          const geminiNotCalledReason = genData.geminiNotCalledReason || ''

          console.log('[ai-question-suggestions] Gemini attempted', { projectId, geminiWasCalled, geminiNotCalledReason: geminiWasCalled ? null : geminiNotCalledReason })
          console.log('[ai-question-suggestions] Gemini response count', { projectId, count: newCachedRaw.length })

          const newAvailable = newCachedRaw
            .filter(q => {
              const normalized = normalizePrompt(q.question)
              return !alreadyAddedPromptsRef.current.has(normalized)
            })
            .map(enrichCachedSuggestion)

          const newQualityDist = analyzeQualityDistribution(newAvailable)

          console.log('[AI_RECOMMENDED_MODAL_LOAD_FLOW]', {
            projectId,
            allowGenerate,
            initialCacheCount: cachedRaw.length,
            initialAvailableCount: availableAfterFiltering.length,
            minModalPool: MIN_MODAL_POOL,
            generationCalled: true,
            generationReason: 'cache_below_threshold',
            afterGenerationCacheCount: newCachedRaw.length,
            finalAvailableCount: newAvailable.length,
            renderedCount: newAvailable.length,
            reasonIfEmpty: newAvailable.length === 0 ? 'all_questions_already_saved' : null,
            qualityDistribution: newQualityDist,
          })

          // If Gemini (and cache) still produced nothing usable, fall back to a
          // quality local set so the modal never shows an empty state.
          if (newAvailable.length === 0) {
            const fb = buildModalFallback()
            const fallbackReason = geminiWasCalled ? 'gemini_returned_nothing' : (geminiNotCalledReason || 'enrichment_unavailable')
            console.log('[ai-question-suggestions] fallback used', { projectId, used: true, reason: fallbackReason, fallbackCount: fb.length })
            console.log('[ai-question-suggestions] fallback reason', { projectId, reason: fallbackReason })
            console.log('[ai-question-suggestions] final suggestions count:', fb.length)
            console.log('[ai-question-suggestions] state updated')
            commitSuggestions(fb)
            setSelectedIds(new Set())
            setIsLoadingSuggestions(false)
            return
          }

          const gatedNew = gateModalSuggestions(newAvailable, 'cache+gemini', allowGenerate)
          console.log('[ai-question-suggestions] fallback used', { projectId, used: false })
          console.log('[ai-question-suggestions] final suggestions count:', gatedNew.length)
          console.log('[ai-question-suggestions] state updated')
          commitSuggestions(gatedNew)
          setSelectedIds(new Set())
          setIsLoadingSuggestions(false)
          return
        }
      }

      // Step 4: Generation skipped/failed. Show cache if we have any; otherwise
      // guarantee a quality local fallback (never leave the modal empty).
      if (availableAfterFiltering.length > 0) {
        const gatedCache2 = gateModalSuggestions(availableAfterFiltering, 'cache', false)
        console.log('[ai-question-suggestions] fallback used', { projectId, used: false })
        console.log('[ai-question-suggestions] final suggestions count:', gatedCache2.length)
        console.log('[ai-question-suggestions] state updated')
        commitSuggestions(gatedCache2)
      } else {
        const fb = buildModalFallback()
        console.log('[ai-question-suggestions] fallback used', { projectId, used: true, reason: 'cache_empty_generation_skipped', fallbackCount: fb.length })
        console.log('[ai-question-suggestions] fallback reason', { projectId, reason: 'cache_empty_generation_skipped' })
        console.log('[ai-question-suggestions] final suggestions count:', fb.length)
        console.log('[ai-question-suggestions] state updated')
        commitSuggestions(fb)
      }
      setSelectedIds(new Set())
      setIsLoadingSuggestions(false)
    } catch (err) {
      console.error('[AI_RECOMMENDED_MODAL_LOAD_ERROR]', {
        error: err instanceof Error ? err.message : String(err),
      })
      // Even on error, guarantee a quality local fallback rather than empty.
      const fb = buildModalFallback()
      console.log('[ai-question-suggestions] fallback used', { projectId, used: true, reason: 'exception', fallbackCount: fb.length })
      console.log('[ai-question-suggestions] fallback reason', { projectId, reason: 'exception' })
      console.log('[ai-question-suggestions] final suggestions count:', fb.length)
      console.log('[ai-question-suggestions] state updated')
      commitSuggestions(fb)
      setSelectedIds(new Set())
      setIsLoadingSuggestions(false)
    }
  }

  async function regenerate() {
    setRegenerating(true)
    setError(null)
    const beforeCount = suggestions.length
    const normalizedLang = normalizeLanguage(language)
    await new Promise((r) => setTimeout(r, 250))

    try {
      // Regenerate: force fresh intent_v2 questions, bypass legacy cache
      const response = await fetch('/api/ai-visibility/enriched-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          language: normalizedLang,
          country: country || undefined,
          businessCategory: null,
          forceRefresh: true,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const cachedRaw: Array<{ id?: string; question: string; intent?: string }> = data.cachedSuggestions || []

        // Filter: ONLY by already-added (NOT seenPromptsRef)
        const refreshedAvailable = cachedRaw
          .filter(q => {
            const normalized = normalizePrompt(q.question)
            return !alreadyAddedPromptsRef.current.has(normalized)
          })
          .map(enrichCachedSuggestion)

        const qualityDist = analyzeQualityDistribution(refreshedAvailable)

        console.log('[AI_RECOMMENDED_MODAL_REFRESH]', {
          beforeCount,
          initialCacheCount: cachedRaw.length,
          generationCalled: false,
          finalAvailableCount: refreshedAvailable.length,
          renderedCount: refreshedAvailable.length,
          usedSeenPromptsFilter: false,
          qualityDistribution: qualityDist,
        })

        // Cache had usable questions → show them (after the display quality
        // gate; regenerate is an explicit user action → force refresh).
        if (refreshedAvailable.length > 0) {
          const gatedRefresh = gateModalSuggestions(refreshedAvailable, 'cache', true)
          if (gatedRefresh.length > 0) {
            commitSuggestions(gatedRefresh)
            setSelectedIds(new Set())
            setRegenerating(false)
            return
          }
        }
        // Cache empty → fall through to generator/fallback below.
      }
    } catch (err) {
      console.log('[AI_RECOMMENDED_MODAL_REFRESH_ERROR]', {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    // Cache empty/failed - try the vNext generator first (keyword-rich projects),
    // then a guaranteed quality fallback so regenerate never yields an empty set.
    const allExcluded = Array.from(seenPromptsRef.current).concat(
      Array.from(alreadyAddedPromptsRef.current)
    )

    let produced = generatePromptSuggestions({
      businessName,
      domain,
      city,
      country,
      language: normalizedLang,
      keywords,
      manualProfile,
      category,
      diversify: true,
      excludePrompts: allExcluded,
      previousSet: lastShownPromptsRef.current,
      recentlyUsedSecondaryCategories: Array.from(recentlyUsedSecondaryRef.current),
    })

    // Generic/new projects yield [] from the vNext engine — guarantee a set.
    let usedFallback = false
    if (produced.length === 0) {
      produced = buildModalFallback()
      usedFallback = true
    }

    recordGeneratorState(produced)

    const qualityDist = analyzeQualityDistribution(produced)

    console.log('[AI_RECOMMENDED_MODAL_REFRESH]', {
      beforeCount,
      initialCacheCount: 0,
      generationCalled: true,
      usedFallback,
      finalAvailableCount: produced.length,
      renderedCount: produced.length,
      usedSeenPromptsFilter: false,
      qualityDistribution: qualityDist,
    })

    commitSuggestions(produced)
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id))
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(suggestion.id)
        return next
      })
      onAdded()
    } catch (e) {
      console.error('[ai-suggestions] add failed', e)
      setError(t('something_went_wrong'))
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
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      }
      setSuggestions((prev) => prev.filter((s) => !selectedIds.has(s.id)))
      setSelectedIds(new Set())
      onAdded()
      if (suggestions.length === targets.length) onClose()
    } catch (e) {
      console.error('[ai-suggestions] add selected failed', e)
      setError(t('something_went_wrong'))
    } finally {
      setSaving(false)
    }
  }

  const selectedCount = selectedIds.size

  return (
    <Modal open={open} onClose={onClose} title={t('smart_questions_title')} size="lg">
      <div className="space-y-4" dir={isHebrew ? 'rtl' : 'ltr'}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-1 text-copy text-body">{t('smart_questions_help')}</p>
          <Button variant="secondary" size="sm" onClick={regenerate} disabled={regenerating} className="shrink-0">
            <RefreshCw aria-hidden="true" className={`size-4 ${regenerating ? 'animate-spin' : ''}`} />
            {t('regenerate')}
          </Button>
        </div>

        {error && <Notice tone="bad" onDismiss={() => setError(null)}>{error}</Notice>}

        {isLoadingSuggestions || regenerating ? (
          <div role="status" aria-busy="true" className="space-y-3" data-skeleton="">
            <span className="sr-only">{t('loading_suggestions')}</span>
            <div className="max-h-96 space-y-2 overflow-y-auto">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-start gap-3 rounded-inset border border-line bg-surface p-4">
                  <Skeleton className="mt-1 size-4" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-20 rounded-pill" />
                  </div>
                  <Skeleton className="h-8 w-14" />
                </div>
              ))}
            </div>
          </div>
        ) : suggestions.length === 0 ? (
          <EmptyState
            icon={<Sparkles />}
            title={alreadyAddedPromptsRef.current.size > 0 ? t('all_added') : t('no_new_suggestions')}
            action={
              <Button size="sm" variant="secondary" onClick={regenerate}>
                <RefreshCw aria-hidden="true" className="size-4" />
                {t('generate_again')}
              </Button>
            }
          />
        ) : (
          <ul className="max-h-96 space-y-2 overflow-y-auto pe-1">
            {suggestions.map((s) => {
              const checked = selectedIds.has(s.id)
              const isEditing = editingId === s.id
              const tier = 'confidenceTier' in s ? confidenceTierLabel(s.confidenceTier) : ''
              return (
                <li
                  key={s.id}
                  className={`flex items-start gap-3 rounded-inset border p-4 transition-colors duration-150 ease-snappy ${
                    checked ? 'border-action' : 'border-line hover:border-line-strong'
                  }`}
                >
                  <span className="flex h-6 items-center">
                    <Checkbox
                      checked={checked}
                      onChange={() => toggleSelect(s.id)}
                      aria-label={s.prompt}
                    />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    {isEditing ? (
                      <Input
                        type="text"
                        aria-label={t('edit')}
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
                      />
                    ) : (
                      <p className="text-copy font-medium text-ink">{s.prompt}</p>
                    )}
                    {s.worth ? (
                      <p className="text-caption text-muted" data-question-reason="">{worthReason(s.worth, t)}</p>
                    ) : (
                    <>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={INTENT_TONE[s.intent] || 'neutral'}>
                        {intentLabel(s.intent)}
                      </Badge>
                      {'confidenceTier' in s && tier && (
                        <Badge variant={confidenceTierColor(s.confidenceTier)}>{tier}</Badge>
                      )}
                    </div>
                    {'valueReason' in s && s.valueReason && (
                      <p className="text-caption font-medium text-body">{s.valueReason}</p>
                    )}
                    {s.reason && (
                      <p className="line-clamp-2 text-caption text-muted" title={s.reason}>
                        {s.reason}
                      </p>
                    )}
                    {'chips' in s && s.chips && s.chips.length > 0 && (
                      <p className="text-caption text-muted">{s.chips.map(chipLabel).join(' · ')}</p>
                    )}
                    </>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(s.id, s.prompt)}
                      aria-label={t('edit')}
                      title={t('edit')}
                      className="size-8 px-0"
                    >
                      <Pencil aria-hidden="true" className="size-4" />
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => addOne(s)} disabled={saving}>
                      {t('add')}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          <p className="text-caption text-muted tabular-nums">
            {selectedCount > 0
              ? `${selectedCount} ${t('selected')} ${t('of')} ${suggestions.length}`
              : `${suggestions.length}`}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
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
