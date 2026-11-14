/**
 * The TRANSLATED legal pages — Spanish at /es/* and Brazilian Portuguese at
 * /pt-BR/* — their four slugs each.
 *
 * The documents are Markdown under content/legal/<language>/, written by the
 * legal thread; these trees render them. Three things can go wrong and none of
 * them is visible in a diff:
 *
 *   A  the reader renders the six constructs the documents use, and refuses
 *      anything else rather than printing it as literal asterisks
 *   B  no document can smuggle a link scheme past it
 *   C  every route exists, sits behind its own language's single gate, is
 *      rendered per request (so the document declares its own language), and
 *      the footer and the sitemap point at it instead of the English page
 *   D  every real document parses, carries its front matter, and keeps the
 *      company's registered name untranslated
 *
 * Both languages run the same rules, because the second language is where a
 * Spanish-only guard would have gone quiet. Every rule has a mutation control.
 *
 * Run: npx tsx lib/legal/__qa__/translated-legal-pages.qa.ts
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  parseInline,
  parseLegalMarkdown,
  readLegalDocument,
  LEGAL_SLUGS,
  LEGAL_LANGUAGES,
  type LegalLanguage,
  type Block,
  type Inline,
} from '../markdown'
import { portugueseSiteEnabled } from '@/lib/i18n/portuguese-site'
import { spanishSiteEnabled } from '@/lib/i18n/spanish-site'
import { italianSiteEnabled } from '../../i18n/italian-site'
import { japaneseSiteEnabled } from '../../i18n/japanese-site'
import { germanSiteEnabled } from '../../i18n/german-site'
import { dutchSiteEnabled } from '../../i18n/dutch-site'
import { polishSiteEnabled } from '../../i18n/polish-site'
import { frenchSiteEnabled } from '@/lib/i18n/french-site'
import { koreanSiteEnabled } from '../../i18n/korean-site'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/**
 * Whether a translated tree is reachable by the public today. It decides how the
 * two checks below are read: a document that sends its reader into another
 * language is a defect once people can open it, and until then it is an item
 * still owed. Both are reported — what is never allowed is a language that is
 * live AND still cross-links, which is the state nobody would notice.
 */
const LIVE: Record<LegalLanguage, boolean> = {
  es: spanishSiteEnabled(process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED),
  'pt-BR': portugueseSiteEnabled(process.env.NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED),
  fr: frenchSiteEnabled(process.env.NEXT_PUBLIC_FRENCH_SITE_ENABLED),
  it: italianSiteEnabled(process.env.NEXT_PUBLIC_ITALIAN_SITE_ENABLED),
  ja: japaneseSiteEnabled(process.env.NEXT_PUBLIC_JAPANESE_SITE_ENABLED),
  de: germanSiteEnabled(process.env.NEXT_PUBLIC_GERMAN_SITE_ENABLED),
  nl: dutchSiteEnabled(process.env.NEXT_PUBLIC_DUTCH_SITE_ENABLED),
  pl: polishSiteEnabled(process.env.NEXT_PUBLIC_POLISH_SITE_ENABLED),
  ko: koreanSiteEnabled(process.env.NEXT_PUBLIC_KOREAN_SITE_ENABLED),
}
const owed: string[] = []

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
  /** Each language's prefix, its flag's name in code, and its sitemap page. */
  const TREE: Record<LegalLanguage, { prefix: string; gate: string }> = {
    es: { prefix: '/es', gate: 'spanishSiteEnabled' },
    'pt-BR': { prefix: '/pt-BR', gate: 'portugueseSiteEnabled' },
    fr: { prefix: '/fr', gate: 'frenchSiteEnabled' },
    it: { prefix: '/it', gate: 'italianSiteEnabled' },
    ja: { prefix: '/ja', gate: 'japaneseSiteEnabled' },
    de: { prefix: '/de', gate: 'germanSiteEnabled' },
    nl: { prefix: '/nl', gate: 'dutchSiteEnabled' },
    pl: { prefix: '/pl', gate: 'polishSiteEnabled' },
    ko: { prefix: '/ko', gate: 'koreanSiteEnabled' },
  }

  for (const language of LEGAL_LANGUAGES) {
    const { prefix, gate } = TREE[language]
    for (const slug of LEGAL_SLUGS) {
      const page = `app/(public)${prefix}/${slug}/page.tsx`
      const src = existsSync(join(ROOT, page)) ? strip(read(page)) : ''
      check(`C1 (${language}): ${prefix}/${slug} is a route`, !!src)
      check(`C2 (${language}): …rendered by the shared frame, in its own language`,
        new RegExp(`TranslatedLegalPage slug="${slug}" language="${language}"`).test(src))
      // NOT prerendered, and the reason is the opposite of what this used to
      // assert. The root layout decides <html lang/dir> from the request, so a
      // force-static legal page came out as lang="en" on a translated URL. The
      // read it was protecting is handled instead by the per-process cache in
      // lib/legal/markdown.ts and by tracing the files into the server bundle.
      check(`C3 (${language}): …rendered per request, so the document declares its language`,
        !/export const dynamic = 'force-static'/.test(src))
    }

    // Each tree has ONE gate, in its layout: the pages carry no flag check, so
    // a new one cannot forget to be gated.
    const layout = strip(read(`app/(public)${prefix}/layout.tsx`))
    check(`C4 (${language}): the one ${prefix} gate still 404s the whole tree when the flag is off`,
      new RegExp(`if \\(!${gate}\\(\\)\\) notFound\\(\\)`).test(layout))
    check(`C5 (${language}): and no legal page carries a gate of its own`,
      LEGAL_SLUGS.every((s2) => !new RegExp(gate).test(strip(read(`app/(public)${prefix}/${s2}/page.tsx`)))))

    // Read RAW, not stripped: the glob itself contains `/**/`, which the
    // comment-stripping regex reads as the start of a block comment and swallows.
    const conf = read('next.config.ts')
    check(`C3b (${language}): the Markdown ships with the server trace`,
      /outputFileTracingIncludes/.test(conf) && conf.includes(`./content/legal/${language}/**/*`))

    const sitemap = strip(read(`app/(public)${prefix}/sitemap/page.tsx`))
    check(`C7 (${language}): the sitemap page lists this language's documents`,
      LEGAL_SLUGS.every((s2) => sitemap.includes(`href: '${prefix}/${s2}'`)),
      LEGAL_SLUGS.filter((s2) => !sitemap.includes(`href: '${prefix}/${s2}'`)).join(', '))
    check(`C8 (${language}): and no longer the English ones`,
      !/href: '\/en\/(privacy|terms|refund-policy|accessibility)'/.test(sitemap))
  }

  // The two things that replace force-static. Either one missing is a page that
  // either re-reads the disk on every request or cannot find the file at all
  // once deployed.
  const md = strip(read('lib/legal/markdown.ts'))
  check('C3a: the parse is cached per process, per language and slug',
    /const cache = new Map<string, LegalDocument>\(\)/.test(md) && /cache\.set\(key, doc\)/.test(md))
  const conf = read('next.config.ts')
  check('MUTATION — a config without the trace include is caught',
    !conf.replace("'./content/legal/pt-BR/**/*'", "'./other/**/*'").includes('./content/legal/pt-BR/**/*'))

  const footer = strip(read('components/Footer.tsx'))
  check('C6: the footer sends each language to its own documents', /const legalPrefix = prefix/.test(footer))

  // The whole legal tree is noindex, and a gated language is unreachable on top
  // of that.
  const frame = strip(read('components/public/TranslatedLegalPage.tsx'))
  check('C9: the translated legal metadata is noindex, like the other two languages',
    /robots: 'noindex, nofollow'/.test(frame))
  check('C9-MUT: a frame that dropped the noindex is caught',
    !/robots: 'noindex, nofollow'/.test(frame.replace(/robots: 'noindex, nofollow'/, "robots: 'index'")))
}

console.log('\nD) the real documents, in every language')
{
  const PREFIX: Record<LegalLanguage, string> = { es: '/es', 'pt-BR': '/pt-BR', fr: '/fr', it: '/it', ja: '/ja', de: '/de', nl: '/nl', pl: '/pl', ko: '/ko' }
  /** A translation of the registered company name is a mistake in any language. */
  const TRANSLATED_NAME = [
    /GO TOP (?:MARKETING|MARKETING Y|DE MARKETING)[^.]*(?:DIGITAL|S\.L|SL)\b/i,
    /Go Top Marketing y Publicidad/i,
    /Go Top Marketing e Publicidade/i,
  ]
  let allLinks = 0

  for (const language of LEGAL_LANGUAGES) {
    for (const slug of LEGAL_SLUGS) {
      const path = `content/legal/${language}/${slug}.md`
      check(`D1 (${language}): ${slug} is there`, existsSync(join(ROOT, path)))
      let doc: ReturnType<typeof readLegalDocument> | null = null
      check(`D2 (${language}): …and parses`, !threw(() => { doc = readLegalDocument(slug, language) }))
      if (!doc) continue
      const d = doc as ReturnType<typeof readLegalDocument>
      check(`D3 (${language}): …declaring its own language and the English page it came from`,
        d.frontMatter.locale === language && /^app\/\(public\)\/en\//.test(d.frontMatter.source),
        `${d.frontMatter.locale} / ${d.frontMatter.source}`)
      check(`D4 (${language}): …and a body with headings`, d.blocks.filter((b) => b.kind === 'heading').length >= 2)
      const body = d.blocks.map(blockText).join('\n')
      check(`D5 (${language}): …translated, with no Hebrew left in`, !/[֐-׿]/.test(body))
      // THE COMPANY'S REGISTERED NAME IS NEVER TRANSLATED (Oren, 2026-10-03):
      // the Hebrew pages carry the Hebrew name, English and every other language
      // carry the English name exactly as registered.
      const named = /GO TOP DIGITAL MARKETING AND ADVERTISING LTD/.test(body)
      check(`D6 (${language}): …and the registered company name is not translated`,
        !TRANSLATED_NAME.some((re) => re.test(body)), body.match(/GO TOP[^.\n]{0,60}/i)?.[0])
      if (slug === 'terms' || slug === 'privacy') {
        check(`D7 (${language}): ${slug} names the company as registered`, named)
      }
    }

    // Every internal link in a document points at a page of ITS OWN language.
    // A document may have none; what it may not do is send its reader to
    // another language's page.
    const links: string[] = []
    for (const slug of LEGAL_SLUGS) {
      for (const m of read(`content/legal/${language}/${slug}.md`).matchAll(/\]\((\/[^)]*)\)/g)) links.push(m[1])
    }
    allLinks += links.length
    // A document that sends its reader into another language's tree is a defect
    // the moment anyone can open it, and an item still owed before then. Both
    // are reported; the one state that is never allowed is a language that is
    // LIVE and still cross-links, because nobody would notice it.
    const strays = links.filter((l) => !l.startsWith(`${PREFIX[language]}/`))
    if (strays.length > 0 && !LIVE[language]) {
      owed.push(`${language}: ${[...new Set(strays)].join(', ')}`)
      check(`D8 (${language}): cross-links still point at another language, and this site is therefore off`,
        true, `owed before launch: ${[...new Set(strays)].join(', ')}`)
    } else {
      check(`D8 (${language}): the documents cross-link their own pages, never another language's`,
        strays.length === 0, strays.join(', '))
    }
  }

  // Not vacuous: at least one language really does cross-link, so D8 is reading
  // links rather than empty lists.
  check('D8a: at least one document carries an internal link at all', allLinks > 0)
  check('D8-MUT: a link into another language tree is caught',
    !['/en/privacy'].every((l) => l.startsWith('/es/')))
}

/*
 * THE CHANNEL-SPECIFIC-TERMS CLAUSE, in every language, pinned to the words.
 *
 * WHY IT EXISTS. Clause 10 already forbade giving "a guarantee on our behalf"
 * and using "a price, plan, trial or offer that is not ours", and neither
 * reaches the case that opened on 2026-11-13: /go/digistore24 now carries a
 * 60-day money-back guarantee that Digistore24 gives and the PayPal and Creem
 * channels do not. An affiliate who advertises it is inventing nothing and
 * using nothing that is not ours — the term is real and it is on our product.
 * The defect is that it belongs to ONE place the Service is sold and the
 * promotion carries it to buyers who pay somewhere it does not apply, in our
 * name and on our page's strength. So the rule is about which channel a term
 * belongs to, not about falsity, and it had to be a new bullet.
 *
 * The text is the legal thread's, drafted 2026-11-13 and reproduced here
 * character for character, so a reworded page fails rather than drifts. Two
 * documents are TSX and not Markdown — Hebrew at app/(legal)/affiliate-terms
 * and English at app/(public)/en/affiliate-terms — and they are read as text
 * for exactly that reason: the rule is about the published words, not about
 * where they are stored.
 *
 * KOREAN WAS HELD BACK FOR A DAY AND IS NOW PUBLISHED. The first ko draft
 * arrived with seven corrupted syllables (서버스 for 서비스, 환불 부장 for
 * 환불 보장, 가객 for 가격, 전잴 for 전체, 자제 for 자체, 함꿨 for 함께, and
 * 그에게 for 귀하에게), because it had been written as hand-typed unicode
 * escapes rather than literal text. It was not published: a legal clause with
 * broken words in it is worse than one not yet translated. The corrected text
 * is here. It is still Korean prose that no Korean speaker has read, which is
 * part of the bundle the locale thread is putting to the owner, and the ko
 * site stays behind NEXT_PUBLIC_KOREAN_SITE_ENABLED until that review.
 *
 * HEBREW USES THE PAGE'S REGISTER, not the draft's. The he affiliate terms
 * address the reader as "אסור לך" throughout and the drafted paragraph was in
 * the plural, which reads as text pasted in from elsewhere. The legal thread
 * changed it to the singular on being asked; the rule that came out of it is
 * that the register belongs to the page and the substance to them.
 */
console.log('\nE) The channel-specific-terms clause (clause 10)')
{
  const CLAUSE = new Map<string, { bullet: string; para: string }>([
  ['he', {
    bullet: 'לפרסם תקופת החזר, אחריות להחזר כספי, מחיר או מטבע שתקפים רק באחד המקומות שבהם השירות נמכר, כאילו הם תקפים לשירות בכלל, או להשתמש בהם בכל קידום שמוביל לקופה שלנו או למקום שאינו כולל אותם;',
    para: 'אם אתה מזכיר תנאי כזה, ציין באותו מקום מי המוכר שממנו הוא בא. תנאי שמקורו בזירת מכירה חיצונית הוא תנאי שלה: הוא עשוי להשתנות או להסתיים בלי הודעה אליך, ואנחנו לא חבים בו ברכישה שנעשתה במקום אחר.',
  }],
  ['en', {
    bullet: 'advertise a refund window, money-back guarantee, price or currency that applies only to one of the places the Service is sold as if it applied to the Service generally, or use it in any promotion that leads to our own checkout or to a place that does not carry it;',
    para: 'Where you do name such a term, name the seller it comes from in the same place. A term that belongs to a marketplace is that marketplace\'s term: it can change or end without notice to you, and we do not owe it on a purchase made anywhere else.',
  }],
  ['de', {
    bullet: 'eine Rückgabefrist, eine Geld-zurück-Garantie, einen Preis oder eine Währung, die nur an einem der Orte gelten, an denen der Dienst verkauft wird, so darzustellen, als gälten sie für den Dienst allgemein, oder sie in einer Werbung zu verwenden, die zu unserer eigenen Kasse oder zu einem Ort führt, an dem sie nicht gelten;',
    para: 'Wenn Sie eine solche Bedingung nennen, nennen Sie an derselben Stelle den Verkäufer, von dem sie stammt. Eine Bedingung, die zu einem Marktplatz gehört, ist die Bedingung dieses Marktplatzes: sie kann sich ohne Mitteilung an Sie ändern oder entfallen, und wir schulden sie bei einem Kauf an anderer Stelle nicht.',
  }],
  ['es', {
    bullet: 'presentar un plazo de devolución, una garantía de devolución del dinero, un precio o una moneda que solo se aplican en uno de los lugares donde se vende el Servicio como si se aplicaran al Servicio en general, ni usarlos en una promoción que lleve a nuestra propia caja o a un lugar donde no se apliquen;',
    para: 'Si menciona una condición de este tipo, indique en el mismo lugar el vendedor del que proviene. Una condición que pertenece a un marketplace es su condición: puede cambiar o terminar sin aviso para usted, y no la debemos en una compra hecha en otro lugar.',
  }],
  ['fr', {
    bullet: 'présenter un délai de remboursement, une garantie de remboursement, un prix ou une devise qui ne s\'appliquent qu\'à l\'un des endroits où le Service est vendu comme s\'ils s\'appliquaient au Service en général, ni les utiliser dans une promotion qui mène à notre propre paiement ou à un endroit où ils ne s\'appliquent pas ;',
    para: 'Si vous mentionnez une telle condition, indiquez au même endroit le vendeur dont elle provient. Une condition qui appartient à une place de marché est la condition de cette place de marché : elle peut changer ou disparaître sans que vous en soyez informé, et nous ne la devons pas pour un achat effectué ailleurs.',
  }],
  ['it', {
    bullet: 'presentare un termine di rimborso, una garanzia di rimborso, un prezzo o una valuta validi solo in uno dei luoghi in cui il Servizio è venduto come se valessero per il Servizio in generale, né usarli in una promozione che porti alla nostra cassa o a un luogo in cui non valgono;',
    para: 'Se citi una condizione di questo tipo, indica nello stesso punto il venditore da cui proviene. Una condizione che appartiene a un marketplace è la condizione di quel marketplace: può cambiare o cessare senza preavviso nei tuoi confronti e non è dovuta da noi per un acquisto effettuato altrove.',
  }],
  ['pt-BR', {
    bullet: 'apresentar um prazo de devolução, uma garantia de devolução do dinheiro, um preço ou uma moeda que valem apenas em um dos lugares onde o Serviço é vendido como se valessem para o Serviço em geral, nem usá-los em uma divulgação que leve ao nosso próprio checkout ou a um lugar onde não valem;',
    para: 'Se você mencionar uma condição desse tipo, indique no mesmo lugar o vendedor de quem ela vem. Uma condição que pertence a um marketplace é a condição daquele marketplace: pode mudar ou terminar sem aviso a você, e não a devemos em uma compra feita em outro lugar.',
  }],
  ['nl', {
    bullet: 'een retourtermijn, een niet-goed-geld-terug-garantie, een prijs of een valuta die alleen gelden op één van de plaatsen waar de Dienst wordt verkocht, voorstellen alsof zij voor de Dienst in het algemeen gelden, of ze gebruiken in een promotie die naar onze eigen afrekenpagina of naar een plaats leidt waar zij niet gelden;',
    para: 'Noemt u een dergelijke voorwaarde, vermeld dan op dezelfde plaats de verkoper van wie zij komt. Een voorwaarde die bij een marktplaats hoort, is de voorwaarde van die marktplaats: zij kan zonder bericht aan u wijzigen of eindigen, en wij zijn haar niet verschuldigd bij een aankoop die elders is gedaan.',
  }],
  ['pl', {
    bullet: 'przedstawiać terminu zwrotu, gwarancji zwrotu pieniędzy, ceny ani waluty, które obowiązują tylko w jednym z miejsc sprzedaży Usługi, tak jakby obowiązywały dla Usługi w ogóle, ani używać ich w promocji prowadzącej do naszej własnej płatności lub do miejsca, w którym nie obowiązują;',
    para: 'Jeżeli Państwo powołują się na taki warunek, proszę wskazać w tym samym miejscu sprzedawcę, od którego on pochodzi. Warunek należący do platformy sprzedażowej jest warunkiem tej platformy: może zostać zmieniony lub zakończony bez powiadomienia Państwa, a my nie jesteśmy nim zobowiązani przy zakupie dokonanym w innym miejscu.',
  }],
  ['ja', {
    bullet: '本サービスが販売されている一部の場所にのみ適用される返金期間、返金保証、価格または通貨を、本サービス全般に適用されるかのように表示すること、またはそれらを当社自身の決済もしくはそれらが適用されない場所へ誘導する宣伝に用いること。',
    para: 'そのような条件に言及する場合は、同じ箇所にその条件の提供元である販売者を明記してください。マーケットプレイスに属する条件はそのマーケットプレイスの条件であり、お客様への通知なく変更または終了されることがあり、他の場所で行われた購入について当社が負うものではありません。',
  }],
  ['ko', {
    bullet: '본 서비스가 판매되는 일부 경로에만 적용되는 환불 기간, 환불 보장, 가격 또는 통화를 서비스 전체에 적용되는 것처럼 표시하거나, 당사의 자체 결제 또는 해당 조건이 적용되지 않는 경로로 연결되는 홍보에 사용하는 행위',
    para: '그러한 조건을 언급할 때에는 같은 위치에 그 조건을 제공하는 판매자를 함께 밝혀 주십시오. 마켓플레이스에 속한 조건은 해당 마켓플레이스의 조건이며, 귀하에게 통지 없이 변경되거나 종료될 수 있고, 다른 곳에서 이루어진 구매에 대하여 당사가 부담하는 조건이 아닙니다.',
  }],
  ])
  /* The two documents that are pages rather than Markdown. */
  const DOC: Record<string, string> = {
    he: 'app/(legal)/affiliate-terms/page.tsx',
    en: 'app/(public)/en/affiliate-terms/page.tsx',
  }
  /* Whitespace only: a JSX line wrap and a Markdown line wrap are the same
     sentence, and neither is a change to the terms. */
  const flatten = (s: string) => s.replace(/\s+/g, ' ')
  /* The TSX documents escape the apostrophe, which Markdown does not. */
  const normalise = (s: string) => flatten(s).replace(/&rsquo;/g, "'")

  let checked = 0
  for (const [language, text] of CLAUSE) {
    const path = DOC[language] ?? `content/legal/${language}/affiliate-terms.md`
    const src = normalise(read(path))
    check(`E1 (${language}): the clause-10 bullet is published in these exact words`,
      src.includes(flatten(text.bullet)))
    check(`E2 (${language}): and the paragraph after the list`,
      src.includes(flatten(text.para)))
    checked += 1
  }
  check('E3: all eleven documents carry it, so E1/E2 are not reading an empty list', checked === 11)
  /* MUTATION CONTROLS. */
  check('E-MUT1: a reworded bullet is caught',
    !normalise(read(DOC.en)).includes(flatten(CLAUSE.get('en')!.bullet.replace('only to one of', 'to any of'))))
  check('E-MUT2: a dropped paragraph is caught',
    !normalise(read(DOC.en)).replace(flatten(CLAUSE.get('en')!.para), '')
      .includes(flatten(CLAUSE.get('en')!.para)))
  check('E-MUT3: and a language that simply never got it would fail E1',
    !normalise('## 10.').includes(flatten(CLAUSE.get('de')!.bullet)))
}

if (owed.length > 0) {
  console.log('\n  OWED BEFORE LAUNCH (not failures while the language is off):')
  for (const line of owed) console.log(`    - ${line}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
