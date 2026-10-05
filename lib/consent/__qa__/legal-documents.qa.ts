/**
 * THE LEGAL DOCUMENTS — the guard for what the published pages must say, in
 * both languages, and what they must never say again.
 *
 * Run: npx tsx lib/consent/__qa__/legal-documents.qa.ts
 *
 * These are source guards, not renderers: they read the page files and assert
 * the presence of disclosures the law makes mandatory, and the absence of three
 * specific sentences that were live and wrong. A document is the one artefact
 * where "we meant the other thing" is no defence, so the wording is pinned.
 *
 * A) no page claims that browsing is consent
 * B) nothing live describes itself as a draft
 * C) the privacy policy carries the Art. 13/14 disclosures it was missing
 * D) Hebrew and English say the same things
 * E) the accessibility statement is a statement, with a route onwards
 * F) the terms disclose the consumer rights that override them
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '../../..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const HE_PRIVACY = 'app/(legal)/privacy/page.tsx'
const EN_PRIVACY = 'app/(public)/en/privacy/page.tsx'
const HE_TERMS = 'app/(public)/terms/page.tsx'
const EN_TERMS = 'app/(public)/en/terms/page.tsx'
const HE_A11Y = 'app/(legal)/accessibility/page.tsx'
const EN_A11Y = 'app/(public)/en/accessibility/page.tsx'
const HE_REFUND = 'app/(legal)/refund-policy/page.tsx'
const EN_REFUND = 'app/(public)/en/refund-policy/page.tsx'

const ALL_PAGES = [HE_PRIVACY, EN_PRIVACY, HE_TERMS, EN_TERMS, HE_A11Y, EN_A11Y, HE_REFUND, EN_REFUND]

let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}`, detail === undefined ? '' : detail) }
}

function main() {
  console.log('A) no page claims that browsing is consent')
  {
    // The exact sentences that were published, in both languages. Consent has
    // to be an affirmative act (GDPR Art. 4(11); CJEU C-673/17 Planet49), so a
    // page that says continued use is agreement is describing something that
    // is not consent at all.
    // Scoped to COOKIES. "Continued use after we publish new terms is
    // acceptance" is a different clause with a different answer (§19 of the
    // terms, which now gives notice and a right to cancel instead) — folding
    // the two together would make this guard fail on a clause it is not about.
    const impliedConsent = /מהווה הסכמה לשימוש בעוגיות|מסכים לשימוש בעוגיות|you agree to the use of cookies|consent to the use of cookies by continuing/i
    for (const page of ALL_PAGES) {
      check(`A1: ${page} does not treat continued use as consent`, !impliedConsent.test(read(page)))
    }
    check('MUT: the old Hebrew sentence is caught', impliedConsent.test('בהמשך השימוש באתר, אתה מסכים לשימוש בעוגיות כמפורט לעיל.'))
    check('MUT: the old English sentence is caught', impliedConsent.test('By continuing to use the site, you agree to the use of cookies as described above.'))
  }

  console.log('\nB) nothing live describes itself as a draft')
  {
    // A clause published as "draft wording, under review" tells a customer that
    // the company does not know what it agreed to either. §15A carried that
    // label on the live site.
    const draft = /נוסח טיוטה|טיוטה לבדיקה|draft wording|under review\)/
    for (const page of ALL_PAGES) {
      check(`B1: ${page} has no draft marker`, !draft.test(read(page)))
    }
    check('MUT: a draft marker is caught', draft.test('<h2>15א. רשת הקישורים (נוסח טיוטה לבדיקה)</h2>'))
  }

  console.log('\nC) the privacy policy carries the disclosures it was missing')
  {
    // GDPR Art. 13(1)-(2): the purposes AND the legal basis, the retention
    // period, the transfer safeguard, the right to withdraw, and the right to
    // complain to a supervisory authority. Every one of these was absent.
    const required: Array<[string, RegExp, RegExp]> = [
      ['the legal basis for each purpose', /הבסיס החוקי לעיבוד/, /Legal Basis for Processing/],
      ['a legitimate-interests basis the reader can object to', /אינטרס לגיטימי/, /Legitimate interests/],
      ['retention periods', /כמה זמן אנו שומרים מידע/, /How Long We Keep Data/],
      ['international transfers and the safeguard relied on', /סעיפי\s*חוזה תקניים|Standard Contractual Clauses/, /Standard Contractual Clauses/],
      ['the right to withdraw consent', /ביטול הסכמה/, /Withdrawal of consent/],
      ['the right to complain to a regulator', /זכות להגיש תלונה/, /Right to complain/],
      ['US state privacy rights', /זכויות תושבי ארצות הברית/, /Rights of United States Residents/],
      ['the Global Privacy Control signal is honoured', /Global Privacy Control/, /Global Privacy Control/],
      ['automated decision-making', /החלטות אוטומטיות/, /Automated Decisions/],
      ['a minimum age', /גיל מינימום/, /Minimum Age/],
      ['a privacy contact', /איש הקשר לענייני פרטיות/, /Privacy Contact/],
      ['the cookie categories', /עוגיות הכרחיות/, /Strictly necessary/],
    ]
    const he = read(HE_PRIVACY)
    const en = read(EN_PRIVACY)
    for (const [label, hePattern, enPattern] of required) {
      check(`C1 (he): the policy discloses ${label}`, hePattern.test(he))
      check(`C1 (en): the policy discloses ${label}`, enPattern.test(en))
    }
    // A policy may not claim a tool runs unconditionally when it is gated, nor
    // the reverse: the vendors are named WITH the category that gates them.
    check('C2 (he): the measurement vendors are tied to the consent that gates them', /בכפוף לאישור מדידה/.test(he) && /בכפוף לאישור שיווק/.test(he))
    check('C2 (en): the measurement vendors are tied to the consent that gates them', /subject to measurement consent/.test(en) && /subject to marketing consent/.test(en))
    check('C3 (he): the policy says the consent log stores a hash, not an address', /אינה\s*נשמרת ביומן/.test(he))
    check('C3 (en): the policy says the consent log stores a hash, not an address', /The IP address itself is not stored in that log/.test(en))
    check('MUT: a missing legal-basis section is caught', !/הבסיס החוקי לעיבוד/.test(he.replace('הבסיס החוקי לעיבוד', 'משהו אחר')))
  }

  console.log('\nD) Hebrew and English say the same things')
  {
    // Not a translation check — a COUNT check. The two policies are maintained
    // by hand, and a section added to one and forgotten in the other is the
    // failure mode that actually happens.
    const sections = (p: string) => (read(p).match(/<h2>/g) ?? []).length
    for (const [label, a, b] of [['privacy', HE_PRIVACY, EN_PRIVACY], ['terms', HE_TERMS, EN_TERMS], ['accessibility', HE_A11Y, EN_A11Y]] as const) {
      check(`D1 (${label}): both languages have the same number of sections`, sections(a) === sections(b), `${sections(a)} vs ${sections(b)}`)
    }
    // A document that says when it was last updated has to be telling the truth
    // about the version the reader is looking at.
    // Per document, because they are no longer revised together: the privacy
    // policy moved to 5 October 2026 with the partner-program section and the
    // referral cookie, and the accessibility statement did not change.
    check('D2: every document that was changed carries the new date',
      /5 באוקטובר 2026/.test(read(HE_PRIVACY)) && /October 5, 2026/.test(read(EN_PRIVACY))
      && /3 באוקטובר 2026/.test(read(HE_A11Y)) && /October 3, 2026/.test(read(EN_A11Y)))
  }

  console.log('\nE) the accessibility statement is a statement, with a route onwards')
  {
    const he = read(HE_A11Y)
    const en = read(EN_A11Y)
    // The Israeli regulations expect a declared conformance level and a
    // reachable coordinator; a reader who gets no answer needs somewhere to go.
    check('E1 (he): the conformance level is declared, and partial is called partial', /הצהרת ההתאמה/.test(he) && /מותאמים חלקית/.test(he))
    check('E1 (en): the conformance level is declared, and partial is called partial', /Conformance statement/.test(en) && /partially<\/em> conformant|<em>partially<\/em>/.test(en))
    check('E2 (he): a coordinator is named with an email and a phone', /רכז הנגישות/.test(he) && /mailto:oren@gotop\.co\.il/.test(he) && /tel:0549489377/.test(he))
    check('E2 (en): a coordinator is named with an email and a phone', /accessibility coordinator/.test(en) && /mailto:oren@gotop\.co\.il/.test(en))
    check('E3 (he): the enforcement route is given', /נציבות שוויון זכויות לאנשים עם מוגבלות/.test(he))
    check('E3 (en): the enforcement route is given', /Commission for Equal Rights of Persons with Disabilities/.test(en))
    // What is NOT accessible has to be itemised: "some parts may not be" is not
    // a disclosure a reader can act on.
    check('E4 (he): the gaps are itemised, not waved at', /תוכן של צד שלישי/.test(he) && /קבצים שהועלו אלינו/.test(he) && /מסכים חדשים/.test(he))
    check('E4 (en): the gaps are itemised, not waved at', /Third-party content/.test(en) && /Files uploaded to us/.test(en) && /New screens/.test(en))
    check('E5: the EU position is stated rather than left to the reader', /2019\/882/.test(he) && /2019\/882/.test(en))
    check('MUT: dropping the enforcement route is caught', !/נציבות שוויון/.test(he.replace(/נציבות שוויון/g, 'x')))
  }

  console.log('\nF) the terms disclose the consumer rights that override them')
  {
    const he = read(HE_TERMS)
    const en = read(EN_TERMS)
    // The refund policy is the owner's decision and is unchanged. What the
    // terms now do is name the one carve-out they already contained, which the
    // consumer-rights directives require to be disclosed before the contract.
    check('F1 (he): the 14-day withdrawal right is disclosed for EU/UK consumers', /14 יום מכריתת החוזה/.test(he))
    check('F1 (en): the 14-day withdrawal right is disclosed for EU/UK consumers', /within 14 days of entering into/.test(en))
    check('F2 (he): the condition for losing it is disclosed too', /תאבד את זכות הביטול/.test(he))
    check('F2 (en): the condition for losing it is disclosed too', /lose the right of withdrawal/.test(en))
    check('F3 (he): it applies to consumers only, so business customers are unaffected', /חלים על צרכנים פרטיים בלבד/.test(he))
    check('F3 (en): it applies to consumers only, so business customers are unaffected', /apply to private consumers only/.test(en))
    check('F4 (he): Israeli consumer law is preserved', /חוק הגנת הצרכן/.test(he))
    check('F4 (en): Israeli consumer law is preserved', /Israeli Consumer Protection Law/.test(en))
    check('F5 (he): a consumer keeps the mandatory protections of their own law', /ההגנות המחייבות של דין מדינת מושבך/.test(he))
    check('F5 (en): a consumer keeps the mandatory protections of their own law', /mandatory protections of the law of your/.test(en))
    check('F6: sanctioned countries are addressed in both languages', /סנקציות/.test(he) && /subject to sanctions/.test(en))
    // The refund rule itself must NOT have moved: it is the owner's call.
    check('F7: the no-refund rule is intact in both languages',
      /אינם ניתנים להחזר עבור תקופה שכבר החלה או שולמה/.test(he) && /non-refundable for a period that has already begun/.test(en))
    check('MUT: silently granting an unconditional refund is caught',
      !/אינם ניתנים להחזר עבור תקופה שכבר החלה או שולמה/.test(he.replace('אינם ניתנים להחזר עבור תקופה שכבר החלה או שולמה', 'יוחזרו תמיד')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
