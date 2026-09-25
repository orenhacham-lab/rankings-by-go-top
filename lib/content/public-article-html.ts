import sanitizeHtml from 'sanitize-html'

/**
 * Sanitizer for PUBLIC blog articles (`articles.content`, rendered with
 * dangerouslySetInnerHTML on /articles/[slug] under the app's own origin).
 *
 * `/api/publish-article` stored `content` exactly as received and the article
 * page rendered it unsanitized (and first parsed it with `innerHTML` on a
 * detached div, which still fires `<img onerror>`), so any HTML reaching that
 * column ran as script for every visitor — on the same origin as the logged-in
 * dashboard. This is applied on WRITE (publish-article) and again on RENDER.
 *
 * The allow-list is deliberately wider than the admin editor's: the articles
 * already published use tables, `class` and inline `style`, and those must keep
 * rendering. Nothing here can execute script: no event-handler attributes, no
 * <script>/<iframe>/<object>/<svg>, and URLs are limited to http(s), mailto and
 * tel (so no `javascript:` or `data:`).
 */
export const PUBLIC_ARTICLE_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'div', 'span', 'section', 'article',
    'strong', 'b', 'em', 'i', 'u', 's', 'small', 'sub', 'sup', 'mark', 'code', 'pre', 'blockquote',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'a', 'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  ],
  allowedAttributes: {
    '*': ['class', 'id', 'dir', 'lang', 'style', 'title'],
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'loading'],
    th: ['colspan', 'rowspan', 'scope'],
    td: ['colspan', 'rowspan'],
    col: ['span'],
    colgroup: ['span'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    a: (tagName, attribs) =>
      attribs.target === '_blank'
        ? { tagName, attribs: { ...attribs, rel: 'noopener noreferrer' } }
        : { tagName, attribs },
  },
}

export function sanitizePublicArticleHtml(html: unknown): string {
  if (typeof html !== 'string' || html.length === 0) return ''
  return sanitizeHtml(html, PUBLIC_ARTICLE_SANITIZE_OPTIONS)
}

/**
 * JSON for a `<script type="application/ld+json">` block. JSON.stringify does
 * not escape `<`, so a title containing `</script>` would close the tag and
 * inject markup; `<` is the same character to a JSON parser.
 */
export function jsonForScriptTag(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
