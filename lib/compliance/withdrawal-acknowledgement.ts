import type { BillingMarket } from '@/lib/billing/market'

/**
 * WHETHER A PAID CHECKOUT MUST COLLECT THE WITHDRAWAL ACKNOWLEDGEMENT.
 *
 * WHY THIS EXISTS AT ALL. The refund policy in German, French, Italian, Dutch
 * and Polish each states, in its own law's words, two things about the moment
 * the subscription is paid for: that the buyer **expressly requests** us to
 * begin performing before the fourteen-day withdrawal period is over, and that
 * the buyer has **acknowledged** losing the right once the service has been
 * fully performed. Both halves are what §§ 356(4) and 357(8) BGB, art. L221-28
 * of the Code de la consommation, arts. 51(8) and 59(1)(a) of the Codice del
 * Consumo, arts. 6:230p sub d and 6:230s lid 4 BW and arts. 15(3), 35 and
 * 38(1)(1) of the ustawa o prawach konsumenta each make the condition for the
 * right ending early. Until this module existed, every one of those documents
 * said the buyer had made that request and that acknowledgement, and the
 * product collected neither: the checkout had no such control anywhere. The
 * documents were asserting a fact about our own flow that was not true, which
 * is worse than not having the control, because a buyer reading the document
 * would believe a step had happened to them that never had.
 *
 * SO THE CONTROL IS THE POINT, NOT THE WORDING. What this module decides is
 * only WHERE it is shown. The control itself gates the pay button, so a
 * subscription cannot be started without it.
 *
 * WHY THERE IS NO COUNTRY LIST HERE, AND THIS IS DELIBERATE. The obvious
 * design is a territory of the EEA plus the United Kingdom, the way
 * lib/compliance/gdpr-territory.ts and lib/consent/eprivacy-territory.ts each
 * carry one. It was rejected twice over:
 *
 *   A third territory list is a third thing that can drift, and the two that
 *   exist already differ from each other on purpose, in their membership AND
 *   in which way they fail. A reader who has to hold three lists in mind will
 *   eventually reuse the wrong one, and the consequence here is silent: the
 *   control simply stops being shown to someone who was owed it.
 *
 *   The acknowledgement does not need a territory to be truthful. Its wording
 *   names the European Union and the United Kingdom as the places whose
 *   consumer law gives the fourteen-day right, so a buyer outside those places
 *   reads an accurate sentence about law that is not theirs and ticks a box
 *   that takes nothing from them. The error is not symmetric: a box shown to
 *   someone who did not need it costs one line of a screen, and a box withheld
 *   from a consumer who was owed it means the right never ended early at all
 *   — art. 105(1) TRLGDCU and § 356(3) BGB both run the period on for months
 *   when the information was not given.
 *
 * WHICH LEAVES ONE DISTINCTION WORTH DRAWING: Israel. An ILS account is an
 * Israeli buyer (lib/billing/server-market.ts), the Consumer Protection Law
 * 5741-1981 gives its own cancellation right on its own terms, and the refund
 * policy states that right in Hebrew where it belongs. Putting a sentence
 * about the European fourteen days in front of an Israeli buyer would be
 * describing the wrong law to them, so the ILS path is left exactly as it was.
 * Every other market gets the control.
 *
 * WHY IT LIVES IN lib/compliance AND NOT IN lib/billing, where its one input
 * comes from: lib/ai-visibility/__qa__/monthly-check.qa.ts holds every file
 * under lib/billing against CLAUDE.md's rule that plans, prices and quotas are
 * never touched, and that guard is worth more strict than convenient. Nothing
 * here reads or writes a price, so the honest place for it is beside
 * lib/compliance/gdpr-territory.ts, which answers the same shape of question.
 *
 * FAILS TOWARD SHOWING IT. A market this function cannot recognise is not
 * Israel as far as we can tell, so it gets the control.
 */
export function withdrawalAcknowledgementRequired(market: BillingMarket | string | null | undefined): boolean {
  return market !== 'ILS'
}

/** The served path of the refund policy in one public locale. */
export function refundPolicyHref(localePrefix: string): string {
  return `${localePrefix}/refund-policy`
}
