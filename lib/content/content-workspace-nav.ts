/**
 * The content workspace's screens — one route per concern.
 *
 * The workspace used to be a single /content page with internal useState tabs, so
 * "articles", "pending topics", "automation", "Search Console" and the platform
 * connections all shared one URL and one component. Each concern now has its own
 * route, declared here once so the nav, the screens and the guards agree.
 *
 * Order is the order a merchant works in: what will be written and when (the content
 * strategy), then what was written (the articles).
 *
 * "Topics" and "automation" used to be two screens here. They are one now, the
 * content strategy tab: a month board of ideas, planned, written and published
 * articles, with the old two screens as its list view. Their old addresses answer
 * with a redirect to that list view (lib/content/strategy/view.ts), which is the only
 * reason their constants are still declared below.
 *
 * Search Console is not a screen any more. It is a data source that feeds the screens
 * that already exist (the dashboard, keywords, keyword research, "my progress" and
 * Topics), and its connection lives in the project's settings. Its old address,
 * /content/search-console, answers with a redirect: see
 * lib/active-project/project-page-redirect.ts.
 */

export const CONTENT_ROOT_PATH = '/content'
export const CONTENT_STRATEGY_PATH = '/content/strategy'
/** Retired screens: each is a redirect into the strategy tab's list view now. */
export const CONTENT_TOPICS_PATH = '/content/topics'
export const CONTENT_AUTOMATION_PATH = '/content/automation'

/** Label keys in the dashboard dictionary's `contentHub.screens` block. */
export type ContentScreenKey = 'strategy' | 'articles'

export type ContentScreen = {
  key: ContentScreenKey
  href: string
  /** When set, the screen is hidden unless this build-time flag is 'true'. */
  flag?: 'NEXT_PUBLIC_ENABLE_CONTENT_AUTOMATION'
}

export const CONTENT_SCREENS: readonly ContentScreen[] = [
  { key: 'strategy', href: CONTENT_STRATEGY_PATH },
  { key: 'articles', href: CONTENT_ROOT_PATH },
]

/**
 * Whether a screen is reachable in this build. The flags are the SAME ones that
 * used to hide the internal tabs, read here so a hidden screen is hidden in the
 * nav and on its own route from one decision.
 */
export function isContentScreenEnabled(screen: ContentScreen, env: Record<string, string | undefined>): boolean {
  if (!screen.flag) return true
  return env[screen.flag] === 'true'
}

/**
 * The screen that owns a pathname: the longest matching href wins, and anything the
 * workspace renders that no screen claims (the root itself) is the articles screen.
 */
export function activeContentScreen(pathname: string): ContentScreenKey {
  let best: ContentScreen | null = null
  for (const s of CONTENT_SCREENS) {
    if ((pathname === s.href || pathname.startsWith(`${s.href}/`)) && (!best || s.href.length > best.href.length)) best = s
  }
  return best?.key ?? 'articles'
}
