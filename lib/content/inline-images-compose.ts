/**
 * Phase 4D — inline-image PURE composition (no server deps).
 *
 * Split out from inline-images.ts so the article editor's read-only body PREVIEW
 * can compose figures client-side without pulling server-only modules (Gemini
 * image client, WordPress client, Supabase admin) into the browser bundle.
 * inline-images.ts re-exports everything here, so server imports are unchanged.
 *
 * Inline images are persisted rows (article_inline_images), NOT baked into
 * content_html; figures are composed on demand for editor preview + WordPress
 * publish. Composition is idempotent — the body stays image-free, so re-composing
 * never duplicates a <figure>.
 */

export const INLINE_IMAGE_MAX = 3

export interface InlineImage {
  id: string
  article_id: string
  section_id: string
  prompt: string | null
  alt_text: string | null
  caption: string | null
  storage_url: string | null
  storage_path: string | null
  wp_media_id: number | null
  wp_media_url: string | null
  position: number
  status: string
  last_error: string | null
}

/** The minimal shape injectInlineImages actually reads — lets the client pass a
 *  lighter row (e.g. the editor panel's view model) without the full InlineImage. */
export type ComposableInlineImage = Pick<
  InlineImage,
  'id' | 'section_id' | 'alt_text' | 'caption' | 'storage_url' | 'wp_media_url' | 'position'
>

function escRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function esc(s: string): string { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
function stripTags(s: string): string { return (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() }

/** A section is "FAQ" (never eligible) when its id or title marks it as the FAQ block. */
function isFaqSection(id: string, title: string): boolean {
  return /(^|-)faq(-|$)/i.test(id) || /שאלות נפוצות|frequently asked/i.test(title)
}

/** Regex matching a section's H2 through its FIRST paragraph, bounded to the
 *  section (never crossing into the next <h2>). No match ⇒ the section has no
 *  eligible paragraph (e.g. only a table/list) ⇒ not eligible. */
function sectionFirstParagraphRe(sectionId: string): RegExp {
  return new RegExp(`(<h2\\b[^>]*\\bid="${escRe(sectionId)}"[^>]*>(?:(?!<h2\\b)[\\s\\S])*?<\\/p>)`, 'i')
}

/** Eligible target sections: every H2 (with an id) that has a first paragraph and
 *  is NOT the FAQ block. The intro (before the first H2) is never eligible. */
export function eligibleSections(html: string): { sectionId: string; title: string }[] {
  const out: { sectionId: string; title: string }[] = []
  const re = /<h2\b[^>]*\bid="([^"]*)"[^>]*>([\s\S]*?)<\/h2>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html || '')) !== null) {
    const id = m[1]
    const title = stripTags(m[2] || '')
    if (!id || isFaqSection(id, title)) continue
    if (sectionFirstParagraphRe(id).test(html)) out.push({ sectionId: id, title })
  }
  return out
}

/** The <figure> block for one inline image (responsive, lazy, safe). */
export function figureHtml(img: { id: string; url: string; alt: string | null; caption: string | null }): string {
  const alt = esc(img.alt || '')
  const cap = (img.caption || '').trim()
  const capHtml = cap ? `<figcaption>${esc(cap)}</figcaption>` : ''
  return `<figure class="article-inline-image" data-inline-image-id="${esc(img.id)}"><img src="${esc(img.url)}" alt="${alt}" loading="lazy" /></figure>`.replace('</figure>', `${capHtml}</figure>`)
}

/**
 * Compose inline images into the body: insert each image's <figure> right AFTER
 * its target section's first paragraph. Rules: max ONE image per section (first
 * by position), max 3 total, never in the intro / heading / list / table / FAQ.
 * `mode` picks the URL: 'publish' uses ONLY the WordPress URL (skips images not
 * yet uploaded — never emits a temporary URL live); 'preview' falls back to the
 * storage URL. Idempotent: skips a section already carrying that image's figure.
 */
export function injectInlineImages(html: string, images: ComposableInlineImage[], mode: 'preview' | 'publish'): string {
  if (!html) return html || ''
  const ordered = [...(images || [])].sort((a, b) => a.position - b.position)
  const usedSections = new Set<string>()
  let out = html
  let placed = 0
  for (const img of ordered) {
    if (placed >= INLINE_IMAGE_MAX) break
    const url = mode === 'publish' ? img.wp_media_url : (img.wp_media_url || img.storage_url)
    if (!url) continue                                            // no usable URL → skip (never a broken temp URL live)
    if (usedSections.has(img.section_id)) continue                // one image per section
    if (out.includes(`data-inline-image-id="${img.id}"`)) { usedSections.add(img.section_id); placed++; continue } // idempotent
    const re = sectionFirstParagraphRe(img.section_id)
    if (!re.test(out)) continue                                   // section not eligible in this html
    out = out.replace(re, `$1${figureHtml({ id: img.id, url, alt: img.alt_text, caption: img.caption })}`)
    usedSections.add(img.section_id)
    placed++
  }
  return out
}
