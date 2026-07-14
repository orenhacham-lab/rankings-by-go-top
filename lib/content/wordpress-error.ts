/**
 * Typed WordPress publish-error transparency (Part 2).
 *
 * Maps a low-level failure (a WordPressClientError with structured, secret-free
 * meta, a credential-decryption failure, or an unexpected throw) to ONE stable
 * typed error code + a safe Hebrew user message + an HTTP status — so the publish
 * route never returns a bare Next.js 500 and never flattens every remote failure
 * into a single opaque code. NOTHING here logs or relays secrets, headers, cookies,
 * tokens, raw remote HTML or full article content.
 */

import { WordPressClientError, type WordPressErrorMeta } from '@/lib/wordpress/client'

export type WpPublishErrorCode =
  | 'wordpress_connection_missing'
  | 'wordpress_credentials_invalid'
  | 'wordpress_credentials_decryption_failed'
  | 'wordpress_auth_failed'
  | 'wordpress_forbidden'
  | 'wordpress_rest_blocked'
  | 'wordpress_not_found'
  | 'wordpress_timeout'
  | 'wordpress_non_json_response'
  | 'wordpress_invalid_payload'
  | 'wordpress_category_invalid'
  | 'wordpress_author_invalid'
  | 'wordpress_media_invalid'
  | 'wordpress_server_error'
  | 'wordpress_publish_failed'
  | 'unexpected_publish_error'

/** The publish pipeline stage a failure occurred in (server log only). */
export type WpFailureStage =
  | 'article_load'
  | 'project_load'
  | 'connection_load'
  | 'credential_decryption'
  | 'connection_validation'
  | 'inline_image_reconciliation'
  | 'media_upload'
  | 'taxonomy_resolution'
  | 'post_creation'
  | 'local_status_update'
  | 'unexpected'

/** Safe Hebrew user messages (never expose upstream English/HTML). */
const HEBREW: Record<WpPublishErrorCode, string> = {
  wordpress_connection_missing: 'לא נמצא חיבור WordPress עבור הפרויקט. יש לחבר אתר WordPress לפני הפרסום.',
  wordpress_credentials_invalid: 'פרטי החיבור ל-WordPress אינם תקינים. יש לבדוק את שם המשתמש וסיסמת האפליקציה.',
  wordpress_credentials_decryption_failed: 'לא ניתן לקרוא את פרטי החיבור השמורים. יש לחבר מחדש את אתר WordPress.',
  wordpress_auth_failed: 'האימות מול אתר WordPress נכשל. יש לבדוק את שם המשתמש וסיסמת האפליקציה.',
  wordpress_forbidden: 'למשתמש WordPress אין הרשאה לפרסם מאמרים באתר.',
  wordpress_rest_blocked: 'ממשק ה-REST של WordPress חסום על ידי האתר, תוסף אבטחה או חומת אש.',
  wordpress_not_found: 'ממשק ה-REST של WordPress לא נמצא בכתובת זו. יש לוודא שזהו אתר WordPress תקין.',
  wordpress_timeout: 'החיבור לאתר WordPress הסתיים עקב חריגה מזמן ההמתנה.',
  wordpress_non_json_response: 'האתר החזיר תגובה לא תקינה במקום תשובת WordPress. ייתכן שקיימת חסימה של Cloudflare או תוסף אבטחה.',
  wordpress_invalid_payload: 'תוכן המאמר נדחה על ידי WordPress בשל נתונים לא תקינים.',
  wordpress_category_invalid: 'אחת הקטגוריות או התגיות שנבחרו אינה קיימת עוד באתר WordPress.',
  wordpress_author_invalid: 'מחבר המאמר שנבחר אינו קיים או אינו מורשה באתר WordPress.',
  wordpress_media_invalid: 'העלאת התמונה ל-WordPress נכשלה. יש לבדוק את התמונה או את הרשאות המדיה.',
  wordpress_server_error: 'אתר ה-WordPress החזיר שגיאת שרת. יש לנסות שוב מאוחר יותר.',
  wordpress_publish_failed: 'פרסום המאמר ל-WordPress נכשל. יש לנסות שוב או לבדוק את הגדרות האתר.',
  unexpected_publish_error: 'אירעה שגיאה לא צפויה בפרסום. מזהה הבדיקה: {diagnosticId}',
}

/** The safe Hebrew message for a code, with {diagnosticId} interpolated. */
export function hebrewMessageFor(code: WpPublishErrorCode, diagnosticId: string): string {
  return HEBREW[code].replace('{diagnosticId}', diagnosticId)
}

const HTTP_FOR: Record<WpPublishErrorCode, number> = {
  wordpress_connection_missing: 400,
  wordpress_credentials_invalid: 400,
  wordpress_credentials_decryption_failed: 500,
  wordpress_auth_failed: 401,
  wordpress_forbidden: 403,
  wordpress_rest_blocked: 403,
  wordpress_not_found: 404,
  wordpress_timeout: 504,
  wordpress_non_json_response: 502,
  wordpress_invalid_payload: 422,
  wordpress_category_invalid: 422,
  wordpress_author_invalid: 422,
  wordpress_media_invalid: 422,
  wordpress_server_error: 502,
  wordpress_publish_failed: 502,
  unexpected_publish_error: 500,
}

export function httpStatusFor(code: WpPublishErrorCode): number {
  return HTTP_FOR[code]
}

/** True for a WordPressClientError (works across module/dup-class boundaries). */
function isWpClientError(err: unknown): err is WordPressClientError {
  return err instanceof WordPressClientError || (!!err && typeof err === 'object' && (err as { name?: unknown }).name === 'WordPressClientError')
}

/** Map a WordPress REST error `code` to a validation-type typed code, if known. */
function codeFromWpCode(wpCode: string | undefined): WpPublishErrorCode | null {
  if (!wpCode) return null
  const c = wpCode.toLowerCase()
  if (/term|categor|\bcat\b|taxonom|\btag/.test(c)) return 'wordpress_category_invalid'
  if (/author|\buser\b/.test(c)) return 'wordpress_author_invalid'
  if (/media|attachment|image|upload/.test(c)) return 'wordpress_media_invalid'
  if (/invalid_param|missing_callback|rest_invalid|invalid_json|invalid_post/.test(c)) return 'wordpress_invalid_payload'
  return null
}

export interface ClassifyContext {
  /** The pipeline stage the failure surfaced in — biases validation codes. */
  stage?: WpFailureStage
  /** Structured meta from wpCreatePost when it flattened a WordPressClientError. */
  meta?: WordPressErrorMeta
}

/**
 * Classify any publish failure into a typed code. Priority: transport/auth signals
 * from the response (timeout → auth → forbidden/rest-blocked → not-found →
 * non-JSON), then WordPress REST validation codes, then the pipeline stage, then a
 * generic server/publish fallback. A non-WordPress throw is always the opaque-safe
 * `unexpected_publish_error`.
 */
export function classifyWordPressError(err: unknown, ctx: ClassifyContext = {}): WpPublishErrorCode {
  const meta: WordPressErrorMeta | undefined = isWpClientError(err) ? err.meta : ctx.meta
  if (!meta && !isWpClientError(err)) return 'unexpected_publish_error'
  const m = meta || {}

  if (m.timeout) return 'wordpress_timeout'
  if (m.status === 401) return 'wordpress_auth_failed'
  if (m.status === 403) return (m.responseFormat && m.responseFormat !== 'json') ? 'wordpress_rest_blocked' : 'wordpress_forbidden'
  if (m.status === 404) return 'wordpress_not_found'
  // A 2xx/other response that wasn't JSON = a security plugin / WAF / HTML page.
  if (m.responseFormat && m.responseFormat !== 'json') return 'wordpress_non_json_response'

  const byWpCode = codeFromWpCode(m.wpCode)
  if (byWpCode) return byWpCode

  if (ctx.stage === 'media_upload') return 'wordpress_media_invalid'
  if (ctx.stage === 'taxonomy_resolution') return 'wordpress_category_invalid'
  if (typeof m.status === 'number' && m.status >= 500) return 'wordpress_server_error'
  if (typeof m.status === 'number' && m.status >= 400) return 'wordpress_invalid_payload'
  return 'wordpress_publish_failed'
}

/** A safe, bounded subset of meta for the structured server log (no secrets). */
export function safeRemoteDiagnostics(meta: WordPressErrorMeta | undefined): {
  remoteHttpStatus: number | null
  remoteContentType: string | null
  remoteWordPressCode: string | null
  sanitizedRemoteMessage: string | null
  responseBodyLength: number | null
  timeout: boolean
  responseWasJson: boolean
  responseWasHtml: boolean
} {
  const m = meta || {}
  return {
    remoteHttpStatus: typeof m.status === 'number' ? m.status : null,
    remoteContentType: m.contentType ?? null,
    remoteWordPressCode: m.wpCode ?? null,
    sanitizedRemoteMessage: m.sanitizedMessage ?? null,
    responseBodyLength: typeof m.bodyLength === 'number' ? m.bodyLength : null,
    timeout: !!m.timeout,
    responseWasJson: m.responseFormat === 'json',
    responseWasHtml: m.responseFormat === 'html',
  }
}
