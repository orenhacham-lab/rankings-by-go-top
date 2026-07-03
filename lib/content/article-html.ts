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
]

/**
 * Sanitize article body HTML. Strips scripts/styles/iframes/on* handlers and
 * javascript: URLs; keeps a clean, WordPress-safe subset. <img> is intentionally
 * NOT allowed in Phase 3A (no images yet).
 */
export function sanitizeArticleHtml(html: string): string {
  if (!html || typeof html !== 'string') return ''
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      th: ['scope', 'colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
      span: ['class'],
      // TOC support: heading anchor targets + a nav wrapper.
      h2: ['id'], h3: ['id'], h4: ['id'],
      nav: ['class', 'aria-label'],
    },
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
