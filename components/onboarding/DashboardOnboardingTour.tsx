'use client'

import { useEffect, useState, useCallback } from 'react'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { createClient } from '@/lib/supabase/client'
import { X, ChevronLeft } from 'lucide-react'

const STORAGE_KEY_BASE = 'rankings_dashboard_onboarding_completed'
const CURRENT_STEP_KEY_BASE = 'rankings_dashboard_onboarding_step'

const TOOLTIP_WIDTH = 380
const GAP = 16
const MOBILE_BP = 768

type TourStep = 'createClient' | 'createProject' | 'keywordResearch' | 'generateReports'

interface TourConfig {
  step: TourStep
  selector: string
}

const tourSteps: TourConfig[] = [
  { step: 'createClient', selector: '[data-onboarding="clients"]' },
  { step: 'createProject', selector: '[data-onboarding="projects"]' },
  { step: 'keywordResearch', selector: '[data-onboarding="keyword-research"]' },
  { step: 'generateReports', selector: '[data-onboarding="reports"]' },
]

interface TooltipPosition {
  left: number
  top: number
  isMobile: boolean
}

interface DashboardOnboardingTourProps {
  totalClients: number
  totalProjects: number
  shouldShowTour?: boolean
}

const HIGHLIGHT_CLASS = 'onboarding-highlight'

// Dev-only logging — stripped in production builds.
const isDev = process.env.NODE_ENV !== 'production'
const debugLog = (...args: unknown[]) => {
  if (isDev) console.log(...args)
}
const debugWarn = (...args: unknown[]) => {
  if (isDev) console.warn(...args)
}

export function DashboardOnboardingTour({
  totalClients,
  totalProjects,
  shouldShowTour = false,
}: DashboardOnboardingTourProps) {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const t = dict.onboarding

  const [isVisible, setIsVisible] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [position, setPosition] = useState<TooltipPosition | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  // Get the user ID to make localStorage keys user-specific
  useEffect(() => {
    const getUserId = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.id) {
        setUserId(user.id)
        const debugUserId = user.id.slice(0, 8) + '...'
        debugLog('[onboarding] mounted, userId:', debugUserId)

        // Debug: check if selectors can find targets
        const foundTargets = tourSteps
          .map((step) => ({
            step: step.step,
            selector: step.selector,
            found: !!document.querySelector(step.selector),
          }))
          .filter((t) => !t.found)
        if (foundTargets.length > 0) {
          debugWarn('[onboarding] some targets not found:', foundTargets)
        }
      }
    }
    // Small delay to ensure DOM is fully painted
    const timer = setTimeout(getUserId, 100)
    return () => clearTimeout(timer)
  }, [])

  // Construct user-specific storage keys
  const getStorageKey = (userId: string | null) => userId ? `${STORAGE_KEY_BASE}_${userId}` : STORAGE_KEY_BASE
  const getCurrentStepKey = (userId: string | null) => userId ? `${CURRENT_STEP_KEY_BASE}_${userId}` : CURRENT_STEP_KEY_BASE

  // Skip steps the user already finished
  const getStartStep = useCallback(() => {
    if (totalClients === 0) return 0
    if (totalProjects === 0) return 1
    return 2
  }, [totalClients, totalProjects])

  // Decide whether to run the tour
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!userId) return // Wait for user ID

    const storageKey = getStorageKey(userId)
    const currentStepKey = getCurrentStepKey(userId)

    const isCompleted = localStorage.getItem(storageKey) === 'true'
    const startStep = getStartStep()
    const hasClients = totalClients > 0
    const hasProjects = totalProjects > 0

    debugLog('[onboarding] check conditions', {
      isCompleted,
      shouldShowTour,
      hasClients,
      hasProjects,
      startStep,
    })

    // Don't show if already completed
    if (isCompleted) {
      debugLog('[onboarding] already completed, skipping')
      return
    }

    // Don't show if established user (has clients and projects) and shouldn't force show
    if (!shouldShowTour && hasClients && hasProjects) {
      debugLog('[onboarding] user is established (has clients + projects), skipping')
      return
    }

    const savedStep = localStorage.getItem(currentStepKey)
    const parsed = savedStep ? parseInt(savedStep, 10) : NaN
    const initialStep =
      !Number.isNaN(parsed) && parsed >= startStep && parsed < tourSteps.length
        ? parsed
        : startStep

    debugLog('[onboarding] showing tour, initialStep:', initialStep)
    setCurrentStepIndex(initialStep)
    setIsVisible(true)
  }, [totalClients, totalProjects, shouldShowTour, getStartStep, userId])

  // Locate the target for the current step
  const resolveTarget = useCallback((fromIndex: number): { el: HTMLElement; index: number } | null => {
    for (let i = fromIndex; i < tourSteps.length; i++) {
      const el = document.querySelector(tourSteps[i].selector) as HTMLElement | null
      if (el) {
        debugLog('[onboarding] found target:', tourSteps[i].selector, 'at step', i)
        return { el, index: i }
      }
    }
    debugLog('[onboarding] no targets found from step', fromIndex)
    return null
  }, [])

  const computePosition = useCallback((el: HTMLElement): TooltipPosition => {
    const rect = el.getBoundingClientRect()
    const isMobile = window.innerWidth < MOBILE_BP

    if (isMobile) {
      return { left: 0, top: 0, isMobile: true }
    }

    let left = rect.left - TOOLTIP_WIDTH - GAP
    let top = rect.top - 8

    if (left < GAP) {
      left = Math.max(GAP, Math.min(rect.left, window.innerWidth - TOOLTIP_WIDTH - GAP))
      top = rect.bottom + GAP
    }

    top = Math.max(GAP, Math.min(top, window.innerHeight - 300))

    return { left, top, isMobile: false }
  }, [])

  // Apply highlight + position tooltip
  useEffect(() => {
    if (!isVisible) return

    const resolved = resolveTarget(currentStepIndex)

    if (!resolved) {
      debugLog('[onboarding] no target found, ending tour')
      finishTour()
      return
    }

    if (resolved.index !== currentStepIndex) {
      debugLog('[onboarding] skipping to next available step:', resolved.index)
      setCurrentStepIndex(resolved.index)
      return
    }

    const el = resolved.el
    el.classList.add(HIGHLIGHT_CLASS)
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    setPosition(computePosition(el))

    const reposition = () => setPosition(computePosition(el))
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)

    return () => {
      el.classList.remove(HIGHLIGHT_CLASS)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, currentStepIndex])

  function finishTour() {
    if (!userId) return
    const storageKey = getStorageKey(userId)
    const currentStepKey = getCurrentStepKey(userId)
    localStorage.setItem(storageKey, 'true')
    localStorage.removeItem(currentStepKey)
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((n) => n.classList.remove(HIGHLIGHT_CLASS))
    debugLog('[onboarding] tour finished')
    setIsVisible(false)
    setPosition(null)
  }

  const goNext = () => {
    const next = resolveTarget(currentStepIndex + 1)
    if (next) {
      debugLog('[onboarding] moving to next step:', next.index)
      setCurrentStepIndex(next.index)
      if (userId) {
        localStorage.setItem(getCurrentStepKey(userId), next.index.toString())
      }
    } else {
      finishTour()
    }
  }

  if (!isVisible || !position) return null

  const currentConfig = tourSteps[currentStepIndex]
  const stepData = t.steps[currentConfig.step]
  const isLast = currentStepIndex === tourSteps.length - 1
  const stepLabel =
    language === 'he'
      ? `שלב ${currentStepIndex + 1} מתוך ${tourSteps.length}`
      : `Step ${currentStepIndex + 1} of ${tourSteps.length}`

  const cardStyle: React.CSSProperties = position.isMobile
    ? {
        left: 16,
        right: 16,
        bottom: 16,
        maxWidth: 'none',
      }
    : {
        left: position.left,
        top: position.top,
        width: TOOLTIP_WIDTH,
      }

  return (
    <>
      {/* Subtle overlay — sits BELOW the sidebar (z-40) so the highlighted
          sidebar item stays bright, visible and clickable. */}
      <div
        className="fixed inset-0 z-30"
        style={{ backgroundColor: 'rgba(15, 23, 42, 0.45)' }}
        onClick={finishTour}
        aria-hidden="true"
      />

      {/* Tooltip card */}
      <div
        dir={language === 'he' ? 'rtl' : 'ltr'}
        className="fixed z-50 rounded-2xl bg-white dark:bg-slate-800 shadow-2xl border border-slate-200 dark:border-slate-700 p-5"
        style={cardStyle}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-1">
              {stepLabel}
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-snug">
              {stepData.title}
            </h3>
          </div>
          <button
            onClick={finishTour}
            className="flex-shrink-0 -mt-1 -me-1 p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            aria-label={t.buttons.skip}
          >
            <X size={18} />
          </button>
        </div>

        {/* Description */}
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-5">
          {stepData.description}
        </p>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 mb-4">
          {tourSteps.map((_, index) => (
            <span
              key={index}
              className={`h-1.5 rounded-full transition-all ${
                index === currentStepIndex
                  ? 'bg-indigo-600 w-5'
                  : index < currentStepIndex
                    ? 'bg-indigo-300 dark:bg-indigo-500/60 w-2'
                    : 'bg-slate-200 dark:bg-slate-600 w-2'
              }`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={finishTour}
            className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            {t.buttons.skip}
          </button>

          <button
            onClick={isLast ? finishTour : goNext}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors ${
              isLast
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {isLast ? t.buttons.done : t.buttons.next}
            {!isLast && (
              <ChevronLeft size={16} className={language === 'he' ? '' : 'rotate-180'} />
            )}
          </button>
        </div>
      </div>
    </>
  )
}
