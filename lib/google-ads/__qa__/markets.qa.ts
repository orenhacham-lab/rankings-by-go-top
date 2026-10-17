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
 * 4 October 2026, and is pinned here so the next wrong digit fails a test
 * instead of shipping.
 *
 * It also holds the two lists closed: a code offered in the picker with no id
 * behind it would send `undefined` to Google, and a code with no label would
 * render an empty option.
 *
 * Run: npx tsx lib/google-ads/__qa__/markets.qa.ts
 */
import {
  COUNTRY_GEO_TARGETS,
  LANGUAGE_IDS,
  SUPPORTED_COUNTRIES,
  SUPPORTED_LANGUAGES,
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
}
const GOOGLE_COUNTRY_IDS: Record<string, number> = {
  AR: 2032, BR: 2076, CL: 2152, CO: 2170, CY: 2196,
  GR: 2300, IL: 2376, MX: 2484, PT: 2620, ES: 2724,
  GB: 2826, US: 2840,
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
    const orphanLang = Object.keys(LANGUAGE_IDS).filter((l) => !isValidLanguage(l))
    check('B3: no id is carried for a language nobody can choose', orphanLang.length === 0, orphanLang.join(', '))
    const orphanGeo = Object.keys(COUNTRY_GEO_TARGETS).filter((c) => !isValidCountry(c))
    check('B4: no geo target is carried for a country nobody can choose', orphanGeo.length === 0, orphanGeo.join(', '))
    check('B5: the languages the product ships in are all researchable',
      isValidLanguage('he') && isValidLanguage('en') && isValidLanguage('es') && isValidLanguage('pt'))
    check('B6: and their home markets are choosable', isValidCountry('ES') && isValidCountry('BR') && isValidCountry('PT') && isValidCountry('MX'))
    check('B7: an unknown code is still refused', !isValidLanguage('zz') && !isValidCountry('ZZ'))
  }

  console.log('\nC) a label in every dashboard language')
  {
    for (const [name, dict] of [['he', he], ['en', en], ['es', es]] as const) {
      const kr = (dict as unknown as { keywordResearch: { countries: Record<string, string>; languages: Record<string, string> } }).keywordResearch
      const missingLang = SUPPORTED_LANGUAGES.filter((l) => !kr.languages[l]?.trim())
      const missingCc = SUPPORTED_COUNTRIES.filter((c) => !kr.countries[c]?.trim())
      check(`C-${name}: every language and country is named`, missingLang.length === 0 && missingCc.length === 0,
        [...missingLang, ...missingCc].join(', '))
      const extraLang = Object.keys(kr.languages).filter((l) => !isValidLanguage(l))
      const extraCc = Object.keys(kr.countries).filter((c) => !isValidCountry(c))
      check(`C-${name}-closed: and nothing is named that cannot be chosen`, extraLang.length === 0 && extraCc.length === 0,
        [...extraLang, ...extraCc].join(', '))
    }
    const words = ([he, en, es] as unknown as { keywordResearch: { languages: Record<string, string> } }[])
      .map((d) => d.keywordResearch.languages)
    check('C-distinct: Spanish and Portuguese are not the same word in any of them',
      words.every((l) => l.es !== l.pt), words.map((l) => `${l.es}/${l.pt}`).join(', '))
  }

  console.log('\nD) the research language never decides the prose the owner reads')
  {
    // A Spanish project used to reach the recommender as 'he', because the Ads
    // language list had no Spanish and the fallback was Hebrew: a Spanish site
    // was handed Hebrew topic titles.
    check('D1: Spanish is written in Spanish', contentLanguageOrEnglish('es') === 'es' && contentLanguageOrEnglish('es-MX') === 'es')
    check('D2: a language we do not write in yet reads as English, not Hebrew',
      contentLanguageOrEnglish('pt') === 'en' && contentLanguageOrEnglish('pt-BR') === 'en' && contentLanguageOrEnglish('el') === 'en'
      && contentLanguageOrEnglish('ru') === 'en' && contentLanguageOrEnglish('ar') === 'en')
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
