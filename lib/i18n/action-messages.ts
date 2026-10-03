/**
 * What the dashboard's server actions say to the merchant, in the merchant's
 * language.
 *
 * THE DEFECT. The project, client and keyword actions threw Hebrew literals
 * ("לא נמצא פרויקט", "Radius Scan דורש ZIP code…"), so an English account read
 * Hebrew in its forms; some also appended a database or geocoder message to it.
 * And none of it reached anyone in production: React replaces the message of
 * an error thrown across the server-action boundary with its own English
 * sentence ("An error occurred in the Server Components render…"), which the
 * forms then printed as it was — English, and meaningless, for everyone.
 *
 * THE FIX, in two halves:
 *   - every message lives here, per locale, and the actions throw it as a
 *     UserFacingError chosen by the request's locale (getServerLocale: the
 *     proxy's header or cookie first, then the account's signup language);
 *   - the forms call the `save…` actions, which run the same work and RETURN
 *     `{ ok: false, error }` instead of throwing. A UserFacingError's message
 *     is returned as written; anything else (a database answer, a crash) is
 *     logged by name only and returned as the localized "saving failed".
 * The throwing actions keep throwing, for the server code that calls them
 * in-process (the seeding scan adds keywords through the bulk action).
 */
import type { Locale } from './locales'
import { getServerLocale } from './server-locale'
import { isUserFacingError } from './user-facing-error'

export const ACTION_MESSAGES = {
  he: {
    notSignedIn: 'החיבור לחשבון פג. התחברו מחדש כדי להמשיך.',
    userLookupFailed: 'לא הצלחנו לקרוא את פרטי החשבון. נסו שוב.',
    projectNotFound: 'לא נמצא פרויקט',
    unsupportedFrequency: 'תדירות סריקה לא נתמכת. רק "ידני" או "פעם בחודש" מותרים.',
    invalidCoordinates: 'הקואורדינטות אינן תקינות. בדקו את קו הרוחב ואת קו האורך.',
    addressUnresolvable: 'לא הצלחנו לאתר את הכתובת. נסו כתובת מדויקת יותר, או הזינו קואורדינטות.',
    exactPointNeedsLocation: 'במצב "נקודה מדויקת" יש להזין כתובת או קואורדינטות (קו רוחב וקו אורך).',
    exactPointUsOnly: 'מצב "נקודה מדויקת" זמין רק לפרויקטים בארה"ב.',
    radiusUsOnly: 'סריקת רדיוס זמינה רק לפרויקטים בארה"ב.',
    radiusZipRequired: 'לסריקת רדיוס יש להזין מיקוד (ZIP code) למרכז הסריקה.',
    radiusDistanceInvalid: 'לסריקת רדיוס יש להזין מרחק תקין (במיילים).',
    radiusUnavailable: 'סריקת רדיוס אינה זמינה כרגע.',
    exactPointUnavailable: 'מצב "נקודה מדויקת" אינו זמין כרגע.',
    keywordsLimitReached: (limit: number, plan: string) => `הגעת למגבלת ${limit} מילות מפתח לפרויקט בתוכנית ${plan}.`,
    keywordsOnlyRoomFor: (available: number, limit: number, plan: string) => `ניתן להוסיף עוד ${available} מילות מפתח בלבד (מגבלת ${limit} בתוכנית ${plan}).`,
    noKeywords: 'לא הוזנו מילות מפתח.',
    allKeywordsExist: 'כל מילות המפתח שהוזנו כבר קיימות בפרויקט.',
    clientNameRequired: 'שם הלקוח הוא שדה חובה.',
    clientCreateFailed: 'לא הצלחנו להוסיף את הלקוח. נסו שוב.',
    clientUpdateFailed: 'לא הצלחנו לעדכן את הלקוח. נסו שוב.',
    clientStatusFailed: 'לא הצלחנו לעדכן את סטטוס הלקוח. נסו שוב.',
    projectsCheckFailed: 'לא הצלחנו לבדוק את הפרויקטים הקיימים. נסו שוב.',
    projectNameRequired: 'שם הפרויקט הוא שדה חובה.',
    targetDomainRequired: 'כתובת האתר היא שדה חובה.',
    clientRequired: 'יש לבחור לקוח.',
    projectCreateFailed: 'לא הצלחנו להוסיף את הפרויקט. נסו שוב.',
    clientsCheckFailed: 'לא הצלחנו לבדוק את הלקוחות הקיימים. נסו שוב.',
    clientsLimit: (limit: number, plan: string) => `הגעת למכסה של ${limit} לקוחות בתוכנית ${plan}. שדרג את התוכנית כדי להוסיף עוד לקוחות.`,
    requestFailed: 'לא הצלחנו לעבד את הבקשה. נסו שוב.',
    saveFailed: 'השמירה נכשלה. נסו שוב.',
  },
  en: {
    notSignedIn: 'Your session has ended. Please sign in again to continue.',
    userLookupFailed: 'We could not read your account details. Please try again.',
    projectNotFound: 'Project not found',
    unsupportedFrequency: 'Unsupported scan frequency. Only "Manual" or "Monthly" are allowed.',
    invalidCoordinates: 'The coordinates are not valid. Check the latitude and the longitude.',
    addressUnresolvable: 'We could not locate that address. Try a more precise address, or enter coordinates.',
    exactPointNeedsLocation: '"Exact point" mode needs an address or coordinates (latitude and longitude).',
    exactPointUsOnly: '"Exact point" mode is available for US projects only.',
    radiusUsOnly: 'Radius scan is available for US projects only.',
    radiusZipRequired: 'Radius scan needs a ZIP code for the center of the scan.',
    radiusDistanceInvalid: 'Radius scan needs a valid distance (in miles).',
    radiusUnavailable: 'Radius scan is not available right now.',
    exactPointUnavailable: '"Exact point" mode is not available right now.',
    keywordsLimitReached: (limit: number, plan: string) => `You have reached the limit of ${limit} keywords per project on the ${plan} plan.`,
    keywordsOnlyRoomFor: (available: number, limit: number, plan: string) => `You can add only ${available} more keywords (a limit of ${limit} on the ${plan} plan).`,
    noKeywords: 'No keywords were entered.',
    allKeywordsExist: 'Every keyword you entered is already in this project.',
    clientNameRequired: 'Client name is required.',
    clientCreateFailed: 'We could not add the client. Please try again.',
    clientUpdateFailed: 'We could not update the client. Please try again.',
    clientStatusFailed: 'We could not update the client status. Please try again.',
    projectsCheckFailed: 'We could not check your existing projects. Please try again.',
    projectNameRequired: 'Project name is required.',
    targetDomainRequired: 'Website address is required.',
    clientRequired: 'Please choose a client.',
    projectCreateFailed: 'We could not add the project. Please try again.',
    clientsCheckFailed: 'We could not check your existing clients. Please try again.',
    clientsLimit: (limit: number, plan: string) => `You have reached the limit of ${limit} clients on the ${plan} plan. Upgrade your plan to add more clients.`,
    requestFailed: 'We could not process the request. Please try again.',
    saveFailed: 'Saving failed. Please try again.',
  },
} as const

/** The English messages have exactly the Hebrew ones' keys and shapes; a missing key is a compile error. */
export type ActionMessages = { [K in keyof (typeof ACTION_MESSAGES)['he']]: (typeof ACTION_MESSAGES)['he'][K] extends (...a: infer A) => string ? (...a: A) => string : string }
const _enHasEveryKey: ActionMessages = ACTION_MESSAGES.en
void _enHasEveryKey

/** The request's locale, for the action to answer in. `seed` is the account's signup language. */
export async function actionLocale(seed?: unknown): Promise<Locale> {
  try {
    return await getServerLocale(typeof seed === 'string' ? seed : null)
  } catch {
    return 'he'
  }
}

export async function actionMessages(seed?: unknown): Promise<{ locale: Locale; m: ActionMessages }> {
  const locale = await actionLocale(seed)
  return { locale, m: ACTION_MESSAGES[locale] as ActionMessages }
}

export type ActionResult<T> = ({ ok: true } & T) | { ok: false; error: string }

/**
 * Run a throwing action and return its outcome as a value, so the message
 * survives the server-action boundary. Only a UserFacingError's own message is
 * passed on; everything else becomes the localized "saving failed".
 */
export async function asActionResult<T extends object>(work: () => Promise<T | void>, tag: string): Promise<ActionResult<T>> {
  try {
    const value = await work()
    return { ok: true, ...((value ?? {}) as T) }
  } catch (err) {
    if (isUserFacingError(err)) return { ok: false, error: err.message }
    console.error(`[${tag}] save failed`, { error: err instanceof Error ? err.name : 'unknown' })
    const { m } = await actionMessages()
    return { ok: false, error: m.saveFailed }
  }
}

type MessageKey = { [K in keyof ActionMessages]: ActionMessages[K] extends string ? K : never }[keyof ActionMessages]

/**
 * A JSON error for an API route, in both languages: `error` (Hebrew, the field
 * every caller already reads) and `errorEn`, the same shape lib/quota's
 * payloads have, so a form shows the one its screen is in.
 */
export function bilingualError(key: MessageKey): { error: string; errorEn: string } {
  return { error: ACTION_MESSAGES.he[key], errorEn: ACTION_MESSAGES.en[key] }
}
