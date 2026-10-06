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

// ── 12) what the WordPress plugin does, disclosed in every language ─────────
/*
 * Version 3.0.0 of the GO TOP SEO Bridge plugin does three things the policy did
 * not describe: it creates whole POSTS from the articles a customer approves, it
 * has the site DOWNLOAD those articles' images into its Media Library, and it
 * returns a page's full CONTENT and can SEARCH the site's published posts.
 *
 * Until this change the policy said the plugin applies "only fixes from a closed
 * list" and named the eleven. That is an under-description of our own access,
 * which is the direction that matters: Art. 13(1)(c) requires the purposes of
 * processing to be given, and a customer who read that sentence would not have
 * known we create content on their site or reach out to a second host for files.
 * Saying less than the code does is not a smaller promise, it is an inaccurate
 * notice.
 *
 * The connection is also no longer one thing. A site paired with the plugin
 * alone leaves no password of the customer's with us, while a site connected
 * with an Application Password still does, so the policy has to distinguish them
 * rather than claim the broader collection for both.
 *
 * Each language is held for the four capabilities and for that distinction. The
 * mutation controls at the end put the old single sentence back and show it
 * fails.
 */
const PLUGIN_DOES: Record<string, RegExp[]> = {
  he: [/מאמרים שאתה מפרסם/, /ספריית המדיה/, /רק מכתובת האחסון\s+שלנו/, /לחפש מילה/, /שתי דרכים לחבר/, /אין אצלנו שום סיסמה\s+שלך/],
  en: [/Articles you publish/, /Media Library/, /only from our storage\s+address/, /search its\s+published/, /two ways to\s+connect/, /no password of yours in our\s+records/],
  es: [/art[íi]culos que usted publica/, /biblioteca de medios/, /solo las acepta desde nuestra direcci[óo]n de\s+almacenamiento/, /busque una palabra/, /dos maneras de conectar/, /ninguna contrase[ñn]a suya en nuestros registros/],
  'pt-BR': [/artigos que voc[êe] publica/, /biblioteca de m[íi]dia/, /s[óo] as aceita do nosso endere[çc]o de\s+armazenamento/, /busque uma palavra/, /duas maneiras de conectar/, /nenhuma senha sua nos nossos registros/],
}
{
  const enSource = frontMatter(text[LOCALES[0]].privacy).source
  const pages: [string, string][] = [
    ['he', existsSync(HEBREW_PRIVACY) ? readFileSync(HEBREW_PRIVACY, 'utf8') : ''],
    ['en', enSource && existsSync(enSource) ? readFileSync(enSource, 'utf8') : ''],
    ...LOCALES.map((l): [string, string] => [l, text[l].privacy]),
  ]
  for (const [name, src] of pages) {
    check(`${name}/privacy: the page was read`, src.length > 0)
    for (const must of PLUGIN_DOES[name] ?? []) {
      check(`${name}/privacy: the plugin section states ${must.source.slice(0, 34)}`, must.test(src))
    }
    // The sentence that was there before must be GONE, in every language. It is
    // the one a reader would rely on, and it is now false.
    check(`${name}/privacy: no longer claims the plugin applies fixes and nothing else`,
      !/רק תיקונים\s*\n?\s*מרשימה סגורה|only fixes from a closed list|[úu]nicamente correcciones de una lista cerrada|apenas corre[çc][õo]es de uma lista fechada/.test(src))
  }
  check('mutation control: the old "only fixes from a closed list" sentence fails the guard',
    /only fixes from a closed list/.test('the plugin applies to the site only fixes from a closed list (SEO title)'))
  check('mutation control: a language that drops publishing is caught',
    !PLUGIN_DOES.en[0].test('the plugin applies the fixes you approve, one by one, from a closed list'))
  check('mutation control: a language that drops the images is caught',
    !PLUGIN_DOES.es[1].test('Los art\u00edculos que usted publica se crean como entradas en su sitio.'))
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
 *   3. that the previous value is kept, so a fix can be undone.
 *
 * The same three are held in the privacy policy, because that is the document
 * a merchant reads to learn what we WRITE to their store, not only what we
 * read from it.
 */
const SHOPIFY_FIXES: Record<string, { terms: RegExp[]; privacy: RegExp[] }> = {
  he: {
    terms: [/בחנות Shopify מחוברת/, /המאמרים והעמודים של החנות בלבד/, /אינו נוגע במוצרים/, /באישור\s+שלכם לכל תיקון/, /הערך\s*\n?\s*הקודם/],
    privacy: [/תיקוני אתר אל המאמרים והעמודים של החנות/, /באישור שלך לכל תיקון/, /הערך הקודם/],
  },
  en: {
    terms: [/In a connected Shopify store/, /articles and\s+pages only/, /does not touch products/, /your approval of each fix/, /previous value/],
    privacy: [/write site fixes to the store&rsquo;s articles and\s+pages/, /approval of each fix/, /previous value/],
  },
  es: {
    terms: [/En una tienda de Shopify conectada/, /[úu]nicamente los art[íi]culos y las p[áa]ginas de la tienda/, /no toca los productos/, /aprobaci[óo]n de cada correcci[óo]n/, /valor anterior/],
    privacy: [/escribimos correcciones del sitio en los art[íi]culos y las p[áa]ginas de la tienda/, /aprobaci[óo]n de cada correcci[óo]n/, /valor anterior/],
  },
  'pt-BR': {
    terms: [/Em uma loja Shopify conectada/, /somente os artigos e as p[áa]ginas da loja/, /n[ãa]o toca nos produtos/, /aprova[çc][ãa]o de cada corre[çc][ãa]o/, /valor anterior/],
    privacy: [/escrevemos corre[çc][õo]es no site nos artigos e nas p[áa]ginas da loja/, /aprova[çc][ãa]o de cada corre[çc][ãa]o/, /valor anterior/],
  },
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
    !SHOPIFY_FIXES['pt-BR'].privacy[2].test('Escrevemos as correções nos artigos e nas páginas da loja.'))
  check('mutation control: the old WordPress-only heading is caught',
    /15C\.?\s*Site Fixes and the GO TOP SEO Bridge/.test('<h2>15C. Site Fixes and the GO TOP SEO Bridge Plugin</h2>'))
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
  check('a translation that drops the promise about a referred customer\'s details is caught',
    !/no recibe la direcci[óo]n de correo electr[óo]nico, el sitio web, el plan/
      .test(text.es.privacy.replace(/no recibe la direcci[óo]n de correo electr[óo]nico, el sitio web, el plan/g, ''))
      && /no recibe la direcci[óo]n de correo electr[óo]nico, el sitio web, el plan/.test(text.es.privacy))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
