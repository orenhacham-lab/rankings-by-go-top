/**
 * THE META PIXEL IS OURS NOW, AND IT IS BOUND TO THE MARKETING CATEGORY.
 *
 * It used to live as a Custom HTML tag inside the GTM container, and that is
 * why it had to move. Measured on the live site on 17 October 2026: a visitor
 * who allowed "measurement" and refused "marketing" still loaded
 * connect.facebook.net and still had the pixel initialise, because none of the
 * container's tags carried consent settings and the tag therefore fired on
 * every container load. Our loader requests gtm.js when EITHER category is
 * granted, so refusing marketing was not honoured for Meta at all — while the
 * cookie notice says in four languages that nothing in a category loads before
 * that category is allowed.
 *
 * In our own code the gate is a predicate we can test, and the signals are:
 *
 *   marketing granted   fbevents.js is fetched, the pixel is initialised, and
 *                       PageView is sent.
 *   anything else       connect.facebook.net is never contacted. Not for a
 *                       visitor with no decision, not for a reject-all, and not
 *                       for the analytics-only visitor that used to leak.
 *   withdrawal          `fbq('consent','revoke')` the moment marketing goes
 *                       off. The script element cannot be un-run, so revoke is
 *                       how an already-loaded pixel is told to stop sending.
 *
 * The id is not a secret: it ships in the page by construction, exactly as it
 * did from the container.
 */
import type { ConsentChoices } from './categories'

export const META_PIXEL_ID = '1427506179136706'
export const META_PIXEL_SRC = 'https://connect.facebook.net/en_US/fbevents.js'

/** The conversion Meta's ad sets optimise on. Nothing else is ever sent. */
export const META_SIGNUP_EVENT = 'CompleteRegistration'

/**
 * The gate, as one testable expression: the pixel is a marketing tool, so the
 * analytics grant must not reach it. This is the line whose absence was the
 * whole defect.
 */
export function metaPixelAllowed(choices: ConsentChoices): boolean {
  return choices.marketing === true
}
