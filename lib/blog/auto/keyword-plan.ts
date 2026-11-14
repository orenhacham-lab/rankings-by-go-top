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

/** Lower is more winnable for a site with little authority. Pure. */
export function keywordDifficulty(idea: Pick<KeywordIdeaResult, 'keyword' | 'competition' | 'competitionIndex'>): number {
  const ads = idea.competitionIndex ?? (idea.competition ? COMPETITION_FALLBACK[idea.competition] : 50)
  const words = Math.min(keywordTokens(idea.keyword ?? '').length, TAIL_WORDS_CAP)
  return ads - Math.max(words - 1, 0) * TAIL_BONUS
}

export interface SelectKeywordsInput {
  locale: BlogAutoLocale
  ideas: KeywordIdeaResult[]
  /** Keywords already planned or published in this language. */
  taken: string[]
  limit: number
}

export interface SelectedKeyword {
  keyword: string
  monthlySearches: number | null
  competition: string | null
}

export function selectKeywords(input: SelectKeywordsInput): SelectedKeyword[] {
  const floor = MIN_MONTHLY_SEARCHES[input.locale]
  const chosen: SelectedKeyword[] = []
  // Taken keywords AND the ones chosen in this same run: two ideas in one
  // response can be near-duplicates of each other.
  const blocking = [...input.taken]

  const ranked = [...input.ideas].sort((a, b) => {
    const d = keywordDifficulty(a) - keywordDifficulty(b)
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
