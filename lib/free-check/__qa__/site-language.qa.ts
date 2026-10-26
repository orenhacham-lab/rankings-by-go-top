/**
 * THE PAGE'S OWN LANGUAGE — the be-cln.co.il zero-ideas defect.
 *
 * SYMPTOM (production, be-cln.co.il, 26 Oct 2026): a new Israeli project whose
 * site is written entirely in Hebrew was created with language 'en'. Its seeding
 * scan then ran the content engine, which asked the model for ENGLISH titles over
 * the HEBREW keyword research the same scan had just cached. The engine's
 * title-keyword alignment gate cannot pass an English title over a Hebrew keyword,
 * so every candidate was rejected: step b4 ended "topics: 0" and the merchant's
 * ideas column held nothing but the three keywords the site already ranks for.
 *
 * CAUSE — one line. buildBusiness took `signals.htmlLang` as the business's
 * language, calling it a deterministic fact. It is a DECLARATION: this site ships
 * the WordPress default `<html lang="en-US" dir="rtl">` over Hebrew prose.
 *
 * FIX — the page's own WORDS decide, and only against a declaration they
 * contradict: Hebrew prose makes it a Hebrew page whatever the attribute says.
 * A latin-script page, a Hebrew page that already declares Hebrew, and a page with
 * too little text to judge all keep the declared value byte-for-byte.
 *
 * Run: npx tsx lib/free-check/__qa__/site-language.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { extractSiteSignals } from '../html-signals'
import { HEBREW_TEXT_MIN_LETTERS, HEBREW_TEXT_MIN_SHARE, pageLanguage, siteTextIsHebrew } from '../business-insight'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const URL = 'https://be-cln.co.il/'
/** extractSiteSignals' third argument: nothing here depends on robots.txt or llms.txt. */
const EXTRAS = { robotsTxt: null, llmsTxt: false }

/** A page, as the reader hands it over: the declared language plus the body's own words. */
function page(lang: string | null, body: string, title = ''): string {
  const attr = lang === null ? '' : ` lang="${lang}"`
  return `<!doctype html><html${attr} dir="rtl"><head><title>${title}</title></head><body>${body}</body></html>`
}

/** be-cln.co.il's own shape: the WordPress default locale over Hebrew prose. */
const HEBREW_BODY = `
<h1>ניקיון משרדים עם צוות קבוע שמכיר אתכם</h1>
<h2>הצעת מחיר תוך יום עסקים</h2><h2>מה אנחנו מנקים</h2>
<p>משרדים, קליניקות ואולמות תצוגה בכל הארץ, מעפולה ועד באר שבע. חברה בניהול הבעלים,
שעונים בעצמם לטלפון ולוואטסאפ, בלי מוקד ובלי כרטיס פנייה. ניקיון אחרי שיפוץ ובנייה,
ניקיון מבנים ושירותי ניקיון לעסקים, עם חשבוניות מסודרות וצוות שמגיע באותם אנשים.</p>`

const ENGLISH_BODY = `
<h1>Office cleaning with a crew that knows you</h1>
<h2>A written quote within one business day</h2>
<p>We clean offices, clinics and showrooms across the country. The owners answer the
phone themselves, there is no call centre, and every visit is done by the same crew.</p>`

function main(): void {
  console.log('\nA) the page be-cln.co.il actually serves')
  const beCln = extractSiteSignals(page('en-US', HEBREW_BODY, 'ניקיון משרדים | BE CLEAN'), URL, EXTRAS)
  check('A1: its own words are Hebrew', siteTextIsHebrew(beCln))
  check('A2: so its language is Hebrew, not the en-US it declares', pageLanguage(beCln) === 'he',
    String(pageLanguage(beCln)))
  check('A3: and the declaration we overrode really was English', beCln.htmlLang === 'en-us')

  console.log('\nB) every other page keeps its declaration, byte for byte')
  const cases: { name: string; lang: string | null; body: string; expect: string | null }[] = [
    { name: 'a Hebrew page that declares Hebrew', lang: 'he-IL', body: HEBREW_BODY, expect: 'he-il' },
    { name: 'a Hebrew page that declares the superseded iw', lang: 'iw', body: HEBREW_BODY, expect: 'iw' },
    { name: 'an English page', lang: 'en-US', body: ENGLISH_BODY, expect: 'en-us' },
    { name: 'a Spanish page', lang: 'es', body: ENGLISH_BODY, expect: 'es' },
    { name: 'a Brazilian page', lang: 'pt-BR', body: ENGLISH_BODY, expect: 'pt-br' },
    { name: 'an English page with no declaration', lang: null, body: ENGLISH_BODY, expect: null },
  ]
  for (const c of cases) {
    const s = extractSiteSignals(page(c.lang, c.body), URL, EXTRAS)
    check(`B1: ${c.name} → ${String(c.expect)}`, pageLanguage(s) === c.expect, String(pageLanguage(s)))
  }
  const noLangHebrew = extractSiteSignals(page(null, HEBREW_BODY), URL, EXTRAS)
  check('B2: a Hebrew page with no declaration is Hebrew, where before it was nothing',
    pageLanguage(noLangHebrew) === 'he' && noLangHebrew.htmlLang === null)

  console.log('\nC) the floors: too little Hebrew is not a Hebrew page')
  const fewLetters = extractSiteSignals(page('en-US', `${ENGLISH_BODY}<p>ניקיון משרדים</p>`), URL, EXTRAS)
  const hebrewLetters = ((fewLetters.text.match(/[֐-׿]/g) ?? []).length)
  check('C1: a Hebrew line inside an English page is below the letter floor',
    hebrewLetters > 0 && hebrewLetters < HEBREW_TEXT_MIN_LETTERS && pageLanguage(fewLetters) === 'en-us')
  // Enough Hebrew letters to clear the floor, but drowned in latin prose.
  const diluted = extractSiteSignals(page('en-US', `${ENGLISH_BODY}${ENGLISH_BODY}${ENGLISH_BODY}
    <p>ניקיון משרדים, ניקיון קליניקות, ניקיון מבנים, שירותי ניקיון לעסקים, ניקיון אחרי שיפוץ</p>`), URL, EXTRAS)
  const dilutedHe = ((diluted.text.match(/[֐-׿]/g) ?? []).length)
  const dilutedLatin = ((diluted.text.match(/[A-Za-z]/g) ?? []).length)
  check('C2: past the letter floor but under the share, the declaration stands',
    dilutedHe >= HEBREW_TEXT_MIN_LETTERS && dilutedHe / (dilutedHe + dilutedLatin) < HEBREW_TEXT_MIN_SHARE
      && pageLanguage(diluted) === 'en-us')
  check('C3: a Hebrew page keeps its latin brand and navigation words and is still Hebrew',
    pageLanguage(extractSiteSignals(page('en-US', `${HEBREW_BODY}<p>BE CLEAN · Home · About · Contact · WhatsApp</p>`), URL, EXTRAS)) === 'he')
  check('C4: an empty page is judged by nothing and keeps its declaration',
    pageLanguage(extractSiteSignals(page('en-US', '<p></p>'), URL, EXTRAS)) === 'en-us')

  console.log('\nD) where the decision is used')
  const src = readFileSync(join(__dirname, '../business-insight.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
  check('D1: the business language is the page language, never the bare attribute',
    /language:\s*pageLanguage\(signals\)/.test(src) && !/language:\s*signals\.htmlLang/.test(src))
  check('D2: and the prompt tells the model the same language',
    /PAGE LANGUAGE: \$\{pageLanguage\(signals\)/.test(src))

  console.log('\nMUTATION CONTROLS')
  // The defect itself: the attribute taken as the language.
  const asDeclared = (s: { htmlLang: string | null }) => s.htmlLang
  check('CONTROL 1: taking the attribute as the language answers en-us for be-cln (so A2 would fail)',
    asDeclared(beCln) === 'en-us' && pageLanguage(beCln) !== asDeclared(beCln))
  // A share floor of 0 would read any Hebrew letter as a Hebrew page.
  const shareless = (s: { text: string }) => ((s.text.match(/[֐-׿]/g) ?? []).length) > 0
  check('CONTROL 2: without the share floor the diluted English page reads as Hebrew (so C2 would fail)',
    shareless(diluted) && pageLanguage(diluted) === 'en-us')
  // A guard that only looked for the string would pass the unfixed source.
  check('CONTROL 3: the source guard catches the unfixed line',
    !/language:\s*pageLanguage\(signals\)/.test('  language: signals.htmlLang,'))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
