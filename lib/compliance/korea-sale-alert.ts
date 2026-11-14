/**
 * THE ONE PLACE A KOREAN BUYER CAN STILL APPEAR AFTER THE REFUSAL.
 *
 * lib/billing/korea-sale.ts refuses a Korean checkout, and it has exactly one
 * signal to go on: the CDN's country header. That header is the visitor's
 * network, not their tax residence. A buyer behind a VPN, a corporate exit
 * node, or an address the CDN cannot place is NOT refused — that residual is
 * deliberate and documented there, because failing closed on an unplaceable
 * visitor would refuse real customers to catch a rare one.
 *
 * Creem reports the billing country, and it reports it at this webhook, after
 * the checkout it would have refused. So this is the first and only moment a
 * Korean sale becomes visible to us. It has to reach a person, because the
 * decision it raises is not one code can take:
 *
 * - Creem is the merchant of record and remits by billing address (Merchant
 *   Terms cl. 3.2, 3.3.4), so the Korean VAT on a Creem sale is Creem's duty,
 *   not ours. What is NOT settled is cl. 3.7: the disclosure owed to the buyer,
 *   which the legal thread has not yet accepted and which has to be given in
 *   Korean. One sale is not a tax exposure; it is a disclosure that was owed
 *   and may not have been given.
 * - 전자상거래법 제21조 제1항 제1호 binds any business carrying on electronic
 *   commerce and forbids inducement with a material fact withheld. The pricing
 *   pages disclose that paid subscription is not offered in Korea. A buyer who
 *   paid anyway saw that sentence or bypassed the country that renders it, and
 *   which of the two it was is a question about a specific person.
 *
 * WHAT THIS MUST NEVER DO:
 * - It must never block, fail or retry the delivery. The customer has paid;
 *   their plan is the product. Every path returns a result and swallows its own
 *   failures, exactly like lib/compliance/gdpr-territory-alert.ts.
 * - It must never refund, cancel or touch the subscription. Moving a customer's
 *   money is not a decision this code is allowed to take, and an automatic
 *   refund of a lawful sale would be the wrong answer to a disclosure question.
 *   The email says what to consider; the person decides.
 */
import { deliverOperatorEmail, operatorAlertsDisabled, type AlertDeps } from '@/lib/notifications/operator-alerts'
import { escapeEmailHtml } from '@/lib/notifications/email-escape'
import { KOREA_COUNTRY } from '@/lib/billing/korea-sale'

/** Alpha-2, upper case, or null — never anything else in an email body. */
function safeCountry(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) ? code : null
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/**
 * The billing country carried by a verified Creem event, or null.
 *
 * Creem's documented shape is `object.customer.country`, a two-letter code.
 * The other paths are read because Creem nests the same customer under an
 * order on some event types, and because a missing field here means the alert
 * never fires — a silent miss is the one failure mode worth a few extra reads.
 * Anything that is not a two-letter code is treated as absent, never guessed.
 */
export function creemEventBillingCountry(event: unknown): string | null {
  const object = record(record(event)?.object)
  if (!object) return null
  const candidates: unknown[] = [
    record(object.customer)?.country,
    record(record(object.customer)?.billing_address)?.country,
    record(record(object.customer)?.address)?.country,
    record(object.billing_address)?.country,
    record(record(object.order)?.customer)?.country,
    record(record(object.subscription)?.customer)?.country,
  ]
  for (const candidate of candidates) {
    const code = safeCountry(candidate)
    if (code) return code
  }
  return null
}

/** The buyer's email, from the same verified event, or null. */
export function creemEventCustomerEmail(event: unknown): string | null {
  const object = record(record(event)?.object)
  if (!object) return null
  const paths: unknown[] = [
    record(object.customer)?.email,
    record(record(object.order)?.customer)?.email,
    object.customer_email,
  ]
  for (const value of paths) {
    if (typeof value === 'string' && value.includes('@')) return value.trim()
  }
  return null
}

export function buildKoreanSaleAlertHtml(i: {
  country: string
  email: string | null
  eventType: string | null
  when: Date
}): string {
  return [
    '<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7">',
    '<h2>נסגרה מכירה עם כתובת חיוב בקוריאה</h2>',
    `<p><strong>מדינת חיוב:</strong> ${i.country}</p>`,
    i.email ? `<p><strong>כתובת הקונה:</strong> ${escapeEmailHtml(i.email)}</p>` : '',
    i.eventType ? `<p><strong>סוג האירוע:</strong> ${escapeEmailHtml(i.eventType)}</p>` : '',
    `<p><strong>מועד:</strong> ${i.when.toISOString()}</p>`,
    '<hr>',
    '<p>הקופה חוסמת מכירה לקוריאה לפי כתובת ה-IP, ולקונה הזה יש כתובת חיוב קוריאנית, ',
    'כלומר הוא לא נחסם: או שה-CDN לא זיהה את המדינה, או שהוא הגיע דרך VPN. ',
    'קרים מדווחת את כתובת החיוב רק כאן, אחרי התשלום, ולכן זאת הפעם הראשונה שאפשר לראות את זה.</p>',
    '<p><strong>מה זה לא:</strong> לא חוב מע״מ שלנו. בעסקה דרך קרים היא סוחרת הרשומה והיא מדווחת ',
    'ומשלמת את המע״מ הקוריאני לפי כתובת החיוב (סעיפים 3.2 ו-3.3.4 בתנאי הסוחר שלה). ',
    'המנוי של הלקוח תקף ולא נגענו בו.</p>',
    '<p><strong>מה כן צריך להחליט:</strong> הגילוי לקונה. סעיף 3.7 של קרים דורש גילוי שהצוות המשפטי ',
    'עוד לא אישר, והוא צריך להיות בקוריאנית. אם תחליט לבטל או להחזיר כסף, זה שלך לעשות ובאופן יזום. ',
    'המערכת לא מחזירה כסף ולא מבטלת מנוי מעצמה.</p>',
    '</div>',
  ].filter(Boolean).join('\n')
}

export type KoreanSaleAlertResult = { sent: boolean; reason?: string }

/**
 * Called once per verified Creem event, from the webhook route, in its own
 * try/catch and after the entitlement is already saved.
 */
export async function notifyKoreanBillingAddress(
  args: { country: string | null | undefined; email?: string | null; eventType?: string | null; now?: Date },
  deps: AlertDeps = {},
): Promise<KoreanSaleAlertResult> {
  try {
    if (operatorAlertsDisabled(deps.env ?? process.env)) return { sent: false, reason: 'disabled' }
    const country = safeCountry(args.country)
    if (!country) return { sent: false, reason: 'unknown_country' }
    if (country !== KOREA_COUNTRY) return { sent: false, reason: 'not_korea' }

    const now = args.now ?? (deps.now ? deps.now() : new Date())
    const out = await deliverOperatorEmail(
      {
        subject: `מכירה עם כתובת חיוב בקוריאה (${country}) — נדרשת בדיקת גילוי`,
        html: buildKoreanSaleAlertHtml({
          country,
          email: args.email ?? null,
          eventType: args.eventType ?? null,
          when: now,
        }),
      },
      deps,
    )
    return out.sent ? { sent: true } : { sent: false, reason: out.reason }
  } catch (err) {
    console.error('[korea-sale] billing-address alert failed:', err instanceof Error ? err.name : 'unknown')
    return { sent: false, reason: 'error' }
  }
}
