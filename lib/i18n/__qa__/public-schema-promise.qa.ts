/**
 * NO PUBLIC PROMISE OF STRUCTURED DATA WHERE WE CANNOT ADD IT.
 *
 * Structured data (JSON-LD) reaches a customer's page only through the Go Top
 * plugin on WordPress. On Shopify we add none (no theme access), and a WordPress
 * site connected with an application password gets none either (scripts are
 * stripped). So every public sentence that names structured data must say where
 * it applies: WordPress or the plugin. The one other use allowed is describing
 * the work an owner would do by hand.
 *
 * The files are found, not listed: every public landing dictionary, every
 * public page, and the solutions pages.
 *
 * Run: npx tsx lib/i18n/__qa__/public-schema-promise.qa.ts
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const ROOT = process.cwd()
let passed = 0
let failed = 0
const ok = (name: string, cond: boolean, detail = '') => {
  if (cond) passed++
  else { failed++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ''}`) }
}

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (name === '__qa__' || name === 'node_modules') continue
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

const TERM = /structured data|נתונים מובנים|סימון מובנה|datos estructurados|dados estruturados/i
const WHERE = /WordPress|וורדפרס|plugin|תוסף/i
const BY_HAND = /by yourself|לבד|por tu cuenta|por conta própria/i

/** Sentences (string literals over 40 characters) that promise structured data with no "where". */
export function unqualified(source: string): string[] {
  const out: string[] = []
  const re = /'((?:[^'\\\n]|\\.){41,})'|"((?:[^"\\\n]|\\.){41,})"/g
  for (const m of stripComments(source).matchAll(re)) {
    const text = m[1] ?? m[2]
    if (TERM.test(text) && !WHERE.test(text) && !BY_HAND.test(text)) out.push(text)
  }
  return out
}

const files = [
  ...walk(join(ROOT, 'lib/i18n/public')),
  ...walk(join(ROOT, 'app/(public)')),
  ...walk(join(ROOT, 'components/public')),
]
ok('public files found', files.length > 20, String(files.length))
const landings = files.filter((f) => /landing-[^/]+\.ts$/.test(f))
ok('a landing dictionary per public language', landings.length >= 4, String(landings.length))

let scanned = 0
for (const f of files) {
  const bad = unqualified(readFileSync(f, 'utf8'))
  if (TERM.test(readFileSync(f, 'utf8'))) scanned++
  ok(`no unqualified structured-data promise in ${f.slice(ROOT.length + 1)}`, bad.length === 0, bad.map((b) => b.slice(0, 90)).join(' | '))
}
ok('the guard actually read copy that names structured data', scanned >= 8, String(scanned))

// MUTATION CONTROL: the old home-page sentence must be caught, and its fixed form must pass.
ok('mutation: the old promise is caught', unqualified("desc: 'Each article comes with images, Q&A and structured data, and goes live on your site when you scheduled it.'").length === 1)
ok('mutation: the Hebrew old promise is caught', unqualified("desc: 'כל מאמר נכתב עם תמונות, שאלות ותשובות ונתונים מובנים, ועולה לאתר בזמן שקבעתם.'").length === 1)
ok('mutation: a qualified sentence passes', unqualified("desc: 'On WordPress sites with the Go Top plugin, structured data is added too.'").length === 0)

console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
export {}
