/**
 * FILLING THE BLOG'S QUEUE WITH KEYWORDS PEOPLE ACTUALLY SEARCH.
 *
 * Every row of blog_plan is a keyword that Google's own Keyword Planner reports
 * monthly searches for (lib/google-ads/keyword-ideas.ts, the same call the
 * research screen makes). Nothing is planned from a hunch.
 *
 * The selection below is the part that decides whether a daily cadence is worth
 * anything. Three things are thrown away:
 *   * a keyword with no real volume — an article for it has no reader;
 *   * a keyword too close to one we have already published or planned — that is
 *     two of our own pages competing for one query;
 *   * a navigational or agency keyword — somebody searching our brand, or the
 *     agency's services, is not looking for a blog article on this site.
 *
 * `selectKeywords` is pure, so the whole policy is exercisable without Google.
 */

import type { KeywordIdeaResult } from '@/lib/google-ads/keyword-ideas'
import { generateKeywordIdeas } from '@/lib/google-ads/keyword-ideas'
import { hebrewWordMatches } from '@/lib/content/article-audit'
import type { BlogAutoLocale } from '@/lib/blog/auto/rotation'

/** Keyword Planner's country + language for each blog language. */
export const RESEARCH_MARKET: Record<BlogAutoLocale, { country: string; language: string }> = {
  he: { country: 'IL', language: 'he' },
  en: { country: 'US', language: 'en' },
  es: { country: 'ES', language: 'es' },
  // Brazil, and Google's language code for Portuguese is the bare 'pt'.
  'pt-BR': { country: 'BR', language: 'pt' },
  fr: { country: 'FR', language: 'fr' },
  it: { country: 'IT', language: 'it' },
  ja: { country: 'JP', language: 'ja' },
  // Germany, not the whole German-speaking area. Keyword Planner takes ONE
  // country per call, and DE is ~85% of the German-speaking search market, so
  // DE is not a choice against Austria and Switzerland: a keyword with volume
  // in Germany has volume in Vienna and Zurich, and the reverse does not hold.
  // COUNTRY_GEO_TARGETS carries DE alone for the same reason — Germany is the
  // market that was researched and the one the pricing is offered in.
  de: { country: 'DE', language: 'de' },
  // The Netherlands, and ONLY the Netherlands. Belgium (geo 2056) is not here
  // and must not be: Flemish readers read these pages, but Belgium was never
  // measured in Keyword Planner and its prices were never set, which is exactly
  // why Austria and Switzerland had to be taken out again after German shipped.
  nl: { country: 'NL', language: 'nl' },
  // Poland, and ONLY Poland. Polish is spoken by diasporas large enough to be
  // tempting (Germany, the UK, Chicago), but a market goes into
  // COUNTRY_GEO_TARGETS when it is researched and priced, never when its
  // language is spoken somewhere — the Austria/Switzerland revert after German
  // shipped is the precedent.
  pl: { country: 'PL', language: 'pl' },
  // South Korea, and ONLY South Korea. There is no second Korean-speaking market
  // to be tempted by: the language's other country is one we neither research
  // nor sell in, and 'ko-KP' is explicitly not a market here (see the resolver
  // comment in lib/ai-visibility/i18n.ts). Google holds a MINORITY of Korean
  // search — Naver is the other half — so these numbers are a slice of the
  // market rather than the whole of it, which is the opposite of Poland. That
  // is a reason the measured volume is remarkable rather than a reason to
  // discount it: 구글 비즈니스 프로필 at 3,600/mo is Google-only demand.
  ko: { country: 'KR', language: 'ko' },
}

/**
 * The floor for "somebody searches this". Hebrew is a 9-million-speaker market,
 * so the same floor as English would reject nearly every real Hebrew query.
 */
export const MIN_MONTHLY_SEARCHES: Record<BlogAutoLocale, number> = { he: 20, en: 80, es: 50, 'pt-BR': 50, fr: 50, it: 50, ja: 50, de: 50, nl: 50, pl: 50, ko: 50 }

/** Seeds the research starts from — the subjects this product is actually about. */
export const RESEARCH_SEEDS: Record<BlogAutoLocale, string[]> = {
  he: [
    'קידום אתרים', 'בדיקת מיקום בגוגל', 'מחקר מילות מפתח', 'קידום אורגני',
    'seo', 'קידום בai', 'דירוג בגוגל', 'מהירות אתר', 'תוכן לאתר', 'גוגל סרץ קונסול',
  ],
  en: [
    'seo', 'keyword research', 'rank tracking', 'ai search visibility',
    'technical seo', 'google search console', 'seo for small business', 'content seo',
  ],
  es: [
    'seo', 'posicionamiento en google', 'investigación de palabras clave',
    'seo técnico', 'visibilidad en ia', 'google search console', 'seo para pymes',
  ],
  'pt-BR': [
    'seo', 'posicionamento no google', 'pesquisa de palavras-chave',
    'seo técnico', 'visibilidade em ia', 'google search console',
    'seo para pequenas empresas', 'velocidade do site',
  ],
  fr: [
    'seo', 'référencement naturel', 'positionnement google',
    'recherche de mots-clés', 'seo technique', 'visibilité dans les ia',
    'google search console', 'seo pour petite entreprise', 'vitesse du site',
  ],
  it: [
    'seo', 'posizionamento su google', 'ricerca parole chiave',
    'seo tecnico', 'visibilità nelle ia', 'google search console',
    'seo per piccole imprese', 'velocità del sito',
  ],
  ja: [
    'SEO対策', '検索順位 チェック', 'キーワード選定', 'SEO 内部対策',
    'seo', 'AI検索 対策', 'Google 検索順位', 'サイト 表示速度', 'オウンドメディア 記事',
    'サーチコンソール 使い方', '被リンク 調べ方', 'ローカルSEO', 'Googleビジネスプロフィール 活用',
  ],
  // These are not translations of the English seeds. They are the terms that
  // came back WITH VOLUME when the language choice was measured in Keyword
  // Planner on 3-4 Nov 2026 (growth/next-language.md): SEO Tool 8,100/mo,
  // SEO Analyse Tool 260, Keyword Recherche Tool 260, Backlink Tool 140,
  // Local SEO Tool 110, Google Unternehmensprofil optimieren 90, Google Ranking
  // prüfen 70, Keyword Ranking Tool 70. German SEO vocabulary keeps the English
  // loanwords — a German owner searches "Keyword Recherche", never
  // "Schlüsselwortrecherche" — so seeding with the native-sounding compound
  // would have returned nothing.
  // These are not translations of the English seeds, and they are not translations
  // of the German ones either. They are the terms Keyword Planner returned WITH
  // VOLUME when the Netherlands was measured on 5 Nov 2026
  // (growth/next-language.md, Addendum 5): backlinks checken 4,400/mo at low
  // competition, seo tool 2,400, seo check 1,600, sitecheck seo 590,
  // zoekwoordplanner 480, seo test 390, seo analyse 320, lokale seo 260 and
  // seo lokaal 260, seo scan 260, seo check google 210, zoekwoorden analyse 170.
  //
  // Dutch SEO vocabulary is NOT the English one with a Dutch article in front:
  // `zoekwoord` is what a Dutch owner types, not `keyword` — zoekwoordplanner
  // alone carries the most valuable clicks of the whole Dutch list. The one
  // place English wins is `backlinks`, which has no Dutch equivalent in use.
  // Seeding this list with calques from the German seeds would have returned
  // nothing, which is the mistake the Dutch measurement itself corrected: an
  // earlier hand-written list made this market look dead.
  // MEASURED in Keyword Planner on 6 November 2026 (account 989-586-4448,
  // Location = Poland, Language = Polish, Oct 2025-Sep 2026), so this list is
  // the measured one and not a translation of the German or Dutch seeds. Bids
  // below are ILS, because that account bills in shekels. The UI caps a seed
  // run at ten keywords, so the fifteen candidates were measured in two runs.
  //
  // What the measurement changed. FIVE terms came out: `linki zwrotne` 40/mo,
  // `sprawdzenie pozycji w google` 50, `analiza słów kluczowych` 90 and
  // `widoczność w ai` 90 are below anything worth seeding (the floor in
  // MIN_MONTHLY_SEARCHES is 50), and `google search console` prints 74,000/mo
  // but it is navigation to a Google product: seeding it floods the idea pool
  // with `searchconsole`, `google webmastertool` and the like, none of which we
  // can win or would want to. `słowa kluczowe` (1,300) and `analiza seo` (320,
  // High competition) came out as ambiguous heads, and `monitorowanie pozycji`
  // (210) because its own volume fell 99% year on year.
  //
  // What it added. `wizytówka google` is 9,900/mo and the ONLY large term in the
  // Polish set that is growing (+22% three-month, +22% year on year) while every
  // `pozycjonowanie` phrase falls 45-90%, and its commercial twin
  // `pozycjonowanie wizytówki google` is 1,300/mo at ILS 8.14-26.61. Clustered,
  // the local-SEO intent is about 3,140/mo, and the Google Business Profile
  // wording carries more of it than the word `lokalne` does — which is the
  // opposite of what the language research assumed. `pozycjonowanie lokalne`
  // itself is confirmed at 880/mo, Low competition, ILS 7.46-34.28.
  //
  // The vocabulary the research got right, and a translation would have got
  // wrong: Polish does not borrow the category name. The word a Polish owner
  // types is `pozycjonowanie` — literally "positioning" — used interchangeably
  // with SEO by the Polish trade itself, with `pozycjonowanie stron` (5,400/mo,
  // ILS 17.89-75.78) as the standard name of the service. `wizytówka Google` is
  // what the Google Business Profile is called in Polish usage; the official
  // name, `Profil Firmy w Google`, is the one the pages use and the one nobody
  // searches for. Google holds over 97% of search in Poland, so these numbers
  // are the whole market rather than a slice of it.
  //
  // One caveat to carry: every `pozycjonowanie` term is down sharply year on
  // year while `wizytówka google` grows. If that holds, the Polish launch
  // content belongs on the wizytówka cluster rather than on the head term.
  pl: [
    'pozycjonowanie stron', 'pozycjonowanie', 'seo',
    'wizytówka google', 'pozycjonowanie wizytówki google',
    'audyt seo', 'pozycjonowanie lokalne', 'seo lokalne',
    'narzędzie seo',
  ],
  nl: [
    'seo', 'seo tool', 'seo check', 'seo analyse',
    'backlinks checken', 'zoekwoordplanner', 'zoekwoorden analyse',
    'lokale seo', 'seo lokaal', 'google bedrijfsprofiel',
    'google search console', 'seo voor kleine bedrijven',
    'website snelheid', 'zichtbaarheid in ai',
  ],
  de: [
    'seo', 'seo tool', 'seo analyse tool', 'keyword recherche',
    'google ranking prüfen', 'keyword ranking tool', 'backlink tool',
    'local seo', 'google unternehmensprofil optimieren', 'google search console',
    'seo für kleine unternehmen', 'website geschwindigkeit', 'sichtbarkeit in ki',
  ],
  // MEASURED in Keyword Planner on 11-12 November 2026, in two rounds
  // (growth/next-language.md, Addenda 7 and 8). The first round of hand-written
  // Korean seeds returned THREE ideas; re-seeding from Google's own output
  // returned 859, which is the whole reason this list is the measured one and
  // not a translation of the Japanese seeds beside it.
  //
  // What the measurement put in. The Google Business Profile cluster is the
  // demand: 구글 비즈니스 프로필 3,600/mo and GROWING +408% year on year,
  // 구글 상위 노출 2,400 at +140%, 구글 seo 1,000, and `seo google` 880 at +662%,
  // the fastest-growing term measured in any of the eleven markets compared.
  // Korea is also the ONLY one of those markets where bare `seo` itself grows
  // (+23%, 3,600/mo), so the head term is seeded here although it is dropped as
  // an ambiguous head in other languages.
  //
  // What it deliberately leaves out, and this is the part a later reader will
  // want. (1) `네이버 seo` 480/mo at +23% is real demand to be found on NAVER,
  // which holds much of Korean search and which this product does not track at
  // all; seeding it would fill the queue with articles whose subject we cannot
  // serve, and the truth gate in the runner would be right to reject them.
  // (2) `홈페이지 제작`, `사이트 만들기` 1,900, `홈페이지 만들기` 1,600,
  // `워드프레스 홈페이지 제작` 880, `병원 홈페이지` 390 are website-BUILDING
  // demand, which is somebody else's product — the same filter Addendum 5
  // applied to Indonesia's `jasa seo`. The volume is larger than everything
  // seeded below and it is not ours.
  //
  // The vocabulary a translation would have got wrong: Korean borrows the
  // category name, so `seo` and `구글` are written in the Latin alphabet inside
  // otherwise Korean queries. `검색엔진최적화`, the native compound, is what the
  // textbooks use and not what an owner types.
  ko: [
    '구글 비즈니스 프로필', '구글 상위 노출', '구글 seo', 'seo google',
    'seo', 'seo 란',
  ],
}

/**
 * Keywords that are never an article on this blog: our own and the agency's
 * names (navigational), and the agency's done-for-you services, which belong to
 * gotop.co.il and not to the product's blog.
 */
export const EXCLUDED_PATTERNS: RegExp[] = [
  /\bgo\s*top\b/i,
  /\bגו\s*טופ\b/,
  /rankings by/i,
  /(סוכנות|משרד)\s*(קידום|פרסום|דיגיטל)/,
  /(seo|marketing)\s+(agency|agencia)/i,
  /\b(מחיר|מחירון|עלות)\s+(קידום|פרסום)\b/,
]

/** Lower-cased, punctuation out, one-letter words dropped. */
export function keywordTokens(keyword: string): string[] {
  return keyword
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
}

/**
 * How much two keywords overlap, 0..1, by shared words over the shorter one.
 * "מחקר מילות מפתח" vs "כלי למחקר מילות מפתח" = 1 — the same article.
 */
export function keywordOverlap(a: string, b: string): number {
  const ta = [...new Set(keywordTokens(a))]
  const tb = [...new Set(keywordTokens(b))]
  if (!ta.length || !tb.length) return 0
  let shared = 0
  // A Hebrew word carries its prepositions as letters — "למחקר" is "מחקר". Plain
  // string equality would therefore read "כלי למחקר מילות מפתח" as a different
  // subject from "מחקר מילות מפתח", which is the duplicate this is here to
  // catch. hebrewWordMatches is the audit layer's existing answer to that, and
  // falls back to equality for every other language.
  for (const w of ta) if (tb.some((v) => hebrewWordMatches(w, v))) shared++
  return shared / Math.min(ta.length, tb.length)
}

/** At or above this, two keywords are the same article. */
export const CANNIBAL_OVERLAP = 0.8

/**
 * WHICH OF THE SURVIVING KEYWORDS GETS WRITTEN FIRST.
 *
 * Until 23 Oct 2026 this was simply the biggest one: the ideas were sorted by
 * monthly searches, descending. Search Console on 21.10.2026 shows what that
 * bought. The three keywords with the most impressions on the site are
 * "קידום אורגני בגוגל" at position 62, "קידום אתרים אורגני בגוגל" at 84 and
 * "מחקר מילות מפתח" at 83; 11,008 of the day's 15,093 impressions sit at
 * position 40 or worse, and the whole site took two clicks. Picking the
 * highest-volume keyword in a niche is picking the one the oldest and
 * best-linked sites in the country already own.
 *
 * So the queue is ordered by what this site can actually win: least
 * advertiser competition first, and a long keyword before a short one, with
 * volume left as the tie-breaker rather than the sort key. The floor above
 * still guarantees somebody searches it.
 *
 * Two honest limits. Google's competition index measures ADVERTISER
 * competition, not organic difficulty — it is a proxy, the best free one we
 * have. And word count is a crude stand-in for specificity; it is right far
 * more often than it is wrong in this niche, which is what it has to be.
 */

/** Advertiser competition on a 0..100 scale when Google sent only the bucket. */
const COMPETITION_FALLBACK: Record<'LOW' | 'MEDIUM' | 'HIGH', number> = { LOW: 20, MEDIUM: 50, HIGH: 85 }

/** How much one extra word in the keyword is worth, in competition-index points. */
export const TAIL_BONUS = 10

/** Beyond this many words, another word says nothing more about specificity. */
export const TAIL_WORDS_CAP = 6

/**
 * HOW SPECIFIC A KEYWORD IS, IN WORDS — COUNTED SO THAT JAPANESE COUNTS AT ALL.
 *
 * `keywordTokens` splits on spaces, and Japanese and Korean write none, so
 * every Japanese keyword scored as ONE word however specific it was:
 * `Googleビジネスプロフィール活用` and `SEO` were the same length to the
 * ranking above, and the tail bonus — the whole mechanism that prefers a
 * specific keyword to a head term — was dead in those two languages. Measured
 * 21 Nov 2026: the Japanese articles published average 8,685 monthly searches
 * while the Japanese rows still waiting average 99.
 *
 * Where a language writes no spaces, the character count stands in, at four
 * characters to a word. That is the average these scripts run at, and it is a
 * stand-in, not a measurement — which is the same honest limit the advertiser
 * competition index carries.
 */
export function specificityWords(keyword: string): number {
  const words = keywordTokens(keyword).length
  if (words > 1) return words
  const noSpaceChars = (keyword.match(/[\u3000-\u9fff\uac00-\ud7af]/g) ?? []).length
  return noSpaceChars >= 4 ? Math.max(words, Math.round(noSpaceChars / 4)) : words
}

/**
 * ABOVE THIS MANY MONTHLY SEARCHES, A KEYWORD IS A HEAD TERM FOR THIS SITE.
 *
 * Not "a big keyword" in general — one this site cannot win today. The
 * thresholds are set from what the queue actually chose, read on 21 Nov 2026,
 * and that reading is also the clearest statement of why a volume term is
 * needed at all. Every one of the fourteen biggest keywords ever published
 * here came back from Keyword Planner as competition LOW:
 *
 *   google search console   en  450,000  LOW
 *   google search console   de  135,000  LOW
 *   サーチ コンソール          ja  110,000  LOW
 *   keyword research        en   90,500  LOW
 *   google keyword planner  en   49,500  LOW
 *
 * Advertiser competition is low for an informational head term exactly
 * because nobody bids on it, while its ORGANIC difficulty is the highest on
 * the board. So the one number the ranking trusted was telling it that the
 * least winnable keywords in the niche were the easiest, and the ranking
 * believed it. The site holds those queries at position 62 to 84.
 */
export const HEAD_VOLUME: Record<BlogAutoLocale, number> = {
  he: 2000, en: 5000, es: 2000, 'pt-BR': 2000, fr: 2000, it: 2000, ja: 2000, de: 2000, nl: 2000,
  // Poland and Korea are smaller search markets — Google holds a minority of
  // Korean search at all (Naver is the other half) — so the same number would
  // be a threshold nothing ever reaches.
  pl: 1000, ko: 1000,
}

/** Difficulty points added for each doubling of volume above that threshold. */
export const HEAD_PENALTY_PER_DOUBLING = 12
/** The most the penalty can ever be, so it orders heads without erasing them. */
export const HEAD_PENALTY_CAP = 60

/**
 * The penalty a head term carries. It REORDERS, it never rejects: the queue in
 * every language is 6 to 17 rows deep (measured 21 Nov 2026), so a filter here
 * would be a language with no article that day, which is the one cost this
 * blog is not allowed to pay.
 */
export function headPenalty(locale: BlogAutoLocale, monthlySearches: number | null | undefined): number {
  const head = HEAD_VOLUME[locale]
  const volume = monthlySearches ?? 0
  if (volume <= head) return 0
  return Math.min(Math.log2(volume / head) * HEAD_PENALTY_PER_DOUBLING, HEAD_PENALTY_CAP)
}

/**
 * THE QUERIES WHERE THIS BLOG SUCCEEDED, AND WHERE THE SUCCESS WAS WASTED.
 *
 * Read in Search Console on 21 Nov 2026 over the 28 days to 13 Nov: of the 660
 * impressions the blog earns in the band it can actually improve (positions 5
 * to 25), **276 are people looking for a human being** — "יועץ seo",
 * "חברות seo", "מומחה לפרסום בגוגל", "מקדם אתרים תותח", "מקדם אתרים פרטי",
 * "חברה לקידום בגוגל". Those searchers want somebody to do it for them. They
 * cannot buy a self-serve product even if they land on the page and like it,
 * and the agency's own done-for-you services live on gotop.co.il, not here.
 *
 * So this is where the blog ranked best and earned least.
 *
 * IT IS A PENALTY, NOT A FILTER, and that is a decision, not an oversight:
 * Oren, 21 Nov 2026 — do not exclude these if excluding them could shrink the
 * number of articles we can publish, because we publish every day and must
 * never run out of topics. The queue is 6 to 17 rows deep per language, so a
 * filter here is a language with no article that day. A hiring-intent keyword
 * therefore stays in the queue, is written when nothing better is waiting, and
 * is simply chosen last.
 *
 * Not to be confused with EXCLUDED_PATTERNS above, which is a different thing:
 * those name the agency itself ("סוכנות קידום", "seo agency") or ask its price,
 * and were never articles for this blog at all.
 */
export const HIRING_INTENT_PATTERNS: Partial<Record<BlogAutoLocale, RegExp[]>> = {
  he: [/יועץ/, /מומחה/, /מקדם\s+אתרים/, /פרילנסר/, /בעל\s+מקצוע/],
  en: [/\bconsultants?\b/i, /\bexperts?\b/i, /\bspecialists?\b/i, /\bfreelancers?\b/i, /\bfor\s+hire\b/i],
  es: [/consultor/i, /expert[oa]/i, /especialista/i, /aut[oó]nomo/i],
  'pt-BR': [/consultor/i, /especialista/i, /freelancer/i],
  fr: [/consultant/i, /expert/i, /sp[eé]cialiste/i, /freelance/i],
  it: [/consulente/i, /esperto/i, /specialista/i, /freelance/i],
  de: [/berater/i, /experte/i, /spezialist/i, /dienstleister/i, /freiberufler/i],
  nl: [/consultant/i, /expert/i, /specialist/i, /freelancer/i],
  pl: [/konsultant/i, /ekspert/i, /specjalista/i, /freelancer/i],
  ja: [/コンサル/, /専門家/, /代行/, /外注/],
  ko: [/컨설턴트/, /전문가/, /대행/],
}

/**
 * The company nouns, which mean hiring only in one direction.
 *
 * "seo company" is somebody looking for a firm to do it; "seo for companies"
 * is an article about doing it, and B2B content marketing is full of the
 * second shape — "SEO für Unternehmen", "seo para empresas", "קידום אתרים
 * לעסקים". A bare noun test would send a whole legitimate category to the back
 * of every European queue, so the preposition decides.
 */
export const HIRING_COMPANY_NOUNS: Partial<Record<BlogAutoLocale, RegExp[]>> = {
  he: [/חבר(ה|ות)\s+(ל|קידום|seo)/i, /סוכנות/],
  en: [/\bagenc(y|ies)\b/i, /\bcompan(y|ies)\b/i, /\bservices?\b/i],
  es: [/agencia/i, /empresas?\b/i],
  'pt-BR': [/ag[eê]ncia/i, /empresas?\b/i],
  fr: [/agence/i, /entreprise/i, /soci[eé]t[eé]/i],
  it: [/agenzia/i, /azienda/i],
  de: [/agentur/i, /firma/i, /unternehmen/i],
  nl: [/bureau/i, /bedrijf/i],
  pl: [/agencja/i, /firma/i],
  ja: [/会社/, /業者/],
  ko: [/업체/, /회사/],
}

/**
 * The words that turn a company noun back into an article: "for", in each
 * language. A keyword that contains one of these is about serving companies,
 * not about hiring one.
 */
export const FOR_COMPANIES_WORDS: Partial<Record<BlogAutoLocale, RegExp[]>> = {
  he: [/\bל(עסקים|חברות|ארגונים)/, /עבור\s/],
  en: [/\bfor\b/i],
  es: [/\bpara\b/i],
  'pt-BR': [/\bpara\b/i],
  fr: [/\bpour\b/i],
  it: [/\bper\b/i],
  de: [/\bf[üu]r\b/i],
  nl: [/\bvoor\b/i],
  pl: [/\bdla\b/i],
  ja: [/向け/, /のため/],
  ko: [/위한/, /용\s/],
}

/**
 * The points a hiring-intent keyword carries. Chosen so that it loses to any
 * comparable informational keyword while still beating a 450,000-a-month head
 * term, which is the thing that must never be first again.
 */
export const HIRING_INTENT_PENALTY = 25

/** Whether this keyword is somebody looking for a person or a firm to hire. Pure. */
export function isHiringIntent(locale: BlogAutoLocale, keyword: string): boolean {
  const k = keyword || ''
  if ((HIRING_INTENT_PATTERNS[locale] ?? []).some((re) => re.test(k))) return true
  const company = (HIRING_COMPANY_NOUNS[locale] ?? []).some((re) => re.test(k))
  if (!company) return false
  // A company noun with a "for" in it is an article about serving companies.
  return !(FOR_COMPANIES_WORDS[locale] ?? []).some((re) => re.test(k))
}

/** Flat, and it reorders only — see HIRING_INTENT_PATTERNS for why never a filter. */
export function hiringIntentPenalty(locale: BlogAutoLocale, keyword: string): number {
  return isHiringIntent(locale, keyword) ? HIRING_INTENT_PENALTY : 0
}

/**
 * Lower is more winnable for a site with little authority. Pure.
 *
 * With no locale it is the advertiser competition minus the tail bonus, as
 * before. With one it also carries the head-term penalty, which is what stops
 * `google search console` at 450,000 a month from being treated as the easiest
 * thing in the queue because its advertiser competition happens to be low, and
 * the hiring-intent penalty, which sends the queries that want a human being
 * to the back without taking them out of the queue.
 */
export function keywordDifficulty(
  idea: Pick<KeywordIdeaResult, 'keyword' | 'competition' | 'competitionIndex'> & { avgMonthlySearches?: number | null },
  locale?: BlogAutoLocale,
): number {
  const ads = idea.competitionIndex ?? (idea.competition ? COMPETITION_FALLBACK[idea.competition] : 50)
  const words = Math.min(specificityWords(idea.keyword ?? ''), TAIL_WORDS_CAP)
  const head = locale ? headPenalty(locale, idea.avgMonthlySearches) : 0
  const hiring = locale ? hiringIntentPenalty(locale, idea.keyword ?? '') : 0
  return ads - Math.max(words - 1, 0) * TAIL_BONUS + head + hiring
}

export interface SelectKeywordsInput {
  locale: BlogAutoLocale
  ideas: KeywordIdeaResult[]
  /** Keywords already planned or published in this language. */
  taken: string[]
  limit: number
  /**
   * Queries a page of ours ALREADY holds well enough to earn from, from
   * `lib/blog/auto/cannibal.ts` over our own Search Console rows. A candidate
   * that lands on one of these goes to the back of the queue — see
   * `OWNED_QUERY_PENALTY`. Optional, and an empty list means the ordering is
   * exactly what it was before.
   */
  owned?: string[]
}

export interface SelectedKeyword {
  keyword: string
  monthlySearches: number | null
  competition: string | null
}

/**
 * HOW FAR BACK A KEYWORD GOES WHEN A PAGE OF OURS ALREADY OWNS THAT QUERY.
 *
 * Measured 21 Nov 2026 on our own property: eight of our pages rank for
 * "בדיקת מיקומים בגוגל" and not one of them wins; five share
 * "בדיקת מיקום בגוגל", where the page nearest a click is a feature page at
 * 19.6. Writing a ninth article for a query we already hold does not add a
 * position, it divides one.
 *
 * It is a penalty and NOT a rejection, for the same reason the hiring-intent
 * one is: the blog publishes every day in every language, and a check that can
 * empty the queue is not allowed to exist. A candidate sitting on an owned
 * query is still claimable, still counted, and still written — after the
 * candidates that would win us a page we do not already have.
 */
export const OWNED_QUERY_PENALTY = 20

/**
 * How much of a keyword has to be the owned query before it is the same
 * territory. Looser than `CANNIBAL_OVERLAP`, which decides whether two
 * keywords are the SAME ARTICLE: being wrong here costs an article one place
 * in the queue, not its existence.
 */
export const OWNED_OVERLAP = 0.6

/** The penalty for a candidate that lands on a query we already hold. */
export function ownedQueryPenalty(keyword: string, owned: string[] | undefined): number {
  if (!owned?.length || !keyword) return 0
  return owned.some((q) => keywordOverlap(keyword, q) >= OWNED_OVERLAP) ? OWNED_QUERY_PENALTY : 0
}

export function selectKeywords(input: SelectKeywordsInput): SelectedKeyword[] {
  const floor = MIN_MONTHLY_SEARCHES[input.locale]
  const chosen: SelectedKeyword[] = []
  // Taken keywords AND the ones chosen in this same run: two ideas in one
  // response can be near-duplicates of each other.
  const blocking = [...input.taken]

  // The owned-query penalty is applied HERE and not inside `keywordDifficulty`
  // on purpose: `planRowDifficulty` shares that function, and a row already in
  // the queue should not be reordered by a reading taken after it was planned.
  // This changes which NEW keywords are researched in, nothing else.
  const score = (idea: KeywordIdeaResult): number =>
    keywordDifficulty(idea, input.locale) + ownedQueryPenalty(idea.keyword ?? '', input.owned)

  const ranked = [...input.ideas].sort((a, b) => {
    const d = score(a) - score(b)
    if (d !== 0) return d
    return (b.avgMonthlySearches ?? 0) - (a.avgMonthlySearches ?? 0)
  })

  for (const idea of ranked) {
    if (chosen.length >= input.limit) break
    const keyword = (idea.keyword ?? '').trim()
    if (!keyword) continue
    if ((idea.avgMonthlySearches ?? 0) < floor) continue
    if (EXCLUDED_PATTERNS.some((re) => re.test(keyword))) continue
    if (blocking.some((t) => keywordOverlap(keyword, t) >= CANNIBAL_OVERLAP)) continue
    chosen.push({
      keyword,
      monthlySearches: idea.avgMonthlySearches ?? null,
      competition: idea.competition ?? null,
    })
    blocking.push(keyword)
  }
  return chosen
}

/**
 * Ask Keyword Planner for ideas in one language. Returns [] on any
 * configuration or API failure — a queue that did not grow today is not an
 * outage worth failing the whole cron for, and the caller logs the reason.
 */
export async function researchKeywords(locale: BlogAutoLocale): Promise<{ ideas: KeywordIdeaResult[]; error: string | null }> {
  const market = RESEARCH_MARKET[locale]
  try {
    const res = await generateKeywordIdeas({
      researchType: 'keyword',
      keywords: RESEARCH_SEEDS[locale],
      country: market.country,
      language: market.language,
      minMonthlySearches: MIN_MONTHLY_SEARCHES[locale],
      resultsLimit: 250,
      pageLimit: 2,
    })
    return { ideas: res.results, error: null }
  } catch (err) {
    const code = err instanceof Error ? err.message : 'keyword_research_failed'
    return { ideas: [], error: code }
  }
}
