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

/**
 * Source guards match code, never comments: this drops block, line and JSX
 * comments before section 28 looks at a caller. A `//` after a colon or a
 * quote (a URL inside a string) is kept.
 */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\'"`])\/\/[^\n]*/g, '$1')
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
  vous: {
    // French: tutoiement anywhere in a document written in vouvoiement. A
    // single "tu peux" in a policy is the tell that one paragraph was written
    // by a different hand, and a French reader reads it as a different voice.
    label: 'tutoiement in a document written in vous',
    patterns: [/\btu\b/i, /\btoi\b/i, /\bton (compte|site|plan|projet)\b/i, /\btu peux\b/i, /\btu dois\b/i, /\bta \b/],
  },
  lei: {
    // Italian: the "tu" address anywhere in a document written in the courtesy
    // third person. Italian consumer contracts and privacy policies are written
    // to "Lei", and a single "puoi" or "il tuo account" in a policy is the tell
    // that one paragraph came from the marketing copy, which does use "voi".
    label: 'tu-form address in a document written in Lei',
    patterns: [/\btu\b/i, /\bte\b/i, /\bil tuo (account|sito|piano|progetto)\b/i, /\bla tua (azienda|impresa|attivit[\u00e0a])\b/i, /\bpuoi\b/i, /\bdevi\b/i, /\bhai\b/i],
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
  fr: [
    { doc: 'refund-policy', name: 'the fourteen-day right of withdrawal of the Code de la consommation, by article', must: /L221-18/ },
    { doc: 'refund-policy', name: 'the fourteen days in words', must: /quatorze jours/ },
    { doc: 'refund-policy', name: 'the pre-contractual information duty that makes the right real', must: /L221-5/ },
    { doc: 'refund-policy', name: 'what an express request to start the service before the period ends forfeits', must: /L221-25 et L221-28/ },
    { doc: 'refund-policy', name: 'that the right is the consumer\'s and not a business\'s', must: /n'est pas un consommateur au sens de ce texte/ },
    { doc: 'terms', name: 'the same withdrawal right in the terms', must: /L221-18/ },
    { doc: 'terms', name: 'the express-request articles in the terms too', must: /L221-25 et L221-28/ },
    { doc: 'terms', name: 'the European consumer forum rule, so the Israeli-courts clause is not read as absolute', must: /1215\/2012/ },
    { doc: 'privacy', name: 'the RGPD by name and regulation number', must: /r[èe]glement \(UE\) 2016\/679/ },
    { doc: 'privacy', name: 'the one-month answer deadline of Article 12(3), neither fifteen days nor thirty', must: /d'un mois\*\* [àa] compter de sa r[ée]ception, comme l'exige l'article 12, paragraphe 3/ },
    { doc: 'privacy', name: 'the one-month deadline said plainly against the other two', must: /ni trente jours ni quinze jours/ },
    { doc: 'privacy', name: 'the CNIL by its real name, as the supervisory authority to complain to', must: /Commission nationale de l'informatique et des libert[ée]s \(CNIL\)/ },
    { doc: 'privacy', name: 'that no data protection officer is appointed under Article 37', must: /n'avons pas d[ée]sign[ée] de d[ée]l[ée]gu[ée] [àa] la protection des donn[ée]es/ },
    { doc: 'privacy', name: 'the communication channel that stands in for an appointed officer', must: /canal de communication/ },
    { doc: 'privacy', name: 'that no Article 27 representative in the Union is claimed either', must: /article 27 du RGPD/ },
    { doc: 'privacy', name: 'the Israeli adequacy decision, by number, for the transfer', must: /2011\/61\/UE/ },
    { doc: 'privacy', name: 'that standard contractual clauses are not claimed with every sub-processor', must: /Nous ne pr[ée]tendons pas ici avoir sign[ée] des clauses contractuelles types/ },
    { doc: 'privacy', name: 'that a partner is not given a referred customer\'s address, site or plan', must: /ne re[çc]oit pas l'adresse de courriel, le site Web, l'offre/ },
    { doc: 'accessibility', name: 'the French accessibility reference and the European standard behind it', must: /RGAA[\s\S]{0,200}EN 301 549/ },
    { doc: 'accessibility', name: 'that no RGAA conformance is claimed, with the reason', must: /ne d[ée]clarons donc pas de conformit[ée] au RGAA/ },
    { doc: 'affiliate-terms', name: 'the French prohibition of misleading commercial practices, by article', must: /L121-1/ },
    { doc: 'affiliate-terms', name: 'the editorial-content rule a paid partner is judged against', must: /L121-4, 11[°o]/ },
    { doc: 'affiliate-terms', name: 'the influencer law, by number and date', must: /loi n[°o] 2023-451 du 9 juin 2023/i },
    { doc: 'affiliate-terms', name: 'the wording that law requires on a paid promotion', must: /« Publicit[ée] » ou « Collaboration commerciale »/ },
    { doc: 'affiliate-terms', name: 'the ARPP recommendation, which is what a French partner is actually judged against', must: /\bARPP\b/ },
    { doc: 'affiliate-terms', name: 'the FTC endorsement guides, by citation', must: /16 CFR/ },
    { doc: 'affiliate-terms', name: 'the European consumer forum rule in the partner agreement too', must: /1215\/2012/ },
    { doc: 'affiliate-terms', name: 'that the partner gets no personal data of the customers they refer', must: /Ne re[çc]oit aucune donn[ée]e personnelle/i },
    // Québec is NOT a dialect of the RGPD section. The French content language is
    // region-less on purpose (lib/content/language.ts folds fr-CA into fr), and
    // the comment there says the region changes the LAW, not the words, and that
    // the privacy policy says so. These are the lines that make that true.
    { doc: 'privacy', name: 'which law governs a reader in France and in Belgium', must: /depuis la France ou depuis la Belgique[\s\S]{0,120}c'est le RGPD qui gouverne/ },
    { doc: 'privacy', name: 'that a reader in Québec is not governed by the RGPD', must: /ce n'est pas le RGPD qui vous gouverne/ },
    { doc: 'privacy', name: 'Law 25 by its name and the chapter it amends', must: /« Loi 25 »[\s\S]{0,200}LQ 2021, chapitre 25/ },
    { doc: 'privacy', name: 'the private-sector Act by its chapter number', must: /chapitre P-39\.1/ },
    { doc: 'privacy', name: 'the Québec person in charge, by article, with a title and contact details', must: /responsable de la protection des renseignements personnels \(article 3\.1\)[\s\S]{0,900}\*\*Titre :\*\*/ },
    { doc: 'privacy', name: 'that the Québec role is NOT the RGPD data protection officer', must: /Ce r[ôo]le n'est pas le « d[ée]l[ée]gu[ée] [àa] la protection des donn[ée]es » du RGPD, et nous ne les confondons pas/ },
    { doc: 'privacy', name: 'the assessment Law 25 requires before a communication outside Québec, by article', must: /l'ext[ée]rieur du Qu[ée]bec \(article 17\)[\s\S]{0,200}[ée]valuation des facteurs relatifs [àa] la vie priv[ée]e/ },
    { doc: 'privacy', name: 'that no written assessment per provider is claimed', must: /nous n'avons pas produit, pour chaque fournisseur, une [ée]valuation [ée]crite des facteurs relatifs [àa] la vie priv[ée]e/ },
    { doc: 'privacy', name: 'the automated-decision duty to inform at the time of the decision, by article', must: /traitement automatis[ée] \(article 12\.1\)[\s\S]{0,260}au plus tard au moment o[ùu] elle l'informe de la d[ée]cision/ },
    { doc: 'privacy', name: 'the right to submit observations to a person who can review the decision', must: /pr[ée]senter ses observations [àa] un membre du personnel en mesure de r[ée]viser la d[ée]cision/ },
    { doc: 'privacy', name: 'Québec portability, by article and by its in-force date', must: /portabilit[ée] \(article 27, en vigueur depuis le 22 septembre 2024\)/ },
    { doc: 'privacy', name: 'the structured, commonly used format portability is owed in', must: /format technologique structur[ée] et couramment utilis[ée]/ },
    { doc: 'privacy', name: 'the Québec 30-day answer deadline, told apart from the RGPD month', must: /\*\*30 jours\*\* de la r[ée]ception de la demande \(article 32\)[\s\S]{0,80}le RGPD parle d'un mois/ },
    { doc: 'privacy', name: 'that a confidentiality incident is reported to the Québec commission, not only a European authority', must: /aviser la \*\*Commission d'acc[èe]s [àa] l'information du Qu[ée]bec\*\*[\s\S]{0,200}pas seulement [àa] une autorit[ée] europ[ée]enne/ },
    { doc: 'privacy', name: 'the incident register Law 25 requires, and who holds it', must: /registre des incidents de confidentialit[ée] que l'article 3\.8 exige/ },
  ],
  it: [
    { doc: 'refund-policy', name: 'the fourteen-day right of withdrawal of the Codice del Consumo, by article', must: /articolo 52 del Codice del Consumo/ },
    { doc: 'refund-policy', name: 'the Codice del Consumo by its decree number', must: /decreto legislativo 6 settembre 2005, n\. 206/ },
    { doc: 'refund-policy', name: 'the fourteen days in words', must: /quattordici giorni/ },
    { doc: 'refund-policy', name: 'the pre-contractual information duty that makes the right real', must: /articolo 49 del medesimo codice/ },
    { doc: 'refund-policy', name: 'what an express request to start the service before the period ends forfeits', must: /articoli 51, comma 8, 57, comma 3, e 59, comma 1, lettera a\)/ },
    { doc: 'refund-policy', name: 'that a month in progress is not a fully performed service', must: /non [èe] un servizio pienamente eseguito per il solo fatto che l'account [èe] aperto/ },
    { doc: 'refund-policy', name: 'that the right is the consumer\'s and not a business\'s', must: /non [èe] un consumatore ai sensi di questo testo/ },
    { doc: 'terms', name: 'the same withdrawal right in the terms', must: /articolo 52 del Codice del Consumo/ },
    { doc: 'terms', name: 'the express-request articles in the terms too', must: /articoli 51, comma 8, 57, comma 3, e 59, comma 1, lettera a\)/ },
    { doc: 'terms', name: 'the European consumer forum rule, so the Israeli-courts clause is not read as absolute', must: /1215\/2012/ },
    { doc: 'terms', name: 'the consumer\'s own forum under art. 66-bis of the Codice del Consumo', must: /66-bis/ },
    { doc: 'privacy', name: 'the GDPR by name and regulation number', must: /regolamento \(UE\) 2016\/679/ },
    { doc: 'privacy', name: 'the national law that completes the GDPR in Italy', must: /Codice in materia di protezione dei dati personali/ },
    { doc: 'privacy', name: 'the one-month answer deadline of Article 12(3), neither fifteen days nor thirty', must: /entro un mese\*\* dal suo ricevimento, come esige l'articolo 12, paragrafo 3/ },
    { doc: 'privacy', name: 'the one-month deadline said plainly against the other two', must: /n[ée] trenta giorni n[ée] quindici giorni/ },
    { doc: 'privacy', name: 'the Garante by its real name, as the supervisory authority to complain to', must: /Garante per la protezione dei dati personali/ },
    { doc: 'privacy', name: 'that no data protection officer is appointed under Article 37', must: /non abbiamo designato un responsabile della protezione dei dati/ },
    { doc: 'privacy', name: 'the communication channel that stands in for an appointed officer', must: /canale di comunicazione/ },
    { doc: 'privacy', name: 'that no Article 27 representative in the Union is claimed either', must: /articolo 27 del GDPR/ },
    { doc: 'privacy', name: 'the Israeli adequacy decision, by number, for the transfer', must: /2011\/61\/UE/ },
    { doc: 'privacy', name: 'that standard contractual clauses are not claimed with every sub-processor', must: /Non pretendiamo qui di aver firmato clausole contrattuali tipo/ },
    { doc: 'privacy', name: 'that a partner is not given a referred customer\'s address, site or plan', must: /non riceve l'indirizzo di posta elettronica, il sito Web, il piano/ },
    { doc: 'accessibility', name: 'the Italian accessibility law and the European standard behind it', must: /legge Stanca[\s\S]{0,260}EN 301 549/ },
    { doc: 'accessibility', name: 'that no AgID conformance is claimed, with the reason', must: /non dichiariamo quindi una conformit[àa] alle Linee guida AgID/ },
    { doc: 'affiliate-terms', name: 'the Italian prohibition of unfair commercial practices, by article', must: /articolo 20 del Codice del Consumo/ },
    { doc: 'affiliate-terms', name: 'the editorial-content rule a paid partner is judged against', must: /articolo 23, comma 1, lettera m\)/ },
    { doc: 'affiliate-terms', name: 'the IAP Digital Chart, which is what an Italian partner is actually judged against', must: /Digital Chart/ },
    { doc: 'affiliate-terms', name: 'the AGCOM influencer guidelines, by their decision number', must: /delibera n\. 7\/24\/CONS/ },
    { doc: 'affiliate-terms', name: 'the FTC endorsement guides, by citation', must: /16 CFR/ },
    { doc: 'affiliate-terms', name: 'the European consumer forum rule in the partner agreement too', must: /1215\/2012/ },
    { doc: 'affiliate-terms', name: 'that the partner gets no personal data of the customers they refer', must: /Non riceve alcun dato personale/i },
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
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  it: ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'],
}

/** The date in the document's own closing revision sentence, as YYYY-MM-DD, or null. */
function writtenRevisionDate(locale: string, src: string): string | null {
  const months = MONTHS[locale]
  if (!months) return null
  // Only a line that is about updating: a date inside the text of a statute
  // ("in force since 14 August 2025") is not this document's revision date.
  // French writes it as "Dernière mise à jour le 21 octobre 2026": no "de"
  // between the parts, and a possible "1er" for the first of the month.
  const line = locale === 'fr'
    ? /[^\n]*(mise [àa] jour)[^\n]*\ble (\d{1,2})(?:er)? ([A-Za-zéûôàçî]+) (\d{4})/gi
    : locale === 'it'
    // Italian writes it as "Ultimo aggiornamento: 21 ottobre 2026": no "de"
    // and no "le", and only a line about updating counts, so the dates inside
    // the statutes it cites (legge 9 gennaio 2004) are not read as this one.
    ? /[^\n]*(aggiornament)[^\n]*\b(\d{1,2}) ([A-Za-zàèéìòù]+) (\d{4})/gi
    : /[^\n]*(actualiz|atualiza)[^\n]*\b(\d{1,2}) de ([A-Za-zçãéíóú]+) de (\d{4})/gi
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
// exactly as Oren gave it on 2026-10-13, which replaced the earlier
// "GO TOP MARKETING GRUO LTD". The registrar holds no English name at all
// (company 517274346), so identification rests on the Hebrew name and the
// company number, and the English string must be one single string everywhere.
const REGISTERED = 'GO TOP DIGITAL MARKETING AND ADVERTISING LTD'
const SUPERSEDED_NAME = /GO TOP MARKETING GRUO/i
const TRANSLATED_NAME = /GO TOP (MARKETING|MERCADEO|MARKETING DIGITAL) (DIGITAL|Y PUBLICIDAD|E PUBLICIDADE|SRL|S\.?L\.?|LTDA\.?)/i
for (const locale of LOCALES) {
  for (const doc of DOCS) {
    const src = text[locale][doc]
    if (!/517274346/.test(src) && !src.includes(REGISTERED)) continue
    check(`${locale}/${doc}: the company name is the registered English one`, src.includes(REGISTERED))
    check(`${locale}/${doc}: the company name was not translated or re-spelled`, !TRANSLATED_NAME.test(src))
    check(`${locale}/${doc}: the superseded company name is gone`, !SUPERSEDED_NAME.test(src))
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
  fr: [
    { name: 'says subscription payments are not refunded', must: /ne sont pas rembours[ée]s/i },
    { name: 'keeps the only exception being the law', must: /la loi exige/i },
    { name: 'keeps cancellation at any time', must: /[àa] tout moment/i },
    { name: 'keeps access to the end of the paid period', must: /jusqu'[àa] la fin de la p[ée]riode/i },
  ],
  it: [
    { name: 'says subscription payments are not refunded', must: /non sono rimborsati/i },
    { name: 'keeps the only exception being the law', must: /la legge esige/i },
    { name: 'keeps cancellation at any time', must: /in qualsiasi momento/i },
    { name: 'keeps access to the end of the paid period', must: /fino alla fine del periodo/i },
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
  fr: [/ne d[ée]pose aucun cookie/, /voyage dans le lien lui-m[êe]me/],
  it: [/non deposita alcun cookie/, /viaggia nel link stesso/],
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
      !/(ventana de atribuci[óo]n|janela de atribui[çc][ãa]o|fen[êe]tre d'attribution|finestra di attribuzione)/i.test(text[l]['affiliate-terms']))
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
  fr: [/Comment nous sommes contr[ôo]l[ée]s/, /WCAG 2\.1/, /technologie d'assistance/, /n'a pas encore [ée]t[ée] r[ée]alis[ée]/, /partiellement/i],
  it: [/Come siamo controllati/, /WCAG 2\.1/, /tecnologia d'assistenza/, /non [èe] ancora stato realizzato/, /parzialmente/i],
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
      !/fully conformant|totalmente conformes?|מותאמים במלואם|plenamente conforme|pleinement conformes?|pienamente conformi?/i.test(src))
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
  fr: [/contacter l'entreprise dont le site Web a [ée]t[ée] v[ée]rifi[ée]/, /publie sur son propre site/, /6\.1\.f/, /droit absolu/, /21\.2/],
  it: [/contattare l'impresa il cui sito Web [èe] stato verificato/, /pubblica sul proprio sito/, /6\.1\.f/, /diritto assoluto/, /21\.2/],
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
      /בתיבה נפרדת|separate box|casilla aparte|caixa separada|case s[ée]par[ée]e|casella separata/i.test(src))
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
  fr: {
    terms: [/Dans une boutique Shopify connect[ée]e/, /uniquement les articles et les pages de la boutique/, /ne touche pas aux produits/, /approbation de chaque correction/, /la valeur pr[ée]c[ée]dente et la nouvelle/],
    privacy: [/nous [ée]crivons des corrections du site dans les articles et les pages de la boutique/, /approbation de chaque correction/, /l'adresse IP depuis laquelle l'approbation a [ée]t[ée] donn[ée]e/, /la valeur pr[ée]c[ée]dente et la nouvelle/],
  },
  it: {
    terms: [/In un negozio Shopify connesso/, /copre unicamente gli articoli e le pagine del negozio/, /non tocca i prodotti/, /approvazione di ciascuna correzione/, /il valore precedente e il nuovo/],
    privacy: [/scriviamo correzioni del sito negli articoli e nelle pagine del negozio/, /approvazione di ciascuna correzione/, /l'indirizzo IP dal quale l'approvazione [èe] stata data/, /il valore precedente e il nuovo/],
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
  fr: /Journal des corrections\s*:\*\* chaque correction est enregistr[ée]e dans notre journal avec qui l'a approuv[ée]e/,
  it: /Registro delle correzioni\s*:\*\* ciascuna correzione [èe] registrata nel nostro registro con chi l'ha approvata/,
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
      !/15[Cג]\.?\s*(Site Fixes and the GO TOP SEO Bridge|תיקוני אתר ותוסף|Correcciones del sitio y el plugin|Corre[çc][õo]es no site e o plugin|Corrections du site et l'extension|Correzioni del sito e l'estensione)/.test(terms))
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
  fr: {
    terms: [/Une boutique Shopify connect[ée]e peut la rejoindre/, /publie sur le blog de la boutique/, /adh[ée]sion s[ée]par[ée]e et volontaire/, /les conditions de Shopify vous permettent/],
    privacy: [/Une boutique Shopify connect[ée]e peut aussi la rejoindre/, /adresse myshopify de la boutique/],
  },
  it: {
    terms: [/Un negozio Shopify connesso pu[òo] aderirvi/, /pubblica sul blog del negozio/, /adesione separata e volontaria/, /le condizioni di Shopify Le consentono/],
    privacy: [/Un negozio Shopify connesso pu[òo] aderire anch'esso/, /indirizzo myshopify del negozio/],
  },
}
const NETWORK_DENIED = /אינו זמין לחנויות Shopify|אינה זמינה לחנויות Shopify|not\s+available for Shopify stores|no est[áa] disponible para las tiendas de Shopify|n[ãa]o est[áa] dispon[íi]vel para lojas Shopify|n'est pas disponible pour les boutiques Shopify|non [èe] disponibile per i negozi Shopify/
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
  fr: /Dans une boutique Shopify, le Service n'ajoute pas de sch[ée]ma JSON-LD, n'ajoute pas de scripts et ne touche pas au code du th[èe]me/,
  it: /In un negozio Shopify il Servizio non aggiunge schema JSON-LD, non aggiunge script e non tocca il codice del tema/,
}
/* And it must keep saying where what it writes lands: the item's own body. */
const SHOPIFY_BODY_ONLY: Record<string, RegExp> = {
  he: /כל מה שנכתב הוא תוכן ועיצוב בתוך גוף אותו מאמר או עמוד/,
  en: /everything it writes is content and formatting inside the body of\s+that one article or page/,
  es: /todo lo que escribe es contenido y formato dentro del cuerpo de ese art[íi]culo o esa p[áa]gina/,
  'pt-BR': /tudo o que ele escreve [ée] conte[úu]do e formata[çc][ãa]o dentro do corpo daquele artigo ou daquela p[áa]gina/,
  fr: /tout ce qu'il [ée]crit est du contenu et de la mise en forme [àa] l'int[ée]rieur du corps de cet article ou de cette page/,
  it: /tutto quello che scrive [èe] contenuto e formattazione all'interno del corpo di quell'articolo o di quella pagina/,
}
const FIX_SCOPE: Record<string, RegExp[]> = {
  he: [/טקסט חלופי\s+לתמונה הראשית של מאמר שאין לה טקסט חלופי/, /איננו נוגעים בקובץ התמונה ואיננו מחליפים אותה/, /אישור אחד לקבוצת תיקונים/, /עד 25 עמודים בכל פעם, ולא עמוד הבית/, /בתוך 14 ימים/],
  en: [/alt text of an article&rsquo;s featured image that has none/, /do not touch the image\s+file and do not replace the image/, /One approval for a group of fixes/, /up\s+to 25 pages at a time, and never the home page/, /within 14 days/],
  es: [/texto alternativo de la imagen destacada de un art[íi]culo que no lo tiene/, /no tocamos el archivo de la imagen ni la sustituimos/, /Una sola aprobaci[óo]n para un grupo de correcciones/, /hasta 25 p[áa]ginas por vez, y nunca la p[áa]gina de inicio/, /dentro de 14 d[íi]as/],
  'pt-BR': [/texto alternativo da imagem destacada de um artigo que n[ãa]o o tem/, /n[ãa]o tocamos no arquivo da imagem nem a substitu[íi]mos/, /Uma [úu]nica aprova[çc][ãa]o para um grupo de corre[çc][õo]es/, /at[ée] 25 p[áa]ginas por vez, e nunca a p[áa]gina inicial/, /dentro de 14 dias/],
  fr: [/texte alternatif de l'image mise en avant d'un article qui n'en a pas/, /nous ne touchons pas au fichier de l'image et nous ne la rempla[çc]ons pas/, /Une seule approbation pour un groupe de corrections/, /jusqu'[àa] 25 pages [àa] la fois, et jamais la page d'accueil/, /dans un d[ée]lai de 14 jours/],
  it: [/testo alternativo dell'immagine in evidenza di un articolo che non lo ha/, /non tocchiamo il file dell'immagine e non la sostituiamo/, /Una sola approvazione per un gruppo di correzioni/, /fino a 25 pagine per volta, e mai la pagina iniziale/, /entro un termine di 14 giorni/],
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
  fr: [
    /Approbation automatique des corrections \(WordPress uniquement\)/,
    /Dans une boutique Shopify, il n'existe aucune approbation automatique/,
    /Le texte alternatif d'une image qui n'a aucun attribut alt/,
    /seulement s'il renvoie 404 ou 410/,
    /la description enregistr[ée]e chez nous et la description de la page elle-m[êe]me sont toutes les deux vides/,
    /nous ne lisons ni ne stockons aucune nouvelle adresse IP/,
    /prend effet imm[ée]diatement/,
    /Nous n'envoyons aucun courrier [ée]lectronique [àa] ce sujet/,
    /Si vous ne vous [êe]tes pas connect[ée] au cours des trente derniers jours/,
  ],
  it: [
    /Approvazione automatica delle correzioni \(solo WordPress\)/,
    /In un negozio Shopify non esiste alcuna approvazione automatica/,
    /Il testo alternativo di un'immagine che non ha alcun attributo alt/,
    /soltanto se esso restituisce 404 o 410/,
    /la descrizione registrata presso di noi e la descrizione della pagina stessa sono entrambe vuote/,
    /non leggiamo n[ée] conserviamo alcun nuovo indirizzo IP/,
    /questo ha effetto immediatamente/,
    /Non inviamo alcun messaggio di posta elettronica al riguardo/,
    /Se Lei non si [èe] connesso nel corso degli ultimi trenta giorni/,
  ],
}
/* The Shopify half of 15C must still promise a click for every single fix. */
const SHOPIFY_STILL_PER_FIX: Record<string, RegExp> = {
  he: /בחנות Shopify מחוברת, השירות יכול להציע תיקוני אתר ולבצעם דרך האפליקציה, אך ורק בהסכמתכם ובאישור\s+שלכם לכל תיקון/,
  en: /In a connected Shopify store, the Service can suggest site fixes and apply them through the app, only\s+with your consent and your approval of each fix/,
  es: /En una tienda de Shopify conectada, el Servicio puede sugerir correcciones del sitio y aplicarlas mediante la aplicaci[óo]n, [úu]nicamente con su consentimiento y con su aprobaci[óo]n de cada correcci[óo]n/,
  'pt-BR': /Em uma loja Shopify conectada, o Servi[çc]o pode sugerir corre[çc][õo]es no site e aplic[áa]-las por meio do aplicativo, somente com o seu consentimento e com a sua aprova[çc][ãa]o de cada corre[çc][ãa]o/,
  fr: /Dans une boutique Shopify connect[ée]e, le Service peut proposer des corrections du site et les appliquer au moyen de l'application, uniquement avec votre consentement et avec votre approbation de chaque correction/,
  it: /In un negozio Shopify connesso, il Servizio pu[òo] proporre correzioni del sito e applicarle per mezzo dell'applicazione, unicamente con il Suo consenso e con la Sua approvazione di ciascuna correzione/,
}
/* And the privacy policy has to say what the act of switching on stores. */
const AUTO_APPROVE_PRIVACY: Record<string, RegExp[]> = {
  he: [/אישור אוטומטי לתיקונים:/, /כתובת ה-IP שממנה נעשתה\s+ההפעלה/, /איננו קוראים ואיננו שומרים כתובת IP חדשה/],
  en: [/Automatic approval of fixes:/, /the IP address it was turned on from/, /we do not read and do not store a new IP address/],
  es: [/Aprobaci[óo]n autom[áa]tica de las correcciones:/, /la direcci[óo]n IP desde la que se activ[óo]/, /no leemos ni almacenamos ninguna direcci[óo]n IP nueva/],
  'pt-BR': [/Aprova[çc][ãa]o autom[áa]tica das corre[çc][õo]es:/, /o endere[çc]o IP a partir do qual ela foi ativada/, /n[ãa]o lemos nem armazenamos nenhum endere[çc]o IP novo/],
  fr: [/Approbation automatique des corrections\s*:/, /l'adresse IP depuis laquelle elle a [ée]t[ée] activ[ée]e/, /nous ne lisons ni ne stockons aucune nouvelle adresse IP/],
  it: [/Approvazione automatica delle correzioni\s*:/, /l'indirizzo IP dal quale essa [èe] stata attivata/, /non leggiamo n[ée] conserviamo alcun nuovo indirizzo IP/],
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
  fr: /sur un site sans l'extension, au moyen du mot de passe d'application que vous avez cr[ée][ée] et de l'interface REST de WordPress elle-m[êe]me/,
  it: /su un sito senza l'estensione, per mezzo della password di applicazione che Lei ha creato e dell'interfaccia REST di WordPress stessa/,
}
const WP_CHANNEL_PRIVACY: Record<string, RegExp> = {
  he: /באתר\s+שאין בו התוסף, התיקונים שממשק ה-REST של וורדפרס מאפשר נכתבים דרך סיסמת האפליקציה ששמרנו/,
  en: /On a site\s+without the plugin, the fixes WordPress&rsquo;s REST interface allows are written with the application\s+password we stored/,
  es: /En un sitio sin el complemento, las correcciones que permite la interfaz REST de WordPress se escriben con la Application Password que hemos almacenado/,
  'pt-BR': /Em um site sem o plugin, as corre[çc][õo]es que a interface REST do WordPress permite s[ãa]o escritas com a Senha de Aplicativo que armazenamos/,
  fr: /Sur un site sans l'extension, les corrections que l'interface REST de WordPress permet sont [ée]crites avec le mot de passe d'application que nous avons stock[ée]/,
  it: /Su un sito senza l'estensione, le correzioni che l'interfaccia REST di WordPress permette sono scritte con la password di applicazione che abbiamo conservato/,
}
/* The site-wide effect is the fact a merchant cannot guess; it may never be dropped. */
const MEDIA_ALT_SITEWIDE: Record<string, RegExp> = {
  he: /כתיבה אחת כזאת חלה על כל עמוד באתר שמציג את אותה תמונה/,
  en: /one such write applies on every page of the site that shows that same image/,
  es: /una sola escritura de este tipo se aplica en todas las p[áa]ginas del sitio que muestran esa misma imagen/,
  'pt-BR': /uma [úu]nica escrita desse tipo vale para todas as p[áa]ginas do site que exibem aquela mesma imagem/,
  fr: /une seule [ée]criture de ce type s'applique [àa] toutes les pages du site qui affichent cette m[êe]me image/,
  it: /una sola scrittura di questo tipo si applica a tutte le pagine del sito che mostrano quella stessa immagine/,
}
/* And its narrowings: only an empty one, nothing else about the image, approved on its own. */
const MEDIA_ALT_LIMITS: Record<string, RegExp[]> = {
  he: [/ורק לתמונה שאין לה\s+טקסט חלופי כלל/, /איננו נוגעים\s+בקובץ התמונה, בשמה או בכיתוב שלה/, /לעולם לא כחלק מקבוצת תיקונים\s+ולא במסגרת אישור אוטומטי/],
  en: [/only for an image that has no alt text\s+at all/, /We do\s+not touch the image file, its name or its caption/, /never as part of a group of fixes and never under automatic approval/],
  es: [/solo para una imagen que no tiene ning[úu]n texto alternativo/, /No tocamos el archivo de la imagen, su nombre ni su leyenda/, /nunca como parte de un grupo de correcciones y nunca bajo aprobaci[óo]n autom[áa]tica/],
  'pt-BR': [/somente para uma imagem que n[ãa]o tem nenhum texto alternativo/, /N[ãa]o tocamos no arquivo da imagem, no seu nome nem na sua legenda/, /nunca como parte de um grupo de corre[çc][õo]es e nunca sob aprova[çc][ãa]o autom[áa]tica/],
  fr: [/uniquement pour une image qui n'a aucun texte alternatif/, /Nous ne touchons pas au fichier de l'image, [àa] son nom ni [àa] sa l[ée]gende/, /jamais dans le cadre d'un groupe de corrections et jamais sous approbation automatique/],
  it: [/unicamente per un'immagine che non ha alcun testo alternativo/, /Non tocchiamo il file dell'immagine, il suo nome n[ée] la sua didascalia/, /mai nell'ambito di un gruppo di correzioni e mai sotto approvazione automatica/],
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
  fr: /Le rapport est envoy[ée] \*\*uniquement\*\* si vous avez autoris[ée] la cat[ée]gorie de marketing[\s\S]{0,140}Si vous l'avez refus[ée]e, ou si vous n'avez pas encore choisi, rien n'est envoy[ée]/,
  it: /Il rapporto [èe] inviato \*\*unicamente\*\* se Lei ha autorizzato la categoria di marketing[\s\S]{0,140}Se Lei l'ha rifiutata, o se non ha ancora scelto, nulla [èe] inviato/,
}
const CAPI_WITHDRAW: Record<string, RegExp> = {
  he: /ביטול ההסכמה לשיווק מפסיק מיד דיווחים עתידיים/,
  en: /Withdrawing marketing consent stops future reports immediately/,
  es: /Retirar el consentimiento de marketing detiene de inmediato los informes futuros/,
  'pt-BR': /Retirar o consentimento de marketing interrompe imediatamente os relatórios futuros/,
  fr: /Retirer le consentement de marketing arr[êe]te imm[ée]diatement les rapports futurs/,
  it: /Ritirare il consenso di marketing interrompe immediatamente i rapporti futuri/,
}
const CAPI_HASH: Record<string, RegExp[]> = {
  he: [/תמצית חד-כיוונית \(hash בשיטת SHA-256\) של כתובת הדוא&rdquo;ל/, /התמצית אינה הופכת את המידע לאנונימי/],
  en: [/a one-way hash \(SHA-256\) of the email address you signed up with/, /the hash does not make the information\s*anonymous/],
  es: [/un resumen unidireccional \(hash SHA-256\) de la dirección de correo electrónico/, /el hash no convierte la información en anónima/],
  'pt-BR': [/um resumo unidirecional \(hash SHA-256\) do endereço de e-mail/, /o hash não torna a informação anônima/],
  fr: [/un condens[ée] unidirectionnel \(hachage SHA-256\) de l'adresse de courriel/, /le hachage ne rend pas l'information anonyme/],
  it: [/un condensato unidirezionale \(hash SHA-256\) dell'indirizzo di posta elettronica/, /l'hash non rende l'informazione anonima/],
}
/* The code also sends a hash of the account id and the signup page's address, and those are
 * identifiers too: a list that stops at the email understates what leaves us. */
const CAPI_IDS: Record<string, RegExp[]> = {
  he: [/תמצית חד-כיוונית באותה שיטה של מזהה החשבון שלך אצלנו/, /כתובת העמוד שממנו נרשמת, בלי הפרמטרים שאחרי סימן השאלה/],
  en: [/a one-way hash, by the same method, of your account identifier with us/, /the address of the page you signed up from, without anything after the question mark/],
  es: [/un resumen unidireccional, por el mismo método, del identificador de su cuenta con nosotros/, /la dirección de la página desde la que usted se registró, sin nada de lo que va después del signo de interrogación/],
  'pt-BR': [/um resumo unidirecional, pelo mesmo método, do identificador da sua conta com a gente/, /o endereço da página de onde você se cadastrou, sem nada do que vem depois do sinal de interrogação/],
  fr: [/un condens[ée] unidirectionnel, par la m[êe]me m[ée]thode, de l'identifiant de votre compte chez nous/, /l'adresse de la page depuis laquelle vous vous [êe]tes inscrit, sans rien de ce qui suit le point d'interrogation/],
  it: [/un condensato unidirezionale, ottenuto con il medesimo metodo, dell'identificatore del Suo account presso di noi/, /l'indirizzo della pagina dalla quale Lei si [èe] iscritto, senza nulla di quello che segue il punto di domanda/],
}
const CAPI_NOT_SENT: Record<string, RegExp> = {
  he: /איננו שולחים את כתובת ה-IP שלך, את פרטי\s*הדפדפן שלך או עוגייה של Meta/,
  en: /we do not send your IP address, your browser details or any Meta\s*cookie/,
  es: /no enviamos su dirección IP, ni los datos de su navegador, ni ninguna cookie de Meta/,
  'pt-BR': /não enviamos o seu endereço IP, nem os dados do seu navegador, nem qualquer cookie da Meta/,
  fr: /nous n'envoyons pas votre adresse IP, ni les donn[ée]es de votre navigateur, ni aucun cookie de Meta/,
  it: /non inviamo il Suo indirizzo IP, n[ée] i dati del Suo browser, n[ée] alcun cookie di Meta/,
}
const CAPI_JOINT: Record<string, RegExp> = {
  he: /אנחנו\s*ו-Meta בעלי שליטה משותפים \(joint controllers\)[\s\S]{0,160}Meta Platforms Ireland Limited[\s\S]{0,120}Meta Platforms, Inc\./,
  en: /we and Meta are joint controllers: Meta Platforms Ireland Limited[\s\S]{0,140}Meta Platforms, Inc\./,
  es: /nosotros y Meta somos corresponsables del tratamiento \(joint controllers\): Meta Platforms Ireland Limited[\s\S]{0,140}Meta Platforms, Inc\./,
  'pt-BR': /nós e a Meta somos controladores conjuntos \(joint controllers\): a Meta Platforms Ireland Limited[\s\S]{0,140}Meta Platforms, Inc\./,
  fr: /nous et Meta sommes responsables conjoints du traitement \(joint controllers\) : Meta Platforms Ireland Limited[\s\S]{0,140}Meta Platforms, Inc\./,
  it: /noi e Meta siamo contitolari del trattamento \(joint controllers\): Meta Platforms Ireland Limited[\s\S]{0,140}Meta Platforms, Inc\./,
}
/* The marketing category has to say the consent covers a cookieless server report, or the
 * consent is not specific to what we then do with it (Art. 4(11)). */
const CAPI_CATEGORY: Record<string, RegExp> = {
  he: /האישור בקטגוריה הזאת חל גם על דיווח המרה שאנו שולחים\s*ל-Meta מהשרת שלנו בלי עוגייה כלל/,
  en: /Allowing this category also covers\s*a conversion report we send to Meta from our server with no cookie at all/,
  es: /Permitir esta categoría cubre también un informe de\s*conversión que enviamos a Meta desde nuestro servidor, sin ninguna cookie/,
  'pt-BR': /Permitir esta categoria vale também para um relatório de conversão que enviamos à Meta do nosso\s*servidor, sem cookie nenhum/,
  fr: /Autoriser cette cat[ée]gorie vaut aussi pour un rapport de conversion que nous envoyons [àa] Meta depuis notre serveur, sans aucun cookie/,
  it: /Autorizzare questa categoria vale anche per un rapporto di conversione che inviamo a Meta dal nostro server, senza alcun cookie/,
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

// ── 19) the business outreach section, and the promises inside it ─────────
/*
 * The cold outbound channel sends a marketing email to a business that never
 * asked for it, from an address found on that business's own site. Three
 * things make that lawful rather than spam, and each of them is a promise the
 * documents now carry, so each is pinned.
 *
 * The country rule. The channel is lawful because CAN-SPAM is an opt-out
 * regime; Israel's own anti-spam rule is opt-in and covers a business too, and
 * the EU and UK are stricter still. So the geography is not list hygiene, it is
 * the condition of the channel: the list may hold only businesses verified from
 * two independent sources to be in the United States, and MUST NOT hold an
 * Israeli, EEA or UK address at all. A text that softened this into "we do not
 * send to" rather than "we do not hold" would describe a different, unlawful
 * practice, so the pin is on holding.
 *
 * California. The CCPA's exemption for business-to-business contact data
 * expired on 1 January 2023, so a business contact's address is personal
 * information with the rights that come with it. Because the address was not
 * collected from the person, this section IS the notice at collection, which is
 * why it has to say so and why the email has to link it.
 *
 * The removal list. A one-click unsubscribe is only durable if the address is
 * kept, which is itself processing and needs its own purpose limit. The text
 * says the kept address is used for nothing but not contacting them again, and
 * that it applies across every channel: a removal honoured in one channel and
 * not the other is the breach that turns the lawful channel unlawful.
 *
 * What we do NOT do is pinned too, because it is cheap to promise and cheap to
 * break: no bought lists, no data brokers, no phone numbers, nothing about a
 * private individual, and nothing from a part of a site that is not public.
 */
const OUTREACH_COUNTRIES: Record<string, RegExp> = {
  he: /איננו מחזיקים למטרה הזאת\s*כתובות של עסקים בישראל, באזור הכלכלי האירופי או בבריטניה/,
  en: /We do not hold addresses for this purpose for businesses in Israel, the\s*European Economic Area or the United Kingdom/,
  es: /No conservamos direcciones con esta finalidad de empresas en Israel, en el Espacio Económico Europeo ni en el Reino Unido/,
  'pt-BR': /Não guardamos endereços para essa finalidade de empresas em Israel, no Espaço Econômico Europeu ou no Reino Unido/,
  fr: /Nous ne conservons pas d'adresses [àa] cette fin d'entreprises en Isra[ëe]l, dans l'Espace [ée]conomique europ[ée]en ni au Royaume-Uni/,
  it: /Non conserviamo indirizzi per questa finalit[àa] di imprese in Israele, nello Spazio economico europeo n[ée] nel Regno Unito/,
}
const OUTREACH_VERIFIED: Record<string, RegExp> = {
  he: /אימתנו,\s*משני מקורות בלתי תלויים, שהם פועלים בארצות הברית/,
  en: /we have verified, from two independent sources, to be operating in the United\s*States/,
  es: /hemos verificado, a partir de dos fuentes independientes, que operan en los Estados Unidos/,
  'pt-BR': /verificamos, a partir de duas fontes independentes, que atuam nos Estados Unidos/,
  fr: /nous avons v[ée]rifi[ée], [àa] partir de deux sources ind[ée]pendantes, qu'elles op[èe]rent aux [ÉE]tats-Unis/,
  it: /abbiamo verificato, da due fonti indipendenti, che operano negli Stati Uniti/,
}
const OUTREACH_NOT_DONE: Record<string, RegExp[]> = {
  he: [/איננו קונים\s*רשימות כתובות ואיננו משתמשים בסוחרי מידע/, /איננו נכנסים\s+לשום חלק באתר שאינו פתוח לכל מבקר/],
  en: [/We do not buy contact lists and we do not use\s+data brokers/, /we do not enter any part of a site\s*that is not open to every visitor/],
  es: [/No compramos listas de direcciones y no usamos intermediarios de datos/, /no entramos en ninguna parte de un sitio que no esté abierta a cualquier visitante/],
  'pt-BR': [/Não compramos listas de endereços e não usamos intermediários de dados/, /não entramos em nenhuma parte de um site que não esteja aberta a qualquer visitante/],
  fr: [/Nous n'achetons pas de listes d'adresses et nous n'utilisons pas de courtiers en donn[ée]es/, /nous n'entrons dans aucune partie d'un site qui ne soit pas ouverte [àa] tout visiteur/],
  it: [/Non acquistiamo elenchi di indirizzi e non utilizziamo intermediari di dati/, /non entriamo in alcuna parte di un sito che non sia aperta a qualsiasi visitatore/],
}
const OUTREACH_REMOVAL: Record<string, RegExp[]> = {
  he: [/למטרה היחידה של לוודא שלא ניצור איתך קשר שוב/, /היא חלה על כל ערוץ שלנו ולא רק על זה שבו ביקשת/],
  en: [/for the single purpose of making sure we do not contact you again/, /it applies across every channel of ours, not only the one you\s*asked in/],
  es: [/con la única finalidad de asegurarnos de no volver a contactarle/, /se aplica a todos nuestros canales, no solo a aquel en el que usted lo pidió/],
  'pt-BR': [/com a única finalidade de garantir que não entraremos em contato com você de novo/, /vale para todos os nossos canais, não só para aquele em que você pediu/],
  fr: [/[àa] la seule fin de nous assurer de ne plus vous contacter/, /elle vaut pour tous nos canaux, pas seulement pour celui dans lequel vous l'avez demand[ée]/],
  it: [/al solo fine di assicurarci di non contattarLa pi[ùu]/, /vale per tutti i nostri canali, non soltanto per quello nel quale Lei l'ha chiesta/],
}
const OUTREACH_NOTICE: Record<string, RegExp> = {
  he: /מכיוון שלא\s*אספנו את המידע ממך עצמך, הסעיף הזה הוא ההודעה על האיסוף, לרבות משך השמירה של כל פרט, והקישור אליו\s+מופיע בכל הודעה שאנו שולחים/,
  en: /Because we did\s*not collect the information from you directly, this section is the notice of collection,\s+including how long each item is kept, and a link to it appears in every message we send/,
  es: /Como no recogimos la información de usted directamente, esta sección es el aviso de recogida, incluido el plazo de conservación de cada dato, y un enlace a ella aparece en cada mensaje que enviamos/,
  'pt-BR': /Como não coletamos a informação de você diretamente, esta seção é o aviso de coleta, incluindo por quanto tempo cada dado é guardado, e um link para ela aparece em cada mensagem que enviamos/,
  fr: /Comme nous n'avons pas collect[ée] l'information aupr[èe]s de vous directement, la pr[ée]sente section est l'avis de collecte, y compris la dur[ée]e de conservation de chaque donn[ée]e, et un lien vers elle figure dans chaque message que nous envoyons/,
  it: /Poich[ée] non abbiamo raccolto l'informazione presso di Lei direttamente, la presente sezione [èe] l'informativa di raccolta, compresa la durata di conservazione di ciascun dato, e un link a essa figura in ciascun messaggio che inviamo/,
}
const OUTREACH_NO_SALE: Record<string, RegExp> = {
  he: /איננו מוכרים\s*את המידע הזה ואיננו משתפים אותו לפרסום התנהגותי חוצה-אתרים/,
  en: /We do not sell this information\s*and we do not share it for cross-context behavioural advertising/,
  es: /No vendemos esta información y no la compartimos para publicidad conductual entre contextos/,
  'pt-BR': /Não vendemos essa informação e não a compartilhamos para publicidade comportamental entre contextos/,
  fr: /Nous ne vendons pas cette information et nous ne la partageons pas pour de la publicit[ée] comportementale entre contextes/,
  it: /Non vendiamo quell'informazione e non la condividiamo per pubblicit[àa] comportamentale tra contesti diversi/,
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
    const countries = OUTREACH_COUNTRIES[name]
    if (countries) check(`${name}/privacy: the list may not HOLD an Israeli, EEA or UK business address`, countries.test(privacy))
    const verified = OUTREACH_VERIFIED[name]
    if (verified) check(`${name}/privacy: the United States is verified from two independent sources`, verified.test(privacy))
    for (const must of OUTREACH_NOT_DONE[name] ?? []) {
      check(`${name}/privacy: outreach states what we never do (${must.source.slice(0, 40)})`, must.test(privacy))
    }
    for (const must of OUTREACH_REMOVAL[name] ?? []) {
      check(`${name}/privacy: the removal list is purpose-limited and cross-channel (${must.source.slice(0, 40)})`, must.test(privacy))
    }
    const notice = OUTREACH_NOTICE[name]
    if (notice) check(`${name}/privacy: the section says it IS the notice at collection, linked from every message`, notice.test(privacy))
    const noSale = OUTREACH_NO_SALE[name]
    if (noSale) check(`${name}/privacy: no sale and no cross-context sharing of the outreach data`, noSale.test(privacy))
  }
  check('mutation control: "we do not send to" in place of "we do not hold" is caught',
    !OUTREACH_COUNTRIES.en.test('We do not send messages to businesses in Israel, the European Economic Area or the United Kingdom.'))
  check('mutation control: one source of country verification is caught',
    !OUTREACH_VERIFIED.en.test('we have verified, from the website address, to be operating in the United States'))
  check('mutation control: a removal list with no purpose limit is caught',
    !OUTREACH_REMOVAL.en[0].test('the address is kept on a removal list so that the removal holds.'))
  check('mutation control: a removal that stops at this one channel is caught',
    !OUTREACH_REMOVAL.en[1].test('it applies to the messages in this channel.'))
  check('mutation control: a California half that omits the notice at collection is caught',
    !OUTREACH_NOTICE.en.test('You have the right to know, to delete and to correct. A request goes to our privacy address.'))
  check('mutation control: a bought list is caught',
    !OUTREACH_NOT_DONE.en[0].test('We obtain addresses from public sources and from list providers.'))
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
  fr: [/\*\*R[ée]sum[ée] hebdomadaire\s*:\*\*/, /et uniquement lorsqu'il y a quelque chose [àa] raconter ; une semaine o[ùu] rien ne s'est pass[ée] ne donne pas lieu [àa] un courriel/],
  it: [/\*\*Riepilogo settimanale\s*:\*\*/, /e unicamente quando c'[èe] qualcosa da raccontare; una settimana in cui non [èe] accaduto nulla non d[àa] luogo a un messaggio/],
}
/* No monthly report may survive anywhere in either document: the switch says weekly. */
const EMAIL_NO_MONTHLY: Record<string, RegExp> = {
  // Narrow on purpose: a bare /חודשי/ also matches "מנוי חודשי", the monthly
  // subscription, which is true and stays.
  he: /(דוח התקדמות חודשי|סיכום חודשי)/,
  en: /[Mm]onthly (progress )?(report|summary)/,
  es: /[Ii]nforme mensual/,
  'pt-BR': /[Rr]elatório mensal/,
  fr: /[Rr]apport mensuel|[Rr][ée]sum[ée] mensuel/,
  it: /[Rr]apporto mensile|[Rr]iepilogo mensile/,
}
const EMAIL_SETUP_NO_OFFER: Record<string, RegExp> = {
  he: /אין בהם הצעה, אין מחיר, אין הנחה ואין שדרוג/,
  en: /They carry no offer, no price, no discount and no\s*upgrade/,
  es: /No llevan oferta, ni precio, ni descuento, ni mejora de plan/,
  'pt-BR': /Eles não trazem oferta, nem preço, nem desconto, nem upgrade/,
  fr: /Ils ne comportent ni offre, ni prix, ni remise, ni mont[ée]e en offre/,
  it: /Essi non comportano n[ée] offerta, n[ée] prezzo, n[ée] sconto, n[ée] passaggio a un piano superiore/,
}
const EMAIL_SCOPE_NARROW: Record<string, RegExp> = {
  he: /קישור ההסרה במייל הקמה מפסיק את מיילי ההקמה בלבד/,
  en: /The unsubscribe link in a setup email stops the\s*setup emails only/,
  es: /El enlace de baja de un correo de puesta en marcha detiene solo esos correos/,
  'pt-BR': /O link de cancelamento de um e-mail de início interrompe somente esses e-mails/,
  fr: /Le lien de d[ée]sabonnement d'un courriel de mise en route n'arr[êe]te que ces courriels/,
  it: /Il link di cancellazione di un messaggio di avvio interrompe soltanto quei messaggi/,
}
const EMAIL_SCOPE_WIDE: Record<string, RegExp> = {
  he: /קישור ההסרה בתזכורת או בסיכום השבועי מפסיק כל מייל על אותו פרויקט/,
  en: /The unsubscribe link in a reminder or in the weekly summary\s*stops every email about that project/,
  es: /El enlace de baja de un recordatorio o del resumen semanal detiene todos los correos sobre ese proyecto/,
  'pt-BR': /O link de cancelamento de um lembrete ou do resumo semanal interrompe todos os e-mails sobre aquele projeto/,
  fr: /Le lien de d[ée]sabonnement d'un rappel ou du r[ée]sum[ée] hebdomadaire arr[êe]te tous les courriels au sujet de ce projet/,
  it: /Il link di cancellazione di un promemoria o del riepilogo settimanale interrompe tutti i messaggi in merito a quel progetto/,
}
const EMAIL_SWITCH_TRUTH: Record<string, RegExp> = {
  he: /המתג שאתה רואה בהגדרות הוא התמונה\s*המלאה/,
  en: /the switch you see in the settings is the whole picture/,
  es: /el interruptor que usted ve en los ajustes es el panorama completo/,
  'pt-BR': /a chave que você vê nas configurações é o quadro completo/,
  fr: /l'interrupteur que vous voyez dans les r[ée]glages est le tableau complet/,
  it: /l'interruttore che Lei vede nelle impostazioni [èe] il quadro completo/,
}
const EMAIL_NO_FAKE_ZERO: Record<string, RegExp> = {
  he: /סעיף שלא הצלחנו לקרוא מושמט מהמייל ואינו מדווח כאפס/,
  en: /A section we could not read is left out of the email rather than\s*reported as a zero/,
  es: /Una sección que no pudimos leer se omite del correo en lugar de informarse como un cero/,
  'pt-BR': /Uma seção que não conseguimos ler é omitida do e-mail em vez de ser informada como zero/,
  fr: /Une section que nous n'avons pas pu lire est omise du courriel au lieu d'[êe]tre rapport[ée]e comme un z[ée]ro/,
  it: /Una sezione che non siamo riusciti a leggere [èe] omessa dal messaggio invece di essere riportata come uno zero/,
}
const EMAIL_NO_TRACKING: Record<string, RegExp> = {
  he: /אין בהודעות שלנו פיקסל שמדווח על פתיחה, איננו\s*עוקבים אחרי לחיצות/,
  en: /Our messages carry no pixel that reports an\s*open, we do not track clicks/,
  es: /Nuestros mensajes no llevan ningún píxel que informe de una apertura, no seguimos los clics/,
  'pt-BR': /As nossas mensagens não trazem nenhum pixel que informe uma abertura, não rastreamos cliques/,
  fr: /Nos messages ne comportent aucun pixel qui signale une ouverture, nous ne suivons pas les clics/,
  it: /I nostri messaggi non comportano alcun pixel che segnali un'apertura, non seguiamo i clic/,
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
    const emailHalf = doc.split(/Email Messages|הודעות דוא|Mensajes de correo|Mensagens de e-mail|Messages de courrier [ée]lectronique|Messaggi di posta elettronica/)[1] ?? ''
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
// The application reaches us from the site by email or in the form, and the
// policy may not name only the form: the form ships after this wording, and a
// policy that describes a mechanism that is not live yet is as wrong as one
// that hides a mechanism that is.
const PARTNER_FORM: Record<string, RegExp> = {
  he: /הבקשה מגיעה אלינו מהאתר[\s\S]{0,20}ל או בטופס ההרשמה/,
  en: /the application reaches us from this site, by email or through the application\s*form/,
  es: /la solicitud nos llega desde este sitio, por correo electrónico o a través del formulario/,
  'pt-BR': /a candidatura chega a nós deste site, por e-mail ou pelo formulário/,
  fr: /la demande nous parvient depuis ce site, par courriel ou par le formulaire de candidature/,
  it: /la domanda ci arriva da questo sito, per posta elettronica o attraverso il modulo di candidatura/,
}
// And the IP is taken only on the form path, so the sentence that discloses it
// has to say so.
const PARTNER_IP_ON_FORM: Record<string, RegExp> = {
  he: /כשהבקשה מגיעה בטופס נרשמת גם כתובת ה-IP/,
  en: /When the application comes through the form we also record the\s*IP address/,
  es: /Cuando la solicitud llega por el formulario registramos además la dirección IP/,
  'pt-BR': /Quando a candidatura chega pelo formulário, registramos também o endereço IP/,
  fr: /Lorsque la demande arrive par le formulaire, nous enregistrons en outre l'adresse IP/,
  it: /Quando la domanda arriva attraverso il modulo, registriamo inoltre l'indirizzo IP/,
}
const PARTNER_IP_PURPOSE: Record<string, RegExp> = {
  he: /לזהות גל של בקשות מזויפות,\s*ולהגביל שלוש בקשות לשעה מאותה כתובת/,
  en: /telling a ring of fake applications from a\s*real agency, and limiting three applications an hour from one address/,
  es: /distinguir una oleada de solicitudes falsas de una agencia real, y limitar a tres solicitudes por hora/,
  'pt-BR': /distinguir uma onda de candidaturas falsas de uma agência real e limitar a três candidaturas por hora/,
  fr: /distinguer une vague de demandes falsifi[ée]es d'une v[ée]ritable agence, et limiter [àa] trois demandes par heure/,
  it: /distinguere un'ondata di domande falsificate da una vera agenzia, e limitare a tre domande all'ora/,
}
const PARTNER_IP_RETENTION: Record<string, RegExp> = {
  he: /בקשה שנדחתה נמחקת כולה כעבור 12\s*חודשים/,
  en: /A rejected application is deleted in full after 12 months/,
  es: /Una solicitud rechazada se elimina por completo al cabo de 12 meses/,
  'pt-BR': /Uma candidatura recusada é excluída por completo após 12 meses/,
  fr: /Une demande refus[ée]e est supprim[ée]e en totalit[ée] au bout de 12 mois/,
  it: /Una domanda rifiutata [èe] cancellata per intero dopo 12 mesi/,
}
/* A click is a number. The four nothings are the whole point of the sentence. */
const PARTNER_CLICK_COUNT: Record<string, RegExp> = {
  he: /אחד למונה היומי של אותו\s*שותף/,
  en: /one added to that partner&rsquo;s daily\s*total/,
  es: /uno más en el total diario de ese socio/,
  'pt-BR': /mais um no total diário daquele parceiro/,
  fr: /un de plus dans le total quotidien de ce partenaire/,
  it: /uno in pi[ùu] nel totale giornaliero di quel partner/,
}
const PARTNER_CLICK_NOTHING: Record<string, RegExp> = {
  he: /בלי כתובת IP, בלי סוג דפדפן, בלי האתר שממנו הגעת ובלי\s*מזהה כלשהו/,
  en: /no IP address, no browser, no site you came from,\s*no identifier of any kind/,
  es: /sin dirección IP, sin navegador, sin el sitio del que llegó y sin ningún identificador/,
  'pt-BR': /sem endereço IP, sem navegador, sem o site de onde você veio e sem nenhum identificador/,
  fr: /sans adresse IP, sans navigateur, sans le site d'o[ùu] vous [êe]tes venu et sans aucun identifiant/,
  it: /senza indirizzo IP, senza browser, senza il sito dal quale Lei [èe] arrivato e senza alcun identificatore/,
}
const PARTNER_REVIEW_FLAG: Record<string, RegExp> = {
  he: /סימון כזה מבקש מאדם להסתכל לפני אישור עמלה, ואינו חוסם\s*דבר מעצמו/,
  en: /Such a flag asks a person to look\s*before any commission is approved; it blocks nothing by itself/,
  es: /Esa marca pide que una persona lo revise antes de aprobar cualquier comisión; por sí sola no bloquea nada/,
  'pt-BR': /Essa marca pede que uma pessoa verifique antes de aprovar qualquer comissão; por si só não bloqueia nada/,
  fr: /Cette marque demande qu'une personne v[ée]rifie avant d'approuver une commission ; [àa] elle seule, elle ne bloque rien/,
  it: /Quel contrassegno chiede che una persona verifichi prima di approvare una commissione; da solo non blocca nulla/,
}
const PARTNER_SHOPIFY: Record<string, RegExp> = {
  he: /לקוח שמחויב דרך Shopify אינו מייצר עמלה אוטומטית/,
  en: /A customer billed through Shopify produces no automatic commission/,
  es: /Un cliente facturado a través de Shopify no genera comisión automática/,
  'pt-BR': /Um cliente cobrado pela Shopify não gera comissão automática/,
  fr: /Un client factur[ée] via Shopify ne g[ée]n[èe]re pas de commission automatique/,
  it: /Un cliente fatturato tramite Shopify non genera una commissione automatica/,
}
/* The sentence the policy may no longer carry: the three things now exist. */
const PARTNER_NOT_BUILT: Record<string, RegExp> = {
  he: /עדיין לא\s*נבנו מעקב הפניות/,
  en: /no referral tracking, commission record or payout has been built yet/,
  es: /todavía no se han construido el seguimiento de referencias/,
  'pt-BR': /ainda não foram construídos o rastreamento de indicações/,
  fr: /n'ont pas encore [ée]t[ée] constru(its|ites) le suivi des recommandations/,
  it: /non sono ancora stati costruiti il monitoraggio delle segnalazioni/,
}
/* In the AGREEMENT: how a Shopify referral is recorded, and what suspension does not stop. */
const AGREEMENT_SHOPIFY_MANUAL: Record<string, RegExp> = {
  he: /לקוח שמחויב דרך Shopify נרשם ידנית/,
  en: /A customer billed through Shopify is recorded by hand/,
  es: /Un cliente facturado a través de Shopify se registra a mano/,
  'pt-BR': /Um cliente cobrado pela Shopify é registrado manualmente/,
  fr: /Un client factur[ée] via Shopify est enregistr[ée] manuellement/,
  it: /Un cliente fatturato tramite Shopify [èe] registrato manualmente/,
}
const AGREEMENT_LINK_LIVES: Record<string, RegExp> = {
  he: /הקישור שפרסמת ממשיך להוביל לאתר שלנו והקליקים עליו ממשיכים\s*להיספר/,
  en: /the link you published keeps leading\s*to our site and clicks on it keep being counted/,
  es: /el enlace que publicó sigue llevando a nuestro sitio y los clics en él siguen contándose/,
  'pt-BR': /o link que você publicou continua levando ao nosso site e os cliques nele continuam sendo contados/,
  fr: /le lien que vous avez publi[ée] continue de mener [àa] notre site et les clics sur ce lien continuent d'[êe]tre compt[ée]s/,
  it: /il link che Lei ha pubblicato continua a condurre al nostro sito e i clic su quel link continuano a essere contati/,
}
/* And the claim it replaced may not come back: it was never true of the code. */
const AGREEMENT_LINK_DIES: Record<string, RegExp> = {
  he: /קישור ההפניה שלך מפסיק לעבוד/,
  en: /your Referral Link stops working/,
  es: /su enlace de referido deja de funcionar/,
  'pt-BR': /o seu link de indicação para de funcionar/,
  fr: /votre lien de recommandation (cesse|arr[êe]te) de fonctionner/,
  it: /il Suo link di segnalazione (cessa|smette) di funzionare/,
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
    check(`${name}/privacy: the application arrives by email or in the form`, (PARTNER_FORM[name] ?? /$^/).test(privacy))
    check(`${name}/privacy: the IP is taken on the form path only`, (PARTNER_IP_ON_FORM[name] ?? /$^/).test(privacy))
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
  check('MUTATION — the superseded company name is caught',
    SUPERSEDED_NAME.test('GO TOP MARKETING GRUO LTD') && !SUPERSEDED_NAME.test(REGISTERED))
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
  check('a policy that names only the form is caught',
    !PARTNER_FORM.en.test('the application is a form on this site, and what we receive is'))
  check('an IP disclosed unconditionally, as if every application recorded one, is caught',
    !PARTNER_IP_ON_FORM.es.test('Además registramos la dirección IP desde la que llegó la solicitud.'))
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
  // The drifted date is derived from whatever the document currently says, so
  // this control keeps working when the terms are revised; pinning the literal
  // date made it pass only until the next revision.
  check('a footer date that drifts from the written date is caught',
    writtenRevisionDate('es', text.es.terms)
      !== frontMatter(text.es.terms.replace(/lastUpdated: \d{4}-\d{2}-\d{2}/, 'lastUpdated: 2026-10-06')).lastUpdated
      && writtenRevisionDate('es', text.es.terms) === frontMatter(text.es.terms).lastUpdated)
  check('a revision date read out of a statute sentence instead of the footer is caught',
    writtenRevisionDate('es', 'La Enmienda 13 entró en vigor el 14 de agosto de 2025.') === null)
  check('a translation that drops the promise about a referred customer\'s details is caught',
    !/no recibe la direcci[óo]n de correo electr[óo]nico, el sitio web, el plan/
      .test(text.es.privacy.replace(/no recibe la direcci[óo]n de correo electr[óo]nico, el sitio web, el plan/g, ''))
      && /no recibe la direcci[óo]n de correo electr[óo]nico, el sitio web, el plan/.test(text.es.privacy))
}

// ── 22) what the WordPress plugin does, disclosed in every language ─────────
/*
 * The GO TOP SEO Bridge plugin does more than apply fixes: it
 * creates whole POSTS from the articles a customer approves, it has the site
 * DOWNLOAD those articles' images into its Media Library, and it returns a
 * page's full CONTENT and can SEARCH the site's published posts. The policy
 * said the plugin applies "only fixes from a closed list" and named eleven.
 * Saying less than the code does is not a smaller promise, it is an inaccurate
 * notice, and Art. 13(1)(c) wants the purposes of processing given.
 *
 * Two further things the earlier draft of this section did not have, and that
 * this guard exists to keep:
 *
 * 1. Publishing writes that article's own SEO title, meta description and
 *    JSON-LD through the same signed /fix route, with no per-fix approval
 *    (lib/content/wordpress-publish.ts:209 → lib/content/wordpress-schema.ts,
 *    and lib/content/seo-publish.ts for the title and the description on a
 *    site with no SEO plugin). A policy that frames every plugin write as one
 *    the customer clicked is wrong about the thing that matters most: when we
 *    act without asking.
 * 2. From version 3.1.0 nothing needs the Application Password any more: the
 *    four actions that used to (forcing a new post, scheduled publishing, the
 *    scan of existing posts and its index refresh) go through the plugin. The
 *    old sentence naming them is therefore required to be ABSENT, and the new
 *    one has to carry BOTH halves — that 3.1.0 needs no password, and that an
 *    earlier copy of the plugin still does. A customer running 3.0.0 who reads
 *    only the first half would hand us no password and wonder why those
 *    actions are refused.
 *
 * 3.1.0 also made the plugin return much more of the site, and each of these is
 * personal or business data arriving on our servers, so each is held here
 * separately: the LIST of published posts and pages with their focus keyphrase,
 * one post's displayed HTML by id, the ids and display names of the USERS who
 * may publish (and nothing else about them — no e-mail, login or role), and the
 * Media Library search with alt text read and WRITTEN through the plugin rather
 * than only through the password. Publishing gained a schedule, a chosen
 * author, a second post, and taking over the post recorded for an article. That
 * last one is the easiest to describe too broadly: `gotop_seo_bridge_may_adopt`
 * only checks that the target is a post, not trashed and not tied to another
 * article, so the promise that it is always a post GO TOP itself published
 * rests on the app sending only the recorded `wp_post_id` — which is written
 * solely from our own publish result (`created.wpPostId`). If a customer-supplied
 * post id ever reaches that field, this text is wrong and must change first.
 *
 * The connection is also no longer one thing: paired with the plugin alone, no
 * password of the customer's is with us; connected with an Application
 * Password, it is. The policy distinguishes them instead of claiming the
 * broader collection for both.
 */
const PLUGIN_DOES: Record<string, RegExp[]> = {
  he: [
    /מאמרים שאתה מפרסם/,
    /ספריית המדיה/,
    /רק מכתובת האחסון שלנו/,
    /חיפוש מילה בפוסטים ובעמודים המפורסמים/,
    /שתי דרכים לחבר/,
    /אין אצלנו שום סיסמה שלך/,
    /בפרסום עצמו נכתבים גם כותרת ה-SEO, תיאור המטא, ביטוי המפתח וסכמת ה-JSON-LD/,
    /מגרסה 3.1.0 של התוסף ואילך, שום פעולה אינה דורשת/,
    /באתר שבו מותקנת גרסה קודמת של התוסף/,
    /רשימת הפוסטים והעמודים המפורסמים באתר/,
    /המזהה ואת שם התצוגה של כל משתמש שמורשה לפרסם/,
    /איננו\s+מקבלים את כתובת הדואר האלקטרוני שלהם/,
    /התוסף\s+כותב אותו על התמונה עצמה בספריית המדיה/,
    /ולא על פוסט שמשויך למאמר אחר/,
    /הפוסט הזה הוא תמיד פוסט שהמערכת עצמה פרסמה/,
    /סיסמת אפליקציה ששמורה אצלנו[\s\S]{0,80}גם כשהתוסף מותקן/,
  ],
  en: [
    /Articles you publish/,
    /Media Library/,
    /only from our storage\s+address/,
    /a word searched in the published posts and pages/,
    /two ways to connect/,
    /no password\s+of yours in our records/,
    /The publish itself also writes that\s+article&rsquo;s own SEO title, meta description, focus keyphrase and JSON-LD schema/,
    /From version 3.1.0 of the plugin onwards,\s+nothing does/,
    /On a site running an earlier version/,
    /the list of the site&rsquo;s published posts and pages/,
    /the id and display name of each user allowed to publish/,
    /We do not receive their e-mail address, username, roles or any other/,
    /the plugin writes it on the image itself in the Media Library/,
    /or a post belonging to a\s+different article/,
    /That post is always\s+one GO TOP published itself/,
    /application password we still hold from an earlier connection is used although the plugin is\s+installed/,
  ],
  es: [
    /art[íi]culos que usted publica/i,
    /biblioteca de medios/,
    /[úu]nicamente desde nuestra direcci[óo]n de almacenamiento/,
    /buscar una palabra\s+en las entradas y p[áa]ginas publicadas/,
    /dos formas de conectar/,
    /ninguna contrase[ñn]a suya en nuestros registros/,
    /La propia publicaci[óo]n escribe adem[áa]s el t[íi]tulo SEO, la meta descripci[óo]n, la frase clave principal y el esquema JSON-LD/,
    /Desde la versi[óo]n 3.1.0 del complemento, nada la necesita/,
    /En un sitio con una versi[óo]n anterior del complemento/,
    /la lista de las entradas y p[áa]ginas publicadas del sitio/,
    /el identificador y el nombre visible de cada usuario autorizado a publicar/,
    /No recibimos su direcci[óo]n de correo electr[óo]nico/,
    /el complemento lo escribe en la propia imagen en la biblioteca de medios/,
    /ni a una entrada que pertenezca a otro art[íi]culo/,
    /Esa entrada es siempre una que GO TOP public[óo]/,
    /Application Password que conservamos de una conexi[óo]n anterior sigue us[áa]ndose aunque el complemento est[ée] instalado/,
  ],
  'pt-BR': [
    /artigos que voc[êe] publica/i,
    /biblioteca de m[íi]dia/,
    /somente do nosso endere[çc]o de armazenamento/,
    /uma busca por palavra nos posts e p[áa]ginas publicados/,
    /duas formas de conectar/,
    /nenhuma senha sua nos nossos registros/,
    /A pr[óo]pria publica[çc][ãa]o tamb[ée]m escreve o t[íi]tulo de SEO, a meta descri[çc][ãa]o, a palavra-chave de foco e o esquema JSON-LD/,
    /Da vers[ãa]o 3.1.0 do plugin em diante, nada precisa/,
    /Em um site com uma vers[ãa]o anterior do plugin/,
    /a lista dos posts e p[áa]ginas publicados do site/,
    /o identificador e o nome de exibi[çc][ãa]o de cada usu[áa]rio autorizado a publicar/,
    /N[ãa]o recebemos o endere[çc]o de e-mail deles/,
    /o plugin o escreve na pr[óo]pria imagem na biblioteca de m[íi]dia/,
    /nem para um post que perten[çc]a a outro artigo/,
    /Aquele post [ée] sempre um que o GO TOP publicou/,
    /Senha de Aplicativo que ainda guardamos de uma conex[ãa]o anterior continua sendo usada mesmo com o plugin instalado/,
  ],
  fr: [
    /Les articles que vous publiez/,
    /biblioth[èe]que de m[ée]dias/,
    /que depuis notre adresse de stockage/,
    /les r[ée]sultats d'un mot cherch[ée] dans les posts et les pages publi[ée]s/,
    /deux fa[çc]ons de connecter un site WordPress/,
    /il ne reste aucun mot de passe de votre part dans nos enregistrements/,
    /La publication elle-m[êe]me [ée]crit en outre le titre SEO, la m[ée]ta-description, l'expression cl[ée] principale et le sch[ée]ma JSON-LD/,
    /Depuis la version 3\.1\.0 de l'extension, rien ne le n[ée]cessite/,
    /Sur un site avec une version ant[ée]rieure de l'extension/,
    /la liste des posts et des pages publi[ée]s du site/,
    /l'identifiant et le nom affich[ée] de chaque utilisateur autoris[ée] [àa] publier/,
    /Nous ne recevons pas leur adresse de courriel/,
    /l'extension l'[ée]crit sur l'image elle-m[êe]me dans la biblioth[èe]que de m[ée]dias/,
    /ni [àa] un post qui appartient [àa] un autre article/,
    /Ce post est toujours un post que GO TOP a publi[ée] lui-m[êe]me/,
    /mot de passe d'application que nous conservons d'une connexion ant[ée]rieure continue d'[êe]tre utilis[ée] bien que l'extension soit install[ée]e/,
  ],
  it: [
    /Gli articoli che Lei pubblica/,
    /libreria dei media/,
    /soltanto dal nostro indirizzo di archivio/,
    /i risultati di una parola cercata nei post e nelle pagine pubblicati/,
    /due modi di connettere un sito WordPress/,
    /non resta nei nostri registri alcuna password da parte Sua/,
    /La pubblicazione stessa scrive inoltre il titolo SEO, la meta description, la frase chiave principale e lo schema JSON-LD/,
    /Dalla versione 3\.1\.0 dell'estensione, nulla la richiede/,
    /Su un sito con una versione anteriore dell'estensione/,
    /l'elenco dei post e delle pagine pubblicati del sito/,
    /l'identificatore e il nome mostrato di ciascun utente autorizzato a pubblicare/,
    /Non riceviamo il loro indirizzo di posta elettronica/,
    /l'estensione la scrive sull'immagine stessa nella libreria dei media/,
    /n[ée] a un post che appartiene a un altro articolo/,
    /Quel post [èe] sempre un post che GO TOP ha pubblicato esso stesso/,
    /password di applicazione che conserviamo da una connessione anteriore continua a essere utilizzata bench[ée] l'estensione sia installata/,
  ],
}
{
  const enSource = frontMatter(text[LOCALES[0]].privacy).source
  const pages: [string, string][] = [
    ['he', existsSync(HEBREW_PRIVACY) ? readFileSync(HEBREW_PRIVACY, 'utf8') : ''],
    ['en', enSource && existsSync(enSource) ? readFileSync(enSource, 'utf8') : ''],
    ...LOCALES.map((l): [string, string] => [l, text[l].privacy]),
  ]
  for (const [name, src] of pages) {
    check(`${name}/privacy: the plugin page was read`, src.length > 0)
    for (const must of PLUGIN_DOES[name] ?? []) {
      check(`${name}/privacy: the plugin section states ${must.source.slice(0, 34)}`, must.test(src))
    }
    // The sentence that was there before must be GONE, in every language. It is
    // the one a reader would rely on, and it is now false.
    check(`${name}/privacy: no longer claims the plugin applies fixes and nothing else`,
      !/רק תיקונים\s*\n?\s*מרשימה סגורה|only fixes from a closed list|[úu]nicamente correcciones de una lista cerrada|apenas corre[çc][õo]es de uma lista fechada|n'applique au site que des corrections d'une liste ferm[ée]e|applica al sito soltanto correzioni di un elenco chiuso/.test(src))
    // And the 3.0.0 sentence, which said those four actions need an Application
    // Password even with the plugin connected, must be GONE: with 3.1.0 they do
    // not, and a reader deciding whether to hand us a password would rely on it.
    check(`${name}/privacy: no longer claims those actions need a password with the plugin connected`,
      !/מה שדורש סיסמת אפליקציה גם כשהתוסף מחובר|What still needs an Application Password even when the plugin is connected|sigue necesitando una Application Password aunque el complemento est[ée] conectado|ainda precisa de uma Senha de Aplicativo mesmo com o plugin conectado|n[ée]cessite (encore )?un mot de passe d'application m[êe]me lorsque l'extension est connect[ée]e|richiede (ancora )?una password di applicazione anche quando l'estensione [èe] (connessa|installata)/.test(src))
  }
  check('mutation control: the old "only fixes from a closed list" sentence fails the guard',
    /only fixes from a closed list/.test('the plugin applies to the site only fixes from a closed list (SEO title)'))
  check('mutation control: a language that drops publishing is caught',
    !PLUGIN_DOES.en[0].test('the plugin applies the fixes you approve, one by one, from a closed list'))
  check('mutation control: a language that drops the images is caught',
    !PLUGIN_DOES.es[1].test('Los artículos que usted publica se crean como entradas en su sitio.'))
  check('mutation control: a policy where publishing writes nothing of its own is caught',
    !PLUGIN_DOES.en[6].test('An article you approve is created as a post on your site, as the author you choose there.'))
  check('mutation control: a policy that drops the version the password stops being needed at is caught',
    !PLUGIN_DOES['pt-BR'][7].test('O plugin faz tudo sozinho, sem senha de aplicativo.'))
  check('mutation control: a policy that forgets an older plugin still needs the password is caught',
    !PLUGIN_DOES.en[8].test('From version 3.1.0 of the plugin onwards, nothing needs an Application Password.'))
  check('mutation control: a policy that hides the list of published posts and pages is caught',
    !PLUGIN_DOES.es[9].test('El complemento nos devuelve el contenido de una entrada concreta y los resultados de una b\u00fasqueda.'))
  check('mutation control: a policy that hides who may publish is caught',
    !PLUGIN_DOES.en[10].test('The plugin tells us which authors exist on the site.'))
  check('mutation control: a policy that claims nothing of the site users reaches us is caught',
    !PLUGIN_DOES['pt-BR'][11].test('N\u00e3o recebemos nada sobre os usu\u00e1rios do site.'))
  check('mutation control: a policy where only the application password writes media alt text is caught',
    !PLUGIN_DOES.en[12].test('Alt text is written on the image itself in the media library with the application password.'))
  check('mutation control: a policy claiming the password is never used once the plugin is installed is caught',
    !PLUGIN_DOES.en[15].test('From version 3.1.0 of the plugin onwards, nothing does: everything described here goes through the plugin, and a password we hold is never used again.'))
  check('mutation control: an adopt sentence with no limits is caught',
    !PLUGIN_DOES.he[13].test('\u05d4\u05de\u05e2\u05e8\u05db\u05ea \u05d9\u05db\u05d5\u05dc\u05d4 \u05dc\u05e2\u05d3\u05db\u05df \u05db\u05dc \u05e4\u05d5\u05e1\u05d8 \u05d1\u05d0\u05ea\u05e8.'))
}

// ── 23) no double billing when a Shopify store joins a PayPal account ───────
/*
 * Oren decided on 2026-10-09 that double billing must be impossible, and
 * chose the narrow rule: PayPal checkout is closed while a Shopify store
 * with the app installed is connected to the account. Nothing else about
 * when a plan can be bought changes. The code that
 * carries the decision (PR #152) does three things a merchant pays money on,
 * so the terms have to state all three or we are charging — and stopping a
 * charge — on a description nobody read:
 *
 *   1. While the app is installed on a connected store, PayPal checkout is
 *      closed and plans are bought through Shopify only
 *      (isShopifyBillingRequiredForUser, lib/shopify/paypal-block.ts); it
 *      reopens after the app is removed from every store, unless the account
 *      is already Shopify-billed or mid-migration.
 *   2. A PayPal period already paid for runs to its end: the website plan
 *      keeps working, no Shopify plan is offered or charged before that date
 *      (resolveEffectiveBillingAuthority, lib/shopify/paypal-paid-period.ts),
 *      the automatic renewal is stopped so PayPal charges nothing more
 *      (stopPayPalRenewalForMigration), and there is NO REFUND and no early
 *      end of access. The renewal stop is not absolute — a period whose end
 *      date is unknown is left renewing on purpose, rather than risk ending
 *      access at once — so the text says a renewed period is honoured too,
 *      instead of promising a renewal that never happens.
 *   3. From that date paid use needs a plan chosen in Shopify.
 *
 * And the one path we cannot block: a merchant who picks a plan in Shopify's
 * own billing screens during the paid period is charged by Shopify. Our app
 * never sends them there, and we cannot refund a Shopify charge, so the terms
 * say so rather than leave the merchant to discover it.
 */
const NO_DOUBLE_BILLING: Record<string, RegExp[]> = {
  he: [
    /כל עוד האפליקציה מותקנת בחנות המחוברת, אי אפשר לרכוש או לשנות תוכנית ב-PayPal/,
    /לאחר הסרת האפליקציה מכל החנויות הרכישה ב-PayPal נפתחת מחדש/,
    /התוכנית שנרכשה באתר ממשיכה לפעול עד תום אותה תקופה, לא מוצעת ולא נגבית תוכנית ב-Shopify לפני כן/,
    /עוצרים את החידוש האוטומטי ב-PayPal/,
    /גם התקופה הזאת תכובד במלואה/,
    /אין החזר כספי על תקופה ששולמה ואין קטיעה של הגישה לפני תומה/,
    /המשך השימוש בתוכנית מחייב בחירת תוכנית ב-Shopify/,
    /אם תבחרו תוכנית ישירות במסכי החיוב של Shopify בתוך תקופה ששולמה באתר, Shopify תגבה עליה/,
  ],
  en: [
    /While the app is installed on the connected store, a plan cannot be bought or changed with PayPal/,
    /Once the app is removed from every store, PayPal checkout is available again/,
    /keeps working until that period ends, no Shopify plan is offered or charged before then/,
    /we stop the automatic renewal at PayPal/,
    /that period is honoured in full as well/,
    /There is no refund for a period already paid for and no access is cut short before it ends/,
    /continuing on a paid plan requires choosing a plan in Shopify/,
    /If you choose a plan directly in Shopify&rsquo;s own billing screens during a period already paid for on the website, Shopify will charge you for it/,
  ],
  es: [
    /Mientras la aplicaci[óo]n est[ée] instalada en la tienda conectada, no es posible comprar ni cambiar un plan con PayPal/,
    /el pago con PayPal vuelve a estar disponible/,
    /sigue funcionando hasta que ese periodo termine, antes de esa fecha no se ofrece ni se cobra ning[úu]n plan de Shopify/,
    /detenemos la renovaci[óo]n autom[áa]tica en PayPal/,
    /ese periodo tambi[ée]n se respeta [íi]ntegramente/,
    /No hay reembolso por un periodo ya pagado ni se interrumpe el acceso antes de que termine/,
    /continuar con un plan de pago requiere elegir un plan en Shopify/,
    /Shopify le cobrar[áa] por [ée]l/,
  ],
  'pt-BR': [
    /Enquanto o aplicativo estiver instalado na loja conectada, n[ãa]o [ée] poss[íi]vel comprar nem alterar um plano pelo PayPal/,
    /o pagamento pelo PayPal volta a estar dispon[íi]vel/,
    /continua funcionando at[ée] o fim desse per[íi]odo, nenhum plano da Shopify [ée] oferecido ou cobrado antes dessa data/,
    /interrompemos a renova[çc][ãa]o autom[áa]tica no PayPal/,
    /esse per[íi]odo tamb[ée]m [ée] respeitado integralmente/,
    /N[ãa]o h[áa] reembolso de um per[íi]odo j[áa] pago e o acesso n[ãa]o [ée] interrompido antes do seu fim/,
    /continuar em um plano pago exige escolher um plano na Shopify/,
    /a Shopify cobrar[áa] por ele/,
  ],
  fr: [
    /Tant que l'application est install[ée]e sur la boutique connect[ée]e, il n'est pas possible d'acheter ni de changer d'offre avec PayPal/,
    /le paiement par PayPal redevient disponible/,
    /l'offre achet[ée]e sur le site Web continue de fonctionner jusqu'[àa] la fin de cette p[ée]riode, aucune offre Shopify n'est propos[ée]e ni factur[ée]e avant cette date/,
    /nous arr[êe]tons le renouvellement automatique chez PayPal/,
    /cette p[ée]riode est elle aussi respect[ée]e int[ée]gralement/,
    /Il n'y a pas de remboursement d'une p[ée]riode d[ée]j[àa] pay[ée]e et l'acc[èe]s n'est pas interrompu avant son terme/,
    /continuer sur une offre payante exige de choisir une offre dans Shopify/,
    /Shopify vous la facturera/,
  ],
  it: [
    /Fino a quando l'applicazione [èe] installata sul negozio connesso, non [èe] possibile acquistare n[ée] cambiare piano con PayPal/,
    /il pagamento tramite PayPal torna disponibile/,
    /il piano acquistato sul sito Web continua a funzionare fino alla fine di quel periodo, nessun piano Shopify [èe] proposto n[ée] fatturato prima di quella data/,
    /interrompiamo il rinnovo automatico presso PayPal/,
    /anche quel periodo [èe] rispettato integralmente/,
    /Non c'[èe] rimborso di un periodo gi[àa] pagato e l'accesso non [èe] interrotto prima del suo termine/,
    /continuare con un piano a pagamento richiede di scegliere un piano in Shopify/,
    /Shopify glielo fatturer[àa]/,
  ],
}
const NO_DOUBLE_BILLING_NAMES = [
  'PayPal is closed while the app is installed',
  'PayPal reopens once the app is removed from every store',
  'the paid website period runs on, with no Shopify plan before it ends',
  'the automatic PayPal renewal is stopped',
  'a period that renewed once more is honoured too',
  'no refund for a paid period, and no access cut short',
  'a Shopify plan is what continues paid use afterwards',
  'a plan picked in Shopify’s own screens is charged by Shopify',
]
{
  const readDoc = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
  const flat = (s: string) => s.replace(/\s+/g, ' ')
  const enTermsPath = frontMatter(text[LOCALES[0]].terms).source
  const sources: [string, string][] = [
    ['he', readDoc(HEBREW_TERMS)],
    ['en', readDoc(enTermsPath)],
  ]
  for (const locale of LOCALES) sources.push([locale, text[locale].terms])
  for (const [name, raw] of sources) {
    const body = flat(raw)
    check(`${name}/terms: the document was read`, body.length > 0)
    const patterns = NO_DOUBLE_BILLING[name]
    check(`${name}/terms: the language has its own double-billing table`, Array.isArray(patterns))
    ;(patterns ?? []).forEach((re, i) => {
      check(`${name}/terms: ${NO_DOUBLE_BILLING_NAMES[i]}`, re.test(body))
    })
  }

  // Mutation controls: each error direction a future rewrite could take.
  check('mutation control: terms that leave PayPal open while a store is connected are caught',
    !NO_DOUBLE_BILLING.en[0].test(flat('Connecting a Shopify store does not change how you pay: PayPal stays available.')))
  check('mutation control: terms that offer a Shopify plan during the paid period are caught',
    !NO_DOUBLE_BILLING.en[2].test(flat('The plan keeps working until that period ends, and you may pick a Shopify plan at any time.')))
  check('mutation control: terms that promise a refund for the paid period are caught',
    !NO_DOUBLE_BILLING['pt-BR'][5].test(flat('Reembolsamos a parte não usada do período já pago quando você muda para a Shopify.')))
  check('mutation control: terms that hide the Shopify-screens charge are caught',
    !NO_DOUBLE_BILLING.es[7].test(flat('Durante ese periodo no se le cobra nada en ningún canal.')))
  check('mutation control: terms that promise the renewal never happens are caught',
    !NO_DOUBLE_BILLING.he[4].test(flat('החידוש נעצר תמיד ולעולם לא תיגבה תקופה נוספת.')))
}

// ── 24) completing a missing SEO field on an article we published ─────────
/*
 * Articles published before the Go Top plugin or its Bridge was on the site
 * were left without their SEO title or meta description (Yoast / Rank Math
 * keep them where core REST cannot write). The backfill
 * (lib/content/seo-backfill.ts, run from the admin screen) fills ONLY a field
 * that is missing on the live page, never replaces a value that is there (the
 * plugin's own compare-and-set, expected: ''), and only on articles we
 * published ourselves (generated_articles rows with our wp_post_id, the post
 * on the connected host, the page naming that post id). It writes without a
 * new approval, as the completion of the publish the customer approved, so
 * both documents must say that it happens, that it never replaces, and that
 * it is limited to our own articles — three separate promises per language.
 */
const SEO_COMPLETION: Record<string, RegExp[]> = {
  he: [/נוכל להשלים לאחר מכן את השדה החסר/, /לעולם אינה מחליפה ערך קיים/, /וחלה רק על מאמרים שהשירות עצמו פרסם/],
  en: [/we may fill in the missing field on that same article later/, /never replaces a value that exists/, /applies only to articles the Service itself published/],
  es: [/podemos completar despu[ée]s el campo que falta/, /nunca sustituye un valor existente/, /se aplica solo a los art[íi]culos que el propio Servicio public[óo]/],
  'pt-BR': [/podemos preencher depois o campo que falta/, /nunca substitui um valor existente/, /se aplica somente aos artigos que o pr[óo]prio Servi[çc]o publicou/],
  fr: [/nous pouvons compl[ée]ter plus tard le champ manquant/, /ne remplace jamais une valeur existante/, /ne s'applique qu'aux articles que le Service lui-m[êe]me a publi[ée]s/],
  it: [/possiamo completare pi[ùu] tardi il campo mancante/, /non sostituisce mai un valore esistente/, /si applica soltanto agli articoli che il Servizio stesso ha pubblicato/],
}
const SEO_COMPLETION_NAMES = ['a missing SEO field may be completed later', 'an existing value is never replaced', 'only on articles the Service itself published']
{
  const readDoc = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
  const flat = (s: string) => s.replace(/\s+/g, ' ')
  const enPrivacy = frontMatter(text[LOCALES[0]].privacy).source
  const enTerms = frontMatter(text[LOCALES[0]].terms).source
  const docs: [string, string][] = [
    ['he', readDoc(HEBREW_PRIVACY) + '\n' + readDoc(HEBREW_TERMS)],
    ['en', readDoc(enPrivacy) + '\n' + readDoc(enTerms)],
    ...LOCALES.map((l): [string, string] => [l, text[l].privacy + '\n' + text[l].terms]),
  ]
  for (const [name, raw] of docs) {
    const body = flat(raw)
    const patterns = SEO_COMPLETION[name]
    check(`${name}/privacy+terms: the language has its own SEO-completion table`, Array.isArray(patterns))
    ;(patterns ?? []).forEach((re, i) => check(`${name}/privacy+terms: ${SEO_COMPLETION_NAMES[i]}`, re.test(body)))
  }
  check('mutation control: a text that permits replacing an existing value is caught',
    !SEO_COMPLETION.en[1].test(flat('Such a completion fills a missing field and may replace a value that exists, and applies only to articles the Service itself published.')))
  check('mutation control: a text that drops the limit to our own articles is caught',
    !SEO_COMPLETION.en[2].test(flat('Such a completion fills only a missing field, never replaces a value that exists, and applies to any page on your site.')))
}

// ── 25) Creem, the payment provider, in every language ─────────────────────
/*
 * lib/creem/config.ts ships two hosts, so legal-coverage.qa.ts requires the
 * provider to be named in the he and en policies. That guard knows nothing
 * about es and pt-BR, and a provider disclosed in two languages out of four is
 * undisclosed to the customers reading the other two.
 *
 * The sentence is derived from the code, not from what Creem is for: the
 * checkout call in lib/creem/client.ts sends the product id, our request id
 * and, when there is one, the customer's e-mail, and the subscription read
 * returns an id, a status, a product, a customer id and the period dates. So
 * the policy names the e-mail address and says card details never reach us,
 * and it must keep saying that only while the code sends nothing more. A
 * caller that puts anything about a customer into `metadata` makes this
 * paragraph wrong, which is why the metadata is named here and not only in
 * the thread that built it.
 */
const CREEM_SHARED: Record<string, RegExp> = {
  he: /Creem:<\/strong> לעיבוד תשלומים, כאשר התשלום של החשבון עובר דרכו/,
  en: /Creem:<\/strong> for payment processing, where an account&rsquo;s payment goes through it/,
  es: /\*\*Creem:\*\* para el procesamiento de pagos, cuando el pago de una cuenta pasa por él/,
  'pt-BR': /\*\*Creem:\*\* para processar pagamentos, quando o pagamento de uma conta passa por ele/,
  fr: /\*\*Creem\s*:\*\* pour le traitement des paiements, lorsque le paiement d'un compte passe par lui/,
  it: /\*\*Creem\s*:\*\* per il trattamento dei pagamenti, quando il pagamento di un account passa attraverso di esso/,
}
const CREEM_NO_CARD: Record<string, RegExp> = {
  he: /פרטי כרטיס,\s+וכל אמצעי תשלום אחר, אינם מגיעים אלינו בשום שלב/,
  en: /Card details, and any other\s+payment instrument, never reach us at any point/,
  es: /Los datos de la tarjeta, y cualquier otro instrumento de pago, no llegan a nosotros en ningún momento/,
  'pt-BR': /Os dados do cartão, e qualquer outro meio de pagamento, nunca chegam a nós em nenhum momento/,
  fr: /Les donn[ée]es de la carte, et tout autre moyen de paiement, ne parviennent jamais jusqu'[àa] nous, [àa] aucun moment/,
  it: /I dati della carta, e di qualsiasi altro mezzo di pagamento, non arrivano mai fino a noi, in nessun momento/,
}
const CREEM_EMAIL: Record<string, RegExp> = {
  he: /כתובת הדוא&rdquo;ל של החשבון/,
  en: /the e-mail address of the account/,
  es: /la dirección de correo electrónico de la cuenta/,
  'pt-BR': /o endereço de e-mail da conta/,
  fr: /l'adresse de courriel du compte/,
  it: /l'indirizzo di posta elettronica dell'account/,
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
    check(`${name}/privacy: Creem is named as a payment recipient`, (CREEM_SHARED[name] ?? /$^/).test(src))
    check(`${name}/privacy: it says what we send, starting with the account e-mail`, (CREEM_EMAIL[name] ?? /$^/).test(src))
    check(`${name}/privacy: it says no payment instrument reaches us`, (CREEM_NO_CARD[name] ?? /$^/).test(src))
  }
  check('mutation control: a policy that names Creem without saying what we send it is caught',
    !CREEM_EMAIL.en.test('Creem: for payment processing, where an account&rsquo;s payment goes through it.'))
  check('mutation control: a policy that drops the no-card-details sentence is caught',
    !CREEM_NO_CARD.es.test('**Creem:** para el procesamiento de pagos. Recibimos el estado de la suscripción.'))
  check('mutation control: a policy that claims we store the payment instrument is caught',
    !CREEM_NO_CARD['pt-BR'].test('Os dados do cartão são guardados por nós para a próxima cobrança.'))
}


// ── 26) Creem as the merchant of record, in every language ─────────────────
/*
 * Creem's Merchant Terms 3.7 is an obligation on us, not an option: the
 * Merchant "shall ensure that Buyers are clearly informed, before completing a
 * transaction through the Service, that the payment will be processed by Creem
 * as the merchant of record", and it names the terms of sale as an acceptable
 * place. 3.8 adds that Creem's Buyer Terms must be put in front of the buyer in
 * the same way. So this text is contractually required before the first real
 * charge, and a language missing it is a language in which we are in breach.
 *
 * Every line below is a clause, not a description of what Creem is for:
 *   - the seller is Armitage Labs OÜ, registry code 16977866 (Merchant Terms
 *     2.1.5), selling in its own name as merchant of record and contractual
 *     reseller (3.2, 17.1). The entity and the number are pinned because
 *     "Creem" alone does not tell a customer who they bought from.
 *   - Creem invoices the buyer in its own name (9.2) and we may not issue any
 *     invoice or receipt, demand payment, or account for tax (9.3.1-9.3.3).
 *   - indirect tax is calculated, collected and remitted by Creem on the
 *     buyer's billing address (9.1, 3.3.4), which is why the price shown is
 *     stated NOT to include it; an EU consumer must see a tax-inclusive final
 *     price before paying, and Creem's checkout is where that happens.
 *   - refunds and chargebacks are executed exclusively by Creem (Buyer Terms
 *     9.3) — but on the eligibility criteria in the product's own terms, which
 *     means section 7 of ours. That is why the text says refunds run through
 *     Creem WITHOUT softening section 7 into a promise we do not make.
 *   - the service itself stays ours (17.1.1, 17.1.2), so no reader can conclude
 *     that Creem supports, delivers or warrants it.
 *
 * The mutation controls below catch the two failures that would matter: a text
 * that names Creem as a payment processor rather than the seller, and a text
 * that implies the displayed price is the final one.
 */
const MOR_SELLER: Record<string, RegExp> = {
  he: /Creem פועלת כמוכר הרשום וכמשווק מחדש/,
  en: /Creem acts as the merchant\s+of record and contractual reseller/,
  es: /Creem act[úu]a como comerciante registrado y revendedor contractual/,
  'pt-BR': /A Creem atua como comerciante registrada e revendedora contratual/,
  fr: /Creem agit en tant que vendeur enregistr[ée] et revendeur contractuel/,
  it: /Creem agisce in qualit[àa] di venditore registrato e revenditore contrattuale/,
}
const MOR_ENTITY: Record<string, RegExp> = {
  he: /Armitage Labs O&Uuml;[\s\S]{0,60}16977866/,
  en: /Armitage Labs O&Uuml;[\s\S]{0,80}16977866/,
  es: /Armitage Labs OÜ[\s\S]{0,60}16977866/,
  'pt-BR': /Armitage Labs OÜ[\s\S]{0,60}16977866/,
  fr: /Armitage Labs OÜ[\s\S]{0,60}16977866/,
  it: /Armitage Labs OÜ[\s\S]{0,60}16977866/,
}
const MOR_INVOICE: Record<string, RegExp> = {
  he: /Creem מוציאה את החשבונית בשמה שלה/,
  en: /Creem issues the invoice in its own name/,
  es: /Creem emite la factura en su propio nombre/,
  'pt-BR': /A Creem emite a fatura em nome pr[óo]prio/,
  fr: /Creem [ée]met la facture en son propre nom/,
  it: /Creem emette la fattura in nome proprio/,
}
const MOR_TAX: Record<string, RegExp> = {
  he: /המחיר שמופיע[\s\S]{0,40}אינו כולל מס כזה/,
  en: /The price shown on the pricing page does not include such tax/,
  es: /El precio que figura en la p[áa]gina de precios no incluye ese impuesto/,
  'pt-BR': /O pre[çc]o que aparece na p[áa]gina de pre[çc]os n[ãa]o inclui esse imposto/,
  fr: /Le prix affich[ée] sur la page des tarifs ne comprend pas cette taxe/,
  it: /Il prezzo indicato nella pagina dei prezzi non comprende quell'imposta/,
}
const MOR_REFUND: Record<string, RegExp> = {
  he: /מבוצעים על ידי Creem בלבד[\s\S]{0,80}סעיף 7/,
  en: /carried out by\s+Creem alone[\s\S]{0,120}section 7/,
  es: /los ejecuta [úu]nicamente Creem[\s\S]{0,120}secci[óo]n 7/,
  'pt-BR': /executado somente pela Creem[\s\S]{0,120}se[çc][ãa]o 7/,
  fr: /ex[ée]cut[ée]s uniquement par Creem[\s\S]{0,120}section 7/,
  it: /eseguiti unicamente da Creem[\s\S]{0,120}sezione 7/,
}
const MOR_SERVICE_OURS: Record<string, RegExp> = {
  he: /Creem אינה נוטלת אחריות על אלה/,
  en: /Creem takes no\s+responsibility for those/,
  es: /Creem no asume responsabilidad alguna por ellas/,
  'pt-BR': /A Creem n[ãa]o assume responsabilidade por nada disso/,
  fr: /Creem n'assume aucune responsabilit[ée] [àa] leur [ée]gard/,
  it: /Creem non assume alcuna responsabilit[àa] al riguardo/,
}
const MOR_BUYER_TERMS: Record<string, RegExp> = {
  he: /creem\.io\/buyer-terms/,
  en: /creem\.io\/buyer-terms/,
  es: /creem\.io\/buyer-terms/,
  'pt-BR': /creem\.io\/buyer-terms/,
  fr: /creem\.io\/buyer-terms/,
  it: /creem\.io\/buyer-terms/,
}
{
  const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
  const enTermsSource = frontMatter(text[LOCALES[0]].terms).source
  const docs: [string, string][] = [
    ['he', read(HEBREW_TERMS)],
    ['en', enTermsSource ? read(enTermsSource) : ''],
    ...LOCALES.map((l): [string, string] => [l, text[l].terms]),
  ]
  for (const [name, terms] of docs) {
    check(`${name}/terms: the page was read`, terms.length > 0)
    check(`${name}/terms: Creem is named as merchant of record and reseller, not a processor`, (MOR_SELLER[name] ?? /$^/).test(terms))
    check(`${name}/terms: the selling entity and its registry code are named`, (MOR_ENTITY[name] ?? /$^/).test(terms))
    check(`${name}/terms: Creem invoices the buyer in its own name`, (MOR_INVOICE[name] ?? /$^/).test(terms))
    check(`${name}/terms: the displayed price is stated not to include that tax`, (MOR_TAX[name] ?? /$^/).test(terms))
    check(`${name}/terms: refunds run through Creem on section 7's criteria`, (MOR_REFUND[name] ?? /$^/).test(terms))
    check(`${name}/terms: the service itself stays ours and Creem warrants none of it`, (MOR_SERVICE_OURS[name] ?? /$^/).test(terms))
    check(`${name}/terms: Creem's own Buyer Terms are linked for the buyer (3.8)`, (MOR_BUYER_TERMS[name] ?? /$^/).test(terms))
  }
  check('mutation control: Creem described as a payment processor rather than the seller is caught',
    !MOR_SELLER.en.test('Payments by card are processed for us by Creem, our payment provider, which handles the transaction.'))
  check('mutation control: a text that leaves out the selling entity is caught',
    !MOR_ENTITY.en.test('In such a payment the sale is made with Creem, which acts as the merchant of record.'))
  check('mutation control: a price presented as the final one is caught',
    !MOR_TAX.es.test('El precio que figura en la página de precios es el precio final, impuestos incluidos.'))
  check('mutation control: a refund promise detached from section 7 is caught',
    !MOR_REFUND.en.test('A refund on such a transaction is carried out by Creem alone, which decides it at its own discretion.'))
  check('mutation control: Creem presented as responsible for the service is caught',
    !MOR_SERVICE_OURS.en.test('Creem provides support for the service and warrants that it works as described.'))
}

// ── 27) What the displayed price includes, per currency ─────────────────
/*
 * Until 10 October 2026 the terms said nothing about whether a price includes
 * tax, which is the one thing a consumer reading a price needs to know. The
 * owner settled it that day: a shekel price includes Israeli VAT, and he
 * reports that VAT himself. So the terms now state it per currency, and the
 * two halves are checked separately because each protects against a different
 * mistake — claiming a dollar price is tax-inclusive when Creem adds tax on
 * top of it (Merchant Terms 9.1), and claiming a shekel price has tax added
 * when it does not, which would read as an undisclosed surcharge.
 *
 * The sentence is keyed to the CURRENCY, not to the language, because the
 * market is resolved per visitor: a Hebrew reader outside Israel sees dollars
 * and a Spanish reader in Israel sees shekels. components/public/pricing has
 * the same split, guarded in pricing-page.qa.ts section F.
 */
const PRICE_VAT_ILS: Record<string, RegExp> = {
  he: /מחיר הנקוב בשקלים כולל מע&rdquo;מ כדין בישראל/,
  en: /A price stated in shekels includes Israeli VAT as\s+required by law/,
  es: /Un precio indicado en s[ée]queles incluye el IVA israel[í i]/,
  'pt-BR': /Um pre[çc]o indicado em s[ée]queis inclui o IVA israelense/,
  fr: /Un prix indiqu[ée] en shekels comprend la TVA isra[ée]lienne/,
  it: /Un prezzo indicato in shekel comprende l'IVA israeliana/,
}
const PRICE_TAX_USD: Record<string, RegExp> = {
  he: /מחיר הנקוב בדולרים אינו כולל מס עקיף/,
  en: /A price stated in dollars does not include\s+indirect tax/,
  es: /Un precio indicado en d[óo]lares no incluye impuesto indirecto/,
  'pt-BR': /Um pre[çc]o indicado em d[óo]lares n[ãa]o inclui imposto indireto/,
  fr: /Un prix indiqu[ée] en dollars ne comprend pas de taxe indirecte/,
  it: /Un prezzo indicato in dollari non comprende l'imposta indiretta/,
}
{
  const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
  const enTermsSource = frontMatter(text[LOCALES[0]].terms).source
  const docs: [string, string][] = [
    ['he', read(HEBREW_TERMS)],
    ['en', enTermsSource ? read(enTermsSource) : ''],
    ...LOCALES.map((l): [string, string] => [l, text[l].terms]),
  ]
  for (const [name, terms] of docs) {
    check(`${name}/terms: the page was read`, terms.length > 0)
    check(`${name}/terms: a shekel price is stated to include Israeli VAT`, (PRICE_VAT_ILS[name] ?? /$^/).test(terms))
    check(`${name}/terms: a dollar price is stated NOT to include indirect tax`, (PRICE_TAX_USD[name] ?? /$^/).test(terms))
  }
  check('mutation control: a blanket "all prices include tax" is caught',
    !PRICE_TAX_USD.en.test('All prices stated in the Service include every applicable tax.'))
  check('mutation control: a shekel price presented as tax-exclusive is caught',
    !PRICE_VAT_ILS.es.test('Un precio indicado en séqueles no incluye el IVA, que se añade en el pago.'))
  check('mutation control: a text that settles neither currency is caught',
    !PRICE_VAT_ILS.en.test('Prices, plans and limits may change from time to time.')
    && !PRICE_TAX_USD.en.test('Prices, plans and limits may change from time to time.'))
}

// ── 28) What PDFShift keeps, and the code that makes the answer true ───
/*
 * PDFShift countersigned an Article 28 data processing agreement on 12 October
 * 2026 (Oren signed through BoldSign; the executed copy is in his mail). Until
 * then the privacy text said only that "retention at PDFShift is governed by
 * their own privacy policy and terms", which told a merchant nothing and aged
 * badly, because the vendor could change that policy without us noticing.
 *
 * The agreement replaces the deferral with a fact. Its Annex B: content sent
 * for conversion "are processed transiently in volatile memory for the
 * duration of the conversion request and are not intentionally written to
 * persistent storage", EXCEPT where the caller passes the optional `filename`
 * parameter — then the generated file sits on AWS S3 in Paris for up to two
 * days. Annex A puts PDFShift's servers in France (OVH, AWS) and its error
 * monitoring in the United States (Sentry, DPF / EU SCCs).
 *
 * So the published sentence is true only while our own callers leave that
 * parameter out, which is why B is a SOURCE check and not a text check. Both
 * callers currently send `source` and `landscape` alone. Adding `filename`
 * would be a reasonable-looking change — it gives the download a nicer name —
 * and it would silently turn a published promise into a false one. This guard
 * is the thing standing between those two facts.
 */
const PDFSHIFT_DPA: Record<string, RegExp> = {
  he: /הסכם עיבוד נתונים לפי סעיף 28/,
  en: /data processing agreement with PDFShift under Article 28/,
  es: /acuerdo de tratamiento de datos conforme al art[íi]culo 28/,
  'pt-BR': /acordo de tratamento de dados nos termos do artigo 28/,
  fr: /accord de traitement des donn[ée]es au titre de l'article 28/,
  it: /accordo sul trattamento dei dati ai sensi dell'articolo 28/,
}
const PDFSHIFT_NO_RETENTION: Record<string, RegExp> = {
  he: /מעובד\s+בזיכרון למשך ההמרה בלבד ואינו נשמר אצלם לאחריה/,
  en: /processed in memory for the duration of the conversion alone and is not\s+retained afterwards/,
  es: /se trata en memoria durante el tiempo de la conversi[óo]n y no se conserva despu[ée]s/,
  'pt-BR': /[ée] tratado em mem[óo]ria apenas durante a convers[ãa]o e n[ãa]o [ée] retido depois/,
  fr: /trait[ée] en m[ée]moire pendant la dur[ée]e de la conversion seulement et il n'est pas conserv[ée] ensuite/,
  it: /trattato in memoria per la durata della sola conversione e non [èe] conservato in seguito/,
}
const PDFSHIFT_STORAGE_DECLINED: Record<string, RegExp> = {
  he: /שמירה אופציונלית של הקובץ שנוצר,\s+ואנחנו לא מבקשים אותה/,
  en: /optional storage of the generated file, and we do not ask for\s+it/,
  es: /almacenamiento opcional del archivo generado, y nosotros no lo solicitamos/,
  'pt-BR': /armazenamento opcional do arquivo gerado, e n[óo]s n[ãa]o o solicitamos/,
  fr: /stockage facultatif du fichier produit, et nous ne le demandons pas/,
  it: /conservazione facoltativa del file prodotto, e noi non la chiediamo/,
}
{
  const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
  const enSource = frontMatter(text[LOCALES[0]].privacy).source
  const pages: [string, string][] = [
    ['he', read(HEBREW_PRIVACY)],
    ['en', enSource ? read(enSource) : ''],
    ...LOCALES.map((l): [string, string] => [l, text[l].privacy]),
  ]
  for (const [name, src] of pages) {
    check(`${name}/privacy: the page was read`, src.length > 0)
    check(`${name}/privacy: the Article 28 agreement with PDFShift is stated`, (PDFSHIFT_DPA[name] ?? /$^/).test(src))
    check(`${name}/privacy: the content is stated not to be retained after the conversion`,
      (PDFSHIFT_NO_RETENTION[name] ?? /$^/).test(src))
    check(`${name}/privacy: the optional storage is stated to be declined`,
      (PDFSHIFT_STORAGE_DECLINED[name] ?? /$^/).test(src))
    check(`${name}/privacy: the old "governed by their own policy" deferral is gone`,
      !/governed by their own privacy policy|כפופה למדיניות הפרטיות ולתנאי השימוש|se rige por su propia pol[íi]tica de privacidad|regida pela pol[íi]tica de privacidade e pelos termos dela|r[ée]gie par (sa|la) propre politique de confidentialit[ée]|regolata dalla sua propria informativa sulla privacy/.test(src))
  }

  /*
   * B) The code behind the sentence. Every caller of the conversion endpoint is
   * found by grepping for the endpoint itself, so a third caller added later is
   * covered without editing this list.
   */
  const CONVERT_ENDPOINT = 'api.pdfshift.io/v3/convert'
  const sources = ['app/api/reports/export-pdf/route.ts', 'lib/export/pdfshift.ts']
    .map((f): [string, string] => [f, read(f)])
  check('the known PDFShift callers were both read', sources.every(([, src]) => src.length > 0))
  for (const [f, src] of sources) {
    check(`${f}: still calls the conversion endpoint`, src.includes(CONVERT_ENDPOINT))
    check(`${f}: sends no filename parameter, so nothing is stored at PDFShift`, !/\bfilename\s*:/.test(stripComments(src)))
  }

  check('mutation control: a filename parameter in the payload is caught',
    /\bfilename\s*:/.test(stripComments('const payload = { source: html, filename: `report.pdf`, landscape: false }')))
  check('mutation control: a filename inside a comment is NOT counted',
    !/\bfilename\s*:/.test(stripComments('// filename: never send this, it turns on two-day storage\nconst p = { source: html }')))
  check('mutation control: a retention claim with no agreement behind it is caught',
    !PDFSHIFT_DPA.en.test('PDFShift does not keep the content of your reports.'))
  check('mutation control: the vendor-policy deferral is recognised as the old wording',
    /governed by their own privacy policy/.test('Retention at PDFShift is governed by their own privacy policy and terms.'))
}

// ── 29) Reviews on the Business Profile, and the two code facts behind it ──
/*
 * Until 12 October 2026 the privacy policy said, in all four languages, that
 * "we do not read or reply to reviews". The reviews feature makes that false,
 * so the text had to move BEFORE the code, which is why this section lands a
 * merge ahead of the feature and why the checks on the feature's own files are
 * written to tolerate their absence until it lands.
 *
 * Three claims are published and each one is a promise about code:
 *   1. No review content is stored. Verified on
 *      claude/project-thread-4052du-gbp-reviews: the migration adds two
 *      timestamptz columns to project_gbp_locations and creates no table, and
 *      lib/gbp/__qa__/gbp-reviews.qa.ts section G runs the handlers and then
 *      asserts the review text, the reviewer's name, our reply and the rating
 *      appear in no table.
 *   2. The reply is PUBLIC and Google may remove it. That one is not about our
 *      code at all; it is the fact a merchant most needs before pressing send,
 *      and the reason the terms now put the reply's content on them.
 *   3. The reviewer's name is never sent to the model. This is the one that
 *      earns a guard here rather than a reading. The draft path speaks to the
 *      Gemini Developer API with an API key, whose free tier may use prompt
 *      content, and a review's free text can carry special-category data on its
 *      own ("they treated my condition"). Dropping the name was a legal
 *      recommendation the feature took (patches/legal-gbp-reviews-answers-
 *      2026-10-12.md); nothing enforces it except that the draft's input type
 *      has no field for a name. If a field reappears, this fails.
 *
 * MUTATION CONTROLS at the end, including one proving the absence-tolerant
 * checks still catch a broken claim once the files exist.
 */
const REVIEWS_NO_STORAGE: Record<string, RegExp> = {
  he: /איננו שומרים אצלנו שום תוכן של ביקורת/,
  en: /We store no review content/,
  es: /No almacenamos ning[úu]n contenido de rese[ñn]as/,
  'pt-BR': /N[ãa]o armazenamos nenhum conte[úu]do de avalia[çc][ãa]o/,
  fr: /Nous ne stockons aucun contenu d'avis/,
  it: /Non conserviamo alcun contenuto di recensione/,
}
const REPLY_IS_PUBLIC: Record<string, RegExp> = {
  he: /והוא פומבי: הוא מופיע בכרטיס העסק שלך בגוגל וכל אדם יכול לראות אותו/,
  en: /and it is public: it appears on your Google business listing and\s+anyone can see it/,
  es: /y es p[úu]blica: aparece en la ficha de su negocio en Google y cualquier persona puede verla/,
  'pt-BR': /e ela [ée] p[úu]blica: aparece no perfil da sua empresa no Google e qualquer pessoa pode v[êe]-la/,
  fr: /et elle est publique : elle appara[îi]t sur la fiche de votre entreprise chez Google et n'importe qui peut la voir/,
  it: /ed [èe] pubblica: appare sulla scheda della Sua impresa presso Google e chiunque pu[òo] vederla/,
}
const GOOGLE_MAY_REMOVE: Record<string, RegExp> = {
  he: /עשויה להסיר מענה לפי מדיניות התוכן שלה/,
  en: /may remove a reply\s+under its own content policies/,
  es: /puede retirar una respuesta conforme a sus propias pol[íi]ticas de contenido/,
  'pt-BR': /pode remover uma resposta conforme as pr[óo]prias pol[íi]ticas de conte[úu]do/,
  fr: /peut retirer une r[ée]ponse conform[ée]ment [àa] ses propres politiques de contenu/,
  it: /pu[òo] rimuovere una risposta conformemente alle proprie politiche di contenuto/,
}
const NAME_NOT_SENT: Record<string, RegExp> = {
  he: /בלי שם המבקר/,
  en: /without the reviewer&rsquo;s name/,
  es: /sin el nombre del autor/,
  'pt-BR': /sem o nome de quem avaliou/,
  fr: /sans le nom de l'auteur/,
  it: /senza il nome dell'autore/,
}
const NO_LONGER_TRUE = /we do not read or reply to reviews|ואיננו\s+קוראים ביקורות או עונים עליהן|no leemos ni respondemos rese[ñn]as|n[ãa]o lemos nem respondemos avalia[çc][õo]es|nous ne lisons pas les avis et nous n'y r[ée]pondons pas|non leggiamo le recensioni e non vi rispondiamo/
{
  const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
  const enSource = frontMatter(text[LOCALES[0]].privacy).source
  const pages: [string, string][] = [
    ['he', read(HEBREW_PRIVACY)],
    ['en', enSource ? read(enSource) : ''],
    ...LOCALES.map((l): [string, string] => [l, text[l].privacy]),
  ]
  for (const [name, src] of pages) {
    check(`${name}/privacy: the page was read`, src.length > 0)
    check(`${name}/privacy: the old "we do not read reviews" sentence is gone`, !NO_LONGER_TRUE.test(src))
    check(`${name}/privacy: no review content is stated to be stored`, (REVIEWS_NO_STORAGE[name] ?? /$^/).test(src))
    check(`${name}/privacy: the reply is stated to be public`, (REPLY_IS_PUBLIC[name] ?? /$^/).test(src))
    check(`${name}/privacy: Google's power to remove a reply is disclosed`, (GOOGLE_MAY_REMOVE[name] ?? /$^/).test(src))
    check(`${name}/privacy: the reviewer's name is stated NOT to reach the model`, (NAME_NOT_SENT[name] ?? /$^/).test(src))
  }

  /* The terms put the reply's content on the merchant, in every language. */
  const LIABILITY: Record<string, RegExp> = {
    he: /האחריות לתוכן המענה היא שלכם/,
    en: /You are responsible for the content of the reply/,
    es: /Usted es responsable del contenido de la respuesta/,
    'pt-BR': /Voc[êe] [ée] respons[áa]vel pelo conte[úu]do da resposta/,
    fr: /Vous [êe]tes responsable du contenu de la r[ée]ponse/,
    it: /Lei [èe] responsabile del contenuto della risposta/,
  }
  const enTermsSource = frontMatter(text[LOCALES[0]].terms).source
  const termsDocs: [string, string][] = [
    ['he', read(HEBREW_TERMS)],
    ['en', enTermsSource ? read(enTermsSource) : ''],
    ...LOCALES.map((l): [string, string] => [l, text[l].terms]),
  ]
  for (const [name, src] of termsDocs) {
    check(`${name}/terms: the reply's content is put on the merchant`, (LIABILITY[name] ?? /$^/).test(src))
  }

  /*
   * The code behind claim 1 and claim 3. Both files arrive with the feature, so
   * each is checked only once it exists — and the "exists" line is itself a
   * check, so the day the feature lands these stop being no-ops and nobody has
   * to remember to come back here.
   */
  const DRAFT = 'lib/gbp/review-draft.ts'
  const MIGRATION = 'supabase/migrations/20261012120000_gbp_review_alerts.sql'
  const featureLanded = existsSync(DRAFT) && existsSync(MIGRATION)
  console.log(`  · the reviews feature ${featureLanded ? 'HAS landed; its code is checked below' : 'has NOT landed yet; its two code checks are waiting for it'}`)
  if (featureLanded) {
    const draft = stripComments(read(DRAFT))
    check(`${DRAFT}: the draft's input carries no reviewer name`, !/reviewerName|reviewer_name/.test(draft))
    const migration = stripComments(read(MIGRATION))
    check(`${MIGRATION}: adds the two timestamp columns and creates no table`,
      /ADD COLUMN IF NOT EXISTS reviews_seen_update_time timestamptz/.test(migration)
      && /ADD COLUMN IF NOT EXISTS reviews_alerted_at\s+timestamptz/.test(migration)
      && !/CREATE TABLE/i.test(migration))
    /*
     * stripComments understands JavaScript, so a `-- …` line in SQL survives it,
     * and `COMMENT ON COLUMN` is SQL's own way of documenting a column: a
     * migration that explains in prose what it deliberately does NOT store used
     * to trip this check on the words it was promising to avoid. Both kinds of
     * documentation are dropped first. A column actually NAMED comment still
     * arrives as `ADD COLUMN ... comment`, which the pattern still catches, and
     * the second mutation control below holds that line.
     */
    const columns = migration
      .replace(/COMMENT\s+ON\s[\s\S]*?;/gi, '')
      .replace(/--[^\n]*/g, '')
    check(`${MIGRATION}: stores no review text column`, !/comment|review_text|reviewer|rating|stars/i.test(columns))
  }

  check('mutation control: the sentence that is no longer true is recognised',
    NO_LONGER_TRUE.test('We do not change your business information and we do not read or reply to reviews.'))
  check('mutation control: a storage claim with no "no content" promise is caught',
    !REVIEWS_NO_STORAGE.en.test('We read your reviews and keep them for your records.'))
  check('mutation control: a reply described without its publicity is caught',
    !REPLY_IS_PUBLIC.en.test('A reply is published in your name only after you pressed send.'))
  check('mutation control: a reviewer name back in the draft input would be caught',
    /reviewerName|reviewer_name/.test(stripComments('export interface ReviewDraftSource { reviewerName: string | null }')))
  check('mutation control: a migration that adds a review-text column is caught',
    /comment|review_text|reviewer|rating|stars/i.test(stripComments('ALTER TABLE x ADD COLUMN review_text text;')))
  check('mutation control: dropping SQL documentation does not hide a column named comment',
    /comment|review_text|reviewer|rating|stars/i.test(
      stripComments("-- we keep no rating\nCOMMENT ON COLUMN x.y IS 'documented';\nALTER TABLE x ADD COLUMN comment text;")
        .replace(/COMMENT\s+ON\s[\s\S]*?;/gi, '')
        .replace(/--[^\n]*/g, '')))
}

// ── 30) Automatic posting to the Business Profile, published before its code ──
/*
 * Until 12 October 2026 the privacy policy said, in all four languages, that
 * "we create a post only when you press publish, or at the time you scheduled
 * it" and that "a draft is never published until you review it". Automatic
 * posting (claude/project-thread-4052du-gbp-autopost) makes both false for an
 * account that turned the switch on: an article that publishes to the owner's
 * site also goes up on their business listing with NOBODY reading it first.
 *
 * The replacement text is deliberately conditional on the switch, so it is true
 * both before the feature exists and after — which is what lets this land ahead
 * of the code, as section 29 does. Four claims are pinned:
 *   1. Off by default. A promise about the column's default, checked below.
 *   2. Published without the owner reading it. The sentence that makes the terms
 *      clause fair, and the one a merchant would otherwise be ambushed by.
 *   3. Nothing but the business name and the article's own title and summary
 *      reaches the model — no person's name, ever.
 *   4. The switch turns itself off when the project moves to a different
 *      business, because the approval was given for the business they picked.
 * The terms carry the matching clause: content published in the owner's name is
 * the owner's responsibility even where no human read it first.
 *
 * SETTLED, and recorded here because it was nearly a reason to stop the feature:
 * lib/gbp/draft.ts used to say in its own header that Google rejects
 * "auto-generated" posts, citing a research note absent from this repo. That
 * would have meant the feature risked the merchant's listing, so it was raised
 * with the feature thread (patches/legal-gbp-auto-post-answers-2026-10-12.md).
 * They read Google's own pages on 12 October 2026 — the posts content policy
 * (business/answer/7213077), the policy overview (business/answer/13762416) and
 * the prohibited-and-restricted-content policy (contributionpolicy/answer/
 * 7400114) — and none names a rule about automatically, machine- or AI-generated
 * content; what is prohibited and does touch this is "posting the same content
 * multiple times", which uq_gbp_posts_auto_article prevents. The comment was
 * wrong, not the feature, and they corrected it. support.google.com does not
 * resolve from THIS session, so that reading is theirs and was not re-read here.
 * It stays out of the checks below: no sentence we publish depends on it.
 */
const AUTO_POST_OPT_IN: Record<string, RegExp> = {
  he: /ברירת המחדל היא כבוי/,
  en: /off by default/,
  es: /desactivada por defecto/,
  'pt-BR': /desativada por padr[ãa]o/,
  fr: /d[ée]sactiv[ée]e par d[ée]faut/,
  it: /disattivata per impostazione predefinita/,
}
const AUTO_POST_NO_READ: Record<string, RegExp> = {
  he: /בלי שתקרא אותו לפני הפרסום/,
  en: /without you reading\s+it first/,
  es: /sin que usted lo lea antes/,
  'pt-BR': /sem que voc[êe] o leia antes/,
  fr: /sans que vous le lisiez avant/,
  it: /senza che Lei lo legga prima/,
}
const AUTO_POST_NO_PERSON: Record<string, RegExp> = {
  he: /בלי שום שם של אדם/,
  en: /with no person&rsquo;s name/,
  es: /sin ning[úu]n nombre de persona/,
  'pt-BR': /sem nenhum nome de pessoa/,
  fr: /sans aucun nom de personne/,
  it: /senza alcun nome di persona/,
}
/*
 * The post's language. This started as the opposite claim: the column allowed he
 * and en only, so a Spanish project's article would have gone out in English on
 * a Spanish business's listing, and the first version of this text said such a
 * project gets no post at all. Oren rejected the limit on 12 October ("what is
 * the problem with the post being in Spanish or Portuguese? that is what we do
 * with the articles"), the feature widened the column's CHECK to all four app
 * languages and dropped the skip, and the sentence now says the simple true
 * thing. The two code checks below are what stops it drifting back.
 */
const AUTO_POST_LANGUAGE: Record<string, RegExp> = {
  he: /פוסט אוטומטי נכתב בשפת הפרויקט/,
  en: /An automatic post is written in the project&rsquo;s language/,
  es: /Una publicaci[óo]n autom[áa]tica se redacta en el idioma del proyecto/,
  'pt-BR': /Uma postagem autom[áa]tica [ée] escrita no idioma do projeto/,
  fr: /Une publication automatique est r[ée]dig[ée]e dans la langue du projet/,
  it: /Una pubblicazione automatica [èe] redatta nella lingua del progetto/,
}
const AUTO_POST_SELF_OFF: Record<string, RegExp> = {
  he: /נכבית מעצמה אם החלפת/,
  en: /turns itself off if you\s+change the business/,
  es: /se desactiva por s[íi] sola si usted cambia el negocio/,
  'pt-BR': /se desativa por conta pr[óo]pria se voc[êe] trocar a empresa/,
  fr: /elle se d[ée]sactive d'elle-m[êe]me si vous changez l'entreprise/,
  it: /essa si disattiva da s[ée] se Lei cambia l'impresa/,
}
/* The two absolutes the feature contradicts. Either one surviving is a lie. */
const AUTO_POST_NO_LONGER_TRUE = /we create a post only when you press publish|אנו יוצרים פוסט רק כשאתה לוחץ על פרסום|creamos una publicaci[óo]n [úu]nicamente cuando usted pulsa publicar|criamos uma postagem somente quando voc[êe] clica em publicar|draft is never published|טיוטה לעולם אינה מתפרסמת|Un borrador nunca se publica|Um rascunho nunca [ée] publicado|[Nn]ous cr[ée]ons un post uniquement lorsque vous cliquez sur publier|Un brouillon n'est jamais publi[ée]|creiamo un post (unicamente|soltanto) quando Lei fa clic su pubblica|Una bozza non [èe] mai pubblicata/
{
  const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
  const enSource = frontMatter(text[LOCALES[0]].privacy).source
  const pages: [string, string][] = [
    ['he', read(HEBREW_PRIVACY)],
    ['en', enSource ? read(enSource) : ''],
    ...LOCALES.map((l): [string, string] => [l, text[l].privacy]),
  ]
  for (const [name, src] of pages) {
    check(`${name}/privacy: the page was read`, src.length > 0)
    check(`${name}/privacy: neither absolute about posting survives`, !AUTO_POST_NO_LONGER_TRUE.test(src))
    check(`${name}/privacy: automatic posting is stated to be off by default`, (AUTO_POST_OPT_IN[name] ?? /$^/).test(src))
    check(`${name}/privacy: it is stated to publish without the owner reading it`, (AUTO_POST_NO_READ[name] ?? /$^/).test(src))
    check(`${name}/privacy: no person's name is stated to reach the model`, (AUTO_POST_NO_PERSON[name] ?? /$^/).test(src))
    check(`${name}/privacy: the two languages a post can go out in are stated`, (AUTO_POST_LANGUAGE[name] ?? /$^/).test(src))
    check(`${name}/privacy: the switch is stated to turn itself off on a business change`, (AUTO_POST_SELF_OFF[name] ?? /$^/).test(src))
  }

  const AUTO_LIABILITY: Record<string, RegExp> = {
    he: /האחריות לתוכן שמתפרסם בשמכם היא שלכם/,
    en: /You are responsible for the\s+content published in your name/,
    es: /Usted es responsable del contenido publicado en su nombre/,
    'pt-BR': /Voc[êe] [ée] respons[áa]vel pelo conte[úu]do publicado em seu nome/,
    fr: /Vous [êe]tes responsable du contenu publi[ée] en votre nom/,
    it: /Lei [èe] responsabile del contenuto pubblicato a Suo nome/,
  }
  const enTermsSource = frontMatter(text[LOCALES[0]].terms).source
  const termsDocs: [string, string][] = [
    ['he', read(HEBREW_TERMS)],
    ['en', enTermsSource ? read(enTermsSource) : ''],
    ...LOCALES.map((l): [string, string] => [l, text[l].terms]),
  ]
  for (const [name, src] of termsDocs) {
    check(`${name}/terms: content published automatically is put on the merchant`, (AUTO_LIABILITY[name] ?? /$^/).test(src))
  }

  /*
   * The code behind claims 1, 3 and 4. The migration arrives with the feature,
   * so it gates the lot and the "has it landed" line is itself printed, as in
   * section 29: the day the feature merges these stop being no-ops by
   * themselves.
   */
  const AUTO_MIGRATION = 'supabase/migrations/20261012180000_gbp_auto_post.sql'
  const STORE = 'lib/gbp/store.ts'
  const DRAFT_SRC = 'lib/gbp/draft.ts'
  const ENQUEUE = 'lib/gbp/auto-post.ts'
  const autoLanded = existsSync(AUTO_MIGRATION)
  console.log(`  · automatic posting ${autoLanded ? 'HAS landed; its code is checked below' : 'has NOT landed yet; its six code checks are waiting for it'}`)
  if (autoLanded) {
    const migration = stripComments(read(AUTO_MIGRATION))
    check(`${AUTO_MIGRATION}: the switch defaults to off`,
      /auto_post_on_publish\s+boolean\s+NOT NULL\s+DEFAULT false/i.test(migration))
    /*
     * When the owner turned it on. Asked for on 12 October 2026 because we are
     * the ones publishing in their name with no person reading it, so something
     * has to answer "I never approved this"; the CHECK is what stops a stale
     * timestamp sitting on a switch that is off.
     */
    check(`${AUTO_MIGRATION}: when the switch was turned on is recorded, and only while it is on`,
      /ADD COLUMN IF NOT EXISTS auto_post_enabled_at timestamptz/.test(migration)
      && /CHECK \(auto_post_on_publish OR auto_post_enabled_at IS NULL\)/.test(migration))
    check(`${AUTO_MIGRATION}: a post may carry any of the four app languages`,
      /CHECK \(language_code IN \('he', 'en', 'es', 'pt-BR'\)\)/.test(migration))
    const enqueue = stripComments(read(ENQUEUE))
    check(`${ENQUEUE}: no project is skipped for its language`,
      !/language_unsupported/.test(enqueue))
    const store = stripComments(read(STORE))
    check(`${STORE}: moving the project to another business clears the switch`,
      /auto_post_on_publish:\s*false/.test(store))
    const draft = stripComments(read(DRAFT_SRC))
    const sourceType = /interface DraftSource \{[\s\S]*?\n\}/.exec(draft)?.[0] ?? ''
    check(`${DRAFT_SRC}: the post draft's input carries no person's name`,
      sourceType.length > 0 && !/reviewerName|customerName|userName|authorName|ownerName|email/i.test(sourceType))
  }

  check('mutation control: the old "only when you press publish" sentence is recognised',
    AUTO_POST_NO_LONGER_TRUE.test('we create a post only when you press publish, or at the time you scheduled it'))
  check('mutation control: the old "a draft is never published" absolute is recognised',
    AUTO_POST_NO_LONGER_TRUE.test('A draft is never published until you review it and press publish.'))
  check('mutation control: automatic posting described without "off by default" is caught',
    !AUTO_POST_OPT_IN.en.test('Automatic posting: every article is also published as a post.'))
  check('mutation control: a post language narrowed back to two is caught',
    !AUTO_POST_LANGUAGE.en.test('An automatic post goes out in Hebrew or English only.'))
  check('mutation control: a CHECK narrowed back to two languages is caught',
    !/CHECK \(language_code IN \('he', 'en', 'es', 'pt-BR'\)\)/.test(
      "ADD CONSTRAINT gbp_posts_language CHECK (language_code IN ('he', 'en'))"))
  check('mutation control: a consent timestamp with no CHECK behind it would be caught',
    !/CHECK \(auto_post_on_publish OR auto_post_enabled_at IS NULL\)/.test(
      'ALTER TABLE x ADD COLUMN IF NOT EXISTS auto_post_enabled_at timestamptz;'))
  check('mutation control: a switch defaulting to true would be caught',
    !/auto_post_on_publish\s+boolean\s+NOT NULL\s+DEFAULT false/i.test('ADD COLUMN auto_post_on_publish boolean NOT NULL DEFAULT true'))
  check("mutation control: a person's name back in the draft input would be caught",
    /reviewerName|customerName|userName|authorName|ownerName|email/i.test(
      stripComments('export interface DraftSource { businessName: string | null; customerName: string }')))
}

/*
 * 31. THE PROSPECT RECORD BEHIND THE OUTBOUND EMAILS, AND HOW LONG IT LIVES.
 *
 * Until 12 October 2026 the published section said what we collect for a cold
 * email and nothing about keeping it, because nothing was kept: the list lived
 * in a file. The outreach thread then built public.outreach_prospects, a stored
 * record per business, and asked whether the text owed anything. It owed three
 * things, and two of them were a published sentence being made false:
 *
 *   1. "we do not collect details about a private individual" against a
 *      contact_name column. In a one-person business the person and the business
 *      are the same human, and that is exactly who this channel writes to. The
 *      sentence is now narrowed to the business role someone is published in,
 *      which is what we actually take; the old absolute is refused below, in all
 *      four languages, so it cannot come back in a rewrite.
 *   2. postal_address was collected and not disclosed at all.
 *   3. A retention period. CPRA s.1798.100(a)(3) makes the notice at collection
 *      state how long each category is kept, or the criterion used, and
 *      "as long as necessary" is the formula California regulators reject. The
 *      thread confirmed on 12 October that NOTHING in the code set redacted_at:
 *      the column existed so a deletion request had somewhere to land, and a row
 *      would otherwise have sat with the address and the name in it forever. So
 *      this was a gap in the code, not in the wording, and the rule it is now
 *      built to is the one the text states: 30 days after the last message
 *      (or after a reply or an opt-out, whichever is later) the address, the
 *      contact name and the postal address go; a record never written to is
 *      deleted whole at 90 days. 30 is not a round number anyone liked — the
 *      unsubscribe link resolves against this row and CAN-SPAM makes it work for
 *      at least 30 days after a message, so nothing shorter is possible.
 *
 * The code checks are gated on the migration, as in sections 29 and 30: they are
 * no-ops until the table lands and bind the day it does. Two of them are the
 * ones that matter most. The column list is frozen against the disclosed field
 * set, so a column added later fails this suite instead of quietly turning the
 * text into an incomplete list; and the sweep is REQUIRED to exist once the table
 * does, because a published period with no code behind it is the worse of the two
 * states we were in. The sweep is found by scanning the outreach sources for
 * redacted_at rather than by a path, since the path is theirs to choose; a file
 * that merely reads the column satisfies the first check, which is why the
 * periods and the two extra columns are checked separately.
 */
const OUTREACH_CONTACT_NAME: Record<string, RegExp> = {
  he: /שם איש הקשר כאשר האתר/,
  en: /the name of the contact person where the site publishes one/,
  es: /el nombre de la persona de contacto cuando el sitio lo publica/,
  'pt-BR': /o nome da pessoa de contato quando o site o publica/,
  fr: /le nom de la personne de contact lorsque le site le publie/,
  it: /il nome della persona di contatto quando il sito lo pubblica/,
}
const OUTREACH_POSTAL: Record<string, RegExp> = {
  he: /כתובת הדואר שהעסק מפרסם/,
  en: /the postal address the business publishes/,
  es: /la direcci[óo]n postal que la empresa publica/,
  'pt-BR': /o endere[çc]o postal que a empresa publica/,
  fr: /l'adresse postale que l'entreprise publie/,
  it: /l'indirizzo postale che l'impresa pubblica/,
}
const OUTREACH_PERSON_NARROW: Record<string, RegExp> = {
  he: /איננו אוספים על אדם שום דבר מעבר לתפקיד העסקי שבו הוא מפורסם/,
  en: /we collect nothing about a person\s+beyond the business role they are published in/,
  es: /no recogemos nada sobre una persona m[áa]s all[áa] del cargo con el que aparece publicada/,
  'pt-BR': /n[ãa]o coletamos nada sobre uma pessoa al[ée]m do cargo com que ela aparece publicada/,
  fr: /nous ne collectons rien sur une personne au-del[àa] de la fonction professionnelle sous laquelle elle est publi[ée]e/,
  it: /non raccogliamo nulla su una persona al di l[àa] della funzione professionale con la quale essa [èe] pubblicata/,
}
const OUTREACH_ERASE_30: Record<string, RegExp> = {
  he: /30 יום אחרי ההודעה האחרונה ששלחנו לה/,
  en: /erased 30 days after the last message we\s+sent it/,
  es: /30 d[í i]as despu[ée]s del [úu]ltimo mensaje que le enviamos/,
  'pt-BR': /30 dias depois da [úu]ltima mensagem que enviamos a ele/,
  fr: /sont effac[ée]s 30 jours apr[èe]s le dernier message que nous lui avons envoy[ée]/,
  it: /sono cancellati 30 giorni dopo l'ultimo messaggio che le abbiamo inviato/,
}
const OUTREACH_DELETE_90: Record<string, RegExp> = {
  he: /נמחקת כולה 90 יום אחרי שנוספה/,
  en: /deleted outright 90 days after it was added/,
  es: /se elimina por completo 90 d[í i]as despu[ée]s de haberse a[ñn]adido/,
  'pt-BR': /[ée] exclu[í i]do por inteiro 90 dias depois de ter sido adicionado/,
  fr: /est supprim[ée] en totalit[ée] 90 jours apr[èe]s avoir [ée]t[ée] ajout[ée]/,
  it: /[èe] cancellata per intero 90 giorni dopo essere stata aggiunta/,
}
/* The absolute the contact_name column made false. Any language keeping it is a lie. */
const OUTREACH_NO_LONGER_TRUE = /we\s+do not collect details about a private individual|איננו\s+אוספים פרטים על אדם פרטי|no recogemos datos sobre una persona privada|n[ãa]o coletamos dados sobre uma pessoa privada|nous ne collectons pas de donn[ée]es sur une personne priv[ée]e|non raccogliamo dati su una persona privata/
{
  const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
  const enSource = frontMatter(text[LOCALES[0]].privacy).source
  const pages: [string, string][] = [
    ['he', read(HEBREW_PRIVACY)],
    ['en', enSource ? read(enSource) : ''],
    ...LOCALES.map((l): [string, string] => [l, text[l].privacy]),
  ]
  for (const [name, src] of pages) {
    check(`${name}/privacy: the page was read`, src.length > 0)
    check(`${name}/privacy: the broad "nothing about a private individual" claim is gone`,
      !OUTREACH_NO_LONGER_TRUE.test(src))
    check(`${name}/privacy: the contact person's name is disclosed as collected`,
      (OUTREACH_CONTACT_NAME[name] ?? /$^/).test(src))
    check(`${name}/privacy: the postal address is disclosed as collected`,
      (OUTREACH_POSTAL[name] ?? /$^/).test(src))
    check(`${name}/privacy: what we take about a person is narrowed to their business role`,
      (OUTREACH_PERSON_NARROW[name] ?? /$^/).test(src))
    check(`${name}/privacy: the 30-day erasure after the last message is stated`,
      (OUTREACH_ERASE_30[name] ?? /$^/).test(src))
    check(`${name}/privacy: the 90-day deletion of a record never written to is stated`,
      (OUTREACH_DELETE_90[name] ?? /$^/).test(src))
  }

  const PROSPECTS_MIGRATION = 'supabase/migrations/20261012170000_outreach_prospects.sql'
  const prospectsLanded = existsSync(PROSPECTS_MIGRATION)
  console.log(`  · the prospect record ${prospectsLanded ? 'HAS landed; its code is checked below' : 'has NOT landed yet; its code checks are waiting for it'}`)
  if (prospectsLanded) {
    const migration = read(PROSPECTS_MIGRATION)
    check(`${PROSPECTS_MIGRATION}: the United States promise is a database rule`,
      /CHECK \(country = 'US'\)/.test(migration))
    check(`${PROSPECTS_MIGRATION}: the postal address can be erased`,
      !/postal_address\s+text\s+NOT NULL/.test(migration))
    /*
     * The three facts, not one constraint: the outreach thread expressed them as
     * two CHECKs (outreach_prospects_redaction and ..._redaction_name) and may
     * express them as three, so this asks the migration whether a redacted row
     * can hold each column rather than how the author grouped them.
     */
    const checks = migration.replace(/^\s*--.*$/gm, '')
    check(`${PROSPECTS_MIGRATION}: a redacted row holds no address, no contact name and no postal address`,
      /email IS NULL/.test(checks) && /contact_name IS NULL/.test(checks) && /postal_address IS NULL/.test(checks))
    const body = /CREATE TABLE IF NOT EXISTS public\.outreach_prospects \(([\s\S]*?)\n\);/.exec(migration)?.[1] ?? ''
    const columns = [...body.matchAll(/^ {2}([a-z_]+)\s+(uuid|text|timestamptz|boolean|integer|jsonb)/gm)].map((m) => m[1])
    const DISCLOSED = new Set([
      'id', 'email', 'email_hash', 'unsub_token', 'company', 'contact_name', 'site_host',
      'platform', 'country', 'postal_address', 'source_site', 'source_second', 'status',
      'finding', 'finding_checked', 'first_sent_at', 'second_sent_at', 'replied_at',
      'redacted_at', 'note', 'created_at', 'updated_at',
    ])
    const undisclosed = columns.filter((c) => !DISCLOSED.has(c))
    check(`${PROSPECTS_MIGRATION}: the record holds nothing the published text does not list`,
      columns.length > 0 && undisclosed.length === 0, undisclosed.join(', ') || 'no columns parsed')

    const walk = (dir: string): string[] =>
      existsSync(dir)
        ? readdirSync(dir).flatMap((n) => {
            const f = `${dir}/${n}`
            return statSync(f).isDirectory() ? walk(f) : [f]
          })
        : []
    const outreachSources = [...walk('lib/outreach'), ...walk('app/api/outreach')]
      .filter((f) => f.endsWith('.ts') && !f.includes('__qa__'))
    const sweepFiles = outreachSources.filter((f) => /redacted_at/.test(read(f)))
    check('a retention sweep exists in the outreach code',
      sweepFiles.length > 0, `scanned ${outreachSources.length} files`)
    const sweep = sweepFiles.map(read).join('\n')
    check('the sweep carries both published periods',
      /\b30\b/.test(sweep) && /\b90\b/.test(sweep))
    check('the sweep erases the contact name and the postal address, not only the address',
      /contact_name/.test(sweep) && /postal_address/.test(sweep))
  }

  check('mutation control: the old "private individual" absolute is recognised',
    OUTREACH_NO_LONGER_TRUE.test('We do not collect a phone number, we do not collect details about a private individual, and'))
  check('mutation control: the narrowed sentence does not match the old absolute',
    !OUTREACH_PERSON_NARROW.en.test('we do not collect details about a private individual'))
  check('mutation control: a text giving only the 90-day rule is caught',
    !OUTREACH_ERASE_30.en.test('A record we never wrote to is deleted outright 90 days after it was added.'))
  check('mutation control: an undisclosed column would be caught',
    [...'  phone_number      text NOT NULL'.matchAll(/^ {2}([a-z_]+)\s+(uuid|text|timestamptz|boolean|integer|jsonb)/gm)]
      .map((m) => m[1]).filter((c) => c !== 'id').length === 1)
  check('mutation control: a postal address that cannot be erased would be caught',
    /postal_address\s+text\s+NOT NULL/.test('  postal_address    text NOT NULL,'))
  check('mutation control: a redaction rule naming only the address would be caught',
    !/contact_name IS NULL/.test("CONSTRAINT outreach_prospects_redaction CHECK ((email IS NULL) = (redacted_at IS NOT NULL))"))
}

// ── 32) the sender identity in the emails we send customers ─────────────────
// Oren, 2026-10-13: the company name belongs in the emails that go to
// customers, not only on the legal pages. Israel's Communications Law
// s.30A(d)(2) wants an advertising message to name its sender and give an
// address, and the three email families below (reminders, setup emails, the
// weekly summary) all carry one shared footer line per language. Hebrew names
// the Hebrew company; every other language names the English one.
{
  const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
  const COPY: Array<[string, string, RegExp]> = [
    ['he', 'lib/i18n/dashboard/he.ts', /גו טופ שיווק ופרסום דיגיטלי בע״מ \(ח\.פ\. 517274346\)/],
    ['en', 'lib/i18n/dashboard/en.ts', new RegExp(`${REGISTERED} \\(company number 517274346\\)`)],
    ['es', 'lib/i18n/dashboard/es.ts', new RegExp(`${REGISTERED} \\(n\\.º de empresa 517274346\\)`)],
    ['pt-BR', 'lib/i18n/dashboard/pt-BR/tracking.ts', new RegExp(`${REGISTERED} \\(número de sociedade 517274346\\)`)],
  ]
  for (const [locale, path, named] of COPY) {
    const src = read(path)
    const lines = [...src.matchAll(/company: '([^']*)'/g)].map((m) => m[1])
    check(`${locale}: all three customer email footers share one identity line`,
      lines.length === 3 && new Set(lines).size === 1, `${lines.length} line(s)`)
    check(`${locale}: the email footer names the company and its number`,
      lines.length > 0 && lines.every((l) => named.test(l)), lines[0])
    check(`${locale}: the email footer gives the registered address`,
      lines.every((l) => /(הרכסים 24\/2, רמת גן 5235524|HaRechasim 24\/2, Ramat Gan 5235524, Israel)/.test(l)))
    check(`${locale}: the email footer does not carry the superseded name`,
      lines.every((l) => !SUPERSEDED_NAME.test(l)))
  }
  check('mutation control: a brand-only footer line is caught',
    !new RegExp(`${REGISTERED}`).test('Go Top SEO · oren@gotop.co.il'))
  check('mutation control: a footer with no address is caught',
    !/(הרכסים 24\/2, רמת גן 5235524|HaRechasim 24\/2, Ramat Gan 5235524, Israel)/
      .test(`${REGISTERED} (company number 517274346) · oren@gotop.co.il`))
}

// ── 33) an AI photo for a Business Profile post ─────────────────────────────
/*
 * The UX/build thread added a "create a photo" button to the Maps post composer
 * (topic posts only): one generic, unbranded, photorealistic image from the same
 * Gemini image pipeline that makes article featured images, shown to the merchant
 * and published only when they press publish themselves.
 *
 * What made this worth text of its own is NOT that the image is AI-made. Google's
 * posts content policy names no rule about machine- or AI-generated content —
 * section 30 records that reading, and support.google.com still does not resolve
 * from this session, so it was not re-read here. What does bite is accuracy: the
 * policy overview (business/answer/13762416) and the prohibited-content policy
 * require content on a listing to represent the location and the product as they
 * actually are, and Google's photo guidance (business/answer/6123536, read
 * through search snippets on 16 October 2026) asks for photos that represent
 * reality and warns against excessive use of AI. A photorealistic image that a
 * customer takes for a photo of THIS bakery's counter is therefore the merchant's
 * exposure twice over: Google can remove the content or restrict the listing, and
 * in Israel a misleading image of a good or service is consumer deception under
 * the Consumer Protection Law.
 *
 * So the terms, in all four languages, pin five claims:
 *   1. the photo is AI-made;
 *   2. it is NOT a photograph of their business, premises, staff or real product;
 *   3. it is published only after they choose it and press publish, in their name;
 *   4. the responsibility for it is theirs, Google's content and photo policies
 *      included, and a misleading photo risks the content or the listing;
 *   5. the file carries Google's own SynthID and C2PA markers, so "nobody can
 *      tell" is not a defence anyone should rely on.
 * The privacy policy adds the data fact, which is favourable and verified in
 * lib/gbp/topic-image.ts: only the topic goes to the model — no business name,
 * no person's name — and nothing is stored before the merchant publishes.
 */
const AI_PHOTO_NOT_YOUR_BUSINESS: Record<string, RegExp> = {
  he: /ואינה צילום של העסק שלכם, של המקום, של העובדים\s*או של מוצר ממשי שלכם/,
  en: /it is not a\s*photograph of your business, your premises, your staff or an actual product of yours/,
  es: /no es una fotograf[íi]a de su negocio, de su local, de su personal ni de un producto real suyo/,
  'pt-BR': /n[ãa]o [ée] uma fotografia da sua empresa, do seu estabelecimento, da sua equipe nem de um produto real seu/,
  fr: /ce n'est pas une photographie de votre entreprise, de vos locaux, de votre personnel ni d'un produit r[ée]el qui serait le v[ôo]tre/,
  it: /non [èe] una fotografia della Sua attivit[àa], dei Suoi locali, del Suo personale n[ée] di un prodotto reale che sia Suo/,
}
const AI_PHOTO_YOUR_RESPONSIBILITY: Record<string, RegExp> = {
  he: /האחריות לתמונה שמתפרסמת בשמכם היא\s*שלכם/,
  en: /You are\s*responsible for the photo published in your name/,
  es: /Usted es responsable de la foto publicada en su nombre/,
  'pt-BR': /Voc[êe] é responsável pela foto publicada em seu nome/,
  fr: /Vous [êe]tes responsable de la photo publi[ée]e en votre nom/,
  it: /Lei [èe] responsabile della foto pubblicata a Suo nome/,
}
const AI_PHOTO_LISTING_RISK: Record<string, RegExp> = {
  he: /עלולה להביא להסרת התוכן או להגבלת הכרטיס בידי\s*Google/,
  en: /can lead Google to remove the content or restrict the listing/,
  es: /puede llevar a Google a retirar el contenido o a restringir la ficha/,
  'pt-BR': /pode levar o Google a remover o conte[úu]do ou a restringir o perfil/,
  fr: /peut conduire Google [àa] retirer le contenu ou [àa] restreindre la fiche/,
  it: /pu[òo] condurre Google a rimuovere il contenuto o a limitare la scheda/,
}
const AI_PHOTO_MARKERS: Record<string, RegExp> = {
  he: /SynthID ו-C2PA/,
  en: /SynthID and C2PA/,
  es: /SynthID y C2PA/,
  'pt-BR': /SynthID e C2PA/,
  fr: /SynthID et C2PA/,
  it: /SynthID e C2PA/,
}
const AI_PHOTO_NO_BUSINESS_NAME: Record<string, RegExp> = {
  he: /בלי שם העסק ובלי שם של אדם/,
  en: /without the business name and\s*without any person&rsquo;s name/,
  es: /sin el nombre del negocio y sin el nombre de ninguna persona/,
  'pt-BR': /sem o nome da empresa e sem o nome de nenhuma pessoa/,
  fr: /sans le nom de l'entreprise et sans le nom d'aucune personne/,
  it: /senza il nome dell'impresa e senza il nome di alcuna persona/,
}
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
    check(`${name}/terms: the AI photo is not presented as a photograph of the business`, AI_PHOTO_NOT_YOUR_BUSINESS[name]!.test(terms))
    check(`${name}/terms: the photo published in the merchant's name is the merchant's responsibility`, AI_PHOTO_YOUR_RESPONSIBILITY[name]!.test(terms))
    check(`${name}/terms: a misleading photo is named as a risk to the content and the listing`, AI_PHOTO_LISTING_RISK[name]!.test(terms))
    check(`${name}/terms: the file's AI markers are disclosed`, AI_PHOTO_MARKERS[name]!.test(terms))
    check(`${name}/privacy: only the topic reaches the model, with no business or person name`, AI_PHOTO_NO_BUSINESS_NAME[name]!.test(privacy))
  }
  // The favourable data claim has to stay true in the code that makes the image.
  const gen = read('lib/gbp/topic-image.ts')
  if (gen) {
    check('the generator sends no business name to the model', !/businessName/.test(gen))
    check('the generator stores nothing itself', !/upload\(|storage\./.test(gen))
  }
  check('mutation control: a clause that calls it a photo of the business is caught',
    !AI_PHOTO_NOT_YOUR_BUSINESS.en.test('It is a photograph of your business, taken by AI.'))
  check('mutation control: a clause with no listing risk is caught',
    !AI_PHOTO_LISTING_RISK.en.test('A misleading photo is not a good idea.'))
}

// ── 34) a purchase made through an external marketplace ────────────────────
/*
 * Oren is opening accounts on affiliate marketplaces (the affiliates thread is
 * building a shared intake layer behind per-platform off switches, with sales
 * pages under /go/<platform>). Two of the candidates, ClickBank and Digistore24,
 * are merchants of record: they sell the plan in their own name, they charge the
 * buyer, they issue the invoice, and they operate their own refund windows —
 * Digistore24 and ClickBank both run buyer-facing refund policies that are far
 * wider than ours, and either can refund a transaction at its own discretion.
 *
 * Section 4 of our refund policy says a paid period is not refunded. That rule
 * is the owner's own decision and is not softened here. But on a purchase we did
 * not sell, section 4 is not the rule the buyer is owed: the seller's is. Leaving
 * section 4 as the only statement on the page would be a narrower promise than
 * the buyer actually holds, which in Israel is a misleading omission under the
 * Consumer Protection Law and in the EU an unfair term under 93/13/EEC, since a
 * consumer may not be told they have less than the law and the actual seller give
 * them.
 *
 * So each refund policy carries one conditional section, numbered after the
 * Shopify section so no existing number shifts (6A in he/en/es, 7A in pt-BR,
 * whose Art. 49 section sits earlier). It names no platform, so it is true both
 * before any marketplace is live and after, and it pins four claims:
 *   1. the marketplace is the seller of that purchase — it charged you, it
 *      invoiced you, cancellation happens there;
 *   2. its own refund and return policy applies to that purchase;
 *   3. explicitly, that this holds even where that policy is wider than ours,
 *      and that section 4 does not narrow it;
 *   4. section 4 governs purchases made from us, and the page you bought on
 *      names the seller and links its policy.
 * Claim 4's second half is a promise about the sales page, which is why the
 * checks below also read app/go/[platform]/page.tsx once it exists.
 */
const MARKETPLACE_SELLER: Record<string, RegExp> = {
  he: /המוכר של אותה\s*רכישה הוא אותה זירה/,
  en: /the seller of that purchase is that\s*marketplace/,
  es: /el vendedor de esa compra es ese mercado/,
  'pt-BR': /o vendedor dessa compra [ée] esse marketplace/,
  fr: /le vendeur de cet achat est cette place de march[ée]/,
  it: /il venditore di quell'acquisto [èe] quel marketplace/,
}
const MARKETPLACE_THEIR_POLICY: Record<string, RegExp> = {
  he: /מדיניות ההחזרים וההחזרה שלה חלה על אותה רכישה/,
  en: /Its own refund and return policy applies\s*to that purchase/,
  es: /Su propia pol[íi]tica de reembolsos y devoluciones se aplica a esa compra/,
  'pt-BR': /A pol[íi]tica de reembolso e devolu[çc][ãa]o dele se aplica a essa compra/,
  fr: /Sa propre politique de remboursement et de retour s'applique [àa] cet achat/,
  it: /La sua politica di rimborso e di reso si applica a quell'acquisto/,
}
const MARKETPLACE_WIDER: Record<string, RegExp> = {
  he: /גם כשהיא רחבה\s*ממדיניות ההחזרים שבסעיף 4/,
  en: /even where that policy is wider than the refund\s*policy in\s*section 4/,
  es: /incluso cuando esa pol[íi]tica es m[áa]s amplia que la pol[íi]tica de reembolsos de la secci[óo]n 4/,
  'pt-BR': /mesmo quando essa pol[íi]tica [ée] mais ampla que as regras de reembolso das se[çc][õo]es 4 e 5/,
  fr: /m[êe]me lorsque cette politique est plus large que les r[èe]gles de remboursement des sections 4 et 5/,
  it: /anche quando tale politica [èe] pi[ùu] ampia delle regole di rimborso delle sezioni 4 e 5/,
}
const MARKETPLACE_NAMES_SELLER: Record<string, RegExp> = {
  he: /בעמוד שבו רכשתם מופיע שם המוכר וקישור למדיניות שלו/,
  en: /The page you bought (on|from) names the seller and links (to )?its policy/,
  es: /La p[áa]gina en la que usted compr[óo] indica el nombre del vendedor y enlaza con su pol[íi]tica/,
  'pt-BR': /A p[áa]gina em que voc[êe] comprou informa o nome do vendedor e traz o link para a pol[íi]tica dele/,
  fr: /La page sur laquelle vous avez achet[ée] indique le nom du vendeur et renvoie [àa] sa politique/,
  it: /La pagina sulla quale Lei ha acquistato indica il nome del venditore e rinvia alla sua politica/,
}
{
  const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
  const docs: [string, string][] = [
    ['he', read('app/(legal)/refund-policy/page.tsx')],
    ['en', read('app/(public)/en/refund-policy/page.tsx')],
    ...LOCALES.map((l): [string, string] => [l, text[l]['refund-policy']]),
  ]
  for (const [name, refund] of docs) {
    check(`${name}/refund-policy: the marketplace is named as the seller of that purchase`, MARKETPLACE_SELLER[name]!.test(refund))
    check(`${name}/refund-policy: the marketplace's own refund policy is the one that applies`, MARKETPLACE_THEIR_POLICY[name]!.test(refund))
    check(`${name}/refund-policy: our section 4 is not presented as narrowing a wider policy`, MARKETPLACE_WIDER[name]!.test(refund))
    check(`${name}/refund-policy: the buyer is told where to find the seller and its policy`, MARKETPLACE_NAMES_SELLER[name]!.test(refund))
    check(`${name}/refund-policy: the owner's no-refund rule is still the rule for purchases from us`,
      /(סעיף 4 חלה על|in section 4 applies to\s*purchases made from us|de la secci[óo]n 4 se aplica a las compras realizadas a nosotros|das se[çc][õo]es 4 e 5 se aplicam [àa]s compras feitas de n[óo]s|des sections 4 et 5 s'appliquent aux achats effectu[ée]s aupr[èe]s de nous|delle sezioni 4 e 5 si applicano agli acquisti effettuati presso di noi)/.test(refund))
  }
  // Claim 4 is a promise about the sales page. Once that page exists it has to keep it.
  const salesPage = read('app/go/[platform]/page.tsx')
  if (salesPage) {
    check('the marketplace sales page names its seller', /seller|vendedor|מוכר/i.test(salesPage))
    check('the marketplace sales page does not send the buyer to our own refund policy',
      !/\/(en\/)?refund-policy/.test(salesPage))
  }
  check('mutation control: a clause that keeps us the seller is caught',
    !MARKETPLACE_SELLER.en.test('We remain the seller of that purchase and you cancel with us.'))
  check('mutation control: a clause that caps the buyer at our own policy is caught',
    !MARKETPLACE_WIDER.en.test('The refund policy in section 4 applies to that purchase instead.'))
}

// ── 35) a subscription billed by another company ───────────────────────────
/*
 * Terms section 6 said, with no carve-out of any kind, that the user may cancel
 * the renewal "at any time through your account settings". That was already
 * false for a Shopify-billed store, where the billing and the cancellation run
 * through Shopify (the billing screen has had a Shopify card for that reason
 * since long before this section existed). It is false for a card payment too,
 * where section 5A makes Creem the seller and Creem holds the subscription: the
 * Creem branch of the billing screen used to tell the buyer to contact us and
 * that we would stop the billing for them, which we cannot do — we can end the
 * plan, not stop someone else's charge. And it would be false again for a plan
 * bought on a marketplace that resells the Service in its own name.
 *
 * A published promise that a cancellation route exists where it does not is the
 * worst kind for us to carry: in Israel it is a misleading omission under the
 * Consumer Protection Law, and in the EU it makes a cancellation right
 * practically unusable, which is what the Consumer Rights Directive forbids.
 *
 * So section 6A says, platform-neutrally and therefore truthfully in every
 * state the product can be in today or next month:
 *   1. some subscriptions are billed by another company, and it names the three
 *      — Shopify, Creem, an external marketplace;
 *   2. in those cases the renewal is cancelled with that company and NOT through
 *      the account settings, because that company holds the subscription;
 *   3. we will pass a cancellation request on and confirm in writing that we
 *      have — a promise we can keep — while the charge itself is stopped by that
 *      company and not by us;
 *   4. we do not issue a refund on another company's behalf;
 *   5. access still lasts to the end of the period already paid for.
 * Claim 3's second half is the one that matters most: it is what keeps the
 * section from becoming the same unkeepable promise in a new place.
 *
 * Section 6 itself is deliberately NOT edited: it remains the rule for a
 * subscription we bill, and the last check below holds it to that, so a future
 * edit cannot quietly delete the account-settings route for everyone.
 */
const BILLED_ELSEWHERE_NOT_SETTINGS: Record<string, RegExp> = {
  he: /חידוש המנוי מבוטל אצל אותה חברה ולא\s*דרך הגדרות החשבון/,
  en: /the renewal is cancelled with that company and not through your account\s*settings/,
  es: /la renovaci[óo]n se cancela ante esa empresa y no desde la configuraci[óo]n de su cuenta/,
  'pt-BR': /o cancelamento da renova[çc][ãa]o [ée] feito junto a essa empresa, e n[ãa]o nas configura[çc][õo]es da sua conta/,
  fr: /le renouvellement est r[ée]sili[ée] aupr[èe]s de cette entreprise et non depuis les param[èe]tres de votre compte/,
  it: /il rinnovo [èe] disdetto presso quell'impresa e non dalle impostazioni del Suo account/,
}
// The written-confirmation clause was deliberately REMOVED before merge. It read
// well and it protected the buyer, but nothing in the codebase sends such a mail
// on a cancellation request: it would have meant the owner replying by hand, which
// is keepable at one request a month and stops being keepable quietly. The house
// rule is that no written promise is published that the code cannot keep, so the
// terms now promise only what inbound mail already does — we pass the request on —
// and the check below fails if the confirmation sentence returns in any language
// without something to send it.
const BILLED_ELSEWHERE_WE_PASS_ON: Record<string, RegExp> = {
  he: /נעביר אותה לאותה חברה, אך עצירת החיוב/,
  en: /we will pass it on to that company, but the charge itself/,
  es: /la trasladaremos a esa empresa, pero el cobro/,
  'pt-BR': /n[óo]s o encaminhamos a essa empresa, mas a cobran[çc]a/,
  fr: /nous la transmettons [àa] cette entreprise, mais l'arr[êe]t du pr[ée]l[èe]vement/,
  it: /la trasmettiamo a quell'impresa, ma l'interruzione dell'addebito/,
}
const BILLED_ELSEWHERE_NOT_OUR_CHARGE: Record<string, RegExp> = {
  he: /עצירת החיוב\s*עצמו נעשית בידי אותה חברה ולא בידינו/,
  en: /the charge itself is stopped by that company and not by us/,
  es: /el cobro lo detiene esa empresa y no nosotros/,
  'pt-BR': /a cobran[çc]a [ée] interrompida por essa empresa e n[ãa]o por n[óo]s/,
  fr: /l'arr[êe]t du pr[ée]l[èe]vement est le fait de cette entreprise et non le n[ôo]tre/,
  it: /l'interruzione dell'addebito [èe] opera di quell'impresa e non nostra/,
}
const BILLED_ELSEWHERE_NO_REFUND_FOR_THEM: Record<string, RegExp> = {
  he: /ואיננו מוציאים החזר בשמה/,
  en: /we do not issue\s*a refund on its behalf/,
  es: /no emitimos un reembolso en su nombre/,
  'pt-BR': /n[ãa]o emitimos reembolso em nome dela/,
  fr: /nous n'[ée]mettons pas de remboursement en son nom/,
  it: /non emettiamo rimborsi in suo nome/,
}
const BILLED_ELSEWHERE_ACCESS_KEPT: Record<string, RegExp> = {
  he: /הגישה למערכת נשמרת עד תום תקופת החיוב\s*ששולמה/,
  en: /access to the Service is retained until the end\s*of the billing period that has already been paid/,
  es: /el acceso al Servicio se mantiene hasta el final del per[íi]odo de facturaci[óo]n que ya haya sido pagado/,
  'pt-BR': /o acesso ao Servi[çc]o [ée] mantido at[ée] o fim do per[íi]odo de cobran[çc]a j[áa] pago/,
  fr: /l'acc[èe]s au Service est conserv[ée] jusqu'[àa] la fin de la p[ée]riode de facturation d[ée]j[àa] pay[ée]e/,
  it: /l'accesso al Servizio [èe] conservato fino alla fine del periodo di fatturazione gi[àa] pagato/,
}
// Section 6 must keep the account-settings route for a subscription WE bill.
const OWN_BILLING_STILL_SETTINGS: Record<string, RegExp> = {
  he: /רשאי לבטל את חידוש המנוי בכל עת דרך הגדרות החשבון/,
  en: /You may cancel renewal of your subscription at any time through your account settings/,
  es: /puede cancelar la renovaci[óo]n de su suscripci[óo]n en cualquier momento desde la configuraci[óo]n de su cuenta/,
  'pt-BR': /pode cancelar a renova[çc][ãa]o da sua assinatura a qualquer momento nas configura[çc][õo]es da conta/,
  fr: /Vous pouvez r[ée]silier le renouvellement de votre abonnement [àa] tout moment depuis les param[èe]tres de votre compte/,
  it: /Lei pu[òo] disdire il rinnovo del Suo abbonamento in qualsiasi momento dalle impostazioni del Suo account/,
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
    check(`${name}/terms: a subscription billed elsewhere is cancelled there, not in the account settings`, BILLED_ELSEWHERE_NOT_SETTINGS[name]!.test(terms))
    check(`${name}/terms: we promise only to pass the request on, and nothing no code performs`, BILLED_ELSEWHERE_WE_PASS_ON[name]!.test(terms))
    check(`${name}/terms: stopping the charge is named as the other company's act, not ours`, BILLED_ELSEWHERE_NOT_OUR_CHARGE[name]!.test(terms))
    check(`${name}/terms: no written confirmation is promised, because nothing sends one`,
      !/(ונאשר בכתב|confirm in writing|confirmaremos por escrito|confirmamos por escrito|nous (le )?confirmerons par [ée]crit|lo confermeremo per iscritto)/.test(terms))
    check(`${name}/terms: no refund is promised on another company's behalf`, BILLED_ELSEWHERE_NO_REFUND_FOR_THEM[name]!.test(terms))
    check(`${name}/terms: access still runs to the end of the period already paid for`, BILLED_ELSEWHERE_ACCESS_KEPT[name]!.test(terms))
    check(`${name}/terms: all three billing companies are named`, /Shopify/.test(terms) && /Creem/.test(terms) && /(זירת מכירות|mercado externo|marketplace externo|external marketplace|place de march[ée] externe|marketplace esterno)/.test(terms))
    check(`${name}/terms: section 6 still gives the account-settings route for a subscription we bill`, OWN_BILLING_STILL_SETTINGS[name]!.test(terms))
  }
  // The billing screen is the other half of this promise: it must not tell a buyer
  // whose subscription we do not hold that we will stop the billing for them.
  // Today it still does — `contactToCancel` in lib/i18n/dashboard/*.ts reads "contact
  // us and we will stop the billing for you", which is the branch a Creem buyer
  // lands in. That text is being replaced in the PR that rewrites the screen, and
  // the check belongs with the fix rather than here, where it would ship red; the
  // thread that owns the screen has the exact assertion to add.
  check('mutation control: a clause that keeps the cancellation in our account settings is caught',
    !BILLED_ELSEWHERE_NOT_SETTINGS.en.test('In those cases the renewal is cancelled through your account settings as usual.'))
  check('mutation control: a promise to stop the other company’s charge is caught',
    !BILLED_ELSEWHERE_NOT_OUR_CHARGE.en.test('Write to us and we will stop the charge for you.'))
}

// ── 36) an author photo a customer uploads ──────────────────────────────
/*
 * The author box lets a customer upload a photo. A photo of a person is not the
 * kind of user content section 15 was written for: that clause warrants rights
 * over text the customer owns (domains, keywords, client details). A photograph
 * of a human being is personal data about a third party who never agreed to
 * anything with us, and under section 2(6) of Israel's Protection of Privacy Law
 * using a person's likeness for profit is an infringement in itself, consent or
 * no contract. The privacy policy was the larger gap: no uploaded file appeared
 * in what we collect or in how long we keep it, and the person in the picture
 * had no route to us at all.
 *
 * What the two documents now say, and what therefore has to stay true in code:
 *   1. the customer warrants the depicted person's consent, a guardian's where
 *      the person is a minor, and must remove the photo if that consent is
 *      withdrawn;
 *   2. the file is stored under the project id plus a random id, never under a
 *      person's name, and we neither publish our copy nor link to it;
 *   3. deleting the photo, or turning the setting off, erases the storage
 *      object - not only the row;
 *   4. the photo reaches no AI provider, trains no model, and gets no face
 *      recognition or other biometric processing;
 *   5. the copy published into the customer's media library or Shopify Files is
 *      outside our control, and we say so rather than promising a deletion we
 *      cannot perform.
 * Claim 5 is the honest half of claim 3, and claim 4 is the one that would be
 * cheapest to break by accident, which is why both have checks bound to code
 * below as soon as the upload exists.
 */
const PHOTO_CONSENT: Record<string, RegExp> = {
  he: /\u05d0\u05d5\u05ea\u05d5 \u05d0\u05d3\u05dd \u05d4\u05e1\u05db\u05d9\u05dd \u05e9\u05d4\u05ea\u05de\u05d5\u05e0\u05d4 \u05ea\u05ea\u05e4\u05e8\u05e1\u05dd/,
  en: /that person has consented\s*to the photo being published/,
  es: /esa persona ha consentido que la foto se publique/,
  'pt-BR': /essa pessoa consentiu com a publica[\u00e7c][\u00e3a]o da foto/,
  fr: /cette personne a consenti [àa] ce que la photo soit publi[ée]e/,
  it: /quella persona ha acconsentito a che la foto sia pubblicata/,
}
const PHOTO_MINOR: Record<string, RegExp> = {
  he: /\u05e7\u05d8\u05d9\u05df, \u05e0\u05d3\u05e8\u05e9\u05ea \u05d4\u05e1\u05db\u05de\u05ea \u05d4\u05d0\u05e4\u05d5\u05d8\u05e8\u05d5\u05e4\u05d5\u05e1/,
  en: /is a minor, their guardian&rsquo;s consent is required/,
  es: /es menor de edad, se requiere el consentimiento de su tutor/,
  'pt-BR': /for menor de idade, [\u00e9e] necess[\u00e1a]rio o consentimento do respons[\u00e1a]vel/,
  fr: /est mineure, le consentement de son repr[ée]sentant l[ée]gal est requis/,
  it: /[èe] minore, [èe] richiesto il consenso del suo rappresentante legale/,
}
const PHOTO_COPY_NOT_OURS: Record<string, RegExp> = {
  he: /\u05e2\u05d5\u05ea\u05e7 \u05e9\u05db\u05d1\u05e8 \u05d4\u05d5\u05e2\u05ea\u05e7 \u05dc\u05e1\u05e4\u05e8\u05d9\u05d9\u05ea\s*\u05d4\u05de\u05d3\u05d9\u05d4 \u05e9\u05dc \u05d4\u05d0\u05ea\u05e8 \u05e9\u05dc\u05db\u05dd \u05e0\u05de\u05e6\u05d0 \u05d1\u05e9\u05dc\u05d9\u05d8\u05ea\u05db\u05dd/,
  en: /a copy already\s*placed in your site&rsquo;s media library is under your control/,
  es: /una copia que ya se haya colocado en la biblioteca de medios de su sitio est[\u00e1a] bajo su control/,
  'pt-BR': /uma c[\u00f3o]pia j[\u00e1a] colocada na biblioteca de m[\u00ed i]dia do seu site est[\u00e1a] sob o seu controle/,
  fr: /une copie d[ée]j[àa] plac[ée]e dans la biblioth[èe]que de m[ée]dias de votre site est sous votre contr[ôo]le/,
  it: /una copia gi[àa] collocata nella libreria dei media del Suo sito [èe] sotto il Suo controllo/,
}
const PHOTO_PATH_NO_NAME: Record<string, RegExp> = {
  he: /\u05de\u05de\u05d6\u05d4\u05d4 \u05d4\u05e4\u05e8\u05d5\u05d9\u05e7\u05d8 \u05d5\u05de\u05de\u05d6\u05d4\u05d4 \u05d0\u05e7\u05e8\u05d0\u05d9/,
  en: /the project id and a\s*random id, and never of a person&rsquo;s name/,
  es: /del identificador del proyecto y de un identificador aleatorio, y nunca del nombre de una persona/,
  'pt-BR': /pelo identificador do projeto e por um identificador aleat[\u00f3o]rio, nunca pelo nome de uma pessoa/,
  fr: /de l'identifiant du projet et d'un identifiant al[ée]atoire, et jamais du nom d'une personne/,
  it: /dall'identificatore del progetto e da un identificatore casuale, e mai dal nome di una persona/,
}
const PHOTO_NO_AI: Record<string, RegExp> = {
  he: /\u05d0\u05d9\u05e0\u05d4 \u05e0\u05e9\u05dc\u05d7\u05ea \u05dc\u05d0\u05e3 \u05e1\u05e4\u05e7 AI/,
  en: /is not sent to any AI provider, is not used to train models/,
  es: /no se env[\u00ed i]a a ning[\u00fau]n proveedor de IA, no se utiliza para entrenar modelos/,
  'pt-BR': /n[\u00e3a]o [\u00e9e] enviada a nenhum provedor de IA, n[\u00e3a]o [\u00e9e] usada para treinar modelos/,
  fr: /n'est envoy[ée]e [àa] aucun fournisseur d'IA, elle n'est pas utilis[ée]e pour entra[îi]ner des mod[èe]les/,
  it: /non [èe] inviata ad alcun fornitore di IA, non [èe] utilizzata per addestrare modelli/,
}
const PHOTO_NO_BIOMETRIC: Record<string, RegExp> = {
  he: /\u05d6\u05d9\u05d4\u05d5\u05d9 \u05e4\u05e0\u05d9\u05dd \u05d0\u05d5 \u05db\u05dc \u05e2\u05d9\u05d1\u05d5\u05d3 \u05d1\u05d9\u05d5\u05de\u05d8\u05e8\u05d9 \u05d0\u05d7\u05e8/,
  en: /we do not run face\s*recognition or any other biometric processing on it/,
  es: /no ejecutamos sobre ella reconocimiento facial ni ning[\u00fau]n otro tratamiento biom[\u00e9e]trico/,
  'pt-BR': /n[\u00e3a]o executamos sobre ela reconhecimento facial nem qualquer outro tratamento biom[\u00e9e]trico/,
  fr: /nous n'ex[ée]cutons sur elle ni reconnaissance faciale ni aucun autre traitement biom[ée]trique/,
  it: /non eseguiamo su di essa n[ée] riconoscimento facciale n[ée] alcun altro trattamento biometrico/,
}
/*
 * Two sentences were corrected on 2026-10-17, the day after they went live,
 * once the upload was built and its real behaviour could be read:
 *   - "or into Shopify Files" named a destination the photo cannot reach. The
 *     app's Shopify scopes (read_products, read_content, write_content) cannot
 *     write to Shopify Files, and lib/content/author-box/photo-copy.ts offers
 *     the upload only on a WordPress site with an application password. A
 *     published document should not describe a copy that is never made.
 *   - "turning the setting off erases the file" was wrong about which setting.
 *     Deleting the photo, or moving the image choice to 'none' or 'site_icon',
 *     calls removeAuthorPhotoObject; turning the whole author box off KEEPS the
 *     file. Rather than make a toggle destroy a customer's file, the text now
 *     says which action erases it and which does not.
 * The last two checks in this section fail if either sentence comes back.
 */
const PHOTO_DELETE_ERASES_FILE: Record<string, RegExp> = {
  he: /\u05de\u05d5\u05d7\u05e7\u05d9\u05dd \u05d0\u05ea \u05d4\u05e7\u05d5\u05d1\u05e5\s*\u05de\u05d4\u05d0\u05d7\u05e1\u05d5\u05df \u05e9\u05dc\u05e0\u05d5/,
  en: /erases the file from our\s*storage/,
  es: /se borra el archivo de nuestro almacenamiento/,
  'pt-BR': /exclui o arquivo do nosso armazenamento/,
  fr: /efface le fichier de notre stockage/,
  it: /elimina il file dal nostro archivio/,
}
const PHOTO_SUBJECT_ROUTE: Record<string, RegExp> = {
  he: /\u05d0\u05dd \u05d0\u05ea\u05dd \u05d4\u05d0\u05d3\u05dd \u05e9\u05d1\u05ea\u05de\u05d5\u05e0\u05d4/,
  en: /If you are the person in the photo and not the customer who uploaded/,
  es: /Si usted es la persona de la foto y no el cliente que la subi[\u00f3o]/,
  'pt-BR': /Se voc[\u00ea e] [\u00e9e] a pessoa da foto e n[\u00e3a]o o cliente que a enviou/,
  fr: /Si vous [êe]tes la personne de la photo et non le client qui l'a envoy[ée]e/,
  it: /Se Lei [èe] la persona della foto e non il cliente che l'ha inviata/,
}
const PHOTO_BOX_OFF_KEEPS: Record<string, RegExp> = {
  he: /\u05db\u05d9\u05d1\u05d5\u05d9 \u05ea\u05d9\u05d1\u05ea \u05d4\u05de\u05d7\u05d1\u05e8 \u05db\u05d5\u05dc\u05d4 \u05d0\u05d9\u05e0\u05d5 \u05de\u05d5\u05d7\u05e7 \u05d0\u05ea \u05d4\u05ea\u05de\u05d5\u05e0\u05d4/,
  en: /Turning the whole author box off does not erase the photo/,
  es: /Desactivar toda la caja de autor no borra la foto/,
  'pt-BR': /Desligar a caixa de autor inteira n[\u00e3a]o exclui a foto/,
  fr: /D[ée]sactiver tout l'encadr[ée] d'auteur n'efface pas la photo/,
  it: /Disattivare tutto il riquadro d'autore non elimina la foto/,
}
const PHOTO_IN_RETENTION: Record<string, RegExp> = {
  he: /<strong>\u05ea\u05de\u05d5\u05e0\u05ea \u05de\u05d7\u05d1\u05e8:<\/strong> \u05db\u05dc \u05e2\u05d5\u05d3 \u05d4\u05ea\u05de\u05d5\u05e0\u05d4 \u05de\u05d5\u05d2\u05d3\u05e8\u05ea \u05d1\u05e4\u05e8\u05d5\u05d9\u05e7\u05d8/,
  en: /<strong>Author photo:<\/strong> for as long as the photo is configured on the project/,
  es: /\*\*Foto de autor:\*\* mientras la foto est[\u00e9e] configurada en el proyecto/,
  'pt-BR': /\*\*Foto de autor:\*\* enquanto a foto estiver configurada no projeto/,
  fr: /\*\*Photo d'auteur\s*:\*\* tant que la photo est configur[ée]e sur le projet/,
  it: /\*\*Foto dell'autore\s*:\*\* per tutto il tempo in cui la foto [èe] configurata sul progetto/,
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
    check(`${name}/terms: the uploader warrants the depicted person's consent`, PHOTO_CONSENT[name]!.test(terms))
    check(`${name}/terms: a minor needs a guardian's consent`, PHOTO_MINOR[name]!.test(terms))
    check(`${name}/terms: the copy already on the customer's site is named as theirs to delete`, PHOTO_COPY_NOT_OURS[name]!.test(terms))
  }
  for (const [name, privacy] of privacyDocs) {
    check(`${name}/privacy: the stored path carries no person's name`, PHOTO_PATH_NO_NAME[name]!.test(privacy))
    check(`${name}/privacy: the photo reaches no AI provider and trains no model`, PHOTO_NO_AI[name]!.test(privacy))
    check(`${name}/privacy: no face recognition and no other biometric processing`, PHOTO_NO_BIOMETRIC[name]!.test(privacy))
    check(`${name}/privacy: deleting the photo erases the stored file, not only the row`, PHOTO_DELETE_ERASES_FILE[name]!.test(privacy))
    check(`${name}/privacy: the person in the photo has a route to us`, PHOTO_SUBJECT_ROUTE[name]!.test(privacy))
    check(`${name}/privacy: the photo appears in how long we keep data`, PHOTO_IN_RETENTION[name]!.test(privacy))
    check(`${name}/privacy: turning the whole author box off is NOT claimed to erase the photo`,
      PHOTO_BOX_OFF_KEEPS[name]!.test(privacy))
  }
  /* No document may name a destination the photo cannot reach. */
  for (const [name, doc] of [...termsDocs, ...privacyDocs]) {
    check(`${name}: Shopify Files is not named as a place the photo is copied to`, !/Shopify Files/.test(doc))
  }
  /*
   * The code half. The upload is not built yet, so these bind the moment it is:
   * whatever module names the author-photo bucket must delete the object and must
   * not hand the file to a model. Until that file exists there is nothing to
   * check, and a guard that passed on an absent file would be worse than none,
   * so the skip is explicit.
   */
  const photoModule = ['lib/content/author-box/photo.ts', 'lib/content/author-photo.ts', 'lib/content/author-box.ts']
    .map((f) => [f, read(f)] as [string, string])
    .find(([, body]) => body.length > 0)
  if (photoModule) {
    const [photoPath, photoBody] = photoModule
    check(`${photoPath}: removing the photo deletes the storage object`, /\.remove\(|\.delete\(/.test(photoBody))
    check(`${photoPath}: the photo is never handed to a model`, !/gemini|generateContent|openai/i.test(photoBody))
  } else {
    check('author-photo module not built yet, so its two code checks are pending (not a pass)', true)
  }
  check('mutation control: a clause that drops the consent warranty is caught',
    !PHOTO_CONSENT.en.test('You may upload any photo you like for the author box.'))
  check('mutation control: a promise to delete the copy on the customer site is caught',
    !PHOTO_COPY_NOT_OURS.en.test('We will also delete the copy in your media library for you.'))
  check('mutation control: a text claiming the box switch erases the photo is caught',
    !PHOTO_BOX_OFF_KEEPS.en.test('Turning the whole author box off erases the photo from our storage.'))
  check('mutation control: a policy that sends the photo to an AI provider is caught',
    !PHOTO_NO_AI.en.test('The photo is sent to our AI provider to improve the author box.'))
}

// ── 37) French: a mutation control for every new class of French check ─────
/*
 * The French documents landed on 2026-10-21 and brought five new classes of
 * check with them: the vouvoiement register, a revision date written the French
 * way, the French and European statutes, the per-sentence text tables, and the
 * French branch added to each shared "this is no longer true" alternation.
 *
 * Every one of them is proved here the way this suite proves the others: the
 * French wording is broken on purpose and the guard has to fail on the broken
 * text. A French table that matched nothing would otherwise pass in silence,
 * because a missing locale key is skipped rather than failed in most sections
 * above.
 */
{
  const vous = REGISTER_FORBIDS.vous!
  check('mutation control (fr): tutoiement in a vous document is caught',
    vous.patterns.some((p) => p.test('Si tu veux arrêter, tu peux désactiver ton compte à tout moment.')))
  check('mutation control (fr): the register check passes clean vouvoiement',
    !vous.patterns.some((p) => p.test('Si vous voulez arrêter, vous pouvez désactiver votre compte à tout moment.')))

  check('mutation control (fr): the French revision sentence is actually parsed',
    writtenRevisionDate('fr', 'Dernière mise à jour le 21 octobre 2026') === '2026-10-21')
  check('mutation control (fr): a footer date that disagrees with the written one is caught',
    writtenRevisionDate('fr', 'Dernière mise à jour le 9 octobre 2026') !== '2026-10-21')
  check('mutation control (fr): a date inside a statute is not read as the revision date',
    writtenRevisionDate('fr', "la loi n° 2023-451 du 9 juin 2023 visant à encadrer l'influence commerciale") === null)

  const law = (doc: Doc, needle: string) => LAW.fr!.find((l) => l.doc === doc && l.must.source.includes(needle))!
  check('mutation control (fr): a refund policy that promises the fourteen days without the article is caught',
    !law('refund-policy', 'L221-18').must.test('Vous disposez d\'un droit de rétractation de quatorze jours.'))
  check('mutation control (fr): a privacy policy that answers in thirty days instead of one month is caught',
    !law('privacy', '12, paragraphe 3').must.test('Nous répondons à une demande **dans un délai de trente jours** à compter de sa réception.'))
  check('mutation control (fr): a privacy policy that claims an appointed officer is caught',
    !law('privacy', 'd[ée]l[ée]gu').must.test('Nous avons désigné un délégué à la protection des données, joignable à cette adresse.'))
  check('mutation control (fr): an accessibility statement that claims RGAA conformance is caught',
    !law('accessibility', 'conformit[ée] au RGAA').must.test('Le site est conforme au RGAA et nous publions une déclaration de conformité RGAA.'))
  check('mutation control (fr): a Québec section that reuses the RGPD officer paragraph is caught',
    !law('privacy', 'nous ne les confondons pas').must.test("Notre délégué à la protection des données est aussi le responsable au sens de la Loi 25."))
  check('mutation control (fr): a Québec section that only promises an RGPD-style answer month is caught',
    !law('privacy', 'article 32').must.test('Le responsable répond par écrit dans un délai d\'un mois, comme en Europe.'))
  check('mutation control (fr): an incident reported only to a European authority is caught',
    !law('privacy', 'autorit[ée] europ[ée]enne').must.test('En cas d\'incident, nous avisons la CNIL et les personnes concernées.'))
  check('mutation control (fr): a Québec section that claims an assessment we never wrote is caught',
    !law('privacy', 'une [ée]valuation [ée]crite').must.test('Nous avons réalisé une évaluation des facteurs relatifs à la vie privée pour chaque fournisseur.'))
  check('mutation control (fr): an automated-decision paragraph with no observations route is caught',
    !law('privacy', 'observations').must.test('Nous informons la personne concernée de toute décision automatisée.'))
  check('mutation control (fr): a portability line without the Québec in-force date is caught',
    !law('privacy', '22 septembre 2024').must.test('Vous pouvez demander la portabilité de vos données à tout moment.'))
  check('mutation control (fr): a policy that leaves a Québec reader under the RGPD is caught',
    !law('privacy', 'ce n\'est pas le RGPD qui vous gouverne').must.test('Si vous vous trouvez au Québec, les droits du RGPD ci-dessus sont les vôtres.'))
  check('mutation control (fr): a transfers section that claims SCCs with everyone is caught',
    !law('privacy', 'clauses contractuelles types').must.test('Nous avons signé des clauses contractuelles types avec chacun de nos sous-traitants.'))

  check('mutation control (fr): text that lets the Shopify fixes reach products is caught',
    !SHOPIFY_FIXES.fr!.terms[2]!.test('Le Service peut mettre à jour les produits, les collections et le thème.'))
  check('mutation control (fr): dropping the per-fix approval is caught',
    !SHOPIFY_FIXES.fr!.terms[3]!.test('Le Service applique les corrections dans la boutique connectée.'))
  check('mutation control (fr): a conversion report described as unconditional is caught',
    !CAPI_GATE.fr!.test('Le rapport est envoyé à chaque inscription terminée, quelle que soit la catégorie de cookies.'))
  check('mutation control (fr): a marketplace clause capped at our own policy is caught',
    !MARKETPLACE_WIDER.fr!.test('Les règles de remboursement des sections 4 et 5 s\'appliquent à cet achat à la place.'))
  check('mutation control (fr): a policy that sends the author photo to an AI provider is caught',
    !PHOTO_NO_AI.fr!.test('La photo est envoyée à notre fournisseur d\'IA pour améliorer l\'encadré d\'auteur.'))
  check('mutation control (fr): a weekly summary promised every week is caught',
    !EMAIL_WEEKLY.fr![1]!.test('Le résumé est envoyé le dimanche matin, chaque semaine.'))
  check('mutation control (fr): a monthly report left in the email section is caught',
    EMAIL_NO_MONTHLY.fr!.test('**Rapport mensuel :** un résumé mensuel du projet.'))

  // The shared alternations: each one now has a French branch, and each branch
  // has to fire on the French wording of the thing it forbids.
  check('mutation control (fr): a policy with no separate marketing box is caught',
    !/בתיבה נפרדת|separate box|casilla aparte|caixa separada|case s[ée]par[ée]e/i.test('Vous recevez le rapport et nos nouveautés avec la même case.'))
  check('mutation control (fr): a document that still denies the network to Shopify is caught',
    NETWORK_DENIED.test('Il est désactivé par défaut et il n\'est pas disponible pour les boutiques Shopify.'))
  check('mutation control (fr): the old "only fixes from a closed list" sentence is caught',
    /n'applique au site que des corrections d'une liste ferm[ée]e/.test('L\'extension n\'applique au site que des corrections d\'une liste fermée.'))
  check('mutation control (fr): the old "needs an application password with the plugin" sentence is caught',
    /n[ée]cessite (encore )?un mot de passe d'application m[êe]me lorsque l'extension est connect[ée]e/
      .test('Cette action nécessite encore un mot de passe d\'application même lorsque l\'extension est connectée.'))
  check('mutation control (fr): the old PDFShift deferral is caught',
    /r[ée]gie par (sa|la) propre politique de confidentialit[ée]/.test('La conservation chez PDFShift est régie par sa propre politique de confidentialité.'))
  check('mutation control (fr): the old "we do not read reviews" sentence is caught',
    NO_LONGER_TRUE.test('Nous ne modifions pas les informations de votre entreprise, et nous ne lisons pas les avis et nous n\'y répondons pas.'))
  check('mutation control (fr): an absolute about posting only on a click is caught',
    AUTO_POST_NO_LONGER_TRUE.test('Nous créons un post uniquement lorsque vous cliquez sur publier.'))
  check('mutation control (fr): an absolute about drafts never being published is caught',
    AUTO_POST_NO_LONGER_TRUE.test('Un brouillon n\'est jamais publié avant que vous ne le relisiez.'))
  check('mutation control (fr): the old private-individual sentence is caught',
    OUTREACH_NO_LONGER_TRUE.test('Nous ne collectons pas de numéro de téléphone et nous ne collectons pas de données sur une personne privée.'))
  check('mutation control (fr): an attribution window in days is caught',
    /(ventana de atribuci[óo]n|janela de atribui[çc][ãa]o|fen[êe]tre d'attribution)/i.test('La fenêtre d\'attribution est de 90 jours.'))
  check('mutation control (fr): a claim of full accessibility conformance is caught',
    /fully conformant|totalmente conformes?|מותאמים במלואם|plenamente conforme|pleinement conformes?/i
      .test('Le site et la plateforme sont pleinement conformes à la norme au niveau AA.'))
  check('mutation control (fr): a written confirmation promised on cancellation is caught',
    /(ונאשר בכתב|confirm in writing|confirmaremos por escrito|confirmamos por escrito|nous (le )?confirmerons par [ée]crit)/
      .test('Envoyez-nous la demande et nous le confirmerons par écrit.'))
  check('mutation control (fr): the WordPress-only site-fixes heading is caught',
    /15[Cג]\.?\s*(Site Fixes and the GO TOP SEO Bridge|תיקוני אתר ותוסף|Correcciones del sitio y el plugin|Corre[çc][õo]es no site e o plugin|Corrections du site et l'extension)/
      .test('## 15C. Corrections du site et l\'extension GO TOP SEO Bridge'))
  check('mutation control (fr): the French email section is found by the split',
    'x'.concat(text.fr!.privacy).split(/Email Messages|הודעות דוא|Mensajes de correo|Mensagens de e-mail|Messages de courrier [ée]lectronique/).length > 1)
}


// ── 38) Italian: a mutation control for every new class of Italian check ───
/*
 * The Italian documents landed on 2026-10-21 and brought the same five classes
 * of check the French ones did: the "Lei" courtesy register, a revision date
 * written the Italian way, the Italian and European statutes, the per-sentence
 * text tables, and the Italian branch added to each shared "this is no longer
 * true" alternation.
 *
 * Each one is broken on purpose here and has to fail on the broken text,
 * because a missing locale key is skipped rather than failed in most sections
 * above: an Italian table that matched nothing would otherwise pass in silence.
 */
{
  const lei = REGISTER_FORBIDS.lei!
  check('mutation control (it): the tu form in a Lei document is caught',
    lei.patterns.some((p) => p.test('Se vuoi smettere, puoi disattivare il tuo account in qualsiasi momento.')))
  check('mutation control (it): the register check passes clean Lei',
    !lei.patterns.some((p) => p.test('Se desidera smettere, può disattivare il Suo account in qualsiasi momento.')))

  check('mutation control (it): the Italian revision sentence is actually parsed',
    writtenRevisionDate('it', 'Ultimo aggiornamento: 21 ottobre 2026') === '2026-10-21')
  check('mutation control (it): a footer date that disagrees with the written one is caught',
    writtenRevisionDate('it', 'Ultimo aggiornamento: 9 ottobre 2026') !== '2026-10-21')
  check('mutation control (it): a date inside a statute is not read as the revision date',
    writtenRevisionDate('it', 'la legge 9 gennaio 2004, n. 4 (la « legge Stanca »)') === null)

  const law = (doc: Doc, needle: string) => LAW.it!.find((l) => l.doc === doc && l.must.source.includes(needle))!
  check('mutation control (it): a refund policy that promises the fourteen days without the article is caught',
    !law('refund-policy', 'articolo 52').must.test('Lei dispone di un diritto di recesso di quattordici giorni.'))
  check('mutation control (it): a refund policy that treats an open account as full performance is caught',
    !law('refund-policy', 'pienamente eseguito').must.test('Aprendo un account il Servizio è pienamente eseguito e il diritto è perduto.'))
  check('mutation control (it): a privacy policy that answers in thirty days instead of one month is caught',
    !law('privacy', '12, paragrafo 3').must.test('Rispondiamo a una richiesta **entro trenta giorni** dal suo ricevimento.'))
  check('mutation control (it): a privacy policy that claims an appointed officer is caught',
    !law('privacy', 'responsabile della protezione dei dati').must.test('Abbiamo designato un responsabile della protezione dei dati, raggiungibile a questo indirizzo.'))
  check('mutation control (it): a privacy policy that names only a foreign authority is caught',
    !law('privacy', 'Garante').must.test('Lei può proporre reclamo alla CNIL, l\'autorità di controllo francese.'))
  check('mutation control (it): a transfers section that claims SCCs with everyone is caught',
    !law('privacy', 'clausole contrattuali tipo').must.test('Abbiamo firmato clausole contrattuali tipo con ciascuno dei nostri responsabili del trattamento.'))
  check('mutation control (it): an accessibility statement that claims AgID conformance is caught',
    !law('accessibility', 'Linee guida AgID').must.test('Il sito è conforme alle Linee guida AgID e pubblichiamo una dichiarazione di accessibilità AgID.'))
  check('mutation control (it): a partner agreement with no editorial-content rule is caught',
    !law('affiliate-terms', 'lettera m').must.test('Una pratica commerciale scorretta è vietata dal Codice del Consumo.'))

  check('mutation control (it): text that lets the Shopify fixes reach products is caught',
    !SHOPIFY_FIXES.it!.terms[2]!.test('Il Servizio può aggiornare i prodotti, le collezioni e il tema.'))
  check('mutation control (it): dropping the per-fix approval is caught',
    !SHOPIFY_FIXES.it!.terms[3]!.test('Il Servizio applica le correzioni nel negozio connesso.'))
  check('mutation control (it): a conversion report described as unconditional is caught',
    !CAPI_GATE.it!.test('Il rapporto è inviato a ogni iscrizione completata, qualunque sia la categoria di cookie.'))
  check('mutation control (it): a hashed address presented as anonymous is caught',
    !CAPI_HASH.it![1]!.test('Inviamo soltanto un condensato unidirezionale dell\'indirizzo, perciò il rapporto non La identifica.'))
  check('mutation control (it): a marketplace clause capped at our own policy is caught',
    !MARKETPLACE_WIDER.it!.test('Le regole di rimborso delle sezioni 4 e 5 si applicano a quell\'acquisto al loro posto.'))
  check('mutation control (it): a policy that sends the author photo to an AI provider is caught',
    !PHOTO_NO_AI.it!.test('La foto è inviata al nostro fornitore di IA per migliorare il riquadro d\'autore.'))
  check('mutation control (it): a weekly summary promised every week is caught',
    !EMAIL_WEEKLY.it![1]!.test('Il riepilogo è inviato la domenica mattina, ogni settimana.'))
  check('mutation control (it): a monthly report left in the email section is caught',
    EMAIL_NO_MONTHLY.it!.test('**Rapporto mensile:** un riepilogo mensile del progetto.'))
  check('mutation control (it): an application record with no retention limit is caught',
    !PARTNER_IP_RETENTION.it!.test('Registriamo inoltre l\'indirizzo IP dal quale la domanda è arrivata.'))
  check('mutation control (it): a review flag described as blocking is caught',
    !PARTNER_REVIEW_FLAG.it!.test('Quel contrassegno blocca la segnalazione fino a quando una persona la approva.'))

  // The shared alternations: each one now has an Italian branch, and each
  // branch has to fire on the Italian wording of the thing it forbids.
  check('mutation control (it): a policy with no separate marketing box is caught',
    !/בתיבה נפרדת|separate box|casilla aparte|caixa separada|case s[ée]par[ée]e|casella separata/i
      .test('Lei riceve il report e le nostre novità con la medesima casella.'))
  check('mutation control (it): a document that still denies the network to Shopify is caught',
    NETWORK_DENIED.test('È disattivata per impostazione predefinita e non è disponibile per i negozi Shopify.'))
  check('mutation control (it): the old "only fixes from a closed list" sentence is caught',
    /applica al sito soltanto correzioni di un elenco chiuso/
      .test('L\'estensione applica al sito soltanto correzioni di un elenco chiuso.'))
  check('mutation control (it): the old "needs an application password with the plugin" sentence is caught',
    /richiede (ancora )?una password di applicazione anche quando l'estensione [èe] (connessa|installata)/
      .test('Questa azione richiede ancora una password di applicazione anche quando l\'estensione è connessa.'))
  check('mutation control (it): the old PDFShift deferral is caught',
    /regolata dalla sua propria informativa sulla privacy/
      .test('La conservazione presso PDFShift è regolata dalla sua propria informativa sulla privacy.'))
  check('mutation control (it): the old "we do not read reviews" sentence is caught',
    NO_LONGER_TRUE.test('Non modifichiamo le informazioni della Sua impresa, e non leggiamo le recensioni e non vi rispondiamo.'))
  check('mutation control (it): an absolute about posting only on a click is caught',
    AUTO_POST_NO_LONGER_TRUE.test('creiamo un post unicamente quando Lei fa clic su pubblica.'))
  check('mutation control (it): an absolute about drafts never being published is caught',
    AUTO_POST_NO_LONGER_TRUE.test('Una bozza non è mai pubblicata prima che Lei la rilegga.'))
  check('mutation control (it): the old private-individual sentence is caught',
    OUTREACH_NO_LONGER_TRUE.test('Non raccogliamo numeri di telefono e non raccogliamo dati su una persona privata.'))
  check('mutation control (it): an attribution window in days is caught',
    /(ventana de atribuci[óo]n|janela de atribui[çc][ãa]o|fen[êe]tre d'attribution|finestra di attribuzione)/i
      .test('La finestra di attribuzione è di 90 giorni.'))
  check('mutation control (it): a claim of full accessibility conformance is caught',
    /fully conformant|totalmente conformes?|מותאמים במלואם|plenamente conforme|pleinement conformes?|pienamente conformi?/i
      .test('Il sito e la piattaforma sono pienamente conformi alla norma al livello AA.'))
  check('mutation control (it): a written confirmation promised on cancellation is caught',
    /(ונאשר בכתב|confirm in writing|confirmaremos por escrito|confirmamos por escrito|nous (le )?confirmerons par [ée]crit|lo confermeremo per iscritto)/
      .test('Ci invii la richiesta e lo confermeremo per iscritto.'))
  check('mutation control (it): the WordPress-only site-fixes heading is caught',
    /15[Cג]\.?\s*(Site Fixes and the GO TOP SEO Bridge|תיקוני אתר ותוסף|Correcciones del sitio y el plugin|Corre[çc][õo]es no site e o plugin|Corrections du site et l'extension|Correzioni del sito e l'estensione)/
      .test('## 15C. Correzioni del sito e l\'estensione GO TOP SEO Bridge'))
  check('mutation control (it): the Italian email section is found by the split',
    'x'.concat(text.it!.privacy).split(/Email Messages|הודעות דוא|Mensajes de correo|Mensagens de e-mail|Messages de courrier [ée]lectronique|Messaggi di posta elettronica/).length > 1)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
