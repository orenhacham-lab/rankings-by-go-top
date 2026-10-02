/**
 * FEATURED IMAGE STAYS ON TOPIC — the guard.
 *
 * Root cause (article 787ad4a9…, "מהם מי קולון (Eau de Cologne)…"): the
 * concept writer was told "NEVER request a real bottle/product", so for a
 * product-category article it wrote a mood metaphor instead ("water drops over
 * green citrus leaves"), and buildImagePrompt sent ONLY that concept to the
 * image model; the title, topic and keyword never reached it.
 *
 *   A) a subject is pinned as the focal point, before the concept; without one
 *      the prompt is byte-identical to before; a brand-only subject sanitizes
 *      away; a subject equal to the concept is not repeated;
 *   B) the hero flow passes the keyword → topic → title as the subject;
 *   C) the concept writer must show the subject literally and only bans a
 *      BRANDED bottle/product, and names the main subject;
 *   D) still exactly one concept call and one image call per hero (no new
 *      paid calls).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildImagePrompt } from '@/lib/content/gemini-image'

let passed = 0
let failed = 0
function check(name: string, ok: boolean) {
  if (ok) passed++
  else { failed++; console.log('FAIL', name) }
}
const root = join(__dirname, '..', '..', '..')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const read = (p: string) => strip(readFileSync(join(root, p), 'utf8'))

// A) prompt
const concept = 'טיפות מים צלולות מעל עלי הדרים ירוקים ורעננים'
const withSubject = buildImagePrompt({ title: 'מהם מי קולון (Eau de Cologne)', imagePrompt: concept, subject: 'מי קולון' })
const without = buildImagePrompt({ title: 'מהם מי קולון (Eau de Cologne)', imagePrompt: concept })
check('A1: the subject is pinned as the main subject', withSubject.includes('MAIN SUBJECT') && withSubject.includes(': מי קולון.'))
check('A2: the subject comes before the concept', withSubject.indexOf('MAIN SUBJECT') < withSubject.indexOf(concept))
check('A3: the subject forbids a nature/mood substitute', /never replace it with an abstract metaphor, mood, texture, ingredient or nature scene/.test(withSubject))
check('A4: no subject is the exact prompt as before', !without.includes('MAIN SUBJECT') && without === withSubject.replace(/ MAIN SUBJECT[^]*?nature scene\./, ''))
check('A5: a brand-only subject sanitizes away', !buildImagePrompt({ title: 'x', imagePrompt: concept, subject: 'Chanel' }).includes('MAIN SUBJECT'))
check('A6: a subject equal to the concept is not repeated', !buildImagePrompt({ title: 'x', imagePrompt: 'מי קולון', subject: 'מי קולון' }).includes('MAIN SUBJECT'))
check('A7: the commercial-safety rules still hold', withSubject.includes('COMMERCIAL-SAFETY RULES') && withSubject.includes('Use blank or no labels'))

// B) hero flow
const hero = read('lib/content/featured-image.ts')
check('B1: the hero flow passes keyword → topic → title as the subject', /subject:\s*\[primaryKeyword,\s*topicText,\s*String\(a\.title/.test(hero))
const gem = read('lib/content/gemini-image.ts')
check('B2: generateArticleImage accepts the subject and buildImagePrompt reads it', /subject\?:\s*string\s*\|\s*null[\s\S]*generateArticleImage/.test(gem) && /sanitizeImageConceptForCommercialUse\(input\.subject/.test(gem))

// C) concept writer
check('C1: the concept writer names the main subject', /Main subject: \$\{input\.primaryKeyword/.test(gem))
check('C2: the concept writer must show the subject literally', /MUST literally show the article's main subject/.test(gem))
check('C3: the old blanket "no real bottle/product" ban is gone (only a BRANDED one is banned)', !/NEVER request a real bottle\/product/.test(gem) && /NEVER request a real branded bottle\/product/.test(gem))

// D) paid calls
check('D1: one concept call and one image call per hero', (hero.match(/writeCommercialSafeConcept\(/g) || []).length === 1 && (hero.match(/generateArticleImage\(/g) || []).length === 1)

console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
export {}
