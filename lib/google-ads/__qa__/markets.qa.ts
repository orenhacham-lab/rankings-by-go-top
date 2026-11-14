/**
 * The keyword-research markets: Google's own criterion ids, and a label for
 * every one of them in every dashboard language.
 *
 * WHY THIS EXISTS. The ids are opaque numbers typed into a file, so a wrong one
 * does not fail — it quietly researches the wrong market. That had happened:
 * Greek carried 1016, which is Google's id for Portuguese (Brazil), so choosing
 * Greek asked Google for Brazilian Portuguese keyword ideas. The id for Greek is
 * 1022. Every number below was read back from the live Google Ads API with a
 * read-only GAQL query (`language_constant`, `geo_target_constant`) on
 * 4 October 2026 — and France, Italy and Japan on the days they were added —
 * and is pinned here so the next wrong digit fails a test instead of shipping.
 *
 * It also holds the two lists closed: a code offered in the picker with no id
 * behind it would send `undefined` to Google, and a code with no label would
 * render an empty option.
 *
 * Run: npx tsx lib/google-ads/__qa__/markets.qa.ts
 */
import { RESEARCH_MARKET } from '@/lib/blog/auto/keyword-plan'
import {
  COUNTRY_GEO_TARGETS,
  LANGUAGE_IDS,
  SUPPORTED_COUNTRIES,
  SUPPORTED_LANGUAGES,
  LOCALE_RESEARCH_DEFAULT,
  researchDefaultFor,
  isValidCountry,
  isValidLanguage,
} from '../constants'
import { contentLanguageOrEnglish } from '@/lib/content/language'
import { REASON_TEXT } from '@/lib/content/recommendations/reason-text'
import { readFileSync } from 'fs'
import { join } from 'path'
import { dashboardHe as he } from '@/lib/i18n/dashboard/he'
import { dashboardEn as en } from '@/lib/i18n/dashboard/en'
import { dashboardEs as es } from '@/lib/i18n/dashboard/es'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { PUBLIC_LOCALES } from '@/lib/i18n/locales'

let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** What the API answered, code → id. Nothing here is derived from the module under test. */
const GOOGLE_LANGUAGE_IDS: Record<string, number> = {
  en: 1000, // English
  es: 1003, // Spanish
  pt: 1014, // Portuguese
  pt_BR: 1016, // Portuguese (Brazil)
  ar: 1019, // Arabic
  el: 1022, // Greek
  iw: 1027, // Hebrew
  ru: 1031, // Russian
  fr: 1002, // French
  it: 1004, // Italian
  // Read back on 30 October 2026, with the Japanese blog: languageConstants/1005
  // answers code "ja", name "Japanese", targetable true.
  ja: 1005, // Japanese
  // Read back on 4 November 2026, with the German locale: languageConstants/1001
  // answers code "de", name "German", targetable true.
  de: 1001, // German
  // Read back on 5 November 2026, with the Dutch locale: languageConstants/1010
  // answers code "nl", name "Dutch", targetable true.
  nl: 1010, // Dutch
  // Read back on 5 November 2026, with the Polish locale: languageConstants/1030
  // answers code "pl", name "Polish", targetable true.
  pl: 1030, // Polish
  // Read back on 12 November 2026 from the live API (customer 989-586-4448):
  // languageConstants/1012 answers code "ko", name "Korean".
  ko: 1012, // Korean
}
const GOOGLE_COUNTRY_IDS: Record<string, number> = {
  AR: 2032, BR: 2076, CL: 2152, CO: 2170, CY: 2196,
  GR: 2300, IL: 2376, MX: 2484, PT: 2620, ES: 2724,
  GB: 2826, US: 2840,
  FR: 2250, IT: 2380,
  // geoTargetConstants/2392 answers name "Japan", countryCode JP, targetType
  // Country, status ENABLED. Read back the same day as the language above.
  JP: 2392,
  // geoTargetConstants/2276 answers name "Germany", countryCode DE, targetType
  // Country, status ENABLED. Read back the same day as the language above.
  DE: 2276,
  // geoTargetConstants/2528 answers name "Netherlands", countryCode NL,
  // targetType Country, status ENABLED. Read back the same day as the language
  // above. Belgium (2056) is NOT here, because Dutch is written for the
  // Netherlands alone and the keyword research must not reach into it.
  NL: 2528,
  // geoTargetConstants/2616 answers name "Poland", countryCode PL, targetType
  // Country, status ENABLED. Read back the same day as the language above.
  PL: 2616,
  // geoTargetConstants/2410 answers name "South Korea", countryCode KR,
  // targetType Country. Read back the same day as the language above. Korean is
  // written for SOUTH KOREA alone, and there is no second Korean market to be
  // tempted by the way Belgium tempted Dutch.
  KR: 2410,
}

function main() {
  console.log('Keyword-research markets')

  console.log('\nA) every id is the one Google answered with')
  {
    // Hebrew's own code at Google is the legacy `iw`.
    const ours = { ...LANGUAGE_IDS, iw: LANGUAGE_IDS.he } as Record<string, number>
    delete ours.he
    const wrong = Object.entries(ours).filter(([code, id]) => GOOGLE_LANGUAGE_IDS[code] !== id)
    check('A1: every language id matches Google\'s language_constant', wrong.length === 0,
      wrong.map(([c, id]) => `${c}=${id} (Google: ${GOOGLE_LANGUAGE_IDS[c] ?? 'no such code'})`).join(', '))
    const badCountry = Object.entries(COUNTRY_GEO_TARGETS).filter(([cc, id]) => GOOGLE_COUNTRY_IDS[cc] !== id)
    check('A2: every geo target matches Google\'s geo_target_constant', badCountry.length === 0,
      badCountry.map(([c, id]) => `${c}=${id} (Google: ${GOOGLE_COUNTRY_IDS[c] ?? 'no such country'})`).join(', '))
    // THE BUG THIS SUITE WAS WRITTEN FOR.
    check('A3: Greek is 1022, and 1016 — Portuguese (Brazil) — is not used for it',
      LANGUAGE_IDS.el === 1022 && !Object.entries(LANGUAGE_IDS).some(([c, id]) => id === 1016 && c !== 'pt-BR'),
      `el=${LANGUAGE_IDS.el}`)
    // MUTATION CONTROL: the comparison is real, not a tautology.
    const broken = { ...LANGUAGE_IDS, el: 1016, iw: LANGUAGE_IDS.he } as Record<string, number>
    delete broken.he
    check('A-MUT: the old Greek id fails A1',
      Object.entries(broken).some(([code, id]) => GOOGLE_LANGUAGE_IDS[code] !== id))
  }

  console.log('\nB) the two lists are closed')
  {
    const noId = SUPPORTED_LANGUAGES.filter((l) => typeof LANGUAGE_IDS[l] !== 'number')
    check('B1: every offered language has an id', noId.length === 0, noId.join(', '))
    const noGeo = SUPPORTED_COUNTRIES.filter((c) => typeof COUNTRY_GEO_TARGETS[c] !== 'number')
    check('B2: every offered country has a geo target', noGeo.length === 0, noGeo.join(', '))
    /*
     * B3/B4 keep DEAD ids out — an id nobody can reach is an id nobody checks.
     * The blog's own research is the second way to reach one: it calls
     * generateKeywordIdeas directly with the markets in RESEARCH_MARKET, which
     * never pass through the pickers, so French and Italian are carried without
     * being offered on the keyword-research screen. Anything neither offered nor
     * researched is still dead and still fails.
     */
    const researched = Object.values(RESEARCH_MARKET)
    const usedLang = new Set(researched.map((m) => m.language))
    const usedCountry = new Set(researched.map((m) => m.country))
    const orphanLang = Object.keys(LANGUAGE_IDS).filter((l) => !isValidLanguage(l) && !usedLang.has(l))
    check('B3: no id is carried for a language that is neither offered nor researched', orphanLang.length === 0, orphanLang.join(', '))
    const orphanGeo = Object.keys(COUNTRY_GEO_TARGETS).filter((c) => !isValidCountry(c) && !usedCountry.has(c))
    check('B4: no geo target is carried for a country that is neither offered nor researched', orphanGeo.length === 0, orphanGeo.join(', '))
    check('B3-MUT/B4-MUT: a code neither offered nor researched would fail both',
      !isValidLanguage('zu') && !usedLang.has('zu') && !isValidCountry('ZW') && !usedCountry.has('ZW'))
    // THE BUG THIS PAIR WAS WIDENED FOR, from the other side: every market the
    // blog research names must resolve, or its language silently never publishes.
    const unresolved = Object.entries(RESEARCH_MARKET).filter(
      ([, m]) => typeof COUNTRY_GEO_TARGETS[m.country] !== 'number' || typeof LANGUAGE_IDS[m.language] !== 'number',
    )
    check('B8: every market the blog researches resolves in both maps', unresolved.length === 0,
      unresolved.map(([l, m]) => `${l} (${m.country}/${m.language})`).join(', '))
    check('B8-MUT: a market missing from either map is caught',
      [['xx', { country: 'ZZ', language: 'zz' }]].some(
        ([, m]) => typeof COUNTRY_GEO_TARGETS[(m as { country: string }).country] !== 'number',
      ))
    check('B5: the languages the product ships in are all researchable',
      isValidLanguage('he') && isValidLanguage('en') && isValidLanguage('es') && isValidLanguage('pt'))
    check('B6: and their home markets are choosable', isValidCountry('ES') && isValidCountry('BR') && isValidCountry('PT') && isValidCountry('MX'))
    check('B7: an unknown code is still refused', !isValidLanguage('zz') && !isValidCountry('ZZ'))
  }

  console.log('\nC) a label in every dashboard language')
  {
    /*
     * ALL ELEVEN, and through getDashboardDictionary rather than the raw files:
     * every locale but Hebrew and English is English with its own sections laid
     * over it, so the dictionary a screen reads is the MERGED one, and reading
     * the partial file instead would pass on a label that merge never reaches.
     *
     * It used to check he/en/es only, which is how it would have missed the
     * thirteen markets added on 13 November 2026 in eight languages. The locale
     * list is read from PUBLIC_LOCALES, never typed here, so the twelfth locale
     * is checked the day it ships — the trap in
     * components/public/__qa__/public-nav-menus.qa.ts, where a hand-picked pair
     * stayed green while Korean shipped without a menu row.
     */
    for (const locale of PUBLIC_LOCALES) {
      const kr = (getDashboardDictionary(locale) as unknown as { keywordResearch: { countries: Record<string, string>; languages: Record<string, string> } }).keywordResearch
      const missingLang = SUPPORTED_LANGUAGES.filter((l) => !kr.languages[l]?.trim())
      const missingCc = SUPPORTED_COUNTRIES.filter((c) => !kr.countries[c]?.trim())
      check(`C-${locale}: every language and country is named`, missingLang.length === 0 && missingCc.length === 0,
        [...missingLang, ...missingCc].join(', '))
      const extraLang = Object.keys(kr.languages).filter((l) => !isValidLanguage(l))
      const extraCc = Object.keys(kr.countries).filter((c) => !isValidCountry(c))
      check(`C-${locale}-closed: and nothing is named that cannot be chosen`, extraLang.length === 0 && extraCc.length === 0,
        [...extraLang, ...extraCc].join(', '))
      // A label is a WORD, not a code echoed back: `de: 'de'` would satisfy a
      // presence check and read as a bug on screen.
      const echoed = [...SUPPORTED_LANGUAGES.filter((l) => kr.languages[l] === l), ...SUPPORTED_COUNTRIES.filter((c) => kr.countries[c] === c)]
      check(`C-${locale}-named: no label is the code itself`, echoed.length === 0, echoed.join(', '))
    }
    const deCountries: Record<string, string> = {
      ...(getDashboardDictionary('de') as unknown as { keywordResearch: { countries: Record<string, string> } }).keywordResearch.countries,
      KR: '',
    }
    check('C-MUT: a locale missing one of the new labels fails C',
      SUPPORTED_COUNTRIES.filter((c) => !deCountries[c]?.trim()).length === 1)
    const words = ([he, en, es] as unknown as { keywordResearch: { languages: Record<string, string> } }[])
      .map((d) => d.keywordResearch.languages)
    check('C-distinct: Spanish and Portuguese are not the same word in any of them',
      words.every((l) => l.es !== l.pt), words.map((l) => `${l.es}/${l.pt}`).join(', '))
    // The eleven site languages are the point of the widening: each one is a
    // research language, and each one's home market is a choosable country.
    const shipped: [string, string][] = [['he', 'IL'], ['en', 'US'], ['es', 'ES'], ['pt', 'BR'], ['fr', 'FR'], ['it', 'IT'], ['ja', 'JP'], ['de', 'DE'], ['nl', 'NL'], ['pl', 'PL'], ['ko', 'KR']]
    const unoffered = shipped.filter(([l, c]) => !isValidLanguage(l) || !isValidCountry(c))
    check('C-ships: every language the site is published in can be researched, in its own market',
      unoffered.length === 0, unoffered.map(([l, c]) => `${l}/${c}`).join(', '))
    check('C-ships-MUT: a shipped language that is not offered is caught',
      [['zu', 'ZW']].some(([l, c]) => !isValidLanguage(l) || !isValidCountry(c)))
  }

  console.log('\nC2) the pickers open on the reader\'s own market')
  {
    const missing = PUBLIC_LOCALES.filter((l) => !LOCALE_RESEARCH_DEFAULT[l])
    check('C2a: every site language has a default pair', missing.length === 0, missing.join(', '))
    const unchoosable = PUBLIC_LOCALES.filter((l) => {
      const d = LOCALE_RESEARCH_DEFAULT[l]
      return !d || !isValidCountry(d.country) || !isValidLanguage(d.language)
    })
    check('C2b: and the pair it opens on is one the pickers offer', unchoosable.length === 0, unchoosable.join(', '))
    // The default is the LOCALE'S OWN market, not a copy of Hebrew's. The whole
    // point of the change is that a German reader does not open on Israel.
    const notOwn = PUBLIC_LOCALES.filter((l) => l !== 'he' && researchDefaultFor(l).country === 'IL')
    check('C2c: no language but Hebrew opens on Israel', notOwn.length === 0, notOwn.join(', '))
    check('C2-MUT: an unknown locale still falls back to Israel and Hebrew',
      researchDefaultFor('zz').country === 'IL' && researchDefaultFor('zz').language === 'he')
    // Portuguese is one language at Google; the pt-BR reader's country is Brazil.
    check('C2d: pt-BR opens on Brazil, in Google\'s single Portuguese',
      researchDefaultFor('pt-BR').country === 'BR' && researchDefaultFor('pt-BR').language === 'pt')
    const screen = readFileSync(join(process.cwd(), 'app/(dashboard)/keyword-research/page.tsx'), 'utf8')
    const wiredOk = (src: string) => /useState<string>\(researchDefault\.country\)/.test(src) && /useState<string>\(researchDefault\.language\)/.test(src)
      && /researchDefaultFor\(uiLocale\)/.test(src)
    check('C2e: the screen actually opens on it, from the locale it is read in', wiredOk(screen))
    check('C2e-MUT: the old hard-coded pair is caught', !wiredOk(screen.replace("useState<string>(researchDefault.country)", "useState('IL')")))
  }

  console.log('\nD) the research language never decides the prose the owner reads')
  {
    // A Spanish project used to reach the recommender as 'he', because the Ads
    // language list had no Spanish and the fallback was Hebrew: a Spanish site
    // was handed Hebrew topic titles.
    check('D1: Spanish is written in Spanish', contentLanguageOrEnglish('es') === 'es' && contentLanguageOrEnglish('es-MX') === 'es')
    // Portuguese left this group on 17 Oct 2026: it is a content language of its
    // own now (lib/content/__qa__/portuguese-content-language.qa.ts), so research
    // in Portuguese is written in Portuguese, not in English.
    check('D2: a language we do not write in yet reads as English, not Hebrew',
      contentLanguageOrEnglish('el') === 'en' && contentLanguageOrEnglish('ru') === 'en'
      && contentLanguageOrEnglish('ar') === 'en')
    check('D2b: Portuguese research is written in Portuguese',
      contentLanguageOrEnglish('pt') === 'pt-BR' && contentLanguageOrEnglish('pt-BR') === 'pt-BR')
    // Every language the product WRITES in has to come back as itself, or the
    // owner of a German site gets English topic titles from a German research.
    // de, nl, pl and ko became choosable on 13 Nov 2026 and were not in the
    // known-prefix list until the same commit.
    const selfProse: [string, string][] = [['fr', 'fr'], ['it', 'it'], ['ja', 'ja'], ['de', 'de'], ['nl', 'nl'], ['pl', 'pl'], ['ko', 'ko']]
    const wrongProse = selfProse.filter(([code, want]) => contentLanguageOrEnglish(code) !== want)
    check('D2c: a research language the product writes in is written in that language',
      wrongProse.length === 0, wrongProse.map(([c]) => `${c}->${contentLanguageOrEnglish(c)}`).join(', '))
    check('D3: Hebrew and the legacy code are still Hebrew', contentLanguageOrEnglish('he') === 'he' && contentLanguageOrEnglish('iw') === 'he')
    check('D4: no language at all keeps the Hebrew default', contentLanguageOrEnglish('') === 'he' && contentLanguageOrEnglish(null) === 'he' && contentLanguageOrEnglish(undefined) === 'he')
    check('D5: whatever it answers, the reason wording exists for it',
      ['es', 'pt', 'el', 'ru', 'ar', 'he', 'en', 'zz', ''].every((l) => !!REASON_TEXT[contentLanguageOrEnglish(l)]))
    const src = strip(read('lib/content/recommendations/keyword-research.ts'))
    check('D6: the recommender asks Google in one language and writes in the other',
      /const language = isValidLanguage\(input\.language\) \? input\.language : 'he'/.test(src)
      && /const prose = contentLanguageOrEnglish\(input\.language\)/.test(src)
      && /clustersToTopics\(clusterInputs, prose,/.test(src)
      && /REASON_TEXT\[prose\]/.test(src))
    check('D7: …and the Ads language is what reaches Google',
      /absorb\(await fetchSeed\(admin, \{ \.\.\.input, country, language \}/.test(src))
    // MUTATION CONTROL
    const collapsed = src.replace('const prose = contentLanguageOrEnglish(input.language)', '')
    check('D-MUT: with the prose language gone, D6 fails', !/const prose = contentLanguageOrEnglish\(input\.language\)/.test(collapsed))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
export {}
