/**
 * The content workspace's screens — one route per concern.
 *
 * The workspace used to be a single /content page with internal useState tabs, so
 * "articles", "pending topics", "automation", "Search Console" and the platform
 * connections all shared one URL and one component. Each concern now has its own
 * route, declared here once so the nav, the screens and the guards agree.
 *
 * Order is the order a merchant works in: what was written, what is planned, what
 * runs automatically, and what the evidence says.
 */

export const CONTENT_ROOT_PATH = '/content'
export const CONTENT_TOPICS_PATH = '/content/topics'
export const CONTENT_AUTOMATION_PATH = '/content/automation'
export const CONTENT_SEARCH_CONSOLE_PATH = '/content/search-console'

/** Label keys in the dashboard dictionary's `contentHub.screens` block. */
export type ContentScreenKey = 'articles' | 'topics' | 'automation' | 'searchConsole'

export type ContentScreen = {
  key: ContentScreenKey
  href: string
  /** When set, the screen is hidden unless this build-time flag is 'true'. */
  flag?: 'NEXT_PUBLIC_ENABLE_CONTENT_AUTOMATION' | 'NEXT_PUBLIC_GSC_READ_ONLY_ENABLED'
}

export const CONTENT_SCREENS: readonly ContentScreen[] = [
  { key: 'articles', href: CONTENT_ROOT_PATH },
  { key: 'topics', href: CONTENT_TOPICS_PATH },
  { key: 'automation', href: CONTENT_AUTOMATION_PATH, flag: 'NEXT_PUBLIC_ENABLE_CONTENT_AUTOMATION' },
  { key: 'searchConsole', href: CONTENT_SEARCH_CONSOLE_PATH, flag: 'NEXT_PUBLIC_GSC_READ_ONLY_ENABLED' },
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

/** The nav entry that owns a pathname (longest matching href wins). */
export function activeContentScreen(pathname: string): ContentScreenKey {
  let best: ContentScreen = CONTENT_SCREENS[0]
  for (const s of CONTENT_SCREENS) {
    if ((pathname === s.href || pathname.startsWith(`${s.href}/`)) && s.href.length > best.href.length) best = s
  }
  return best.key
}
