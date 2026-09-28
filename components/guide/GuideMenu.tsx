'use client'

/**
 * The Guide pill — our own help entry in the top bar, beside the project switcher.
 *
 * Not a floating "?" circle in a corner: a labelled pill in the bar ("מדריך" /
 * "Guide", with a compass), icon-only on a phone. It opens a small menu:
 *   1. a tour of the whole app,
 *   2. a tour of the screen you are on (switched off, with the reason, on a
 *      screen that has none),
 *   3. common questions, answered in place,
 *   4. WhatsApp, to the same number as every other WhatsApp entry
 *      (components/public/contact.ts).
 * A small dot on the pill says a tour is waiting, until one has been finished.
 *
 * It also owns WHEN a tour starts on its own (lib/guide/tours.ts: autoTour) and
 * remembers, per user, what was seen. The tours themselves run in
 * components/onboarding/DashboardOnboardingTour.tsx — the one tour system.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { BookOpen, ChevronDown, ChevronLeft, Compass, Map as MapIcon, MessageCircle, ScanSearch } from 'lucide-react'
import { useActiveProject } from '@/lib/active-project/ActiveProjectProvider'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { WHATSAPP_NUMBER } from '@/components/public/contact'
import { DashboardOnboardingTour, type TourEnd, type TourRun } from '@/components/onboarding/DashboardOnboardingTour'
import {
  FULL_TOUR_HOME, autoTour, fullTourKey, isNewAccount, legacyStepKey, readFullTourState,
  screenForPath, screenTourKey, showGuideDot, tourSteps, type AutoTour, type FullTourState, type ScreenKey,
} from '@/lib/guide/tours'
import { cn } from '@/lib/utils'

type FaqKey = keyof ReturnType<typeof getDashboardDictionary>['guide']['faqItems']

/** Only questions about what this build actually has. */
function faqKeys(): FaqKey[] {
  const keys: FaqKey[] = ['project', 'moreProjects', 'rankings', 'volumes']
  if (process.env.NEXT_PUBLIC_ENABLE_AI_VISIBILITY === 'true') keys.push('ai')
  if (process.env.NEXT_PUBLIC_ENABLE_CONTENT === 'true') keys.push('publishing')
  return keys
}

/**
 * FUTURE SLOT — "Ask the assistant" (AI tips chat), under WhatsApp.
 * NOT APPROVED: it renders nothing. The UX review wants it only once it can read
 * the project's data (a generic chat would weaken trust), and inside this menu,
 * never as a second floating bubble.
 */
const AI_TIPS_SLOT: React.ReactNode = null

function readStore(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeStore(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch { /* private mode — the tour simply is not remembered */ }
}

type ActiveRun = TourRun & { kind: 'full' } | TourRun & { kind: 'screen'; screen: ScreenKey }

export default function GuideMenu({ userId, accountCreatedAt }: { userId: string; accountCreatedAt: string | null }) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).guide
  const pathname = usePathname()
  const router = useRouter()
  const { activeProjectId, projects, isResolved } = useActiveProject()
  const hasProjects = projects.length > 0

  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'menu' | 'faq'>('menu')
  const [run, setRun] = useState<ActiveRun | null>(null)
  const [pendingFull, setPendingFull] = useState(false)
  // Read after mount: localStorage does not exist on the server.
  const [fullState, setFullState] = useState<FullTourState | null>(null)

  const boxRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const autoTried = useRef<Set<string>>(new Set())
  const menuId = useId()

  const screen = screenForPath(pathname)

  useEffect(() => { setFullState(readFullTourState(readStore(fullTourKey(userId)))) }, [userId])

  /** A run of a tour, without the steps an account with no project has nothing to show for. */
  const runOf = useCallback((tour: NonNullable<AutoTour>): ActiveRun => {
    const steps = tourSteps(tour, hasProjects)
    return tour.kind === 'full'
      ? { id: Date.now(), kind: 'full', steps }
      : { id: Date.now(), kind: 'screen', screen: tour.screen, steps }
  }, [hasProjects])

  const startFull = useCallback(() => {
    setOpen(false)
    if (screenForPath(pathname) !== 'dashboard') {
      // The full tour's second stop is the dashboard's opening card: go there first.
      setPendingFull(true)
      router.push(activeProjectId ? `${FULL_TOUR_HOME}?projectId=${encodeURIComponent(activeProjectId)}` : FULL_TOUR_HOME)
      return
    }
    setRun(runOf({ kind: 'full' }))
  }, [pathname, router, activeProjectId, runOf])

  const startScreen = useCallback((key: ScreenKey) => {
    setOpen(false)
    setRun(runOf({ kind: 'screen', screen: key }))
  }, [runOf])

  // After the navigation a full tour asked for, it starts once the dashboard is there.
  useEffect(() => {
    if (!pendingFull || screenForPath(pathname) !== 'dashboard') return
    const timer = window.setTimeout(() => { setPendingFull(false); setRun(runOf({ kind: 'full' })) }, 300)
    return () => window.clearTimeout(timer)
  }, [pendingFull, pathname, runOf])

  // A tour starts on its own only for a new account, once per screen (autoTour).
  useEffect(() => {
    if (run || pendingFull || fullState === null || !isResolved || !pathname) return
    if (autoTried.current.has(pathname)) return
    const pick = autoTour({
      pathname,
      newAccount: isNewAccount(accountCreatedAt, new Date()),
      projectsResolved: isResolved,
      fullTour: fullState,
      screenSeen: (s) => readStore(screenTourKey(userId, s)) !== null,
    })
    autoTried.current.add(pathname)
    if (!pick) return
    // Let the screen paint first; a bubble over a blank page points at nothing.
    const timer = window.setTimeout(() => setRun(runOf(pick)), 700)
    return () => window.clearTimeout(timer)
  }, [run, pendingFull, fullState, isResolved, pathname, accountCreatedAt, userId, runOf])

  const onTourEnd = useCallback((how: TourEnd) => {
    const current = run
    setRun(null)
    if (!current) return
    if (current.kind === 'full') {
      // Finishing is kept over skipping: a later skip never brings the dot back.
      const next: FullTourState = how === 'completed' || fullState === 'completed' ? 'completed' : 'dismissed'
      writeStore(fullTourKey(userId), next)
      writeStore(legacyStepKey(userId), null)
      // The dashboard's own tour would only repeat the stop just shown there.
      writeStore(screenTourKey(userId, 'dashboard'), 'seen')
      setFullState(next)
    } else {
      writeStore(screenTourKey(userId, current.screen), 'seen')
    }
  }, [run, userId, fullState])

  // Close on an outside click; Escape closes and returns focus to the pill.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Opening moves focus into the menu; switching views moves it to the new view.
  useEffect(() => {
    if (!open) return
    const first = panelRef.current?.querySelector<HTMLElement>(view === 'menu' ? '[role="menuitem"]' : 'button, summary')
    first?.focus({ preventScroll: true })
  }, [open, view])

  const closeToPill = () => { setOpen(false); pillRef.current?.focus({ preventScroll: true }) }

  const onPanelKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeToPill(); return }
    if (view !== 'menu') return
    if (e.key === 'Tab') { e.preventDefault(); closeToPill(); return }
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const at = items.indexOf(document.activeElement as HTMLElement)
    const move = (i: number) => { e.preventDefault(); items[(i + items.length) % items.length]?.focus() }
    if (e.key === 'ArrowDown') move(at + 1)
    else if (e.key === 'ArrowUp') move(at - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(items.length - 1)
  }

  const onPillKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setView('menu'); setOpen(true) }
  }

  const whatsappHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(t.whatsappMessage)}`
  const dot = fullState !== null && showGuideDot(fullState)
  const ITEM = 'flex w-full items-center gap-3 rounded-control px-3 py-2 text-start text-copy text-body transition-colors duration-150 hover:bg-sunk hover:text-ink focus-visible:bg-sunk focus-visible:text-ink focus-visible:outline-none'

  return (
    <div ref={boxRef} className="sm:relative">
      <button
        ref={pillRef}
        type="button"
        data-tour="guide"
        onClick={() => { setView('menu'); setOpen((v) => !v) }}
        onKeyDown={onPillKey}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t.label}
        className={cn(
          'relative inline-flex size-9 shrink-0 items-center justify-center gap-1.5 rounded-pill bg-action-soft text-[0.8125rem] font-semibold text-action',
          'sm:size-auto sm:h-8 sm:px-3',
          'transition-colors duration-150 hover:bg-action hover:text-action-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          open && 'bg-action text-action-ink',
        )}
      >
        <Compass size={16} strokeWidth={2} aria-hidden="true" />
        <span className="hidden sm:inline">{t.label}</span>
        {dot && (
          <span aria-hidden="true" data-guide-dot className="absolute -top-0.5 -end-0.5 size-1.5 rounded-full bg-action ring-2 ring-canvas" />
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          id={menuId}
          role={view === 'menu' ? 'menu' : 'region'}
          aria-label={view === 'menu' ? t.menuLabel : t.faq}
          onKeyDown={onPanelKey}
          className={cn(
            'absolute inset-x-4 top-full z-50 mt-1 origin-top overflow-hidden rounded-card border border-line bg-surface p-1 shadow-pop motion-safe:animate-pop-in',
            'sm:inset-x-auto sm:start-0 sm:mt-2',
            view === 'menu' ? 'sm:w-[280px]' : 'sm:w-[340px]',
          )}
        >
          {view === 'menu' ? (
            <>
              <button type="button" role="menuitem" onClick={startFull} className={ITEM}>
                <MapIcon size={16} className="shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1">{t.fullTour}</span>
                <span className="shrink-0 text-caption text-muted">{t.fullTourMeta}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                aria-disabled={screen ? undefined : true}
                aria-describedby={screen ? undefined : `${menuId}-noscreen`}
                onClick={() => { if (screen) startScreen(screen) }}
                className={cn(ITEM, !screen && 'cursor-not-allowed text-muted hover:bg-transparent hover:text-muted')}
              >
                <ScanSearch size={16} className="shrink-0 text-muted" aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span>{t.screenTour}</span>
                  {!screen && <span id={`${menuId}-noscreen`} className="text-caption text-muted">{t.screenTourNone}</span>}
                </span>
              </button>
              <button type="button" role="menuitem" onClick={() => setView('faq')} className={ITEM}>
                <BookOpen size={16} className="shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1">{t.faq}</span>
                <ChevronLeft size={15} className="shrink-0 text-muted ltr:rotate-180" aria-hidden="true" />
              </button>
              <div role="separator" className="mx-2 my-1 h-px bg-line" />
              <a
                role="menuitem"
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className={ITEM}
              >
                <MessageCircle size={16} className="shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1">{t.whatsapp}</span>
                <span className="sr-only">{t.opensNewTab}</span>
              </a>
              {AI_TIPS_SLOT}
            </>
          ) : (
            <div className="flex max-h-[min(28rem,70vh)] flex-col">
              <div className="flex items-center gap-1 border-b border-line px-1 pb-1">
                <button
                  type="button"
                  onClick={() => setView('menu')}
                  className="inline-flex items-center gap-1 rounded-control px-2 py-1.5 text-caption font-medium text-muted transition-colors hover:bg-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
                >
                  <ChevronLeft size={14} className="rtl:rotate-180" aria-hidden="true" />
                  {t.back}
                </button>
                <h2 className="text-copy font-semibold text-ink">{t.faq}</h2>
              </div>
              <div className="overflow-y-auto p-1">
                {faqKeys().map((key) => (
                  <details key={key} className="group rounded-control px-2 open:bg-sunk">
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-2 rounded-control py-2 text-copy font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action [&::-webkit-details-marker]:hidden">
                      <span>{t.faqItems[key].q}</span>
                      <ChevronDown size={14} className="mt-1 shrink-0 text-muted transition-transform duration-150 group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <p className="pb-2.5 text-copy text-body text-pretty">{t.faqItems[key].a}</p>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <DashboardOnboardingTour run={run} onEnd={onTourEnd} />
    </div>
  )
}
