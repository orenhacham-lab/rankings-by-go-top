'use client'

import { useEffect, useState, useCallback } from 'react'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { X, ChevronLeft } from 'lucide-react'

const STORAGE_KEY = 'rankings_dashboard_onboarding_completed'
const CURRENT_STEP_KEY = 'rankings_dashboard_onboarding_step'
const HIGHLIGHT_CLASS = 'onboarding-highlight'

const TOOLTIP_WIDTH = 380
const GAP = 16
const MOBILE_BP = 768

type TourStep = 'createClient' | 'createProject' | 'keywordResearch' | 'generateReports'

interface TourConfig {
  step: TourStep
  // Reliable, always-present targets: the sidebar navigation items.
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

export function DashboardOnboardingTour({
  totalClients,
  totalProjects,
  shouldShowTour = false,
}: DashboardOnboardingTourProps) {
  const { language, isLoaded } = useDashboardLanguage()
  const dict = isLoaded ? getDashboardDictionary(language) : getDashboardDictionary('he')
  const t = dict.onboarding

  const [isVisible, setIsVisible] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [position, setPosition] = useState<TooltipPosition | null>(null)

  // Skip steps the user already finished (has clients → start at project, etc).
  const getStartStep = useCallback(() => {
    if (totalClients === 0) return 0
    if (totalProjects === 0) return 1
    return 2
  }, [totalClients, totalProjects])

  // Decide whether to run the tour at all (logic preserved from before).
  useEffect(() => {
    if (typeof window === 'undefined') return

    if (localStorage.getItem(STORAGE_KEY) === 'true') return

    if (!shouldShowTour && totalClients > 0 && totalProjects > 0) return

    const startStep = getStartStep()
    const savedStep = localStorage.getItem(CURRENT_STEP_KEY)
    const parsed = savedStep ? parseInt(savedStep, 10) : NaN
    const initialStep =
      !Number.isNaN(parsed) && parsed >= startStep && parsed < tourSteps.length
        ? parsed
        : startStep

    setCurrentStepIndex(initialStep)
    setIsVisible(true)
  }, [totalClients, totalProjects, shouldShowTour, getStartStep])

  // Locate the target for the current step, skipping any that are missing.
  const resolveTarget = useCallback((fromIndex: number): { el: HTMLElement; index: number } | null => {
    for (let i = fromIndex; i < tourSteps.length; i++) {
      const el = document.querySelector(tourSteps[i].selector) as HTMLElement | null
      if (el) return { el, index: i }
    }
    return null
  }, [])

  const computePosition = useCallback((el: HTMLElement): TooltipPosition => {
    const rect = el.getBoundingClientRect()
    const isMobile = window.innerWidth < MOBILE_BP

    if (isMobile) {
      // Bottom sheet — clean and predictable on small screens.
      return { left: 0, top: 0, isMobile: true }
    }

    // Sidebar lives on the right (RTL). Prefer placing the card to its left.
    let left = rect.left - TOOLTIP_WIDTH - GAP
    let top = rect.top - 8

    if (left < GAP) {
      // Not enough room to the left → place below the element instead.
      left = Math.max(GAP, Math.min(rect.left, window.innerWidth - TOOLTIP_WIDTH - GAP))
      top = rect.bottom + GAP
    }

    // Keep the card fully on-screen vertically.
    top = Math.max(GAP, Math.min(top, window.innerHeight - 300))

    return { left, top, isMobile: false }
  }, [])

  // Apply the highlight ring + position the tooltip whenever the step changes.
  useEffect(() => {
    if (!isVisible) return

    const resolved = resolveTarget(currentStepIndex)

    if (!resolved) {
      // No target anywhere from here on → end gracefully (no black screen).
      finishTour()
      return
    }

    if (resolved.index !== currentStepIndex) {
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
    localStorage.setItem(STORAGE_KEY, 'true')
    localStorage.removeItem(CURRENT_STEP_KEY)
    // Defensive cleanup in case a highlight is still attached.
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((n) => n.classList.remove(HIGHLIGHT_CLASS))
    setIsVisible(false)
    setPosition(null)
  }

  const goNext = () => {
    const next = resolveTarget(currentStepIndex + 1)
    if (next) {
      setCurrentStepIndex(next.index)
      localStorage.setItem(CURRENT_STEP_KEY, next.index.toString())
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
