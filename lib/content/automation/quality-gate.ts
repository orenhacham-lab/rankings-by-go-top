/**
 * Content-automation quality gate (Phase 5) — a deterministic structural check
 * run BEFORE marking a queued item as generated. It is a backstop on top of the
 * generator's own audit (generateValidatedArticle only returns success when its
 * SEO/GEO audit has zero blockers); this layer catches the things that make an
 * article unsafe to auto-publish regardless of SEO score.
 *
 * Returns blocking failures only. Featured-image + planned-anchor presence are
 * NOT blockers here (draft behavior never required an image; publish-time in
 * Phase 6 enforces the image) — the caller may treat them as advisory.
 */

export interface QualityGateArticle {
  title: string | null
  content_html: string | null
  slug: string | null
}

export interface QualityGateResult {
  ok: boolean
  failures: string[]
}

/*
 * THE MARKERS A HALF-FINISHED DRAFT LEAVES BEHIND, in two patterns, because
 * they need different flags.
 *
 * The first draft was one case-INSENSITIVE pattern using `\bTODO\b`, and it
 * refused ordinary Spanish for eleven days. Two things went wrong at once, and
 * both are in the regex, not in the article:
 *
 *   - `todo` is an everyday Spanish and Portuguese word. "sobre todo" ("above
 *     all") was read as a TODO marker. 23 Oct 2026, 07:42 UTC, the article
 *     "how-to-choose-a-link-building-agency": "...y, sobre todo, te ahorra una
 *     enorme cantidad de tiempo."
 *   - JavaScript's `\b` counts only [A-Za-z0-9_] as word characters, so an
 *     accented letter IS a word boundary: `\bTODO\b` matches inside
 *     "Método". Same morning, 07:46 UTC, in a table heading.
 *
 * So Spanish spent every slot of the publishing window failing this gate and
 * never published, and because lib/blog/auto/daily-window.ts writes the first
 * language that has not published today, Portuguese and French never got a
 * turn at all. The same gate stands in front of customers' articles
 * (lib/content/automation/generate-item.ts), so it was refusing theirs too.
 *
 * TODO, TBD and FIXME are therefore matched in UPPER CASE ONLY — that is how a
 * developer leaves one, and it is the only way to tell the marker from the
 * Spanish word — with Unicode letter lookarounds instead of `\b`, so an accent
 * beside them is a letter and not a boundary. The phrases below cannot collide
 * with a real word in any language we publish, so they stay case-insensitive.
 */
const PLACEHOLDER_MARKERS = /(?<!\p{L})(?:TODO|TBD|FIXME)(?!\p{L})/u
const PLACEHOLDER_PHRASES = /(?<!\p{L})(?:lorem ipsum|insert[ _]?here|xxxxx|placeholder)(?!\p{L})|\[\s*insert|\{\{|\}\}/iu

/** The earliest placeholder match in `text`, or null. */
function firstPlaceholder(text: string): RegExpExecArray | null {
  const hits = [PLACEHOLDER_MARKERS.exec(text), PLACEHOLDER_PHRASES.exec(text)].filter(
    (m): m is RegExpExecArray => m !== null,
  )
  if (hits.length === 0) return null
  return hits.reduce((a, b) => (a.index <= b.index ? a : b))
}

export function hasPlaceholder(text: string): boolean {
  return firstPlaceholder(text) !== null
}
const BLOCK_TAG_RE = /<(p|h2|h3|ul|ol|li|table)\b/i
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Strip tags → plain text; collapse whitespace. */
function textOf(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * The placeholder this text contains, with a little of its surroundings, or
 * null. `placeholder_found` on its own says nothing about WHICH word tripped
 * it, and a run that fails this gate keeps no copy of the article (the blog's
 * Spanish run, 12 Oct 2026), so the caller logs this instead of guessing.
 */
export function placeholderContext(text: string, around = 60): string | null {
  const m = firstPlaceholder(text || '')
  if (!m) return null
  const at = m.index
  const from = Math.max(0, at - around)
  return (text || '').slice(from, at + m[0].length + around).replace(/\s+/g, ' ').trim()
}

export function runQualityGate(article: QualityGateArticle): QualityGateResult {
  const failures: string[] = []
  const title = (article.title || '').trim()
  const html = (article.content_html || '').trim()
  const slug = (article.slug || '').trim()

  if (title.length < 3) failures.push('title_missing')
  if (!html) failures.push('content_missing')

  if (html) {
    const text = textOf(html)
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0
    if (words < 150) failures.push('content_too_short')
    if (!BLOCK_TAG_RE.test(html)) failures.push('broken_html')
    if (hasPlaceholder(html) || hasPlaceholder(title)) failures.push('placeholder_found')
    // Obvious rendering bug: literal "undefined"/"null" leaking into prose.
    if (/<(p|h[1-6]|li)>\s*(undefined|null)\s*<\/(p|h[1-6]|li)>/i.test(html)) failures.push('broken_html')
  }

  if (!slug || !SLUG_RE.test(slug) || slug.length > 90) failures.push('slug_invalid')

  return { ok: failures.length === 0, failures }
}
