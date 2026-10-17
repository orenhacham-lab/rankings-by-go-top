/**
 * WHAT AN AUTO-WRITTEN ARTICLE ON OUR OWN BLOG MAY NOT CLAIM.
 *
 * The generator is told the limits in its prompt, but a prompt is a request.
 * This is the check that actually stops an article: it runs on the generated
 * text before anything is published, and a failure means the article is not
 * published at all. A day without an article is cheaper than a sentence we
 * cannot stand behind.
 *
 * The limits are the ones that hold for this product:
 *   * no percentages and no customer counts — we have neither to show;
 *   * automatic rank tracking is MONTHLY (a scan can be run by hand any time),
 *     so "daily" or "weekly" tracking is not a thing we do;
 *   * the automatic AI check covers ChatGPT, Gemini and Google AI. Perplexity,
 *     Copilot and Grok are answered per question from the menu, so naming them
 *     as part of what runs automatically is false;
 *   * no invented ratings or review counts (the star schema was removed from
 *     the site in f2e9792 precisely because it was not real);
 *   * no promise of a ranking;
 *   * every Shopify mention links the App Store listing with rel="nofollow",
 *     and the Shopify app does not promise structured data.
 *
 * Deterministic and pure: the same text always gets the same verdict, and the
 * failures are codes, not prose, because they are read in a log and by a guard.
 */

export interface TruthLimitInput {
  title: string
  metaDescription: string
  html: string
}

export interface TruthLimitResult {
  ok: boolean
  failures: string[]
}

/** Tags out, entities to spaces, whitespace collapsed. */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Sentence-ish units, so "same sentence" rules do not reach across a paragraph. */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?׃:;•])\s+|\s*\|\s*/).filter(Boolean)
}

const PERCENT = /\d[\d.,]*\s*(%|אחוז(?:ים)?|percent|por\s?ciento)/i
const COUNT_AFTER = /\d[\d.,]*\s*\+?\s*(לקוחות|מנויים|עסקים|customers|clients|subscribers|businesses|clientes|suscriptores|negocios)/i
const COUNT_BEFORE = /(לקוחות|מנויים|customers|clients|clientes)\s*[:–-]?\s*\d/i
const CADENCE = /(מעקב|בדיקה|סריקה)\s+(יומי|יומית|שבועי|שבועית)|(daily|weekly)\s+(tracking|rank\s*check|scan)|seguimiento\s+(diario|semanal)/i
const OTHER_ENGINES = /perplexity|copilot|grok/i
const AUTOMATIC = /אוטומט|automatic|automátic|automatically/i
const RATING = /\d(?:[.,]\d)?\s*(כוכבים|כוכב|stars?|estrellas?)|(ביקורות|reviews|reseñas)\s*\d|\d[\d.,]*\s*(ביקורות|reviews|reseñas)/i
const GUARANTEE = /מובטח|מבטיח(?:ים|ה)?\s+(מקום|דירוג|עלייה)|guarantee[ds]?\s+(ranking|position|results)|garantiza(?:mos|do)?\s+(posición|resultados)/i
const SCHEMA_WORD = /schema|json-?ld|סכימה|נתונים מובנים|datos estructurados/i
const SHOPIFY = /shopify/i

const APP_STORE_HREF = 'apps.shopify.com/go-top-seo'
/** `<a …>` openers, so rel/href can be read per link. */
const ANCHOR = /<a\b[^>]*>/gi
const ATTR = (name: string, tag: string): string => {
  const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag)
  return m ? m[1] : ''
}

export function checkTruthLimits(input: TruthLimitInput): TruthLimitResult {
  const failures: string[] = []
  const body = plainText(input.html)
  const all = [input.title, input.metaDescription, body].join(' | ')

  if (PERCENT.test(all)) failures.push('percentage_claim')
  if (COUNT_AFTER.test(all) || COUNT_BEFORE.test(all)) failures.push('customer_count_claim')
  if (CADENCE.test(all)) failures.push('tracking_cadence_claim')
  if (RATING.test(all)) failures.push('rating_claim')
  if (GUARANTEE.test(all)) failures.push('ranking_guarantee')

  for (const sentence of sentences(all)) {
    if (OTHER_ENGINES.test(sentence) && AUTOMATIC.test(sentence)) {
      failures.push('ai_engine_coverage_claim')
      break
    }
  }
  for (const sentence of sentences(all)) {
    if (SHOPIFY.test(sentence) && SCHEMA_WORD.test(sentence)) {
      failures.push('shopify_schema_claim')
      break
    }
  }

  // Shopify links: the App Store listing, and nofollow on every one of them.
  for (const tag of input.html.match(ANCHOR) ?? []) {
    const href = ATTR('href', tag)
    if (!/shopify\.com/i.test(href)) continue
    if (!href.includes(APP_STORE_HREF)) failures.push('shopify_link_not_listing')
    if (!/\bnofollow\b/i.test(ATTR('rel', tag))) failures.push('shopify_link_not_nofollow')
  }

  return { ok: failures.length === 0, failures: [...new Set(failures)] }
}
