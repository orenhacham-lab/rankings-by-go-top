/**
 * The browser's side of the cannibalization check (lib/content/cannibalization):
 * the shape the routes return for a match, reading it defensively, asking the
 * pre-flight route, and the sentence the merchant sees. Nothing here blocks: a
 * failed check is "no match", and the merchant may always create the topic anyway.
 */
import type { OverlapKind } from './check'

export interface OverlapPayload {
  kind: OverlapKind
  label: string
  url: string | null
  improveHref: string
  score: number
  onSite: boolean
}

const KINDS: readonly string[] = ['article', 'page', 'search', 'topic', 'idea']

/** A route's `overlap` field, or null when it is absent or not the expected shape. */
export function readOverlap(v: unknown): OverlapPayload | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.kind !== 'string' || !KINDS.includes(o.kind)) return null
  if (typeof o.label !== 'string' || !o.label.trim()) return null
  // Only our own screens: a path on this app, never another origin.
  if (typeof o.improveHref !== 'string' || !o.improveHref.startsWith('/') || o.improveHref.startsWith('//')) return null
  return {
    kind: o.kind as OverlapKind,
    label: o.label.slice(0, 200),
    url: typeof o.url === 'string' ? o.url : null,
    improveHref: o.improveHref,
    score: typeof o.score === 'number' ? o.score : 0,
    onSite: o.onSite === true,
  }
}

/** Ask the pre-flight route. Any failure is "no match": a check never stops a creation. */
export async function fetchOverlap(projectId: string, title: string, keyword?: string | null): Promise<OverlapPayload | null> {
  if (!projectId || !(title.trim() || (keyword ?? '').trim())) return null
  try {
    const res = await fetch('/api/content/topics/overlap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, title, keyword: keyword ?? null }),
    })
    if (!res.ok) return null
    const body = await res.json().catch(() => null)
    return readOverlap((body as { overlap?: unknown } | null)?.overlap)
  } catch {
    return null
  }
}

export interface OverlapCopy { page: string; article: string; search: string; planned: string }

/** The sentence for a match: "You already have a page on this: …, improve it". */
export function overlapMessage(copy: OverlapCopy, o: OverlapPayload): string {
  const template = o.kind === 'article' ? copy.article : o.kind === 'page' ? copy.page : o.kind === 'search' ? copy.search : copy.planned
  return template.replace('{label}', o.label)
}
