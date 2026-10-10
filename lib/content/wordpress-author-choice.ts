/**
 * The article editor's optional WordPress author choice (plugin 3.1.0, PR #164's author_id).
 *
 * - The list comes from GET /api/wordpress/authors?projectId= and is shown only when that answer
 *   is ok, says `selectable` (the plugin 3.1.0 can publish as the chosen author) and names at least
 *   one author. Anything else (an older plugin, the application password only, an error, a broken
 *   answer) hides the picker and publishing goes on exactly as before.
 * - Display names only: an entry keeps its id and name; nothing else from the site is kept.
 * - The publish body carries `author_id` only when the merchant chose someone. No choice = the
 *   site's default author, the behaviour before the picker existed.
 */

export interface WordPressAuthorOption { id: number; name: string }

const MAX_ID = 2_147_483_647

function validId(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= MAX_ID
}

/** The authors the picker offers, or null when the picker stays hidden. */
export function authorOptionsFrom(ok: boolean, body: unknown): WordPressAuthorOption[] | null {
  if (!ok || !body || typeof body !== 'object') return null
  const b = body as { authors?: unknown; selectable?: unknown }
  if (b.selectable !== true || !Array.isArray(b.authors)) return null
  const out: WordPressAuthorOption[] = []
  const seen = new Set<number>()
  for (const row of b.authors) {
    if (!row || typeof row !== 'object') continue
    const { id, name } = row as { id?: unknown; name?: unknown }
    const label = typeof name === 'string' ? name.trim() : ''
    if (!validId(id) || !label || seen.has(id)) continue
    seen.add(id)
    out.push({ id, name: label.slice(0, 120) })
  }
  return out.length > 0 ? out : null
}

/** Load the picker's list; never throws (a failure hides the picker). */
export async function loadAuthorOptions(
  projectId: string,
  fetcher: (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }> = (url) => fetch(url, { cache: 'no-store' }),
): Promise<WordPressAuthorOption[] | null> {
  try {
    const res = await fetcher(`/api/wordpress/authors?projectId=${encodeURIComponent(projectId)}`)
    const body = await res.json().catch(() => null)
    return authorOptionsFrom(res.ok, body)
  } catch {
    return null
  }
}

/** The publish request body: `author_id` only when an author from the offered list was chosen. */
export function withAuthorChoice<T extends Record<string, unknown>>(
  body: T,
  chosen: number | null,
  options: readonly WordPressAuthorOption[] | null,
): T & { author_id?: number } {
  if (!validId(chosen) || !options || !options.some((o) => o.id === chosen)) return body
  return { ...body, author_id: chosen }
}
