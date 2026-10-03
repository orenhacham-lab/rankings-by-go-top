/**
 * "Apply all safe fixes" (UX decision F): what may go into one batch. Pure; the screen uses it to
 * count and prepare, and the approve route (./api.ts) checks every item again on its own.
 *
 * A row is in the batch only when ALL hold:
 *   - its type is one of BULK_SAFE_TYPES (Google title, Google description, image alt text);
 *   - the plugin would write it now (channel `plugin`);
 *   - it is not the home page;
 *   - its page has no fix OF THE SAME TYPE pending and none applied in the last 30 days (a fix of
 *     this same batch aside). Wave 10: any fix on the page used to keep all its other rows out, so a
 *     page whose title was fixed yesterday never got its description or image alt text in one
 *     click; the fields are independent and each keeps its own undo;
 *   - its suggestion passed: never the current value (trimmed, case folded), a title of 30–60
 *     characters, a description of 120–155 (the generator aims at 120–140);
 *   - at most 25 pages per batch.
 * A batch can be undone as a whole for 14 days (each fix keeps its own undo as well).
 */
import { sameText } from '@/lib/site-health/rules'
import { rowStateFrom, rowTarget, urlKey } from './job-match'
import { BULK_SAFE_TYPES, type FixCapabilities, type FixJobView, type FixPayload, type FixType } from './types'

export const BULK_TITLE = { min: 30, max: 60 } as const
export const BULK_DESCRIPTION = { min: 120, max: 155 } as const
export const BULK_MAX_PAGES = 25
export const BULK_RECENT_DAYS = 30
export const BATCH_UNDO_DAYS = 14

export function isHomeUrl(url: string): boolean {
  try { return new URL(url).pathname.replace(/\/+$/, '') === '' } catch { return false }
}

const len = (s: string) => s.replace(/\s+/g, ' ').trim().length

/** Why a value may not go into a batch, or null. `before` is what the page holds now. */
export function bulkValueProblem(p: FixPayload, before: string | null): string | null {
  switch (p.type) {
    case 'seo_title':
      if (sameText(p.value, before)) return 'same_as_current'
      return len(p.value) < BULK_TITLE.min || len(p.value) > BULK_TITLE.max ? 'length' : null
    case 'meta_description':
      if (sameText(p.value, before)) return 'same_as_current'
      return len(p.value) < BULK_DESCRIPTION.min || len(p.value) > BULK_DESCRIPTION.max ? 'length' : null
    case 'image_alt':
      return p.images.length > 0 && p.images.every((i) => len(i.alt) > 0) ? null : 'empty'
    default:
      return 'type'
  }
}

/**
 * A page is busy for one type of fix when a fix of that type is waiting on it, or one was applied
 * (or sent) in the last 30 days. Without `type`, any fix counts.
 */
export function pageBusy(
  jobs: readonly (Pick<FixJobView, 'pageUrl' | 'status' | 'appliedAt' | 'approvedAt' | 'batchId'> & { type?: FixType })[],
  pageUrl: string, now: number, batch?: string | null, type?: FixType | null,
): boolean {
  const key = urlKey(pageUrl)
  const since = now - BULK_RECENT_DAYS * 86_400_000
  return jobs.some((j) => {
    if (urlKey(j.pageUrl) !== key || (batch && j.batchId === batch)) return false
    if (type && j.type && j.type !== type) return false
    if (j.status === 'pending' || j.status === 'manual') return true
    if (j.status === 'applied' || j.status === 'sent') return Date.parse(j.appliedAt ?? j.approvedAt) >= since
    return false
  })
}

/**
 * "Fix {n} safe items for me" exists only when the queue is live for the project and the plugin is
 * connected and writes all three safe types now. The health screen and the dashboard nudge / sidebar
 * badge ask this ONE question, so they can never disagree about whether the count applies.
 */
export function safeFixesEnabled(caps: Pick<FixCapabilities, 'available' | 'readOnly' | 'plugin' | 'channelFor'> | null | undefined): boolean {
  return !!caps && caps.available && !caps.readOnly && caps.plugin.state === 'connected'
    && BULK_SAFE_TYPES.every((t) => caps.channelFor[t] === 'plugin')
}

/**
 * Whether one finding row can go into a batch as far as the fix queue is concerned: the newest job for
 * that place is not applied, sent, pending or waiting for a manual update. Also ONE rule for the health
 * screen (its `jobStateFor`) and the nudge.
 */
export function rowOpenForBulk(jobs: Parameters<typeof rowStateFrom>[0], type: FixType, url: string): boolean {
  return rowStateFrom(jobs, rowTarget(type, { url })) === null
}

export interface BulkRow { type: FixType; kind: string; url: string }

/**
 * Why a row the merchant could fix is not in the one-click batch (shown, row by row, after it):
 *   review      its type changes what visitors see or is a choice (BULK_SAFE_TYPES): approved one by one
 *   home        the home page: approved one by one
 *   recent      a fix of this same type was applied on this page in the last 30 days, or is waiting
 *   batch_full  over BULK_MAX_PAGES pages: the next click takes it
 */
export type BulkSkipReason = 'review' | 'home' | 'recent' | 'batch_full'
export interface BulkSkip extends BulkRow { reason: BulkSkipReason }

/**
 * The rows a batch would try, in the findings' order, at most BULK_MAX_PAGES pages, and every other
 * row that could be fixed with the reason it is not in the batch. `fixable` says whether this row
 * can be fixed now and no job holds it (the screen's own answer); a row that cannot is not listed.
 */
export function bulkPlan(
  findings: readonly { id: string; fixType?: FixType | null; pages: readonly { url: string; kind: string }[] }[],
  opts: { fixable: (findingId: string, pageUrl: string) => boolean; jobs: Parameters<typeof pageBusy>[0]; now: number },
): { rows: BulkRow[]; skipped: BulkSkip[] } {
  const out: BulkRow[] = []
  const skipped: BulkSkip[] = []
  const pages = new Set<string>()
  for (const f of findings) {
    const type = f.fixType
    if (!type) continue
    for (const p of f.pages) {
      if (!opts.fixable(f.id, p.url)) continue
      const row = { type, kind: f.id, url: p.url }
      if (!BULK_SAFE_TYPES.includes(type)) { skipped.push({ ...row, reason: 'review' }); continue }
      if (p.kind === 'home' || isHomeUrl(p.url)) { skipped.push({ ...row, reason: 'home' }); continue }
      if (pageBusy(opts.jobs, p.url, opts.now, null, type)) { skipped.push({ ...row, reason: 'recent' }); continue }
      const key = urlKey(p.url)
      if (out.some((r) => r.type === type && urlKey(r.url) === key)) continue
      if (!pages.has(key) && pages.size >= BULK_MAX_PAGES) { skipped.push({ ...row, reason: 'batch_full' }); continue }
      pages.add(key)
      out.push(row)
    }
  }
  return { rows: out, skipped }
}

/** The rows a batch would try (bulkPlan's rows): the screen's button and the dashboard nudge count these. */
export function bulkCandidates(
  findings: Parameters<typeof bulkPlan>[0],
  opts: Parameters<typeof bulkPlan>[1],
): BulkRow[] {
  return bulkPlan(findings, opts).rows
}

/** A batch in the queue: its jobs, when it was approved, and whether it can still be undone as a whole. */
export function batchesOf(jobs: readonly FixJobView[], now: number): { id: string; approvedAt: string; jobs: FixJobView[]; canUndo: boolean }[] {
  const by = new Map<string, FixJobView[]>()
  for (const j of jobs) if (j.batchId) by.set(j.batchId, [...(by.get(j.batchId) ?? []), j])
  return [...by.entries()].map(([id, list]) => {
    const approvedAt = list.map((j) => j.approvedAt).sort()[0]
    const fresh = Date.parse(approvedAt) >= now - BATCH_UNDO_DAYS * 86_400_000
    return { id, approvedAt, jobs: list, canUndo: fresh && list.some((j) => j.status === 'applied' && j.canUndo) }
  })
}
