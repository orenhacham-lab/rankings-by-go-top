/**
 * PRODUCT AND BRAND NAMES, IN THE CASE A READER EXPECTS.
 *
 * The German article published on 5 Nov 2026 was titled, in its <h1>, "google
 * search console: Ihr Leitfaden für bessere Sichtbarkeit bei google" — 102
 * occurrences of "google search console" on the page and not one of "Google
 * Search Console". It reads as machine output, which is the one thing an
 * article under Oren's name and photograph cannot do.
 *
 * TWO things produced it, and the second is the reason a prompt line alone
 * would not have fixed it:
 *   1. the brief quotes the keyword as Keyword Planner returns it, and Google's
 *      API returns every keyword lower-cased, so the model is copying what it
 *      was handed;
 *   2. `buildCasingTerms` (lib/content/gemini-article.ts) then builds its
 *      case-restoring rules FROM that same keyword, so a model that did write
 *      "Google Search Console" had it rewritten back down to lower case. The
 *      pass that exists to restore brand casing was destroying it.
 *
 * So the keyword's own casing is repaired before it is quoted in the prompt and
 * before it seeds those rules, and this pass runs last over every text field of
 * the article. A prompt is a request; a deterministic pass is the guarantee.
 *
 * WHAT IS IN THE TABLE, AND WHAT IS DELIBERATELY NOT. A term is only safe here
 * when its lower-case form is not an ordinary word in any language the app
 * writes in (he, en, es, pt-BR, fr, it, de, ja). That rules out several names
 * we do use in articles, and each exclusion is listed below with its reason —
 * uppercasing a real word mid-sentence is a worse defect than the one being
 * fixed, because it corrupts prose instead of a title.
 *
 * Pure: a string in, a string out, so the whole thing is exercisable in QA
 * (lib/content/__qa__/canonical-case.qa.ts).
 */

import { textRuns, tokenizeHtml } from '@/lib/articles/bare-urls'

/**
 * The canonical spelling of every name worth repairing, longest first at build
 * time so a multi-word name wins over its own first word ("Google Search
 * Console" before "Google").
 */
export const CANONICAL_TERMS: readonly string[] = [
  // Our own product.
  'Go Top SEO',
  // Google's surfaces. Bare "Analytics", "Ads", "Maps", "Trends" and "Console"
  // are NOT here: each is an ordinary word on its own.
  'Google Search Console', 'Search Console', 'Google Analytics 4', 'Google Analytics',
  'Google Tag Manager', 'Tag Manager', 'Google Business Profile', 'Google My Business',
  'Google Ads', 'Google Maps', 'Google Trends', 'Google Discover', 'Keyword Planner',
  'PageSpeed Insights', 'Looker Studio', 'Googlebot', 'Google', 'YouTube', 'Android',
  // Answer engines and the models people name in our articles.
  'ChatGPT', 'OpenAI', 'Gemini', 'Claude', 'Copilot', 'Perplexity',
  'Microsoft', 'Bing', 'DuckDuckGo', 'Yandex', 'Baidu', 'Naver',
  // Site platforms and plugins.
  'WordPress', 'WooCommerce', 'Shopify', 'Wix', 'Squarespace', 'Webflow',
  'Magento', 'Joomla', 'Drupal', 'Elementor', 'Yoast', 'Rank Math',
  // SEO tooling.
  'Semrush', 'Ahrefs', 'Moz', 'Screaming Frog', 'Sistrix', 'Ubersuggest',
  // Social networks.
  'Facebook', 'Instagram', 'LinkedIn', 'TikTok', 'WhatsApp', 'Pinterest', 'Reddit',
  // The technical vocabulary an SEO article is written in.
  'Core Web Vitals', 'Largest Contentful Paint', 'Cumulative Layout Shift',
  'Interaction to Next Paint', 'Schema.org', 'JSON-LD',
  // 'HTTP' and 'HTTPS' are NOT here: they are the scheme of a URL far more often
  // than a word in prose, and uppercasing one turns a working link into HTTPS://.
  'JavaScript', 'HTML', 'CSS', 'PHP', 'XML',
  'SEO', 'SERPs', 'SERP', 'URLs', 'URL', 'CMS', 'CTR', 'API', 'GA4', 'PPC', 'UX',
  'LCP', 'CLS', 'INP', 'iPhone', 'iOS', 'iPad', 'macOS',
]

/**
 * NAMES LEFT OUT ON PURPOSE, because their lower-case form is a real word in a
 * language we publish in. Exported so the QA suite can assert they stay out:
 * a later hand adding one of these would quietly corrupt prose.
 *
 *   AI      — "ai" is Italian ("ai bambini") and Portuguese.
 *   SEM     — "sem" is Portuguese for "without", in almost every article.
 *   ROI     — "roi" is French for "king".
 *   IA      — the Romance translation of AI, and a syllable besides.
 *   UI      — "ui" is a German interjection.
 *   Chrome  — "chrome" is an English and French word.
 *   Apple   — "apple" is an English word.
 *   Windows — "windows" is an English word.
 *   Lighthouse, Majestic, Discover, Analytics, Ads, Maps, Trends, Console —
 *             ordinary words that happen to also name a product.
 */
export const DELIBERATELY_EXCLUDED: readonly string[] = [
  'AI', 'SEM', 'ROI', 'IA', 'UI', 'Chrome', 'Apple', 'Windows',
  'Lighthouse', 'Majestic', 'Discover', 'Analytics', 'Ads', 'Maps', 'Trends', 'Console',
]

function escapeRegExp(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

/**
 * The guards matter more than the terms.
 *
 * Left: no letter, digit, underscore, slash, dot, hyphen or query-string
 * character (= & # ? %) before the term, so
 * "www.google.com", "/de/articles/google-search-console-leitfaden" and
 * "pre-seo" are all left alone — a URL sits in these very fields (the CTA link
 * is written into the direct answer), and uppercasing inside a path breaks it.
 *
 * Right: the same, except two allowances — a dot when nothing word-like
 * follows it, so "bei google." at the end of a sentence is repaired while
 * "google.com" and "sitemap.xml" are not; and a hyphen, so the German compound
 * "seo-leistung" becomes "SEO-leistung". A hyphen is still forbidden on the
 * LEFT, which is what keeps a slug such as
 * "/de/articles/google-search-console-leitfaden" intact: its first word is
 * preceded by a slash and every later word by a hyphen.
 *
 * Inner spaces match any run of whitespace, so a name broken across a line
 * still matches and comes back with one space.
 */
function ruleFor(term: string): RegExp {
  const body = escapeRegExp(term).replace(/ /g, '\\s+')
  return new RegExp(`(?<![\\p{L}\\p{N}_/@.=&#?%-])${body}(?![\\p{L}\\p{N}_/@])(?!\\.[\\p{L}\\p{N}])`, 'giu')
}

const RULES: readonly { re: RegExp; term: string }[] = [...CANONICAL_TERMS]
  .sort((a, b) => b.length - a.length)
  .map((term) => ({ re: ruleFor(term), term }))

/** Rewrite every known product name to its canonical case. Idempotent. */
export function canonicalizeKnownTerms(text: string): string {
  if (!text) return text
  let out = text
  for (const { re, term } of RULES) out = out.replace(re, term)
  return out
}

/**
 * A HEADING DOES NOT START IN LOWER CASE.
 *
 * Applied to the fields a reader sees as a headline — title, metaTitle,
 * headings, FAQ questions — after the table above has run, so "google search
 * console: Ihr Leitfaden" is already "Google Search Console: ..." and this only
 * catches a keyword with no product name in it ("rank tracking für einsteiger").
 *
 * Script-driven, not language-driven: Hebrew and Japanese have no case, so
 * toUpperCase is a no-op there and no language list can rot. A name that starts
 * lower case on purpose is left alone — "iPhone", "eBay", "iOS" — recognised by
 * the capital in its second character.
 */
export function capitalizeHeadline(text: string): string {
  const s = text || ''
  const i = s.search(/\p{L}/u)
  if (i < 0) return s
  const first = s[i]
  if (!/\p{Ll}/u.test(first) || !/\p{Script=Latin}/u.test(first)) return s
  if (/\p{Lu}/u.test(s[i + 1] || '')) return s // iPhone, eBay
  const up = first.toUpperCase()
  if (up === first) return s
  return s.slice(0, i) + up + s.slice(i + 1)
}

/** Both passes, for a field that is a headline. */
export function canonicalizeHeadline(text: string): string {
  return capitalizeHeadline(canonicalizeKnownTerms(text))
}

/**
 * THE SAME REPAIR, ON RENDER, FOR THE ARTICLES ALREADY PUBLISHED.
 *
 * The generation fix only helps the next article. Eight articles a day are
 * already on the blog with the lower-cased keyword in their title, their H1 and
 * every H2, and rewriting stored rows is a production data change we do not
 * make for a cosmetic defect. So the public reader runs this pass over the body
 * on render, exactly as the bare-URL linkifier does
 * (lib/articles/bare-urls.ts), and every page is fixed with no write at all.
 *
 * Text only: a tag and an attribute are never touched, `<code>`/`<pre>` are left
 * exactly as written, and a heading's FIRST text run also gets the initial
 * capital.
 */
const SKIP_INSIDE_HTML = new Set(['code', 'pre'])
const HEADING_TAG = /^h[1-6]$/

export function canonicalizeArticleHtml(html: string): string {
  if (!html) return html
  const tokens = tokenizeHtml(html)
  // Runs arrive in document order, so one flag is enough to tell the FIRST text
  // of a heading from the rest of it: without that, "<h2>wie <strong>google</strong>"
  // would take its capital in the middle of the heading.
  let headlineDone = false
  for (const run of textRuns(tokens)) {
    if (run.stack.some((tag) => SKIP_INSIDE_HTML.has(tag))) continue
    const inHeading = run.stack.some((tag) => HEADING_TAG.test(tag))
    if (!inHeading) headlineDone = false
    const opensHeading = inHeading && !headlineDone && /\p{L}/u.test(run.text)
    if (opensHeading) headlineDone = true
    const next = opensHeading ? canonicalizeHeadline(run.text) : canonicalizeKnownTerms(run.text)
    if (next !== run.text) tokens[run.token] = next
  }
  return tokens.join('')
}
