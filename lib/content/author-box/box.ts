/**
 * The author box the system may add at the end of an article it publishes to
 * the customer's site, and the test of whether the site's theme already shows
 * one of its own.
 *
 * OFF UNLESS THE OWNER TURNS IT ON (project_article_styles.author_box,
 * supabase/migrations/20261016120000_project_author_box.sql), and even then
 * ONLY when the theme has no author box: one fetched post page of the site is
 * read by themeHasAuthorBox below. Anything that is not a clear "no author box
 * here" (the page could not be read, it was cut off, no published page is
 * known) adds nothing: the owner asked for a box only where there is none.
 *
 * NOTHING INVENTED. Every word in the box comes from one of these, and from
 * nothing else:
 *   heading   AUTHOR_BOX_HEADINGS, in the ARTICLE's language
 *   name      the WordPress user the post is published as (display name), else
 *             the business name
 *   line      the first sentence of the business description in the project's
 *             own settings (project_profiles.description), when there is one
 *   link      the site's own about page (from the site map) or its home page,
 *             labelled with the business name (or the site's host name)
 * No biography, no credentials, no photo.
 *
 * Drawn by the article design (lib/content/article-style/html.ts): the
 * formatted design gives it the brand colours as inline styles; the minimal one
 * leaves plain paragraphs under a rule. Either way it passes the design's
 * sanitizer, and every text is escaped. The paragraphs carry OWN_CLASS so the
 * box is never added twice and is never mistaken for the theme's own.
 *
 * Pure: no I/O, safe in the browser and on the server.
 */
import { cleanCtaText, normalizeCtaUrl } from '@/lib/content/article-style/cta'

export type AuthorBoxLanguage = 'he' | 'en' | 'es' | 'pt'

export const AUTHOR_BOX_HEADINGS: Record<AuthorBoxLanguage, string> = {
  he: 'על הכותב',
  en: 'About the author',
  es: 'Sobre el autor',
  pt: 'Sobre o autor',
}

/** The class on every paragraph of our box. Contains no "author", so the theme test never counts our own box. */
export const OWN_CLASS = 'gotop-writer-card'

export const AUTHOR_BOX_LIMITS = { name: 80, line: 220, label: 60 } as const

/** What the box shows, already checked: plain text and one https link. */
export type AuthorBoxContent = {
  language: AuthorBoxLanguage
  name: string
  line: string
  link: { url: string; label: string } | null
}

/** A content or project language value → the box's language. */
export function authorBoxLanguage(value: unknown): AuthorBoxLanguage | null {
  const s = String(value ?? '').toLowerCase().trim()
  if (s.startsWith('he') || s.startsWith('iw')) return 'he'
  if (s.startsWith('en')) return 'en'
  if (s.startsWith('es') || s.startsWith('cas')) return 'es'
  if (s.startsWith('pt')) return 'pt'
  return null
}

/** The first sentence of the business description, capped; '' when there is none. */
export function descriptionLine(description: unknown): string {
  const text = cleanCtaText(description, 2000)
  if (!text) return ''
  const m = text.match(/^[\s\S]{10,}?[.!?](?=\s|$)/)
  const first = (m ? m[0] : text).trim()
  if (first.length <= AUTHOR_BOX_LIMITS.line) return first
  const cut = first.slice(0, AUTHOR_BOX_LIMITS.line)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 120)).trim()}…`
}

const host = (domain: unknown) => String(domain ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/\.$/, '')
const bare = (h: string) => h.replace(/^www\./, '')

/**
 * True when a WordPress display name is really a login. WordPress shows the
 * login as the display name until the user picks another, so a box could read
 * "japan4u_adm" (reported on japan4u, 2026-10-16). A name with an @, or one
 * word that is lowercase, carries digits or _ . -, or is Latin-only on a site
 * not written in English, is treated as a login, and the business name is shown.
 */
export function looksLikeLogin(name: string, language: AuthorBoxLanguage): boolean {
  const n = name.trim()
  if (!n) return false
  if (n.includes('@')) return true
  if (/\s/.test(n)) return false
  if (/[\d_.\-]/.test(n)) return true
  if (/^[a-z]+$/.test(n)) return true
  return language !== 'en' && /^[A-Za-z]+$/.test(n)
}

/**
 * The box's content from the project's own facts, or null when there is not
 * even a name to show. The link must be on the project's own site.
 */
export function authorBoxContent(input: {
  language: AuthorBoxLanguage
  authorName?: string | null
  businessName?: string | null
  description?: string | null
  domain?: string | null
  aboutUrl?: string | null
}): AuthorBoxContent | null {
  const business = cleanCtaText(input.businessName ?? '', AUTHOR_BOX_LIMITS.name)
  const author = cleanCtaText(input.authorName ?? '', AUTHOR_BOX_LIMITS.name)
  const name = (author && !looksLikeLogin(author, input.language) ? author : '') || business
  if (!name) return null
  const site = host(input.domain)
  let link: AuthorBoxContent['link'] = null
  if (site) {
    const about = input.aboutUrl ? normalizeCtaUrl(input.aboutUrl) : null
    const onSite = about && bare(new URL(about).hostname) === bare(site) ? about : null
    const url = onSite ?? normalizeCtaUrl(`https://${site}/`)
    if (url) link = { url, label: cleanCtaText(business || bare(site), AUTHOR_BOX_LIMITS.label) }
  }
  return { language: input.language, name, line: descriptionLine(input.description), link }
}

const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escAttr = (s: string) => escText(s).replace(/"/g, '&quot;')

/**
 * The box as bare structure, marked with data-as roles for the formatted
 * design (html.ts styles them, the minimal design drops the markers).
 */
export function authorBoxStructure(c: AuthorBoxContent): string {
  const p = (role: string, part: string, inner: string) => `<p class="${OWN_CLASS} ${OWN_CLASS}-${part}" data-as="${role}">${inner}</p>`
  return `<div data-as="author">` +
    p('author-title', 'title', `<strong>${escText(AUTHOR_BOX_HEADINGS[c.language])}</strong>`) +
    p('author-name', 'name', `<strong>${escText(c.name)}</strong>`) +
    (c.line ? p('author-text', 'text', escText(c.line)) : '') +
    (c.link ? p('author-action', 'link', `<a data-as="author-link" href="${escAttr(c.link.url)}">${escText(c.link.label)}</a>`) : '') +
    `</div>`
}

/**
 * Where the box goes: right before the project's call to action or the closing
 * call-to-action box when the body has one, else at the very end.
 */
export function placeAuthorBox(body: string, box: string): string {
  const at = body.search(/<div\b[^>]*data-as="(?:pcta|cta)"/i)
  return at >= 0 ? body.slice(0, at) + box + body.slice(at) : body + box
}

// ── Does the page already have an author box? ─────────────────────────────

/** A class or id that is an author box by itself (common themes and plugins). */
const STRONG = /(?:^|[\s_-])(?:author[-_]?box|authorbox|author[-_]bio|author[-_]biography|about[-_](?:the[-_])?author|author[-_]info|author[-_]card|author[-_]profile|author[-_]about|author[-_]details|author[-_]description|authors?[-_]block|saboxplugin(?:[-_]wrap)?|sabox|starbox|abh[-_]box|ts-fab-wrapper|m-a-box|molongui-author|ppma-author|pp-multiple-authors|wp-block-post-author-biography|yoast-author|wp-block-yoast-seo-author|rank-math-author|rm-author-box|elementor-author-box|td-author-box|jeg_authorbox|tie-author-box|penci-author|sp-author-box)(?:$|[\s_-])/i

/** A class or id that is an author box only when it holds a bio paragraph (else it is a byline). */
const WEAK = /(?:^|[\s_-])(?:post-author|entry-author|article-author|author-wrap|author-area|author-section|wp-block-post-author|vcard)(?:$|[\s_-])/i

/** Scripts, styles and comments out, and our own box's class names neutralised. */
export function cleanPageHtml(html: string): string {
  return String(html ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*$/gi, ' ')
    .replace(new RegExp(`\\b${OWN_CLASS}(?:-[a-z]+)?\\b`, 'g'), '')
}

const attrValue = (attrs: string, name: string): string => {
  const m = attrs.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : ''
}
const textOf = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim()

/** The inner HTML of the element whose opening tag ends at `from`, by counting tags of the same name. */
function innerOf(html: string, tagName: string, from: number): string {
  const re = new RegExp(`<(/?)${tagName}\\b[^>]*>`, 'gi')
  re.lastIndex = from
  let depth = 1
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    if (/\/>$/.test(m[0])) continue
    depth += m[1] ? -1 : 1
    if (depth === 0) return html.slice(from, m.index)
    if (re.lastIndex - from > 20_000) break
  }
  return html.slice(from, from + 4000)
}

/** A bio: a paragraph-like run of at least 60 characters, and not the whole article (under 1500). */
function holdsBio(inner: string): boolean {
  const all = textOf(inner)
  if (all.length > 1500) return false
  return [...inner.matchAll(/<(p|div)\b[^>]*>([\s\S]*?)<\/\1>/gi)].some((m) => textOf(m[2] ?? '').length >= 60)
}

/**
 * True when the page shows an author box: a class or id of a known author-box
 * kind, or a byline-kind element (or a rel="author" link inside an aside or
 * section) that holds a bio paragraph. Our own box is never counted.
 */
export function themeHasAuthorBox(pageHtml: string): boolean {
  const html = cleanPageHtml(pageHtml)
  const tags = /<([a-z][a-z0-9]*)\b([^>]*)>/gi
  let m: RegExpExecArray | null
  const containers: { name: string; end: number }[] = []
  while ((m = tags.exec(html)) !== null) {
    const name = (m[1] ?? '').toLowerCase()
    const attrs = m[2] ?? ''
    const marks = `${attrValue(attrs, 'class')} ${attrValue(attrs, 'id')}`.trim()
    if (marks && STRONG.test(marks)) return true
    if (marks && WEAK.test(marks) && holdsBio(innerOf(html, name, tags.lastIndex))) return true
    if (name === 'aside' || name === 'section' || name === 'footer') containers.push({ name, end: tags.lastIndex })
    if (name === 'a' && /\brel\s*=\s*["']?[^"'>]*\bauthor\b/i.test(attrs)) {
      for (const c of containers) {
        const inner = innerOf(html, c.name, c.end)
        if (c.end + inner.length >= tags.lastIndex && holdsBio(inner)) return true
      }
    }
  }
  return false
}

/** True when the article body already carries an author box (ours, or one written into it). */
export function bodyHasAuthorBox(body: string): boolean {
  return String(body ?? '').includes(OWN_CLASS) || themeHasAuthorBox(body)
}
