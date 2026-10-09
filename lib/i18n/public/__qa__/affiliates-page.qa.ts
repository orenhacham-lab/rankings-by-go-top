/**
 * The affiliate program's public page.
 *
 *   A) one offer: every language promises the SAME numbers, and the same ones the
 *      code uses. A page that said 30% in Hebrew and 25% in English would be an
 *      offer we could not honour.
 *   B) the page exists in every language, with its canonical and its hreflang
 *   C) it is reachable (the footer) and listed (the sitemap)
 *   D) what it must say, because the terms depend on it being said
 *   E) what it must NOT say: no rate it cannot keep, no promise of earnings
 *
 * Every guard has a MUTATION CONTROL.
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { AFFILIATES_COPY, AFFILIATE_TERMS } from '../affiliates'
import { AFFILIATE_FORM_COPY } from '../affiliate-form'
import { LOCALE_PREFIX } from '../../locales'
import { getPublicDictionary } from '../../getPublicDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const LANGS = ['he', 'en', 'es', 'pt-BR'] as const
const PAGES: Record<(typeof LANGS)[number], string> = {
  he: 'app/(public)/affiliates/page.tsx',
  en: 'app/(public)/en/affiliates/page.tsx',
  es: 'app/(public)/es/affiliates/page.tsx',
  'pt-BR': 'app/(public)/pt-BR/affiliates/page.tsx',
}

console.log('A) one offer, in every language')
{
  const T = AFFILIATE_TERMS
  // One source for the numbers. The page, the partner's dashboard, the commission
  // engine and the table's defaults all read lib/affiliate/terms.ts, so a rate can
  // never be raised on the page without the engine paying it.
  check('A1: the numbers are read from lib/affiliate/terms.ts, not retyped here',
    strip(read('lib/i18n/public/affiliates.ts')).includes("import { AFFILIATE_TERMS } from '@/lib/affiliate/terms'")
    && !/baseRate: \d+/.test(strip(read('lib/i18n/public/affiliates.ts'))))
  // Each language must name the rate and the higher rate in its own text.
  const names = (lang: (typeof LANGS)[number]) => {
    const text = JSON.stringify(AFFILIATES_COPY[lang])
    return text.includes(String(T.baseRate)) && text.includes(String(T.topRate))
  }
  check('A2: every language names the rate and the higher rate', LANGS.every(names))

  /**
   * A2b IS THE PROMISE GUARD. Attribution is the last click on the way to signing
   * up and NOTHING is stored on the visitor's device (lib/affiliate/referral.ts
   * says why). So the page may not offer a remembered period or a cookie: that
   * would be a memory we do not keep. A day count for the HOLD is a different
   * thing and is allowed, which is why this looks for the words of remembering
   * rather than for digits.
   */
  const REMEMBERS = [/cookie/i, /קוקי|עוגיי?ה/, /נזכר|נשמר למשך/, /remembered for/i, /recordad[oa] durante/i, /lembrad[oa] por/i, /ventana de atribución/i, /janela de atribuição/i, /attribution window/i, /חלון ייחוס/]
  const promisesMemory = (lang: (typeof LANGS)[number]) =>
    REMEMBERS.some((re) => re.test(JSON.stringify(AFFILIATES_COPY[lang])))
  check('A2b: no language offers a remembered period or a cookie',
    !LANGS.some(promisesMemory), LANGS.filter(promisesMemory).join(', '))
  check('A2c: the terms hold no attribution window for a page to pick up',
    !Object.keys(T).some((k) => /window|days/i.test(k) && k !== 'holdDays'), Object.keys(T).join(' '))
  /* A2b-MUT: put a remembered period back into one language and show A2b fails. */
  check('A2b-MUT: a remembered period put back into the copy is caught',
    REMEMBERS.some((re) => re.test(`${JSON.stringify(AFFILIATES_COPY.en)} your click is remembered for 90 days`)))
  // No language may carry a number that looks like a rate but is not one of ours.
  const strayRate = (lang: (typeof LANGS)[number]) => {
    const found = [...JSON.stringify(AFFILIATES_COPY[lang]).matchAll(/(\d{1,3})\s?%/g)].map((m) => Number(m[1]))
    return found.filter((n) => n !== T.baseRate && n !== T.topRate)
  }
  check('A3: no language promises a percentage we do not offer', LANGS.every((l) => strayRate(l).length === 0),
    JSON.stringify(Object.fromEntries(LANGS.map((l) => [l, strayRate(l)]))))
  check('A4: the payout minimum and the hold are the same everywhere (one constant, read by all three)',
    strip(read('lib/i18n/public/affiliates.ts')).includes('const T = AFFILIATE_TERMS')
    && !/minPayoutUsd: \d+[\s\S]*minPayoutUsd: \d+/.test(strip(read('lib/i18n/public/affiliates.ts'))))
  check('A5: every language has every field filled (no empty string anywhere)',
    LANGS.every((l) => !JSON.stringify(AFFILIATES_COPY[l]).includes('""')))
  check('A1-MUT: a rate retyped into the copy module fails A1',
    /baseRate: \d+/.test('export const X = { baseRate: 25 }'))
  check('A3-MUT: a stray "25%" in a language fails A3',
    [...'gana el 25% de cada pago'.matchAll(/(\d{1,3})\s?%/g)].map((m) => Number(m[1])).some((n) => n !== T.baseRate && n !== T.topRate))
}

console.log('\nB) the page, in every language')
{
  for (const lang of LANGS) {
    check(`B1 (${lang}): the route exists`, existsSync(join(ROOT, PAGES[lang])))
  }
  const src = Object.fromEntries(LANGS.map((l) => [l, strip(read(PAGES[l]))])) as Record<(typeof LANGS)[number], string>
  const all = LANGS.map((l) => src[l])
  check('B2: each route renders its own language', LANGS.every((l) => new RegExp(`locale="${l}"`).test(src[l])))
  const CANONICAL: Record<(typeof LANGS)[number], string> = {
    he: '/affiliates', en: '/en/affiliates', es: '/es/affiliates', 'pt-BR': '/pt-BR/affiliates',
  }
  check('B3: each canonical is its own URL',
    LANGS.every((l) => src[l].includes(`'https://www.gotopseo.com${CANONICAL[l]}'`)),
    LANGS.filter((l) => !src[l].includes(`'https://www.gotopseo.com${CANONICAL[l]}'`)).join(' '))
  // The Portuguese URL is DERIVED from the Spanish one inside the helper
  // (lib/seo/hreflang.ts), so every route states the same three paths and a
  // gated language is dropped by its flag rather than by a route forgetting it.
  check('B4: all four declare the same hreflang set (a gated language is dropped by its flag, not here)',
    all.every((s2) => /buildHreflangAlternates\('\/affiliates', '\/en\/affiliates', '\/es\/affiliates'\)/.test(s2)))
  check('B5: the title and description come from the shared copy, never retyped per route',
    all.every((s2) => /title: C\.metaTitle/.test(s2) && /description: C\.metaDescription/.test(s2)))
  check('B3-MUT: a route that reuses the Hebrew canonical fails B3',
    !src.en.replace("'https://www.gotopseo.com/en/affiliates'", "'https://www.gotopseo.com/affiliates'").includes("'https://www.gotopseo.com/en/affiliates'"))
}

console.log('\nC) reachable and listed')
{
  const footer = strip(read('components/Footer.tsx'))
  const linked = (s: string) => /href=\{`\$\{prefix\}\/affiliates`\}/.test(s) && /dict\.footer\.affiliates/.test(s)
  check('C1: the footer links to it, in the reader\'s own language', linked(footer))
  check('C2: every language names that link', LANGS.every((l) => !!getPublicDictionary(l).footer.affiliates))
  const sitemap = strip(read('app/sitemap.xml/route.ts'))
  // Hebrew and English are listed URL by URL; the translated trees come from one
  // shared path list, so /affiliates appearing in it covers Spanish and
  // Portuguese at once and the two cannot drift apart.
  check('C3: every language is in the sitemap', /\/affiliates`/.test(sitemap)
    && /\/en\/affiliates`/.test(sitemap) && /path: '\/affiliates'/.test(sitemap))
  check('C4: a translated tree is listed only inside its own flag',
    /const spanishPages = spanishSiteEnabled\(\) \? treePages\('\/es'\) : \[\]/.test(sitemap)
    && /const portuguesePages = portugueseSiteEnabled\(\) \? treePages\('\/pt-BR'\) : \[\]/.test(sitemap))
  check('C4-MUT: a tree listed unconditionally fails C4',
    !/const spanishPages = spanishSiteEnabled\(\) \? treePages\('\/es'\) : \[\]/
      .test(sitemap.replace("const spanishPages = spanishSiteEnabled() ? treePages('/es') : []", "const spanishPages = treePages('/es')")))
  check('C1-MUT: a footer without the link fails C1', !linked(footer.replace(/href=\{`\$\{prefix\}\/affiliates`\}/, 'href="/"')))
}

console.log('\nD) what the page must say')
{
  // These three sentences are what the program's defences rest on. If the page stops
  // saying them, the terms are promising something the page never told the affiliate.
  const must: Record<(typeof LANGS)[number], RegExp[]> = {
    he: [/אישור|מאשרים|מועמדות/, /לא על עצמכם|החשבון שלכם/, /חשבונית/],
    en: [/approve|application|apply/i, /your own account/i, /invoice/i],
    es: [/aprob|solicitud|solicít/i, /tu propia cuenta/i, /factura/i],
    'pt-BR': [/aprov|candidatura|candidat/i, /sua própria conta/i, /nota fiscal/i],
  }
  for (const lang of LANGS) {
    const text = JSON.stringify(AFFILIATES_COPY[lang])
    check(`D1 (${lang}): it states manual approval, the self-referral rule and the invoice rule`,
      must[lang].every((re) => re.test(text)), must[lang].filter((re) => !re.test(text)).map(String).join(' '))
  }
  check('D2: the page takes an application, and still leaves a way to talk', (() => {
    const page = strip(read('components/public/AffiliatesPage.tsx'))
    return /<AffiliateApplicationForm locale=\{locale\} \/>/.test(page)
      && /href: '#affiliate-apply'/.test(page)
      && /whatsappHelpUrl\(c\.whatsappMessage\)/.test(page)
  })())
  // A code exists only after a person decided, so the form may never create one.
  check('D3: the form only records an application; no code, no approval', (() => {
    const route = strip(read('app/api/affiliate/apply/route.ts'))
    return /status: 'pending'/.test(route) && !/\bcode\s*:/.test(route)
  })())
  check('D2-MUT: a page without the form fails D2',
    !/<AffiliateApplicationForm locale=\{locale\} \/>/
      .test(strip(read('components/public/AffiliatesPage.tsx')).replace('<AffiliateApplicationForm locale={locale} />', '<div />')))
  check('D1-MUT: copy with the self-referral rule removed fails D1',
    !must.en.every((re) => re.test(JSON.stringify(AFFILIATES_COPY.en).replace(/your own account/gi, 'a nice account'))))
}

console.log('\nE) what it must NOT say')
{
  // Zero paying customers today, so no page may imply a track record or earnings.
  const forbidden = [/guaranteed/i, /מובטח/, /garantizad/i, /garantid/i, /passive income/i, /הכנסה פסיבית/, /renda passiva/i]
  for (const lang of LANGS) {
    const text = JSON.stringify(AFFILIATES_COPY[lang])
    check(`E1 (${lang}): no guarantee and no "passive income" promise`, !forbidden.some((re) => re.test(text)))
  }
  check('E1-MUT: a copy promising guaranteed income fails E1',
    forbidden.some((re) => re.test(JSON.stringify({ x: 'guaranteed monthly income' }))))
}

console.log('F) the offer points at the terms that bind it')
{
  /**
   * The page states rates, payout thresholds and reversal rules, so it is an
   * offer. An offer a partner cannot trace to its agreement is terms they never
   * agreed to — the legal thread raised it and it was right. Each language must
   * carry the sentence, the link label, and a link to ITS OWN copy of the
   * agreement: an English partner sent to the Hebrew document has not been shown
   * the terms either.
   */
  const PAGE = strip(read('components/public/AffiliatesPage.tsx'))
  check('F1: the page links to the agreement, built from the reader’s own locale prefix',
    PAGE.includes('${LOCALE_PREFIX[locale]}/affiliate-terms'))
  check('F2: every language carries the sentence and the link label',
    LANGS.every((l) => AFFILIATES_COPY[l].termsNote.length > 20 && AFFILIATES_COPY[l].termsLink.length > 3))
  check('F3: no language was left reading another language’s words', (() => {
    const notes = LANGS.map((l) => AFFILIATES_COPY[l].termsNote)
    return new Set(notes).size === notes.length
  })())
  // Every route the link can resolve to must actually exist, or the page points
  // a partner at a 404 where the terms should be.
  check('F4: the agreement exists at every language’s route', LANGS.every((l) => {
    const prefix = LOCALE_PREFIX[l]
    return existsSync(join(ROOT, `app/(public)${prefix}/affiliate-terms/page.tsx`))
      || (prefix === '' && existsSync(join(ROOT, 'app/(legal)/affiliate-terms/page.tsx')))
  }), LANGS.filter((l) => {
    const prefix = LOCALE_PREFIX[l]
    return !existsSync(join(ROOT, `app/(public)${prefix}/affiliate-terms/page.tsx`))
      && !(prefix === '' && existsSync(join(ROOT, 'app/(legal)/affiliate-terms/page.tsx')))
  }).join(', '))
  /* F1-MUT: the same page with the link taken out — F1 must fail on it. */
  check('F1-MUT: a page that drops the link is caught',
    !PAGE.replace('${LOCALE_PREFIX[locale]}/affiliate-terms', '#').includes('${LOCALE_PREFIX[locale]}/affiliate-terms'))
}

console.log('G) who can be paid: the invoicing rule is not Israel-only')
{
  /**
   * The agreement pays a partner anywhere: PayPal, Wise, bank transfer or credit
   * against their own subscription, and it has a clause for a partner outside
   * Israel (their own tax reporting). The page's invoicing card, though, named
   * only the Israeli case in Hebrew, English and Spanish, so a reader abroad
   * concluded the program could not pay them — Oren read it that way himself on
   * 9 October 2026. A rule that names one country's paperwork and not the other's
   * is how a page refuses an audience the agreement accepts.
   */
  const ISRAEL: Record<(typeof LANGS)[number], string> = { he: 'ישראל', en: 'Israel', es: 'Israel', 'pt-BR': 'Israel' }
  const OUTSIDE: Record<(typeof LANGS)[number], string> = { he: 'מחוץ לישראל', en: 'Outside Israel', es: 'Fuera de Israel', 'pt-BR': 'Fora de Israel' }
  // The cards this rule is about: the ones that talk about invoicing or credit.
  const PAPERWORK: Record<(typeof LANGS)[number], RegExp> = {
    he: /חשבונית|קרדיט/,
    en: /invoic|account credit/i,
    es: /factura|crédito/i,
    'pt-BR': /nota fiscal|crédito/i,
  }
  const paperworkCards = (lang: (typeof LANGS)[number]) =>
    AFFILIATES_COPY[lang].rules.filter((r) => PAPERWORK[lang].test(`${r.title} ${r.body}`))
  check('G1: every language has an invoicing card', LANGS.every((l) => paperworkCards(l).length > 0))
  check('G2: a card that names Israel’s paperwork also says what happens outside Israel',
    LANGS.every((l) => paperworkCards(l).every((r) => {
      const text = `${r.title} ${r.body}`
      return !text.includes(ISRAEL[l]) || text.includes(OUTSIDE[l])
    })),
    LANGS.filter((l) => paperworkCards(l).some((r) => {
      const text = `${r.title} ${r.body}`
      return text.includes(ISRAEL[l]) && !text.includes(OUTSIDE[l])
    })).join(', '))
  /**
   * The commission is stated gross, and clause 13 has us withhold tax at source
   * from an Israeli partner unless they hold a valid exemption certificate and a
   * certificate of proper bookkeeping. The difference between the 30% on the page
   * and the money that arrives is the most consequential thing on this card, so
   * the condition is stated in every language — it depends on where the partner
   * is, not on which page they read — and the card points at clause 13 rather
   * than reciting it.
   */
  const WITHHOLDING: Record<(typeof LANGS)[number], RegExp> = {
    he: /מנכים מס/,
    en: /withhold tax/i,
    es: /retenemos impuesto/i,
    'pt-BR': /retemos imposto/i,
  }
  const CLAUSE: Record<(typeof LANGS)[number], RegExp> = {
    he: /סעיף 13/,
    en: /Clause 13/i,
    es: /cláusula 13/i,
    'pt-BR': /cláusula 13/i,
  }
  check('G4: every language says we withhold tax at source, and on what condition',
    LANGS.every((l) => paperworkCards(l).some((r) => WITHHOLDING[l].test(r.body))),
    LANGS.filter((l) => !paperworkCards(l).some((r) => WITHHOLDING[l].test(r.body))).join(', '))
  check('G5: the card points at the agreement’s clause 13 instead of reciting it',
    LANGS.every((l) => paperworkCards(l).some((r) => CLAUSE[l].test(r.body))))
  /* G4-MUT: the card as it read before the withholding condition was added —
     G4 must fail on it, in every language. */
  check('G4-MUT: a card that states the commission without the deduction is caught', LANGS.every((l) => {
    const previous = {
      he: 'שותף ישראלי מוציא לנו חשבונית. שותף מחוץ לישראל מתחשבן לפי הכללים של המדינה שלו.',
      en: 'Israeli affiliates invoice us. Outside Israel, invoicing follows the rules of your own country.',
      es: 'Los afiliados en Israel nos emiten factura. Fuera de Israel, la factura sigue las reglas de tu país.',
      'pt-BR': 'Afiliados em Israel emitem nota fiscal para nós. Fora de Israel, a nota fiscal segue a regra do seu país.',
    }[l]
    return !WITHHOLDING[l].test(previous)
  }))
  // The premise of the rule: the form expects applicants from anywhere, so it
  // asks the country rather than assuming one.
  check('G3: the application form asks the applicant’s country',
    /country: ''/.test(strip(read('components/public/AffiliateApplicationForm.tsx')))
    && LANGS.every((l) => AFFILIATE_FORM_COPY[l].country.length > 1))
  /* G2-MUT: the wording this page actually carried until 9 October 2026, run
     through G2's own predicate. Each of the three must be rejected. */
  const israelOnly = (lang: (typeof LANGS)[number], title: string, body: string) => {
    const text = `${title} ${body}`
    return text.includes(ISRAEL[lang]) && !text.includes(OUTSIDE[lang])
  }
  check('G2-MUT: the three Israel-only cards the page used to carry are caught',
    israelOnly('he', 'חשבונית בישראל', 'שותף ישראלי מוציא לנו חשבונית. מי שאין לו עוסק יכול לקבל במקום זה קרדיט בחשבון.')
    && israelOnly('en', 'Invoices in Israel', 'Israeli affiliates invoice us. Anyone without a registered business can take account credit instead.')
    && israelOnly('es', 'Factura en Israel', 'Los afiliados en Israel nos emiten factura. Quien no tenga actividad dada de alta puede recibir crédito en su cuenta.'))
  check('G2-MUT2: the wording now on the page passes that same predicate',
    LANGS.every((l) => paperworkCards(l).every((r) => !israelOnly(l, r.title, r.body))))
  /* G3-MUT: a form that dropped the country field — G3 must fail on it. */
  check('G3-MUT: a form with no country field is caught',
    !/country: ''/.test(strip(read('components/public/AffiliateApplicationForm.tsx')).replace("country: ''", "")))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
