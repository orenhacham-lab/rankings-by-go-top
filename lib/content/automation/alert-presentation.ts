/**
 * What an alert SAYS to a merchant — one pure composer, so the test drives the
 * same code the card renders rather than a copy of it.
 *
 * Two rules it exists to enforce:
 *   - the heading comes from the alert's own channel, never from a constant.
 *     "WordPress publish failed" was hard-coded and shown for Shopify failures
 *     on projects with no WordPress connection at all;
 *   - only a typed reason CODE is ever looked up. There is no path here that
 *     accepts free text, so a raw provider/GraphQL detail cannot reach the
 *     screen even if one were to appear in the payload — an unknown code
 *     degrades to a localized sentence instead.
 */

import type { ActiveAlert, AlertHeading } from './alert-read-model'

export interface AlertPresentationDict {
  alertBlockedTitle: string
  alertPublishFailedShopify: string
  alertPublishFailedWordPress: string
  alertPublishFailedGeneric: string
  alertAttempts: string
  alertReasonOther: string
  genErrors: Record<string, string>
}

export interface AlertPresentation {
  heading: string
  detail: string
}

function headingText(heading: AlertHeading, t: AlertPresentationDict): string {
  switch (heading) {
    case 'publish_blocked': return t.alertBlockedTitle
    case 'publish_failed_shopify': return t.alertPublishFailedShopify
    case 'publish_failed_wordpress': return t.alertPublishFailedWordPress
    // No channel on the record: say what is true — publishing failed — rather
    // than naming a platform the row does not name.
    default: return t.alertPublishFailedGeneric
  }
}

export function presentAlert(alert: ActiveAlert, t: AlertPresentationDict): AlertPresentation {
  const heading = `${headingText(alert.heading, t)}${alert.title ? ` — ${alert.title}` : ''}`
  const attempts = t.alertAttempts.replace('{n}', String(alert.attempts))
  const reason = alert.reasonCode ? (t.genErrors[alert.reasonCode] ?? t.alertReasonOther) : null
  return { heading, detail: reason ? `${attempts} · ${reason}` : attempts }
}
