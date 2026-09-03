/**
 * The ONE mapping from an image-generation failure code to its HTTP status.
 *
 * This decision existed three times — twice as a copied
 * `inlineImageFailureStatus()` in the two inline-image routes, and once more as
 * a separate ternary in the featured-image route. Three copies of one rule is
 * exactly how the original defect came back: the featured-image route had
 * already drifted to a flat 502 for every cause, so a verified billing verdict
 * and a transient entitlement outage both read to the merchant as "the image
 * engine returned no image".
 *
 * The distinction it preserves:
 *
 *   billing_required        403 — a VERIFIED billing verdict; terminal, and the
 *                                 merchant needs an active plan.
 *   entitlement_unavailable 503 — the entitlement could not be DETERMINED; an
 *                                 outage, safe and correct to retry.
 *   anything else           502 — the image provider itself failed.
 */
export type ImageGenerationHttpStatus = 403 | 503 | 502

export function imageGenerationHttpStatus(error: string): ImageGenerationHttpStatus {
  if (error === 'billing_required') return 403
  if (error === 'entitlement_unavailable') return 503
  return 502
}
