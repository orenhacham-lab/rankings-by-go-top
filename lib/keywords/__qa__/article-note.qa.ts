/**
 * A keyword added after an article was written shows a short link to that
 * article, never the system's own note ("source=generated_article article=…
 * wp_post=…"), which reached the keywords table as is (Oren, 2026-10-05).
 *
 * Run: npx tsx lib/keywords/__qa__/article-note.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { articleIdFromNote } from '../article-note'

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const ROOT = process.cwd()
const ID = '36cad701-88aa-494f-9ccc-577c4289d706'

check('N1: the system note gives the article id', articleIdFromNote(`source=generated_article article=${ID} topic=12f18bd5-ee53-48d0-b2ee-fe8d20dcc653 wp_post=31968`) === ID)
check('N2: a note the owner wrote is not mistaken for it', articleIdFromNote('remember to check the price page') === null && articleIdFromNote(null) === null && articleIdFromNote('') === null)
check('N3: a note that only mentions the words is not it either', articleIdFromNote(`see source=generated_article article=${ID}`) === null)
const writer = readFileSync(join(ROOT, 'lib/content/keyword-from-article.ts'), 'utf8')
const sample = (writer.match(/`(source=generated_article article=\$\{article\.id\}[^`]*)`/) ?? [])[1] ?? ''
check('N4: it reads the exact note the system writes', articleIdFromNote(sample.replace('${article.id}', ID).replace(/\$\{[^}]*\}/g, '-')) === ID, sample)

const table = strip(readFileSync(join(ROOT, 'components/keywords/TrackingTargetsTable.tsx'), 'utf8'))
const linked = /articleIdFromNote\(target\.notes\)[\s\S]*?<Link href=\{`\/content\/articles\/\$\{articleId\}`\}/.test(table)
check('T1: the keywords table shows a link to the article for such a keyword', linked)
check('MUTATION CONTROL: a table that prints the note again is caught', !/articleIdFromNote\(target\.notes\)[\s\S]*?<Link href=\{`\/content\/articles\/\$\{articleId\}`\}/.test(table.replace('articleIdFromNote(target.notes)', 'null')))
for (const [lang, f] of [['he', 'lib/i18n/dashboard/he.ts'], ['en', 'lib/i18n/dashboard/en.ts'], ['es', 'lib/i18n/dashboard/es.ts'], ['pt-BR', 'lib/i18n/dashboard/pt-BR/project-detail.ts']]) {
  const src = readFileSync(join(ROOT, f), 'utf8')
  check(`T2 ${lang}: the link's words exist`, /fromArticle: '[^']+'/.test(src) && /openArticle: '[^']+'/.test(src))
}

console.log(`\n${passed} passed, ${failed} failed`)
export {}
