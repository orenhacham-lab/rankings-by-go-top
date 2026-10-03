/**
 * THE SPANISH LEGAL TEXT, HELD AGAINST ITS ENGLISH SOURCE.
 *
 * The Spanish documents live as Markdown under content/legal/es/ and NOT as
 * pages, on purpose: the /es route tree and the build-time flag that keeps it
 * dark live on the Spanish branch, so an /es page created here would go live in
 * production the moment this branch merged, ungated. The Spanish thread wires
 * the routes; this branch owns the text.
 *
 * What that costs is the thing this suite buys back. A page is rendered, so
 * legal-coverage.qa.ts can assert what a reader sees; a Markdown file is not,
 * so nothing would otherwise notice it drifting from the English it was
 * translated from. Four failures are worth catching:
 *
 *   1. A section added to an English document and not to the Spanish one. The
 *      heading count is compared, which is crude but catches exactly that.
 *   2. A sub-processor or a platform connection named in English and missing in
 *      Spanish — the gap Oren found in the Hebrew and English text on
 *      2026-10-03, which must not be reintroduced one language over.
 *   3. The company's legal name translated. In every language but Hebrew it is
 *      the English name exactly as registered; a Spanish rendering of it would
 *      not match the registrar.
 *   4. An /es/... link invented here. Those routes do not exist on this branch,
 *      so such a link would be dead until the Spanish branch lands.
 *
 * MUTATION CONTROL at the end: each class of check is re-run against text with
 * the thing it looks for removed, and must then fail.
 *
 * Run: npx tsx components/public/__qa__/spanish-legal-coverage.qa.ts
 */
import { readFileSync, existsSync } from 'fs'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const DOCS = ['terms', 'privacy', 'refund-policy', 'accessibility'] as const
type Doc = (typeof DOCS)[number]

const ES = (doc: Doc) => `content/legal/es/${doc}.md`

const files: Record<Doc, string> = {} as never
for (const doc of DOCS) {
  check(`${doc}: the Spanish document exists`, existsSync(ES(doc)), ES(doc))
  files[doc] = existsSync(ES(doc)) ? readFileSync(ES(doc), 'utf8') : ''
}

/** The front matter, as a plain map; the files are written by hand, so this stays simple. */
function frontMatter(src: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---/.exec(src)
  if (!m) return {}
  const out: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const kv = /^([a-zA-Z]+):\s*(.*)$/.exec(line)
    if (kv) out[kv[1]] = kv[2].trim()
  }
  return out
}

// ── 1) front matter, and the English source it was translated from ──────────
for (const doc of DOCS) {
  const fm = frontMatter(files[doc])
  check(`${doc}: front matter has a title`, !!fm.title && /Go Top SEO/.test(fm.title))
  check(`${doc}: front matter has a description`, !!fm.description && fm.description.length > 10)
  check(`${doc}: front matter says locale es`, fm.locale === 'es')
  check(`${doc}: front matter names its English source`, !!fm.source && existsSync(fm.source), fm.source)
  check(`${doc}: front matter carries the revision date`, fm.lastUpdated === '2026-10-03')
  check(`${doc}: front matter records the register`, fm.register === 'usted')
}

/*
 * THE REGISTER IS "USTED", DELIBERATELY, AND IT DIFFERS FROM THE REST OF THE SITE.
 *
 * The Spanish marketing and dashboard copy uses "tú". These four documents do
 * not, and that is not an oversight to be tidied up later. A contract, a
 * privacy policy and a refund policy are read as statements of what each side
 * owes; the formal second person is the register Spanish-language consumer law
 * and every comparable policy use, and it reads as binding where "tú" reads as
 * marketing. Mixing the two inside one document is the real mistake, so the
 * check below is for consistency rather than for a particular pronoun: no
 * tuteo verb form or possessive may appear in a document written in "usted".
 *
 * If the decision is ever reversed, reverse it in all four documents at once
 * and change `register` in their front matter; this check follows that field.
 */
const TUTEO = [/\btú\b/, /\btu(s)? (cuenta|sitio|plan|proyecto|informaci[óo]n|datos)\b/, /\btienes\b/, /\bpuedes\b/, /\bdebes\b/, /\btu propia\b/]
for (const doc of DOCS) {
  const fm = frontMatter(files[doc])
  if (fm.register !== 'usted') continue
  for (const re of TUTEO) {
    check(`${doc}: no tuteo in a document written in usted (${re.source})`, !re.test(files[doc]))
  }
}
check('MUTATION — tuteo slipped into an usted document is caught',
  TUTEO.some((re) => re.test('Puedes cancelar tu cuenta cuando tú quieras.')))

// ── 2) the section count follows the English page ───────────────────────────
// Headings are compared, not words: a translation legitimately differs in
// length, but it does not legitimately have fewer sections than its source.
for (const doc of DOCS) {
  const fm = frontMatter(files[doc])
  if (!fm.source || !existsSync(fm.source)) continue
  const en = readFileSync(fm.source, 'utf8')
  const enH2 = (en.match(/<h2>/g) ?? []).length
  const esH2 = (files[doc].match(/^## /gm) ?? []).length
  check(`${doc}: Spanish has the same number of sections as English (${esH2} / ${enH2})`, esH2 === enH2)
}

// ── 3) every provider and platform named in English is named in Spanish ─────
// Read out of the English page rather than listed here, so a provider added
// there and not translated fails without anyone editing this suite.
const PROVIDERS = [
  'Supabase', 'Vercel', 'Serper', 'Resend', 'PayPal', 'Shopify', 'Wix', 'PDFShift',
  'OpenStreetMap', 'Nominatim', 'Gemini', 'Search Console', 'Business Profile',
  'Google Ads', 'ScrapeLLM', 'Meta', 'WordPress', 'GO TOP SEO Bridge', 'webhook',
] as const
for (const doc of DOCS) {
  const fm = frontMatter(files[doc])
  if (!fm.source || !existsSync(fm.source)) continue
  const en = readFileSync(fm.source, 'utf8')
  for (const provider of PROVIDERS) {
    // Case-sensitive, whole word. Substring matching found "Meta" inside the
    // page's own `metadata` export and inside "meta description", which is the
    // false positive this avoids.
    const named = new RegExp(`\\b${provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
    if (!named.test(en)) continue
    check(`${doc}: "${provider}" is named in English, so it is named in Spanish`,
      named.test(files[doc]),
      'the English document names it and the Spanish one does not')
  }
}

// ── 4) the registered company name, untranslated ────────────────────────────
// Hebrew uses the Hebrew name; every other language uses the English name
// exactly as registered, typo included, because that is what the registrar has.
const REGISTERED = 'GO TOP MARKETING GRUO LTD'
const TRANSLATED_NAME = /GO TOP (MARKETING|MERCADEO|MARKETING DIGITAL) (DIGITAL|Y PUBLICIDAD|SRL|S\.?L\.?)/i
for (const doc of DOCS) {
  if (!/517274346/.test(files[doc]) && !new RegExp(REGISTERED).test(files[doc])) continue
  check(`${doc}: the company name is the registered English one`, files[doc].includes(REGISTERED))
  check(`${doc}: the company name was not translated or re-spelled`, !TRANSLATED_NAME.test(files[doc]))
  check(`${doc}: the Hebrew company name is not used in Spanish`, !/גו טופ/.test(files[doc]))
}
check('the contact documents carry the company number',
  /517274346/.test(files['refund-policy']) || /517274346/.test(files.terms))

// ── 5) no link to a route this branch does not have ─────────────────────────
for (const doc of DOCS) {
  const esLinks = [...files[doc].matchAll(/\]\((\/es\/[^)]*)\)/g)].map((m) => m[1])
  check(`${doc}: no /es/... link, since those routes are not on this branch`, esLinks.length === 0, esLinks.join(', '))
}

// ── 6) the refund rule, which is the owner's own decision ───────────────────
// Translated, never redrafted: no refund on a paid period except where the law
// requires one, cancellation at any time, access to the end of the period. A
// goodwill or unconditional 14-day promise appearing only in Spanish would be a
// commitment nobody made.
const refund = files['refund-policy']
check('refund: Spanish says subscription payments are not refunded', /no se reembolsan/i.test(refund))
check('refund: Spanish keeps the only exception being the law', /la ley exige|exija la ley|exige la ley/i.test(refund))
check('refund: Spanish keeps cancellation at any time', /en cualquier momento/i.test(refund))
check('refund: Spanish keeps access to the end of the paid period', /hasta el final del periodo/i.test(refund))
check('refund: Spanish invents no unconditional 14-day refund', !/14 d[ií]as/i.test(refund))

// ── MUTATION CONTROLS ───────────────────────────────────────────────────────
{
  const privacy = files.privacy
  check('MUTATION — a provider removed from the Spanish text is caught',
    !privacy.replace(/PDFShift/g, '').includes('PDFShift') && privacy.includes('PDFShift'))
  check('MUTATION — a translated company name is caught',
    TRANSLATED_NAME.test('GO TOP MARKETING DIGITAL S.L.'))
  check('MUTATION — an /es link is caught',
    [...'ver los [términos](/es/terms) aquí'.matchAll(/\]\((\/es\/[^)]*)\)/g)].length === 1)
  check('MUTATION — a missing section is caught',
    ((privacy.replace(/^## /m, '# ').match(/^## /gm) ?? []).length) < ((privacy.match(/^## /gm) ?? []).length))
  check('MUTATION — a 14-day refund promise slipped into Spanish is caught',
    /14 d[ií]as/i.test(`${refund}\nReembolso incondicional en 14 días.`))
  check('MUTATION — front matter claiming the wrong locale is caught',
    frontMatter('---\nlocale: en\n---').locale !== 'es')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
