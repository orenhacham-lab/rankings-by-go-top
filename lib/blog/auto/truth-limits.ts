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
  /**
   * WHY A REFUSAL CARRIES THE SENTENCE IT REFUSED.
   *
   * On 17 November 2026 the Italian article was refused three times on
   * `truth:ai_engine_coverage_claim` and the window closed with nothing
   * published, exactly as Polish had the day before. Nothing could be said about
   * WHY: the row keeps the rule's name, the draft is thrown away, and Vercel
   * Hobby holds one hour of logs, so by the time anyone looks the sentence is
   * gone. A refusal that keeps no sample is an undiagnosable refusal.
   *
   * So each failure carries the first sentence that tripped it, collapsed and cut
   * to 160 characters. It is OUR OWN generated text, never a provider's answer,
   * and it is stored on the plan row and fed back into the retry brief — which is
   * what lets a retry fix the actual sentence instead of re-rolling blind.
   */
  samples: Record<string, string>
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
  return text.split(/(?<=[.!?׃:;•])\s+|(?<=[。！？])\s*|\s*\|\s*/).filter(Boolean)
}

/**
 * A SCALE IS NOT A RESULT. "Organic Difficulty score (0-100%)" in a table about a
 * competitor's keyword tool describes the range of a metric, not a gain we claim
 * (measured 24 Nov 2026: the English "semrush keyword planner" row was refused
 * three times on it and parked). Only the exact "0-100%" shape is read as a scale.
 */
const PERCENT_SCALE = /\b0\s*(?:[-–]|to|bis|a|à|de)\s*100\s*(?:%|percent|prozent|por\s?ciento|pour\s?cent)/gi
const withoutPercentScale = (text: string): string => text.replace(PERCENT_SCALE, ' ')
const PERCENT = /\d[\d.,]*\s*(%|אחוז(?:ים)?|percent|por\s?ciento|por\s?cento|pour\s?cent|pourcent|per\s?cento|prozent|procent|パーセント)/i
const COUNT_AFTER = /\d[\d.,]*\s*\+?\s*(לקוחות|מנויים|עסקים|customers|clients|subscribers|businesses|clientes|suscriptores|negocios|assinantes|empresas|neg[óo]cios|abonn[ée]s|entreprises|clienti|abbonati|aziende|imprese|kunden|abonnenten|unternehmen|firmen|klanten|abonnees|bedrijven|klient(?:ów|y|ami)|klienci|abonent(?:ów|i)|firm(?:y|ę)?|przedsi[ęe]biorstw(?:a|)|顧客|ユーザー|企業|社)/i
const COUNT_BEFORE = /(לקוחות|מנויים|customers|clients|clientes|clienti|kunden|klanten|klienci|顧客)\s*[:–-]?\s*\d/i
const CADENCE = /(מעקב|בדיקה|סריקה)\s+(יומי|יומית|שבועי|שבועית)|(daily|weekly)\s+(tracking|rank\s*check|scan)|seguimiento\s+(diario|semanal)|(acompanhamento|monitoramento|verifica[çc][ãa]o|varredura)\s+(di[áa]ri[ao]|semanal)|(suivi|scan)\s+(?:de\s+positionnement\s+)?(quotidien(?:ne)?|hebdomadaire)|(monitoraggio|scansione)\s+(?:del\s+posizionamento\s+)?(giornalier[oa]|settimanale)|(t[äa]glich(?:e|es|er|en)?|w[öo]chentlich(?:e|es|er|en)?)\s+([ÜU]berwachung|Tracking|Ranking|Scan|Rangverfolgung)|(dagelijkse?|wekelijkse?)\s+(monitoring|tracking|scan)|(codzienne?|cotygodniowe?|codzienny|cotygodniowy)\s+(monitorowanie|[śs]ledzenie|skanowanie)|(毎日|毎週|日次|週次)[^。]{0,8}(追跡|計測|スキャン|順位)/i
/**
 * DAILY OR WEEKLY TRACKING OF THE READER'S AD SPEND IS NOT A CLAIM ABOUT OURS.
 *
 * Measured 22 November 2026: the Hebrew row "בדיקת מילות מפתח" was refused three
 * times and parked as failed, on a sentence that advised the reader to do
 * "מעקב יומי או שבועי אחר תקציב ועלות לקליק" — to watch their own advertising
 * budget and cost per click. Nothing in it says how often WE track anything.
 * The rule exists because the automatic position tracking runs monthly; a
 * sentence whose object is a budget or a cost per click is about something else.
 * Only that exact shape is exempt: the cadence word must be followed by "אחר"
 * and a money word, so "מעקב יומי אחר מיקומים" still refuses.
 */
const AD_SPEND_CADENCE = /(?:מעקב|בדיקה|סריקה)\s+(?:יומי|יומית|שבועי|שבועית)(?:\s+או\s+(?:יומי|יומית|שבועי|שבועית))?\s+אחר\s+(?:ה)?(?:תקציב|עלות|עלויות|הוצאות|הוצאה|קליקים|קליק)/g
const withoutAdSpendCadence = (text: string): string => text.replace(AD_SPEND_CADENCE, ' ')
/**
 * "DAILY CHECKS ARE NOT NEEDED" IS NOT "OUR CHECKS ARE DAILY".
 *
 * Measured 23 November 2026: the Japanese row "seo チェック ツール 無料" was
 * refused at attempt 2 on an answer to "should I check my ranking every day?" —
 * daily checks breed needless worry, a monthly measurement is usually enough.
 * That sentence says the opposite of the claim the rule guards, and it is the
 * advice our own retry brief asks the model to give. A sentence that names a
 * daily or weekly cadence and, in the same breath, says it is unnecessary is
 * advice about the reader's habit, not a statement about our product.
 *
 * Only a plain "not needed" word exempts it. "Sufficient" and "enough" do not:
 * "our daily tracking is enough" is exactly the claim.
 */
const CADENCE_NOT_NEEDED = /not\s+(?:necessary|needed|required|worth)|unnecessary|no\s+need|(?:don'?t|doesn'?t|do\s+not|does\s+not)\s+need|לא\s+צריך|אין\s+צורך|אין\s+טעם|מיותר|לא\s+נחוץ|no\s+es\s+necesari[oa]|innecesari|no\s+hace\s+falta|no\s+necesitas|n[ãa]o\s+[ée]\s+necess[áa]ri[oa]|desnecess[áa]ri|n[ãa]o\s+precisa|pas\s+n[ée]cessaire|inutile|pas\s+besoin|non\s+[èe]\s+necessari[oa]|non\s+serve|nicht\s+(?:n[öo]tig|notwendig|erforderlich)|unn[öo]tig|niet\s+(?:nodig|noodzakelijk)|onnodig|nie\s+jest\s+konieczn|niepotrzebn|zb[ęe]dn|不要|必要(?:は|が)?(?:あり|な)|필요(?:가)?\s*없|불필요/i
const OTHER_ENGINES = /perplexity|copilot|grok/i
/**
 * HOW AN HONEST ARTICLE ACTUALLY DRAWS THE LINE.
 *
 * Measured on 18 and 19 November 2026, after the negation reading shipped: the
 * Italian queue lost its day again and the Spanish one lost the next, both on
 * `ai_engine_coverage_claim`, and this time the stored sentence said why. Neither
 * article denied anything. They CONTRASTED:
 *
 *   it  "...nelle sintesi di ChatGPT, Gemini e Google AI ... mentre Perplexity
 *        ... su richiesta"
 *   es  "verificamos de forma automática si un negocio es mencionado en ChatGPT,
 *        Gemini y Google AI, ofreciendo además consultas individuales bajo demanda"
 *
 * That is the true sentence, and the accurate one: the three engines run
 * automatically, the others are answered per question on request. A writer says
 * that with "on request", "bajo demanda", "su richiesta", "auf Anfrage" — not
 * with "not". A negation list can never reach it, so the exemption has to name
 * the contrast itself.
 */
const ON_DEMAND = /on\s+demand|on\s+request|per\s+request|upon\s+request|separately|manually|bajo\s+(?:demanda|petici[óo]n)|a\s+demanda|por\s+separado|manualmente|sob\s+demanda|a\s+pedido|por\s+solicita[çc][ãa]o|[àa]\s+la\s+demande|sur\s+demande|s[ée]par[ée]ment|manuellement|su\s+richiesta|a\s+richiesta|separatamente|auf\s+(?:anfrage|wunsch)|einzeln|manuell|op\s+(?:aanvraag|verzoek)|afzonderlijk|handmatig|na\s+[żz][ąa]danie|na\s+[żz]yczenie|osobno|r[ęe]cznie|לפי דרישה|על פי בקשה|בנפרד|ידנית|リクエスト|都度|個別/i
/**
 * THE THIRD SHAPE, measured 21 November 2026 on the English article:
 *
 *   "...automatically, while offering SINGLE-QUESTION CHECKS for Perplexity,
 *    Copilot, and Grok from our menu."
 *
 * Nothing is denied and nothing is "on request": the line is drawn by HOW MUCH
 * is covered — one question at a time rather than a standing automatic check.
 * It was the shape predicted when ON_DEMAND shipped, and it cost the English
 * locale its day.
 */
const PER_QUESTION = /single[-\s](?:question|quer(?:y|ies)|prompt)|one[-\s]off|per[-\s](?:question|quer(?:y|ies)|prompt)|question[-\s]by[-\s]question|one\s+question\s+at\s+a\s+time|individual\s+(?:check|checks|quer|question)|consultas?\s+individual|verifiche?\s+singol|einzelabfrage|einzelne\s+abfrage|afzonderlijke\s+vraag|pojedyncz|requ[êe]tes?\s+ponctuelle|ponctuel|בדיק(?:ה|ות)\s+בודד|שאל(?:ה|ות)\s+בודד|単発|都度|specifieke\s+vra|losse\s+vra|(?:via|from|through)\s+(?:the|our)\s+menu|via\s+het\s+menu|z\s+(?:poziomu\s+)?menu|desde\s+el\s+men[úu]|depuis\s+le\s+menu|dal\s+menu|(?:[üu]ber|im)\s+(?:das\s+)?men[üu]|pelo\s+menu|בתפריט|מהתפריט/i
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
  // Every other language: the verb, then at most three words, then the noun.
  // Three, not two: "guarantee you the first position" and "garantimos a você a
  // primeira posição" put an indirect object before the article and the
  // ordinal, and a two-word gap walks straight past the promise.
  + `|${GUARANTEE_VERBS}\\s+(?:\\S+\\s+){0,3}${GUARANTEE_NOUNS}`
  // Japanese puts the promise last: "検索順位を保証します".
  + '|(?:順位|掲載|上位)[^。]{0,6}保証',
  'i')
/** The same pattern, global, so every promise in a sentence can be judged on its own. */
const GUARANTEE_G = new RegExp(GUARANTEE.source, 'gi')

/**
 * DENYING A PROMISE IS NOT MAKING ONE.
 *
 * The pattern above asks only whether the words of a promise appear, so until
 * 16 November 2026 it refused the sentence that says the opposite — "no agency
 * can guarantee rankings", "Żadna agencja nie da gwarancji pozycji",
 * "אף אחד לא יכול להבטיח מקום ראשון". Measured that day: the Polish blog queue
 * was the only one of eleven locales that published nothing, after five
 * attempts refused on `truth:ranking_guarantee` inside the morning window. Every
 * Polish topic in the plan is a `pozycjonowanie` keyword — ranking work — and
 * an honest article on ranking work almost has to say that rankings cannot be
 * promised. The guard was therefore refusing the very sentence it exists to
 * get written.
 *
 * So a match is ignored when a negation sits beside it IN ITS OWN SENTENCE: up
 * to 40 characters before (every language that negates ahead of the verb) or 14
 * after (Japanese, which negates the verb's ending: 保証しません). Sentence-bounded
 * and per-match, so "no agency guarantees rankings. We guarantee first place."
 * still fails on its second sentence, and "we don't just guarantee rankings, we
 * guarantee results" still fails on its second claim.
 */
const NEGATION_BEFORE = /\b(?:no|not|never|cannot|can'?t|without|nobody|no\s+one|nor|nunca|sin|nadie|ning[úu]n(?:a|o)?|n[ãa]o|sem|ningu[ée]m|nenhum(?:a)?|ne|pas|jamais|sans|personne|aucun(?:e)?|non|mai|senza|nessun(?:a|o)?|kein(?:e|en|er|em)?|nicht|nie|ohne|niemand|geen|niet|nooit|zonder|nigdy|bez|[żz]ad(?:na|en|nej|nego)|nikt)\b|\bnie\b|לא|אין|אינ|אף|בלי|ללא|בלתי/i
// Japanese negates the verb's ending, and the polite negative is not always
// adjacent to the stem: 対応していません, 含まれていません. Matching `ません` itself
// covers しません/できません/されません/していません in one.
const NEGATION_AFTER = /(?:ません|ない|なし)/

/**
 * True when a negation sits beside this match, inside its own sentence: up to 40
 * characters before it, or 14 after. Bounded to one sentence, so a denial can
 * never excuse a claim standing next to it.
 */
function deniedAt(sentence: string, index: number, length: number): boolean {
  const before = sentence.slice(Math.max(0, index - 40), index)
  const after = sentence.slice(index + length, index + length + 14)
  return NEGATION_BEFORE.test(before) || NEGATION_AFTER.test(after)
}

/**
 * "BEWARE OF FIRMS THAT GUARANTEE POSITIONS" IS A WARNING, NOT A PROMISE.
 *
 * Measured 24 Nov 2026: the Polish row "pozycjonowanie strony www cena" was
 * refused on advice to be wary of firms that make rigid promises of "gwarantowanych
 * pozycji". Every honest article on SEO pricing says this, in every language, and
 * the denial window above misses it when the warning verb, not a "not", carries it.
 * A sentence that tells the reader to avoid, doubt or watch out for such promises
 * is advice against them. A warning word in the same sentence exempts it; a claim
 * in the NEXT sentence is still judged on its own.
 */
const WARNS_AGAINST_PROMISES = /\b(?:beware|avoid|be\s+wary|wary\s+of|red\s+flag|suspicious|warning\s+sign|steer\s+clear|cuidado|evita\w*|desconf\w+|sospech\w+|cuidado\s+com|evite\w*|desconfie\w*|m[ée]fiez|[ée]vit\w+|m[ée]fi\w+|attenzione|diffida\w*|evit\w+|vorsicht|misstrauisch|meide\w*|h[üu]te\w*|wees\s+voorzichtig|vermijd\w*|wantrouw\w*|oppas\w*)\b|unika\w*|uwaga|uwa[żz]aj\w*|ostro[żz]n\w*|nieufn\w*|podejrzan\w*|ostrze\w+|היזהר\w*|זהירות|חשוד\w*|הימנע\w*|להימנע|警戒|注意|避け|조심|주의|피하/i
/**
 * Where this sentence PROMISES a ranking, rather than denying that one can be
 * promised: the index of the first undenied promise, or -1 when there is none.
 */
function promiseIndex(sentence: string): number {
  if (WARNS_AGAINST_PROMISES.test(sentence)) return -1
  GUARANTEE_G.lastIndex = 0
  for (let m = GUARANTEE_G.exec(sentence); m; m = GUARANTEE_G.exec(sentence)) {
    if (!deniedAt(sentence, m.index, m[0].length)) return m.index
  }
  return -1
}

/**
 * True when this sentence puts Perplexity, Copilot or Grok INSIDE what runs
 * automatically. The automatic AI check covers ChatGPT, Gemini and Google AI; the
 * others are answered for a single question on request. Saying so — "the
 * automatic check does not include Perplexity" — is the honest sentence an
 * article about AI visibility almost has to write, and until this it was refused
 * exactly like the claim it denies, which is how Italian spent three attempts and
 * published nothing.
 */
function claimsEngineCoverage(sentence: string): boolean {
  if (!AUTOMATIC.test(sentence) || !OTHER_ENGINES.test(sentence)) return false
  // WHY THE WHOLE SENTENCE, AND NOT A WINDOW AROUND THE NAME.
  //
  // `ranking_guarantee` reads 40 characters before the match and 14 after,
  // because there the negation sits beside the verb it negates. A coverage denial
  // does not behave that way: the negation lands wherever the language puts it
  // relative to the ENGINE's name — before it in English and Polish ("does not
  // cover Perplexity"), immediately after it in Italian with the engine as
  // subject ("Perplexity non fa parte"), and at the end of the clause in German
  // ("umfasst Perplexity nicht"). A window wide enough for all three is the
  // sentence, so the sentence is what is read.
  //
  // The cost is a sentence that denies one thing and claims another about the
  // engines in one breath, which would now pass. The cost of the window was
  // measured instead: two locales, two days running, published nothing at all.
  //
  // ON_DEMAND and PER_QUESTION are read the same way, and for the same reason:
  // they are how the distinction is drawn when nothing is being denied.
  return !NEGATION_BEFORE.test(sentence) && !NEGATION_AFTER.test(sentence)
    && !ON_DEMAND.test(sentence) && !PER_QUESTION.test(sentence)
}

const SAMPLE_MAX = 160
/**
 * WHY THE SAMPLE IS CENTRED ON THE MATCH AND NOT ON THE SENTENCE'S FIRST WORDS.
 *
 * `plainText` turns a table into one run of words with no sentence punctuation
 * in it, so a comparison table is a single "sentence" of a thousand characters.
 * The Spanish refusal of 19 November 2026 kept the first 160 of them — a table
 * heading, "Comparativa de Modelos de Cobro ... Porcentaje de la inversion" —
 * and the number that actually tripped `percentage_claim` sat past the cut. The
 * retry brief then quoted a heading back at the writer and asked it to fix
 * something the quote did not contain.
 *
 * So the window follows the match: a third of it ahead for context, the rest
 * after, with a leading ellipsis when anything was dropped.
 */
function sampleOf(sentence: string, at = 0): string {
  const from = Math.max(0, at - Math.floor(SAMPLE_MAX / 3))
  const flat = sentence.slice(from, from + SAMPLE_MAX * 2).replace(/\s+/g, ' ').trim()
  return (from > 0 ? '\u2026' : '') + flat.slice(0, SAMPLE_MAX)
}
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
  const samples: Record<string, string> = {}
  const body = plainText(input.html)
  const all = [input.title, input.metaDescription, body].join(' | ')
  const lines = sentences(all)

  /** Record the failure, and the words that tripped it. */
  const refuse = (code: string, sentence?: string, at = 0): void => {
    failures.push(code)
    if (sentence && !samples[code]) samples[code] = sampleOf(sentence, at)
  }
  /** The first sentence a whole-text pattern matched, and where in it. */
  const firstMatch = (re: RegExp): { sentence: string; at: number } | undefined => {
    for (const line of lines) {
      const m = re.exec(line)
      if (m) return { sentence: line, at: m.index }
    }
    return undefined
  }
  const refuseMatch = (code: string, hit?: { sentence: string; at: number }): void => {
    refuse(code, hit?.sentence, hit?.at)
  }

  if (PERCENT.test(withoutPercentScale(all))) {
    for (const line of lines) {
      const clean = withoutPercentScale(line)
      const m = PERCENT.exec(clean)
      if (m) { refuse('percentage_claim', clean, m.index); break }
    }
  }
  if (COUNT_AFTER.test(all) || COUNT_BEFORE.test(all)) {
    refuseMatch('customer_count_claim', firstMatch(COUNT_AFTER) ?? firstMatch(COUNT_BEFORE))
  }
  for (const line of lines) {
    const clean = withoutAdSpendCadence(line)
    const m = CADENCE.exec(clean)
    if (m && !CADENCE_NOT_NEEDED.test(clean)) {
      refuse('tracking_cadence_claim', clean, m.index)
      break
    }
  }
  if (RATING.test(all)) refuseMatch('rating_claim', firstMatch(RATING))
  for (const line of lines) {
    const at = promiseIndex(line)
    if (at >= 0) { refuse('ranking_guarantee', line, at); break }
  }

  const coverage = lines.find(claimsEngineCoverage)
  if (coverage) refuse('ai_engine_coverage_claim', coverage, OTHER_ENGINES.exec(coverage)?.index ?? 0)

  const schema = lines.find((l) => SHOPIFY.test(l) && SCHEMA_WORD.test(l))
  if (schema) refuse('shopify_schema_claim', schema)

  // Shopify links: the App Store listing, and nofollow on every one of them.
  for (const tag of input.html.match(ANCHOR) ?? []) {
    const href = ATTR('href', tag)
    if (!/shopify\.com/i.test(href)) continue
    if (!href.includes(APP_STORE_HREF)) refuse('shopify_link_not_listing', tag)
    if (!/\bnofollow\b/i.test(ATTR('rel', tag))) refuse('shopify_link_not_nofollow', tag)
  }

  return { ok: failures.length === 0, failures: [...new Set(failures)], samples }
}

/**
 * HOW A REFUSAL'S SAMPLE TRAVELS.
 *
 * `blog_plan.last_error` is the only place a refused attempt leaves anything
 * behind: the draft is discarded, and `note` belongs to a person (the admin
 * screen writes their words there when they reject a row), so it cannot be
 * borrowed. The codes therefore stay first and unchanged — `truth:a,b` — and the
 * samples follow after a marker no code or rule name contains. Everything that
 * reads the reason reads the head, so the suffix is invisible to it.
 */
export const GATE_SAMPLE_MARK = ' ¦ '

/** `truth:a,b` plus the sentences, when there are any to keep. */
export function encodeGateReason(reason: string, samples: Record<string, string>): string {
  const kept = Object.entries(samples).filter(([, v]) => v && v.trim())
  if (kept.length === 0) return reason
  return `${reason}${GATE_SAMPLE_MARK}${JSON.stringify(Object.fromEntries(kept))}`
}

/** The codes and the samples back out. Unparsable or absent samples are simply absent. */
export function decodeGateReason(stored: string | null | undefined): {
  codes: string; samples: Record<string, string>
} {
  const text = stored ?? ''
  const at = text.indexOf(GATE_SAMPLE_MARK)
  if (at < 0) return { codes: text, samples: {} }
  const codes = text.slice(0, at)
  try {
    const parsed: unknown = JSON.parse(text.slice(at + GATE_SAMPLE_MARK.length))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { codes, samples: {} }
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v.slice(0, SAMPLE_MAX)
    }
    return { codes, samples: out }
  } catch {
    return { codes, samples: {} }
  }
}
