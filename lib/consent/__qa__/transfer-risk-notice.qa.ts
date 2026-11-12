/**
 * THE ART. 49(1)(a) RISK NOTICE, IN THE PLACE THE CONSENT IS GIVEN.
 *
 * Art. 49(1)(a) GDPR permits a transfer to a third country with no adequacy
 * decision where the data subject "has explicitly consented to the proposed
 * transfer, after having been informed of the possible risks of such
 * transfers for the data subject due to the absence of an adequacy decision
 * and appropriate safeguards". Two words in that do the work: BEFORE, and
 * BOTH absences.
 *
 * The risk was stated in the privacy document and the consent was taken in
 * the banner, so the information and the consent were in different places and
 * the one that mattered came second. The legal thread's finding, and its
 * wording, moved it into the marketing category itself, above the checkbox.
 *
 * THE THREE CONSTRAINTS IT SET, each pinned here rather than trusted:
 *
 *   1. It is read before the choice, so it is in the dictionary the dialog
 *      renders and not behind the privacy link.
 *   2. Meta and JVZoo are kept apart. Meta's transfer rests on the standard
 *      contractual clauses in its own processing terms; JVZoo's rests on this
 *      consent alone. Collapsing them would make the sentence false for one.
 *   3. The absence of an adequacy decision AND the absence of safeguards are
 *      both named. "Your data goes abroad" is not this notice.
 *
 * Eleven languages, because a visitor consents in the language they are
 * reading, and a risk they cannot read is not a risk they were informed of.
 */
import {
  CONSENT_CATEGORIES,
  CONSENT_GRANTED,
  CONSENT_POLICY_VERSION,
  CONSENT_WITHOUT_MARKETING,
  actionForChoices,
} from '../categories'
import { PUBLIC_LOCALES } from '../../i18n/locales'
import { getPublicDictionary } from '../../i18n/getPublicDictionary'
import { readFileSync } from 'node:fs'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/**
 * Per locale, split the way the notice itself is split.
 *
 * META: always rendered, because the Meta pixel is loaded wherever marketing is
 * granted. Its transfer rests on the standard contractual clauses in Meta's own
 * processing terms, so the Art. 49 reliance is NOT claimed for it.
 *
 * JVZOO: rendered only where the JVZoo beacon is actually requested. Its
 * transfer rests on this consent alone, so this is the half that has to carry
 * both absences, the authorities, the missing remedy and the withdrawal.
 *
 * Each entry is that locale's own words, from the text the legal thread wrote
 * and approved on 12 Nov 2026, with its two terminology corrections (pt-BR
 * "cláusulas contratuais padrão", pl "identyfikator przeglądarki") and the
 * applicable-law phrasing that replaced "the protection it has here" — "here"
 * is unreliable once language and territory come apart.
 */
const META: Record<string, readonly string[]> = {
  he: ['Meta', 'התניות החוזיות הסטנדרטיות'],
  en: ['Meta', 'standard contractual clauses'],
  es: ['Meta', 'cláusulas contractuales tipo'],
  'pt-BR': ['Meta', 'cláusulas contratuais padrão'],
  fr: ['Meta', 'clauses contractuelles types'],
  it: ['Meta', 'clausole contrattuali tipo'],
  ja: ['Meta', '標準契約条項'],
  de: ['Meta', 'Standardvertragsklauseln'],
  nl: ['Meta', 'standaardcontractbepalingen'],
  pl: ['Meta', 'standardowych klauzulach umownych', 'identyfikator przeglądarki'],
  ko: ['Meta', '표준 계약 조항'],
}

const JVZOO: Record<string, readonly string[]> = {
  he: ['JVZoo', 'אין לנו תניות כאלה', 'החלטת נאותות', 'לפי הדין שחל עליך', 'לחזור מההסכמה'],
  en: ['JVZoo', 'no such clauses', 'adequacy decision', 'under the law that applies to you', 'withdraw'],
  es: ['JVZoo', 'no tenemos tales cláusulas', 'decisión de adecuación', 'conforme al derecho que le resulta aplicable', 'retirar'],
  'pt-BR': ['JVZoo', 'não temos cláusulas desse tipo', 'decisão de adequação', 'conforme a lei que se aplica a você', 'retirar'],
  fr: ['JVZoo', "n'avons pas de telles clauses", "décision d'adéquation", 'en vertu du droit qui vous est applicable', 'retirer'],
  it: ['JVZoo', 'non abbiamo clausole di questo genere', 'decisione di adeguatezza', 'in base al diritto a Lei applicabile', 'revocare'],
  ja: ['JVZoo', 'そのような条項がなく', '十分性認定', 'お客様に適用される法', '撤回'],
  de: ['JVZoo', 'keine solchen Klauseln', 'Angemessenheitsbeschluss', 'nach dem für Sie geltenden Recht', 'widerrufen'],
  nl: ['JVZoo', 'zulke bepalingen niet', 'adequaatheidsbesluit', 'op grond van het recht dat op u van toepassing is', 'intrekken'],
  pl: ['JVZoo', 'nie mamy takich klauzul', 'odpowiedni stopień ochrony', 'na podstawie prawa, które ma do Państwa zastosowanie', 'wycofać'],
  ko: ['JVZoo', '그런 조항이 없으므로', '적정성 결정', '고객님에게 적용되는 법', '철회'],
}

console.log('A. every language a visitor can consent in carries the notice')
for (const locale of PUBLIC_LOCALES) {
  const marketing = getPublicDictionary(locale).cookie.categories.marketing
  const risk: string = 'risk' in marketing ? marketing.risk : ''
  const jvzoo: string = 'riskJvzoo' in marketing ? marketing.riskJvzoo : ''
  // Thresholds in characters, so they are set where Japanese and Korean —
  // which say the same thing in far fewer of them — still pass: this check is
  // only here to catch an empty or stub string. The word lists below are what
  // actually hold the content.
  check(`A1 (${locale}): the marketing category carries both halves of the notice`,
    risk.length > 80 && jvzoo.length > 150, `meta ${risk.length} chars, jvzoo ${jvzoo.length} chars`)
  const missingMeta = (META[locale] ?? ['NO WORD LIST FOR THIS LOCALE']).filter((w) => !risk.includes(w))
  check(`A2 (${locale}): the always-rendered half names Meta and its contractual clauses`,
    missingMeta.length === 0, missingMeta.join(' | '))
  const missingJvzoo = (JVZOO[locale] ?? ['NO WORD LIST FOR THIS LOCALE']).filter((w) => !jvzoo.includes(w))
  check(`A3 (${locale}): the JVZoo half names it, both absences, the applicable law and the withdrawal`,
    missingJvzoo.length === 0, missingJvzoo.join(' | '))
  check(`A4 (${locale}): the halves stay apart, so neither claims the other's basis`,
    !risk.includes('JVZoo') && !jvzoo.includes(META[locale]?.[1] ?? 'x'))
  check(`A5 (${locale}): and neither is the category description doing double duty`,
    risk !== marketing.desc && jvzoo !== marketing.desc)
}

console.log('\nB. the other categories carry none, so the notice means what it says')
for (const locale of PUBLIC_LOCALES) {
  const categories = getPublicDictionary(locale).cookie.categories
  const stray = CONSENT_CATEGORIES.filter((c) => c !== 'marketing' && ('risk' in categories[c] || 'riskJvzoo' in categories[c]))
  check(`B1 (${locale}): only the marketing category has one`, stray.length === 0, stray.join(','))
}

console.log('\nD. the banner cannot take the consent the notice belongs to')
{
  const src = readFileSync('components/CookieConsent.tsx', 'utf8')
  const noComments = src.replace(/\/\/.*$/gm, '')
  check('D1: accept on the card grants analytics and NOT marketing',
    CONSENT_WITHOUT_MARKETING.analytics === true && CONSENT_WITHOUT_MARKETING.marketing === false
    && CONSENT_WITHOUT_MARKETING.necessary === true)
  check('D2: the card is wired to it, not to the all-categories constant',
    /handleAccept = \(\) =>\s*\n?\s*decide\(actionForChoices\(CONSENT_WITHOUT_MARKETING/.test(noComments)
    && !/decide\('accept_all', CONSENT_GRANTED\)/.test(noComments))
  check('D3: the action is computed, so the log says what was granted',
    actionForChoices(CONSENT_WITHOUT_MARKETING, null) === 'custom'
    && actionForChoices(CONSENT_GRANTED, null) === 'accept_all')
  check('D4: refusing is still one click from the card, so the buttons stay peers',
    /handleReject = \(\) => decide\('reject_all', CONSENT_DENIED\)/.test(noComments))
  check('D5: and the card says in one line that marketing takes one more step',
    (noComments.match(/\{t\.marketingStep\}/g) || []).length === 2)
  check('D-MUT2: the wiring guard catches the old all-granting accept coming back',
    /decide\('accept_all', CONSENT_GRANTED\)/.test(
      noComments.replace(/decide\(actionForChoices\(CONSENT_WITHOUT_MARKETING[^\n]*/, "decide('accept_all', CONSENT_GRANTED)")))
}

for (const locale of PUBLIC_LOCALES) {
  const cookie = getPublicDictionary(locale).cookie
  check(`D6 (${locale}): the one-line reason is translated, and names the country`,
    cookie.marketingStep.length > 40
    && /ארצות הברית|United States|Estados Unidos|États-Unis|Stati Uniti|米国|Vereinigten Staaten|Verenigde Staten|Stanów Zjednoczonych|미국/.test(cookie.marketingStep),
    cookie.marketingStep.slice(0, 40))
  check(`D7 (${locale}): and the accept button no longer promises every category`,
    !/הכל|all|todo|tout|tutto|すべて|alle|wszystk|모두/i.test(cookie.accept), cookie.accept)
}

console.log('\nC. it is rendered above the checkbox that gives the consent')
{
  const src = readFileSync('components/consent/ConsentPreferences.tsx', 'utf8')
  const noComments = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  check('C1: the dialog renders the notice', /\{copy\.risk\}/.test(noComments))
  check('C2: it is guarded, because only one category has one', /'risk' in copy \?/.test(noComments))
  const riskAt = noComments.indexOf('{copy.risk}')
  const inputAt = noComments.indexOf('type="checkbox"')
  check('C3: and it comes BEFORE the checkbox in the document, not after it',
    riskAt > 0 && inputAt > 0 && riskAt < inputAt, `risk ${riskAt}, checkbox ${inputAt}`)
  check('C-MUT1: the order guard catches a notice moved below the checkbox',
    (() => {
      const moved = noComments.replace('{copy.risk}', '').replace('type="checkbox"', 'type="checkbox"{copy.risk}')
      return moved.indexOf('{copy.risk}') > moved.indexOf('type="checkbox"')
    })())
}

console.log('\nE. the JVZoo half is rendered exactly where JVZoo is contacted')
{
  // The notice is chosen by LANGUAGE; the beacon by COUNTRY. Those do not line
  // up. In Korea the beacon never fires, so a Korean visitor reading the Korean
  // string would be told their consent is the only basis for a transfer that
  // will not happen; and a Korean-speaking visitor in France does get the
  // beacon, so the string cannot drop JVZoo either. One server decision, the
  // same one the sales page makes, settles it.
  const panel = readFileSync('components/consent/ConsentPreferences.tsx', 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  const card = readFileSync('components/CookieConsent.tsx', 'utf8').replace(/\/\/.*$/gm, '')
  const widgets = readFileSync('components/public/PublicSiteWidgets.tsx', 'utf8').replace(/\/\/.*$/gm, '')
  const layout = readFileSync('app/layout.tsx', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  check('E1: the panel renders the JVZoo half only when the beacon is not suppressed',
    /'riskJvzoo' in copy && !beaconSuppressed \?/.test(panel))
  check('E2: the Meta half carries no such condition, because the pixel loads everywhere',
    /'risk' in copy \?/.test(panel))
  check('E3: the decision is taken on the server, from the request headers, not guessed in the browser',
    /beaconSuppressedForCountry\(country\)/.test(layout)
    && /beaconSuppressedForCountry/.test(readFileSync('lib/consent/eprivacy-territory.ts', 'utf8')))
  check('E4: and it travels the whole way down: layout, notice, card, panel',
    /<PublicConsentNotice [^>]*beaconSuppressed=\{beaconSuppressed\}/.test(layout)
    && /<CookieConsent [^>]*beaconSuppressed=\{beaconSuppressed\}/.test(widgets)
    && /beaconSuppressed=\{beaconSuppressed\}/.test(card))
  // The same mismatch one layer up: the affiliate-attribution PURPOSE names a
  // United States recipient one line above the checkbox. Where the beacon is
  // suppressed no transfer happens, so the clause is left out rather than
  // explained, and the Korean checkbox carries no transfer claim at all.
  check('E5: the category description is split the same way, and gated the same way',
    /'descJvzoo' in copy && !beaconSuppressed \?/.test(panel))
  for (const locale of PUBLIC_LOCALES) {
    const marketing = getPublicDictionary(locale).cookie.categories.marketing
    const descJvzoo: string = 'descJvzoo' in marketing ? marketing.descJvzoo : ''
    check(`E6 (${locale}): JVZoo is named in the gated half of the description and nowhere else in it`,
      descJvzoo.includes('JVZoo') && !marketing.desc.includes('JVZoo'),
      `${marketing.desc.slice(0, 50)} || ${descJvzoo.slice(0, 50)}`)
    check(`E7 (${locale}): and the always-rendered half still names the two networks it always covered`,
      /Google/.test(marketing.desc) && /Meta/.test(marketing.desc))
  }
  check('E-MUT1: the condition guard catches a panel that rendered the JVZoo half unconditionally',
    !/'riskJvzoo' in copy && !beaconSuppressed \?/.test(
      panel.replace(/'riskJvzoo' in copy && !beaconSuppressed \?/g, "'riskJvzoo' in copy ?")))
  check('E-MUT2: …and one that took the decision in the browser instead of from the headers',
    !/beaconSuppressedForCountry\(country\)/.test(
      layout.replace(/beaconSuppressedForCountry\(country\)/g, 'suppressedInBrowser()')))
}

console.log('\nF. the stored consents taken before the notice stop counting')
{
  const src = readFileSync('lib/consent/categories.ts', 'utf8')
  check('F1: the policy version is the day the notice shipped, not older',
    CONSENT_POLICY_VERSION >= '2026-11-12', CONSENT_POLICY_VERSION)
  check('F2: and the store still reads an older record as no decision, so it re-asks',
    /parsed\.policy !== CONSENT_POLICY_VERSION\) return null/
      .test(readFileSync('lib/consent/client-store.ts', 'utf8')))
  check('F-MUT3: the version guard catches the bump being reverted',
    !('2026-10-29' >= '2026-11-12') && src.includes(CONSENT_POLICY_VERSION))
}

console.log('\nMUTATION CONTROLS, against the real dictionaries')
{
  const he = getPublicDictionary('he').cookie.categories.marketing
  const risk: string = 'riskJvzoo' in he ? he.riskJvzoo : ''
  check('M1: the word guard fails on a notice that drops the absent adequacy decision',
    (JVZOO.he ?? []).some((w) => !risk.replaceAll('החלטת נאותות', '').includes(w)))
  check('M2: …and on one that collapses JVZoo into Meta',
    (JVZOO.he ?? []).some((w) => !risk.replaceAll('JVZoo', 'Meta').includes(w)))
  check('M3: …and on one shortened to "your data goes abroad"',
    (JVZOO.he ?? []).some((w) => !'המידע שלך עובר לחו״ל.'.includes(w)))
  check('M4: …and on one that went back to "the protection it has here"',
    (JVZOO.he ?? []).some((w) => !risk.replaceAll('לפי הדין שחל עליך', 'כאן').includes(w)))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1

export {}
