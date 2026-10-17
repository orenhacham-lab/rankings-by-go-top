/**
 * Automatic fixes, the pure part: which findings of a scan may be fixed with nobody looking, and
 * with which value. Framework-free; the runner (./auto-run.ts) and lib/site-fix/api.ts
 * `autoFixProject` decide when and write, every rule they lean on is here.
 *
 * What may be fixed (AUTO_SAFE_TYPES, ./types.ts), and how narrowly:
 *   images_alt           → image_alt          only images whose every <img> has NO alt attribute at
 *                                             all (alt="" is a choice: a decorative image stays as
 *                                             it is); the file name's words, else the page title for
 *                                             ONE image per page; at most 20 images
 *   description_missing  → meta_description   only that finding (never too long, too short or a
 *                                             duplicate: those replace words someone wrote)
 *   broken_links         → broken_link        the page the dead link is on (`from`), the link removed
 *                                             and its words kept
 * Never the home page. The caps of one project's run: AUTO_CAPS.
 */
import { cleanAlt, altFromFileName } from '@/lib/site-health/rules'
import type { FindingKind, SiteHealthReport } from '@/lib/site-health/types'
import { bulkValueProblem, isHomeUrl } from './bulk'
import { urlKey } from './job-match'
import { AUTO_SAFE_TYPES, type AltItem, type FixType } from './types'
export { AUTO_SUMMARY_DAYS } from './types'
import { LIMITS } from './whitelist'

/** A project runs at most once in this many days. */
export const AUTO_RUN_EVERY_DAYS = 7
/** Projects per cron run, one after another. */
export const MAX_PROJECTS_PER_RUN = 3
/** A project starts only with at least this much of the run left. */
export const PROJECT_MIN_MS = 120_000
/** One fix starts only with at least this much left (an inspect, maybe a model call, the write). */
export const FIX_MIN_MS = 20_000
/** How long a claimed project is held by one run. */
export const CLAIM_MS = 10 * 60_000
/** An owner who has not signed in for this long is not fixed for. */
export const AUTO_INACTIVE_DAYS = 30
/** An automatic fix of a place that failed is not tried again for this long. */
export const AUTO_FAILED_DAYS = 30
/** At most this many fixes per project and run, and per type within them (alt text takes the rest). */
export const AUTO_CAPS = { total: 10, meta_description: 3, broken_link: 5 } as const
/** Only these answers make a link dead enough to remove on its own. */
export const DEAD_LINK_STATUSES: readonly number[] = [404, 410]

/** The finding a fix type answers, automatically. Nothing else maps. */
const KIND_OF: Partial<Record<FixType, FindingKind>> = {
  image_alt: 'images_alt', meta_description: 'description_missing', broken_link: 'broken_links',
}

export interface AutoCandidate {
  type: FixType
  kind: FindingKind
  /** The page that is written to. */
  pageUrl: string
  /** broken_link: the dead address. */
  href?: string
}

/** The order a run works in: descriptions, then dead links, then alt text (which takes the rest). */
const ORDER: FixType[] = ['meta_description', 'broken_link', 'image_alt']

/**
 * The candidates of one scan for the grant's types, in the run's order, each place once. The home
 * page never; a dead link without the page it was found on never; a page the scan placed outside
 * the editable content never.
 */
export function autoCandidates(report: Pick<SiteHealthReport, 'findings'>, types: readonly FixType[]): AutoCandidate[] {
  const out: AutoCandidate[] = []
  const seen = new Set<string>()
  for (const type of ORDER) {
    if (!types.includes(type) || !AUTO_SAFE_TYPES.includes(type)) continue
    const kind = KIND_OF[type]
    for (const f of report.findings) {
      if (f.id !== kind) continue
      for (const p of f.pages) {
        if (p.outside) continue
        const pageUrl = type === 'broken_link' ? p.from ?? '' : p.url
        if (!pageUrl || isHomeUrl(pageUrl) || (type !== 'broken_link' && p.kind === 'home')) continue
        const key = `${type}|${urlKey(pageUrl)}|${type === 'broken_link' ? urlKey(p.url) : ''}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push(type === 'broken_link' ? { type, kind, pageUrl, href: p.url } : { type, kind, pageUrl })
      }
    }
  }
  return out
}

/** Whether one more fix of `type` fits the run, given what it already did. */
export function autoQuotaLeft(done: Partial<Record<FixType, number>>, type: FixType): boolean {
  const total = Object.values(done).reduce((a, b) => a + (b ?? 0), 0)
  if (total >= AUTO_CAPS.total) return false
  const cap = type === 'meta_description' ? AUTO_CAPS.meta_description : type === 'broken_link' ? AUTO_CAPS.broken_link : AUTO_CAPS.total
  return (done[type] ?? 0) < cap
}

const IMG = /<img\b[^>]*>/gi
const srcOf = (tag: string) => {
  const m = tag.match(/\ssrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i)
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null
}
/** The tag carries an alt attribute at all, with or without a value (`alt`, `alt=""`, `alt=" "`). */
const hasAltAttribute = (tag: string) => /\salt(?=\s*=|[\s/>])/i.test(tag)

/**
 * The images automatic mode may describe: a src qualifies only when EVERY <img> with that src has
 * no alt attribute at all. Stricter than imagesMissingAlt (lib/site-health/wordpress-fix.ts), which
 * counts alt="" as missing: an empty alt is how a site says "decorative", so it stays as it is.
 */
export function strictMissingAlt(content: string): string[] {
  const bySrc = new Map<string, boolean>()
  for (const tag of String(content ?? '').match(IMG) ?? []) {
    const src = srcOf(tag)
    if (!src) continue
    bySrc.set(src, (bySrc.get(src) ?? true) && !hasAltAttribute(tag))
  }
  return [...bySrc.entries()].filter(([, none]) => none).map(([src]) => src)
}

/**
 * The alt text of one page's images, automatically: the file name's words, or the page title for
 * ONE image at most (several images all called by the page's title would say nothing). Each value
 * passes the safe-value check and the whitelist's bounds; at most LIMITS.altImages images.
 */
export function autoAltImages(content: string, pageTitle: string): AltItem[] {
  const out: AltItem[] = []
  let titleUsed = 0
  for (const src of strictMissingAlt(content)) {
    if (out.length >= LIMITS.altImages) break
    const own = altFromFileName(src, pageTitle)
    let alt = cleanAlt(own ?? '')
    if (!own) {
      if (titleUsed >= 1) continue
      alt = cleanAlt(pageTitle)
      titleUsed++
    }
    if (alt.length < LIMITS.alt.min || alt.length > LIMITS.alt.max) continue
    out.push({ src, alt })
  }
  return out.length > 0 && !bulkValueProblem({ type: 'image_alt', images: out }, null) ? out : []
}

/** A description is written automatically only where there is none at all, stored or live. */
export function descriptionIsEmpty(stored: string | null | undefined, live: string | null | undefined): boolean {
  return String(stored ?? '').trim() === '' && String(live ?? '').trim() === ''
}

/** A suggested description may be written automatically: 120–155 characters, plain (bulk.ts BULK_DESCRIPTION). */
export const autoDescriptionOk = (value: string | null | undefined): value is string =>
  !!value && !bulkValueProblem({ type: 'meta_description', value }, '')

/** The dead link still answers 404 or 410 right now. */
export const stillDead = (status: number | null | undefined) => typeof status === 'number' && DEAD_LINK_STATUSES.includes(status)

/** The owner signed in within `days` (an unknown sign-in is not recent). */
export function activeWithin(lastSignInAt: string | null | undefined, now: number, days = AUTO_INACTIVE_DAYS): boolean {
  const at = lastSignInAt ? Date.parse(lastSignInAt) : NaN
  return Number.isFinite(at) && now - at < days * 86_400_000
}

/** The fix types an owner may turn on: exactly the covered list, nothing more or less. */
export function sameAutoTypes(types: unknown): boolean {
  if (!Array.isArray(types) || types.length !== AUTO_SAFE_TYPES.length) return false
  const set = new Set(types.map(String))
  return set.size === AUTO_SAFE_TYPES.length && AUTO_SAFE_TYPES.every((t) => set.has(t))
}
