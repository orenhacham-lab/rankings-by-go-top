/**
 * The pricing pages (wave 7): persuasive, honest, and still the grid the plan
 * guards in lib/plans/__qa__ measure.
 *
 *   A) the server render of the sections around the grid carries every word of
 *      both dictionaries, nothing is rendered waiting to be revealed, and the
 *      close offers the free check before the trial;
 *   B) each page reads its own dictionary, links its own free check and privacy
 *      policy, and shows every card word from the copy;
 *   C) honesty: the engine count is the number of engines the product scores,
 *      the FAQ's figures are the catalog's, the badge makes no sales claim, and
 *      the data answer no longer says "never shared with third parties";
 *   D) the Hebrew page is Hebrew and the English page is English;
 *   E) the browser guard's assumptions hold: no other element on the page
 *      carries `lg:grid-cols-4` (it reads the FIRST one as the plan grid), and
 *      nothing inside a card links anywhere before its button (it reads the
 *      FIRST link in a card as the plan's call to action).
 * Each group ends with a MUTATION CONTROL: the same check on a deliberately
 * broken copy must fail.
 *
 * Run: npx tsx components/public/__qa__/pricing-page.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

// A server render needs the CSS module stubbed (Next compiles it; node cannot).
const Mod: any = require('module')
Mod._extensions['.css'] = (m: any) => { m.exports = new Proxy({}, { get: (_t, k) => (k === '__esModule' ? false : String(k)) }) }

const HE_PAGE = 'app/(public)/pricing/page.tsx'
const EN_PAGE = 'app/(public)/en/pricing/page.tsx'

function leaves(o: unknown, out: string[] = []): string[] {
  if (typeof o === 'string') out.push(o)
  else if (Array.isArray(o)) o.forEach((x) => leaves(x, out))
  else if (o && typeof o === 'object') Object.values(o).forEach((x) => leaves(x, out))
  return out
}
const unescape = (html: string) => html.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<!-- -->/g, '')

async function main() {
  const S = require(join(ROOT, 'components/public/pricing/PricingSections.tsx'))
  const { MarketingHero } = require(join(ROOT, 'components/public/landing/MarketingHero.tsx'))
  const { pricingHe } = require(join(ROOT, 'lib/i18n/public/pricing-he.ts'))
  const { pricingEn } = require(join(ROOT, 'lib/i18n/public/pricing-en.ts'))
  const { PLAN_CATALOG, TRIAL_CATALOG } = require(join(ROOT, 'lib/plans/catalog.ts'))
  const { SCORED_ENGINES } = require(join(ROOT, 'lib/ai-visibility/score.ts'))

  const LOCALES = [
    { l: 'he', copy: pricingHe, check: '/free-check', privacy: '/privacy', page: HE_PAGE },
    { l: 'en', copy: pricingEn, check: '/en/free-check', privacy: '/en/privacy', page: EN_PAGE },
  ] as const

  const render = (copy: any, checkHref: string) => renderToStaticMarkup(createElement(Fragment, null,
    createElement(MarketingHero, { eyebrow: copy.hero.eyebrow, title: copy.hero.title, accent: copy.hero.accent, subtitle: copy.hero.subtitle, trust: copy.hero.trust }),
    createElement(S.PricingUnsure, { copy, checkHref }),
    createElement(S.PricingIncluded, { copy }),
    createElement(S.PricingValue, { copy }),
    createElement(S.PricingUsage, { copy }),
    createElement(S.PricingFaq, { copy }),
    createElement(S.PricingClose, { copy, checkHref, startHref: '/signup', signedIn: false }),
  ))
  /** Words the sections must show; `plans` is the grid's (checked in B), the dashboard label is signed-in only. */
  const sectionWords = (copy: any) => {
    const { plans: _p, ...rest } = copy
    void _p
    return leaves(rest).filter((s) => s !== copy.cta.dashboard && !s.startsWith('/'))
  }
  const missing = (html: string, copy: any) => sectionWords(copy).filter((s) => !unescape(html).includes(s))

  console.log('A) the sections around the grid render complete, the free check first')
  for (const { l, copy, check: checkHref } of LOCALES) {
    const html = render(copy, checkHref)
    const miss = missing(html, copy)
    check(`A1 (${l}): every word of the dictionary is in the server render`, miss.length === 0, miss.slice(0, 3).join(' | '))
    const rises = html.match(/data-rise="[^"]*"/g) ?? []
    check(`A2 (${l}): nothing is rendered waiting to be revealed`, rises.length > 0 && rises.every((r) => r === 'data-rise="static"'), [...new Set(rises)].join(','))
    const close = html.slice(html.lastIndexOf(copy.cta.title))
    const firstHref = close.match(/href="([^"]+)"/)?.[1]
    check(`A3 (${l}): the close offers the free check first`, firstHref === checkHref, String(firstHref))
  }
  {
    const broken = { ...pricingHe, value: { ...pricingHe.value, items: [...pricingHe.value.items, { title: 'כותרת שלא מוצגת', desc: 'x' }] } }
    check('MUTATION CONTROL: a dictionary word the layout drops is caught', missing(render(pricingHe, '/free-check'), broken).length > 0)
    const full = render(pricingHe, '/free-check')
    const c = full.slice(full.lastIndexOf(pricingHe.cta.title)).replace('href="/free-check"', 'href="/signup"')
    check('MUTATION CONTROL: a close that leads with the trial is caught', c.match(/href="([^"]+)"/)?.[1] !== '/free-check')
  }

  console.log('\nB) each page reads its own dictionary and links its own pages')
  const pageOk = (src: string, l: 'he' | 'en', checkHref: string) => {
    const s = strip(src)
    const other = l === 'he' ? 'pricing-en' : 'pricing-he'
    return s.includes(`@/lib/i18n/public/pricing-${l}'`) && !s.includes(other)
      && (s.match(new RegExp(`checkHref="${checkHref.replace(/\//g, '\\/')}"`, 'g')) ?? []).length === 2
      && ['perMonth', 'popular', 'cta', 'dashboard', 'noCard', 'everyPlanLabel', 'everyPlan'].every((k) => s.includes(`copy.plans.${k}`))
  }
  for (const { l, copy, check: checkHref, privacy, page } of LOCALES) {
    check(`B1 (${l}): ${page} reads its own dictionary, links its own free check, shows every card word`, pageOk(read(page), l, checkHref))
    const link = copy.faq.items.find((i: any) => i.link)?.link
    check(`B2 (${l}): the data answer links the ${l} privacy policy`, link?.href === privacy, String(link?.href))
  }
  check('MUTATION CONTROL: the Hebrew page reading the English words is caught',
    !pageOk(read(HE_PAGE).replace("@/lib/i18n/public/pricing-he'", "@/lib/i18n/public/pricing-en'"), 'he', '/free-check'))
  check('MUTATION CONTROL: the English page linking the Hebrew free check is caught',
    !pageOk(read(EN_PAGE).replace('checkHref="/en/free-check"', 'checkHref="/free-check"'), 'en', '/en/free-check'))

  console.log('\nC) honesty: figures from the product, no sales claim, no false privacy promise')
  const INVENTED = [/most popular/i, /הכי פופולרי/, /best[- ]selling/i, /\d[\d,]*\+?\s*(customers|businesses|clients|users)/i, /\d[\d,]*\+?\s*(לקוחות|עסקים|משתמשים)/, /never shared/i, /לא משותפים עם צדדים שלישיים/, /guarantee/i, /מבטיחים/, /trusted by/i]
  const honest = (copy: any) => {
    const all = leaves(copy).join('\n')
    const engines = copy.plans.everyPlan.join(' ').match(/(\d+)/)?.[1]
    const which = copy.faq.items[0].a
    return Number(engines) === SCORED_ENGINES.length
      && which.includes(String(PLAN_CATALOG.regular.maxArticlesPerPeriodAccountWide))
      && which.includes(String(PLAN_CATALOG.advanced.maxArticlesPerPeriodAccountWide))
      && copy.faq.items[1].a.includes(String(TRIAL_CATALOG.maxKeywordsPerProject))
      && copy.faq.items[1].a.includes(String(TRIAL_CATALOG.maxAIChecksLifetime))
      && copy.hero.trust[0].includes(String(TRIAL_CATALOG.days))
      && !INVENTED.some((re) => re.test(all))
  }
  for (const { l, copy } of LOCALES) {
    check(`C1 (${l}): ${SCORED_ENGINES.length} engines, catalog figures, no invented proof or promise`, honest(copy))
  }
  check('MUTATION CONTROL: a "most popular" badge is caught', !honest({ ...pricingEn, plans: { ...pricingEn.plans, popular: 'Most popular' } }))
  check('MUTATION CONTROL: a wrong engine count is caught',
    !honest({ ...pricingHe, plans: { ...pricingHe.plans, everyPlan: pricingHe.plans.everyPlan.map((s: string) => s.replace(/\d+/, '7')) } }))
  check('MUTATION CONTROL: the old "never shared with third parties" answer is caught',
    !honest({ ...pricingEn, faq: { ...pricingEn.faq, items: [...pricingEn.faq.items, { q: 'Is my data secure?', a: 'Absolutely. Never shared with third parties.' }] } }))

  console.log('\nD) one language per page')
  // Brand and product names stay in Latin script on the Hebrew page.
  const LATIN_OK = /^(ChatGPT|Gemini|Perplexity|Copilot|Grok|Google|AI|PDF|Excel|SSL|TLS|Go|Top|WordPress|Shopify|Creem)$/
  const words = (copy: any) => leaves(copy).filter((s) => !s.startsWith('/'))
  const hebrewOk = (copy: any) => words(copy).every((s) => (s.match(/[A-Za-z]+/g) ?? []).every((w) => LATIN_OK.test(w)) && (/[֐-׿]/.test(s) || !/[A-Za-z]{3}/.test(s)))
  const englishOk = (copy: any) => leaves(copy).every((s) => !/[֐-׿]/.test(s))
  check('D1: the Hebrew pricing words are Hebrew (brand names aside)', hebrewOk(pricingHe),
    words(pricingHe).filter((s) => !(s.match(/[A-Za-z]+/g) ?? []).every((w) => LATIN_OK.test(w))).slice(0, 2).join(' | '))
  check('D2: the English pricing words contain no Hebrew', englishOk(pricingEn))
  check('MUTATION CONTROL: an English sentence on the Hebrew page is caught', !hebrewOk({ ...pricingHe, unsure: { ...pricingHe.unsure, cta: 'Check my site' } }))
  check('MUTATION CONTROL: a Hebrew word on the English page is caught', !englishOk({ ...pricingEn, unsure: { ...pricingEn.unsure, cta: 'בדקו' } }))

  console.log('\nE) the browser guard reads the grid it expects')
  const soleGrid = (sections: string, hero: string) => !/lg:grid-cols-4/.test(strip(sections)) && !/lg:grid-cols-4/.test(strip(hero))
  const sectionsSrc = read('components/public/pricing/PricingSections.tsx')
  const heroSrc = read('components/public/landing/MarketingHero.tsx')
  check('E1: no section around the grid carries lg:grid-cols-4', soleGrid(sectionsSrc, heroSrc))
  const ctaFirst = (src: string) => {
    const s = strip(src)
    const card = s.slice(s.indexOf('{PLAN_ORDER.map((code) => {'), s.indexOf('<ButtonLink', s.indexOf('{PLAN_ORDER.map((code) => {')))
    return card.length > 0 && !/href=|<a\b|<Link\b|<ButtonLink\b/.test(card)
      && (s.match(/lg:grid-cols-4/g) ?? []).length === 1
  }
  for (const page of [HE_PAGE, EN_PAGE]) check(`E2: ${page} has one 4-column grid and no link in a card before its button`, ctaFirst(read(page)))
  check('MUTATION CONTROL: a 4-column "included" grid is caught', !soleGrid(sectionsSrc.replace('lg:grid-cols-3" data-included-grid', 'lg:grid-cols-4" data-included-grid'), heroSrc))
  check('MUTATION CONTROL: a link above a card\'s button is caught',
    !ctaFirst(read(HE_PAGE).replace('<h3 className=', '<a href="/features" className="sr-only">x</a><h3 className=')))

  console.log('\nF) the price in the grid is not presented as the final price')
  /*
   * On a card payment Creem is the merchant of record and calculates indirect
   * tax on the buyer's billing address (Merchant Terms 9.1, 3.3.4), so the
   * figure in the grid is not what the buyer pays. An EU consumer has to see a
   * tax-inclusive final price before paying; Creem's checkout is where that
   * happens, and this sentence is what stops the grid from reading as the whole
   * price. It is checked in all four dictionaries, not just the two pages this
   * suite renders, because a missing sentence in one language is a price claim
   * we cannot keep in that language.
   *
   * The sentence deliberately says nothing about the shekel prices: whether
   * those include Israeli VAT is not settled anywhere in the code or the terms,
   * so a guard that demanded a statement about them would be demanding a guess.
   */
  {
    const { pricingEs } = require(join(ROOT, 'lib/i18n/public/pricing-es.ts'))
    const { pricingPtBR } = require(join(ROOT, 'lib/i18n/public/pricing-pt-BR.ts'))
    const NOT_INCLUDED: Record<string, RegExp> = {
      he: /המחירים כאן אינם כוללים אותו/,
      en: /The prices here do not include it/,
      es: /Los precios de aquí no lo incluyen/,
      'pt-BR': /Os preços aqui não o incluem/,
    }
    const dicts: [string, any][] = [['he', pricingHe], ['en', pricingEn], ['es', pricingEs], ['pt-BR', pricingPtBR]]
    for (const [l, copy] of dicts) {
      const note = copy.plans.taxNote as string | undefined
      check(`F1 (${l}): the grid carries a tax note`, typeof note === 'string' && note.length > 0)
      check(`F2 (${l}): it names Creem as the one that adds the tax`, /Creem/.test(note ?? ''))
      check(`F3 (${l}): it says the price shown does not include that tax`, (NOT_INCLUDED[l] ?? /$^/).test(note ?? ''))
    }
    const noteMarkup = renderToStaticMarkup(createElement(S.PricingChecksNote, { copy: pricingHe }))
    check('F4: the note is rendered under the grid, not only stored',
      noteMarkup.includes('data-tax-note') && noteMarkup.includes(pricingHe.plans.taxNote))
    check('MUTATION CONTROL: a note that stops at naming Creem is caught',
      !NOT_INCLUDED.en.test('On a card payment the merchant of record is Creem.'))
    check('MUTATION CONTROL: a note claiming the price is tax inclusive is caught',
      !NOT_INCLUDED.es.test('Los precios de aquí incluyen todos los impuestos aplicables.'))
    check('MUTATION CONTROL: a dictionary with no tax note at all is caught',
      !(typeof ({ ...pricingHe.plans, taxNote: undefined }).taxNote === 'string'))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 })

export {}
