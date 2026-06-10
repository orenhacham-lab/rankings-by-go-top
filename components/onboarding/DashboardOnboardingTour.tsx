'use client'

import { useEffect, useState, useRef } from 'react'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { X, ChevronRight } from 'lucide-react'

const STORAGE_KEY = 'rankings_dashboard_onboarding_completed'
const CURRENT_STEP_KEY = 'rankings_dashboard_onboarding_step'

type TourStep = 'createClient' | 'createProject' | 'keywordResearch' | 'generateReports'

interface TourConfig {
  step: TourStep
  dataAttribute: string
  actionOnClick?: boolean
}

const tourSteps: TourConfig[] = [
  { step: 'createClient', dataAttribute: 'data-onboarding-create-client', actionOnClick: true },
  { step: 'createProject', dataAttribute: 'data-onboarding-create-project', actionOnClick: true },
  { step: 'keywordResearch', dataAttribute: 'data-onboarding-keyword-research', actionOnClick: true },
  { step: 'generateReports', dataAttribute: 'data-onboarding-reports', actionOnClick: true },
]

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

  const [isCompleted, setIsCompleted] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [isVisible, setIsVisible] = useState(false)
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null)
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Determine if we should skip any steps based on user progress
  const getStartStep = () => {
    if (totalClients === 0) return 0 // createClient
    if (totalProjects === 0) return 1 // createProject
    return 2 // keywordResearch
  }

  // Initialize tour
  useEffect(() => {
    // Check if already completed
    const completed = localStorage.getItem(STORAGE_KEY)
    if (completed === 'true') {
      setIsCompleted(true)
      return
    }

    // Only show for new users (no clients or projects)
    if (!shouldShowTour && totalClients > 0 && totalProjects > 0) {
      setIsCompleted(true)
      return
    }

    // Restore saved step or start from appropriate step
    const savedStep = localStorage.getItem(CURRENT_STEP_KEY)
    const startStep = getStartStep()

    if (savedStep) {
      const step = parseInt(savedStep, 10)
      if (step >= startStep && step < tourSteps.length) {
        setCurrentStepIndex(step)
      } else {
        setCurrentStepIndex(startStep)
      }
    } else {
      setCurrentStepIndex(startStep)
    }

    setIsVisible(true)
  }, [totalClients, totalProjects, shouldShowTour])

  // Find and highlight target element
  useEffect(() => {
    if (!isVisible || isCompleted) return

    const findTarget = () => {
      const config = tourSteps[currentStepIndex]
      if (!config) return null

      // Try to find by data attribute
      const selector = `[${config.dataAttribute}]`
      const element = document.querySelector(selector) as HTMLElement | null

      return element
    }

    const target = findTarget()
    setTargetElement(target)

    if (target) {
      const rect = target.getBoundingClientRect()
      setSpotlightRect(rect)

      // Scroll target into view if needed
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })

      // Handle click on target if specified
      if (tourSteps[currentStepIndex]?.actionOnClick && target) {
        const handleClick = () => {
          // Small delay to let click register
          setTimeout(() => {
            moveNext()
          }, 500)
        }

        target.addEventListener('click', handleClick, { once: true })
        return () => {
          target.removeEventListener('click', handleClick)
        }
      }
    }
  }, [isVisible, isCompleted, currentStepIndex])

  const moveNext = () => {
    if (currentStepIndex < tourSteps.length - 1) {
      const nextIndex = currentStepIndex + 1
      setCurrentStepIndex(nextIndex)
      localStorage.setItem(CURRENT_STEP_KEY, nextIndex.toString())
    } else {
      completeTour()
    }
  }

  const completeTour = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    localStorage.removeItem(CURRENT_STEP_KEY)
    setIsCompleted(true)
    setIsVisible(false)
  }

  const skipTour = () => {
    completeTour()
  }

  if (!isVisible || isCompleted) {
    return null
  }

  const currentConfig = tourSteps[currentStepIndex]
  const currentStepData = t.steps[currentConfig?.step as TourStep]
  const isLast = currentStepIndex === tourSteps.length - 1

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 pointer-events-auto">
        {/* Semi-transparent dark overlay */}
        <div className="absolute inset-0 bg-black bg-opacity-40" />

        {/* Spotlight cutout */}
        {spotlightRect && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{
              filter: 'drop-shadow(0 0 0 9999px rgba(0, 0, 0, 0.4))',
            }}
          >
            <rect
              x={Math.max(0, spotlightRect.left - 8)}
              y={Math.max(0, spotlightRect.top - 8)}
              width={spotlightRect.width + 16}
              height={spotlightRect.height + 16}
              rx="8"
              fill="white"
            />
          </svg>
        )}
      </div>

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="fixed z-50 bg-white dark:bg-slate-800 rounded-lg shadow-2xl p-6 max-w-sm pointer-events-auto"
        style={{
          left: spotlightRect
            ? Math.min(
                spotlightRect.left + spotlightRect.width / 2 - 200,
                window.innerWidth - 240
              )
            : '50%',
          top: spotlightRect
            ? Math.max(spotlightRect.top - 250, 80)
            : 'auto',
          transform: !spotlightRect ? 'translate(-50%, 0)' : 'translateX(0)',
        }}
      >
        {/* Header with close button */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">
              {dict.common.loading === dict.common.loading
                ? language === 'he'
                  ? `שלב ${currentStepIndex + 1} מתוך ${tourSteps.length}`
                  : `Step ${currentStepIndex + 1} of ${tourSteps.length}`
                : ''}
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {currentStepData.title}
            </h3>
          </div>
          <button
            onClick={skipTour}
            className="flex-shrink-0 ml-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            aria-label="Close tour"
          >
            <X size={20} />
          </button>
        </div>

        {/* Description */}
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
          {currentStepData.description}
        </p>

        {/* Buttons */}
        <div className="flex items-center gap-3 justify-between">
          <button
            onClick={skipTour}
            className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            {isLast ? t.buttons.done : t.buttons.skipAll}
          </button>

          <div className="flex items-center gap-2">
            {!isLast && (
              <button
                onClick={moveNext}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                {t.buttons.next}
                <ChevronRight size={16} />
              </button>
            )}
            {isLast && (
              <button
                onClick={completeTour}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
              >
                {t.buttons.done}
              </button>
            )}
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 mt-5">
          {tourSteps.map((_, index) => (
            <div
              key={index}
              className={`h-1.5 rounded-full transition-all ${
                index === currentStepIndex
                  ? 'bg-blue-600 w-6'
                  : index < currentStepIndex
                    ? 'bg-green-600 w-2'
                    : 'bg-slate-300 dark:bg-slate-600 w-2'
              }`}
            />
          ))}
        </div>
      </div>
    </>
  )
}
