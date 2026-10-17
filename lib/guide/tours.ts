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
  // The per-screen tours. Each screen's tour walks what is ON the screen — its
  // cards, its tabs, the controls a reader acts on — because the owner's
  // complaint about the first version was exactly that it named the screen's
  // title and then said nothing about the rest (5 October 2026: "it is not
  // detailed enough in many of the tabs and only talks about the title").
  //
  // A screen's steps are listed in the order the reader meets them down the
  // page. Nearly all of them are `lazy`, because a card that has no data yet is
  // not on the page at all, and a step whose target is missing is skipped.
  | 'start'
  | 'projectScope'
  // The dashboard.
  | 'dashboardHero' | 'dashboardTiles' | 'dashboardHoldingBack' | 'dashboardOpportunities'
  | 'dashboardBoard' | 'dashboardSetup' | 'dashboardAccount' | 'dashboardFold' | 'dashboardShortcuts'
  // Keyword research.
  | 'researchHeader' | 'researchStart' | 'researchForm' | 'researchType' | 'researchNav'
  | 'researchWins' | 'researchAudiences' | 'researchCompetitive' | 'researchTable' | 'researchTrack'
  // The tracked keywords.
  | 'keywordsHeader' | 'keywordsHero' | 'keywordsGsc' | 'keywordsToolbar' | 'keywordsTable'
  | 'keywordsRowMenu' | 'keywordsCompetitors' | 'keywordsHistory'
  // The articles screen.
  | 'contentHeader' | 'contentDestination' | 'contentHero' | 'contentNewTopic' | 'contentFilters' | 'contentTable'
  // The content strategy.
  | 'strategyHeader' | 'strategyNext' | 'strategyPlan' | 'strategyAddKeyword' | 'strategyViews'
  | 'strategyMonths' | 'strategyIdeas' | 'strategyPublished' | 'strategyOverview' | 'strategyClusters'
  | 'strategyNextSteps' | 'strategyAdvanced'
  // The article editor, which had no tour of its own at all.
  | 'editorTopBar' | 'editorTabs' | 'editorRead' | 'editorAudit' | 'editorAutoLinks'
  | 'editorMetadata' | 'editorContent' | 'editorFaq' | 'editorImage'
  | 'editorPublish' | 'editorSave' | 'editorSchema'
  // AI visibility, whose four tabs the tour could not reach before `activate`.
  | 'aiHeader' | 'aiStatus' | 'aiOpening' | 'aiAuto' | 'aiTabs' | 'aiResults' | 'aiQueries'
  | 'aiSuggested' | 'aiInsights' | 'aiCompetitors' | 'aiActivity'
  // Site health.
  | 'siteHealthHeader' | 'siteHealthEmpty' | 'siteHealthScanFirst' | 'siteHealthScore' | 'siteHealthScanAgain' | 'siteHealthAutoFix'
  | 'siteHealthFindings' | 'siteHealthFilter' | 'siteHealthFinding' | 'siteHealthFixForMe' | 'siteHealthFixes'
  // Links.
  | 'siteLinksHeader' | 'siteLinksOptIn' | 'siteLinksStats' | 'siteLinksLog' | 'siteLinksListings'
  | 'siteLinksInternal' | 'siteLinksGsc' | 'siteLinksHow' | 'siteLinksPolicy'
  // Reports.
  | 'reportsHeader' | 'reportsMonthly' | 'reportsMonths' | 'reportsDownload' | 'reportsPerformance'
  | 'reportsOnDemand' | 'reportsType' | 'reportsExport' | 'reportsHistory'
  // The project's settings.
  | 'settingsHeader' | 'settingsIndex' | 'settingsScan' | 'settingsBusiness' | 'settingsAudience'
  | 'settingsCompetitors' | 'settingsArticleDesign' | 'settingsConnections' | 'settingsPlatform'
  | 'settingsGsc' | 'settingsEmails' | 'settingsSave' | 'settingsDanger'
  // Google Maps posts.
  | 'mapsPostsHeader' | 'mapsPostsConnect' | 'mapsPostsLocation' | 'mapsPostsComposer'
  | 'mapsPostsPreview' | 'mapsPostsList'
  // Payments.
  | 'billingHeader' | 'billingNotice' | 'billingMarket' | 'billingPlan' | 'billingManage'
  // The projects list, which had no tour either.
  | 'projectsHeader' | 'projectsNew' | 'projectsSearch' | 'projectsTable' | 'projectsRowMenu'

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
   * A control that REVEALS this step's target: a tab, or a view switch.
   *
   * A tab's panel is not in the document until its tab is open, so a step
   * pointing inside one was skipped and the tour went quiet about everything a
   * screen's tabs hold — which is what the owner meant by a tour that "only
   * talks about the title". The runner clicks this once and then waits for the
   * target, so the selector must name something the reader can see and could
   * have clicked themselves, and clicking it must not save or send anything.
   */
  activate?: string
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

/** The article editor's route, whose path carries the article's id. */
export const ARTICLE_EDITOR_PATH = '/content/articles'

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

export type ScreenKey = 'dashboard' | 'keywordResearch' | 'keywords' | 'content' | 'editor' | 'strategy'
  | 'aiVisibility' | 'siteHealth' | 'siteLinks' | 'mapsPosts' | 'settings' | 'reports' | 'billing' | 'projects'

/**
 * The per-screen tours: one for EVERY screen the sidebar leads to, and one for
 * the article editor and the projects list, which the sidebar reaches through
 * another screen and which had no tour at all.
 *
 * EACH TOUR WALKS THE SCREEN, not just its title. The first version stopped at
 * the header and the workspace switcher, and the owner said so plainly on
 * 5 October 2026. So a screen's tour now names its cards in the order they
 * appear, the controls a reader acts on, and what each TAB holds — the last of
 * which needs `activate`, because a tab's panel is not in the document until
 * the tab is open.
 *
 * Nearly every step is `lazy`: these screens show a card only once it has
 * something to say, so on a new project most of them are absent, and a step
 * whose target is not on the page is skipped rather than pointing at nothing.
 * That is what keeps one list honest for an empty project and a full one.
 */
export const SCREEN_TOURS: Readonly<Record<ScreenKey, { path: string; steps: readonly TourStep[] }>> = {
  dashboard: {
    path: '/dashboard',
    steps: [
      { key: 'dashboardHero', target: DASHBOARD_FIRST_CARD, lazy: true, needsProject: true, variants: FIRST_CARD_VARIANTS },
      { key: 'dashboardTiles', target: '[data-dashboard-tiles]', lazy: true, needsProject: true },
      { key: 'dashboardHoldingBack', target: '[data-dashboard-widget="holding-back"]', lazy: true, needsProject: true },
      { key: 'dashboardOpportunities', target: '[data-dashboard-widget="opportunities"]', lazy: true, needsProject: true },
      { key: 'dashboardBoard', target: '[data-dashboard-widget="board"]', lazy: true, needsProject: true },
      { key: 'dashboardSetup', target: '[data-dashboard-widget="setup"]', lazy: true },
      { key: 'dashboardAccount', target: '[data-dashboard-widget="account"]', lazy: true },
      { key: 'dashboardFold', target: '[data-dashboard-fold]', lazy: true },
      { key: 'dashboardShortcuts', target: '[data-tour="screen-actions"]' },
    ],
  },
  keywordResearch: {
    path: '/keyword-research',
    steps: [
      { key: 'researchHeader', target: SCREEN_HEADER_TARGET },
      { key: 'researchStart', target: '[data-research-start]', lazy: true },
      { key: 'researchForm', target: 'main form', lazy: true },
      { key: 'researchType', target: '[data-research-type]', lazy: true },
      { key: 'researchNav', target: '[data-research-nav]', lazy: true },
      { key: 'researchWins', target: '#research-wins', lazy: true },
      { key: 'researchAudiences', target: '#research-audiences', lazy: true },
      { key: 'researchCompetitive', target: '#research-competitive', lazy: true },
      { key: 'researchTable', target: '#research-table', lazy: true },
      { key: 'researchTrack', target: '[data-row-track]', lazy: true },
    ],
  },
  keywords: {
    path: '/keywords',
    steps: [
      { key: 'keywordsHeader', target: SCREEN_HEADER_TARGET },
      { key: 'keywordsHero', target: '[data-keywords-hero]', lazy: true, needsProject: true },
      { key: 'keywordsGsc', target: '[data-gsc-keyword]', lazy: true },
      { key: 'keywordsToolbar', target: '[data-keywords-toolbar]', lazy: true },
      { key: 'keywordsTable', target: '[data-keywords-table]', lazy: true, needsProject: true },
      { key: 'keywordsRowMenu', target: '[data-keyword-row-menu]', lazy: true, needsProject: true },
      { key: 'keywordsCompetitors', target: '[data-competitor-summary]', lazy: true },
      { key: 'keywordsHistory', target: '#scan-history', lazy: true },
      { key: 'projectScope', target: SWITCHER_TARGET, needsProject: true },
    ],
  },
  content: {
    path: CONTENT_ROOT_PATH,
    steps: [
      { key: 'contentHeader', target: SCREEN_HEADER_TARGET },
      { key: 'contentDestination', target: '[data-articles-destination]', lazy: true },
      { key: 'contentHero', target: '[data-articles-hero]', lazy: true },
      { key: 'contentNewTopic', target: '[data-new-topic]', lazy: true },
      { key: 'contentFilters', target: '[data-articles-filters]', lazy: true },
      { key: 'contentTable', target: '[data-articles-table]', lazy: true },
      { key: 'projectScope', target: SWITCHER_TARGET, needsProject: true },
    ],
  },
  // The article editor is its own page, not a child of the content shell, and
  // its path carries the article's id — so `screenForPath` matches it by prefix.
  editor: {
    path: ARTICLE_EDITOR_PATH,
    steps: [
      { key: 'editorTopBar', target: '[data-testid="article-top-bar"]' },
      { key: 'editorTabs', target: '#article-tab-article' },
      { key: 'editorRead', target: '[data-testid="article-edit"]', lazy: true },
      { key: 'editorAudit', target: '[data-audit-card]', lazy: true },
      { key: 'editorAutoLinks', target: '[data-auto-links]', lazy: true },
      // Everything below lives in the edit-mode column, which is in the document
      // but hidden until the reader opens the editor: each step opens it for them,
      // and the ones after it find it already open.
      { key: 'editorMetadata', target: '[data-editor-metadata]', activate: '[data-testid="article-edit"]' },
      { key: 'editorContent', target: '[data-editor-content]', lazy: true },
      { key: 'editorFaq', target: '[data-editor-faq]', lazy: true },
      { key: 'editorImage', target: '[data-editor-image]', lazy: true },
      { key: 'editorPublish', target: '#publish', activate: '[data-testid="article-edit"]' },
      { key: 'editorSave', target: '[data-article-save-bar]', lazy: true },
      { key: 'editorSchema', target: '[data-testid="schema-json"]', activate: '#article-tab-schema' },
    ],
  },
  strategy: {
    path: CONTENT_STRATEGY_PATH,
    steps: [
      { key: 'strategyHeader', target: SCREEN_HEADER_TARGET },
      { key: 'strategyNext', target: '[data-next-article]', lazy: true, needsProject: true },
      { key: 'strategyPlan', target: '#strategy-plan-heading', lazy: true },
      { key: 'strategyAddKeyword', target: '[data-add-keyword-toggle]', lazy: true },
      { key: 'strategyViews', target: '[data-strategy-views]', lazy: true },
      { key: 'strategyMonths', target: '[data-strategy-months]', lazy: true },
      { key: 'strategyIdeas', target: '[data-strategy-column="ideas"]', lazy: true },
      { key: 'strategyPublished', target: '[data-strategy-column="published"]', lazy: true },
      { key: 'strategyOverview', target: '[data-plan-overview]', lazy: true },
      { key: 'strategyClusters', target: '[data-topic-clusters]', lazy: true },
      { key: 'strategyNextSteps', target: '[data-what-next]', lazy: true },
      { key: 'strategyAdvanced', target: '[data-strategy-advanced]', lazy: true },
    ],
  },
  aiVisibility: {
    path: '/ai-visibility',
    steps: [
      { key: 'aiHeader', target: SCREEN_HEADER_TARGET },
      { key: 'aiStatus', target: '[data-ai-entrance="status"]', lazy: true },
      { key: 'aiOpening', target: '[data-ai-entrance="opening"]', lazy: true },
      { key: 'aiAuto', target: '[data-ai-auto-toggle]', lazy: true },
      { key: 'aiTabs', target: '[data-ai-tablist]', lazy: true },
      // One step per tab, each opening its own tab first.
      { key: 'aiResults', target: '[data-ai-engine-row]', activate: '[data-ai-tab="results"]' },
      { key: 'aiQueries', target: '[data-ai-new-query]', activate: '[data-ai-tab="queries"]' },
      { key: 'aiSuggested', target: '[data-ai-recommend]', activate: '[data-ai-tab="queries"]' },
      { key: 'aiInsights', target: '[data-ai-insights]', activate: '[data-ai-tab="insights"]' },
      { key: 'aiCompetitors', target: '[data-ai-competitors-panel]', activate: '[data-ai-tab="competitors"]' },
      { key: 'aiActivity', target: '[data-ai-entrance="activity"]', lazy: true },
      { key: 'projectScope', target: SWITCHER_TARGET, needsProject: true },
    ],
  },
  siteHealth: {
    path: '/site-health',
    steps: [
      { key: 'siteHealthHeader', target: SCREEN_HEADER_TARGET },
      // Before the first scan the screen is one card and a button, and nothing
      // else on this list exists yet: without these two the tour would name the
      // title and stop, which is the complaint this wave answers.
      { key: 'siteHealthEmpty', target: '[data-site-health="empty"]', lazy: true },
      { key: 'siteHealthScanFirst', target: '[data-scan-start]', lazy: true },
      { key: 'siteHealthScore', target: '[data-site-health="score"]', lazy: true },
      { key: 'siteHealthScanAgain', target: '[data-scan-again]', lazy: true },
      { key: 'siteHealthAutoFix', target: '[data-autofix-strip]', lazy: true, needsProject: true },
      { key: 'siteHealthFindings', target: '[data-site-health="findings"]', lazy: true },
      { key: 'siteHealthFilter', target: '[data-site-health-filter]', lazy: true },
      { key: 'siteHealthFinding', target: '[data-finding]', lazy: true },
      { key: 'siteHealthFixForMe', target: '[data-fix-for-me]', lazy: true },
      { key: 'siteHealthFixes', target: '#fixes', lazy: true, needsProject: true },
    ],
  },
  siteLinks: {
    path: '/site-links',
    steps: [
      { key: 'siteLinksHeader', target: SCREEN_HEADER_TARGET },
      { key: 'siteLinksOptIn', target: '[data-link-network="panel"]', lazy: true, needsProject: true },
      { key: 'siteLinksStats', target: '[data-link-network="stats"]', lazy: true },
      { key: 'siteLinksLog', target: '[data-link-network="log"]', lazy: true },
      { key: 'siteLinksListings', target: '[data-site-links="listings"]', lazy: true },
      { key: 'siteLinksInternal', target: '[data-site-links="internal"]', lazy: true },
      { key: 'siteLinksGsc', target: '[data-site-links="gsc-links"]', lazy: true },
      { key: 'siteLinksHow', target: '[data-link-network="how"]', lazy: true },
      { key: 'siteLinksPolicy', target: '[data-site-links="policy"]', lazy: true },
    ],
  },
  mapsPosts: {
    path: '/maps-posts',
    steps: [
      { key: 'mapsPostsHeader', target: SCREEN_HEADER_TARGET },
      { key: 'mapsPostsConnect', target: '[data-gbp-connect]', lazy: true },
      { key: 'mapsPostsLocation', target: '[data-gbp-location]', lazy: true },
      { key: 'mapsPostsComposer', target: '[data-gbp-composer]', lazy: true },
      { key: 'mapsPostsPreview', target: '[data-gbp-preview]', lazy: true },
      { key: 'mapsPostsList', target: '[data-gbp-list]', lazy: true },
    ],
  },
  settings: {
    path: '/settings',
    steps: [
      { key: 'settingsHeader', target: SCREEN_HEADER_TARGET },
      { key: 'settingsIndex', target: '[data-settings-index]', lazy: true },
      { key: 'settingsScan', target: '[data-scan-band]', lazy: true },
      { key: 'settingsBusiness', target: '#business', lazy: true },
      { key: 'settingsAudience', target: '#audiences', lazy: true },
      { key: 'settingsCompetitors', target: '#competitors', lazy: true },
      { key: 'settingsArticleDesign', target: '#article-design', lazy: true },
      { key: 'settingsConnections', target: '#connections', lazy: true, needsProject: true },
      { key: 'settingsPlatform', target: '#platform', lazy: true },
      { key: 'settingsGsc', target: '#search-console', lazy: true },
      { key: 'settingsEmails', target: '#weekly-email', lazy: true },
      { key: 'settingsSave', target: '[data-settings-save]', lazy: true },
      { key: 'settingsDanger', target: '#danger', lazy: true },
    ],
  },
  reports: {
    path: '/reports',
    steps: [
      { key: 'reportsHeader', target: SCREEN_HEADER_TARGET },
      { key: 'reportsMonthly', target: '#monthly-reports', lazy: true },
      { key: 'reportsMonths', target: '[data-month]', lazy: true },
      { key: 'reportsDownload', target: '[data-monthly-download]', lazy: true },
      { key: 'reportsPerformance', target: '[data-gsc-widget="performance"]', lazy: true },
      { key: 'reportsOnDemand', target: '[data-on-demand-report]', lazy: true },
      { key: 'reportsType', target: '[data-report-type]', lazy: true },
      { key: 'reportsExport', target: '[data-report-card]', lazy: true },
      { key: 'reportsHistory', target: '#scan-history', lazy: true },
    ],
  },
  // The account's own screen: no project step, because nothing on it is scoped
  // to a project.
  billing: {
    path: '/billing',
    steps: [
      { key: 'billingHeader', target: SCREEN_HEADER_TARGET },
      { key: 'billingNotice', target: '[data-billing-notice]', lazy: true },
      { key: 'billingMarket', target: '[data-billing-market]', lazy: true },
      { key: 'billingPlan', target: '[data-plan-card]', lazy: true },
      { key: 'billingManage', target: '[data-billing-manage]', lazy: true },
    ],
  },
  projects: {
    path: '/projects',
    steps: [
      { key: 'projectsHeader', target: SCREEN_HEADER_TARGET },
      { key: 'projectsNew', target: '[data-tour="screen-actions"]' },
      { key: 'projectsSearch', target: '[data-projects-search]', lazy: true },
      { key: 'projectsTable', target: '[data-projects-table]', lazy: true },
      { key: 'projectsRowMenu', target: '[data-project-row-menu]', lazy: true },
    ],
  },
}

/** The screen a pathname is, when it has a tour of its own; null otherwise. */
export function screenForPath(pathname: string | null | undefined): ScreenKey | null {
  if (!pathname) return null
  const clean = pathname.replace(/\/+$/, '') || '/'
  // The editor is one screen per article, so it is the one tour matched by
  // prefix: /content/articles/<id>, and by any path under it. /content/articles
  // itself is not a page (the list lives at /content), so matching it too
  // shadows nothing.
  if (clean.startsWith(`${ARTICLE_EDITOR_PATH}/`)) return 'editor'
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

/** Whether the address points at a section of the screen (a non-empty `#fragment`). */
export function arrivedAtSection(hash: string | null | undefined): boolean {
  return !!hash && hash.replace(/^#/, '').trim().length > 0
}

export type AutoTour = { kind: 'full' } | { kind: 'screen'; screen: ScreenKey } | null

/**
 * Which tour, if any, starts by itself on this screen:
 *   - never for an established account, and never while the project list is unknown;
 *   - the full tour once, on the dashboard, until it is finished or skipped;
 *   - after that, each screen's own tour the first time the screen is opened;
 *   - and never when the address names a SECTION of the screen (#platform,
 *     #search-console, #business…): the owner clicked "connect the site" or a
 *     notification to reach that section, and a tour that opened first scrolled
 *     the screen back to its title and talked about something else (owner's
 *     report of 10 October 2026). The screen's tour waits for a plain visit.
 */
export function autoTour(input: {
  pathname: string | null
  /** `location.hash`, with or without its `#`; empty when the address names no section. */
  hash?: string | null
  newAccount: boolean
  projectsResolved: boolean
  fullTour: FullTourState
  screenSeen: (screen: ScreenKey) => boolean
}): AutoTour {
  if (!input.newAccount || !input.projectsResolved) return null
  if (arrivedAtSection(input.hash)) return null
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
