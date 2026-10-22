/**
 * THE LINKS INSIDE AN AUTO-WRITTEN ARTICLE'S BODY.
 *
 * The blog's first automatic article (11 Oct 2026) shipped with no link at all
 * in its text: the model wrote "תוכלו להירשם ולהתחיל דרך הקישור הבא:
 * https://www.gotopseo.com/signup?lang=he." as plain prose, and it ignored the
 * internal anchors the brief offered because they are not `required` — a
 * required anchor is force-inserted by the generator into a sentence of its
 * own, which reads badly under Oren's name, so the brief keeps them optional
 * and this module links what the model actually wrote instead.
 *
 * Three deterministic passes, in order, each of them idempotent:
 *   1. a bare URL in the text becomes a real link;
 *   2. the first mention of our own product becomes a link to the free trial —
 *      every article has to both talk about the system and give the reader a
 *      way into it;
 *   3. our other articles of the same language that the body does not already
 *      link are offered in a "read also" block at the end.
 *
 * Nothing here writes a new sentence: it only wraps text the article already
 * has, or appends a block of plain links. `checkBodyLinks` then refuses an
 * article that still has no mention of the product and no link into it — a day
 * without an article costs nothing, a page that never names the system does.
 *
 * Pure: a string in, a string out, so the whole thing is exercisable in QA.
 */

import { authHref } from '@/lib/i18n/auth-href'
import {
  blockOfRun, isLinkableRun, isOwnUrl, linkifyBareUrls, textRuns, tokenizeHtml,
} from '@/lib/articles/bare-urls'
import type { BlogAutoLocale } from '@/lib/blog/auto/rotation'
import { articlePath, type InternalLinkTarget } from '@/lib/blog/auto/brief'

export { linkifyBareUrls }

/** The product's one name, as the brief instructs the model to write it. */
export const BRAND = 'Go Top SEO'

const RELATED_HEADING: Record<BlogAutoLocale, string> = {
  he: 'קראו גם',
  en: 'Read also',
  es: 'Lee también',
  'pt-BR': 'Leia também',
  fr: 'À lire aussi',
}

/** Where the in-body product link goes: the free trial, in the article's language. */
export function trialHref(locale: BlogAutoLocale): string {
  return authHref('signup', locale)
}

// ── pass 2: the product's first mention becomes a link ──────────────────────

/** Is there already a link into our own site in the body? */
export function hasOwnLink(html: string): boolean {
  const hrefs = html.match(/<a\b[^>]*href\s*=\s*"([^"]*)"/gi) ?? []
  return hrefs.some((tag) => {
    const href = tag.match(/href\s*=\s*"([^"]*)"/i)?.[1] ?? ''
    return href.startsWith('/') || isOwnUrl(href)
  })
}

/**
 * Link the first mention of the product, in ordinary prose, to the free trial.
 * The first paragraph is left alone (the generator's own audit treats a link
 * there as too early), and so is a mention inside a heading or an existing
 * link. Returns the html unchanged when there is nothing eligible to wrap.
 */
export function linkBrandMention(html: string, locale: BlogAutoLocale): string {
  if (!html || hasOwnLink(html)) return html
  const tokens = tokenizeHtml(html)
  const runs = textRuns(tokens).filter((run) => isLinkableRun(run) && run.text.includes(BRAND))
  // The opening paragraph is skipped: the generator's own audit treats a link
  // in the article's first paragraph as placed too early.
  const target = runs.find((run) => blockOfRun(run) !== null && run.paragraph !== 0) ?? runs[0]
  if (!target) return html
  const href = trialHref(locale)
  tokens[target.token] = target.text.replace(BRAND, `<a href="${href}">${BRAND}</a>`)
  return tokens.join('')
}

// ── pass 3: our other articles, as a read-also block ────────────────────────

export const RELATED_CLASS = 'gt-related'

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Up to three of our own published articles of the same language, as a block of
 * links at the end of the body. A target the body already links is left out,
 * and an article with no other articles to point at gets no block at all.
 */
export function relatedReading(
  html: string,
  locale: BlogAutoLocale,
  targets: InternalLinkTarget[],
): string {
  if (html.includes(`class="${RELATED_CLASS}"`)) return html
  const chosen = (targets || [])
    .filter((t) => t?.slug && t?.title)
    .filter((t) => !html.includes(articlePath(locale, t.slug)))
    .slice(0, 3)
  if (!chosen.length) return html
  const items = chosen
    .map((t) => `<li><a href="${articlePath(locale, t.slug)}">${escapeHtml(t.title)}</a></li>`)
    .join('')
  const block =
    `<div class="${RELATED_CLASS}"><p><strong>${RELATED_HEADING[locale]}</strong></p><ul>${items}</ul></div>`
  return `${html.trimEnd()}\n${block}`
}

// ── the three passes, and the gate ──────────────────────────────────────────

export function withBodyLinks(
  html: string,
  input: { locale: BlogAutoLocale; internalTargets: InternalLinkTarget[] },
): string {
  const linkified = linkifyBareUrls(html)
  const branded = linkBrandMention(linkified, input.locale)
  return relatedReading(branded, input.locale, input.internalTargets)
}

export interface BodyLinksResult {
  ok: boolean
  failures: string[]
}

/**
 * The article must name the system and must carry a link into it. Both are
 * satisfied by the passes above whenever the model mentioned the product at
 * all, so a failure here means the article never talked about us — which is
 * the one thing every article on this blog exists to do.
 */
export function checkBodyLinks(html: string): BodyLinksResult {
  const failures: string[] = []
  if (!html?.includes(BRAND)) failures.push('brand_not_mentioned')
  if (!hasOwnLink(html || '')) failures.push('no_link_to_product')
  return { ok: failures.length === 0, failures }
}
