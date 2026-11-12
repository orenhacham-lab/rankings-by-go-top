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
import { CONSENT_CATEGORIES } from '../categories'
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

/** Per locale: the recipients, the two bases kept apart, both absences, and
 *  the withdrawal. Each entry is that locale's own words, taken from the text
 *  the legal thread wrote and approved on 12 Nov 2026. */
const WORDS: Record<string, readonly string[]> = {
  he: ['Meta', 'JVZoo', 'התניות החוזיות הסטנדרטיות', 'אין לנו תניות כאלה', 'החלטת נאותות', 'לחזור מההסכמה'],
  en: ['Meta', 'JVZoo', 'standard contractual clauses', 'no such clauses', 'adequacy decision', 'withdraw'],
  es: ['Meta', 'JVZoo', 'cláusulas contractuales tipo', 'no tenemos tales cláusulas', 'decisión de adecuación', 'retirar'],
  'pt-BR': ['Meta', 'JVZoo', 'cláusulas-padrão contratuais', 'não temos cláusulas desse tipo', 'decisão de adequação', 'retirar'],
  fr: ['Meta', 'JVZoo', 'clauses contractuelles types', "n'avons pas de telles clauses", "décision d'adéquation", 'retirer'],
  it: ['Meta', 'JVZoo', 'clausole contrattuali tipo', 'non abbiamo clausole di questo genere', 'decisione di adeguatezza', 'revocare'],
  ja: ['Meta', 'JVZoo', '標準契約条項', 'そのような条項がなく', '十分性認定', '撤回'],
  de: ['Meta', 'JVZoo', 'Standardvertragsklauseln', 'keine solchen Klauseln', 'Angemessenheitsbeschluss', 'widerrufen'],
  nl: ['Meta', 'JVZoo', 'standaardcontractbepalingen', 'zulke bepalingen niet', 'adequaatheidsbesluit', 'intrekken'],
  pl: ['Meta', 'JVZoo', 'standardowych klauzulach umownych', 'nie mamy takich klauzul', 'odpowiedni stopień ochrony', 'wycofać'],
  ko: ['Meta', 'JVZoo', '표준 계약 조항', '그런 조항이 없으므로', '적정성 결정', '철회'],
}

console.log('A. every language a visitor can consent in carries the notice')
for (const locale of PUBLIC_LOCALES) {
  const marketing = getPublicDictionary(locale).cookie.categories.marketing
  const risk: string = 'risk' in marketing ? marketing.risk : ''
  check(`A1 (${locale}): the marketing category carries a risk notice at all`,
    typeof risk === 'string' && risk.length > 200, `${risk.length} chars`)
  const missing = (WORDS[locale] ?? ['NO WORD LIST FOR THIS LOCALE']).filter((w) => !risk.includes(w))
  check(`A2 (${locale}): it names both recipients, both bases, the absence and the withdrawal`,
    missing.length === 0, missing.join(' | '))
  check(`A3 (${locale}): and it is not the category description doing double duty`,
    risk !== marketing.desc)
}

console.log('\nB. the other categories carry none, so the notice means what it says')
for (const locale of PUBLIC_LOCALES) {
  const categories = getPublicDictionary(locale).cookie.categories
  const stray = CONSENT_CATEGORIES.filter((c) => c !== 'marketing' && 'risk' in categories[c])
  check(`B1 (${locale}): only the marketing category has one`, stray.length === 0, stray.join(','))
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

console.log('\nMUTATION CONTROLS, against the real dictionaries')
{
  const he = getPublicDictionary('he').cookie.categories.marketing
  const risk: string = 'risk' in he ? he.risk : ''
  check('M1: the word guard fails on a notice that drops the absent adequacy decision',
    (WORDS.he ?? []).some((w) => !risk.replaceAll('החלטת נאותות', '').includes(w)))
  check('M2: …and on one that collapses JVZoo into Meta',
    (WORDS.he ?? []).some((w) => !risk.replaceAll('JVZoo', 'Meta').includes(w)))
  check('M3: …and on one shortened to "your data goes abroad"',
    (WORDS.he ?? []).some((w) => !'המידע שלך עובר לחו״ל.'.includes(w)))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1

export {}
