/**
 * EVERY TRANSLATED LEGAL DOCUMENT, HELD AGAINST ITS ENGLISH SOURCE.
 *
 * This replaces spanish-legal-coverage.qa.ts, which did the same job for one
 * language. It iterates whatever is under content/legal/, so adding the next
 * language adds its checks without editing this file.
 *
 * The documents live as Markdown and NOT as pages, on purpose: the /es and
 * /pt-BR route trees and the build-time flag that keeps them dark live on the
 * language branch, so a page created here would go live in production the
 * moment this branch merged, ungated. The language branch wires the routes;
 * this branch owns the text.
 *
 * What that costs is the thing this suite buys back. A page is rendered, so
 * legal-coverage.qa.ts can assert what a reader sees; a Markdown file is not,
 * so nothing would otherwise notice it drifting from the English it was
 * translated from. Five failures are worth catching:
 *
 *   1. A section added to an English document and not to the translation. The
 *      heading count is compared, which is crude but catches exactly that. A
 *      translation may carry MORE sections than its source, because a country
 *      can require something the English page has no reason to say — it then
 *      declares how many and why in its front matter, so the extra is a
 *      decision on the record rather than a drift.
 *   2. A sub-processor or a platform connection named in English and missing in
 *      the translation — the gap Oren found in the Hebrew and English text on
 *      2026-10-03, which must not be reintroduced one language over.
 *   3. The company's legal name translated. In every language but Hebrew it is
 *      the English name exactly as registered; a local rendering of it would
 *      not match the registrar.
 *   4. A link into a language tree with no page behind it — dead either because
 *      the language branch has not landed yet or because the page was renamed.
 *   5. The owner's own refund rule softened, or a promise invented, in a
 *      language he cannot read. Each language is checked for the rule in its
 *      own words, and for the absence of an unconditional promise nobody made.
 *
 * Per-language law goes in LAW below: the one or two sentences a document in
 * that language must carry because a statute, not a translator, puts them
 * there. For pt-BR that is the Consumer Code's seven-day withdrawal right and
 * the LGPD rights section — the two things a Brazilian launch would be wrong
 * without, and the two most likely to be lost in a future rewrite.
 *
 * MUTATION CONTROL at the end: each class of check is re-run against text with
 * the thing it looks for removed, and must then fail.
 *
 * Run: npx tsx components/public/__qa__/translated-legal-coverage.qa.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const DOCS = ['terms', 'privacy', 'refund-policy', 'accessibility', 'affiliate-terms'] as const
type Doc = (typeof DOCS)[number]

const ROOT = 'content/legal'
/** The languages are read off the filesystem, so the next one is covered by existing. */
const LOCALES = readdirSync(ROOT).filter((d) => statSync(`${ROOT}/${d}`).isDirectory()).sort()
check(`content/legal holds at least one translated language (${LOCALES.join(', ')})`, LOCALES.length > 0)

const file = (locale: string, doc: Doc) => `${ROOT}/${locale}/${doc}.md`

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

/**
 * THE REGISTER IS DECLARED PER LANGUAGE, AND IT CAN DIFFER FROM THE REST OF THE SITE.
 *
 * The Spanish marketing and dashboard copy uses "tú"; the Spanish legal
 * documents use "usted", and that is not an oversight to be tidied up later. A
 * contract, a privacy policy and a refund policy are read as statements of
 * what each side owes, and the formal second person is the register that
 * Spanish-language consumer law and every comparable policy use. Brazilian
 * Portuguese is the other way round: "você" IS the register of Brazilian
 * consumer contracts and of the Consumer Code's own plain-language rule, so
 * "usted"-style formality there would read as European and wrong.
 *
 * Mixing two registers inside one document is the real mistake, so these
 * checks are for consistency with the file's own declared `register` rather
 * than for a particular pronoun.
 */
const REGISTER_FORBIDS: Record<string, { label: string; patterns: RegExp[] }> = {
  usted: {
    label: 'tuteo in a document written in usted',
    patterns: [/\btú\b/, /\btu(s)? (cuenta|sitio|plan|proyecto|informaci[óo]n|datos)\b/, /\btienes\b/, /\bpuedes\b/, /\bdebes\b/, /\btu propia\b/],
  },
  voce: {
    // European Portuguese second person, and the formal "o senhor", both read
    // as the wrong document to a Brazilian reader.
    label: 'European or over-formal Portuguese in a document written in você',
    patterns: [/\bo senhor\b/i, /\bna sua conta tens\b/, /\btens\b/, /\bpodes\b/, /\bdeves\b/, /\bteu(s)? (site|plano|projeto|dados)\b/],
  },
}

/** What a statute, not a translator, requires of a document in this language. */
const LAW: Record<string, { doc: Doc; name: string; must: RegExp }[]> = {
  es: [
    { doc: 'affiliate-terms', name: 'the Spanish rule that a commercial communication must be identifiable', must: /art[íi]culo 20 de la Ley 34\/2002/ },
    { doc: 'affiliate-terms', name: 'the FTC endorsement guides, by citation', must: /16 CFR/ },
    { doc: 'affiliate-terms', name: 'that the partner gets no personal data of the customers they refer', must: /No recibe datos personales/i },
    { doc: 'privacy', name: 'that a partner is not given a referred customer\'s address, site or plan', must: /no recibe la direcci[óo]n de correo electr[óo]nico, el sitio web, el plan/ },
  ],
  'pt-BR': [
    { doc: 'refund-policy', name: 'the Consumer Code\'s seven-day withdrawal right, by article', must: /art\.\s*49/ },
    { doc: 'refund-policy', name: 'the seven-day period in words', must: /7 dias corridos/ },
    { doc: 'refund-policy', name: 'that the money comes back monetarily updated', must: /monetariamente atualizados/ },
    { doc: 'terms', name: 'the same withdrawal right in the terms', must: /art\.\s*49/ },
    { doc: 'terms', name: 'that starting the service does not forfeit it in Brazil', must: /n[ãa]o faz voc[êe] perder o direito de arrependimento/ },
    { doc: 'terms', name: 'the Consumer Code\'s forum rule, so the Israeli-courts clause is not read as absolute', must: /art\.\s*101/ },
    { doc: 'privacy', name: 'the LGPD by name and number', must: /Lei n[ºo]\s*13\.709\/2018/ },
    { doc: 'privacy', name: 'the LGPD\'s 15-day answer deadline', must: /15 dias/ },
    { doc: 'privacy', name: 'the ANPD as the authority to complain to', must: /\bANPD\b/ },
    { doc: 'privacy', name: 'the communication channel that stands in for an appointed officer', must: /canal de comunica[çc][ãa]o/ },
    { doc: 'accessibility', name: 'the Brazilian accessibility standard', must: /NBR 17060/ },
    { doc: 'affiliate-terms', name: 'the Consumer Code\'s rule that advertising must be identifiable, by article', must: /artigo 36/ },
    { doc: 'affiliate-terms', name: 'the CONAR influencer guide, which is what a Brazilian partner is actually judged against', must: /CONAR/ },
    { doc: 'affiliate-terms', name: 'the FTC endorsement guides, by citation', must: /16 CFR/ },
    { doc: 'affiliate-terms', name: 'the Consumer Code\'s forum rule in the partner agreement too', must: /art\.\s*101/ },
    { doc: 'affiliate-terms', name: 'that the partner gets no personal data of the customers they refer', must: /n[ãa]o recebe dados pessoais/i },
    { doc: 'privacy', name: 'that a partner is not given a referred customer\'s address, site or plan', must: /n[ãa]o recebe o endere[çc]o de e-mail, o site, o plano/ },
  ],
}

// ── 1) the files exist, and their front matter says what they are ───────────
const text: Record<string, Record<Doc, string>> = {}
for (const locale of LOCALES) {
  console.log(`\n${locale}`)
  text[locale] = {} as never
  for (const doc of DOCS) {
    const exists = existsSync(file(locale, doc))
    check(`${doc}: the document exists`, exists, file(locale, doc))
    text[locale][doc] = exists ? readFileSync(file(locale, doc), 'utf8') : ''
  }
  for (const doc of DOCS) {
    const fm = frontMatter(text[locale][doc])
    check(`${doc}: front matter has a title`, !!fm.title && /Go Top SEO/.test(fm.title))
    check(`${doc}: front matter has a description`, !!fm.description && fm.description.length > 10)
    check(`${doc}: front matter says its own locale`, fm.locale === locale, `${fm.locale} vs the directory ${locale}`)
    check(`${doc}: front matter names its English source`, !!fm.source && existsSync(fm.source), fm.source)
    check(`${doc}: front matter carries a revision date`, /^\d{4}-\d{2}-\d{2}$/.test(fm.lastUpdated ?? ''), fm.lastUpdated)
    check(`${doc}: front matter declares the register`, !!fm.register && fm.register in REGISTER_FORBIDS, fm.register)
  }
}

// ── 1a) the rendered date and the written date are the same date ────────────
/*
 * THE FOOTER IS THE FRONT MATTER, AND THE READER SEES BOTH.
 *
 * A translated document carries its revision date twice: `lastUpdated` in the
 * front matter, which is what the page renders in its footer, and the
 * document's own closing sentence, which is what a reader quoting the policy
 * would cite. On 9 October 2026 the Spanish and Brazilian privacy policies and
 * terms went live saying "9 de octubre" in the body under a footer that said
 * "6 de octubre", because the email revision moved the sentence and not the
 * field. Two different revision dates on one live legal page is the kind of
 * contradiction that is read against us, so neither may move without the other.
 *
 * DERIVED, not pinned: the date is parsed out of the document's own closing
 * sentence in its own language and compared with the field. A document with no
 * such sentence is not failed here — section 7 and the per-language law cover
 * what each document must say — but one that has it must agree with its footer.
 */
const MONTHS: Record<string, string[]> = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  'pt-BR': ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
}

/** The date in the document's own closing revision sentence, as YYYY-MM-DD, or null. */
function writtenRevisionDate(locale: string, src: string): string | null {
  const months = MONTHS[locale]
  if (!months) return null
  // Only a line that is about updating: a date inside the text of a statute
  // ("in force since 14 August 2025") is not this document's revision date.
  const line = /[^\n]*(actualiz|atualiza)[^\n]*\b(\d{1,2}) de ([A-Za-zçãéíóú]+) de (\d{4})/gi
  let found: RegExpExecArray | null = null
  for (let m = line.exec(src); m; m = line.exec(src)) found = m
  if (!found) return null
  const month = months.indexOf(found[3].toLowerCase())
  if (month < 0) return null
  return `${found[4]}-${String(month + 1).padStart(2, '0')}-${String(Number(found[2])).padStart(2, '0')}`
}

for (const locale of LOCALES) for (const doc of DOCS) {
  const fm = frontMatter(text[locale][doc])
  const written = writtenRevisionDate(locale, text[locale][doc])
  if (!written) continue
  check(`${locale} ${doc}: the footer date and the written date agree (${fm.lastUpdated} / ${written})`, fm.lastUpdated === written)
}

// ── 2) the register each document declares, kept throughout it ──────────────
for (const locale of LOCALES) {
  for (const doc of DOCS) {
    const fm = frontMatter(text[locale][doc])
    const rule = REGISTER_FORBIDS[fm.register]
    if (!rule) continue
    const slip = rule.patterns.find((re) => re.test(text[locale][doc]))
    check(`${locale}/${doc}: no ${rule.label}`, !slip, slip?.source)
  }
}

// ── 3) the section count follows the English page, or declares its extras ───
// Headings are compared, not words: a translation legitimately differs in
// length, but it does not legitimately have FEWER sections than its source,
// and an extra one is a decision that gets written down.
for (const locale of LOCALES) {
  for (const doc of DOCS) {
    const fm = frontMatter(text[locale][doc])
    if (!fm.source || !existsSync(fm.source)) continue
    const en = (readFileSync(fm.source, 'utf8').match(/<h2>/g) ?? []).length
    const here = (text[locale][doc].match(/^## /gm) ?? []).length
    const extra = Number(fm.extraSections ?? '0')
    check(`${locale}/${doc}: section count is English plus its declared extras (${here} = ${en} + ${extra})`,
      Number.isFinite(extra) && here === en + extra)
    if (extra > 0) {
      check(`${locale}/${doc}: the extra section says in writing why it is there`,
        (fm.extraReason ?? '').length > 40, fm.extraReason)
    }
  }
}

// ── 4) every provider and platform named in English is named here ───────────
// Read out of the English page rather than listed here, so a provider added
// there and not translated fails without anyone editing this suite.
const PROVIDERS = [
  'Supabase', 'Vercel', 'Serper', 'Resend', 'PayPal', 'Shopify', 'Wix', 'PDFShift',
  'OpenStreetMap', 'Nominatim', 'Gemini', 'Search Console', 'Business Profile',
  'Google Ads', 'ScrapeLLM', 'Meta', 'WordPress', 'GO TOP SEO Bridge', 'webhook',
] as const
for (const locale of LOCALES) {
  for (const doc of DOCS) {
    const fm = frontMatter(text[locale][doc])
    if (!fm.source || !existsSync(fm.source)) continue
    const en = readFileSync(fm.source, 'utf8')
    for (const provider of PROVIDERS) {
      // Case-sensitive, whole word. Substring matching found "Meta" inside the
      // page's own `metadata` export and inside "meta description", which is
      // the false positive this avoids.
      const named = new RegExp(`\\b${provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
      if (!named.test(en)) continue
      check(`${locale}/${doc}: "${provider}" is named in English, so it is named here`,
        named.test(text[locale][doc]), 'the English document names it and this one does not')
    }
  }
}

// ── 5) the registered company name, untranslated ────────────────────────────
// Hebrew uses the Hebrew name; every other language uses the English name
// exactly as registered, typo included, because that is what the registrar has.
const REGISTERED = 'GO TOP MARKETING GRUO LTD'
const TRANSLATED_NAME = /GO TOP (MARKETING|MERCADEO|MARKETING DIGITAL) (DIGITAL|Y PUBLICIDAD|E PUBLICIDADE|SRL|S\.?L\.?|LTDA\.?)/i
for (const locale of LOCALES) {
  for (const doc of DOCS) {
    const src = text[locale][doc]
    if (!/517274346/.test(src) && !src.includes(REGISTERED)) continue
    check(`${locale}/${doc}: the company name is the registered English one`, src.includes(REGISTERED))
    check(`${locale}/${doc}: the company name was not translated or re-spelled`, !TRANSLATED_NAME.test(src))
    check(`${locale}/${doc}: the Hebrew company name is not used`, !/גו טופ/.test(src))
  }
  check(`${locale}: the contact documents carry the company number`,
    /517274346/.test(text[locale]['refund-policy']) || /517274346/.test(text[locale].terms))
}

// ── 6) no link to a route that does not exist ───────────────────────────────
/*
 * This check used to be "no /es/... link at all", on the reasoning that the
 * language routes live only on the language branch. That stopped being true
 * when the Spanish branch merged: it wires /es/terms and friends, and its one
 * edit to this text is to point the cross-links at them. So the rule is the
 * one that was always meant — a link into a language tree must resolve to a
 * page that exists in this repository — which also catches the opposite
 * mistake of linking a language route before anyone built it.
 */
const routeExists = (href: string) => {
  const [, locale, page] = href.split('/')
  return !!locale && !!page && existsSync(`app/(public)/${locale}/${page}/page.tsx`)
}
for (const locale of LOCALES) {
  for (const doc of DOCS) {
    const dead = [...text[locale][doc].matchAll(/\]\((\/[a-zA-Z-]+\/[^)]*)\)/g)]
      .map((m) => m[1])
      .filter((href) => LOCALES.some((l) => href.startsWith(`/${l}/`)))
      .filter((href) => !routeExists(href))
    check(`${locale}/${doc}: every link into a language tree resolves to a page that exists`,
      dead.length === 0, dead.join(', '))
  }
}

// ── 7) the refund rule, which is the owner's own decision ───────────────────
// Translated, never redrafted: no refund on a paid period except where the law
// requires one, cancellation at any time, access to the end of the period. A
// goodwill promise appearing in one language only would be a commitment nobody
// made — which is why the 14-day check is per language and allows the European
// right where the English page itself grants it.
const REFUND: Record<string, { name: string; must: RegExp }[]> = {
  es: [
    { name: 'says subscription payments are not refunded', must: /no se reembolsan/i },
    { name: 'keeps the only exception being the law', must: /la ley exige|exija la ley|exige la ley/i },
    { name: 'keeps cancellation at any time', must: /en cualquier momento/i },
    { name: 'keeps access to the end of the paid period', must: /hasta el final del periodo/i },
  ],
  'pt-BR': [
    { name: 'says subscription payments are not refunded', must: /n[ãa]o s[ãa]o reembolsados/i },
    { name: 'keeps the only exception being the law', must: /a lei exig/i },
    { name: 'keeps cancellation at any time', must: /a qualquer momento/i },
    { name: 'keeps access to the end of the paid period', must: /at[ée] o fim do per[íi]odo/i },
  ],
}
for (const locale of LOCALES) {
  for (const rule of REFUND[locale] ?? []) {
    check(`${locale}/refund-policy: ${rule.name}`, rule.must.test(text[locale]['refund-policy']), rule.must.source)
  }
  check(`${locale}/refund-policy: a refund promise exists in this language only if the English page grants one`,
    !/\b14 d[ií]as\b|\b14 dias\b/i.test(text[locale]['refund-policy']))
}

// ── 8) what the law of the language's country requires ──────────────────────
for (const locale of LOCALES) {
  for (const item of LAW[locale] ?? []) {
    check(`${locale}/${item.doc}: ${item.name}`, item.must.test(text[locale][item.doc]), item.must.source)
  }
}

// ── 9) the Program's own numbers, identical in every language ──────────────
/*
 * A commission rate, an attribution window or a payout threshold that came out
 * of a translation as a different number is not a wording problem: it is a
 * different promise, and the agreement says the version the partner accepted is
 * the one that governs it. So each number is held against the English source,
 * and against every translation of it, rather than being trusted to a reader.
 */
const PROGRAM_NUMBERS = ['30%', '40%', '90', '30', '100', '350'] as const
{
  const enSource = frontMatter(text[LOCALES[0]]['affiliate-terms']).source
  const en = enSource && existsSync(enSource) ? readFileSync(enSource, 'utf8') : ''
  for (const n of PROGRAM_NUMBERS) {
    check(`the English partner agreement states ${n}`, en.includes(n), enSource)
  }
  for (const locale of LOCALES) {
    for (const n of PROGRAM_NUMBERS) {
      check(`${locale}/affiliate-terms: states ${n}, like its source`,
        text[locale]['affiliate-terms'].includes(n))
    }
  }
}

// ── 9) the partner program claims no cookie and no day count ───────────────
/*
 * The design changed on 2026-10-05 and the text had to follow it. The policy
 * used to describe one cookie, gt_ref, keeping a partner's code for 90 days.
 * That cookie was set BEFORE consent in the first draft, which ePrivacy art.
 * 5(3) forbids for an attribution cookie — the site works without it and only
 * the credit is lost, so it is not strictly necessary — and the mechanism that
 * replaced it stores nothing at all: the code rides in the link and is read on
 * the way to signing up.
 *
 * So the documents must now claim the ABSENCE, and claim it identically. Two
 * failures are guarded, and they are opposite in kind:
 *
 *   - a day count or a cookie name coming back into any document while nothing
 *     stores one, which would promise a partner a memory that does not exist
 *     and would describe to a visitor a cookie that is never written;
 *   - a language that loses the sentence saying no cookie is set, which leaves
 *     a reader unable to tell whether their refusal costs the partner the
 *     commission. It does not, and every language has to say so.
 *
 * The marketing page is held to the same thing from the other side by the
 * build thread's own guard. If storage is ever added, both sides change in one
 * commit, with the consent ask, and this section is what makes that unavoidable.
 */
const NO_REFERRAL_STORAGE: Record<string, RegExp[]> = {
  he: [/אינה שומרת עוגייה כלל/, /נוסע בקישור/],
  en: [/sets no cookie at all/, /travels in the link itself/],
  es: [/no instala ninguna cookie/, /viaja en el propio enlace/],
  'pt-BR': [/n[ãa]o grava nenhum cookie/, /viaja no pr[óo]prio link/],
}
const HEBREW_PRIVACY = 'app/(legal)/privacy/page.tsx'
{
  const enSource = frontMatter(text[LOCALES[0]].privacy).source
  const pages: [string, string][] = [
    ['he', existsSync(HEBREW_PRIVACY) ? readFileSync(HEBREW_PRIVACY, 'utf8') : ''],
    ['en', enSource && existsSync(enSource) ? readFileSync(enSource, 'utf8') : ''],
    ...LOCALES.map((l): [string, string] => [l, text[l].privacy]),
  ]
  for (const [name, src] of pages) {
    check(`${name}/privacy: the page was read`, src.length > 0)
    check(`${name}/privacy: no referral cookie is named`, !/gt_ref/.test(src))
    for (const must of NO_REFERRAL_STORAGE[name] ?? []) {
      check(`${name}/privacy: states ${must.source.slice(0, 32)}`, must.test(src))
    }
  }
  // The agreement cannot promise a window the mechanism has no way to honour.
  const AGREEMENTS: [string, string][] = [
    ['he', 'app/(legal)/affiliate-terms/page.tsx'],
    ['en', frontMatter(text[LOCALES[0]]['affiliate-terms']).source],
  ]
  for (const [name, path] of AGREEMENTS) {
    const src = path && existsSync(path) ? readFileSync(path, 'utf8') : ''
    check(`${name}/affiliate-terms: the page was read`, src.length > 0)
    check(`${name}/affiliate-terms: no attribution window in days`,
      !/(Attribution Window|חלון השיוך)/.test(src))
  }
  for (const l of LOCALES) {
    check(`${l}/affiliate-terms: no attribution window in days`,
      !/(ventana de atribuci[óo]n|janela de atribui[çc][ãa]o)/i.test(text[l]['affiliate-terms']))
  }
}

// ── 10) the accessibility statement says how it was verified ───────────────
/*
 * An accessibility statement is a public declaration, so an inaccurate one is
 * its own exposure: in Israel under the deception provisions of the Consumer
 * Protection Law, 1981, and in the EU under the model statement the EAA builds
 * on, which expects the evaluation method to be named. The statement therefore
 * says exactly what is checked automatically, that an automated pass is not
 * all of it, and that no audit by a person using assistive technology has been
 * done yet — which is the stated reason it says "partially" rather than
 * "fully". The three facts are held together: a statement that keeps the word
 * "partially" while dropping the reason, or that claims full conformance, has
 * to fail here rather than in front of a regulator.
 */
const HEBREW_A11Y = 'app/(legal)/accessibility/page.tsx'
const A11Y_METHOD: Record<string, RegExp[]> = {
  he: [/כיצד נבדקנו/, /WCAG 2\.1/, /טכנולוגיה\s*\n?\s*מסייעת/, /טרם נעשתה/, /חלקית/],
  en: [/How we are checked/, /WCAG 2\.1/, /assistive technology/, /has not been carried out/, /partially/i],
  es: [/C[óo]mo se nos comprueba/, /WCAG 2\.1/, /tecnolog[íi]a de asistencia/, /todav[íi]a no se ha realizado/, /parcialmente/i],
  'pt-BR': [/Como somos verificados/, /WCAG 2\.1/, /tecnologia assistiva/, /ainda n[ãa]o foi feita/, /parcialmente/i],
}
{
  const enA11ySource = frontMatter(text[LOCALES[0]].accessibility).source
  const pages: [string, string][] = [
    ['he', existsSync(HEBREW_A11Y) ? readFileSync(HEBREW_A11Y, 'utf8') : ''],
    ['en', enA11ySource && existsSync(enA11ySource) ? readFileSync(enA11ySource, 'utf8') : ''],
    ...LOCALES.map((l): [string, string] => [l, text[l].accessibility]),
  ]
  for (const [name, src] of pages) {
    check(`${name}/accessibility: the page was read`, src.length > 0)
    for (const must of A11Y_METHOD[name] ?? []) {
      check(`${name}/accessibility: states ${must.source.slice(0, 34)}`, must.test(src))
    }
    check(`${name}/accessibility: claims no full conformance`,
      !/fully conformant|totalmente conformes?|מותאמים במלואם|plenamente conforme/i.test(src))
  }
}

// ── 11) outbound contact after a free check, disclosed in every language ────
/*
 * Oren asked on 2026-10-05 whether he may phone a number he found on the site
 * of a business that ran a free check, when that visitor did not tick the
 * marketing box. He may: the number was published by the business, not given to
 * us, so the call rests on legitimate interest in a business offer (Art.
 * 6(1)(f)) rather than on a consent that was never given for it. But Art. 13
 * requires the purpose to be disclosed, Art. 14 requires the source to be given
 * when the data did not come from the person, and Art. 21(2) requires the
 * objection right to be brought to their attention at the first communication.
 * The policy said nothing about outbound contact at all — it described WhatsApp
 * and calls coming IN — so doing it would have been undisclosed processing.
 *
 * Three facts are held per language, because dropping any one of them turns a
 * defensible practice back into an undisclosed one: that we may contact the
 * business through details it published itself, the basis we do it on, and the
 * absolute right to tell us to stop, in any channel.
 */
const OUTBOUND_CONTACT: Record<string, RegExp[]> = {
  he: [/עשויים גם לפנות לעסק/, /מפרסם באתר שלו/, /6\(1\)\(ו\)/, /זכות מוחלטת/, /21\(2\)/],
  en: [/contact the business whose website was checked/, /publishes on its own site/, /6\(1\)\(f\)/, /absolute right/, /21\(2\)/],
  es: [/contactar con la empresa cuyo sitio web se comprob/, /publica en su propio sitio/, /6\.1\.f/, /derecho absoluto/, /21\.2/],
  'pt-BR': [/entrar em contato com a empresa cujo site foi verificado/, /publica no pr[óo]prio site/, /6\.1\.f/, /direito absoluto/, /21\.2/],
}
{
  const enSource = frontMatter(text[LOCALES[0]].privacy).source
  const pages: [string, string][] = [
    ['he', existsSync(HEBREW_PRIVACY) ? readFileSync(HEBREW_PRIVACY, 'utf8') : ''],
    ['en', enSource && existsSync(enSource) ? readFileSync(enSource, 'utf8') : ''],
    ...LOCALES.map((l): [string, string] => [l, text[l].privacy]),
  ]
  for (const [name, src] of pages) {
    for (const must of OUTBOUND_CONTACT[name] ?? []) {
      check(`${name}/privacy: outbound contact states ${must.source.slice(0, 34)}`, must.test(src))
    }
    // The policy must describe marketing as its own separate box, because that
    // is what the form now does. A policy still describing one bundled tick
    // would be a disclosure of something that no longer happens.
    check(`${name}/privacy: marketing is described as a separate box`,
      /בתיבה נפרדת|separate box|casilla aparte|caixa separada/i.test(src))
  }
}

// ── 13) the Shopify site fixes, in the terms AND the policy, per language ───
/*
 * Oren decided on 2026-10-06 to apply site fixes inside Shopify stores too,
 * within the scopes the app already has. A fix WRITES to the merchant's store,
 * so three statements have to survive every future rewrite of this text, in
 * every language, or we would be writing to a store on a description the
 * merchant never read (GDPR Art. 13(1)(c); and, for an Israeli merchant, a
 * description of the service that does less than the service does is the
 * deception חוק הגנת הצרכן forbids):
 *
 *   1. that the fixes touch the store's ARTICLES AND PAGES ONLY, and that
 *      products, collections and the theme are not touched. This is also the
 *      sentence that keeps the text inside the scopes Shopify approved.
 *   2. that each fix is approved by the merchant before it is applied.
 *   3. that the previous value and the new one are both kept, so a fix can be
 *      shown and undone.
 *   4. that the approval record holds an IP ADDRESS. That is personal data
 *      collected for its evidential value — it shows the write was approved —
 *      and the policy that does not name it is processing nobody was told
 *      about. The policy also has to say how long it is kept.
 *
 * The same statements are held in the privacy policy, because that is the
 * document a merchant reads to learn what we WRITE to their store, not only
 * what we read from it.
 */
const SHOPIFY_FIXES: Record<string, { terms: RegExp[]; privacy: RegExp[] }> = {
  he: {
    terms: [/בחנות Shopify מחוברת/, /המאמרים והעמודים של החנות בלבד/, /אינו נוגע במוצרים/, /באישור\s+שלכם לכל תיקון/, /הערך הקודם והערך החדש/],
    privacy: [/תיקוני אתר אל המאמרים והעמודים של החנות/, /באישור שלך לכל תיקון/, /כתובת\s+ה-IP שממנה נעשה האישור/, /הערך הקודם והערך החדש/],
  },
  en: {
    terms: [/In a connected Shopify store/, /articles and\s+pages only/, /does not touch products/, /your approval of each fix/, /previous and the new value/],
    privacy: [/write site fixes to the store&rsquo;s articles and\s+pages/, /approval of each fix/, /IP address the approval was\s+given from/, /previous and the new value/],
  },
  es: {
    terms: [/En una tienda de Shopify conectada/, /[úu]nicamente los art[íi]culos y las p[áa]ginas de la tienda/, /no toca los productos/, /aprobaci[óo]n de cada correcci[óo]n/, /valor anterior y el nuevo/],
    privacy: [/escribimos correcciones del sitio en los art[íi]culos y las p[áa]ginas de la tienda/, /aprobaci[óo]n de cada correcci[óo]n/, /direcci[óo]n IP desde la que se dio la aprobaci[óo]n/, /valor anterior y el nuevo/],
  },
  'pt-BR': {
    terms: [/Em uma loja Shopify conectada/, /somente os artigos e as p[áa]ginas da loja/, /n[ãa]o toca nos produtos/, /aprova[çc][ãa]o de cada corre[çc][ãa]o/, /valor anterior e o novo/],
    privacy: [/escrevemos corre[çc][õo]es no site nos artigos e nas p[áa]ginas da loja/, /aprova[çc][ãa]o de cada corre[çc][ãa]o/, /endere[çc]o IP a partir do qual a aprova[çc][ãa]o foi dada/, /valor anterior e o novo/],
  },
}
/*
 * The fix log records an IP for EVERY channel, not only Shopify — it always
 * did (`approved_ip` and `actor_ip` in lib/site-fix/store.ts), and the policy
 * described the log as holding the previous value and the time. So the
 * WordPress fix log gets the same disclosure, held here per language.
 */
const FIX_LOG_IP: Record<string, RegExp> = {
  he: /יומן תיקונים:<\/strong> כל תיקון נרשם ביומן שלנו יחד עם מי אישר אותו/,
  en: /Fix log:<\/strong> every fix is recorded in our log with who approved it/,
  es: /Registro de correcciones:\*\* cada correcci[óo]n se registra en nuestro registro con qui[ée]n la aprob[óo]/,
  'pt-BR': /Log de corre[çc][õo]es:\*\* toda corre[çc][ãa]o [ée] registrada no nosso log com quem a aprovou/,
}
const HEBREW_TERMS = 'app/(public)/terms/page.tsx'
{
  const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
  const enTerms = frontMatter(text[LOCALES[0]].terms).source
  const enPrivacy = frontMatter(text[LOCALES[0]].privacy).source
  const docs: [string, string, string][] = [
    ['he', read(HEBREW_TERMS), read(HEBREW_PRIVACY)],
    ['en', enTerms ? read(enTerms) : '', enPrivacy ? read(enPrivacy) : ''],
    ...LOCALES.map((l): [string, string, string] => [l, text[l].terms, text[l].privacy]),
  ]
  for (const [name, terms, privacy] of docs) {
    check(`${name}: both documents were read`, terms.length > 0 && privacy.length > 0)
    const rule = SHOPIFY_FIXES[name]
    if (!rule) continue
    for (const must of rule.terms) {
      check(`${name}/terms: the Shopify fixes state ${must.source.slice(0, 40)}`, must.test(terms))
    }
    for (const must of rule.privacy) {
      check(`${name}/privacy: the Shopify write states ${must.source.slice(0, 40)}`, must.test(privacy))
    }
    const log = FIX_LOG_IP[name]
    check(`${name}/privacy: the fix log names the approver and the IP, for every channel`, log.test(privacy))
    // 15C described one platform when it covered one. Naming the plugin in the
    // heading of a section that now also covers Shopify would send a merchant
    // past the part that applies to them.
    check(`${name}/terms: the site-fixes heading is not WordPress-only`,
      !/15[Cג]\.?\s*(Site Fixes and the GO TOP SEO Bridge|תיקוני אתר ותוסף|Correcciones del sitio y el plugin|Corre[çc][õo]es no site e o plugin)/.test(terms))
  }
  check('mutation control: text that lets the fixes reach products fails the guard',
    !SHOPIFY_FIXES.en.terms[2].test('The Service may update the product, the collection and the theme.'))
  check('mutation control: dropping the per-fix approval is caught',
    !SHOPIFY_FIXES.es.terms[3].test('El Servicio aplica las correcciones en la tienda conectada.'))
  check('mutation control: dropping the kept previous value is caught',
    !SHOPIFY_FIXES['pt-BR'].privacy[3].test('Escrevemos as correções nos artigos e nas páginas da loja.'))
  check('mutation control: a fix log described as the previous value and the time only is caught',
    !FIX_LOG_IP.en.test('<strong>Fix log:</strong> every fix is recorded in our log with the previous value and the time it was applied'))
  check('mutation control: a policy that collects the IP without saying so is caught',
    !SHOPIFY_FIXES.en.privacy[2].test('we also write site fixes to the store&rsquo;s articles and pages, and keep the previous and the new value'))
  check('mutation control: the old WordPress-only heading is caught',
    /15C\.?\s*Site Fixes and the GO TOP SEO Bridge/.test('<h2>15C. Site Fixes and the GO TOP SEO Bridge Plugin</h2>'))
}

// ── 14) the link network inside a Shopify store, in both documents ─────────
/*
 * Oren opened the network to Shopify stores on 2026-10-06, after the risk was
 * put to him: Shopify has no explicit prohibition, but App Store requirement
 * 1.1 obliges a partner to act in good faith and in merchants' best interests,
 * with review-team discretion, and Google's spam policy names excessive link
 * exchanges and automated link-creation services, with a manual action as the
 * remedy. 15A already carries the Google disclosure and the member's
 * acceptance of that risk; what the Shopify sentences have to carry, in every
 * language, is the three things that keep the practice defensible:
 *
 *   1. the links go ONLY inside articles the Service writes and publishes to
 *      the store's blog — nothing already in the store is edited. This is also
 *      what keeps it inside write_content.
 *   2. joining is separate and voluntary, and a link can be removed before the
 *      article is published.
 *   3. the merchant confirms Shopify's own terms let them add such links. It
 *      does not bind Shopify, whose duty runs to the merchant, but it is the
 *      part we can hold.
 *
 * And the sentence that said the network was NOT available for Shopify stores
 * has to be gone from both documents, in every language, or we would be
 * running a service the text denies.
 */
const SHOPIFY_NETWORK: Record<string, { terms: RegExp[]; privacy: RegExp[] }> = {
  he: {
    terms: [/חנות Shopify מחוברת יכולה\s+להצטרף/, /מפרסמת לבלוג החנות/, /בהצטרפות נפרדת ומרצון/, /רשאים לפי התנאים של Shopify/],
    privacy: [/חנות Shopify מחוברת יכולה להצטרף גם היא/, /כתובת\s+myshopify של החנות/],
  },
  en: {
    terms: [/A connected Shopify store can join it/, /publishes to the store&rsquo;s blog/, /separate and voluntary joining/, /permitted under Shopify&rsquo;s own terms/],
    privacy: [/connected Shopify store can join as well/, /myshopify address/],
  },
  es: {
    terms: [/Una tienda de Shopify conectada puede unirse a ella/, /publica en el blog de la tienda/, /adhesi[óo]n separada y voluntaria/, /t[ée]rminos de Shopify le permiten/],
    privacy: [/tienda de Shopify conectada tambi[ée]n puede unirse/, /direcci[óo]n myshopify de la tienda/],
  },
  'pt-BR': {
    terms: [/Uma loja Shopify conectada pode entrar nela/, /publica no blog da loja/, /ades[ãa]o separada e volunt[áa]ria/, /termos da Shopify permitem/],
    privacy: [/loja Shopify conectada tamb[ée]m pode entrar/, /endere[çc]o myshopify da loja/],
  },
}
const NETWORK_DENIED = /אינו זמין לחנויות Shopify|אינה זמינה לחנויות Shopify|not\s+available for Shopify stores|no est[áa] disponible para las tiendas de Shopify|n[ãa]o est[áa] dispon[íi]vel para lojas Shopify/
{
  const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
  const enTerms = frontMatter(text[LOCALES[0]].terms).source
  const enPrivacy = frontMatter(text[LOCALES[0]].privacy).source
  const docs: [string, string, string][] = [
    ['he', read(HEBREW_TERMS), read(HEBREW_PRIVACY)],
    ['en', enTerms ? read(enTerms) : '', enPrivacy ? read(enPrivacy) : ''],
    ...LOCALES.map((l): [string, string, string] => [l, text[l].terms, text[l].privacy]),
  ]
  for (const [name, terms, privacy] of docs) {
    const rule = SHOPIFY_NETWORK[name]
    if (!rule) continue
    for (const must of rule.terms) {
      check(`${name}/terms: the Shopify network states ${must.source.slice(0, 40)}`, must.test(terms))
    }
    for (const must of rule.privacy) {
      check(`${name}/privacy: the Shopify network states ${must.source.slice(0, 40)}`, must.test(privacy))
    }
    check(`${name}: neither document still says the network is closed to Shopify`,
      !NETWORK_DENIED.test(terms) && !NETWORK_DENIED.test(privacy))
  }
  check('mutation control: a document that still denies the network to Shopify is caught',
    NETWORK_DENIED.test('It is off by default and is not available for Shopify stores.'))
  check('mutation control: text that lets the network touch an existing store article is caught',
    !SHOPIFY_NETWORK.en.terms[1].test('the links are placed in the store&rsquo;s existing articles and pages'))
  check('mutation control: dropping the merchant\'s own Shopify-terms confirmation is caught',
    !SHOPIFY_NETWORK.es.terms[3].test('La tienda también puede unirse a la red de enlaces de la sección 15A.'))
}

// ── 15) the featured image, and the one-confirmation batch ─────────────────
/*
 * Two things the terms did not cover, both now true of the live product.
 *
 * The featured image (PR #119): on a Shopify article the fix also writes the alt
 * text of the article's featured image, and only while it has none. It writes
 * `image: { altText }` with no url, so the image file is untouched, and the
 * read-back checks that the url did not change. "An image inside that article"
 * did not cover an image the theme prints above the body, so the closed list has
 * to name it — and has to keep the narrowing ("that has none", articles only),
 * because a closed list that reads wider than the code is worse than no list.
 *
 * The batch: "fix N safe items" has been live on WordPress for a while. It
 * applies up to 25 pages on ONE confirmation (lib/site-fix/bulk.ts:
 * BULK_SAFE_TYPES, BULK_MAX_PAGES, BATCH_UNDO_DAYS, never the home page), while
 * the terms promised approval of each fix and said nothing about a group. One
 * confirmation of a list shown first is still the merchant's approval, but only
 * if the document says that is what it is.
 */
/*
 * No schema on Shopify. JSON-LD reaches a site ONLY through the WordPress plugin
 * (lib/site-fix: shopifyFaqBlockHtml writes a visible <div> with h2/h3/p and
 * nothing else), so the Shopify list must not read as if the FAQ fix adds
 * structured data. It says so in words now, and the only place either document
 * may mention JSON-LD is a WordPress-scoped list.
 */
/*
 * What the sentence may NOT say: "no markup of any kind". Every content fix
 * writes markup (the FAQ block is a div with headings, a broken-link fix rewrites
 * an anchor), and a published Shopify article carries our own formatting and the
 * optional CTA box. What is true, and what a merchant actually needs to know, is
 * narrower and sharper: no schema, no scripts, nothing in the theme's or the
 * store's code, and whatever is written stays inside that item's own body.
 */
const SHOPIFY_NO_SCHEMA: Record<string, RegExp> = {
  he: /בחנות\n?\s*Shopify השירות אינו מוסיף סכמת JSON-LD, אינו מוסיף סקריפטים ואינו נוגע בקוד של ערכת העיצוב/,
  en: /In a Shopify store the Service adds no JSON-LD schema, adds no scripts and does not touch the\s+code of the theme/,
  es: /En una tienda de Shopify el Servicio no a[ñn]ade esquema JSON-LD, no a[ñn]ade scripts y no toca el c[óo]digo del tema/,
  'pt-BR': /Em uma loja Shopify o Servi[çc]o n[ãa]o acrescenta esquema JSON-LD, n[ãa]o acrescenta scripts e n[ãa]o toca no c[óo]digo do tema/,
}
/* And it must keep saying where what it writes lands: the item's own body. */
const SHOPIFY_BODY_ONLY: Record<string, RegExp> = {
  he: /כל מה שנכתב הוא תוכן ועיצוב בתוך גוף אותו מאמר או עמוד/,
  en: /everything it writes is content and formatting inside the body of\s+that one article or page/,
  es: /todo lo que escribe es contenido y formato dentro del cuerpo de ese art[íi]culo o esa p[áa]gina/,
  'pt-BR': /tudo o que ele escreve [ée] conte[úu]do e formata[çc][ãa]o dentro do corpo daquele artigo ou daquela p[áa]gina/,
}
const FIX_SCOPE: Record<string, RegExp[]> = {
  he: [/טקסט חלופי\s+לתמונה הראשית של מאמר שאין לה טקסט חלופי/, /איננו נוגעים בקובץ התמונה ואיננו מחליפים אותה/, /אישור אחד לקבוצת תיקונים/, /עד 25 עמודים בכל פעם, ולא עמוד הבית/, /בתוך 14 ימים/],
  en: [/alt text of an article&rsquo;s featured image that has none/, /do not touch the image\s+file and do not replace the image/, /One approval for a group of fixes/, /up\s+to 25 pages at a time, and never the home page/, /within 14 days/],
  es: [/texto alternativo de la imagen destacada de un art[íi]culo que no lo tiene/, /no tocamos el archivo de la imagen ni la sustituimos/, /Una sola aprobaci[óo]n para un grupo de correcciones/, /hasta 25 p[áa]ginas por vez, y nunca la p[áa]gina de inicio/, /dentro de 14 d[íi]as/],
  'pt-BR': [/texto alternativo da imagem destacada de um artigo que n[ãa]o o tem/, /n[ãa]o tocamos no arquivo da imagem nem a substitu[íi]mos/, /Uma [úu]nica aprova[çc][ãa]o para um grupo de corre[çc][õo]es/, /at[ée] 25 p[áa]ginas por vez, e nunca a p[áa]gina inicial/, /dentro de 14 dias/],
}
{
  const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
  const enTerms = frontMatter(text[LOCALES[0]].terms).source
  const docs: [string, string][] = [
    ['he', read(HEBREW_TERMS)],
    ['en', enTerms ? read(enTerms) : ''],
    ...LOCALES.map((l): [string, string] => [l, text[l].terms]),
  ]
  for (const [name, terms] of docs) {
    for (const must of FIX_SCOPE[name] ?? []) {
      check(`${name}/terms: the fix list states ${must.source.slice(0, 44)}`, must.test(terms))
    }
  }
  for (const [name, terms] of docs) {
    const says = SHOPIFY_NO_SCHEMA[name]
    if (says) check(`${name}/terms: the Shopify list says no schema, no scripts and no theme code`, says.test(terms))
    const body = SHOPIFY_BODY_ONLY[name]
    if (body) check(`${name}/terms: ...and that what it writes stays inside that item's body`, body.test(terms))
  }
  check('mutation control: a Shopify list that stays silent about schema is caught',
    !SHOPIFY_NO_SCHEMA.en.test('an FAQ block added at its end, and turning an extra H1 heading inside it into an H2.'))
  check('mutation control: a promise of no markup at all, which the FAQ block and our formatting break, is caught',
    !SHOPIFY_NO_SCHEMA.en.test('in a Shopify store the Service adds no JSON-LD schema and no markup or code of any kind'))
  check('mutation control: a featured-image line without the "has none" narrowing is caught',
    !FIX_SCOPE.en[0].test('the alt text of an article&rsquo;s featured image, and of every image on it'))
  check('mutation control: a batch described without its page limit is caught',
    !FIX_SCOPE.es[3].test('un grupo de correcciones seguras, sin límite de páginas'))
}

// ── 16) automatic approval of fixes, WordPress only ────────────────────────
/*
 * The switch gives us the merchant's approval in advance, so the document is the
 * only thing standing between "a control you turned on" and "a write you never
 * approved". Three things have to be in the text itself, in every language, or
 * the advance approval is not an informed one:
 *
 *   1. the closed list, as narrow as the code: alt text only where an image has
 *      NO alt attribute (an empty alt is a deliberate choice and is left alone),
 *      a broken internal link only after a live re-check returns 404 or 410, and
 *      a meta description only where there is none at all. A list that reads
 *      wider than the DB CHECK allows is a promise we would be breaking in the
 *      merchant's favour — and a licence we would be claiming in ours.
 *   2. WordPress only. Shopify has no automatic approval at all (the API answers
 *      not_allowed), and the Shopify part of 15C still promises a click per fix.
 *      Shopify's App Store review reads the terms; a text that let the switch
 *      look store-wide would be the problem, not the code.
 *   3. the IP sentence. The log holds the IP of the moment the switch was turned
 *      on, and NOT a new one at fix time, because no person acted then. Claiming
 *      a fresh IP would be false, and keeping one would be data we do not need
 *      (GDPR Art. 5(1)(c)). Off takes effect at once, and that has to be said.
 *
 * And no email: lib/reports/monthly/weekly-email.ts has
 * WEEKLY_EMAIL_SENDING_ENABLED = false, so the summary is the Site health screen
 * and the text may promise nothing else.
 */
const AUTO_APPROVE_TERMS: Record<string, RegExp[]> = {
  he: [
    /אישור אוטומטי לתיקונים \(וורדפרס בלבד\)/,
    /בחנות Shopify אין אישור אוטומטי כלל/,
    /טקסט חלופי לתמונה שאין לה כלל מאפיין\s+טקסט חלופי/,
    /רק אם הוא מחזיר 404 או 410/,
    /גם התיאור ששמור אצלנו וגם התיאור שבעמוד\s+עצמו ריקים/,
    /איננו קוראים ואיננו שומרים כתובת IP חדשה/,
    /והכיבוי חל מיד/,
    /איננו שולחים על כך דואר אלקטרוני/,
    /אם לא נכנסתם לחשבון בשלושים הימים האחרונים/,
  ],
  en: [
    /Automatic approval of fixes \(WordPress only\)/,
    /In a\s+Shopify store there is no automatic approval at all/,
    /Alt text for an\s+image that has no alt attribute at all/,
    /only if it returns 404 or 410/,
    /both the description stored with us and the\s+description on the page itself are empty/,
    /we do not\s+read and do not store a new IP address/,
    /that takes effect at once/,
    /We do not send an email about it/,
    /If you have not signed in\s+during the last thirty days/,
  ],
  es: [
    /Aprobaci[óo]n autom[áa]tica de las correcciones \(solo WordPress\)/,
    /En una tienda de Shopify no existe aprobaci[óo]n autom[áa]tica en absoluto/,
    /texto alternativo de una imagen que no tiene ning[úu]n atributo alt/,
    /solo si devuelve 404 o 410/,
    /tanto la descripci[óo]n almacenada con nosotros como la descripci[óo]n de la propia p[áa]gina est[áa]n vac[íi]as/,
    /no leemos ni almacenamos ninguna direcci[óo]n IP nueva/,
    /surte efecto de inmediato/,
    /No enviamos ning[úu]n correo electr[óo]nico al respecto/,
    /Si usted no ha iniciado sesi[óo]n en los [úu]ltimos treinta d[íi]as/,
  ],
  'pt-BR': [
    /Aprova[çc][ãa]o autom[áa]tica das corre[çc][õo]es \(somente WordPress\)/,
    /Em uma loja Shopify n[ãa]o existe aprova[çc][ãa]o autom[áa]tica alguma/,
    /texto alternativo de uma imagem que n[ãa]o tem nenhum atributo alt/,
    /somente se ele retornar 404 ou 410/,
    /tanto a descri[çc][ãa]o armazenada conosco quanto a descri[çc][ãa]o da pr[óo]pria p[áa]gina est[ãa]o vazias/,
    /n[ãa]o lemos nem armazenamos nenhum endere[çc]o IP novo/,
    /vale de imediato/,
    /N[ãa]o enviamos nenhum e-mail sobre isso/,
    /Se voc[êe] n[ãa]o entrou na conta nos [úu]ltimos trinta dias/,
  ],
}
/* The Shopify half of 15C must still promise a click for every single fix. */
const SHOPIFY_STILL_PER_FIX: Record<string, RegExp> = {
  he: /בחנות Shopify מחוברת, השירות יכול להציע תיקוני אתר ולבצעם דרך האפליקציה, אך ורק בהסכמתכם ובאישור\s+שלכם לכל תיקון/,
  en: /In a connected Shopify store, the Service can suggest site fixes and apply them through the app, only\s+with your consent and your approval of each fix/,
  es: /En una tienda de Shopify conectada, el Servicio puede sugerir correcciones del sitio y aplicarlas mediante la aplicaci[óo]n, [úu]nicamente con su consentimiento y con su aprobaci[óo]n de cada correcci[óo]n/,
  'pt-BR': /Em uma loja Shopify conectada, o Servi[çc]o pode sugerir corre[çc][õo]es no site e aplic[áa]-las por meio do aplicativo, somente com o seu consentimento e com a sua aprova[çc][ãa]o de cada corre[çc][ãa]o/,
}
/* And the privacy policy has to say what the act of switching on stores. */
const AUTO_APPROVE_PRIVACY: Record<string, RegExp[]> = {
  he: [/אישור אוטומטי לתיקונים:/, /כתובת ה-IP שממנה נעשתה\s+ההפעלה/, /איננו קוראים ואיננו שומרים כתובת IP חדשה/],
  en: [/Automatic approval of fixes:/, /the IP address it was turned on from/, /we do not read and do not store a new IP address/],
  es: [/Aprobaci[óo]n autom[áa]tica de las correcciones:/, /la direcci[óo]n IP desde la que se activ[óo]/, /no leemos ni almacenamos ninguna direcci[óo]n IP nueva/],
  'pt-BR': [/Aprova[çc][ãa]o autom[áa]tica das corre[çc][õo]es:/, /o endere[çc]o IP a partir do qual ela foi ativada/, /n[ãa]o lemos nem armazenamos nenhum endere[çc]o IP novo/],
}
{
  const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
  const enTermsSource = frontMatter(text[LOCALES[0]].terms).source
  const enPrivacySource = frontMatter(text[LOCALES[0]].privacy).source
  const termsDocs: [string, string][] = [
    ['he', read(HEBREW_TERMS)],
    ['en', enTermsSource ? read(enTermsSource) : ''],
    ...LOCALES.map((l): [string, string] => [l, text[l].terms]),
  ]
  const privacyDocs: [string, string][] = [
    ['he', read(HEBREW_PRIVACY)],
    ['en', enPrivacySource ? read(enPrivacySource) : ''],
    ...LOCALES.map((l): [string, string] => [l, text[l].privacy]),
  ]
  for (const [name, terms] of termsDocs) {
    for (const must of AUTO_APPROVE_TERMS[name] ?? []) {
      check(`${name}/terms: automatic approval states ${must.source.slice(0, 40)}`, must.test(terms))
    }
    const perFix = SHOPIFY_STILL_PER_FIX[name]
    if (perFix) check(`${name}/terms: the Shopify half still promises approval of each fix`, perFix.test(terms))
  }
  for (const [name, privacy] of privacyDocs) {
    for (const must of AUTO_APPROVE_PRIVACY[name] ?? []) {
      check(`${name}/privacy: automatic approval states ${must.source.slice(0, 40)}`, must.test(privacy))
    }
  }
  check('mutation control: a covered-types list that drops the "no alt attribute" narrowing is caught',
    !AUTO_APPROVE_TERMS.en[2].test('Alt text for any image on the page, replacing what is there'))
  check('mutation control: a broken-link line without the live re-check is caught',
    !AUTO_APPROVE_TERMS.en[3].test('A broken internal link: we remove the link and keep its words in place.'))
  check('mutation control: a policy that claims a fresh IP for an automatic fix is caught',
    !AUTO_APPROVE_PRIVACY.en[2].test('we record the IP address the automatic fix was applied from'))
  check('mutation control: a text that lets the switch cover Shopify too is caught',
    !AUTO_APPROVE_TERMS.en[1].test('Automatic approval applies to a connected WordPress site and to a Shopify store.'))
  check('mutation control: a thirty-day rule stated as account activity, which the code reads as a sign-in, is caught',
    !AUTO_APPROVE_TERMS.en[8].test('If there has been no activity in your account during the last thirty days, nothing runs.'))
  check('mutation control: a promised weekly email is caught',
    !AUTO_APPROVE_TERMS.en[7].test('Once a week we send you a summary of the fixes applied automatically.'))
  check('mutation control: a Shopify half that drops the per-fix promise is caught',
    !SHOPIFY_STILL_PER_FIX.en.test('In a connected Shopify store, the Service can suggest site fixes and apply them through the app.'))
}

// ── 17) how a WordPress fix reaches the site, and where alt text lands ─────
/*
 * Two things the documents got wrong about WordPress.
 *
 * The channel. lib/site-fix/channel.ts writes APP_PASSWORD_TYPES (seo_title,
 * meta_description, image_alt, internal_link, broken_link, faq_block) on a site
 * with NO plugin, through the application password the merchant created and
 * WordPress's own REST API; only canonical, focus keyphrase, schema, h1_demote
 * and llms_txt need the plugin. Both documents said the plugin does the writing,
 * which let a merchant believe that removing the plugin stops us writing. It
 * does not, and the credential is theirs, so the route has to be named.
 *
 * Where alt text lands. lib/site-fix/media-alt.ts writes alt_text on the image's
 * MEDIA LIBRARY item, for images a page shows outside its own text (a logo, a
 * menu or footer image, the featured image the theme prints). WordPress renders
 * those from the item, so one write changes that image's alt text on every page
 * that shows it. The closed list said "alt text for images" and said nothing
 * about where it is written: a merchant approving a fix on one page would not
 * expect a site-wide change. The narrowings are the code's own — only an item
 * whose alt is empty, never the file, its name or its caption, never an image
 * the theme ships outside the library — and the fix is approved on its own,
 * never in a batch and never under automatic approval.
 */
const WP_CHANNEL_TERMS: Record<string, RegExp> = {
  he: /באתר\s+שאין בו התוסף, דרך סיסמת האפליקציה שיצרתם וממשק ה-REST של וורדפרס עצמה/,
  en: /on a site without the plugin, through the application password you created and\s+WordPress&rsquo;s own REST interface/,
  es: /en un sitio sin el plugin, mediante la Application Password que usted cre[óo] y la propia interfaz REST de WordPress/,
  'pt-BR': /em um site sem o plugin, por meio da Senha de Aplicativo que você criou e da própria interface REST do WordPress/,
}
const WP_CHANNEL_PRIVACY: Record<string, RegExp> = {
  he: /באתר\s+שאין בו התוסף, התיקונים שממשק ה-REST של וורדפרס מאפשר נכתבים דרך סיסמת האפליקציה ששמרנו/,
  en: /On a site\s+without the plugin, the fixes WordPress&rsquo;s REST interface allows are written with the application\s+password we stored/,
  es: /En un sitio sin el complemento, las correcciones que permite la interfaz REST de WordPress se escriben con la Application Password que hemos almacenado/,
  'pt-BR': /Em um site sem o plugin, as corre[çc][õo]es que a interface REST do WordPress permite s[ãa]o escritas com a Senha de Aplicativo que armazenamos/,
}
/* The site-wide effect is the fact a merchant cannot guess; it may never be dropped. */
const MEDIA_ALT_SITEWIDE: Record<string, RegExp> = {
  he: /כתיבה אחת כזאת חלה על כל עמוד באתר שמציג את אותה תמונה/,
  en: /one such write applies on every page of the site that shows that same image/,
  es: /una sola escritura de este tipo se aplica en todas las p[áa]ginas del sitio que muestran esa misma imagen/,
  'pt-BR': /uma [úu]nica escrita desse tipo vale para todas as p[áa]ginas do site que exibem aquela mesma imagem/,
}
/* And its narrowings: only an empty one, nothing else about the image, approved on its own. */
const MEDIA_ALT_LIMITS: Record<string, RegExp[]> = {
  he: [/ורק לתמונה שאין לה\s+טקסט חלופי כלל/, /איננו נוגעים\s+בקובץ התמונה, בשמה או בכיתוב שלה/, /לעולם לא כחלק מקבוצת תיקונים\s+ולא במסגרת אישור אוטומטי/],
  en: [/only for an image that has no alt text\s+at all/, /We do\s+not touch the image file, its name or its caption/, /never as part of a group of fixes and never under automatic approval/],
  es: [/solo para una imagen que no tiene ning[úu]n texto alternativo/, /No tocamos el archivo de la imagen, su nombre ni su leyenda/, /nunca como parte de un grupo de correcciones y nunca bajo aprobaci[óo]n autom[áa]tica/],
  'pt-BR': [/somente para uma imagem que n[ãa]o tem nenhum texto alternativo/, /N[ãa]o tocamos no arquivo da imagem, no seu nome nem na sua legenda/, /nunca como parte de um grupo de corre[çc][õo]es e nunca sob aprova[çc][ãa]o autom[áa]tica/],
}
{
  const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
  const enTermsSource = frontMatter(text[LOCALES[0]].terms).source
  const enPrivacySource = frontMatter(text[LOCALES[0]].privacy).source
  const termsDocs: [string, string][] = [
    ['he', read(HEBREW_TERMS)],
    ['en', enTermsSource ? read(enTermsSource) : ''],
    ...LOCALES.map((l): [string, string] => [l, text[l].terms]),
  ]
  const privacyDocs: [string, string][] = [
    ['he', read(HEBREW_PRIVACY)],
    ['en', enPrivacySource ? read(enPrivacySource) : ''],
    ...LOCALES.map((l): [string, string] => [l, text[l].privacy]),
  ]
  for (const [name, terms] of termsDocs) {
    const channel = WP_CHANNEL_TERMS[name]
    if (channel) check(`${name}/terms: the WordPress opening names the application-password route`, channel.test(terms))
    const wide = MEDIA_ALT_SITEWIDE[name]
    if (wide) check(`${name}/terms: the media-library fix says it applies on every page showing the image`, wide.test(terms))
    for (const must of MEDIA_ALT_LIMITS[name] ?? []) {
      check(`${name}/terms: the media-library fix states ${must.source.slice(0, 40)}`, must.test(terms))
    }
  }
  for (const [name, privacy] of privacyDocs) {
    const channel = WP_CHANNEL_PRIVACY[name]
    if (channel) check(`${name}/privacy: the application-password route is named`, channel.test(privacy))
  }
  check('mutation control: a WordPress opening that names only the plugin is caught',
    !WP_CHANNEL_TERMS.en.test('the Service can suggest site fixes and apply them through the GO TOP SEO Bridge plugin, only with your consent.'))
  check('mutation control: a policy that still credits every write to the plugin is caught',
    !WP_CHANNEL_PRIVACY.en.test('the GO TOP SEO Bridge plugin applies to the site only fixes from a closed list.'))
  check('mutation control: a media-library line that hides the site-wide effect is caught',
    !MEDIA_ALT_SITEWIDE.en.test('the fix is written on the image itself in the media library, for images outside the text.'))
  check('mutation control: a media-library line that lets the fix ride automatic approval is caught',
    !MEDIA_ALT_LIMITS.en[2].test('Each such fix is shown to you before it is applied, and can be undone.'))
}

// ── 18) the conversion report sent to Meta from our server ────────────────
/*
 * What the documents said before this section existed: the Meta half of the
 * policy described the Pixel, cookies and the browser, and the marketing
 * category promised that "none of them loads before you have allowed its
 * category, and withdrawing your consent stops the collection". A conversion
 * event sent server-to-server is not a tag and sets no cookie, so none of that
 * text covered it, and the California half promised the sharing "happens only
 * if you allowed the marketing category" — a promise the server has to keep.
 *
 * Three facts a reader cannot guess and therefore may never be dropped.
 *
 * The gate. The report goes only on a granted marketing consent. A refusal and
 * a visitor who has not answered the notice are both "no", and withdrawal stops
 * future reports. Anything else turns four live documents into a false
 * statement, which is why the gate is pinned per language.
 *
 * What leaves us. The event name and time, a one-time event id for Meta's
 * deduplication, and a SHA-256 hash of the signup email — and NOT the IP
 * address, the browser details or any Meta cookie. The hash is pinned together
 * with the sentence that it does not make the data anonymous: Meta holds the
 * same addresses, so it can match and identify, and a policy that called a
 * hash anonymous would be claiming a protection the code does not deliver.
 *
 * Who answers for it. Under Meta's own Business Tools Terms and the Controller
 * Addendum, the collection and transmission of these events is JOINT
 * controllership with Meta Platforms Ireland Limited, which is independent
 * controller for what it does afterwards; the Addendum puts the Art. 13/14
 * duty to say so on us, and obliges us to pass a rights request on. So the
 * documents must name Meta as joint controller rather than as one more
 * processor acting on our behalf, and must point the reader at Meta directly.
 */
const CAPI_GATE: Record<string, RegExp> = {
  he: /הדיווח נשלח <strong>רק<\/strong> אם אישרת את קטגוריית השיווק[\s\S]{0,120}אם סירבת, או אם עדיין לא בחרת, לא נשלח דבר/,
  en: /The report is sent\{' '\}\s*<strong>only<\/strong> if you allowed the marketing category[\s\S]{0,140}If you\s*refused, or have not chosen yet, nothing is sent/,
  es: /El informe se envía \*\*únicamente\*\* si usted permitió la categoría de marketing[\s\S]{0,140}Si lo rechazó, o si todavía no ha elegido, no se envía nada/,
  'pt-BR': /O relatório é enviado \*\*somente\*\* se você permitiu a categoria de marketing[\s\S]{0,140}Se você recusou, ou ainda não escolheu, nada é enviado/,
}
const CAPI_WITHDRAW: Record<string, RegExp> = {
  he: /ביטול ההסכמה לשיווק מפסיק מיד דיווחים עתידיים/,
  en: /Withdrawing marketing consent stops future reports immediately/,
  es: /Retirar el consentimiento de marketing detiene de inmediato los informes futuros/,
  'pt-BR': /Retirar o consentimento de marketing interrompe imediatamente os relatórios futuros/,
}
const CAPI_HASH: Record<string, RegExp[]> = {
  he: [/תמצית חד-כיוונית \(hash בשיטת SHA-256\) של כתובת הדוא&rdquo;ל/, /התמצית אינה הופכת את המידע לאנונימי/],
  en: [/a one-way hash \(SHA-256\) of the email address you signed up with/, /the hash does not make the information\s*anonymous/],
  es: [/un resumen unidireccional \(hash SHA-256\) de la dirección de correo electrónico/, /el hash no convierte la información en anónima/],
  'pt-BR': [/um resumo unidirecional \(hash SHA-256\) do endereço de e-mail/, /o hash não torna a informação anônima/],
}
/* The code also sends a hash of the account id and the signup page's address, and those are
 * identifiers too: a list that stops at the email understates what leaves us. */
const CAPI_IDS: Record<string, RegExp[]> = {
  he: [/תמצית חד-כיוונית באותה שיטה של מזהה החשבון שלך אצלנו/, /כתובת העמוד שממנו נרשמת, בלי הפרמטרים שאחרי סימן השאלה/],
  en: [/a one-way hash, by the same method, of your account identifier with us/, /the address of the page you signed up from, without anything after the question mark/],
  es: [/un resumen unidireccional, por el mismo método, del identificador de su cuenta con nosotros/, /la dirección de la página desde la que usted se registró, sin nada de lo que va después del signo de interrogación/],
  'pt-BR': [/um resumo unidirecional, pelo mesmo método, do identificador da sua conta com a gente/, /o endereço da página de onde você se cadastrou, sem nada do que vem depois do sinal de interrogação/],
}
const CAPI_NOT_SENT: Record<string, RegExp> = {
  he: /איננו שולחים את כתובת ה-IP שלך, את פרטי\s*הדפדפן שלך או עוגייה של Meta/,
  en: /we do not send your IP address, your browser details or any Meta\s*cookie/,
  es: /no enviamos su dirección IP, ni los datos de su navegador, ni ninguna cookie de Meta/,
  'pt-BR': /não enviamos o seu endereço IP, nem os dados do seu navegador, nem qualquer cookie da Meta/,
}
const CAPI_JOINT: Record<string, RegExp> = {
  he: /אנחנו\s*ו-Meta בעלי שליטה משותפים \(joint controllers\)[\s\S]{0,160}Meta Platforms Ireland Limited[\s\S]{0,120}Meta Platforms, Inc\./,
  en: /we and Meta are joint controllers: Meta Platforms Ireland Limited[\s\S]{0,140}Meta Platforms, Inc\./,
  es: /nosotros y Meta somos corresponsables del tratamiento \(joint controllers\): Meta Platforms Ireland Limited[\s\S]{0,140}Meta Platforms, Inc\./,
  'pt-BR': /nós e a Meta somos controladores conjuntos \(joint controllers\): a Meta Platforms Ireland Limited[\s\S]{0,140}Meta Platforms, Inc\./,
}
/* The marketing category has to say the consent covers a cookieless server report, or the
 * consent is not specific to what we then do with it (Art. 4(11)). */
const CAPI_CATEGORY: Record<string, RegExp> = {
  he: /האישור בקטגוריה הזאת חל גם על דיווח המרה שאנו שולחים\s*ל-Meta מהשרת שלנו בלי עוגייה כלל/,
  en: /Allowing this category also covers\s*a conversion report we send to Meta from our server with no cookie at all/,
  es: /Permitir esta categoría cubre también un informe de\s*conversión que enviamos a Meta desde nuestro servidor, sin ninguna cookie/,
  'pt-BR': /Permitir esta categoria vale também para um relatório de conversão que enviamos à Meta do nosso\s*servidor, sem cookie nenhum/,
}
{
  const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
  const enPrivacySource = frontMatter(text[LOCALES[0]].privacy).source
  const privacyDocs: [string, string][] = [
    ['he', read(HEBREW_PRIVACY)],
    ['en', enPrivacySource ? read(enPrivacySource) : ''],
    ...LOCALES.map((l): [string, string] => [l, text[l].privacy]),
  ]
  for (const [name, privacy] of privacyDocs) {
    const gate = CAPI_GATE[name]
    if (gate) check(`${name}/privacy: the server report goes only on a granted marketing consent`, gate.test(privacy))
    const withdrawn = CAPI_WITHDRAW[name]
    if (withdrawn) check(`${name}/privacy: withdrawing marketing consent stops future reports`, withdrawn.test(privacy))
    for (const must of CAPI_HASH[name] ?? []) {
      check(`${name}/privacy: the hashed email is named and not called anonymous (${must.source.slice(0, 40)})`, must.test(privacy))
    }
    for (const must of CAPI_IDS[name] ?? []) {
      check(`${name}/privacy: the report's other identifiers are named (${must.source.slice(0, 40)})`, must.test(privacy))
    }
    const absent = CAPI_NOT_SENT[name]
    if (absent) check(`${name}/privacy: the report says no IP, no browser details, no Meta cookie`, absent.test(privacy))
    const joint = CAPI_JOINT[name]
    if (joint) check(`${name}/privacy: Meta Ireland is named as joint controller for these events`, joint.test(privacy))
    const category = CAPI_CATEGORY[name]
    if (category) check(`${name}/privacy: the marketing category says it covers the cookieless server report`, category.test(privacy))
  }
  check('mutation control: a report described without its consent gate is caught',
    !CAPI_GATE.en.test("We report a completed signup to Meta from our server, through an interface called the Conversions API."))
  check('mutation control: a hash presented as anonymous is caught',
    !CAPI_HASH.en[1].test('We send only a one-way hash of your email address, so the report carries nothing that identifies you.'))
  check('mutation control: a report that also carries the IP address is caught',
    !CAPI_NOT_SENT.en.test('In this report we send your IP address and your browser details so that Meta can match the event.'))
  check('mutation control: Meta described as acting on our behalf is caught',
    !CAPI_JOINT.en.test('Meta processes these conversion events on our behalf and under our instructions.'))
  check('mutation control: a joint-controller sentence that names only the Irish entity is caught',
    !CAPI_JOINT.en.test('we and Meta are joint controllers: Meta Platforms Ireland Limited, for every visitor.'))
  check('mutation control: an identifier list that stops at the email is caught',
    !CAPI_IDS.en[0].test('a one-way hash (SHA-256) of the email address you signed up with'))
  check('mutation control: a marketing category that still speaks only of cookies is caught',
    !CAPI_CATEGORY.en.test('<strong>Marketing:</strong> measuring how our ads perform. Loaded only if you allow it.'))
  check('mutation control: a withdrawal that only stops the tags is caught',
    !CAPI_WITHDRAW.en.test('Withdrawing your consent stops the tags in your browser from collecting.'))
}

// ── 20) the emails we send a customer, and what each unsubscribe stops ────
/*
 * Until today the product sent no customer email at all, and the documents
 * described a MONTHLY progress report while the in-app switch has always said
 * weekly — with four projects already switched on. The switch is what the
 * customer relied on, so the documents moved to weekly, in the product's own
 * words, rather than the sender moving to monthly.
 *
 * The setup emails are new, and they sit on a line worth naming. Under s.30A of
 * the Communications Law a "דבר פרסומת" is a message whose content is
 * commercial advertising or encouragement to spend money. A nudge to a customer
 * about the service they opened themselves, carrying no offer, no price, no
 * discount and no upgrade, is a service message and needs no `פרסומת` label,
 * sender block or statutory opt-out. One sentence offering anything would turn
 * it into advertising and all three would be owed at once, which is why the
 * four no-offer words are pinned here and why the email thread pinned the same
 * boundary against its own dictionaries.
 *
 * The unsubscribe is pinned per SCOPE, which is the part a reader cannot guess
 * and the part that can quietly harm them: the link in a setup email stops the
 * setup emails only and says so, while the link in a reminder or in the weekly
 * summary stops everything about that project. A single link that silently
 * killed the approval reminder would leave an owner paying for a service that
 * had stopped telling them anything, so a text that described one undifferentiated
 * stop is caught below.
 *
 * Two accuracy promises ride along because they are cheap to keep and cheap to
 * break: a section that could not be read is left out rather than reported as a
 * zero, so no email states a number we did not measure; and we read nothing
 * about what the recipient did with the message — no open pixel, no click
 * tracking, no rewritten links.
 */
const EMAIL_WEEKLY: Record<string, RegExp[]> = {
  he: [/<strong>סיכום שבועי:<\/strong>/, /ורק כשיש מה לספר; בשבוע שבו לא קרה כלום לא יישלח מייל/],
  en: [/<strong>Weekly summary:<\/strong>/, /and only when there is something to say; a week\s*with nothing in it gets no email/],
  es: [/\*\*Resumen semanal:\*\*/, /y solo cuando hay algo que contar; una semana en la que no pasó nada no recibe correo/],
  'pt-BR': [/\*\*Resumo semanal:\*\*/, /e somente quando há algo a contar; uma semana em que nada aconteceu não recebe e-mail/],
}
/* No monthly report may survive anywhere in either document: the switch says weekly. */
const EMAIL_NO_MONTHLY: Record<string, RegExp> = {
  // Narrow on purpose: a bare /חודשי/ also matches "מנוי חודשי", the monthly
  // subscription, which is true and stays.
  he: /(דוח התקדמות חודשי|סיכום חודשי)/,
  en: /[Mm]onthly (progress )?(report|summary)/,
  es: /[Ii]nforme mensual/,
  'pt-BR': /[Rr]elatório mensal/,
}
const EMAIL_SETUP_NO_OFFER: Record<string, RegExp> = {
  he: /אין בהם הצעה, אין מחיר, אין הנחה ואין שדרוג/,
  en: /They carry no offer, no price, no discount and no\s*upgrade/,
  es: /No llevan oferta, ni precio, ni descuento, ni mejora de plan/,
  'pt-BR': /Eles não trazem oferta, nem preço, nem desconto, nem upgrade/,
}
const EMAIL_SCOPE_NARROW: Record<string, RegExp> = {
  he: /קישור ההסרה במייל הקמה מפסיק את מיילי ההקמה בלבד/,
  en: /The unsubscribe link in a setup email stops the\s*setup emails only/,
  es: /El enlace de baja de un correo de puesta en marcha detiene solo esos correos/,
  'pt-BR': /O link de cancelamento de um e-mail de início interrompe somente esses e-mails/,
}
const EMAIL_SCOPE_WIDE: Record<string, RegExp> = {
  he: /קישור ההסרה בתזכורת או בסיכום השבועי מפסיק כל מייל על אותו פרויקט/,
  en: /The unsubscribe link in a reminder or in the weekly summary\s*stops every email about that project/,
  es: /El enlace de baja de un recordatorio o del resumen semanal detiene todos los correos sobre ese proyecto/,
  'pt-BR': /O link de cancelamento de um lembrete ou do resumo semanal interrompe todos os e-mails sobre aquele projeto/,
}
const EMAIL_SWITCH_TRUTH: Record<string, RegExp> = {
  he: /המתג שאתה רואה בהגדרות הוא התמונה\s*המלאה/,
  en: /the switch you see in the settings is the whole picture/,
  es: /el interruptor que usted ve en los ajustes es el panorama completo/,
  'pt-BR': /a chave que você vê nas configurações é o quadro completo/,
}
const EMAIL_NO_FAKE_ZERO: Record<string, RegExp> = {
  he: /סעיף שלא הצלחנו לקרוא מושמט מהמייל ואינו מדווח כאפס/,
  en: /A section we could not read is left out of the email rather than\s*reported as a zero/,
  es: /Una sección que no pudimos leer se omite del correo en lugar de informarse como un cero/,
  'pt-BR': /Uma seção que não conseguimos ler é omitida do e-mail em vez de ser informada como zero/,
}
const EMAIL_NO_TRACKING: Record<string, RegExp> = {
  he: /אין בהודעות שלנו פיקסל שמדווח על פתיחה, איננו\s*עוקבים אחרי לחיצות/,
  en: /Our messages carry no pixel that reports an\s*open, we do not track clicks/,
  es: /Nuestros mensajes no llevan ningún píxel que informe de una apertura, no seguimos los clics/,
  'pt-BR': /As nossas mensagens não trazem nenhum pixel que informe uma abertura, não rastreamos cliques/,
}
{
  const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
  const enPrivacySource = frontMatter(text[LOCALES[0]].privacy).source
  const enTermsSource = frontMatter(text[LOCALES[0]].terms).source
  const privacyDocs: [string, string][] = [
    ['he', read(HEBREW_PRIVACY)],
    ['en', enPrivacySource ? read(enPrivacySource) : ''],
    ...LOCALES.map((l): [string, string] => [l, text[l].privacy]),
  ]
  const termsDocs: [string, string][] = [
    ['he', read(HEBREW_TERMS)],
    ['en', enTermsSource ? read(enTermsSource) : ''],
    ...LOCALES.map((l): [string, string] => [l, text[l].terms]),
  ]
  for (const [name, privacy] of privacyDocs) {
    for (const must of EMAIL_WEEKLY[name] ?? []) {
      check(`${name}/privacy: the summary is weekly and only when there is something (${must.source.slice(0, 40)})`, must.test(privacy))
    }
    const offer = EMAIL_SETUP_NO_OFFER[name]
    if (offer) check(`${name}/privacy: the setup emails carry no offer, price, discount or upgrade`, offer.test(privacy))
    const narrow = EMAIL_SCOPE_NARROW[name]
    if (narrow) check(`${name}/privacy: a setup-email unsubscribe stops the setup emails ONLY`, narrow.test(privacy))
    const wide = EMAIL_SCOPE_WIDE[name]
    if (wide) check(`${name}/privacy: a reminder or summary unsubscribe stops every email about the project`, wide.test(privacy))
    const truth = EMAIL_SWITCH_TRUTH[name]
    if (truth) check(`${name}/privacy: the settings switch is stated to be the whole picture`, truth.test(privacy))
    const zero = EMAIL_NO_FAKE_ZERO[name]
    if (zero) check(`${name}/privacy: an unreadable section is omitted, never reported as a zero`, zero.test(privacy))
    const tracked = EMAIL_NO_TRACKING[name]
    if (tracked) check(`${name}/privacy: no open pixel, no click tracking, no rewritten links`, tracked.test(privacy))
  }
  /* The monthly promise is gone from BOTH documents, in every language. */
  for (const [name, doc] of [...privacyDocs, ...termsDocs]) {
    const monthly = EMAIL_NO_MONTHLY[name]
    if (!monthly || !doc) continue
    const emailHalf = doc.split(/Email Messages|הודעות דוא|Mensajes de correo|Mensagens de e-mail/)[1] ?? ''
    const half = emailHalf.slice(0, 3000)
    check(`${name}: the email section no longer promises a monthly report`, !monthly.test(half))
  }
  check('mutation control: a weekly summary promised every week is caught',
    !EMAIL_WEEKLY.en[1].test('The summary goes out on Sunday morning, every week.'))
  check('mutation control: a monthly report left in the email section is caught',
    EMAIL_NO_MONTHLY.en.test('<strong>Monthly progress report:</strong> a monthly summary of the project.'))
  check('mutation control: a setup email that offers an upgrade is caught',
    !EMAIL_SETUP_NO_OFFER.en.test('They carry a link to the in-app guide, the WhatsApp number and an offer to upgrade.'))
  check('mutation control: one undifferentiated unsubscribe is caught',
    !EMAIL_SCOPE_NARROW.en.test('The unsubscribe link stops every email about the project.'))
  check('mutation control: a wide link described as narrow is caught',
    !EMAIL_SCOPE_WIDE.en.test('The unsubscribe link in a reminder stops the reminders.'))
  check('mutation control: an email that reports an unread section as zero is caught',
    !EMAIL_NO_FAKE_ZERO.en.test('A section we could not read is reported as zero so the email stays complete.'))
  check('mutation control: open tracking put back is caught',
    !EMAIL_NO_TRACKING.en.test('Our messages report when they are opened so that we can measure delivery.'))
}

// ── 21) the partner program as it is actually built ───────────────────────
/*
 * UNTIL TODAY THE POLICY PROMISED TO DESCRIBE THIS BEFORE IT RAN.
 *
 * The live text said, in all four languages, that referral tracking, the
 * commission record and the payout "have not been built yet" and that "each of
 * them will be described here before it starts running". The partner system
 * builds exactly those three, so the promise is what makes this text a
 * precondition for the migration rather than a follow-up to it.
 *
 * What the code does that nothing disclosed, each pinned below because it was
 * read out of the code and not out of a feature description:
 *
 *   - The application is a FORM on the site, not an email, and it records the
 *     applicant's IP address (`applied_ip`, immutable by a database trigger)
 *     for fraud detection and a three-an-hour rate limit. An identifier
 *     collected for a purpose has to be disclosed with that purpose, and with
 *     a retention: a rejected application is deleted in full after 12 months,
 *     and in every other case the IP alone goes after 12 months.
 *   - A click is COUNTED, not recorded: `affiliate_count_click` increments one
 *     row per partner per day and the table has no column about the visitor.
 *     The policy already promised no cookie and nothing on the device; it said
 *     nothing about what a click does store, and a partner dashboard showing a
 *     click figure invites exactly that question. The four nothings (no IP, no
 *     user agent, no referrer, no identifier) are pinned per language.
 *   - A referral may carry a REVIEW FLAG (the application's email is the one
 *     that signed up; the new account is on the partner's own domain). It asks
 *     a person to look and blocks nothing, which is worth saying because the
 *     partner we most want — an agency signing up its own client — is the one
 *     the signal fires on.
 *   - A customer billed through SHOPIFY earns no automatic commission, because
 *     Shopify reports an active plan and never a charge. The agreement promises
 *     30% of every qualifying payment, so the way such a referral is actually
 *     recorded (by hand, same rate, same hold, same approval) has to be in the
 *     agreement or the promise outruns the code.
 *   - A SUSPENDED OR ENDED partner's link keeps resolving and keeps being
 *     counted; only entitlement stops. The agreement said the link "stops
 *     working", which was simply untrue: the route accepts a suspended
 *     partner's code on purpose, so that a visitor clicking a two-year-old blog
 *     post does not meet an error.
 */
const PARTNER_FORM: Record<string, RegExp> = {
  he: /הבקשה נשלחת בטופס באתר/,
  en: /the application is a form on this site/,
  es: /la solicitud es un formulario en este sitio/,
  'pt-BR': /a candidatura é um formulário neste site/,
}
const PARTNER_IP_PURPOSE: Record<string, RegExp> = {
  he: /לזהות גל של בקשות מזויפות,\s*ולהגביל שלוש בקשות לשעה מאותה כתובת/,
  en: /telling a ring of fake applications from a\s*real agency, and limiting three applications an hour from one address/,
  es: /distinguir una oleada de solicitudes falsas de una agencia real, y limitar a tres solicitudes por hora/,
  'pt-BR': /distinguir uma onda de candidaturas falsas de uma agência real e limitar a três candidaturas por hora/,
}
const PARTNER_IP_RETENTION: Record<string, RegExp> = {
  he: /בקשה שנדחתה נמחקת כולה כעבור 12\s*חודשים/,
  en: /A rejected application is deleted in full after 12 months/,
  es: /Una solicitud rechazada se elimina por completo al cabo de 12 meses/,
  'pt-BR': /Uma candidatura recusada é excluída por completo após 12 meses/,
}
/* A click is a number. The four nothings are the whole point of the sentence. */
const PARTNER_CLICK_COUNT: Record<string, RegExp> = {
  he: /אחד למונה היומי של אותו\s*שותף/,
  en: /one added to that partner&rsquo;s daily\s*total/,
  es: /uno más en el total diario de ese socio/,
  'pt-BR': /mais um no total diário daquele parceiro/,
}
const PARTNER_CLICK_NOTHING: Record<string, RegExp> = {
  he: /בלי כתובת IP, בלי סוג דפדפן, בלי האתר שממנו הגעת ובלי\s*מזהה כלשהו/,
  en: /no IP address, no browser, no site you came from,\s*no identifier of any kind/,
  es: /sin dirección IP, sin navegador, sin el sitio del que llegó y sin ningún identificador/,
  'pt-BR': /sem endereço IP, sem navegador, sem o site de onde você veio e sem nenhum identificador/,
}
const PARTNER_REVIEW_FLAG: Record<string, RegExp> = {
  he: /סימון כזה מבקש מאדם להסתכל לפני אישור עמלה, ואינו חוסם\s*דבר מעצמו/,
  en: /Such a flag asks a person to look\s*before any commission is approved; it blocks nothing by itself/,
  es: /Esa marca pide que una persona lo revise antes de aprobar cualquier comisión; por sí sola no bloquea nada/,
  'pt-BR': /Essa marca pede que uma pessoa verifique antes de aprovar qualquer comissão; por si só não bloqueia nada/,
}
const PARTNER_SHOPIFY: Record<string, RegExp> = {
  he: /לקוח שמחויב דרך Shopify אינו מייצר עמלה אוטומטית/,
  en: /A customer billed through Shopify produces no automatic commission/,
  es: /Un cliente facturado a través de Shopify no genera comisión automática/,
  'pt-BR': /Um cliente cobrado pela Shopify não gera comissão automática/,
}
/* The sentence the policy may no longer carry: the three things now exist. */
const PARTNER_NOT_BUILT: Record<string, RegExp> = {
  he: /עדיין לא\s*נבנו מעקב הפניות/,
  en: /no referral tracking, commission record or payout has been built yet/,
  es: /todavía no se han construido el seguimiento de referencias/,
  'pt-BR': /ainda não foram construídos o rastreamento de indicações/,
}
/* In the AGREEMENT: how a Shopify referral is recorded, and what suspension does not stop. */
const AGREEMENT_SHOPIFY_MANUAL: Record<string, RegExp> = {
  he: /לקוח שמחויב דרך Shopify נרשם ידנית/,
  en: /A customer billed through Shopify is recorded by hand/,
  es: /Un cliente facturado a través de Shopify se registra a mano/,
  'pt-BR': /Um cliente cobrado pela Shopify é registrado manualmente/,
}
const AGREEMENT_LINK_LIVES: Record<string, RegExp> = {
  he: /הקישור שפרסמת ממשיך להוביל לאתר שלנו והקליקים עליו ממשיכים\s*להיספר/,
  en: /the link you published keeps leading\s*to our site and clicks on it keep being counted/,
  es: /el enlace que publicó sigue llevando a nuestro sitio y los clics en él siguen contándose/,
  'pt-BR': /o link que você publicou continua levando ao nosso site e os cliques nele continuam sendo contados/,
}
/* And the claim it replaced may not come back: it was never true of the code. */
const AGREEMENT_LINK_DIES: Record<string, RegExp> = {
  he: /קישור ההפניה שלך מפסיק לעבוד/,
  en: /your Referral Link stops working/,
  es: /su enlace de referido deja de funcionar/,
  'pt-BR': /o seu link de indicação para de funcionar/,
}
{
  const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
  const HEBREW_AFFILIATE = 'app/(legal)/affiliate-terms/page.tsx'
  const enPrivacy = frontMatter(text[LOCALES[0]].privacy).source
  const enAffiliate = frontMatter(text[LOCALES[0]]['affiliate-terms']).source
  const privacyDocs: [string, string][] = [
    ['he', read(HEBREW_PRIVACY)],
    ['en', enPrivacy ? read(enPrivacy) : ''],
    ...LOCALES.map((l): [string, string] => [l, text[l].privacy]),
  ]
  const agreementDocs: [string, string][] = [
    ['he', read(HEBREW_AFFILIATE)],
    ['en', enAffiliate ? read(enAffiliate) : ''],
    ...LOCALES.map((l): [string, string] => [l, text[l]['affiliate-terms']]),
  ]
  for (const [name, privacy] of privacyDocs) {
    check(`${name}/privacy: the application is a form on the site`, (PARTNER_FORM[name] ?? /$^/).test(privacy))
    check(`${name}/privacy: the IP is disclosed with both of its purposes`, (PARTNER_IP_PURPOSE[name] ?? /$^/).test(privacy))
    check(`${name}/privacy: a rejected application is deleted after 12 months`, (PARTNER_IP_RETENTION[name] ?? /$^/).test(privacy))
    check(`${name}/privacy: a click is one on a daily counter`, (PARTNER_CLICK_COUNT[name] ?? /$^/).test(privacy))
    check(`${name}/privacy: and nothing about the visitor is kept with it`, (PARTNER_CLICK_NOTHING[name] ?? /$^/).test(privacy))
    check(`${name}/privacy: the review flag asks and does not block`, (PARTNER_REVIEW_FLAG[name] ?? /$^/).test(privacy))
    check(`${name}/privacy: a Shopify-billed customer earns no automatic commission`, (PARTNER_SHOPIFY[name] ?? /$^/).test(privacy))
    // The promise to describe before running has been kept, so the sentence that
    // made it may not survive: it would now be false in the other direction.
    check(`${name}/privacy: no longer says the three were never built`, !(PARTNER_NOT_BUILT[name] ?? /$^/).test(privacy))
  }
  for (const [name, agreement] of agreementDocs) {
    check(`${name}/agreement: how a Shopify referral is recorded`, (AGREEMENT_SHOPIFY_MANUAL[name] ?? /$^/).test(agreement))
    check(`${name}/agreement: a published link keeps working and keeps counting`, (AGREEMENT_LINK_LIVES[name] ?? /$^/).test(agreement))
    check(`${name}/agreement: no longer claims the link stops working`, !(AGREEMENT_LINK_DIES[name] ?? /$^/).test(agreement))
  }
}

// ── MUTATION CONTROLS ───────────────────────────────────────────────────────
console.log('\nmutation controls')
{
  const any = LOCALES[0]
  const privacy = text[any].privacy
  check('a provider removed from a translation is caught',
    !privacy.replace(/PDFShift/g, '').includes('PDFShift') && privacy.includes('PDFShift'))
  check('a translated company name is caught',
    TRANSLATED_NAME.test('GO TOP MARKETING E PUBLICIDADE LTDA'))
  check('a link into a language tree with no page behind it is caught',
    // The example has to be a page that really is not there. It used to be
    // /pt-BR/terms, which exists now that the Portuguese tree is built.
    [...'ver o [kit de imprensa](/pt-BR/press-kit) aqui'.matchAll(/\]\((\/[a-zA-Z-]+\/[^)]*)\)/g)]
      .map((m) => m[1]).filter((h) => LOCALES.some((l) => h.startsWith(`/${l}/`)))
      .filter((h) => !routeExists(h)).length === 1)
  check('...and a link to one that does exist is not flagged', routeExists('/es/refund-policy'))
  check('a missing section is caught',
    ((privacy.replace(/^## /m, '# ').match(/^## /gm) ?? []).length) < ((privacy.match(/^## /gm) ?? []).length))
  check('an undeclared extra section is caught',
    (privacy.match(/^## /gm) ?? []).length + 1 !== (privacy.match(/^## /gm) ?? []).length)
  check('a 14-day refund promise slipped into a translation is caught',
    /\b14 dias\b/i.test('Reembolso incondicional em 14 dias.'))
  check('an accessibility statement that drops the reason for "partially" is caught',
    !/טרם נעשתה/.test(readFileSync(HEBREW_A11Y, 'utf8').replace(/טרם נעשתה/g, 'נעשתה')))
  check('a statement that claims full conformance is caught',
    /totalmente conformes/i.test('el sitio y la plataforma son totalmente conformes con la norma'))
  check('front matter claiming the wrong locale is caught',
    frontMatter('---\nlocale: en\n---').locale !== 'pt-BR')
  check('European Portuguese in a Brazilian document is caught',
    REGISTER_FORBIDS.voce.patterns.some((re) => re.test('Tu podes cancelar o teu plano quando quiseres.')))
  check('tuteo in an usted document is caught',
    REGISTER_FORBIDS.usted.patterns.some((re) => re.test('Puedes cancelar tu cuenta cuando tú quieras.')))
  check('a commission rate changed in one language only is caught',
    !text['pt-BR']['affiliate-terms'].replace(/30%/g, '35%').includes('30%')
      && text['pt-BR']['affiliate-terms'].includes('30%'))
  check('a partner agreement that drops the Spanish identification rule is caught',
    !/art[íi]culo 20 de la Ley 34\/2002/.test(text.es['affiliate-terms'].replace(/art[íi]culo 20 de la Ley 34\/2002/g, ''))
      && /art[íi]culo 20 de la Ley 34\/2002/.test(text.es['affiliate-terms']))
  check('a Brazilian document that drops the seven-day right is caught',
    !/art\.\s*49/.test(text['pt-BR']['refund-policy'].replace(/art\.\s*49/g, '')) && /art\.\s*49/.test(text['pt-BR']['refund-policy']))
  check('a policy that drops the right to tell us to stop is caught',
    !/זכות מוחלטת/.test(readFileSync(HEBREW_PRIVACY, 'utf8').replace(/זכות מוחלטת/g, 'זכות')))
  check('a policy that still describes one bundled consent box is caught',
    !/casilla aparte/.test('Acepto recibir el informe, as\u00ed como contenido comercial.'))
  check('a day count put back into a partner document is caught',
    /\b90 d[íi]as\b/.test('conserva el código de ese socio durante 90 días'))
  check('a policy that stops saying no cookie is set is caught',
    !/sets no cookie at all/.test('The partner program: if you reach the site through a partner link'))
  check('a policy that drops the IP disclosure is caught',
    !PARTNER_IP_PURPOSE.es.test(text.es.privacy.replace(/distinguir una oleada de solicitudes falsas de una agencia real, y limitar a tres solicitudes por hora/g, ''))
      && PARTNER_IP_PURPOSE.es.test(text.es.privacy))
  check('a policy that keeps the IP with no retention is caught',
    !PARTNER_IP_RETENTION['pt-BR'].test('Também registramos o endereço IP de onde veio a candidatura.'))
  check('a click record that gains a visitor detail is caught',
    !PARTNER_CLICK_NOTHING.es.test('un recuento: uno más en el total diario de ese socio, con la dirección IP del visitante'))
  check('a review flag described as a block is caught',
    !PARTNER_REVIEW_FLAG['pt-BR'].test('Essa marca bloqueia a indicação até que uma pessoa a aprove.'))
  check('a policy that still says tracking was never built is caught',
    PARTNER_NOT_BUILT.en.test('and no referral tracking, commission record or payout has been built yet'))
  check('an agreement that promises every payment with no Shopify carve-out is caught',
    !AGREEMENT_SHOPIFY_MANUAL.en.test('You earn 30% of each Qualifying Payment of a Referred Customer.'))
  check('an agreement that still says a suspended link stops working is caught',
    AGREEMENT_LINK_DIES.es.test('Cuando este acuerdo termine, su enlace de referido deja de funcionar.'))
  check('a footer date that drifts from the written date is caught',
    writtenRevisionDate('es', text.es.terms)
      !== frontMatter(text.es.terms.replace('lastUpdated: 2026-10-09', 'lastUpdated: 2026-10-06')).lastUpdated
      && writtenRevisionDate('es', text.es.terms) === frontMatter(text.es.terms).lastUpdated)
  check('a revision date read out of a statute sentence instead of the footer is caught',
    writtenRevisionDate('es', 'La Enmienda 13 entró en vigor el 14 de agosto de 2025.') === null)
  check('a translation that drops the promise about a referred customer\'s details is caught',
    !/no recibe la direcci[óo]n de correo electr[óo]nico, el sitio web, el plan/
      .test(text.es.privacy.replace(/no recibe la direcci[óo]n de correo electr[óo]nico, el sitio web, el plan/g, ''))
      && /no recibe la direcci[óo]n de correo electr[óo]nico, el sitio web, el plan/.test(text.es.privacy))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
