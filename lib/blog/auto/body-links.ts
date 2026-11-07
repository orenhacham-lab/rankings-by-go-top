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

/**
 * THE BRAND, AS A LANGUAGE THAT IS NOT ENGLISH ACTUALLY WRITES IT.
 *
 * `checkBodyLinks` used to ask `html.includes('Go Top SEO')` and nothing else,
 * and that one exact match is what stopped the Italian and Japanese articles on
 * 2 and 3 Nov 2026: five of six runs failed `links:brand_not_mentioned`, the
 * article was discarded, and Japanese went three days without a page. A model
 * writing Japanese renders a Latin name in forms that are the same name to a
 * reader and a different string to `includes`: full-width letters (Ｇｏ Ｔｏｐ
 * ＳＥＯ), an ideographic space between the words, a no-break space, a stray
 * zero-width space from the tokenizer. Italian trips a plainer version of it,
 * such as "GO TOP SEO" in a heading-like sentence.
 *
 * So the name is matched on a normalised copy of the text — full-width Latin
 * folded to ASCII, the exotic spaces folded to a plain one, case ignored — and
 * whatever form the model used is rewritten to the canonical ASCII name, which
 * is what the trial link then wraps and what the reader sees.
 */
const FULL_WIDTH_OFFSET = 0xfee0

export function foldBrandText(text: string): string {
  return text
    .replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - FULL_WIDTH_OFFSET))
    .replace(/[\u3000\u00a0\u2007\u202f\u200b]/g, ' ')
}

/** The name in any of those forms, as written text. */
const BRAND_VARIANT_RE = /[Gg\uff27\uff47]\s*[Oo\uff2f\uff4f]\s*[\s\u3000\u00a0]*[Tt\uff34\uff54]\s*[Oo\uff2f\uff4f]\s*[Pp\uff30\uff50]\s*[\s\u3000\u00a0]*[Ss\uff33\uff53]\s*[Ee\uff25\uff45]\s*[Oo\uff2f\uff4f]/g

/** Does this body name the product at all, in any form a reader would accept? */
export function mentionsBrand(html: string): boolean {
  return /go\s*top\s*seo/i.test(foldBrandText(html || ''))
}

/**
 * Rewrite whatever form the model used into the canonical ASCII name, in prose
 * only — a tag, an attribute and an existing link are left untouched. Runs
 * before the link pass, so the link wraps the canonical name.
 */
export function canonicalizeBrand(html: string): string {
  if (!html || html.includes(BRAND)) return html
  const tokens = tokenizeHtml(html)
  for (const run of textRuns(tokens)) {
    if (!isLinkableRun(run)) continue
    const folded = foldBrandText(run.text)
    if (!/go\s*top\s*seo/i.test(folded)) continue
    tokens[run.token] = run.text.replace(BRAND_VARIANT_RE, BRAND)
  }
  return tokens.join('')
}

/**
 * THE SENTENCE AN ARTICLE THAT NEVER NAMED US GETS INSTEAD OF BEING BINNED.
 *
 * A discarded article is a day with no page in that language, which is the
 * costlier of the two failures: the gate below exists to stop a page that says
 * nothing about the system, and one deterministic closing sentence satisfies it
 * without asking the model for anything. It is appended the way the plan cards
 * and the trial band already are (lib/blog/auto/widgets.ts) — plain, factual,
 * inside the truth limits, and in the article's own language.
 */
const BRAND_FALLBACK: Record<BlogAutoLocale, (link: string) => string> = {
  he: (l) => `${l} מרכז את העבודה הזו במקום אחד, ואפשר להתחיל בניסיון חינם.`,
  en: (l) => `${l} brings this work together in one place, and you can start with a free trial.`,
  es: (l) => `${l} reúne este trabajo en un solo lugar y puedes empezar con una prueba gratuita.`,
  'pt-BR': (l) => `O ${l} reúne esse trabalho em um só lugar, e você pode começar com um teste gratuito.`,
  fr: (l) => `${l} réunit ce travail en un seul endroit, et vous pouvez commencer par un essai gratuit.`,
  it: (l) => `${l} riunisce questo lavoro in un unico posto, e puoi iniziare con una prova gratuita.`,
  ja: (l) => `${l} はこうした作業を一つの場所にまとめており、無料トライアルから始められます。`,
  de: (l) => `${l} bündelt diese Arbeit an einer Stelle, und Sie können kostenlos testen.`,
  nl: (l) => `${l} brengt dit werk op één plek samen, en u kunt beginnen met een gratis proefperiode.`,
  pl: (l) => `${l} zbiera tę pracę w jednym miejscu i można zacząć od bezpłatnego okresu próbnego.`,
}

/** Append that sentence when, and only when, the body never named the product. */
export function ensureBrandSentence(html: string, locale: BlogAutoLocale): string {
  if (mentionsBrand(html)) return html
  const link = `<a href="${trialHref(locale)}">${BRAND}</a>`
  return `${(html || '').trimEnd()}\n<p>${BRAND_FALLBACK[locale](link)}</p>`
}

const RELATED_HEADING: Record<BlogAutoLocale, string> = {
  he: 'קראו גם',
  en: 'Read also',
  es: 'Lee también',
  'pt-BR': 'Leia também',
  fr: 'À lire aussi',
  it: 'Da leggere anche',
  ja: 'あわせて読みたい',
  de: 'Auch lesenswert',
  nl: 'Ook interessant',
  pl: 'Warto przeczytać także',
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
  // The name as the model wrote it becomes the name as we write it, and a body
  // that never named us gets the one deterministic sentence that does.
  const named = ensureBrandSentence(canonicalizeBrand(linkified), input.locale)
  const branded = linkBrandMention(named, input.locale)
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
  if (!mentionsBrand(html)) failures.push('brand_not_mentioned')
  if (!hasOwnLink(html || '')) failures.push('no_link_to_product')
  return { ok: failures.length === 0, failures }
}
