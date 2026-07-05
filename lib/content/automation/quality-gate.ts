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

const PLACEHOLDER_RE = /(\bTODO\b|\bTBD\b|lorem ipsum|insert[ _]?here|\[\s*insert|\{\{|\}\}|xxxxx|placeholder|\bfixme\b)/i
const BLOCK_TAG_RE = /<(p|h2|h3|ul|ol|li|table)\b/i
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Strip tags → plain text; collapse whitespace. */
function textOf(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()
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
    if (PLACEHOLDER_RE.test(html) || PLACEHOLDER_RE.test(title)) failures.push('placeholder_found')
    // Obvious rendering bug: literal "undefined"/"null" leaking into prose.
    if (/<(p|h[1-6]|li)>\s*(undefined|null)\s*<\/(p|h[1-6]|li)>/i.test(html)) failures.push('broken_html')
  }

  if (!slug || !SLUG_RE.test(slug) || slug.length > 90) failures.push('slug_invalid')

  return { ok: failures.length === 0, failures }
}
