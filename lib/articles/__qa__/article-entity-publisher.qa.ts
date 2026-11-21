/**
 * THE ARTICLE PAGES BELONG TO THE SAME ORGANIZATION AS THE REST OF THE SITE.
 *
 * Run: npx tsx lib/articles/__qa__/article-entity-publisher.qa.ts
 *
 * lib/seo/organization.ts explains, at length and from measurement, why naming
 * GO TOP (https://www.gotop.co.il, the separate marketing agency) as the
 * product's publisher costs us reach: an entity resolver is told the SaaS is a
 * sub-brand of an Israeli agency, so the links and mentions the product earns
 * accrue to the agency's entity. That fix was applied to every JSON-LD surface
 * on the site — and missed the two places the BLOG speaks from:
 *
 *   lib/articles/server.ts   every article's `Article.publisher`
 *   lib/articles/authors.ts  the author page's `Person.worksFor`
 *
 * Read from the live page on 21 Nov 2026: /articles/google-seo-benefits carried
 * `"publisher":{"@type":"Organization","name":"GO TOP","url":"https://www.gotop.co.il"}`
 * while the Organization, SoftwareApplication and WebSite nodes on the same
 * page all pointed at `https://www.gotopseo.com/#organization`.
 *
 * This suite reads the SOURCE, because the node is built from a Supabase row
 * and a locale dictionary that a QA suite has no business faking: what can be
 * checked without I/O is that neither file names the agency any more, and that
 * both reference the one organization by @id.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BRAND_REF, ORGANIZATION_ID, SITE_URL } from '../../seo/organization'
import { authorPersonSchema } from '../authors'
import { PUBLIC_LOCALES } from '../../i18n/locales'

let passed = 0
let failed = 0
function check(name: string, ok: boolean) {
  if (ok) passed++
  else { failed++; console.log('FAIL', name) }
}

const ROOT = join(__dirname, '..', '..', '..')
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const read = (rel: string) => stripComments(readFileSync(join(ROOT, rel), 'utf8'))

const AGENCY = 'gotop.co.il'
const server = read('lib/articles/server.ts')
const authors = read('lib/articles/authors.ts')

// ── A: the agency is not named as an entity on the blog's surfaces ──────────

check('A1 server.ts names no agency URL', !server.includes(AGENCY))
check('A2 authors.ts names no agency URL', !authors.includes(AGENCY))
check('A3 neither declares an inline publisher Organization of its own',
  !/publisher:\s*\{\s*'@type':\s*'Organization'/.test(server))
check('A4 neither declares an inline worksFor Organization of its own',
  !/worksFor:\s*\{\s*'@type':\s*'Organization'/.test(authors))

// ── B: both reference the one organization, by id ───────────────────────────

check('B1 the article publisher is the shared reference', /publisher:\s*BRAND_REF/.test(server))
check('B2 the author employer is the shared reference', /worksFor:\s*BRAND_REF/.test(authors))
check('B3 the reference carries an @id and no competing name',
  BRAND_REF['@id'] === ORGANIZATION_ID && !('name' in BRAND_REF))
check('B4 the id is on our own origin', ORGANIZATION_ID.startsWith(SITE_URL))

// ── C: the author node still says who the person is, in every locale ───────
//
// Removing the inline employer must not empty the Person: the name, the role,
// the bio, the profile URL and the photograph are what make a byline checkable.

for (const locale of PUBLIC_LOCALES) {
  const person = authorPersonSchema('אורן חכם', locale) as Record<string, unknown> | null
  check(`C1 ${locale}: the author Person is built`, !!person)
  if (!person) continue
  check(`C2 ${locale}: it names the person`, typeof person.name === 'string' && (person.name as string).length > 1)
  check(`C3 ${locale}: it carries a job title and a bio`,
    typeof person.jobTitle === 'string' && (person.jobTitle as string).length > 1
    && typeof person.description === 'string' && (person.description as string).length > 20)
  check(`C4 ${locale}: its url is a page on our own site`,
    typeof person.url === 'string' && (person.url as string).startsWith(SITE_URL))
  check(`C5 ${locale}: it still declares an employer`, !!person.worksFor)
  check(`C6 ${locale}: and that employer is the product's organization`,
    (person.worksFor as Record<string, unknown>)['@id'] === ORGANIZATION_ID)
}

// ── MUTATION CONTROLS ──────────────────────────────────────────────────────

check('MUTATION CONTROL: the live 21 Nov publisher node is caught',
  '{"@type":"Organization","name":"GO TOP","url":"https://www.gotop.co.il"}'.includes(AGENCY))
check('MUTATION CONTROL: an inline publisher literal is caught by the A3 pattern',
  /publisher:\s*\{\s*'@type':\s*'Organization'/.test("publisher: { '@type': 'Organization', name: 'GO TOP' },"))
check('MUTATION CONTROL: an inline worksFor literal is caught by the A4 pattern',
  /worksFor:\s*\{\s*'@type':\s*'Organization'/.test("worksFor: { '@type': 'Organization', name: 'GO TOP' },"))
check('MUTATION CONTROL: a reference carrying a second name is caught',
  'name' in ({ '@type': 'Organization', '@id': ORGANIZATION_ID, name: 'GO TOP' } as Record<string, unknown>))

console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
export {}
