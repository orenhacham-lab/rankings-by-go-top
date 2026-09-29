/**
 * Turns measured signals into the findings and the GEO tiles the results
 * screen shows. Pure and synchronous: given the same signals it always yields
 * the same list, which is what makes the results cacheable per domain and
 * testable without a network.
 *
 * Severity discipline: `blocker` is reserved for something that keeps the page
 * out of Google or out of AI answers entirely. Everything a merchant would fix
 * "this week" is a warning, and hygiene is info. The email/signup gate hides
 * only warnings and info — a blocker is always shown, because hiding a reason
 * the site is invisible in order to win a signup would be a bad trade.
 */
import { freeCheckCopy } from './copy'
import { readRobots, type SiteSignals } from './html-signals'
import type { FreeCheckFinding, GeoSignal } from './types'
import type { Locale } from '@/lib/i18n/locales'

const TITLE_MIN = 30
const TITLE_MAX = 65
const DESCRIPTION_MIN = 70
const DESCRIPTION_MAX = 165
const THIN_CONTENT_WORDS = 250
/** Below this share of images carrying alt text, it is worth reporting. */
const ALT_TOLERANCE = 0.2

export function buildFindings(signals: SiteSignals, locale: Locale): FreeCheckFinding[] {
  const copy = freeCheckCopy(locale)
  const out: FreeCheckFinding[] = []
  const add = (id: string, severity: FreeCheckFinding['severity'], evidence?: string) => {
    const text = copy.findings[id]
    if (!text) return
    out.push({ id, severity, title: text.title, detail: text.detail, evidence })
  }

  const robots = readRobots(signals.robotsTxt)
  if (robots.blocksEveryone) add('robots_blocks_all', 'blocker')
  else if (robots.blocksAiBots) add('robots_blocks_ai', 'blocker', robots.blockedBots.slice(0, 4).join(', ') || undefined)

  if (!signals.title) add('title_missing', 'blocker')
  else if (signals.title.length < TITLE_MIN) add('title_short', 'warning', `${signals.title.length}`)
  else if (signals.title.length > TITLE_MAX) add('title_long', 'warning', `${signals.title.length}`)

  if (!signals.metaDescription) add('description_missing', 'warning')
  else if (signals.metaDescription.length < DESCRIPTION_MIN || signals.metaDescription.length > DESCRIPTION_MAX) {
    add('description_length', 'info', `${signals.metaDescription.length}`)
  }

  if (signals.h1.length === 0) add('h1_missing', 'warning')
  else if (signals.h1.length > 1) add('h1_multiple', 'info', copy.evidence.h1(signals.h1.length))

  if (signals.images.total > 0 && signals.images.missingAlt / signals.images.total > ALT_TOLERANCE) {
    add('images_alt', 'warning', copy.evidence.images(signals.images.missingAlt, signals.images.total))
  }

  if (signals.wordCount < THIN_CONTENT_WORDS) add('thin_content', 'warning', copy.evidence.words(signals.wordCount))
  if (!signals.hasOrganizationSchema) add('no_schema', 'warning')
  if (!signals.hasFaqSection) add('no_faq', 'warning')
  if (!signals.canonical) add('no_canonical', 'info')
  if (!signals.viewportMeta) add('no_viewport', 'warning')
  if (!signals.openGraph) add('no_open_graph', 'info')

  const order = { blocker: 0, warning: 1, info: 2 } as const
  return out.sort((a, b) => order[a.severity] - order[b.severity])
}

/** The four AI-readiness signals, in the order the results screen shows them. */
export function buildGeoSignals(signals: SiteSignals, locale: Locale): GeoSignal[] {
  const copy = freeCheckCopy(locale)
  const robots = readRobots(signals.robotsTxt)
  const states: { id: keyof typeof copy.geo | string; ok: boolean }[] = [
    { id: 'schema', ok: signals.hasOrganizationSchema },
    { id: 'faq', ok: signals.hasFaqSection },
    { id: 'robots', ok: !robots.blocksAiBots },
    { id: 'llms', ok: signals.llmsTxt },
  ]
  return states.map(({ id, ok }) => {
    const text = copy.geo[id as string][ok ? 'pass' : 'fail']
    return { id: id as string, ok, title: text.title, detail: text.detail }
  })
}

/**
 * Split findings into what the public teaser shows and what the account opens.
 * Every blocker is public; beyond that a short, honest taste.
 */
export const PUBLIC_FINDINGS_BEYOND_BLOCKERS = 2

export function splitFindings(all: FreeCheckFinding[]): { shown: FreeCheckFinding[]; locked: number } {
  const blockers = all.filter((f) => f.severity === 'blocker')
  const rest = all.filter((f) => f.severity !== 'blocker')
  const shown = [...blockers, ...rest.slice(0, PUBLIC_FINDINGS_BEYOND_BLOCKERS)]
  return { shown, locked: Math.max(0, rest.length - PUBLIC_FINDINGS_BEYOND_BLOCKERS) }
}
