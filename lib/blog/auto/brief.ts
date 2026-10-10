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

export const SITE_URL = 'https://www.gotopseo.com'

/** The byline, and therefore the author box and the Person in the JSON-LD. */
export const BLOG_AUTHOR = 'אורן חכם'

/** Words the article is written for, per language. */
const AUDIENCE: Record<BlogAutoLocale, string> = {
  he: 'בעל עסק או מנהל שיווק בישראל שמנסה להבין איך האתר שלו מדורג בגוגל ובמנועי AI, ומה לעשות עם זה',
  en: 'a small-business owner or marketer deciding how to get found in Google and in AI assistants',
  es: 'el dueño de un negocio o responsable de marketing que quiere aparecer en Google y en los asistentes de IA',
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
}

export interface BlogBriefInput {
  locale: BlogAutoLocale
  topic: string
  primaryKeyword: string
  secondaryKeywords: string[]
  /** Published articles of the same language, newest first. */
  internalTargets: InternalLinkTarget[]
}

/** `/articles/<slug>` under the language's own tree. */
export function articlePath(locale: BlogAutoLocale, slug: string): string {
  return locale === 'he' ? `/articles/${slug}` : `/${locale}/articles/${slug}`
}

/**
 * Up to three internal links to our own existing articles, none of them
 * required: a required anchor the model cannot place naturally fails the whole
 * generation, and a missing internal link is not worth losing the article over.
 */
export function internalAnchors(locale: BlogAutoLocale, targets: InternalLinkTarget[]): ArticleTopicAnchor[] {
  return targets.slice(0, 3).map((t) => ({
    anchor_text: t.title,
    target_url: `${SITE_URL}${articlePath(locale, t.slug)}`,
    required: false,
    type: 'internal' as const,
    note: 'Link it only where it genuinely helps the reader.',
  }))
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
    briefNotes: null,
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
