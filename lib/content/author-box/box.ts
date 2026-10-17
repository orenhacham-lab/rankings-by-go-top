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
 *   name      the name the owner typed in the settings (author_box_name), else
 *             the WordPress user the post is published as (display name) unless
 *             it looks like a login, else the business name (resolveAuthorName)
 *   line      the first sentence of the business description in the project's
 *             own settings (project_profiles.description), when there is one
 *   link      the address the owner typed in the settings (author_box_url,
 *             http or https only), else the site's own about page (from the
 *             site map) or its home page. The NAME line itself is the link:
 *             there is no second line with the business name under it (which
 *             repeated the name whenever the name fell back to the business)
 *   image     only when the owner chose one (author_box_image):
 *             'site_icon'  the WordPress site icon (site_icon_url) when the
 *                          site has one;
 *             'upload'     the owner's own photo (lib/content/author-box/photo.ts), as the COPY
 *                          placed in the site's media library at publish time
 *                          (./photo-copy.ts); never our stored file;
 *             either way https, on the site's own host or WordPress' CDN; a
 *             small round image with the business name as its alt. Nothing
 *             readable: no image at all.
 * No biography, no credentials.
 *
 * Drawn by the article design (lib/content/article-style/html.ts): the
 * formatted design gives it the brand colours as inline styles; the minimal one
 * leaves plain paragraphs under a rule. Either way it passes the design's
 * sanitizer, and every text is escaped. The paragraphs carry OWN_CLASS so the
 * box is never added twice and is never mistaken for the theme's own.
 *
 * ONE RESOLVER. authorBoxContent is what publishing draws (store.ts,
 * decideAuthorBox) AND what the settings card's preview draws
 * (components/settings/WritingGuidanceCard.tsx, from the same inputs read by
 * store.ts readAuthorBoxInputs), so the owner sees the name that will be used.
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

export const AUTHOR_BOX_LIMITS = { name: 80, line: 220, label: 60, url: 300, image: 600 } as const

/**
 * The image in the box, as the owner chose it: none, the WordPress site icon,
 * or the photo the owner uploaded ('upload', lib/content/author-box/photo.ts; the column's CHECK
 * lists it from 20261017120000_project_author_photo.sql). Anything unknown is 'none'.
 */
export const AUTHOR_BOX_IMAGE_CHOICES = ['none', 'site_icon', 'upload'] as const
export type AuthorBoxImageChoice = (typeof AUTHOR_BOX_IMAGE_CHOICES)[number]
export const authorBoxImageChoice = (v: unknown): AuthorBoxImageChoice =>
  (AUTHOR_BOX_IMAGE_CHOICES as readonly unknown[]).includes(v) ? (v as AuthorBoxImageChoice) : 'none'

/** The image's drawn size, in pixels (explicit width and height on the img). */
export const AUTHOR_BOX_IMAGE_SIZE = 56

/** What the box shows, already checked: plain text, one http(s) link and, when chosen, one https image. */
export type AuthorBoxContent = {
  language: AuthorBoxLanguage
  name: string
  line: string
  link: { url: string; label: string } | null
  image?: { url: string; alt: string } | null
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

/** The owner's "author name to show": plain text, exactly as a name is cleaned (cleanCtaText, the name limit); '' when empty. */
export function cleanAuthorBoxName(input: unknown): string {
  return cleanCtaText(input, AUTHOR_BOX_LIMITS.name)
}

/**
 * The owner's link address: http or https only, a public host name, no user
 * name, password or port (normalizeCtaUrl's rules; a bare "example.com" is read
 * as https). Null for anything else: javascript:, data:, mailto:, ftp:, a
 * relative path, an address with spaces or quotes.
 */
export function normalizeAuthorBoxUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const raw = input.trim()
  if (!raw || raw.length > AUTHOR_BOX_LIMITS.url) return null
  const plain = /^http:\/\//i.test(raw)
  const checked = normalizeCtaUrl(plain ? `https://${raw.slice(7)}` : raw)
  if (!checked) return null
  const out = plain ? `http://${checked.slice('https://'.length)}` : checked
  return out.length <= AUTHOR_BOX_LIMITS.url ? out : null
}

/** CDN hosts a WordPress site icon may be served from (Jetpack's image CDN, WordPress.com files). */
const WP_CDN = /(?:^|\.)(?:wp\.com|files\.wordpress\.com)$/

/**
 * The site icon's address when it may be drawn: https only, no user name,
 * password or port, on the site's own host (with or without www) or WordPress'
 * CDN. Null for anything else, and when the site is not known.
 */
export function normalizeAuthorBoxImage(input: unknown, domain: unknown): string | null {
  if (typeof input !== 'string') return null
  const raw = input.trim()
  if (!raw || raw.length > AUTHOR_BOX_LIMITS.image || !/^https:\/\//i.test(raw) || /[\s<>"'`\\]/.test(raw)) return null
  const site = bare(host(domain))
  if (!site) return null
  let url: URL
  try { url = new URL(raw) } catch { return null }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
  const h = bare(url.hostname.toLowerCase().replace(/\.$/, ''))
  if (h !== site && !WP_CDN.test(h)) return null
  const out = url.toString()
  return out.length <= AUTHOR_BOX_LIMITS.image ? out : null
}

export type AuthorNameSource = 'override' | 'site_user' | 'business'

/**
 * Which name the box shows, and why: the owner's own name when typed, else the
 * site's publishing user unless it looks like a login, else the business name.
 * `rejectedLogin` is the site's name when it was set aside as a login.
 */
export function resolveAuthorName(input: {
  language: AuthorBoxLanguage
  nameOverride?: string | null
  authorName?: string | null
  businessName?: string | null
}): { name: string; source: AuthorNameSource | null; rejectedLogin: string | null } {
  const override = cleanAuthorBoxName(input.nameOverride ?? '')
  if (override) return { name: override, source: 'override', rejectedLogin: null }
  const author = cleanCtaText(input.authorName ?? '', AUTHOR_BOX_LIMITS.name)
  const login = !!author && looksLikeLogin(author, input.language)
  if (author && !login) return { name: author, source: 'site_user', rejectedLogin: null }
  const business = cleanCtaText(input.businessName ?? '', AUTHOR_BOX_LIMITS.name)
  return { name: business, source: business ? 'business' : null, rejectedLogin: login ? author : null }
}

/** Everything the box is made from (store.ts readAuthorBoxInputs reads it; the preview receives it). */
export type AuthorBoxInputs = {
  language: AuthorBoxLanguage
  /** The owner's own name for the box; wins when not empty. */
  nameOverride?: string | null
  authorName?: string | null
  businessName?: string | null
  description?: string | null
  domain?: string | null
  aboutUrl?: string | null
  /** The owner's own link address (http or https); wins when valid. */
  linkUrl?: string | null
  /** The owner's image choice; 'none' (or absent) draws no image. */
  imageChoice?: AuthorBoxImageChoice | null
  /** The site icon's address, when the site has one (read at publish time). */
  imageUrl?: string | null
  /**
   * The uploaded photo's address IN THE CUSTOMER'S SITE (the media-library copy,
   * ./photo-copy.ts), when the choice is 'upload'. Never our storage's address.
   */
  photoUrl?: string | null
}

/**
 * The box's content from the project's own facts, or null when there is not
 * even a name to show. Without the owner's own address, the link must be on
 * the project's own site.
 */
export function authorBoxContent(input: AuthorBoxInputs): AuthorBoxContent | null {
  const business = cleanCtaText(input.businessName ?? '', AUTHOR_BOX_LIMITS.name)
  const { name } = resolveAuthorName(input)
  if (!name) return null
  const site = host(input.domain)
  let link: AuthorBoxContent['link'] = null
  const own = input.linkUrl ? normalizeAuthorBoxUrl(input.linkUrl) : null
  if (own) {
    link = { url: own, label: cleanCtaText(business || bare(new URL(own).hostname), AUTHOR_BOX_LIMITS.label) }
  } else if (site) {
    const about = input.aboutUrl ? normalizeCtaUrl(input.aboutUrl) : null
    const onSite = about && bare(new URL(about).hostname) === bare(site) ? about : null
    const url = onSite ?? normalizeCtaUrl(`https://${site}/`)
    if (url) link = { url, label: cleanCtaText(business || bare(site), AUTHOR_BOX_LIMITS.label) }
  }
  const choice = authorBoxImageChoice(input.imageChoice)
  const iconUrl = choice === 'site_icon' ? normalizeAuthorBoxImage(input.imageUrl, input.domain)
    : choice === 'upload' ? normalizeAuthorBoxImage(input.photoUrl, input.domain)
      : null
  const image = iconUrl ? { url: iconUrl, alt: cleanCtaText(business || name, AUTHOR_BOX_LIMITS.label) } : null
  return { language: input.language, name, line: descriptionLine(input.description), link, ...(image ? { image } : {}) }
}

const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escAttr = (s: string) => escText(s).replace(/"/g, '&quot;')

/**
 * The box as bare structure, marked with data-as roles for the formatted
 * design (html.ts styles them, the minimal design drops the markers).
 */
export function authorBoxStructure(c: AuthorBoxContent): string {
  const p = (role: string, part: string, inner: string) => `<p class="${OWN_CLASS} ${OWN_CLASS}-${part}" data-as="${role}">${inner}</p>`
  const img = c.image && /^https:\/\//i.test(c.image.url)
    ? p('author-photo', 'photo', `<img data-as="author-image" src="${escAttr(c.image.url)}" alt="${escAttr(c.image.alt)}" width="${AUTHOR_BOX_IMAGE_SIZE}" height="${AUTHOR_BOX_IMAGE_SIZE}" loading="lazy">`)
    : ''
  return `<div data-as="author">` +
    img +
    p('author-title', 'title', `<strong>${escText(AUTHOR_BOX_HEADINGS[c.language])}</strong>`) +
    // The NAME is the link (to the owner's address, else the about or home page): no second line
    // repeating the business name under it.
    p('author-name', 'name', `<strong>${c.link ? `<a data-as="author-link" href="${escAttr(c.link.url)}">${escText(c.name)}</a>` : escText(c.name)}</strong>`) +
    (c.line ? p('author-text', 'text', escText(c.line)) : '') +
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
