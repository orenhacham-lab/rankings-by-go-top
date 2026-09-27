/**
 * The content strategy tab's addresses: its two views, the sections of its list view,
 * and where the retired "topics" and "automation" screens send a link now.
 *
 * `/content/topics` and `/content/automation` were two screens of the content
 * workspace. They are one tab now, `/content/strategy`, whose list view holds both
 * (the automatic ideas and the publishing queue, then the topics and their link
 * plans). Their addresses still have to work: merchants bookmarked them, and the
 * workspace's own buttons pointed at them. Each answers with a redirect to the list
 * view, at the section that replaced it, with every query parameter carried over
 * (`projectId`, `lang`, and `section`, the ideas sub-tab of the old automation
 * screen). `view` is the one parameter the redirect decides itself.
 *
 * The destination is always the fixed path below and one of the fixed anchors;
 * nothing from the request becomes a path, an anchor or a host, so no link can be
 * turned into a way off the site.
 */
import { CONTENT_STRATEGY_PATH } from '@/lib/content/content-workspace-nav'

export type StrategyView = 'board' | 'list'
export const STRATEGY_VIEW_PARAM = 'view'

/** The board is the default; only the exact value 'list' opens the list. */
export function strategyViewFromParam(v: string | null | undefined): StrategyView {
  return v === 'list' ? 'list' : 'board'
}

/** The list view's sections, each an element id on the page and an anchor in a link. */
export const STRATEGY_ANCHORS = { ideas: 'ideas', queue: 'queue', topics: 'topics' } as const
export type StrategyAnchor = (typeof STRATEGY_ANCHORS)[keyof typeof STRATEGY_ANCHORS]
const ANCHOR_SET: ReadonlySet<string> = new Set(Object.values(STRATEGY_ANCHORS))

export function isStrategyAnchor(v: string): v is StrategyAnchor {
  return ANCHOR_SET.has(v)
}

/** A link inside the app to a view (and a section of the list view). */
export function strategyHref(view: StrategyView, anchor?: StrategyAnchor, extra?: Record<string, string>): string {
  const params = new URLSearchParams()
  if (view === 'list') params.set(STRATEGY_VIEW_PARAM, 'list')
  for (const [k, v] of Object.entries(extra ?? {})) params.set(k, v)
  const search = params.toString()
  return `${CONTENT_STRATEGY_PATH}${search ? `?${search}` : ''}${anchor ? `#${anchor}` : ''}`
}

type Query = Record<string, string | string[] | undefined>

function values(v: string | string[] | undefined): string[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v]
}

function legacyRedirect(query: Query, anchor: StrategyAnchor): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (key === STRATEGY_VIEW_PARAM) continue
    for (const one of values(value)) params.append(key, one)
  }
  params.set(STRATEGY_VIEW_PARAM, 'list')
  return `${CONTENT_STRATEGY_PATH}?${params.toString()}#${anchor}`
}

/** `/content/topics`: the topics and their link plans, in the list view. */
export function legacyTopicsRedirect(query: Query): string {
  return legacyRedirect(query, STRATEGY_ANCHORS.topics)
}

/** `/content/automation`: the automatic ideas (and, below them, the queue), in the list view. */
export function legacyAutomationRedirect(query: Query): string {
  return legacyRedirect(query, STRATEGY_ANCHORS.ideas)
}
