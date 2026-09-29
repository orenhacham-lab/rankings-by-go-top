/**
 * "Apply all safe fixes" (UX decision F): what may go into one batch. Pure; the screen uses it to
 * count and prepare, and the approve route (./api.ts) checks every item again on its own.
 *
 * A row is in the batch only when ALL hold:
 *   - its type is one of BULK_SAFE_TYPES (Google title, Google description, image alt text);
 *   - the plugin would write it now (channel `plugin`);
 *   - it is not the home page;
 *   - its page has no fix pending and none applied in the last 30 days (a fix of this same batch
 *     aside);
 *   - its suggestion passed: never the current value (trimmed, case folded), a title of 30–60
 *     characters, a description of 120–155 (the generator aims at 120–140);
 *   - at most 25 pages per batch.
 * A batch can be undone as a whole for 14 days (each fix keeps its own undo as well).
 */
import { sameText } from '@/lib/site-health/rules'
import { urlKey } from './job-match'
import { BULK_SAFE_TYPES, type FixJobView, type FixPayload, type FixType } from './types'

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

/** A page is busy when a fix is waiting on it, or one was applied (or sent) in the last 30 days. */
export function pageBusy(jobs: readonly Pick<FixJobView, 'pageUrl' | 'status' | 'appliedAt' | 'approvedAt' | 'batchId'>[], pageUrl: string, now: number, batch?: string | null): boolean {
  const key = urlKey(pageUrl)
  const since = now - BULK_RECENT_DAYS * 86_400_000
  return jobs.some((j) => {
    if (urlKey(j.pageUrl) !== key || (batch && j.batchId === batch)) return false
    if (j.status === 'pending' || j.status === 'manual') return true
    if (j.status === 'applied' || j.status === 'sent') return Date.parse(j.appliedAt ?? j.approvedAt) >= since
    return false
  })
}

export interface BulkRow { type: FixType; kind: string; url: string }

/**
 * The rows a batch would try, in the findings' order, at most BULK_MAX_PAGES pages. `fixable` says
 * whether the plugin would fix this row now and no job holds it (the screen's own answer).
 */
export function bulkCandidates(
  findings: readonly { id: string; fixType?: FixType | null; pages: readonly { url: string; kind: string }[] }[],
  opts: { fixable: (findingId: string, pageUrl: string) => boolean; jobs: Parameters<typeof pageBusy>[0]; now: number },
): BulkRow[] {
  const out: BulkRow[] = []
  const pages = new Set<string>()
  for (const f of findings) {
    const type = f.fixType
    if (!type || !BULK_SAFE_TYPES.includes(type)) continue
    for (const p of f.pages) {
      if (p.kind === 'home' || isHomeUrl(p.url)) continue
      if (!opts.fixable(f.id, p.url) || pageBusy(opts.jobs, p.url, opts.now)) continue
      const key = urlKey(p.url)
      if (!pages.has(key) && pages.size >= BULK_MAX_PAGES) continue
      if (out.some((r) => r.type === type && urlKey(r.url) === key)) continue
      pages.add(key)
      out.push({ type, kind: f.id, url: p.url })
    }
  }
  return out
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
