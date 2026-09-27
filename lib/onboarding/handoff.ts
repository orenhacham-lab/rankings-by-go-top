/**
 * A refusal to start, carried from the new-project screen to the project's own.
 *
 * Once /api/projects/create has answered, the project exists, so the merchant
 * is taken to its research screen whatever the start route said. When the
 * start was refused (a daily cap, a plan) or never reached the server, the
 * address says so with a notice key and, for a wait, its seconds; the screen
 * shows that notice with its one action and then removes both from the
 * address. Only a known key is read and only a positive whole wait, so the
 * address can select one of our own sentences and nothing else.
 *
 * A handed-over notice also tells the screen the project was created from its
 * address a moment ago, so its "Scan the site" asks the start route to mark
 * the create route's placeholders as the scan's to fill (see
 * lib/onboarding/scan-owned.ts); the route checks for itself that the project
 * has never been scanned and still holds exactly those placeholders.
 */
import { summaryHref } from './links'
import type { Notice, NoticeAction, NoticeKey } from './notices'

export const HANDOFF_NOTICE_PARAM = 'notice'
export const HANDOFF_WAIT_PARAM = 'wait'

/** The notices a start can end with, and the one action each carries (as startNotice gives them). */
export const START_NOTICE_ACTIONS: Partial<Record<NoticeKey, NoticeAction>> = {
  signedOut: 'signin',
  notAvailable: 'dashboard',
  planRequired: 'billing',
  planUnavailable: 'retry',
  busy: 'retry',
  runInProgress: 'refresh',
  rescanTooSoon: 'dashboard',
  userDailyCap: 'dashboard',
  globalDailyCap: 'dashboard',
  claimExpired: 'retry',
  failed: 'retry',
  offline: 'retry',
}

/** Longer than any Retry-After the seed route gives (a day), so a forged wait cannot say "in 900 years". */
const MAX_WAIT_SECONDS = 2 * 24 * 60 * 60

/** The project's research screen, carrying the start's refusal when there was one. */
export function summaryAfterStartHref(projectId: string, notice: Notice | null): string {
  const base = summaryHref(projectId)
  if (!notice || START_NOTICE_ACTIONS[notice.key] === undefined) return base
  const wait = notice.retryAfterSeconds ? `&${HANDOFF_WAIT_PARAM}=${Math.ceil(notice.retryAfterSeconds)}` : ''
  return `${base}&${HANDOFF_NOTICE_PARAM}=${encodeURIComponent(notice.key)}${wait}`
}

type Params = Record<string, string | string[] | undefined>

const first = (v: string | string[] | undefined): string | null => (typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? null) : null)

/** The handed-over notice in a request's query, or null. */
export function readHandedOffNotice(params: Params): Notice | null {
  const key = first(params[HANDOFF_NOTICE_PARAM])
  if (!key || !Object.prototype.hasOwnProperty.call(START_NOTICE_ACTIONS, key)) return null
  const action = START_NOTICE_ACTIONS[key as NoticeKey] ?? null
  const rawWait = first(params[HANDOFF_WAIT_PARAM])
  const wait = rawWait && /^[1-9][0-9]{0,6}$/.test(rawWait) ? Math.min(Number(rawWait), MAX_WAIT_SECONDS) : undefined
  const notice: Notice = { key: key as NoticeKey, action }
  return wait ? { ...notice, retryAfterSeconds: wait } : notice
}
