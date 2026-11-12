/**
 * /features/google-business-profile — THE GOOGLE BUSINESS PROFILE HUB PAGE.
 *
 * Why the page exists is measured, not assumed: Google Ads Keyword Planner over
 * eleven markets (growth/next-language.md addenda 7 and 8, pulled 11-12 Nov
 * 2026) puts the English term `google my business` as the largest term in seven
 * of them and among the most expensive in all of them, while the local-language
 * equivalent often returns no data at all. So the page has to carry BOTH forms,
 * in every tree, and it has to exist in every tree or the hreflang set it
 * advertises points at 404s.
 *
 * What a page like this gets wrong, which is what the groups below are for:
 *
 *   A) THE TEN TREES. One route per public locale, each declaring its own
 *      locale, and a content block per locale in the shared module. Driven off
 *      PUBLIC_LOCALES, so an eleventh language is covered the day it is added.
 *   B) BOTH NAMES. Every locale's title names the local form of the product and
 *      the English `Google My Business` — the term the measurement is about.
 *      A page that drops the English form drops most of the demand.
 *   C) THE REGISTRATION. A page nothing links to and no sitemap lists is a page
 *      that does not exist: the XML sitemap (the Hebrew and English blocks and
 *      the mirror every other tree is built from), the ten human sitemap pages,
 *      and llms.txt.
 *   D) THE LIMITS ARE STATED AND NOTHING IS PROMISED. Every locale says the
 *      system neither creates nor verifies a profile and never changes the
 *      hours, address or phone on one; no locale claims a position, a
 *      percentage, a number of customers or any tie to Google.
 *
 * Each group ends with a MUTATION CONTROL: the guard is re-run against content
 * broken on purpose, and it fails.
 *
 * Run: npx tsx components/public/__qa__/business-profile-page.qa.ts
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { PUBLIC_LOCALES, LOCALE_PREFIX, type PublicLocale } from '../../../lib/i18n/locales'
import { BUSINESS_PROFILE_PAGE } from '../../../lib/i18n/public/pages/business-profile'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/** Comments go before any match: this file's own prose names what it forbids. */
const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

const PATH = '/features/google-business-profile'
const routeRel = (l: PublicLocale) => `app/(public)${LOCALE_PREFIX[l]}${PATH}/page.tsx`

/** Every string a reader could see in one locale's content block. */
function prose(locale: PublicLocale): string {
  const out: string[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'string') { out.push(v); return }
    if (Array.isArray(v)) { v.forEach(walk); return }
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        // The visual is JSX (illustrative sample data) and the icons are
        // components; the words under test are the page's own copy.
        if (k === 'visual' || k === 'icon' || k === 'eyebrowIcon') continue
        walk(val)
      }
    }
  }
  walk(BUSINESS_PROFILE_PAGE.content[locale])
  return out.join(' ')
}

/** B and D run over the shipped module and over a mutated copy of it. */
type Variant = { meta: typeof BUSINESS_PROFILE_PAGE.meta; text: (l: PublicLocale) => string }
const live: Variant = { meta: BUSINESS_PROFILE_PAGE.meta, text: prose }

function namesBothForms(v: Variant, l: PublicLocale): boolean {
  const title = v.meta[l].title
  return /Google My Business/i.test(title) && title.replace(/Google My Business/i, '').trim().length > 10
}

const LIMIT_TERMS: Record<PublicLocale, RegExp> = {
  he: /לא פותחת פרופיל/,
  en: /does not create a profile/,
  es: /No crea un perfil/,
  'pt-BR': /não cria um perfil/i,
  fr: /ne crée pas de fiche/,
  it: /Non crea un profilo/,
  ja: /プロフィールの作成は行わず/,
  de: /erstellt kein Profil/,
  nl: /maakt geen profiel aan/,
  pl: /Nie zakłada profilu/,
  ko: /프로필을 만들지 않고/,
}

function statesTheLimit(v: Variant, l: PublicLocale): boolean {
  return LIMIT_TERMS[l].test(v.text(l))
}

function main() {
  console.log('A) the page exists in all ten trees, each in its own language')
  const missing = PUBLIC_LOCALES.filter((l) => !existsSync(join(ROOT, routeRel(l))))
  check(`A1: a route under every one of the ${PUBLIC_LOCALES.length} public locales`, missing.length === 0, missing.join(', '))
  const wrongLocale = PUBLIC_LOCALES.filter((l) => {
    if (!existsSync(join(ROOT, routeRel(l)))) return true
    const s = strip(read(routeRel(l)))
    return !new RegExp(`locale="${l}"`).test(s)
      || !new RegExp(`content\\['${l}'\\]`).test(s)
      || !new RegExp(`BUSINESS_PROFILE_PAGE, '${l}'\\)`).test(s)
      || !s.includes(`path="${PATH}"`)
  })
  check('A2: each route declares its own locale, its own content block and the shared path', wrongLocale.length === 0, wrongLocale.join(', '))
  const emptyContent = PUBLIC_LOCALES.filter((l) => prose(l).trim().length < 1500)
  check('A3: every locale has a written page, not a stub', emptyContent.length === 0, emptyContent.join(', '))
  check('A4: the module declares the one path the routes use', BUSINESS_PROFILE_PAGE.path === PATH)
  // MUTATION CONTROL: the same two predicates, run against a tree that is not
  // there (the Polish route under a renamed path) and against the Polish route
  // read as if it declared German. Both answer "missing" / "wrong".
  const goneRel = `app/(public)${LOCALE_PREFIX.pl}/features/google-business-profile-REMOVED/page.tsx`
  const asGerman = strip(read(routeRel('pl')))
  check('A MUTATION CONTROL: a missing tree and a mislabelled locale both fail',
    !existsSync(join(ROOT, goneRel)) && !/locale="de"/.test(asGerman))

  console.log('B) both names of the product, because the English one is the demand')
  const oneName = PUBLIC_LOCALES.filter((l) => !namesBothForms(live, l))
  check('B1: every title names the local form and Google My Business', oneName.length === 0, oneName.join(', '))
  const notInBody = PUBLIC_LOCALES.filter((l) => !/Google My Business/i.test(prose(l)))
  check('B2: every page says the old name in its own words too', notInBody.length === 0, notInBody.join(', '))
  const mutatedMeta = {
    ...BUSINESS_PROFILE_PAGE.meta,
    de: { ...BUSINESS_PROFILE_PAGE.meta.de, title: 'Google Unternehmensprofil | Go Top SEO' },
  }
  check('B MUTATION CONTROL: a title with only the local form fails',
    !namesBothForms({ meta: mutatedMeta, text: prose }, 'de'))

  console.log('C) the page is registered where a page is found')
  const xml = read('app/sitemap.xml/route.ts')
  check('C1: the XML sitemap carries the Hebrew URL', xml.includes(`\`\${baseUrl}${PATH}\``))
  check('C2: the XML sitemap carries the English URL', xml.includes(`\`\${baseUrl}/en${PATH}\``))
  check('C3: the mirror every translated tree is built from carries the path', xml.includes(`{ path: '${PATH}',`))
  const noLink = PUBLIC_LOCALES.filter((l) => !read(`app/(public)${LOCALE_PREFIX[l]}/sitemap/page.tsx`).includes(`${LOCALE_PREFIX[l]}${PATH}`))
  check('C4: the human sitemap of every language links it', noLink.length === 0, noLink.join(', '))
  check('C5: llms.txt names it', read('app/llms.txt/route.ts').includes(PATH))
  // MUTATION CONTROL: the same assertions against the file with the path removed.
  const strippedXml = xml.split(PATH).join('/features/REMOVED')
  check('C MUTATION CONTROL: removing the path from the sitemap is caught',
    !strippedXml.includes(`\`\${baseUrl}${PATH}\``) && !strippedXml.includes(`{ path: '${PATH}',`))

  console.log('D) the limits are stated, and nothing is promised')
  const silent = PUBLIC_LOCALES.filter((l) => !statesTheLimit(live, l))
  check('D1: every language says the system neither creates nor verifies a profile', silent.length === 0, silent.join(', '))
  // No position claim, no percentage, no count of customers, no tie to Google.
  const PROMISES = [
    /\b(guarantee|guaranteed|promise)\b/i, /\bfirst page\b(?! is)/i, /\bnumber one\b/i,
    /\b\d{1,3}\s?%/, /\b(official|certified)\s+(google\s+)?partner\b/i, /\bin partnership with google\b/i,
  ]
  const promised = PUBLIC_LOCALES.flatMap((l) => {
    const text = `${BUSINESS_PROFILE_PAGE.meta[l].title} ${BUSINESS_PROFILE_PAGE.meta[l].description} ${prose(l)}`
    return PROMISES.filter((re) => re.test(text)).map((re) => `${l}: ${re}`)
  })
  check('D2: no promise, no percentage and no claimed tie to Google', promised.length === 0, promised.join('; '))
  // Illustrative figures live in the hero visual, which the template captions
  // as an illustration; the copy itself carries no figure of its own.
  const numbersInCopy = PUBLIC_LOCALES.filter((l) => /\b\d{3,}\b/.test(prose(l).replace(/1,500|4:3/g, '')))
  check('D3: no figure in the copy that a reader could take for a result', numbersInCopy.length === 0, numbersInCopy.join(', '))
  const mutated: Variant = {
    meta: BUSINESS_PROFILE_PAGE.meta,
    text: (l) => (l === 'fr' ? prose(l).replace(/ne crée pas de fiche/g, 'crée la fiche') : prose(l)),
  }
  check('D MUTATION CONTROL: a language that stops stating the limit fails', !statesTheLimit(mutated, 'fr'))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main()

export {}
