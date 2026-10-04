/**
 * The guided tours: which steps each tour has, what each step points at, and when
 * a tour starts on its own. Pure (no React, no DOM), so the rules are tested
 * without a browser (lib/guide/__qa__/guide-tours.qa.ts).
 *
 * There is ONE tour system: components/onboarding/DashboardOnboardingTour.tsx
 * runs any of these step lists, and components/guide/GuideMenu.tsx (the "Guide"
 * pill in the top bar) starts them. The texts live in the dashboard dictionaries
 * under `guide.steps`, keyed by the step's `key`.
 *
 * A step points at the page by a CSS selector list. The runner uses the first
 * match that is visible. A sidebar entry (`navEntry`) is inside the closed menu
 * on a phone: the runner opens the menu and points at the entry there. A step
 * whose target cannot be seen at all is skipped, so the bubble never points at
 * nothing, and a screen switched off in this build is never described.
 */
import { CONTENT_ROOT_PATH, CONTENT_STRATEGY_PATH } from '@/lib/content/content-workspace-nav'

export type TourStepKey =
  // The full tour (the UX review's eight steps, in its order).
  | 'switcher' | 'hero' | 'research' | 'keywords' | 'strategy' | 'aiVisibility' | 'connections' | 'guide'
  // Steps of the per-screen tours.
  | 'dashboardHero' | 'dashboardShortcuts'
  // A new project's dashboard opens on "Start here" instead of the opening card.
  | 'start'
  | 'researchHeader' | 'researchForm'
  | 'keywordsHeader'
  | 'strategyHeader'
  | 'aiHeader'
  | 'settingsHeader' | 'settingsConnections'
  | 'reportsHeader'
  // Every other screen the sidebar leads to has a tour of its own too (owner,
  // 4 October 2026: "not every page has a screen tour, it should").
  | 'contentHeader'
  | 'siteHealthHeader' | 'siteHealthFixes'
  | 'siteLinksHeader' | 'siteLinksOptIn'
  | 'mapsPostsHeader'
  | 'billingHeader' | 'billingPlan'
  | 'projectScope'

export interface TourStep {
  key: TourStepKey
  /** CSS selector list; the first VISIBLE match wins. */
  target: string
  /**
   * The target renders after the screen's data arrives (the dashboard's opening
   * card), so the runner waits for it a little before skipping the step.
   */
  lazy?: boolean
  /** Only meaningful with a project open: left out for an account that has none yet. */
  needsProject?: boolean
  /** A sidebar entry: on a phone the runner opens the menu to show it. */
  navEntry?: boolean
  /**
   * Another text for the step when the element it found says so: the matched
   * element's `data-tour-variant` names a key here (a new project's "Start here"
   * card stands where the opening card would be).
   */
  variants?: Readonly<Record<string, TourStepKey>>
}

/** The dashboard's first card: the opening card, or "Start here" on a new project. */
export const DASHBOARD_FIRST_CARD = '[data-dashboard-widget="hero"], [data-dashboard-widget="start"]'
const FIRST_CARD_VARIANTS = { start: 'start' } as const

/** The top bar's switcher carries this anchor in every state it renders. */
export const SWITCHER_TARGET = '[data-onboarding="workspace"]'
/** The Guide pill itself. */
export const GUIDE_TARGET = '[data-tour="guide"]'
/** The screen's own header (components/layout/Header.tsx); a screen with its own h1 falls back to it. */
export const SCREEN_HEADER_TARGET = '[data-tour="screen-header"], main h1'
/** A sidebar entry, by the screen it opens. Sidebar links keep their href whatever they look like. */
export const navTarget = (href: string) => `aside a[href="${href}"]`

export const FULL_TOUR: readonly TourStep[] = [
  { key: 'switcher', target: SWITCHER_TARGET },
  { key: 'hero', target: DASHBOARD_FIRST_CARD, lazy: true, needsProject: true, variants: FIRST_CARD_VARIANTS },
  { key: 'research', target: navTarget('/keyword-research'), navEntry: true },
  { key: 'keywords', target: navTarget('/keywords'), navEntry: true },
  { key: 'strategy', target: navTarget(CONTENT_STRATEGY_PATH), navEntry: true },
  { key: 'aiVisibility', target: navTarget('/ai-visibility'), navEntry: true },
  { key: 'connections', target: navTarget('/settings'), navEntry: true },
  { key: 'guide', target: GUIDE_TARGET },
]

/** Where the full tour runs: its second stop is the dashboard's opening card. */
export const FULL_TOUR_HOME = '/dashboard'

export type ScreenKey = 'dashboard' | 'keywordResearch' | 'keywords' | 'content' | 'strategy' | 'aiVisibility'
  | 'siteHealth' | 'siteLinks' | 'mapsPosts' | 'settings' | 'reports' | 'billing'

/**
 * The per-screen tours: one for EVERY screen the sidebar leads to, not only the
 * ones the full tour names. A screen whose build flag is off is never reached,
 * and a step whose target is not on the page is skipped, so a tour listed here
 * can never point at nothing.
 */
export const SCREEN_TOURS: Readonly<Record<ScreenKey, { path: string; steps: readonly TourStep[] }>> = {
  dashboard: {
    path: '/dashboard',
    steps: [
      { key: 'dashboardHero', target: DASHBOARD_FIRST_CARD, lazy: true, needsProject: true, variants: FIRST_CARD_VARIANTS },
      { key: 'dashboardShortcuts', target: '[data-tour="screen-actions"]' },
    ],
  },
  keywordResearch: {
    path: '/keyword-research',
    steps: [
      { key: 'researchHeader', target: SCREEN_HEADER_TARGET },
      { key: 'researchForm', target: 'main form', lazy: true },
    ],
  },
  keywords: {
    path: '/keywords',
    steps: [
      { key: 'keywordsHeader', target: SCREEN_HEADER_TARGET },
      { key: 'projectScope', target: SWITCHER_TARGET, needsProject: true },
    ],
  },
  content: {
    path: CONTENT_ROOT_PATH,
    steps: [
      { key: 'contentHeader', target: SCREEN_HEADER_TARGET },
      { key: 'projectScope', target: SWITCHER_TARGET, needsProject: true },
    ],
  },
  strategy: {
    path: CONTENT_STRATEGY_PATH,
    steps: [
      { key: 'strategyHeader', target: SCREEN_HEADER_TARGET },
      { key: 'projectScope', target: SWITCHER_TARGET, needsProject: true },
    ],
  },
  aiVisibility: {
    path: '/ai-visibility',
    steps: [
      { key: 'aiHeader', target: SCREEN_HEADER_TARGET },
      { key: 'projectScope', target: SWITCHER_TARGET, needsProject: true },
    ],
  },
  siteHealth: {
    path: '/site-health',
    steps: [
      { key: 'siteHealthHeader', target: SCREEN_HEADER_TARGET },
      { key: 'siteHealthFixes', target: '#fixes, [data-scan-again]', lazy: true, needsProject: true },
    ],
  },
  siteLinks: {
    path: '/site-links',
    steps: [
      { key: 'siteLinksHeader', target: SCREEN_HEADER_TARGET },
      { key: 'siteLinksOptIn', target: '[data-link-network="panel"]', lazy: true, needsProject: true },
    ],
  },
  mapsPosts: {
    path: '/maps-posts',
    steps: [
      { key: 'mapsPostsHeader', target: SCREEN_HEADER_TARGET },
      { key: 'projectScope', target: SWITCHER_TARGET, needsProject: true },
    ],
  },
  settings: {
    path: '/settings',
    steps: [
      { key: 'settingsHeader', target: SCREEN_HEADER_TARGET },
      { key: 'settingsConnections', target: '#connections', lazy: true, needsProject: true },
    ],
  },
  reports: {
    path: '/reports',
    steps: [
      { key: 'reportsHeader', target: SCREEN_HEADER_TARGET },
      { key: 'projectScope', target: SWITCHER_TARGET, needsProject: true },
    ],
  },
  // The account's own screen: no project step, because nothing on it is scoped
  // to a project.
  billing: {
    path: '/billing',
    steps: [
      { key: 'billingHeader', target: SCREEN_HEADER_TARGET },
      { key: 'billingPlan', target: '[data-plan-card]', lazy: true },
    ],
  },
}

/** The screen a pathname is, when it has a tour of its own; null otherwise. */
export function screenForPath(pathname: string | null | undefined): ScreenKey | null {
  if (!pathname) return null
  const clean = pathname.replace(/\/+$/, '') || '/'
  for (const [key, tour] of Object.entries(SCREEN_TOURS) as [ScreenKey, (typeof SCREEN_TOURS)[ScreenKey]][]) {
    if (tour.path === clean) return key
  }
  return null
}

// ── Per-user state ────────────────────────────────────────────────────────────
//
// Kept where the tour always kept it: in the browser's localStorage, under keys
// that carry the user's id, so two people on one browser never share it. The UX
// review asks for a user_preferences table so the state follows the user across
// devices; that is a migration, which this change does not make.

/**
 * The full tour's key is the SAME key the three-step tour used, so an account
 * that already finished that tour is not shown the new one uninvited.
 */
export const FULL_TOUR_KEY_BASE = 'rankings_dashboard_onboarding_completed'
export const SCREEN_TOUR_KEY_BASE = 'rankings_tour_screen'
/** The old tour's resume pointer. Nothing reads it now; it is removed when a tour ends. */
export const LEGACY_STEP_KEY_BASE = 'rankings_dashboard_onboarding_step'

export const fullTourKey = (userId: string) => `${FULL_TOUR_KEY_BASE}_${userId}`
export const screenTourKey = (userId: string, screen: ScreenKey) => `${SCREEN_TOUR_KEY_BASE}_${screen}_${userId}`
export const legacyStepKey = (userId: string) => `${LEGACY_STEP_KEY_BASE}_${userId}`

/**
 * What the full tour's stored value means. The three-step tour wrote 'true' for
 * both finishing and skipping; it counts as finished, because that person has
 * already been walked through once.
 */
export type FullTourState = 'new' | 'completed' | 'dismissed'
export function readFullTourState(raw: string | null): FullTourState {
  if (raw === 'completed' || raw === 'true') return 'completed'
  if (raw === 'dismissed') return 'dismissed'
  return 'new'
}

/** The pill's dot: shown until a tour has been finished once. */
export function showGuideDot(state: FullTourState): boolean {
  return state !== 'completed'
}

/**
 * Tours start on their own only for a NEW account: one created within this many
 * days. An account that has used the product for longer gets the pill's dot and
 * its menu, never a tour popping up over screens it already knows.
 */
export const AUTO_TOUR_ACCOUNT_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

export function isNewAccount(createdAt: string | null | undefined, now: Date): boolean {
  const created = createdAt ? Date.parse(createdAt) : NaN
  if (!Number.isFinite(created)) return false
  return now.getTime() - created < AUTO_TOUR_ACCOUNT_DAYS * DAY_MS
}

export type AutoTour = { kind: 'full' } | { kind: 'screen'; screen: ScreenKey } | null

/**
 * Which tour, if any, starts by itself on this screen:
 *   - never for an established account, and never while the project list is unknown;
 *   - the full tour once, on the dashboard, until it is finished or skipped;
 *   - after that, each screen's own tour the first time the screen is opened.
 */
export function autoTour(input: {
  pathname: string | null
  newAccount: boolean
  projectsResolved: boolean
  fullTour: FullTourState
  screenSeen: (screen: ScreenKey) => boolean
}): AutoTour {
  if (!input.newAccount || !input.projectsResolved) return null
  const screen = screenForPath(input.pathname)
  if (input.fullTour === 'new') return screen === 'dashboard' ? { kind: 'full' } : null
  if (screen && !input.screenSeen(screen)) return { kind: 'screen', screen }
  return null
}

/** The steps of a tour, as the runner receives them. */
export function tourSteps(tour: Exclude<AutoTour, null>, hasProjects: boolean): readonly TourStep[] {
  const steps = tour.kind === 'full' ? FULL_TOUR : SCREEN_TOURS[tour.screen].steps
  return hasProjects ? steps : steps.filter((s) => !s.needsProject)
}
