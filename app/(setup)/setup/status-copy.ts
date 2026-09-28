/**
 * What the setup wizard says about each connection and about a test scan, in our
 * own words.
 *
 * /api/setup/status puts the provider's reply straight into `detail` when a check
 * fails: Serper's response body (for example an egress proxy's "Host not in
 * allowlist: google.serper.dev ...") or a thrown `err.message`, and Supabase's
 * `error.message`. The screen used to print that text as is. A failed check now
 * shows one fixed sentence per service that says what to check; the provider's
 * reply stays available only in the test tab's "show raw response" panel, which
 * exists for exactly that.
 *
 * Only the route's own sentences are shown verbatim: a connected service, and a
 * service whose environment variables are missing ('לא מוגדר').
 */

export type SetupService = 'supabase' | 'serper'
export type SetupTone = 'ok' | 'warn' | 'bad'

export interface ServiceStatusLike {
  ok: boolean
  label: string
  detail: string
}

export interface ServiceCopy {
  tone: SetupTone
  label: string
  detail: string
}

/** The route's label for "the environment variables are missing" (its detail is our own sentence). */
export const NOT_CONFIGURED_LABEL = 'לא מוגדר'
/** The route's label for a Serper check that ran out of time. */
export const TIMED_OUT_LABEL = 'תם הזמן'

export const SERVICE_FAILED: Record<SetupService, string> = {
  serper: 'לא הצלחנו להגיע ל-Serper. כדאי לוודא שהמפתח תקין ושלשרת יש גישה לרשת החיצונית.',
  supabase: 'לא הצלחנו להתחבר למסד הנתונים. כדאי לבדוק את כתובת הפרויקט ואת מפתח השירות.',
}

export function serviceCopy(service: SetupService, status: ServiceStatusLike | null | undefined): ServiceCopy {
  if (!status) return { tone: 'bad', label: 'אין חיבור', detail: SERVICE_FAILED[service] }
  if (status.ok) return { tone: 'ok', label: 'מחובר', detail: status.detail }
  if (status.label === NOT_CONFIGURED_LABEL) return { tone: 'warn', label: NOT_CONFIGURED_LABEL, detail: status.detail }
  return {
    tone: 'bad',
    label: status.label === TIMED_OUT_LABEL ? TIMED_OUT_LABEL : 'אין חיבור',
    detail: SERVICE_FAILED[service],
  }
}

/** A status reply the screen can draw: both services and the env block are there. */
export function isStatusShape(data: unknown): data is {
  supabase: ServiceStatusLike
  serper: ServiceStatusLike
  envVars: { supabaseUrl: boolean; supabaseAnonKey: boolean; supabaseServiceKey: boolean; serperKey: boolean }
} {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  const svc = (v: unknown) => !!v && typeof v === 'object' && typeof (v as ServiceStatusLike).ok === 'boolean'
  return svc(d.supabase) && svc(d.serper) && !!d.envVars && typeof d.envVars === 'object'
}

/**
 * The test-scan route's own validation messages (app/api/setup/test-scan/route.ts).
 * These are ours and say what to fix, so they are shown as they are.
 */
export const TEST_SCAN_OWN_ERRORS: readonly string[] = [
  'גוף הבקשה אינו תקין',
  'יש להזין מילת מפתח',
  'יש להזין דומיין יעד לחיפוש אורגני',
  'יש להזין שם עסק לבדיקת גוגל מפות',
]

export const TEST_SCAN_FAILED = 'הבדיקה לא הצליחה. כדאי לוודא שמפתח Serper תקין ושלשרת יש גישה לרשת החיצונית.'
export const SCAN_ERROR = 'Serper לא החזיר תוצאה שאפשר לקרוא. התגובה הגולמית מופיעה למטה.'

/** A failed test-scan request: our validation sentence, or one fixed sentence for anything else. */
export function testScanErrorCopy(error: string | null | undefined): string | null {
  if (!error) return null
  return TEST_SCAN_OWN_ERRORS.includes(error.trim()) ? error.trim() : TEST_SCAN_FAILED
}

/** The logs tab's load error: the route's "Supabase is not configured", or one fixed sentence. */
export function logsErrorCopy(error: string | null | undefined): string | null {
  if (!error) return null
  // The route's own "not configured" reply (and the wording the screen always matched on).
  if (error.includes('Supabase') || error.includes('מוגדר')) return 'Supabase עדיין לא מחובר. אחרי ההגדרה יופיעו כאן השגיאות מהסריקות.'
  return 'לא הצלחנו לטעון את הלוג. כדאי לנסות שוב בעוד רגע.'
}
