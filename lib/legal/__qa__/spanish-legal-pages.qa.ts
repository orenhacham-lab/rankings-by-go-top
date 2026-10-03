/**
 * The Spanish legal pages: /es/terms, /es/privacy, /es/refund-policy and
 * /es/accessibility.
 *
 * The documents are Markdown under content/legal/es/, written by the legal
 * thread; this tree renders them. Three things can go wrong and none of them
 * is visible in a diff:
 *
 *   A  the reader renders the six constructs the documents use, and refuses
 *      anything else rather than printing it as literal asterisks
 *   B  no document can smuggle a link scheme past it
 *   C  the four routes exist, are behind the one /es gate, are static (so the
 *      file read happens at build time and never at runtime), and the footer
 *      and the sitemap point at them instead of the English pages
 *   D  the four real documents parse, carry their front matter, and keep the
 *      company's registered name untranslated
 *
 * Every rule has a mutation control.
 *
 * Run: npx tsx lib/legal/__qa__/spanish-legal-pages.qa.ts
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  parseInline,
  parseLegalMarkdown,
  readLegalDocument,
  LEGAL_SLUGS,
  type Block,
  type Inline,
} from '../markdown'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const threw = (fn: () => unknown): boolean => {
  try { fn(); return false } catch { return true }
}
/** The visible text of a block tree, for asserting what a reader would see. */
const textOf = (nodes: Inline[]): string =>
  nodes.map((n) => (n.kind === 'text' ? n.text : n.kind === 'break' ? '\n' : textOf(n.children))).join('')
const blockText = (b: Block): string =>
  b.kind === 'list' ? b.items.map(textOf).join(' | ') : textOf(b.children)

const FM = '---\ntitle: T | Go Top SEO\ndescription: D\nlocale: es\nsource: app/(public)/en/terms/page.tsx\nlastUpdated: 2026-10-03\n---\n'

console.log('\nA) the reader renders what the documents use')
{
  const doc = parseLegalMarkdown(FM + [
    '## Primera sección',
    '',
    'Un párrafo con **negrita**, *cursiva* y un [enlace](/es/privacy).',
    'Una segunda línea del mismo párrafo.',
    '',
    '- Primer punto',
    '- Segundo punto con **negrita**',
    '',
    '### Subapartado',
    '',
    'Otro párrafo.',
  ].join('\n'))

  check('A1: the front matter is read', doc.frontMatter.locale === 'es' && doc.frontMatter.lastUpdated === '2026-10-03')
  check('A2: the source page is kept, which is what the legal thread diffs against',
    doc.frontMatter.source === 'app/(public)/en/terms/page.tsx')
  check('A3: the blocks come out in order',
    doc.blocks.map((b) => b.kind).join(',') === 'heading,paragraph,list,heading,paragraph',
    doc.blocks.map((b) => b.kind).join(','))
  check('A4: the two lines of one paragraph join with a space',
    blockText(doc.blocks[1]) === 'Un párrafo con negrita, cursiva y un enlace. Una segunda línea del mismo párrafo.',
    blockText(doc.blocks[1]))
  check('A5: strong, em and the link survive as markup, not as asterisks',
    doc.blocks[1].kind === 'paragraph' &&
    doc.blocks[1].children.some((n) => n.kind === 'strong') &&
    doc.blocks[1].children.some((n) => n.kind === 'em') &&
    doc.blocks[1].children.some((n) => n.kind === 'link' && n.href === '/es/privacy'))
  check('A6: the list keeps one item per bullet', blockText(doc.blocks[2]) === 'Primer punto | Segundo punto con negrita',
    blockText(doc.blocks[2]))
  check('A7: the heading levels are kept', doc.blocks[0].kind === 'heading' && doc.blocks[0].level === 2 &&
    doc.blocks[3].kind === 'heading' && doc.blocks[3].level === 3)
  check('A8: ** is read as strong, never as two em',
    parseInline('**x**').every((n) => n.kind === 'strong'))

  // The contact blocks put the company name, its number and its address on
  // three lines with Markdown's hard break — two trailing spaces.
  const hard = parseLegalMarkdown(FM + '## Contacto\n\nGO TOP  \nNúmero: 1  \nCorreo: a@b.es\n')
  check('A9: a line ending in two spaces breaks the line',
    blockText(hard.blocks[1]) === 'GO TOP\nNúmero: 1\nCorreo: a@b.es', JSON.stringify(blockText(hard.blocks[1])))
  check('A9-MUT: a line WITHOUT the two spaces still joins with a space',
    blockText(parseLegalMarkdown(FM + 'uno\ndos\n').blocks[0]) === 'uno dos')

  // The page prints the date as a footnote, from the front matter, so a body
  // that ends with its own copy must not print it twice.
  const dated = parseLegalMarkdown(FM + '## Uno\n\nTexto.\n\nÚltima actualización: 3 de octubre de 2026\n')
  check('A10: a trailing "Última actualización" line is dropped',
    dated.blocks.length === 2 && blockText(dated.blocks[1]) === 'Texto.',
    dated.blocks.map(blockText).join(' / '))
  check('A10-MUT: a paragraph that merely mentions it is kept',
    parseLegalMarkdown(FM + 'La última actualización se publica aquí.\n').blocks.length === 1)
  check('A11: the other wording of the same line is dropped too',
    parseLegalMarkdown(FM + 'Texto.\n\nEsta página se actualizó por última vez el 3 de octubre de 2026\n').blocks.length === 1)
  // The four real documents must each show the date exactly once.
  for (const slug of LEGAL_SLUGS) {
    const body = readLegalDocument(slug).blocks.map(blockText).join('\n')
    // Anchored per line, the way the parser's own check is anchored to the
    // start of the last paragraph: "actualizaciones del servicio" in the
    // middle of a sentence is not this line.
    check(`A12: ${slug} leaves the date to the page's footnote`,
      !/^\s*(?:(?:Última|Ultima)\s+actualización|Esta\s+página\s+se\s+actualizó)/im.test(body),
      body.split('\n').find((l) => /^\s*(?:(?:Última|Ultima)\s+actualización|Esta\s+página\s+se\s+actualizó)/i.test(l)))
  }

  // MUTATION CONTROLS: a construct the reader does not render must fail the
  // build, not reach a reader as raw text.
  check('A-MUT1: a numbered list is refused', threw(() => parseLegalMarkdown(FM + '1. uno\n')))
  check('A-MUT2: a table is refused', threw(() => parseLegalMarkdown(FM + '| a | b |\n')))
  check('A-MUT3: a block quote is refused', threw(() => parseLegalMarkdown(FM + '> cita\n')))
  check('A-MUT4: a code fence is refused', threw(() => parseLegalMarkdown(FM + '```js\nx\n```\n')))
  check('A-MUT5: an h4 is refused', threw(() => parseLegalMarkdown(FM + '#### cuarto\n')))
  check('A-MUT6: a document with no front matter is refused', threw(() => parseLegalMarkdown('## Hola\n')))
  check('A-MUT7: front matter missing a field is refused',
    threw(() => parseLegalMarkdown('---\ntitle: T\n---\n## Hola\n')))
}

console.log('\nB) no link scheme gets past it')
{
  check('B1: https, mailto, tel and a site path are allowed',
    parseInline('[a](https://x.es) [b](mailto:a@b.es) [c](tel:0549489377) [d](/es/terms)')
      .filter((n) => n.kind === 'link').length === 4)
  check('B2: javascript: is refused', threw(() => parseInline('[x](javascript:alert(1))')))
  check('B3: data: is refused', threw(() => parseInline('[x](data:text/html,<script>)')))
  check('B4: plain http is refused', threw(() => parseInline('[x](http://x.es)')))

  const src = strip(read('lib/legal/markdown.ts'))
  check('B5: the allowlist is a check, not a sanitizer',
    /const ALLOWED_LINK = /.test(src) && /throw new Error\(`legal markdown: link scheme not allowed/.test(src))
  check('B-MUT: nothing in the renderer sets HTML directly',
    !/dangerouslySetInnerHTML/.test(read('components/public/LegalMarkdown.tsx')))
}

console.log('\nC) the routes, the gate and the links')
{
  for (const slug of LEGAL_SLUGS) {
    const page = `app/(public)/es/${slug}/page.tsx`
    const src = existsSync(join(ROOT, page)) ? strip(read(page)) : ''
    check(`C1: /es/${slug} is a route`, !!src)
    check(`C2: …rendered by the shared frame`, /SpanishLegalPage slug="/.test(src))
    // NOT prerendered, and the reason is the opposite of what this used to
    // assert. The root layout decides <html lang/dir> from the request, so a
    // force-static legal page came out as lang="en" on a Spanish URL. The
    // read it was protecting is handled instead by the per-process cache in
    // lib/legal/markdown.ts and by tracing the files into the server bundle.
    check(`C3: …rendered per request, so the document declares Spanish`,
      !/export const dynamic = 'force-static'/.test(src))
  }

  // The /es tree has ONE gate, in its layout: the pages carry no flag check,
  // so a new one cannot forget to be gated.
  const layout = strip(read('app/(public)/es/layout.tsx'))
  check('C4: the one /es gate still 404s the whole tree when the flag is off',
    /if \(!spanishSiteEnabled\(\)\) notFound\(\)/.test(layout))
  check('C5: and no legal page carries a gate of its own',
    LEGAL_SLUGS.every((s) => !/spanishSiteEnabled/.test(strip(read(`app/(public)/es/${s}/page.tsx`)))))

  // The two things that replace force-static. Either one missing is a page
  // that either re-reads the disk on every request or cannot find the file at
  // all once deployed.
  const md = strip(read('lib/legal/markdown.ts'))
  check('C3a: the parse is cached per process', /const cache = new Map<LegalSlug, LegalDocument>\(\)/.test(md)
    && /cache\.set\(slug, doc\)/.test(md))
  // Read RAW, not stripped: the glob itself contains `/**/`, which the
  // comment-stripping regex reads as the start of a block comment and swallows.
  const conf = read('next.config.ts')
  check('C3b: and the Markdown ships with the server trace',
    /outputFileTracingIncludes/.test(conf) && /content\/legal\/es\/\*\*\/\*/.test(conf))
  check('MUTATION — a config without the trace include is caught',
    !/content\/legal\/es\/\*\*\/\*/.test(conf.replace(/'\.\/content\/legal\/es\/\*\*\/\*'/, "'./other/**/*'")))

  const footer = strip(read('components/Footer.tsx'))
  check('C6: the footer sends each language to its own documents', /const legalPrefix = prefix/.test(footer))
  const sitemap = strip(read('app/(public)/es/sitemap/page.tsx'))
  check('C7: the Spanish sitemap lists the Spanish documents',
    LEGAL_SLUGS.every((s) => sitemap.includes(`href: '/es/${s}'`)),
    LEGAL_SLUGS.filter((s) => !sitemap.includes(`href: '/es/${s}'`)).join(', '))
  check('C8: and no longer the English ones',
    !/href: '\/en\/(privacy|terms|refund-policy|accessibility)'/.test(sitemap))

  // The whole legal tree is noindex, and the Spanish site is preview-only on
  // top of that.
  const frame = strip(read('components/public/SpanishLegalPage.tsx'))
  check('C9: the Spanish legal metadata is noindex, like the other two languages',
    /robots: 'noindex, nofollow'/.test(frame))
}

console.log('\nD) the four real documents')
{
  for (const slug of LEGAL_SLUGS) {
    const path = `content/legal/es/${slug}.md`
    check(`D1: ${slug} is there`, existsSync(join(ROOT, path)))
    let doc: ReturnType<typeof readLegalDocument> | null = null
    check(`D2: …and parses`, !threw(() => { doc = readLegalDocument(slug) }))
    if (!doc) continue
    const d = doc as ReturnType<typeof readLegalDocument>
    check(`D3: …with a Spanish title and the English page it came from`,
      d.frontMatter.locale === 'es' && /^app\/\(public\)\/en\//.test(d.frontMatter.source),
      `${d.frontMatter.locale} / ${d.frontMatter.source}`)
    check(`D4: …and a body with headings`, d.blocks.filter((b) => b.kind === 'heading').length >= 2)
    const body = d.blocks.map(blockText).join('\n')
    check(`D5: …in Spanish, with no Hebrew left in`, !/[֐-׿]/.test(body))
    // THE COMPANY'S REGISTERED NAME IS NEVER TRANSLATED (Oren, 2026-10-03):
    // the Hebrew pages carry the Hebrew name, English and every other language
    // carry the English name exactly as registered.
    const named = /GO TOP MARKETING GRUO LTD/.test(body)
    const translated = /GO TOP (?:MARKETING|MARKETING Y|DE MARKETING)[^.]*(?:DIGITAL|S\.L|SL)\b/i.test(body) ||
      /Go Top Marketing y Publicidad/i.test(body)
    check(`D6: …and the registered company name is not translated`, !translated, body.match(/GO TOP[^.\n]{0,60}/i)?.[0])
    if (slug === 'terms' || slug === 'privacy') {
      check(`D7: ${slug} names the company as registered`, named)
    }
  }

  // Every internal link in the Spanish documents points at a Spanish page.
  const links: string[] = []
  for (const slug of LEGAL_SLUGS) {
    const raw = read(`content/legal/es/${slug}.md`)
    for (const m of raw.matchAll(/\]\((\/[^)]*)\)/g)) links.push(m[1])
  }
  check('D8: the documents cross-link the Spanish pages, not the English ones',
    links.length > 0 && links.every((l) => l.startsWith('/es/')), links.join(', '))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
