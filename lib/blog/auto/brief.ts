/**
 * THE BRIEF FOR ONE AUTO-WRITTEN ARTICLE ON OUR OWN BLOG.
 *
 * The customer path builds its brief from a project row (business name, city,
 * the owner's writing guidance). Our blog has no project: the "business" is Go
 * Top SEO itself, the audience is an Israeli business owner deciding whether to
 * use it, and the rules the article must not break are ours and are fixed. So
 * the brief is built here, from the plan row and nothing else.
 *
 * What makes this worth publishing rather than filler — the thing that keeps a
 * daily cadence from being a pile of interchangeable pages — is carried in the
 * guidance below: every article has to give the reader something checkable they
 * can do or compare, and it may only describe what the product actually does.
 * lib/blog/auto/truth-limits.ts then refuses the article if the text claims
 * anything else.
 *
 * Pure: no I/O, so the whole brief is exercisable in a QA suite.
 */

import type { ArticleBrief } from '@/lib/content/gemini-article'
import type { ArticleTopicAnchor } from '@/lib/supabase/types'
import type { WritingGuidance } from '@/lib/content/writing-guidance/guidance'
import { authHref } from '@/lib/i18n/auth-href'
import type { BlogAutoLocale } from '@/lib/blog/auto/rotation'
import { decodeGateReason } from '@/lib/blog/auto/truth-limits'

export const SITE_URL = 'https://www.gotopseo.com'

/** The byline, and therefore the author box and the Person in the JSON-LD. */
export const BLOG_AUTHOR = 'אורן חכם'

/** Words the article is written for, per language. */
const AUDIENCE: Record<BlogAutoLocale, string> = {
  he: 'בעל עסק או מנהל שיווק בישראל שמנסה להבין איך האתר שלו מדורג בגוגל ובמנועי AI, ומה לעשות עם זה',
  en: 'a small-business owner or marketer deciding how to get found in Google and in AI assistants',
  es: 'el dueño de un negocio o responsable de marketing que quiere aparecer en Google y en los asistentes de IA',
  'pt-BR': 'o dono de um negócio ou responsável por marketing no Brasil que quer aparecer no Google e nos assistentes de IA',
  fr: 'le dirigeant d\u2019une petite entreprise ou le responsable marketing en France qui veut être trouvé dans Google et dans les assistants d\u2019IA',
  it: 'il titolare di una piccola impresa o il responsabile marketing in Italia che vuole essere trovato su Google e negli assistenti di IA',
  ja: '日本で事業を営む経営者、またはマーケティングの担当者で、自社のサイトが Google と AI のアシスタントでどう見つかるかを知りたい方',
  de: 'der Inhaber eines kleinen Unternehmens oder die für das Marketing verantwortliche Person in Deutschland, die wissen will, wie das eigene Unternehmen bei Google und in den KI-Assistenten gefunden wird',
  pl: 'właściciel małej firmy albo osoba odpowiedzialna za marketing w Polsce, która chce wiedzieć, jak jej firmę znajduje się w Google i w asystentach AI',
  nl: 'de eigenaar van een klein bedrijf of de persoon die in Nederland voor de marketing verantwoordelijk is, en wil weten hoe het eigen bedrijf gevonden wordt in Google en in de AI-assistenten',
  ko: '한국에서 사업을 운영하는 대표나 마케팅 담당자로, 자기 사이트가 구글과 AI 어시스턴트에서 어떻게 검색되는지 알고 싶은 사람',
}

/**
 * What the product really does, in the generator's own working language. This
 * is the ONLY description of the system the prompt gets, so an article cannot
 * invent a feature: the limits here are the ones the marketing copy lives by.
 */
const PRODUCT_FACTS = [
  'Go Top SEO is a self-serve SEO platform for business owners. It tracks the site\'s keyword positions AUTOMATICALLY ONCE A MONTH, and a scan can be run by hand at any time.',
  'It checks whether the business is mentioned in AI answers. The automatic check covers ChatGPT, Gemini and Google AI; Perplexity, Copilot and Grok are answered for a single question on request from the menu, and are NOT part of the automatic check.',
  'It writes and publishes articles to the customer\'s own site (WordPress through the GO TOP SEO Bridge plugin, and Shopify).',
  'It finds and applies technical on-page fixes, and reports what changed.',
  'There is a free check with no account, and a seven-day free trial.',
  'NEVER state a number of customers, a success rate, a percentage, a star rating, a review count, or a promise of a ranking. We do not have those numbers and will not invent them.',
]

const GUIDANCE_INSTRUCTIONS = [
  'Write as the team that runs this platform and does this work daily. First person plural.',
  'Every section must leave the reader with something they can actually check, ask for, or compare themselves — a step to take, a thing to look at in their own site, a way to tell two options apart. An article that only explains a concept is not worth publishing.',
  'State only what the product does as described in the context. No feature, number, coverage or result beyond it.',
  'The product has one name, Go Top SEO. Never call it by any earlier name.',
  'When Shopify is mentioned, the only link is https://apps.shopify.com/go-top-seo and it carries rel="nofollow".',
  'Do not write a table of contents, a plan-price table, or a closing call-to-action block: the page adds all three around the text.',
  'Never write a bare web address in the text. Name the product and the page in words; the links are added to the body afterwards.',
  'Never write a placeholder of any kind: no TODO, TBD, FIXME, "lorem ipsum", "insert here", {{ }} or the word "placeholder" itself — not even when naming the HTML attribute, which is to be described in the article\'s own language. One of these words rejects the whole article.',
].join('\n')

const EXCLUSIONS = [
  'promises about rankings or timeframes',
  'percentages, success rates, customer counts',
  'star ratings or review counts',
  'daily or weekly automatic rank tracking',
  'structured data as a Shopify capability',
]

export const BLOG_GUIDANCE: WritingGuidance = {
  mentionBusiness: true,
  instructions: GUIDANCE_INSTRUCTIONS,
  exclusions: EXCLUSIONS,
  rules: [],
}

/** One already-published article of the same language, as a link target. */
export interface InternalLinkTarget {
  title: string
  slug: string
  /**
   * The keyword that article was written for, when we still know it — the
   * `primary_keyword` of its blog_plan row. It is the anchor text, and the
   * title is only the fallback for the eight hand-written articles that have
   * no plan row.
   */
  keyword?: string | null
}

export interface BlogBriefInput {
  locale: BlogAutoLocale
  topic: string
  primaryKeyword: string
  secondaryKeywords: string[]
  /** Published articles of the same language, newest first. */
  internalTargets: InternalLinkTarget[]
  /**
   * The gate verdict that refused the previous attempt at this same row, as
   * stored in blog_plan.last_error. Turned into [MUST AVOID] lines below.
   */
  previousFailure?: string | null
  /**
   * The sentences the gate actually refused, by failure code, as stored on the
   * plan row. The codes alone make a retry a blind re-roll: on 17 November 2026
   * the Italian article was refused three times on the same rule because the
   * brief could only say WHICH rule, never which sentence.
   */
  previousSamples?: Record<string, string> | null
}

/** `/articles/<slug>` under the language's own tree. */
export function articlePath(locale: BlogAutoLocale, slug: string): string {
  return locale === 'he' ? `/articles/${slug}` : `/${locale}/articles/${slug}`
}

/**
 * Up to three internal links to our own existing articles, none of them
 * required: a required anchor the model cannot place naturally fails the whole
 * generation, and a missing internal link is not worth losing the article over.
 *
 * THE ANCHOR IS THE TARGET'S KEYWORD, NOT ITS TITLE. Offering the full title
 * as the anchor is what produced `buying-backlinks-guide` (20 Nov 2026), where
 * the model wrote the target's whole title as a link and then wrote the same
 * subject again in its own words a line later: the page said the title twice,
 * and the anchor — the strongest signal a page can send about what another
 * page is for — carried a sentence instead of a term. A title is also a thing
 * a writer cannot drop into a sentence of their own, which is one reason these
 * anchors were being ignored.
 */
export function internalAnchors(locale: BlogAutoLocale, targets: InternalLinkTarget[]): ArticleTopicAnchor[] {
  return targets.slice(0, 3).map((t) => ({
    anchor_text: anchorTextFor(t),
    target_url: `${SITE_URL}${articlePath(locale, t.slug)}`,
    required: false,
    type: 'internal' as const,
    note: 'Link it only where it genuinely helps the reader.',
  }))
}

/**
 * The words that stand for a target article: its keyword when we have it, and
 * otherwise its title. A keyword of one word is not used — a single word is
 * either the brand or a head term too broad to say what the page answers.
 */
export function anchorTextFor(target: InternalLinkTarget): string {
  const keyword = (target.keyword ?? '').trim()
  if (!keyword) return target.title
  const spaced = keyword.split(/\s+/).length > 1
  // Japanese and Korean put no space between words, so "more than one word" is
  // never true in them and the rule above would quietly send both languages
  // back to the title. There a term of its own is recognised by its length.
  const noSpaceScript = /[\u3000-\u9fff\uac00-\ud7af]/.test(keyword)
  return spaced || (noSpaceScript && keyword.length >= 4) ? keyword : target.title
}

export function buildBlogBrief(input: BlogBriefInput): ArticleBrief {
  return {
    language: input.locale,
    topic: input.topic,
    primaryKeyword: input.primaryKeyword,
    secondaryKeywords: input.secondaryKeywords.slice(0, 8),
    searchIntent: 'informational',
    targetAudience: AUDIENCE[input.locale],
    toneOfVoice: 'professional',
    desiredWordCount: 1400,
    targetWordMin: 1200,
    targetWordMax: 1800,
    depthLabel: 'standard',
    depthKind: 'standard',
    ctaPreference: 'gentle',
    ctaText: null,
    ctaPhone: null,
    ctaWhatsApp: null,
    ctaUrl: `${SITE_URL}${authHref('signup', input.locale)}`,
    briefNotes: retryBriefNotes(input.previousFailure, input.previousSamples),
    includeBrandName: true,
    brandNameToInclude: 'Go Top SEO',
    // The page builds the table of contents from the headings itself
    // (lib/articles/headings.ts), so a second one inside the body is a duplicate.
    includeManualToc: false,
    anchors: internalAnchors(input.locale, input.internalTargets),
    plannedInternalAnchors: [],
    businessName: 'Go Top SEO',
    domain: 'gotopseo.com',
    category: 'SEO software',
    writingGuidance: BLOG_GUIDANCE,
    businessContext: { description: PRODUCT_FACTS.join(' '), city: null },
  }
}

/**
 * WHAT THE NEXT ATTEMPT IS TOLD ABOUT THE ONE THAT FAILED.
 *
 * A row gets three attempts (MAX_ATTEMPTS in lib/blog/auto/store.ts), and until
 * 7 Nov 2026 all three were the same roll of the dice: the gate's verdict was
 * written to `last_error` and read by nobody, so the brief handed to attempt two
 * was byte-for-byte the brief that had just been refused. On a topic that
 * invites a forbidden claim the model makes it again, and the row dies having
 * spent three Gemini calls to produce nothing.
 *
 * Measured on the English queue, 7 Nov 2026: "keyword tracker" (1,600/mo) was
 * refused at 05:02 UTC for `truth:tracking_cadence_claim` and again at 05:16 for
 * `truth:tracking_cadence_claim,ranking_guarantee`. A keyword whose subject IS
 * rank tracking pulls the model towards "daily rank tracking" — which is false,
 * ours runs monthly — and nothing in the second brief said so any louder than
 * the first. Three English rows ("seo" at 90,500/mo among them) are already
 * parked as failed the same way.
 *
 * So the failure codes become [MUST AVOID] lines, which the generator treats as
 * hard negative constraints (lib/content/gemini-article.ts). The sentence names
 * the rule AND the fact that replaces it, because "do not say daily" without
 * "it is monthly" leaves the model nothing to write.
 *
 * Only content failures are worth repeating back. A quota error, a cover
 * failure or a malformed JSON response says nothing about the text, and a line
 * about it would just crowd the brief.
 *
 * No line here may contain a year: a year in briefNotes is read as a year the
 * brief asked for (`collectAllowedYears`), which would let the model date the
 * article.
 */
export const RETRY_RULES: Record<string, string> = {
  percentage_claim:
    'any percentage, success rate, growth figure or "x times" result — we have no such number and may not invent one',
  customer_count_claim:
    'any count of customers, users or businesses using the platform — we publish no such number',
  tracking_cadence_claim:
    'calling the automatic position tracking daily or weekly. It runs automatically ONCE A MONTH, and a scan can be run by hand at any time. Say monthly, or say "whenever you want to, by hand"',
  rating_claim:
    'star ratings and review counts of any kind, ours or a competitor’s',
  ranking_guarantee:
    'any promise, guarantee or assurance of a ranking, a position or a place in Google. Describe what the work does, never what it will achieve',
  ai_engine_coverage_claim:
    'naming Perplexity, Copilot or Grok as part of what is checked automatically. The automatic AI check covers ChatGPT, Gemini and Google AI; the others are answered for a single question on request',
  shopify_schema_claim:
    'structured data as something the Shopify app produces or provides',
  shopify_link_not_listing:
    'any Shopify link other than https://apps.shopify.com/go-top-seo',
  shopify_link_not_nofollow:
    'a Shopify link without rel="nofollow"',
  placeholder_found:
    'every placeholder marker, including the word "placeholder" itself even when describing the HTML attribute — name the attribute in this article’s own language instead',
  content_too_short:
    'stopping short: the article was refused as too thin, so write the full length the brief asks for',
  brand_not_mentioned:
    'leaving Go Top SEO unnamed: name it at least once, where it genuinely helps the reader',
  no_link_to_product:
    'ending with no way for the reader to act: the conclusion must name Go Top SEO as the next step',
}

/**
 * The [MUST AVOID] lines for a `last_error` such as
 * `truth:tracking_cadence_claim,ranking_guarantee`. Unknown or non-content
 * codes produce nothing. Pure.
 */
export function retryAvoidances(lastError: string | null | undefined): string[] {
  if (!lastError) return []
  // The stored reason may carry the refused sentences after a marker; the rules
  // are read from the codes alone (lib/blog/auto/truth-limits.ts).
  const codes = decodeGateReason(lastError).codes.split(':').slice(1).join(':').split(',')
  const out: string[] = []
  for (const raw of codes) {
    const rule = RETRY_RULES[raw.trim()]
    if (rule && !out.includes(rule)) out.push(rule)
  }
  return out
}

/**
 * The brief note that carries them, or null when there is nothing to say.
 *
 * When the refusal kept the sentence it refused, that sentence is quoted under
 * its rule. A model told only "do not claim automatic coverage of Perplexity"
 * rewrites the same thought a different way; a model shown the sentence can see
 * what it did. The quote is the article's own earlier text, nothing external.
 */
export function retryBriefNotes(
  lastError: string | null | undefined, samples?: Record<string, string> | null,
): string | null {
  const avoid = retryAvoidances(lastError)
  if (avoid.length === 0) return null
  const quoted: string[] = []
  const found = samples ?? decodeGateReason(lastError).samples
  for (const [code, sentence] of Object.entries(found)) {
    const rule = RETRY_RULES[code]
    if (rule && avoid.includes(rule) && sentence.trim()) {
      quoted.push(`[THE SENTENCE THAT WAS REFUSED] ${sentence.replace(/\s+/g, ' ').trim().slice(0, 200)}`)
    }
  }
  return [
    'A previous attempt at this exact article was REFUSED before publication and thrown away. It broke the rules below. Write the article again without them.',
    ...avoid.map((a) => `[MUST AVOID] ${a}`),
    ...quoted,
  ].join('\n')
}
