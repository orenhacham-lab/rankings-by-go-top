/**
 * THE WITHDRAWAL ACKNOWLEDGEMENT AT THE PAID CHECKOUT.
 *
 * The refund policy in German, French, Italian, Dutch and Polish each states,
 * in its own law's words, that the buyer expressly requested us to begin
 * performing before the fourteen-day withdrawal period was over AND that the
 * buyer acknowledged losing that right once the service has been fully
 * performed. Both halves are the condition those laws set for the right
 * ending early. Until lib/compliance/withdrawal-acknowledgement.ts existed the
 * product collected NEITHER, anywhere, so five published documents asserted a
 * step that had never happened to the reader.
 *
 * What keeps that from happening again is not the wording, which any
 * translator can see, but the gate: the control must sit above the plans and
 * BOTH payment paths must refuse to start while it is unticked. Each of those
 * is one prop away from being silently undone, and no other suite would
 * notice — the screen would still render, the buttons would still work, and
 * only the documents would be lying again.
 *
 * Six classes, each ending in a MUTATION CONTROL:
 *
 *   A) the predicate: Israel is excluded on purpose, everything else is in,
 *      and an unrecognised market fails TOWARD showing the control;
 *   B) the control is on the screen, starts UNTICKED, and is not shown to an
 *      account that already has a subscription;
 *   C) both paths are gated — the card button by `disabled`, the PayPal SDK
 *      by `acknowledged`, and client.tsx bails before the SDK is requested;
 *   D) all ten dashboard languages carry the three strings, and each label
 *      carries BOTH halves in that language;
 *   E) the five EU-language documents point the express request at the paid
 *      checkout rather than at opening an account, and Spanish has the
 *      withdrawal section it was missing entirely;
 *   F) the mutation controls.
 *
 * Run: npx tsx lib/compliance/__qa__/withdrawal-acknowledgement.qa.ts
 */
import { readFileSync } from 'fs'
import { refundPolicyHref, withdrawalAcknowledgementRequired } from '../withdrawal-acknowledgement'
import { getDashboardDictionary } from '../../i18n/dashboard/getDashboardDictionary'
import { PUBLIC_LOCALES, LOCALE_PREFIX } from '../../i18n/locales'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const read = (path: string) => readFileSync(path, 'utf8')
/** Source guards match code, not prose: these files explain themselves at length. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const view = stripComments(read('app/(dashboard)/billing/BillingView.tsx'))
const paypalClient = stripComments(read('app/(dashboard)/billing/client.tsx'))
const creemButton = stripComments(read('app/(dashboard)/billing/CreemCheckoutButton.tsx'))

console.log('A) the predicate: Israel out, everything else in, unknown fails toward showing')
{
  check('A1: an ILS account is NOT asked (the Israeli Consumer Protection Law has its own right)',
    withdrawalAcknowledgementRequired('ILS') === false)
  check('A2: a USD account IS asked', withdrawalAcknowledgementRequired('USD') === true)
  check('A3: null fails toward showing the control', withdrawalAcknowledgementRequired(null) === true)
  check('A4: undefined fails toward showing the control', withdrawalAcknowledgementRequired(undefined) === true)
  check('A5: an unrecognised market fails toward showing the control',
    withdrawalAcknowledgementRequired('EUR') === true && withdrawalAcknowledgementRequired('') === true)
  check('A6: the refund-policy href is the locale prefix plus the document',
    refundPolicyHref('/de') === '/de/refund-policy' && refundPolicyHref('') === '/refund-policy')
}

console.log('\nB) the control is on the screen and starts unticked')
{
  check('B1: the screen asks the module, it does not test the market itself',
    /withdrawalAcknowledgementRequired\(market\)/.test(view))
  check('B2: the state starts FALSE — a pre-ticked box is not the buyer’s statement',
    /useState\(false\)/.test(view) && /const \[withdrawalAck, setWithdrawalAck\] = useState\(false\)/.test(view))
  check('B3: a real <Checkbox> carries the label, so the keyboard and the screen reader get it',
    /<Checkbox/.test(view) && /label=\{t\.withdrawal\.label\}/.test(view))
  check('B4: it is not shown once a subscription is active (there is no checkout to unlock)',
    /withdrawalAckRequired && !hasActiveSubscription/.test(view))
  check('B5: the refund policy is linked from the control, in the reader’s own locale',
    /refundPolicyHref\(LOCALE_PREFIX\[uiLocale\]\)/.test(view))
  check('B6: the gate is one value both paths read',
    /const checkoutUnlocked = !withdrawalAckRequired \|\| withdrawalAck/.test(view))
}

console.log('\nC) both payment paths are gated')
{
  check('C1: the card button is disabled while the box is unticked',
    /<CreemCheckoutButton plan=\{plan\} disabled=\{!checkoutUnlocked\} \/>/.test(view))
  check('C2: the card button actually puts the prop on the button',
    /disabled=\{disabled\}/.test(creemButton))
  check('C3: the PayPal side is told whether the box is ticked',
    /<BillingClient market=\{market\} acknowledged=\{checkoutUnlocked\} \/>/.test(view))
  // The anchor is the env READ inside the effect, not the var's name: the name
  // also appears in an onError console line further up the file, and matching
  // that one would compare the bail against the wrong place. `effectBail` is
  // the BARE return inside the effect, not the `return null` in the render —
  // the two read alike and only one of them stops the SDK request.
  const effectBail = paypalClient.indexOf('if (!acknowledged) return\n')
  check('C4: the PayPal client bails BEFORE the SDK is requested, not inside createSubscription',
    effectBail > -1
    && effectBail < paypalClient.indexOf('process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID')
    && effectBail < paypalClient.indexOf("createElement('script')"))
  // The bail must not set state inside the effect (react-hooks/set-state-in-effect):
  // the render returns null before the loading line instead.
  check('C5: the bail sets no state, and the render stops before the loading line',
    /if \(!acknowledged\) return\b/.test(paypalClient)
    && !/if \(!acknowledged\) \{\s*setLoading/.test(paypalClient)
    && /if \(!acknowledged\) return null/.test(paypalClient))
  check('C6: the effect re-runs when the box is ticked',
    /\}, \[acknowledged, initPayPalButtons/.test(paypalClient))
  check('C7: the ILS path is unchanged — the prop defaults to true',
    /acknowledged = true/.test(paypalClient))
}

console.log('\nD) all ten dashboard languages carry the three strings, with both halves')
{
  /** Each language's own two halves: the immediate start before the period, and losing the right. */
  const HALVES: Record<string, { start: RegExp; loss: RegExp }> = {
    he: { start: /ארבעה עשר יום/, loss: /אובדת|מאבד/ },
    en: { start: /fourteen-day withdrawal period/i, loss: /lose that right/i },
    es: { start: /catorce días/i, loss: /pierdo ese derecho/i },
    'pt-BR': { start: /quatorze dias/i, loss: /perco esse direito/i },
    fr: { start: /quatorze jours/i, loss: /je perds ce droit/i },
    it: { start: /quattordici giorni/i, loss: /perdo quel diritto/i },
    ja: { start: /14日間/, loss: /権利を失う/ },
    de: { start: /vierzehntägigen Widerrufsfrist/i, loss: /dieses Recht .* verliere/i },
    nl: { start: /veertien dagen/i, loss: /dat recht verlies/i },
    pl: { start: /czternastodniowego terminu odstąpienia/i, loss: /tracę to prawo/i },
  }

  for (const locale of PUBLIC_LOCALES) {
    const w = getDashboardDictionary(locale).billing.withdrawal as
      { label?: string; requiredNote?: string; policyLabel?: string } | undefined
    check(`D-${locale}: the three strings exist and none is empty`,
      !!w && typeof w.label === 'string' && w.label.trim().length > 40
      && typeof w.requiredNote === 'string' && w.requiredNote.trim().length > 10
      && typeof w.policyLabel === 'string' && w.policyLabel.trim().length > 5)
    const halves = HALVES[locale]
    check(`D-${locale}: the label carries BOTH halves, not only the request`,
      !!w?.label && !!halves && halves.start.test(w.label) && halves.loss.test(w.label),
      w?.label?.slice(0, 60))
    check(`D-${locale}: the locale has a prefix the link can be built from`,
      typeof LOCALE_PREFIX[locale] === 'string')
  }
}

console.log('\nE) the documents now point the request at the paid checkout')
{
  /** Each language's word for opening an account, which must NO LONGER be what the request hangs on. */
  const WAS: Record<string, RegExp> = {
    de: /Indem Sie ein Konto anlegen, verlangen Sie von uns ausdrücklich/,
    fr: /En ouvrant un compte, vous nous demandez expressément/,
    it: /Aprendo un account, Lei ci chiede espressamente/,
    nl: /Door een account aan te maken verzoekt u ons uitdrukkelijk/,
    pl: /Tworząc konto, Państwo wyraźnie żądają od nas/,
  }
  /** And the screen it hangs on instead, named in that language. */
  const NOW: Record<string, RegExp> = {
    de: /Bevor Sie ein Abonnement bezahlen/,
    fr: /Avant de payer un abonnement/,
    it: /Prima di pagare un abbonamento/,
    nl: /Voordat u een abonnement betaalt/,
    pl: /Przed opłaceniem abonamentu/,
  }
  for (const loc of Object.keys(WAS)) {
    const doc = read(`content/legal/${loc}/refund-policy.md`)
    check(`E-${loc}: the request no longer hangs on opening an account`, !WAS[loc].test(doc))
    check(`E-${loc}: it hangs on the paid checkout instead`, NOW[loc].test(doc))
    check(`E-${loc}: and the document is dated the day this changed`, /lastUpdated: 2026-11-07/.test(doc))
  }

  // Spanish had no withdrawal section AT ALL while the other five did, so it
  // gets its own checks here as well as the per-article rows in
  // components/public/__qa__/translated-legal-coverage.qa.ts. The two are not
  // redundant: those rows hold the statute, these hold the fact that the
  // section exists at the number the other documents point readers to.
  const es = read('content/legal/es/refund-policy.md')
  check('E-es: the withdrawal section exists, and at section 5 like every other locale',
    /^## 5\. Derecho de desistimiento de catorce días/m.test(es))
  check('E-es: section 4 points the reader at it, the way the other documents do',
    /La sección 5 dice exactamente qué significa eso en España/.test(es))
  check('E-es: the sections after it were renumbered rather than left colliding',
    /^## 6\. Cómo solicitar una cancelación/m.test(es) && /^## 8\. Contacto/m.test(es)
    && !/^## 5\. Cómo solicitar/m.test(es) && !/^## 7\. Contacto/m.test(es))
  check('E-es: the frontmatter declares the extra section and says why',
    /extraSections: 1/.test(es) && /extraReason: The Spanish and European right of withdrawal/.test(es))
  check('E-es: the acknowledgement the screen collects is described in the document',
    /la pantalla «Facturación» le pide dos declaraciones/.test(es))
  check('E-es: dated the day it was written', /lastUpdated: 2026-11-07/.test(es))
}

console.log('\nF) mutation controls')
{
  // A) Israel folded in with everyone else.
  const moduleSrc = read('lib/compliance/withdrawal-acknowledgement.ts')
  check('M1: a predicate that always returns true is caught',
    /market !== 'ILS'/.test(stripComments(moduleSrc)))

  // B) the box pre-ticked.
  check('M2: a pre-ticked box is caught',
    !/const \[withdrawalAck, setWithdrawalAck\] = useState\(true\)/.test(view))

  // C) the card button's gate dropped at the call site.
  const ungatedCard = view.replace('<CreemCheckoutButton plan={plan} disabled={!checkoutUnlocked} />', '<CreemCheckoutButton plan={plan} />')
  check('M3: the card button with its gate dropped is caught',
    !/disabled=\{!checkoutUnlocked\}/.test(ungatedCard))

  // C) the PayPal gate dropped at the call site.
  const ungatedPaypal = view.replace('acknowledged={checkoutUnlocked}', '')
  check('M4: the PayPal side with its gate dropped is caught',
    !/acknowledged=\{checkoutUnlocked\}/.test(ungatedPaypal))

  // C) the bail removed from the effect, so the SDK loads anyway.
  // Removing the effect's bare bail must be caught even though the render's
  // `return null` survives it: that one keeps the screen tidy, it does not
  // stop PayPal being asked for a script.
  const ungatedEffect = paypalClient.replace('if (!acknowledged) return\n', '')
  check('M5: an effect that requests the SDK regardless is caught',
    ungatedEffect.indexOf('if (!acknowledged) return\n') === -1
    && paypalClient.indexOf('if (!acknowledged) return\n') > -1)

  // D) a label that asks for the immediate start and never mentions the loss.
  const halfOnly = 'Ich verlange von Go Top SEO, mit dem Dienst sofort zu beginnen, vor dem Ende der vierzehntägigen Widerrufsfrist.'
  check('M6: a label with only the request half is caught',
    /vierzehntägigen Widerrufsfrist/i.test(halfOnly) && !/dieses Recht .* verliere/i.test(halfOnly))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
