/**
 * THE HAND THAT GOES UP WHEN "OCCASIONAL" STOPS BEING TRUE.
 *
 * lib/compliance/gdpr-territory.ts explains the whole position: we rely on
 * Art. 27(2)(a) GDPR, which exempts occasional processing from the duty to
 * designate a representative in the Union, and that reliance rests on the fact
 * that we have no customer there. An account created from the territory ends
 * the fact. From that moment the processing is regular and deliberate — an
 * account, a project, scans, reports, emails — and a representative is owed in
 * the Union, or in the United Kingdom under its own Art. 27.
 *
 * So this is not an analytics notice. It is the one event that obliges a
 * decision, and it has to reach a person on the day, because the alternative
 * is finding out from a supervisory authority. The alert says what to do.
 *
 * WHAT IT DOES NOT DO: it does not block the sign-up, and it must never be
 * made to. Refusing a paying customer to avoid a 420-euro-a-year appointment
 * would be the wrong way round, and a geo-block on account creation is a
 * product decision nobody has taken. Every path here returns a result and
 * swallows its own failures, exactly as the operator alerts around it do: an
 * alert is worth less than the sign-up it would otherwise break.
 */
import { deliverOperatorEmail, operatorAlertsDisabled, type AlertDeps } from '@/lib/notifications/operator-alerts'
import { escapeEmailHtml } from '@/lib/notifications/email-escape'
import { inGdprTerritory } from './gdpr-territory'

/** How fresh an account must be for its sign-in to count as its sign-up. */
export const FRESH_ACCOUNT_MS = 10 * 60 * 1000

/** Alpha-2, upper case, or null — never anything else in an email body. */
function safeCountry(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) ? code : null
}

export function buildGdprTerritorySignupHtml(i: { country: string; email: string | null; when: Date }): string {
  const when = i.when.toISOString()
  return [
    '<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7">',
    '<h2>נפתח חשבון ממדינה שחל בה ה-GDPR</h2>',
    `<p><strong>מדינה:</strong> ${i.country}</p>`,
    i.email ? `<p><strong>כתובת:</strong> ${escapeEmailHtml(i.email)}</p>` : '',
    `<p><strong>מועד:</strong> ${when}</p>`,
    '<hr>',
    '<p>עד עכשיו לא היה צורך בנציג באיחוד האירופי, כי העיבוד של נתוני אנשים שם היה מזדמן ',
    'והפטור שבסעיף 27(2)(א) חל. חשבון מהמדינה הזאת מסיים את העובדה הזאת: מהרגע הזה העיבוד ',
    'סדיר, והפטור כבר לא זמין.</p>',
    '<p><strong>מה צריך לעשות:</strong> למנות נציג באיחוד, ואם המדינה היא בריטניה גם נציג ',
    'בבריטניה, ואחר כך לעדכן את עשרת מסמכי הפרטיות כך שיופיעו בהם שמו וכתובתו, כפי שסעיף ',
    '13(1)(א) מחייב. ההרשמה לא נחסמה ולא נפגעה.</p>',
    '</div>',
  ].filter(Boolean).join('\n')
}

export type GdprSignupAlertResult = { sent: boolean; reason?: string }

/**
 * Called once per sign-in that is a sign-up. `country` is the request's own
 * country, which is the best signal we hold of where the CUSTOMER is: a
 * project's country is the market a campaign targets, not where its owner
 * lives, so it is the wrong question for Art. 3(2).
 */
export async function notifyGdprTerritorySignup(
  args: { country: string | null | undefined; email?: string | null; accountCreatedAt?: string | null; now?: Date },
  deps: AlertDeps = {},
): Promise<GdprSignupAlertResult> {
  try {
    if (operatorAlertsDisabled(deps.env ?? process.env)) return { sent: false, reason: 'disabled' }
    const country = safeCountry(args.country)
    if (!country || !inGdprTerritory(country)) return { sent: false, reason: 'outside_territory' }

    const now = args.now ?? (deps.now ? deps.now() : new Date())
    // A returning customer signing in from Paris is not news; the first
    // sign-in of a NEW account is. Same freshness test the referral attach
    // uses, for the same reason.
    if (args.accountCreatedAt !== undefined) {
      const createdAt = Date.parse(args.accountCreatedAt ?? '')
      if (!Number.isFinite(createdAt)) return { sent: false, reason: 'unknown_age' }
      if (now.getTime() - createdAt > FRESH_ACCOUNT_MS) return { sent: false, reason: 'not_new' }
    }

    const out = await deliverOperatorEmail(
      {
        subject: `חשבון חדש ממדינת GDPR (${country}) — נדרשת החלטה על נציג`,
        html: buildGdprTerritorySignupHtml({ country, email: args.email ?? null, when: now }),
      },
      deps,
    )
    return out.sent ? { sent: true } : { sent: false, reason: out.reason }
  } catch (err) {
    console.error('[gdpr-territory] signup alert failed:', err instanceof Error ? err.name : 'unknown')
    return { sent: false, reason: 'error' }
  }
}
