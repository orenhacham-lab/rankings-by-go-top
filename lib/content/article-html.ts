/**
 * Article HTML sanitization + slug helpers (content module, Phase 3A).
 *
 * Sanitizes generated/edited article HTML before it is stored, with a
 * WordPress-friendly allowlist. Prevents stored XSS in the editor/preview.
 * Uses sanitize-html (already a project dependency).
 */

import sanitizeHtml from 'sanitize-html'

const ALLOWED_TAGS = [
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'strong', 'em', 'b', 'i', 'u', 's',
  'a', 'br', 'hr', 'nav',
  'blockquote', 'code', 'pre',
  'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'figure', 'figcaption', 'span',
  // Phase 4D — inline article images (composed as <figure><img><figcaption>).
  'img',
]

/** Plain text of an HTML fragment (tags stripped, whitespace collapsed). */
function cellText(html: string): string {
  return (html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Lift a table's TITLE out of the table so it renders ABOVE it, not inside a
 * row. TipTap's table schema has no <caption>, so on editor load a <caption>
 * (or a Gemini "caption row" — one non-empty cell + empty siblings before the
 * real header row) becomes a stray first-row cell. We pull that text into a
 * sibling <p class="article-table-title"> before the table, preserving dir.
 * Idempotent and safe for English (LTR) tables.
 */
export function normalizeArticleTables(html: string): string {
  if (!html || !/<table/i.test(html)) return html
  return html.replace(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi, (_full, attrs: string, inner: string) => {
    const dir = (attrs.match(/dir\s*=\s*["']([^"']+)["']/i)?.[1] || '').toLowerCase()
    let title = ''
    let body = inner

    // 1) An explicit <caption> → title.
    const cap = body.match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i)
    if (cap) { title = cellText(cap[1]); body = body.replace(cap[0], '') }

    // 2) A "caption row": first <tr> with exactly one non-empty cell (rest
    //    empty) followed by a real header/data row with >=2 non-empty cells.
    if (!title) {
      const rows = body.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || []
      const r0 = rows[0]
      const r1 = rows[1]
      if (r0 && r1) {
        const cellsOf = (row: string) =>
          [...row.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => cellText(m[1] || ''))
        const first = cellsOf(r0)
        const firstNonEmpty = first.filter(Boolean)
        if (first.length >= 2 && firstNonEmpty.length === 1 && cellsOf(r1).filter(Boolean).length >= 2) {
          title = firstNonEmpty[0] || ''
          body = body.replace(r0, '')
        }
      }
    }

    const table = `<table${attrs}>${body}</table>`
    if (!title) return table
    const pDir = dir ? ` dir="${dir}"` : ' dir="ltr"'
    return `<p class="article-table-title"${pDir}>${title}</p>${table}`
  })
}

/**
 * Sanitize article body HTML. Strips scripts/styles/iframes/on* handlers and
 * javascript: URLs; keeps a clean, WordPress-safe subset. <img> is intentionally
 * NOT allowed in Phase 3A (no images yet). Table titles are normalized out of
 * the table first (see normalizeArticleTables).
 */
export function sanitizeArticleHtml(html: string): string {
  if (!html || typeof html !== 'string') return ''
  return sanitizeHtml(normalizeArticleTables(html), {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      p: ['class', 'dir'],
      table: ['dir'],
      th: ['scope', 'colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
      span: ['class'],
      // TOC support: heading anchor targets + a nav wrapper.
      h2: ['id'], h3: ['id'], h4: ['id'],
      nav: ['class', 'aria-label'],
      // Phase 4D — inline images: only safe, responsive attributes. No on*,
      // no style, no srcset; http/https src only (enforced by allowedSchemes).
      img: ['src', 'alt', 'width', 'height', 'loading', 'class'],
      figure: ['class', 'data-inline-image-id'],
      figcaption: ['class'],
    },
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    transformTags: {
      // Any link that opens a new tab must be safe.
      a: (tagName, attribs) => {
        const out: Record<string, string> = { ...attribs }
        if (out.target === '_blank') out.rel = 'noopener noreferrer'
        return { tagName, attribs: out }
      },
    },
  }).trim()
}

/** Slugify a title/slug candidate. Supports Hebrew (kept as-is, spaces→'-'). */
export function slugify(input: string): string {
  const base = (input || '')
    .trim()
    .toLowerCase()
    .replace(/['"’”“]/g, '')
    .replace(/[^a-z0-9֐-׿]+/gi, '-') // keep latin, digits, Hebrew
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
  return base.slice(0, 80) || 'article'
}
