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
 * EVERY LANGUAGE THE BLOG WRITES IN, since 7 Nov 2026. Until then the word
 * lists held Hebrew, English, Spanish and Portuguese only, which is how the
 * check came to cover four of ten languages: French, Italian, Japanese, German,
 * Dutch and Polish passed a guaranteed ranking, an invented star rating, a
 * customer count and a daily-tracking claim untouched, because nothing in the
 * patterns was written in those languages. The gap widened with every locale
 * and no test could fail, since a guard that asks "is this sentence refused"
 * needs a sentence in that language to ask about. The per-language cases live
 * in lib/blog/auto/__qa__/truth-limits-languages.qa.ts.
 *
 * SCOPE IS NARROW ON PURPOSE. The cadence rule names what WE do automatically
 * (rank tracking, a scan), never what a reader might do by hand: two articles
 * already published, the French Search Console guide and the Italian one, call
 * a weekly look at Search Console a good habit, and a rule that read
 * "vérification hebdomadaire" or "controllo settimanale" as a product claim
 * would have refused both. The English rule has always been this narrow
 * ("daily tracking", not "daily analysis"); the other languages now match it.
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

const PERCENT = /\d[\d.,]*\s*(%|אחוז(?:ים)?|percent|por\s?ciento|por\s?cento|pour\s?cent|pourcent|per\s?cento|prozent|procent|パーセント)/i
const COUNT_AFTER = /\d[\d.,]*\s*\+?\s*(לקוחות|מנויים|עסקים|customers|clients|subscribers|businesses|clientes|suscriptores|negocios|assinantes|empresas|neg[óo]cios|abonn[ée]s|entreprises|clienti|abbonati|aziende|imprese|kunden|abonnenten|unternehmen|firmen|klanten|abonnees|bedrijven|klient(?:ów|y|ami)|klienci|abonent(?:ów|i)|firm(?:y|ę)?|przedsi[ęe]biorstw(?:a|)|顧客|ユーザー|企業|社)/i
const COUNT_BEFORE = /(לקוחות|מנויים|customers|clients|clientes|clienti|kunden|klanten|klienci|顧客)\s*[:–-]?\s*\d/i
const CADENCE = /(מעקב|בדיקה|סריקה)\s+(יומי|יומית|שבועי|שבועית)|(daily|weekly)\s+(tracking|rank\s*check|scan)|seguimiento\s+(diario|semanal)|(acompanhamento|monitoramento|verifica[çc][ãa]o|varredura)\s+(di[áa]ri[ao]|semanal)|(suivi|scan)\s+(?:de\s+positionnement\s+)?(quotidien(?:ne)?|hebdomadaire)|(monitoraggio|scansione)\s+(?:del\s+posizionamento\s+)?(giornalier[oa]|settimanale)|(t[äa]glich(?:e|es|er|en)?|w[öo]chentlich(?:e|es|er|en)?)\s+([ÜU]berwachung|Tracking|Ranking|Scan|Rangverfolgung)|(dagelijkse?|wekelijkse?)\s+(monitoring|tracking|scan)|(codzienne?|cotygodniowe?|codzienny|cotygodniowy)\s+(monitorowanie|[śs]ledzenie|skanowanie)|(毎日|毎週|日次|週次)[^。]{0,8}(追跡|計測|スキャン|順位)/i
const OTHER_ENGINES = /perplexity|copilot|grok/i
const AUTOMATIC = /אוטומט|automatic|automátic|automatically|automatis|automatiqu|automatyczn|自動/i
const RATING_WORDS = '(?:ביקורות|reviews|rese\u00f1as|avalia[\u00e7c][\u00f5o]es|avis|recensioni|bewertungen|rezensionen|beoordelingen|opinii|opinie|recenzji|\u30ec\u30d3\u30e5\u30fc|\u8a55\u4fa1|\u53e3\u30b3\u30df)'
const RATING = new RegExp(
  // "4.8 stars", in every language the app writes in.
  `\\d(?:[.,]\\d)?\\s*(?:כוכבים|כוכב|stars?|estrellas?|estrelas?|[ée]toiles?|stelle|sterne|sterren|gwiazdek|gwiazdki|つ星|星)`
  // "120 reviews" and "reviews: 120".
  + `|${RATING_WORDS}\\s*\\d|\\d[\\d.,]*\\s*${RATING_WORDS}`
  // Japanese writes the score AFTER the word and counts with a classifier:
  // "星4.8" and "120件のレビュー", neither of which the two shapes above reach.
  + `|星\\s*\\d(?:[.,]\\d)?|\\d[\\d.,]*\\s*件の?\\s*${RATING_WORDS}`,
  'i')
/**
 * A PROMISE OF A RANKING, IN ANY LANGUAGE AND WITH THE ARTICLE IN BETWEEN.
 *
 * The verb and the noun are rarely adjacent: "guarantee A ranking", "garantimos
 * A posição", "garantissons LA PREMIÈRE position", "garantieren DEN ERSTEN
 * Platz". The English and Portuguese patterns demanded adjacency and therefore
 * missed their own languages' most natural phrasing, which is why this is built
 * from two lists with room for up to two words between them rather than written
 * out by hand per language.
 */
const GUARANTEE_VERBS = '(?:guarantee[ds]?|garantiza(?:mos|do)?|garant(?:imos|ido|ia|e)|garant(?:it|ie|issons)|garan(?:tiamo|tito|zia)|garantier(?:t|te|en)|Garantie|gegarandeerde?|garanderen|gwarantujemy|gwarancj[aąęi]|gwarantowan\\w*)'
const GUARANTEE_NOUNS = '(?:rankings?|positions?|results|posici[óo]n|resultados|posi[çc][ãa]o|classement|r[ée]sultats|posizion\\w*|risultati|Platz\\w*|Ergebnisse|positie|resultaten|pozycj\\w*|wynik\\w*|miejsc\\w*|dziesi[ąa]tce)'
const GUARANTEE = new RegExp(
  // Hebrew, where the promise is one word or a verb with its object.
  'מובטח|מבטיח(?:ים|ה)?\\s+(?:מקום|דירוג|עלייה)'
  // Every other language: the verb, then at most two words, then the noun.
  + `|${GUARANTEE_VERBS}\\s+(?:\\S+\\s+){0,2}${GUARANTEE_NOUNS}`
  // Japanese puts the promise last: "検索順位を保証します".
  + '|(?:順位|掲載|上位)[^。]{0,6}保証',
  'i')
const SCHEMA_WORD = /schema|json-?ld|סכימה|נתונים מובנים|datos estructurados|dados estruturados|donn[ée]es structur[ée]es|dati strutturati|strukturierte\w*\s+Daten|gestructureerde\s+(?:data|gegevens)|dane\s+strukturalne|構造化データ/i
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
