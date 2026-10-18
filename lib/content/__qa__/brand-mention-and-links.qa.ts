/**
 * THE BUSINESS IS NAMED, AND A BIG SITE'S ON-TOPIC PAGE IS STILL CONSIDERED
 * (18 October 2026, from Oren's report: articles with no mention of the
 * business although the project settings ask for one, and projects whose
 * articles carry no internal links).
 *
 * Two separate causes, one guard each:
 *
 *   A) the business name. Generation named the business only from the
 *      settings' own field (projects.business_name). Two live projects never
 *      had it filled, so their articles said nothing about the business while
 *      the author box in the SAME article named it, because the box falls back
 *      to the project's own name. projectBusinessName now falls back the same
 *      way, and ignores a "name" that is only an address.
 *
 *   B) the candidate cap. A site with more mapped pages than the cap (2,000)
 *      lost every page past it IN THE MAPPING'S ORDER. A store with 6,192
 *      mapped pages had its only page on the article's subject at position
 *      2,148: cut off, so that article got no links at all. Over the cap the
 *      pages sharing a word with the article's topic come first; under it the
 *      order is untouched, so a site that fits behaves exactly as before.
 *
 * MUTATION CONTROLS for both. Run: npx tsx lib/content/__qa__/brand-mention-and-links.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { projectBusinessName } from '@/lib/content/article-generation'
import { autoLinkCandidates, AUTO_LINK_LIMITS, HARD_ENTRY_CEILING } from '@/lib/content/auto-internal-links/select'

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

/** What generation did until 18 October 2026: the settings field, nothing else. */
const oldBusinessName = (p: { name?: string | null; business_name?: string | null } | null) => p?.business_name ?? null

// ── A) the business name ──────────────────────────────────────────────────────

console.log('\nA) the name the article uses')

check('A1: the settings field wins when it is filled',
  projectBusinessName({ name: 'פרויקט ראשון', business_name: 'פרחי לואיז' }) === 'פרחי לואיז')
check('A2: an empty field falls back to the project name (the live Afrodite/Canary case)',
  projectBusinessName({ name: 'Afrodite Decants', business_name: null }) === 'Afrodite Decants'
  && projectBusinessName({ name: 'האיים הקנריים', business_name: '' }) === 'האיים הקנריים')
check('A3: a project name that is only an address is not a business name',
  projectBusinessName({ name: 'canary-islands.co.il', business_name: null }) === null
  && projectBusinessName({ name: 'https://louizflowers.co.il', business_name: null }) === null
  && projectBusinessName({ name: 'www.bestgifts.co.il', business_name: null }) === null)
check('A4: nothing to name stays nothing', projectBusinessName({ name: '  ', business_name: null }) === null && projectBusinessName(null) === null)
check('A5: surrounding spaces never become the name',
  projectBusinessName({ name: null, business_name: '  Japan4U  ' }) === 'Japan4U')
check('MUTATION CONTROL A: the old field-only reading leaves the live projects unnamed (so A2 would fail)',
  oldBusinessName({ name: 'Afrodite Decants', business_name: null }) === null)

const genSrc = strip(read('lib/content/article-generation.ts'))
check('A6: generation reads the project name and resolves it through projectBusinessName',
  /\.select\('name, business_name,/.test(genSrc) && /const businessName = projectBusinessName\(/.test(genSrc))
check('A7: naming the business still needs the owner\'s switch, and now covers a Shopify store',
  /includeBrandName: decodedNotes\.brandChoiceSet \? decodedNotes\.flags\.includeBrandName : generationContext\.guidance\.mentionBusiness && !!businessName\?\.trim\(\)/.test(genSrc)
  && !/!generationContext\.shopify/.test(genSrc))
const mutGen = genSrc.replace(/\.select\('name, business_name,/, ".select('business_name,")
check('MUTATION CONTROL A2: dropping the name column from the read is caught (so A6 would fail)',
  !/\.select\('name, business_name,/.test(mutGen))

// ── B) the candidate cap on a big site ────────────────────────────────────────

console.log('\nB) a site with more pages than the cap')

const SITE = 'https://shop.example.co.il'
/** A catalogue of pages that say nothing about the article's subject, then the one that does. */
const catalogue = (n: number) => Array.from({ length: n }, (_, i) => ({ u: `${SITE}/product-${i + 1}/`, t: `בושם מבית ${['שאנל', 'דיור', 'ארמני', 'גוצ\'י'][i % 4]} דגם ${i + 1}` }))
const ON_TOPIC = { u: `${SITE}/tom-ford/`, t: 'טום פורד' }
const ARTICLE = {
  title: 'מדריך לבחירת טום פורד בושם: הניחוחות המובילים לגברים ונשים',
  slug: 'how-to-choose-tom-ford-perfume-guide',
  primaryKeyword: 'טום פורד בושם',
  secondaryKeywords: ['בשמים של טום פורד'],
}

// The live shape: 2,147 pages before the only on-topic page, 6,192 in all.
const big = [...catalogue(2147), ON_TOPIC, ...catalogue(6192 - 2148)]
const cands = autoLinkCandidates(big, { host: 'shop.example.co.il' }, ARTICLE)
check('B1: the cap still bounds how many pages reach the selection', cands.length === AUTO_LINK_LIMITS.maxCandidates)
check('B2: the only page on the article\'s subject is among them, although it sat at 2,148', cands.some((c) => c.url === ON_TOPIC.u))
check('B3: it comes first, because it is the one that shares the topic\'s words', cands[0]?.url === ON_TOPIC.u)
const oldWay = autoLinkCandidates(big, { host: 'shop.example.co.il' }, { title: ARTICLE.title, slug: ARTICLE.slug })
check('B4: without the article\'s keywords the title alone still finds it', oldWay.some((c) => c.url === ON_TOPIC.u))
check('MUTATION CONTROL B: the mapping\'s own order cuts the page off (so B2 would fail)',
  !big.slice(0, AUTO_LINK_LIMITS.maxCandidates).some((e) => e.u === ON_TOPIC.u))

const small = [...catalogue(40), ON_TOPIC]
const smallCands = autoLinkCandidates(small, { host: 'shop.example.co.il' }, ARTICLE)
check('B5: a site that fits under the cap keeps the mapping\'s order untouched',
  smallCands.length === small.length && smallCands.every((c, i) => c.url === small[i].u))
check('B6: a page on another host, the article itself and a non-content URL are still left out',
  autoLinkCandidates(
    [{ u: 'https://other.example.com/tom-ford/', t: 'טום פורד' }, { u: `${SITE}/how-to-choose-tom-ford-perfume-guide/`, t: 'טום פורד בושם' }, { u: `${SITE}/cart/`, t: 'עגלת קניות' }],
    { host: 'shop.example.co.il' }, ARTICLE,
  ).length === 0)
check('B7: the ceiling on how many entries are read at all is above the cap', HARD_ENTRY_CEILING > AUTO_LINK_LIMITS.maxCandidates)

const selSrc = strip(read('lib/content/auto-internal-links/select.ts'))
check('B8: the ranking runs only over the cap', /out\.length > AUTO_LINK_LIMITS\.maxCandidates \? byTopicFirst\(/.test(selSrc))
const mutSel = selSrc.replace(/if \(out\.length >= HARD_ENTRY_CEILING\) break/, 'if (out.length >= AUTO_LINK_LIMITS.maxCandidates) break')
check('MUTATION CONTROL B2: reading only the first 2,000 entries again is caught (so B8\'s wiring would be pointless)',
  !/if \(out\.length >= HARD_ENTRY_CEILING\) break/.test(mutSel))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

export {}
